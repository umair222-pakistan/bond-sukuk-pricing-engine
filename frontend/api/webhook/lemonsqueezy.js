import { createClient } from "@supabase/supabase-js";
import { createHmac, timingSafeEqual } from "node:crypto";

const MAX_BODY_BYTES = 1_000_000;
const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "on_trial"]);

function respond(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function getRawBody(req) {
  const rawBody = req.rawBody ?? req.body;
  if (Buffer.isBuffer(rawBody)) {
    return Promise.resolve(rawBody);
  }
  if (typeof rawBody === "string") {
    return Promise.resolve(Buffer.from(rawBody));
  }
  if (rawBody && typeof rawBody === "object") {
    return Promise.resolve(Buffer.from(JSON.stringify(rawBody)));
  }

  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("Webhook payload exceeds the maximum size."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function asNonEmptyString(value) {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function logSupabaseError(action, error) {
  const details =
    error instanceof Error
      ? { name: error.name, message: error.message, stack: error.stack }
      : error;
  console.error(`Supabase ${action} failed:`, JSON.stringify(details, null, 2));
}

function getSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  console.log("Env check:", Boolean(supabaseUrl), Boolean(serviceRoleKey));

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase server credentials are not configured.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function updateProfile(supabase, email, customerId, isActive) {
  try {
    const profile = {
      plan: isActive ? "basic" : "free",
      lemon_customer_id: customerId,
      is_pro: isActive,
      subscription_status: isActive ? "active" : "inactive",
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("profiles")
      .update(profile)
      .eq("email", email)
      .select("id");

    if (error) {
      logSupabaseError("profile update", error);
      return false;
    }
    if (data?.length) {
      return true;
    }

    const { data: authUsers, error: authError } =
      await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (authError) {
      logSupabaseError("auth user lookup for profile creation", authError);
      return false;
    }

    const matchingUser = authUsers.users.find(
      (user) => user.email?.trim().toLowerCase() === email,
    );
    if (!matchingUser) {
      console.error(`No profile or auth user found for webhook email: ${email}`);
      return false;
    }

    const { error: upsertError } = await supabase.from("profiles").upsert(
      {
        id: matchingUser.id,
        email,
        ...profile,
      },
      { onConflict: "id" },
    );
    if (upsertError) {
      logSupabaseError("profile upsert", upsertError);
      return false;
    }
    return true;
  } catch (error) {
    logSupabaseError("profile update request", error);
    return false;
  }
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    respond(res, 200, { status: "webhook alive" });
    return;
  }
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Signature, X-Event-Name");
    res.end();
    return;
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    respond(res, 405, { ok: false, error: "Method not allowed." });
    return;
  }

  const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
  if (!secret) {
    console.error("Lemon Squeezy webhook secret is not configured.");
    respond(res, 503, { ok: false, error: "Webhook secret is not configured." });
    return;
  }

  let rawBody;
  try {
    rawBody = await getRawBody(req);
  } catch (error) {
    console.error("Unable to read Lemon Squeezy webhook body:", error);
    respond(res, 400, { ok: false, error: "Invalid webhook payload." });
    return;
  }
  if (!rawBody.length || rawBody.length > MAX_BODY_BYTES) {
    respond(res, 400, { ok: false, error: "Invalid webhook payload size." });
    return;
  }

  const signature = req.headers["x-signature"];
  const expectedSignature = createHmac("sha256", secret).update(rawBody).digest();
  let suppliedSignature;
  try {
    suppliedSignature = Buffer.from(String(signature ?? ""), "hex");
  } catch {
    suppliedSignature = Buffer.alloc(0);
  }
  if (
    suppliedSignature.length !== expectedSignature.length ||
    !timingSafeEqual(suppliedSignature, expectedSignature)
  ) {
    respond(res, 401, { ok: false, error: "Invalid webhook signature." });
    return;
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch (error) {
    console.error("Invalid Lemon Squeezy webhook JSON:", error);
    respond(res, 400, { ok: false, error: "Invalid webhook JSON." });
    return;
  }
  console.log("Payload:", JSON.stringify(payload).slice(0, 2000));

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    respond(res, 400, { ok: false, error: "Invalid webhook payload." });
    return;
  }

  const meta = payload.meta && typeof payload.meta === "object" ? payload.meta : {};
  const attributes =
    payload.data?.attributes && typeof payload.data.attributes === "object"
      ? payload.data.attributes
      : {};
  const customData =
    meta.custom_data && typeof meta.custom_data === "object" ? meta.custom_data : {};
  const eventName = String(req.headers["x-event-name"] || meta.event_name || "");
  const supportedEvents = new Set([
    "subscription_created",
    "subscription_updated",
    "order_created",
    "subscription_cancelled",
  ]);

  if (!supportedEvents.has(eventName)) {
    respond(res, 200, { ok: true, ignored: true });
    return;
  }

  const email = [
    attributes.user_email,
    attributes.customer_email,
    customData.email,
  ]
    .map(asNonEmptyString)
    .find(Boolean)
    ?.toLowerCase();
  const recordId = asNonEmptyString(payload.data?.id);
  const customerId = asNonEmptyString(attributes.customer_id);
  const variantId = asNonEmptyString(attributes.variant_id);

  if (!email || !recordId) {
    console.error("Lemon Squeezy webhook is missing email or data.id.", {
      eventName,
      hasEmail: Boolean(email),
      hasRecordId: Boolean(recordId),
    });
    respond(res, 400, { ok: false, error: "Webhook payload is missing required data." });
    return;
  }

  if (eventName === "order_created" && attributes.status !== "paid") {
    respond(res, 200, { ok: true, ignored: true });
    return;
  }
  if (
    eventName === "subscription_created" &&
    !ACTIVE_SUBSCRIPTION_STATUSES.has(String(attributes.status ?? ""))
  ) {
    respond(res, 200, { ok: true, ignored: true });
    return;
  }

  const isActive =
    eventName !== "subscription_cancelled" &&
    (eventName === "order_created" ||
      ACTIVE_SUBSCRIPTION_STATUSES.has(String(attributes.status ?? "")));

  let supabase;
  try {
    supabase = getSupabaseClient();
  } catch (error) {
    console.error("Supabase client configuration error:", error);
    respond(res, 500, { ok: false, error: "Supabase is not configured." });
    return;
  }

  try {
    const { error: licenseError } = await supabase.from("licenses").upsert(
      {
        email,
        plan: isActive ? "basic" : "free",
        status: isActive ? "active" : "inactive",
        lemon_order_id: recordId,
        lemon_customer_id: customerId,
        variant_id: variantId,
        subscription_id: eventName.startsWith("subscription_") ? recordId : null,
      },
      { onConflict: "lemon_order_id" },
    );
    if (licenseError) {
      logSupabaseError("licenses upsert", licenseError);
      respond(res, 500, { ok: false, error: "Unable to save the license." });
      return;
    }
  } catch (error) {
    logSupabaseError("licenses upsert request", error);
    respond(res, 500, { ok: false, error: "Unable to save the license." });
    return;
  }

  const profileUpdated = await updateProfile(supabase, email, customerId, isActive);
  if (!profileUpdated) {
    console.error(
      `License saved, but the profile could not be updated for email: ${email}`,
    );
  }

  console.log(
    `Lemon Squeezy webhook applied: event=${eventName}, email=${email}, record_id=${recordId}`,
  );
  respond(res, 200, { ok: true });
}
