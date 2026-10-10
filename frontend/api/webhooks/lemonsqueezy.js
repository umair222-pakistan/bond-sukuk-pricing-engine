import crypto from "node:crypto";

export const config = {
  api: { bodyParser: false },
};

const MAX_BODY_BYTES = 1_000_000;
const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "on_trial"]);
const SUPPORTED_EVENTS = new Set([
  "order_created",
  "order_refunded",
  "subscription_created",
  "subscription_updated",
  "subscription_cancelled",
  "subscription_expired",
  "subscription_paused",
  "subscription_resumed",
  "subscription_unpaused",
]);
const INACTIVE_EVENTS = new Set([
  "order_refunded",
  "subscription_cancelled",
  "subscription_expired",
  "subscription_paused",
]);

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

async function getRawBody(req) {
  const chunks = [];
  let size = 0;

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) {
      const error = new Error("Webhook payload exceeds the maximum size.");
      error.code = "PAYLOAD_TOO_LARGE";
      throw error;
    }
    chunks.push(buffer);
  }

  return Buffer.concat(chunks);
}

function nonEmptyString(value) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function planForVariant(variantId) {
  if (!variantId) return null;
  for (const [plan, variable] of [
    ["basic", "LEMONSQUEEZY_BASIC_VARIANT_ID"],
    ["pro", "LEMONSQUEEZY_PRO_VARIANT_ID"],
    ["enterprise", "LEMONSQUEEZY_ENTERPRISE_VARIANT_ID"],
  ]) {
    const configuredId = nonEmptyString(process.env[variable]);
    if (configuredId && configuredId === variantId) return plan;
  }
  return null;
}

function licenseKeyForOrder(secret, orderId, plan) {
  const digest = crypto
    .createHmac("sha256", secret)
    .update(`license:${orderId}:${plan}`)
    .digest("hex")
    .slice(0, 24)
    .toUpperCase();
  return `NF-${plan.toUpperCase()}-${digest}`;
}

function supabaseHeaders(serviceKey, extra = {}) {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function supabaseRequest(url, serviceKey, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: supabaseHeaders(serviceKey, options.headers),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    const body = await response.text();
    const error = new Error(`Supabase request failed with HTTP ${response.status}.`);
    error.status = response.status;
    try {
      error.code = JSON.parse(body).code;
    } catch {
      error.code = undefined;
    }
    throw error;
  }

  return response;
}

async function updateProfile(baseUrl, serviceKey, email, profile) {
  const lookupUrl = new URL("/rest/v1/profiles", baseUrl);
  lookupUrl.searchParams.set("select", "id");
  const emailPattern = email.replace(/[\\%_]/g, "\\$&");
  lookupUrl.searchParams.set("email", `ilike.${emailPattern}`);
  lookupUrl.searchParams.set("limit", "2");

  const lookupResponse = await supabaseRequest(lookupUrl, serviceKey);
  const profiles = await lookupResponse.json();
  if (!Array.isArray(profiles) || profiles.length !== 1 || !profiles[0]?.id) {
    throw new Error(
      profiles?.length > 1
        ? "More than one profile matches the webhook email."
        : "No profile matches the webhook email.",
    );
  }

  const updateUrl = new URL("/rest/v1/profiles", baseUrl);
  updateUrl.searchParams.set("id", `eq.${profiles[0].id}`);
  await supabaseRequest(updateUrl, serviceKey, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(profile),
  });
}

