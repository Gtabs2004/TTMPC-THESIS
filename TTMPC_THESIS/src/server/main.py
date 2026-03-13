import os
import json
import uuid
from datetime import date
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from supabase import create_client, Client
from dotenv import load_dotenv
from urllib import request as urlrequest
from urllib.error import HTTPError, URLError

# 1. Load Environment Variables
# Load from project root .env explicitly for consistent behavior.
ROOT_ENV_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))
load_dotenv(ROOT_ENV_PATH, override=True)

url: str = os.environ.get("VITE_SUPABASE_URL")
# Prefer service role key, but allow anon fallback so server can start in dev.
key: str = os.environ.get("VITE_SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("VITE_SUPABASE_ANON_KEY")
resend_api_key: str = os.environ.get("RESEND_API_KEY") or os.environ.get("VITE_RESEND_API_KEY")
resend_from_email: str = os.environ.get("RESEND_FROM_EMAIL", "onboarding@resend.dev")

if not url:
    print("Error: VITE_SUPABASE_URL is missing.")
if not key:
    print("Error: Supabase key is missing (service role and anon key are both unavailable).")
if not resend_api_key:
    print("Warning: RESEND_API_KEY is missing. Email notifications are disabled.")

# 2. Initialize Supabase
supabase: Client | None = create_client(url, key) if url and key else None

app = FastAPI()

# 3. CORS - Allow Frontend to connect
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class LoginRequest(BaseModel):
    username: str
    password: str

class StatusEmailRequest(BaseModel):
    to_email: str
    member_name: str
    status: str
    remarks: str | None = None


class FinalizeMemberRequest(BaseModel):
    application_id: str
    is_bona_fide: bool = True

@app.post("/api/send-status-email")
async def send_status_email(payload: StatusEmailRequest):
    # Reload env values at request time so key updates are picked up without restart.
    load_dotenv(ROOT_ENV_PATH, override=True)
    runtime_resend_api_key = os.environ.get("RESEND_API_KEY") or os.environ.get("VITE_RESEND_API_KEY")
    runtime_resend_from_email = os.environ.get("RESEND_FROM_EMAIL", resend_from_email)

    if not runtime_resend_api_key:
        raise HTTPException(status_code=500, detail="RESEND_API_KEY is not configured.")

    details_html = ""
    if payload.remarks:
        details_html = f"<p><strong>Remarks:</strong> {payload.remarks}</p>"

    resend_payload = {
        "from": runtime_resend_from_email,
        "to": [payload.to_email],
        "subject": f"Membership Application Update: {payload.status}",
        "html": f"""
          <div style=\"font-family: Arial, sans-serif; color: #111827;\">
            <h2 style=\"margin-bottom: 8px;\">Membership Application Update</h2>
            <p>Hello {payload.member_name},</p>
            <p>Your membership application status is now <strong>{payload.status}</strong>.</p>
            {details_html}
            <p style=\"margin-top: 16px;\">TTMPC BOD Portal</p>
          </div>
        """,
    }

    req = urlrequest.Request(
        "https://api.resend.com/emails",
        data=json.dumps(resend_payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {runtime_resend_api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "TTMPC-BOD-Portal/1.0" # Prevents Cloudflare Error 1010
        },
        method="POST",
    )

    try:
        with urlrequest.urlopen(req) as response:
            body = response.read().decode("utf-8")
            data = json.loads(body) if body else {}
            return {"success": True, "data": data}
    except HTTPError as err:
        error_body = err.read().decode("utf-8") if err.fp else ""
        raise HTTPException(status_code=err.code, detail=error_body or "Failed to send email.")
    except URLError as err:
        raise HTTPException(status_code=500, detail=f"Email service unreachable: {err.reason}")


@app.post("/api/finalize-member")
async def finalize_member(payload: FinalizeMemberRequest):
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase client is not initialized.")

    # 1) Load application row
    application_resp = supabase.table("member_applications").select("*").eq("application_id", payload.application_id).execute()
    application_rows = application_resp.data or []
    if not application_rows:
        raise HTTPException(status_code=404, detail="Application not found.")

    app_row = application_rows[0]
    middle_name = (app_row.get("middle_name") or "").strip()
    middle_initial = middle_name[:1] if middle_name else None

    # 2) Insert to member table
    # Try snake_case column naming first, then fallback to schema naming shown in design docs.
    snake_payload = {
        "member_id": str(uuid.uuid4()),
        "application_id": app_row.get("application_id"),
        "membership_type_id": app_row.get("membership_type_id"),
        "co_maker": app_row.get("co_maker"),
        "first_name": app_row.get("first_name"),
        "last_name": app_row.get("surname") or app_row.get("last_name"),
        "middle_initial": middle_initial,
        "membership_date": date.today().isoformat(),
        "is_bona_fide": payload.is_bona_fide,
    }

    pascal_payload = {
        "MemberID": snake_payload["member_id"],
        "ApplicationID": snake_payload["application_id"],
        "MembershipTypeID": snake_payload["membership_type_id"],
        "CoMaker": snake_payload["co_maker"],
        "FirstName": snake_payload["first_name"],
        "LastName": snake_payload["last_name"],
        "MiddleInitial": snake_payload["middle_initial"],
        "MembershipDate": snake_payload["membership_date"],
        "IsBonaFide": snake_payload["is_bona_fide"],
    }

    insert_errors: list[str] = []
    inserted = False

    for insert_payload in (snake_payload, pascal_payload):
      try:
          supabase.table("member").insert(insert_payload).execute()
          inserted = True
          break
      except Exception as err:
          insert_errors.append(str(err))

    if not inserted:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to insert into member table. Details: {' | '.join(insert_errors)}",
        )

    # 3) Remove from application table after successful member insert
    try:
        supabase.table("member_applications").delete().eq("application_id", payload.application_id).execute()
    except Exception as err:
        raise HTTPException(
            status_code=500,
            detail=f"Inserted member record, but failed to remove application: {err}",
        )

    return {"success": True, "message": "Application finalized and moved to member table."}

@app.post("/api/login")
async def login(user_data: LoginRequest):
    print(f"Login attempt for: {user_data.username}")

    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase client is not initialized.")

    try:
        # A. Query the table
        response = supabase.table("Users").select("*").eq("username", user_data.username).execute()

        # B. Check if User Exists
        if not response.data:
            print(" User not found in DB.")
            raise HTTPException(status_code=401, detail="User not found")

        user = response.data[0]
        
        db_password = str(user.get("Password"))
        input_password = str(user_data.password)

        print(f"DB Password: {db_password} | Input: {input_password}")

        if db_password != input_password:
             print(" Password mismatch")
             raise HTTPException(status_code=401, detail="Invalid password")

        print(" Login successful")
        return {
            "message": "Login successful",
            "user": {
                "id": user.get("id"),
                "username": user.get("username")
            }
        }

    except HTTPException as he:
        raise he
    except Exception as e:
        print(f" Server Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))