import { createHmac, timingSafeEqual } from "node:crypto";
import { Resend } from "resend";

export const config = {
  api: { bodyParser: false },
};

const MAX_BODY_BYTES = 1_000_000;
const ACTIVE_STATUSES = new Set(["active", "on_trial"]);
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

function respond(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

async function readRawBody(req) {
  const chunks = [];
  let size = 0;

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) {
      const error = new Error("Webhook body is too large.");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(buffer);
  }

  return Buffer.concat(chunks);
}

function asString(value) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function makeLicenseKey(secret, email, recordId) {
  const digest = createHmac("sha256", secret)
    .update(`noorfinance-license:${email}:${recordId}`)
    .digest("hex")
    .slice(0, 32)
    .toUpperCase();
  return `NOOR-${digest.match(/.{8}/g).join("-")}`;
}

async function saveLicense(supabaseUrl, serviceKey, license) {
  const url = new URL("/rest/v1/noorfinance_licenses", supabaseUrl);
  url.searchParams.set("on_conflict", "webhook_event_id");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(license),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    const detail = await response.text();
    console.error("Supabase license upsert failed:", response.status, detail);
    throw new Error(`Supabase license upsert failed with HTTP ${response.status}.`);
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return respond(res, 405, { ok: false, error: "Method not allowed." });
  }

  const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret || !supabaseUrl || !serviceKey) {
    console.error("Webhook or Supabase server configuration is missing.");
    return respond(res, 500, { ok: false, error: "Server configuration is missing." });
  }

  let rawBody;
  try {
    rawBody = await readRawBody(req);
  } catch (error) {
    console.error("Unable to read Lemon Squeezy webhook body:", error);
    return respond(res, error.statusCode ?? 400, { ok: false, error: "Invalid webhook body." });
  }

  const signature = req.headers["x-signature"];
  if (typeof signature !== "string" || !/^[a-f0-9]{64}$/i.test(signature)) {
    return respond(res, 401, { ok: false, error: "Invalid webhook signature." });
  }
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  const supplied = Buffer.from(signature, "hex");
  if (supplied.length !== expected.length || !timingSafeEqual(expected, supplied)) {
    return respond(res, 401, { ok: false, error: "Invalid webhook signature." });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString("utf8"));
  } catch (error) {
    console.error("Invalid Lemon Squeezy webhook JSON:", error);
    return respond(res, 400, { ok: false, error: "Invalid webhook JSON." });
  }
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    return respond(res, 400, { ok: false, error: "Invalid webhook payload." });
  }

  const eventName = asString(event.meta?.event_name);
  if (!SUPPORTED_EVENTS.has(eventName)) {
    return respond(res, 200, { ok: true, ignored: true });
  }

  const attributes =
    event.data?.attributes && typeof event.data.attributes === "object"
      ? event.data.attributes
      : {};
  const email = (
    asString(attributes.user_email) ??
    asString(attributes.customer_email) ??
    asString(attributes.email)
  )?.toLowerCase();
  const recordId = asString(event.data?.id);
  const subscriptionId = asString(attributes.subscription_id);
  const licenseResourceId =
    eventName.startsWith("subscription_")
      ? recordId
      : subscriptionId ?? recordId;
  const status = asString(attributes.status)?.toLowerCase() ?? "";
  const productId = asString(attributes.product_id);
  const orderId = asString(attributes.order_id) ?? recordId;

  if (!email || !recordId) {
    return respond(res, 400, {
      ok: false,
      error: "Webhook payload is missing the purchaser email or resource ID.",
    });
  }

  if (eventName === "order_created" && status !== "paid") {
    return respond(res, 200, { ok: true, ignored: true });
  }
  if (
    eventName === "subscription_created" &&
    !ACTIVE_STATUSES.has(status)
  ) {
    return respond(res, 200, { ok: true, ignored: true });
  }

  const isActive =
    eventName === "order_created" ||
    (eventName.startsWith("subscription_") &&
      !INACTIVE_EVENTS.has(eventName) &&
      (ACTIVE_STATUSES.has(status) ||
        ["subscription_resumed", "subscription_unpaused"].includes(eventName)));
  const licenseKey = makeLicenseKey(secret, email, licenseResourceId);

  try {
    await saveLicense(supabaseUrl, serviceKey, {
      license_key_id: licenseKey,
      webhook_event_id: licenseResourceId,
      user_email: email,
      status: isActive ? "active" : "inactive",
      product_id: productId,
      order_id: orderId ?? subscriptionId,
      updated_at: new Date().toISOString(),
    });

    if (isActive && ["order_created", "subscription_created"].includes(eventName)) {
      const resendApiKey = process.env.RESEND_API_KEY;
      if (!resendApiKey) throw new Error("RESEND_API_KEY is not configured.");

      const { error } = await new Resend(resendApiKey).emails.send(
        {
          from: "NoorFinance <onboarding@resend.dev>",
          to: email,
          subject: "Your NoorFinance License Key",
          html: `<h1>Thank you for purchasing NoorFinance!</h1><p>Your license key: <strong style="font-size:20px;background:#000;color:#fff;padding:10px">${licenseKey}</strong></p><p>Activate at: https://noorfinance.vercel.app/activate</p>`,
        },
        { idempotencyKey: `noorfinance-license-${licenseResourceId}` },
      );
      if (error) throw new Error(`License email could not be sent: ${error.message}`);
    }

    return respond(res, 200, { ok: true });
  } catch (error) {
    console.error("Webhook processing failed:", error);
    return respond(res, 500, { ok: false, error: "Webhook processing failed." });
  }
}
