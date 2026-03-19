import os
import json
import calendar
from datetime import date, datetime, timedelta
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


class CashierLoanPaymentCreateRequest(BaseModel):
    loan_id: str = Field(..., min_length=1)
    schedule_id: str | None = None
    payment_amount: Decimal = Field(..., gt=0)
    penalties: Decimal = Field(default=Decimal("0"), ge=0)
    deficiency: Decimal | None = Field(default=None, ge=0)
    payment_reference: str | None = None
    transaction_reference: str | None = None


class CashierDisbursementClaimRequest(BaseModel):
    disbursed_at: datetime | None = None


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


def decimal_to_float(value) -> float:
    return float(value) if value is not None else 0.0


def normalize_cashier_loan_type(loan_type_name: str | None) -> str:
    text = str(loan_type_name or "").strip().lower()
    if "consolidated" in text:
        return "consolidated"
    if "emergency" in text:
        return "emergency"
    if "bonus" in text:
        return "bonus"
    return "consolidated"


def build_sequence_id(prefix: str, sequence_number: int) -> str:
    safe_seq = max(int(sequence_number), 1)
    return f"{prefix}{safe_seq:03d}"


def compute_missed_due_dates(due_date: str | None) -> Decimal:
    if not due_date:
        return Decimal("0")

    try:
        due_dt = datetime.fromisoformat(str(due_date).replace("Z", "+00:00"))
    except ValueError:
        return Decimal("0")

    now_dt = datetime.utcnow()
    if now_dt <= due_dt.replace(tzinfo=None):
        return Decimal("0")

    month_diff = (now_dt.year - due_dt.year) * 12 + (now_dt.month - due_dt.month)
    crossed_day = 1 if now_dt.day >= due_dt.day else 0
    return Decimal(max(month_diff + crossed_day, 1))


def parse_date_value(value: str | None) -> date | None:
    if not value:
        return None

    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).date()
    except ValueError:
        return None


def build_schedule_rows_for_loan(
    loan_type: str,
    principal: Decimal,
    term_months: int,
    monthly_rate_decimal: Decimal,
    first_due_date: date,
    loan_id: str,
    start_sequence_number: int,
) -> list[dict]:
    if term_months <= 0:
        return []

    rows: list[dict] = []
    principal_component = money(principal / Decimal(term_months))
    penalty_rate_percent = Decimal("1") if loan_type == "bonus" else Decimal("2")
    running_principal = principal

    if loan_type == "emergency":
        remaining_principal = principal
        for installment_no in range(1, term_months + 1):
            interest_component = money(max(remaining_principal, Decimal("0")) * monthly_rate_decimal)
            expected_amount = money(principal_component + interest_component)
            due_date_value = add_months(first_due_date, installment_no - 1)

            rows.append(
                {
                    "schedule_id": build_sequence_id("TTMPCLP_SI_", start_sequence_number + installment_no - 1),
                    "loan_id": loan_id,
                    "installment_no": installment_no,
                    "due_date": due_date_value.isoformat(),
                    "expected_amount": decimal_to_float(expected_amount),
                    "expected_principal": decimal_to_float(principal_component),
                    "expected_interest": decimal_to_float(interest_component),
                    "penalty": decimal_to_float(penalty_rate_percent),
                    "salary_schedule_id": None,
                    "remaining_principal": decimal_to_float(max(running_principal - principal_component, Decimal("0"))),
                    "principal_component": decimal_to_float(principal_component),
                    "interest_component": decimal_to_float(interest_component),
                    "schedule_status": "Unpaid",
                }
            )
            remaining_principal = max(remaining_principal - principal_component, Decimal("0"))
            running_principal = max(running_principal - principal_component, Decimal("0"))
    else:
        monthly_interest = money(principal * monthly_rate_decimal)
        expected_amount = money(principal_component + monthly_interest)

        for installment_no in range(1, term_months + 1):
            due_date_value = add_months(first_due_date, installment_no - 1)
            rows.append(
                {
                    "schedule_id": build_sequence_id("TTMPCLP_SI_", start_sequence_number + installment_no - 1),
                    "loan_id": loan_id,
                    "installment_no": installment_no,
                    "due_date": due_date_value.isoformat(),
                    "expected_amount": decimal_to_float(expected_amount),
                    "expected_principal": decimal_to_float(principal_component),
                    "expected_interest": decimal_to_float(monthly_interest),
                    "penalty": decimal_to_float(penalty_rate_percent),
                    "salary_schedule_id": None,
                    "remaining_principal": decimal_to_float(max(running_principal - principal_component, Decimal("0"))),
                    "principal_component": decimal_to_float(principal_component),
                    "interest_component": decimal_to_float(monthly_interest),
                    "schedule_status": "Unpaid",
                }
            )
            running_principal = max(running_principal - principal_component, Decimal("0"))

    return rows


