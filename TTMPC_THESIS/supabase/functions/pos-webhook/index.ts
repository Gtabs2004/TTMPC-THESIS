// Supabase Edge Function: POS webhook receiver (Deno)
// Required env vars:
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY
// - POS_WEBHOOK_SECRET (shared secret for HMAC)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function verifySignature(bodyText: string, signature: string | null): Promise<boolean> {
  if (!signature) return false;
  const secret = Deno.env.get("POS_WEBHOOK_SECRET");
  if (!secret) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(bodyText),
  );

  const computed = toHex(new Uint8Array(mac));
  return computed === signature;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const bodyText = await req.text();
  const signature = req.headers.get("x-pos-signature");
  const isValid = await verifySignature(bodyText, signature);

  if (!isValid) {
    return new Response("Unauthorized", { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(bodyText);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const eventId = payload.event_id as string | undefined;
  const eventType = payload.event_type as string | undefined;
  const eventTime = payload.event_time as string | undefined;

  if (!eventId || !eventType || !eventTime) {
    return new Response("Missing required fields", { status: 422 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response("Server misconfigured", { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { error } = await supabase.from("pos_events").insert({
    event_id: eventId,
    event_type: eventType,
    event_time: eventTime,
    payload,
    received_at: new Date().toISOString(),
  });

  if (error) {
    // Common cause: duplicate event_id (idempotency)
    return new Response("Insert failed", { status: 409 });
  }

  return new Response("OK", { status: 200 });
});
