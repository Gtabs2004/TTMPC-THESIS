// Supabase Edge Function: POS webhook receiver (Deno)
// Required secrets:
// - POS_SUPABASE_URL
// - POS_SUPABASE_SERVICE_ROLE_KEY
// - POS_WEBHOOK_SECRET
//
// Writes to:
// - grocery_events   (raw audit log, every valid event)
// - GROCERY_TRANSACTIONS  (normalized ledger, only event_type='sale')

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

  return toHex(new Uint8Array(mac)) === signature;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const bodyText = await req.text();
  const signature = req.headers.get("x-pos-signature");
  if (!(await verifySignature(bodyText, signature))) {
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
  const groceryId = payload.grocery_id as string | undefined;
  const memberRef = (payload.member_id as string | null | undefined) ?? null;
  const amountTotal = payload.amount_total as number | undefined;
  const paymentStatus = payload.payment_status as string | undefined;
  const balanceDue = payload.balance_due as number | undefined;

  if (
    !eventId || !eventType || !eventTime || !groceryId ||
    amountTotal === undefined || !paymentStatus || balanceDue === undefined
  ) {
    return new Response("Missing required fields", { status: 422 });
  }

  const supabaseUrl = Deno.env.get("POS_SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("POS_SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response("Server misconfigured", { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // 1) Raw audit log (also enforces idempotency via event_id UNIQUE).
  const { error: eventErr } = await supabase.from("grocery_events").insert({
    event_id: eventId,
    event_type: eventType,
    event_time: eventTime,
    payload,
  });

  if (eventErr) {
    // Duplicate event_id → treat as already-processed (idempotent success on 409 is also OK,
    // but we return 409 so the POS knows it was a replay).
    return new Response(`Duplicate or insert failed: ${eventErr.message}`, { status: 409 });
  }

  // 2) Only sales flow into the normalized ledger for now.
  if (eventType !== "sale") {
    return new Response("OK (non-sale event logged)", { status: 200 });
  }

  // Resolve POS member_id → member.id via member.membership_id lookup.
  let membershipUuid: string | null = null;
  if (memberRef) {
    const { data: memberRow } = await supabase
      .from("member")
      .select("id")
      .eq("membership_id", memberRef)
      .maybeSingle();
    membershipUuid = memberRow?.id ?? null;
  }

  const { error: txErr } = await supabase.from("GROCERY_TRANSACTIONS").insert({
    GroceryID: groceryId,
    event_id: eventId,
    membership_number_id: membershipUuid,
    pos_member_ref: memberRef,
    TransactionDate: eventTime,
    GroceryAmount: amountTotal,
    Status: paymentStatus,
    balance_due: balanceDue,
  });

  if (txErr) {
    return new Response(`Ledger insert failed: ${txErr.message}`, { status: 500 });
  }

  return new Response("OK", { status: 200 });
});