def resolve_monthly_rate_decimal(loan_type: str, interest_rate_percent: Decimal | None) -> Decimal:
    if interest_rate_percent is not None and interest_rate_percent > 0:
        return Decimal(str(interest_rate_percent)) / Decimal("100")

    if loan_type == "consolidated":
        return Decimal("0.0083")
    if loan_type == "emergency":
        return Decimal("0.02")
    if loan_type == "bonus":
        return Decimal("0.02")

    return Decimal("0.0083")


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


@app.get("/api/cashier/loan-payments/loans")
async def get_cashier_loans_for_payments():
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase client is not initialized.")

    try:
        try:
            loans_response = (
                supabase.table("loans")
                .select(
                    "control_number,loan_amount,principal_amount,interest_rate,term,loan_status,application_date,monthly_amortization," \
                    "member:member_id(first_name,last_name,is_bona_fide),loan_type:loan_type_id(name)"
                )
                .order("application_date", desc=True)
                .execute()
            )
        except Exception:
            loans_response = (
                supabase.table("loans")
                .select(
                    "control_number,loan_amount,principal_amount,interest_rate,term,loan_status,application_date," \
                    "member:member_id(first_name,last_name,is_bona_fide),loan_type:loan_type_id(name)"
                )
                .order("application_date", desc=True)
                .execute()
            )

        loans_rows = loans_response.data or []
        loans_rows = [
            row for row in loans_rows
            if str(row.get("loan_status") or "").strip().lower() not in {"rejected", "cancelled"}
        ]

        schedules_by_loan: dict[str, list[dict]] = {}
        try:
            try:
                schedules_response = (
                    supabase.table("loan_schedules")
                    .select("id,schedule_id,loan_id,installment_no,due_date,expected_amount,expected_principal,expected_interest,penalty,remaining_principal,schedule_status")
                    .order("due_date")
                    .execute()
                )
            except Exception:
                schedules_response = (
                    supabase.table("loan_schedules")
                    .select("id,loan_id,installment_no,due_date,expected_amount,principal_component,interest_component,schedule_status")
                    .order("due_date")
                    .execute()
                )
            for row in schedules_response.data or []:
                schedules_by_loan.setdefault(str(row.get("loan_id") or ""), []).append(row)
        except Exception:
            schedules_by_loan = {}

        schedule_display_by_internal_id: dict[str, str] = {}
        for loan_schedules in schedules_by_loan.values():
            for sched in loan_schedules:
                internal_id = str(sched.get("id") or "")
                display_id = str(sched.get("schedule_id") or internal_id)
                if internal_id:
                    schedule_display_by_internal_id[internal_id] = display_id

        payments_rows = []
        try:
            payments_response = (
                supabase.table("loan_payments")
                .select("id,loan_id,schedule_id,amount_paid,penalties,payment_date,deficiency,confirmation_status,payment_reference,transaction_reference")
                .order("payment_date", desc=True)
                .execute()
            )
            payments_rows = payments_response.data or []
        except Exception:
            payments_response = (
                supabase.table("loan_payments")
                .select("id,loan_id,schedule_id,amount_paid,penalties,payment_date,deficiency")
                .order("payment_date", desc=True)
                .execute()
            )
            payments_rows = payments_response.data or []

        confirmed_paid_by_loan: dict[str, Decimal] = {}
        for payment in payments_rows:
            loan_key = str(payment.get("loan_id") or "")
            status = str(payment.get("confirmation_status") or "confirmed").strip().lower()
            is_confirmed = status in {"confirmed", "bookkeeper_confirmed", "approved"}
            if not is_confirmed:
                continue
            confirmed_paid_by_loan[loan_key] = confirmed_paid_by_loan.get(loan_key, Decimal("0")) + Decimal(str(payment.get("amount_paid") or 0))

        mapped_loans = []
        for loan in loans_rows:
            control_number = str(loan.get("control_number") or "").strip()
            if not control_number:
                continue

            member = loan.get("member") or {}
            member_name = f"{member.get('first_name') or ''} {member.get('last_name') or ''}".strip() or "Unknown Member"
            loan_type_name = (loan.get("loan_type") or {}).get("name")
            normalized_loan_type = normalize_cashier_loan_type(loan_type_name)

            principal_amount = Decimal(str(loan.get("principal_amount") or loan.get("loan_amount") or 0))
            confirmed_paid = confirmed_paid_by_loan.get(control_number, Decimal("0"))
            remaining_balance = max(principal_amount - confirmed_paid, Decimal("0"))

            schedules = schedules_by_loan.get(control_number, [])
            next_schedule = None
            for sched in schedules:
                sched_status = str(sched.get("schedule_status") or "").strip().lower()
                if sched_status in {"unpaid", "pending", "overdue", ""}:
                    next_schedule = sched
                    break
            if not next_schedule and schedules:
                next_schedule = schedules[0]

            # Payments should only be posted once disbursement has generated schedules.
            if not next_schedule:
                continue

            due_date_value = parse_date_value(next_schedule.get("due_date") if next_schedule else None)
            grace_deadline = (due_date_value + timedelta(days=3)) if due_date_value else None
            delayed_deadline = add_months(due_date_value, 1) if due_date_value else None
            today_date = datetime.utcnow().date()
            is_delayed = bool(delayed_deadline and today_date > delayed_deadline)

            is_migs = bool(member.get("is_bona_fide"))

            mapped_loans.append(
                {
                    "loan_id": control_number,
                    "schedule_id": next_schedule.get("schedule_id") or next_schedule.get("id") if next_schedule else None,
                    "member_id": loan.get("member_id"),
                    "member_name": member_name,
                    "loan_type": normalized_loan_type,
                    "is_migs_member": is_migs,
                    "loan_amount": decimal_to_float(principal_amount),
                    "interest_rate": decimal_to_float(loan.get("interest_rate") or 0),
                    "term_months": int(loan.get("term") or 0),
                    "amortization": decimal_to_float((loan.get("monthly_amortization") or 0)),
                    "due_date": next_schedule.get("due_date") if next_schedule else None,
                    "grace_deadline": grace_deadline.isoformat() if grace_deadline else None,
                    "delayed_deadline": delayed_deadline.isoformat() if delayed_deadline else None,
                    "is_delayed": is_delayed,
                    "remaining_balance": decimal_to_float(remaining_balance),
                    "loan_status": "Fully Paid" if remaining_balance <= 0 else "Unpaid",
                }
            )

        mapped_payment_records = []
        for idx, row in enumerate(payments_rows, start=1):
            mapped_payment_records.append(
                {
                    "payment_id": row.get("payment_reference") or build_sequence_id("TTMPCLP-", idx),
                    "loan_id": row.get("loan_id"),
                    "schedule_id": schedule_display_by_internal_id.get(str(row.get("schedule_id") or ""), row.get("schedule_id")),
                    "transaction_id": row.get("transaction_reference") or build_sequence_id("TTMPCLP_TXN_", idx),
                    "amount_paid": decimal_to_float(row.get("amount_paid") or 0),
                    "payment_date": row.get("payment_date"),
                    "penalties": decimal_to_float(row.get("penalties") or 0),
                    "deficiency": decimal_to_float(row.get("deficiency") or 0),
                    "confirmation_status": row.get("confirmation_status") or "pending_bookkeeper",
                }
            )

        return {
            "success": True,
            "data": {
                "loans": mapped_loans,
                "payment_records": mapped_payment_records,
            },
        }
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Failed to load cashier loan payment data: {err}")


