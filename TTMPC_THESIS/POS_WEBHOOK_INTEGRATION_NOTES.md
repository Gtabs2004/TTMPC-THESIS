
Reading guide (use section numbers)
1. Meeting guide - what we will discuss in the first meeting.
2. Goal - what data we want from the POS.
3. Why webhooks - why we chose webhooks instead of REST API.
4. How webhook works - what happens when the POS sends data.
4a. Automatic insertion - confirms that data goes into the database automatically if valid.
4b. REST API fallback - if webhook not available, we can poll their API instead.
5. Webhook URL - the exact link the POS will call.
6. Security - how we protect the data and check the sender.
7. Required fields - the minimum data the POS must send.
8. Field meanings - a simple explanation of each required field.
9. Status values - the payment labels we will use in the database.
10. Field mapping - how payload fields go into the database table.
11. Nice-to-have fields - optional extra data that can help later.
12. Our responses - the status codes we send back to the POS.
13. Sample payload - an example webhook JSON message.
14. Past data - how we get older purchase records.
15. Database - the table used to store grocery transactions.
16. Setup checklist - the things we must finish before testing.
17. Readiness - confirms the webhook is ready to receive data.
18. Questions (simple) - the basic questions for the POS developer.
19. Questions (detailed) - extra questions if time allows.
20. Member matching - how we match POS members to our members.
21. Example - a sample name match between POS and our system.

1) Meeting guide (detailed)
Reason: keeps the first meeting focused and productive.
1. Introduce the goal: overall grocery totals for MIGS standing (no line items).
2. Explain why we prefer webhooks (real-time, simpler than polling).
3. Confirm they can send webhooks and accept our URL.
4. Review required payload fields and status values.
5. Confirm how they generate event_id and how duplicates are handled.
6. Confirm signature method (x-pos-signature) and secret sharing.
7. Confirm retry policy and expected delivery delay.
8. Confirm historical backfill (API or export) and format.
9. Agree on testing plan (send a sample event, expect 200 OK).
10. Confirm timeline for pilot and production go-live.

2) Goal
Reason: states the exact outcome we want from the integration.
- We need overall grocery totals per member for MIGS standing.
- We only need totals, not per-item lines.

3) Why we use webhooks (not REST API)
Reason: explains the choice so the POS team understands the approach.
- Webhook: POS sends data to us right away.
- REST API: we must keep asking the POS for updates.
- Webhook is simpler and faster for our Grocery UI.
- REST API can be used later for backfill if needed.

4) How the webhook works (simple)
Reason: shows the end-to-end flow in plain terms.
- POS sends a POST request to our webhook URL when a sale happens.
- We verify the signature and required fields.
- We save the data in our database.
- If the same event_id arrives again, we ignore it.

4a) What happens to the data (automatic insertion)
Reason: clarifies that data is automatically saved to the database.
Step-by-step:
1. POS sends POST to webhook URL with JSON payload.
2. Edge function receives the request.
3. Edge function checks: is signature valid? are all required fields there? is this a duplicate?
4. If ALL checks pass → edge function AUTOMATICALLY inserts the row into GROCERY_TRANSACTIONS table.
5. The member_grocery_totals view AUTOMATICALLY recalculates.
6. Edge function sends back 200 OK to confirm success.
If ANY check fails:
- Bad signature → send 401 error, no insert.
- Missing fields → send 422 error, no insert.
- Duplicate event_id → send 409 error, no insert.
Summary: yes, if validation passes, insertion is 100% automatic (no manual steps).

4b) Fallback: REST API integration (if webhook not available)
Reason: if POS cannot build webhook support, we have a backup method.
How it works:
- POS provides a REST API endpoint (e.g., GET /api/sales?from_date=X&to_date=Y).
- We run a scheduled job (every 5-15 minutes) to fetch new sales from their API.
- Job compares against event_ids already in our database.
- We insert only new sales (prevents duplicates).
- View member_grocery_totals updates automatically.
Pros: No code changes needed on POS side.
Cons: Slower than webhooks (5-15 minute delay), requires API development, more error-prone.
Decision: Try webhook first; REST API is fallback only.

5) Webhook URL
Reason: gives the exact endpoint the POS must call.
- Example format: https://<project-ref>.supabase.co/functions/v1/pos-webhook
- Actual URL to share: https://gcnolzfwmdalltfilmea.supabase.co/functions/v1/Pos-webhook
- Use the exact case shown in the deployed function name (Pos-webhook).

6) Security
Reason: protects data and prevents fake requests.
- HTTPS only.
- Each request includes x-pos-signature.
- We share a secret key with the POS team.

Security notes (simple)
- HTTPS means the connection is encrypted so data is private in transit.
- x-pos-signature is a hash made from the request body and shared secret.
- We compute the same hash; if it matches, we accept the request.

7) Required fields (overall totals only)
Reason: sets the minimum data needed for MIGS totals.
- event_id
- event_type: sale | return | void
- event_time
- grocery_id (receipt/transaction ID)
- member_id (or null if no member)
- amount_total
- payment_status: Completed | On Credit
- balance_due

8) Required fields (plain meaning)
Reason: avoids confusion about each field.
- event_id: unique ID so we do not double count.
- event_type: what happened (sale, return, void).
- event_time: when it happened in the POS.
- grocery_id: POS receipt/transaction number.
- member_id: member number linked to purchase (or null).
- amount_total: total purchase amount.
- payment_status: completed in cash or on credit.
- balance_due: remaining amount if on credit.

9) Status values we use
Reason: standardizes payment states in our database.
- Completed (cash)
- On Credit (utang)

