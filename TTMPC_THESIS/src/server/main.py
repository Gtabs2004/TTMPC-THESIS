import os
import json
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from supabase import create_client, Client
from dotenv import load_dotenv
from urllib import request as urlrequest
from urllib.error import HTTPError, URLError
from applicationConfirmation import MembershipConfirmationError, confirm_membership, get_next_membership_id

# 1. Load Environment Variables
# Load from project root .env explicitly for consistent behavior.
ROOT_ENV_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))
load_dotenv(ROOT_ENV_PATH, override=True)

url: str = os.environ.get("VITE_SUPABASE_URL")
# Prefer service role key, but allow anon fallback so server can start in dev.
key: str = (
    os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    or os.environ.get("VITE_SUPABASE_SERVICE_ROLE_KEY")
    or os.environ.get("VITE_SUPABASE_ANON_KEY")
)
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


class MembershipConfirmationRequest(BaseModel):
    application_id: str
    confirmed_by_user_id: str
    force: bool = False

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


@app.post("/api/confirm-membership")
async def confirm_membership_endpoint(payload: MembershipConfirmationRequest):
    try:
        result = confirm_membership(
            payload.application_id,
            confirmed_by_user_id=payload.confirmed_by_user_id,
            force=payload.force,
        )
        return {"success": True, "data": result}
    except MembershipConfirmationError as err:
        raise HTTPException(status_code=400, detail=str(err))
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Membership confirmation failed: {err}")


@app.get("/api/next-membership-id")
async def next_membership_id_endpoint():
    try:
        return {"success": True, "membership_id": get_next_membership_id()}
    except MembershipConfirmationError as err:
        raise HTTPException(status_code=400, detail=str(err))
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Unable to generate membership ID: {err}")