@app.get("/api/cashier/disbursements/ready-loans")
async def get_cashier_ready_for_disbursement_loans():
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase client is not initialized.")

    try:
        response = (
            supabase.table("loans")
            .select(
                "control_number,loan_amount,principal_amount,interest_rate,term,loan_status,application_status,application_date," \
                "member:member_id(first_name,last_name),loan_type:loan_type_id(name)"
            )
            .order("application_date", desc=True)
            .execute()
        )
        rows = response.data or []

        filtered = [
            row
            for row in rows
            if str(row.get("loan_status") or "").strip().lower() in {"ready for disbursement", "to be disbursed"}
        ]

        mapped = []
        for row in filtered:
            member = row.get("member") or {}
            mapped.append(
                {
                    "loan_id": row.get("control_number"),
                    "member_name": f"{member.get('first_name') or ''} {member.get('last_name') or ''}".strip() or "Unknown Member",
                    "loan_type": (row.get("loan_type") or {}).get("name") or "N/A",
                    "loan_amount": decimal_to_float(row.get("loan_amount") or 0),
                    "principal_amount": decimal_to_float(row.get("principal_amount") or row.get("loan_amount") or 0),
                    "interest_rate": decimal_to_float(row.get("interest_rate") or 0),
                    "term_months": int(row.get("term") or 0),
                    "loan_status": row.get("loan_status") or "ready for disbursement",
                    "application_status": row.get("application_status") or row.get("loan_status") or "ready for disbursement",
                    "application_date": row.get("application_date"),
                }
            )

        return {"success": True, "data": mapped}
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Failed to fetch ready disbursement loans: {err}")