async function upsertLicense(baseUrl, serviceKey, license) {
  const licenseUrl = new URL("/rest/v1/licenses", baseUrl);
  licenseUrl.searchParams.set("on_conflict", "lemon_order_id");
  await supabaseRequest(licenseUrl, serviceKey, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(license),
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { ok: false, error: "Method not allowed." });
  }

  const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
  if (!secret) {
    console.error("Lemon Squeezy webhook secret is not configured.");
    return sendJson(res, 500, { ok: false, error: "Webhook is not configured." });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error("Supabase server credentials are not configured.");
    return sendJson(res, 500, { ok: false, error: "Server configuration is missing." });
  }

  let rawBody;
  try {
    rawBody = await getRawBody(req);
  } catch (error) {
    console.error("Unable to read Lemon Squeezy webhook body:", error);
    const statusCode = error.code === "PAYLOAD_TOO_LARGE" ? 413 : 400;
    return sendJson(res, statusCode, { ok: false, error: "Unable to read webhook body." });
  }

  const signature = req.headers["x-signature"];
  if (typeof signature !== "string" || !/^[a-f0-9]{64}$/i.test(signature)) {
    return sendJson(res, 401, { ok: false, error: "Invalid webhook signature." });
  }

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest();
  const suppliedSignature = Buffer.from(signature, "hex");
  if (
    suppliedSignature.length !== expectedSignature.length ||
    !crypto.timingSafeEqual(expectedSignature, suppliedSignature)
  ) {
    return sendJson(res, 401, { ok: false, error: "Invalid webhook signature." });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch (error) {
    console.error("Invalid Lemon Squeezy webhook JSON:", error);
    return sendJson(res, 400, { ok: false, error: "Invalid webhook JSON." });
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return sendJson(res, 400, { ok: false, error: "Invalid webhook payload." });
  }

  const attributes =
    payload.data?.attributes && typeof payload.data.attributes === "object"
      ? payload.data.attributes
      : {};
  const customData =
    payload.meta?.custom_data && typeof payload.meta.custom_data === "object"
      ? payload.meta.custom_data
      : {};
  const eventName = nonEmptyString(payload.meta?.event_name);

  if (!SUPPORTED_EVENTS.has(eventName)) {
    return sendJson(res, 200, { ok: true, ignored: true });
  }

  const email = [
    attributes.user_email,
    attributes.customer_email,
    customData.email,
  ]
    .map(nonEmptyString)
    .find(Boolean)
    ?.toLowerCase();
  const recordId = nonEmptyString(payload.data?.id);
  const customerId = nonEmptyString(attributes.customer_id);
  const variantId =
    nonEmptyString(attributes.variant_id) ??
    nonEmptyString(attributes.first_order_item?.variant_id);
  const plan = planForVariant(variantId);
  const status = nonEmptyString(attributes.status)?.toLowerCase() ?? "";
  if (
    attributes.test_mode === true &&
    process.env.LEMONSQUEEZY_ALLOW_TEST_MODE !== "true"
  ) {
    console.log("License flow: ignoring Lemon Squeezy test-mode event.");
    return sendJson(res, 200, { ok: true, ignored: true });
  }

  if (!email || !recordId) {
    return sendJson(res, 400, {
      ok: false,
      error: "Webhook payload is missing the email or event ID.",
    });
  }
  if (!plan) {
    console.error("License flow: no plan is configured for Lemon Squeezy variant:", variantId);
    return sendJson(res, 500, { ok: false, error: "Unknown or unmapped checkout variant." });
  }

  if (eventName === "order_created" && status !== "paid") {
    return sendJson(res, 200, { ok: true, ignored: true });
  }
  if (
    eventName.startsWith("subscription_") &&
    !INACTIVE_EVENTS.has(eventName) &&
    !status
  ) {
    return sendJson(res, 400, {
      ok: false,
      error: "Subscription webhook is missing its status.",
    });
  }

  const isActive =
    eventName === "order_created"
      ? true
      : !INACTIVE_EVENTS.has(eventName) &&
        ACTIVE_SUBSCRIPTION_STATUSES.has(status);
  const now = new Date().toISOString();
  const licenseRecordId =
    nonEmptyString(attributes.subscription_id) ??
    (eventName.startsWith("subscription_") ? recordId : nonEmptyString(attributes.order_id)) ??
    recordId;
  const licenseKey = licenseKeyForOrder(
    secret,
    licenseRecordId,
    plan,
  );

  try {
    const profile = {
      plan: isActive ? plan : "free",
      tier: isActive ? plan : "free",
      is_pro: isActive && (plan === "pro" || plan === "enterprise"),
      subscription_status: status || (isActive ? "active" : "inactive"),
      ...(isActive ? { license_key: licenseKey } : {}),
      updated_at: now,
    };
    if (customerId) profile.lemon_customer_id = customerId;

    await upsertLicense(supabaseUrl, serviceKey, {
      email,
      plan,
      tier: plan,
      status: isActive ? "active" : "inactive",
      lemon_order_id: licenseRecordId,
      license_key: licenseKey,
      subscription_id: eventName.startsWith("subscription_") ? recordId : null,
      ...(customerId ? { lemon_customer_id: customerId } : {}),
      ...(variantId ? { variant_id: variantId } : {}),
    });
    await updateProfile(supabaseUrl, serviceKey, email, profile);

    if (isActive && (eventName === "order_created" || eventName === "subscription_created")) {
      if (!process.env.RESEND_API_KEY) {
        throw new Error("RESEND_API_KEY is not configured; license email cannot be delivered.");
      }
      if (!process.env.RESEND_FROM_EMAIL) {
        throw new Error("RESEND_FROM_EMAIL must be a verified production sender.");
      }
      const { Resend } = await import("resend");
      const resend = new Resend(process.env.RESEND_API_KEY);
      const { error: emailError } = await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL,
        to: email,
        subject: `Your NoorFinance ${plan} license`,
        html: `<p>Your NoorFinance ${plan} plan is ready.</p><p>License key: <code>${licenseKey}</code></p><p>Activate it at <a href="https://noorfinance.vercel.app/activate">NoorFinance</a>.</p>`,
      });
      if (emailError) throw new Error(`License email failed: ${emailError.message}`);
    }

    console.log("License flow: Lemon Squeezy webhook applied:", eventName, "plan:", plan);
    return sendJson(res, 200, { ok: true });
  } catch (error) {
    console.error("Lemon Squeezy webhook processing failed:", error);
    return sendJson(res, 500, { ok: false, error: "Webhook processing failed." });
  }
}