10) Required field mapping (payload -> database)
Reason: ensures incoming data fits the schema.
- grocery_id -> GROCERY_TRANSACTIONS.GroceryID
- member_id -> GROCERY_TRANSACTIONS.membership_number_id
- event_time -> GROCERY_TRANSACTIONS.TransactionDate
- amount_total -> GROCERY_TRANSACTIONS.GroceryAmount
- payment_status -> GROCERY_TRANSACTIONS.Status

Why payload fields and DB columns are different
Reason: payload is for sending data; DB columns follow our schema rules.
- Payload names are chosen for the webhook JSON.
- DB columns are fixed by the database developer's schema.
- We map payload fields into DB columns during insert.

How payload is recorded in the DB
Reason: shows exactly where each value goes.
- Example: event_id from payload is used to check duplicates before insert.
- Example: amount_total from payload is saved into GroceryAmount column.
- The insert uses the mapping listed in section 10.

11) Nice-to-have fields
Reason: optional data that improves reporting but is not required.
- terminal_id, cashier_id
- currency
- tax_total, discount_total
- payment_method

12) Our responses
Reason: tells the POS how to interpret success or failure.
- 200 = OK
- 401 = bad signature
- 400 = invalid JSON
- 422 = missing fields
- 409 = duplicate event_id

13) Sample payload
Reason: provides a concrete example for testing.
{
  "event_id": "evt_2026_04_30_0002",
  "event_type": "sale",
  "event_time": "2026-04-30T10:46:10Z",
  "grocery_id": "GR-TTMPC-00002",
  "member_id": "TTMPCM-002",
  "amount_total": 3500.00,
  "payment_status": "Completed",
  "balance_due": 0.00
}

14) Past data (history)
Reason: allows MIGS totals to include older purchases.
- Ask POS for a backfill API or export by date range.
- Or ask them to replay old events through the webhook.
- We do not access their database directly.

15) Database (needed for MIGS totals)
Reason: we must store events to compute member totals.
- We must store all grocery transactions so we can compute member totals.
- Table created by DB developer: GROCERY_TRANSACTIONS

GROCERY_TRANSACTIONS (table)
- GroceryID: uuid (PK)
- membership_number_id: uuid (FK)
- TransactionDate: timestamp
- GroceryAmount: decimal
- Status: categorical

Sample view (member grocery totals)
create or replace view member_grocery_totals as
select
  membership_number_id,
  sum(GroceryAmount) as total_grocery_amount,
  count(*) as transaction_count
from GROCERY_TRANSACTIONS
where Status in ('Completed', 'On Credit')
group by membership_number_id;

16) Setup checklist
Reason: confirms everything is ready before go-live.
- Secrets saved with correct names (POS_WEBHOOK_SECRET, POS_SUPABASE_URL, POS_SERVICE_ROLE_KEY).
- Edge function deployed in Supabase (Pos-webhook, exact case).
- POS has the correct webhook URL and secret.
- Test POST returns 200 OK.

17) Readiness
Reason: declares that our endpoint can receive events now.
- Our webhook endpoint is ready to receive POS events.

18) Questions for the POS developer (simple)
Reason: covers the minimum info we must confirm.
Webhook capability:
- Can your POS send webhooks for sales/returns/voids?
- Can you send overall totals only (no line items)?
Data integrity:
- Do you include a unique event_id every time?
- Can you replay data for a date range?
Status and values:
- Which payment status label will you send: Completed or Paid?
- Do you have contact info (phone/email) for each member or only names?
Security:
- What signature/auth method do you support?
- What is your retry behavior if we return non-2xx?
Testing:
- Do you have a sandbox and sample payloads?

19) Questions for the POS developer (more detail)
Reason: extra items if time allows to reduce future issues.
Field and data specifics:
- What exact fields will you send for GroceryID, member_id, and event_id?
- Are event_ids unique for this POS?
- Do you send the same event more than once? If yes, how do we detect duplicates?
Event types and representations:
- How do you represent returns or voids (negative amount or separate event_type)?
- Can you provide a sample for each Status value (Completed, On Credit)?
Delivery and retry:
- What is the maximum webhook delivery delay we should expect?
- What is your retry schedule and how many retries?
- Are there any maintenance windows or downtime periods?
Signature and payload:
- Do you sign the raw JSON body or a normalized version?
- Do you include timezone in event_time?
Status mapping:
- If you use a different payment label than Completed, what exact value should we map it to in our system?
Historical data:
- How will you provide backfill data for past purchases (API export or CSV)?
- Can you send it via the webhook in replay mode or a separate export?
REST API fallback (if webhook is not possible):
- Do you have a REST API endpoint for sales/transactions?
- What endpoint should we call to fetch sales? (e.g., GET /api/sales)
- What parameters do you accept? (date range, limit, filters)
- What fields does your API return?
- Can we filter by date range or do you return all sales?
- How often should we poll? (what is your transaction volume?)
- What response format do you use (JSON, CSV, XML)?

20) Member matching note (important for POS developer)
Reason: explains how we link POS members to our members.
- If POS has no contact number or email, we will match by full name.
- We will normalize names (trim spaces, uppercase, remove punctuation).
- We will match exact Last + First + Middle name.
- If multiple matches, we will not auto-link and will mark for manual review.
- After the first match, we will store a mapping for future events.

21) Example
Reason: demonstrates the matching rule with real-like data.
- POS member: TTMPC_M_001 : Tabiolo Gero Antoni
- Our member: TTMPC-001 : Tabiolo Gero Antoni
- Names match, so we link and save the mapping.