@app.post("/api/cashier/disbursements/{loan_id}/claim")
async def claim_cashier_disbursement(loan_id: str, payload: CashierDisbursementClaimRequest):
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase client is not initialized.")

    try:
        clean_loan_id = str(loan_id or "").strip()
        if not clean_loan_id:
            raise HTTPException(status_code=400, detail="loan_id is required.")

        loan_response = (
            supabase.table("loans")
            .select(
                "control_number,loan_amount,principal_amount,interest_rate,term,loan_status," \
                "loan_type:loan_type_id(name)"
            )
            .eq("control_number", clean_loan_id)
            .limit(1)
            .execute()
        )
        loan_row = (loan_response.data or [None])[0]
        if not loan_row:
            raise HTTPException(status_code=404, detail="Loan not found.")

        current_status = str(loan_row.get("loan_status") or "").strip().lower()
        if current_status not in {"ready for disbursement", "to be disbursed"}:
            raise HTTPException(status_code=400, detail="Loan is not in ready for disbursement status.")

        disbursed_at = payload.disbursed_at or datetime.utcnow()
        first_due_date = add_months(disbursed_at.date(), 1)

        term_months = int(loan_row.get("term") or 0)
        if term_months <= 0:
            raise HTTPException(status_code=400, detail="Loan term is missing or invalid.")

        principal_amount = Decimal(str(loan_row.get("principal_amount") or loan_row.get("loan_amount") or 0))
        if principal_amount <= 0:
            raise HTTPException(status_code=400, detail="Loan principal is missing or invalid.")

        loan_type_name = (loan_row.get("loan_type") or {}).get("name")
        normalized_loan_type = normalize_cashier_loan_type(loan_type_name)
        interest_rate_percent = Decimal(str(loan_row.get("interest_rate") or 0)) if loan_row.get("interest_rate") is not None else None
        monthly_rate_decimal = resolve_monthly_rate_decimal(normalized_loan_type, interest_rate_percent)

        existing_schedule_response = (
            supabase.table("loan_schedules")
            .select("id,schedule_id")
            .eq("loan_id", clean_loan_id)
            .limit(1)
            .execute()
        )
        if not existing_schedule_response.data:
            existing_schedule_response = (
                supabase.table("loan_schedules")
                .select("id")
                .eq("loan_id", clean_loan_id)
                .limit(1)
                .execute()
            )
        has_existing_schedule = bool(existing_schedule_response.data)

        created_schedules = []
        if not has_existing_schedule:
            schedule_count_response = supabase.table("loan_schedules").select("id").execute()
            start_sequence_number = len(schedule_count_response.data or []) + 1

            schedule_rows = build_schedule_rows_for_loan(
                loan_type=normalized_loan_type,
                principal=principal_amount,
                term_months=term_months,
                monthly_rate_decimal=monthly_rate_decimal,
                first_due_date=first_due_date,
                loan_id=clean_loan_id,
                start_sequence_number=start_sequence_number,
            )

            if schedule_rows:
                try:
                    insert_schedule_response = supabase.table("loan_schedules").insert(schedule_rows).execute()
                    created_schedules = insert_schedule_response.data or []
                except Exception:
                    legacy_schedule_rows = [
                        {
                            "loan_id": row["loan_id"],
                            "installment_no": row["installment_no"],
                            "due_date": row["due_date"],
                            "expected_amount": row["expected_amount"],
                            "principal_component": row["principal_component"],
                            "interest_component": row["interest_component"],
                            "schedule_status": "Unpaid",
                        }
                        for row in schedule_rows
                    ]
                    insert_schedule_response = supabase.table("loan_schedules").insert(legacy_schedule_rows).execute()
                    created_schedules = insert_schedule_response.data or []

        update_payload = {
            "loan_status": "released",
            "application_status": "released",
            "disbursal_date": disbursed_at.isoformat(),
        }

        (
            supabase.table("loans")
            .update(update_payload)
            .eq("control_number", clean_loan_id)
            .execute()
        )

        updated_loan_response = (
            supabase.table("loans")
            .select("control_number,loan_status,application_status,disbursal_date")
            .eq("control_number", clean_loan_id)
            .limit(1)
            .execute()
        )
        updated_loan = (updated_loan_response.data or [None])[0]

        return {
            "success": True,
            "message": "Loan disbursed successfully. Loan schedules are created for payment tracking.",
            "data": {
                "loan": updated_loan,
                "schedule_created": not has_existing_schedule,
                "created_schedule_count": len(created_schedules),
                "first_due_date": first_due_date.isoformat(),
                "grace_period_days": 3,
                "delayed_flag_after_months": 1,
                "next_schedule_id": (
                    created_schedules[0].get("schedule_id")
                    if created_schedules and created_schedules[0].get("schedule_id")
                    else (created_schedules[0].get("id") if created_schedules else None)
                ),
            },
        }
    except HTTPException as err:
        raise err
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Failed to disburse loan: {err}")


