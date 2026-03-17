import os
import json
import calendar
from datetime import date, datetime
from decimal import Decimal, ROUND_HALF_UP
from typing import Annotated, Literal, Union
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, model_validator
from supabase import create_client, Client
from dotenv import load_dotenv
from urllib import request as urlrequest
from urllib.error import HTTPError, URLError
from applicationConfirmation import MembershipConfirmationError, confirm_membership, confirm_membership_batch, get_next_membership_id

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


class MembershipBatchConfirmationRequest(BaseModel):
    confirmed_by_user_id: str
    max_items: int = 50
    force: bool = False


class LoanComputeBaseRequest(BaseModel):
    loan_type: str
    principal: Decimal = Field(..., gt=0)
    term_months: int = Field(..., gt=0)
    first_due_date: date | None = None


class ConsolidatedLoanComputeRequest(LoanComputeBaseRequest):
    loan_type: Literal["consolidated"]


class EmergencyLoanComputeRequest(LoanComputeBaseRequest):
    loan_type: Literal["emergency"]

    @model_validator(mode="after")
    def validate_rules(self):
        if self.principal > Decimal("20000"):
            raise ValueError("Emergency loan amount cannot exceed 20,000.")
        if self.term_months not in (6, 12):
            raise ValueError("Emergency loan term must be 6 or 12 months only.")
        return self


class BonusLoanComputeRequest(LoanComputeBaseRequest):
    loan_type: Literal["bonus"]
    member_category: Literal["regular", "non_member", "non-member"]


LoanComputeRequest = Annotated[
    Union[
        ConsolidatedLoanComputeRequest,
        EmergencyLoanComputeRequest,
        BonusLoanComputeRequest,
    ],
    Field(discriminator="loan_type"),
]


class MonthlyBreakdownRow(BaseModel):
    installment_no: int
    due_date: date
    expected_amount: Decimal
    principal_component: Decimal
    interest_component: Decimal
    schedule_status: Literal["Pending"] = "Pending"


class LoanComputeResponse(BaseModel):
    loan_type: str
    principal: Decimal
    term_months: int
    monthly_amortization: Decimal
    total_interest: Decimal
    total_deductions: Decimal
    net_proceeds: Decimal
    deductions: dict[str, Decimal]
    monthly_breakdown: list[MonthlyBreakdownRow]


TWOPLACES = Decimal("0.01")


def money(value: Decimal) -> Decimal:
    return value.quantize(TWOPLACES, rounding=ROUND_HALF_UP)


def add_months(base_date: date, months_to_add: int) -> date:
    month_index = base_date.month - 1 + months_to_add
    new_year = base_date.year + month_index // 12
    new_month = month_index % 12 + 1
    max_day = calendar.monthrange(new_year, new_month)[1]
    new_day = min(base_date.day, max_day)
    return date(new_year, new_month, new_day)


@app.post("/api/loans/compute")
async def compute_loan(payload: LoanComputeRequest):
    principal = Decimal(str(payload.principal))
    term = payload.term_months
    first_due_date = payload.first_due_date or date.today()

    monthly_breakdown: list[MonthlyBreakdownRow] = []

    service_fee = Decimal("0")
    cbu_deduction = Decimal("0")
    insurance_fee = Decimal("0")
    notarial_fee = Decimal("0")

    monthly_amortization = Decimal("0")

    if payload.loan_type == "consolidated":
        principal_component = money(principal / Decimal(term))
        interest_component = money(principal * Decimal("0.0083"))
        monthly_amortization = money(principal_component + interest_component)

        service_fee = money(Decimal(((int(principal) - 1) // 50000) + 1) * Decimal("100"))
        insurance_fee = money((principal / Decimal("1000")) * Decimal("1.35"))
        cbu_deduction = money(principal * Decimal("0.02"))
        notarial_fee = money(Decimal("100"))

        for installment_no in range(1, term + 1):
            monthly_breakdown.append(
                MonthlyBreakdownRow(
                    installment_no=installment_no,
                    due_date=add_months(first_due_date, installment_no - 1),
                    expected_amount=monthly_amortization,
                    principal_component=principal_component,
                    interest_component=interest_component,
                )
            )

    elif payload.loan_type == "emergency":
        principal_component = money(principal / Decimal(term))
        service_fee = money(Decimal("100"))
        cbu_deduction = money(principal * Decimal("0.02"))

        for installment_no in range(1, term + 1):
            interest_component = money((principal / Decimal(term)) * Decimal("0.02") * Decimal(term - installment_no))
            expected_amount = money(principal_component + interest_component)
            monthly_breakdown.append(
                MonthlyBreakdownRow(
                    installment_no=installment_no,
                    due_date=add_months(first_due_date, installment_no - 1),
                    expected_amount=expected_amount,
                    principal_component=principal_component,
                    interest_component=interest_component,
                )
            )

        if monthly_breakdown:
            monthly_amortization = monthly_breakdown[0].expected_amount

    elif payload.loan_type == "bonus":
        member_category = str(payload.member_category).strip().lower()
        monthly_rate = Decimal("0.02") if member_category == "regular" else Decimal("0.03")

        principal_component = money(principal / Decimal(term))
        interest_component = money(principal * monthly_rate)
        monthly_amortization = money(principal_component + interest_component)

        service_fee = money(Decimal("100"))

        for installment_no in range(1, term + 1):
            monthly_breakdown.append(
                MonthlyBreakdownRow(
                    installment_no=installment_no,
                    due_date=add_months(first_due_date, installment_no - 1),
                    expected_amount=monthly_amortization,
                    principal_component=principal_component,
                    interest_component=interest_component,
                )
            )

    total_interest = money(sum((row.interest_component for row in monthly_breakdown), Decimal("0")))
    total_deductions = money(service_fee + cbu_deduction + insurance_fee + notarial_fee)
    net_proceeds = money(principal - total_deductions)

    return {
        "success": True,
        "data": LoanComputeResponse(
            loan_type=payload.loan_type,
            principal=money(principal),
            term_months=term,
            monthly_amortization=monthly_amortization,
            total_interest=total_interest,
            total_deductions=total_deductions,
            net_proceeds=net_proceeds,
            deductions={
                "service_fee": service_fee,
                "cbu_deduction": cbu_deduction,
                "insurance_fee": insurance_fee,
                "notarial_fee": notarial_fee,
            },
            monthly_breakdown=monthly_breakdown,
        ).model_dump(mode="json"),
    }

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


@app.post("/api/confirm-membership/batch")
async def confirm_membership_batch_endpoint(payload: MembershipBatchConfirmationRequest):
    try:
        result = confirm_membership_batch(
            confirmed_by_user_id=payload.confirmed_by_user_id,
            max_items=payload.max_items,
            force=payload.force,
        )
        return {"success": True, "data": result}
    except MembershipConfirmationError as err:
        raise HTTPException(status_code=400, detail=str(err))
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Batch membership confirmation failed: {err}")


@app.get("/api/next-membership-id")
async def next_membership_id_endpoint():
    try:
        return {"success": True, "membership_id": get_next_membership_id()}
    except MembershipConfirmationError as err:
        raise HTTPException(status_code=400, detail=str(err))
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Unable to generate membership ID: {err}")