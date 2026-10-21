# SMS Gateway Integration — Plan

Status: **Not started.** This is a planning document, written before any code exists. Update it (mark steps done, add as-built notes) as the work progresses — do not let it drift from reality.

## Goal

Add SMS notifications (membership/registration confirmations, OTP/account verification, loan-related reminders, BOD announcements) alongside TTMPC's existing email flow, using a self-hosted Android phone as the SMS gateway instead of a paid provider (no Twilio/Semaphore/etc).

## Gateway choice

Project: [LocalText](https://github.com/DiyRex/LocalText), release v0.2.0.

Verified (2026-10-21) by reading the repo README and release page directly — not assumed:
- Pre-built APKs exist for the v0.2.0 release (arm64-v8a, armeabi-v7a, x86_64, universal, debug variants). Debug-signed; upgrading across releases requires uninstalling the old APK first.
- Can also be built from source (JDK 17, Android SDK platform-34/build-tools 34.x, Node 20+/pnpm, `./gradlew installDebug`).
- Documented HTTP API (confirm against the live app/README before coding, in case the API has changed since this was written):
  - `GET /health` — liveness check
  - `GET /sims` — list SIM cards
  - `POST /send` — body `{"number": "...", "message": "...", "slot": N}` (or `subId`), auth via `X-Token` header
  - `GET /inbox?limit=N` — recent messages (requires inbox toggle)
  - Web panel has a separate Bearer-session API (`/api/auth/login`, `/api/send`, etc.) — not needed for our use case, the `X-Token` programmatic API is the one to integrate against.
- Default web panel login is `admin`/`admin` — must be changed before use.
- Port defaults to 8088, editable in-app while server is stopped.

Do not invent additional endpoints, response shapes, or error codes beyond what's listed above — re-verify against the actual running app during Step 1 below, since the README can drift from the released build.

## Why a local worker (not Railway calling the phone directly)

FastAPI is hosted on Railway; the Android phone sits on a private Wi-Fi network (home/school) with no public IP and should never be exposed to the public internet. So:

- Railway **cannot** reach the phone directly.
- A separate Python worker process must run on a machine on the **same LAN as the phone**, poll Supabase for queued SMS jobs, and call the phone's local HTTP API directly.
- The worker's connection to Supabase is normal outbound HTTPS (same as the frontend already does) — no VPN needed for that leg.
- A VPN would only become relevant if we ever wanted Railway to reach the phone directly, which we are deliberately not doing.

**Operational consequence to accept explicitly:** SMS delivery (including OTP, if OTP-by-SMS is implemented) depends on the worker machine being powered on and connected whenever a job needs sending. If that can't be guaranteed, time-sensitive flows (OTP) should stay on the existing email channel, and SMS should be reserved for flows that tolerate delay (reminders, announcements, confirmations). This decision should be made explicitly in Step 2 below, not assumed.

## Mapping to TTMPC's actual flows (not the generic template)

The original feature request used generic "training schedule" language from an unrelated template. Translated to what TTMPC actually has:

| Generic spec item | TTMPC equivalent |
|---|---|
| Registration confirmation | Member application submitted / approved (BOD approval flow) |
| Training schedule notifications | Loan status changes (approved/disbursed) — mirrors existing `loan_notifications` + email dispatch |
| OTP / account verification | Supabase Auth sign-in or password reset — **confirm whether TTMPC does OTP anywhere today**, or whether this is net-new scope |
| Training reminders | Loan payment due reminders / renewal eligibility notices |
| Admin announcements | BOD/Bookkeeper broadcast to members |

Open question to resolve before Step 5: does TTMPC have any existing OTP mechanism? If not, adding SMS OTP is new scope, not a port of existing behavior, and should be sized/approved as such.

## Build order

### Step 1 — Manual gateway verification (go/no-go gate)
- Install the APK on the spare Android phone (correct arch variant), insert the dedicated SIM.
- Start the server in-app, note the IP:port and token, change the default `admin`/`admin` web login.
- From a laptop on the same Wi-Fi, call `GET /health` and `POST /send` with `curl` directly (not through any app code) and confirm a real SMS is received on a test number.
- Do not proceed past this step until a real text has been received this way.

### Step 2 — Decide worker hosting & OTP policy
- Pick the always-on (or best-effort) machine that will run the worker, on the same LAN as the phone.
- Decide explicitly: does OTP use SMS at all, given the worker-availability dependency above? Default recommendation: keep OTP on email, use SMS for reminders/announcements/confirmations only, unless there's a hard requirement otherwise.

### Step 3 — SQL migration: `sms_queue` table
- New file under `TTMPC_THESIS/src/server/`, following the existing migration convention (incremental, applied by hand in Supabase SQL Editor — **the user runs this, not Claude**, per this project's standing rule).
- Suggested columns: id, recipient_number, message_body, message_type, status (`queued`/`sending`/`sent`/`failed`/`unknown`), attempt_count, dedup_key, created_at, last_attempt_at, sent_at, error_details.
- RLS: service-role only, no client policies — same posture as `loan_renewal_override_requests`. All access goes through FastAPI / the worker using the service-role key.
- Atomic job claiming: either a `FOR UPDATE SKIP LOCKED` query or a Postgres function (same pattern as the ISC RPCs), so two workers can never process the same row.

### Step 4 — `sms_service.py`
- Philippine mobile number normalization/validation.
- Gateway HTTP client: configurable base URL + token via environment variables, timeouts, and a clear distinction between confirmed failure vs. uncertain/ambiguous outcome (mark `unknown`, never silently retry on uncertainty).
- Modeled after the structure of `src/server/services/loan_email_templates.py` — a sibling module, not a rewrite of the email path.

### Step 5 — Background worker
- Separate standalone Python process (not a FastAPI route — must not live inside `src/server/`'s uvicorn `--reload-include "*.py"` scope, since it runs independently and continuously).
- Polls/claims queued jobs atomically, validates recipient + message type, calls the gateway, writes back status, handles timeouts/failures without crashing the loop, supports graceful shutdown and logging, has a dry-run mode for testing without sending real SMS.

### Step 6 — Wire ONE low-stakes flow first
- Recommended first integration: BOD announcements (lowest risk, no auth/time-sensitivity).
- Prove the full pipeline (queue → worker → gateway → real SMS → status update) end-to-end before touching anything OTP- or loan-adjacent.

### Step 7 — Add remaining flows
- Membership application confirmation/approval, loan reminders, and (only if Step 2 decided yes) OTP.
- Each new flow **queues** an SMS alongside the existing email call — it must not replace or block on the email path, and must not double-send on page refresh/retry (use the dedup_key).

## Constraints carried through from the original request

- No third-party/paid SMS provider.
- Preserve existing Vercel/Railway/Namecheap/FastAPI/Supabase setup — no infrastructure changes beyond what's listed here.
- Do not remove or alter unrelated existing features.
- Do not invent gateway API details not confirmed in Step 1.
- Never mark a message `sent` just because the gateway accepted the HTTP request — only on a confirmed outcome; everything else is `unknown` until reconciled.
- Secrets (gateway token, etc.) in environment variables only, never committed, never exposed to frontend code.