@app.post("/api/cashier/loan-payments")
async def create_cashier_loan_payment(payload: CashierLoanPaymentCreateRequest):
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase client is not initialized.")

    try:
        loan_id = str(payload.loan_id).strip()
        if not loan_id:
            raise HTTPException(status_code=400, detail="loan_id is required.")

        loan_response = (
            supabase.table("loans")
            .select("control_number")
            .eq("control_number", loan_id)
            .limit(1)
            .execute()
        )
        if not loan_response.data:
            raise HTTPException(status_code=404, detail="Loan not found.")

        try:
            schedules_response = (
                supabase.table("loan_schedules")
                .select("id,schedule_id,loan_id,due_date,schedule_status")
                .eq("loan_id", loan_id)
                .order("due_date")
                .execute()
            )
        except Exception:
            schedules_response = (
                supabase.table("loan_schedules")
                .select("id,loan_id,due_date,schedule_status")
                .eq("loan_id", loan_id)
                .order("due_date")
                .execute()
            )
        schedules = schedules_response.data or []
        if not schedules:
            raise HTTPException(status_code=400, detail="No loan schedule found for this loan.")

        selected_schedule = None
        if payload.schedule_id:
            selected_schedule = next(
                (
                    row
                    for row in schedules
                    if str(row.get("id")) == str(payload.schedule_id)
                    or str(row.get("schedule_id") or "") == str(payload.schedule_id)
                ),
                None,
            )
            if selected_schedule is None:
                raise HTTPException(status_code=400, detail="Provided schedule_id does not belong to this loan.")
        else:
            for sched in schedules:
                sched_status = str(sched.get("schedule_status") or "").strip().lower()
                if sched_status in {"unpaid", "pending", "overdue", ""}:
                    selected_schedule = sched
                    break
            if selected_schedule is None:
                selected_schedule = schedules[0]

        existing_payments_response = supabase.table("loan_payments").select("id").execute()
        next_sequence = len(existing_payments_response.data or []) + 1

        payment_reference = payload.payment_reference or build_sequence_id("TTMPCLP-", next_sequence)
        transaction_reference = payload.transaction_reference or build_sequence_id("TTMPCLP_TXN_", next_sequence)

        deficiency_value = payload.deficiency
        if deficiency_value is None:
            deficiency_value = compute_missed_due_dates(selected_schedule.get("due_date"))

        insert_payload = {
            "loan_id": loan_id,
            "schedule_id": selected_schedule.get("id"),
            "amount_paid": decimal_to_float(money(Decimal(str(payload.payment_amount)))),
            "payment_date": datetime.utcnow().isoformat(),
            "penalties": decimal_to_float(money(Decimal(str(payload.penalties)))),
            "deficiency": decimal_to_float(money(Decimal(str(deficiency_value)))),
            "confirmation_status": "pending_bookkeeper",
            "payment_reference": payment_reference,
            "transaction_reference": transaction_reference,
        }

        inserted_row = None
        try:
            inserted_response = supabase.table("loan_payments").insert(insert_payload).execute()
            inserted_row = (inserted_response.data or [{}])[0]
        except Exception as insert_err:
            # Fallback for environments where new optional columns are not migrated yet.
            message = str(insert_err).lower()
            if any(token in message for token in ["confirmation_status", "payment_reference", "transaction_reference"]):
                fallback_payload = {
                    "loan_id": loan_id,
                    "schedule_id": selected_schedule.get("id"),
                    "transaction_id": None,
                    "amount_paid": decimal_to_float(money(Decimal(str(payload.payment_amount)))),
                    "payment_date": datetime.utcnow().isoformat(),
                    "penalties": decimal_to_float(money(Decimal(str(payload.penalties)))),
                    "deficiency": decimal_to_float(money(Decimal(str(deficiency_value)))),
                }
                inserted_response = supabase.table("loan_payments").insert(fallback_payload).execute()
                inserted_row = (inserted_response.data or [{}])[0]
            else:
                raise

        return {
            "success": True,
            "message": "Payment logged and pending Bookkeeper confirmation. Loan balance is unchanged until confirmation.",
            "data": {
                "payment_id": payment_reference,
                "loan_id": loan_id,
                "schedule_id": selected_schedule.get("schedule_id") or selected_schedule.get("id"),
                "transaction_id": transaction_reference,
                "amount_paid": insert_payload["amount_paid"],
                "payment_date": insert_payload["payment_date"],
                "penalties": insert_payload["penalties"],
                "deficiency": insert_payload["deficiency"],
                "confirmation_status": inserted_row.get("confirmation_status") or "pending_bookkeeper",
            },
        }
    except HTTPException as err:
        raise err
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Failed to create cashier payment: {err}")

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