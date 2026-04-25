import os
import json
import io
import calendar
from datetime import date, datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import Annotated, Literal, Union
from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, model_validator
from supabase import create_client, Client
from dotenv import load_dotenv
from urllib import request as urlrequest
from urllib.error import HTTPError, URLError
from applicationConfirmation import MembershipConfirmationError, confirm_membership, confirm_membership_batch, get_next_membership_id
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject

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


class MembershipFormPdfRequest(BaseModel):
    application_id: str | None = None
    date: str | None = None
    surname: str | None = None
    first_name: str | None = None
    middle_name: str | None = None
    gender: str | None = None
    civil_status: str | None = None
    date_of_birth: str | None = None
    age: str | None = None
    place_of_birth: str | None = None
    citizenship: str | None = None
    religion: str | None = None
    height: str | None = None
    weight: str | None = None
    blood_type: str | None = None
    tin_number: str | None = None
    maiden_name: str | None = None
    spouse_name: str | None = None
    spouse_date_of_birth: str | None = None
    spouse_occupation: str | None = None
    number_of_dependents: str | None = None
    permanent_address: str | None = None
    contact_number: str | None = None
    email: str | None = None
    educational_attainment: str | None = None
    occupation: str | None = None
    position: str | None = None
    annual_income: str | None = None
    other_income: str | None = None


class LoanPdfRequest(BaseModel):
    application_type: str | None = None
    control_no: str | None = None
    date_applied: str | None = None
    surname: str | None = None
    first_name: str | None = None
    middle_name: str | None = None
    contact_no: str | None = None
    latest_net_pay: str | None = None
    share_capital: str | None = None
    residence_address: str | None = None
    date_of_birth: str | None = None
    age: str | None = None
    civil_status: str | None = None
    gender: str | None = None
    tin_no: str | None = None
    gsis_sss_no: str | None = None
    employer_name: str | None = None
    office_address: str | None = None
    spouse_name: str | None = None
    spouse_occupation: str | None = None
    loan_amount_words: str | None = None
    loan_amount_numeric: str | None = None
    loan_purpose: str | None = None
    loan_purpose_other: str | None = None
    loan_term_months: str | None = None
    monthly_amortization: str | None = None
    source_of_income: str | None = None
    user_email: str | None = None
    borrower_id_type: str | None = None
    borrower_id_number: str | None = None
    bonus_amount_words: str | None = None
    bonus_amount_numeric: str | None = None


class ConsolidatedLoanPdfRequest(LoanPdfRequest):
    pass


class BonusLoanPdfRequest(LoanPdfRequest):
    pass


class EmergencyLoanPdfRequest(LoanPdfRequest):
    pass


class MembershipConfirmationRequest(BaseModel):
    application_id: str
    confirmed_by_user_id: str
    force: bool = False
    send_email: bool = True


class MembershipBatchConfirmationRequest(BaseModel):
    confirmed_by_user_id: str
    max_items: int = 50
    force: bool = False
    send_email: bool = True


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


class CashierDisbursementRequest(BaseModel):
    disbursed_at: datetime | None = None


class BookkeeperPaymentDecisionRequest(BaseModel):
    validated_by: str | None = None
    notes: str | None = None


class CashierCBUDepositRequest(BaseModel):
    member_id: str = Field(..., min_length=1)
    deposit_amount: Decimal = Field(..., gt=0)
    deposit_account: str = Field(default="Cash")
    transaction_date: datetime | None = None
    cbu_deposit_id: str | None = None


class SecretaryMembershipRecordUpdateRequest(BaseModel):
    membership_number: str | None = None
    date_of_membership: str | None = None
    bod_resolution_number: str | None = None
    number_of_shares: Decimal | None = None
    amount: Decimal | None = None
    initial_paid_up_capital: Decimal | None = None
    termination_resolution_number: str | None = None
    termination_date: str | None = None


class SavingsTransactionCreateRequest(BaseModel):
    membership_number_id: str = Field(..., min_length=1)
    savings_amount: int | None = None
    amount: int | None = None
    balance: int | None = None
    account_name: str | None = None
    adult_dependents: int | None = None
    child_dependents: int | None = None
    nominee_full_name: str | None = None
    nominee_relationship: str | None = None
    nominee_date_of_birth: str | None = None
    nominee_age: int | None = None
    nominee_address: str | None = None


class CashierSavingsDepositRequest(BaseModel):
    amount: Decimal = Field(..., gt=0)


class CashierSavingsWithdrawRequest(BaseModel):
    amount: Decimal = Field(..., gt=0)


TWOPLACES = Decimal("0.01")
CBU_STARTING_CAPITAL = Decimal("0")
CBU_SHARE_VALUE = Decimal("1000")


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


LOAN_TYPE_NAME_VARIANTS = {
    "CONSOLIDATED": ["consolidated", "consolidated loan"],
    "EMERGENCY": ["emergency", "emergency loan"],
    "BONUS": ["bonus", "bonus loan"],
    "NONMEMBER_BONUS": ["nonmember bonus loan", "non-member bonus loan", "non member bonus loan"],
    "KOICA": ["koica", "koica loan", "agri-business financial facility loan", "abff loan"],
}


def resolve_loan_type_code(loan_type: str, member_category: str | None = None) -> str:
    normalized_type = str(loan_type or "").strip().lower()
    normalized_category = str(member_category or "").strip().lower().replace("-", "_")

    if normalized_type == "consolidated":
        return "CONSOLIDATED"
    if normalized_type == "emergency":
        return "EMERGENCY"
    if normalized_type == "bonus":
        return "BONUS" if normalized_category == "regular" else "NONMEMBER_BONUS"

    return str(loan_type or "").strip().upper()


def fetch_loan_type_interest_rate_percent(loan_type_code: str | None, loan_type_name: str | None = None) -> Decimal | None:
    if not supabase:
        return None

    code = str(loan_type_code or "").strip().upper()
    name_text = str(loan_type_name or "").strip().lower()

    if not code and not name_text:
        return None

    def normalize_rate_percent(raw_rate: Decimal, row: dict | None, fallback_code: str) -> Decimal:
        rate_value = Decimal(str(raw_rate))
        if rate_value <= 0:
            return Decimal("0")

        # Backward compatibility: consolidated rates were historically stored as decimal monthly values (e.g., 0.083).
        row_code = str((row or {}).get("code") or "").strip().upper()
        effective_code = row_code or fallback_code
        if effective_code == "CONSOLIDATED" and Decimal("0") < rate_value < Decimal("1"):
            return rate_value * Decimal("100")

        return rate_value

    def extract_rate(row: dict | None) -> Decimal | None:
        if not row:
            return None

        raw_rate = next(
            (
                value
                for value in (
                    row.get("interest_rate"),
                    row.get("InterestRate"),
                    row.get("interestrate"),
                    row.get("interestRate"),
                )
                if value is not None
            ),
            None,
        )
        if raw_rate is None:
            return None

        rate = normalize_rate_percent(Decimal(str(raw_rate)), row, code)
        return rate if rate > 0 else None

    try:
        try:
            response = supabase.table("loan_types").select("*").execute()
            rows = response.data or []
        except Exception:
            response = supabase.table("loan_types").select("*").execute()
            rows = response.data or []

        matched_row = None

        if code:
            for row in rows:
                row_code = str(row.get("code") or "").strip().upper()
                if row_code and row_code == code:
                    matched_row = row
                    break

        if not matched_row and code:
            variants = LOAN_TYPE_NAME_VARIANTS.get(code, [])
            for row in rows:
                row_name = str(row.get("name") or "").strip().lower()
                if row_name in variants:
                    matched_row = row
                    break

        if not matched_row and name_text:
            for row in rows:
                row_name = str(row.get("name") or "").strip().lower()
                if row_name == name_text or (name_text and name_text in row_name):
                    matched_row = row
                    break

        if not matched_row:
            return None

        return extract_rate(matched_row)
    except Exception:
        return None


def build_sequence_id(prefix: str, sequence_number: int) -> str:
    safe_seq = max(int(sequence_number), 1)
    return f"{prefix}{safe_seq:03d}"


def build_savings_id(sequence_number: int) -> str:
    safe_seq = max(int(sequence_number), 1)
    return f"TTMPCRS_{safe_seq:03d}"


def build_savings_cashier_transaction_id(sequence_number: int) -> str:
    safe_seq = max(int(sequence_number), 1)
    return f"TTMPSVTXN_{safe_seq:06d}"


def parse_savings_id_sequence(value: str | None) -> int:
    text = str(value or "").strip()
    if not text.startswith("TTMPCRS_"):
        return 0
    sequence_part = text.split("TTMPCRS_", 1)[1]
    return int(sequence_part) if sequence_part.isdigit() else 0


def parse_savings_cashier_transaction_sequence(value: str | None) -> int:
    text = str(value or "").strip()
    if not text.startswith("TTMPSVTXN_"):
        return 0
    sequence_part = text.split("TTMPSVTXN_", 1)[1]
    return int(sequence_part) if sequence_part.isdigit() else 0


def get_next_savings_id() -> str:
    response = (
        supabase.table("Savings_Transactions")
        .select("Savings_ID")
        .execute()
    )
    max_sequence = 0
    for row in response.data or []:
        max_sequence = max(max_sequence, parse_savings_id_sequence(row.get("Savings_ID")))
    return build_savings_id(max_sequence + 1)


def get_next_savings_cashier_transaction_id() -> str:
    response = (
        supabase.table("savings_transaction_queue")
        .select("transaction_id")
        .execute()
    )
    max_sequence = 0
    for row in response.data or []:
        max_sequence = max(max_sequence, parse_savings_cashier_transaction_sequence(row.get("transaction_id")))
    return build_savings_cashier_transaction_id(max_sequence + 1)


def build_bod_resolution_number(reference_value: str | None, membership_date_value: str | None) -> str:
    clean_ref = "".join(ch for ch in str(reference_value or "").upper() if ch.isalnum())
    suffix = clean_ref[-6:] if clean_ref else datetime.utcnow().strftime("%H%M%S")
    year = str(membership_date_value or "")[:4]
    if not year.isdigit():
        year = str(datetime.utcnow().year)
    return f"BOD-RES-{year}-{suffix}"


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


def build_cbu_deposit_id(sequence_number: int) -> str:
    safe_seq = max(int(sequence_number), 1)
    return f"CBUD_{safe_seq:03d}"


def resolve_member_full_name(member_row: dict) -> str:
    parts = [
        str(member_row.get("first_name") or "").strip(),
        str(member_row.get("middle_initial") or "").strip(),
        str(member_row.get("last_name") or "").strip(),
    ]
    name = " ".join(part for part in parts if part)
    return name or "Unknown Member"


def resolve_member_by_ref(member_ref: str) -> dict | None:
    clean_ref = str(member_ref or "").strip()
    if not clean_ref:
        return None
    try:
        by_uuid_response = (
            supabase.table("member")
            .select("*")
            .eq("id", clean_ref)
            .limit(1)
            .execute()
        )
        by_uuid_row = (by_uuid_response.data or [None])[0]
        if by_uuid_row:
            return by_uuid_row

        by_membership_response = (
            supabase.table("member")
            .select("*")
            .eq("membership_id", clean_ref)
            .limit(1)
            .execute()
        )
        by_membership_row = (by_membership_response.data or [None])[0]
        if by_membership_row:
            return by_membership_row

        by_membership_ilike_response = (
            supabase.table("member")
            .select("*")
            .ilike("membership_id", clean_ref)
            .limit(1)
            .execute()
        )
        return (by_membership_ilike_response.data or [None])[0]
    except Exception:
        return None


def resolve_personal_data_sheet_by_ref(member_ref: str) -> dict | None:
    clean_ref = str(member_ref or "").strip()
    if not clean_ref:
        return None
    try:
        by_membership_response = (
            supabase.table("personal_data_sheet")
            .select("*")
            .eq("membership_number_id", clean_ref)
            .limit(1)
            .execute()
        )
        by_membership_row = (by_membership_response.data or [None])[0]
        if by_membership_row:
            return by_membership_row

        by_pds_id_response = (
            supabase.table("personal_data_sheet")
            .select("*")
            .eq("personal_data_sheet_id", clean_ref)
            .limit(1)
            .execute()
        )
        return (by_pds_id_response.data or [None])[0]
    except Exception:
        return None


def build_single_schedule_row(
    loan_type: str,
    principal: Decimal,
    term_months: int,
    monthly_rate_decimal: Decimal,
    due_date: date,
    loan_id: str,
    installment_no: int,
    remaining_principal_before: Decimal,
    start_sequence_number: int,
) -> dict:
    if term_months <= 0:
        raise ValueError("term_months must be greater than zero")

    principal_component = money(principal / Decimal(term_months))
    penalty_rate_percent = Decimal("1") if loan_type == "bonus" else Decimal("2")

    if loan_type == "emergency":
        interest_component = money(max(remaining_principal_before, Decimal("0")) * monthly_rate_decimal)
    else:
        interest_component = money(principal * monthly_rate_decimal)

    expected_amount = money(principal_component + interest_component)
    remaining_after = max(remaining_principal_before - principal_component, Decimal("0"))

    return {
        "schedule_id": build_sequence_id("TTMPCLP_SI_", start_sequence_number),
        "loan_id": loan_id,
        "installment_no": installment_no,
        "due_date": due_date.isoformat(),
        "expected_amount": decimal_to_float(expected_amount),
        "expected_principal": decimal_to_float(principal_component),
        "expected_interest": decimal_to_float(interest_component),
        "penalty": decimal_to_float(penalty_rate_percent),
        "salary_schedule_id": None,
        "remaining_principal": decimal_to_float(remaining_after),
        "principal_component": decimal_to_float(principal_component),
        "interest_component": decimal_to_float(interest_component),
        "schedule_status": "Unpaid",
    }


def resolve_monthly_rate_decimal(
    loan_type: str,
    interest_rate_percent: Decimal | None,
    loan_type_code: str | None = None,
    loan_type_name: str | None = None,
) -> Decimal:
    if interest_rate_percent is not None and interest_rate_percent > 0:
        return Decimal(str(interest_rate_percent)) / Decimal("100")

    resolved_code = str(loan_type_code or "").strip().upper() or resolve_loan_type_code(loan_type)
    configured_rate_percent = fetch_loan_type_interest_rate_percent(resolved_code, loan_type_name)
    if configured_rate_percent is not None and configured_rate_percent > 0:
        return configured_rate_percent / Decimal("100")

    return Decimal("0")


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
        monthly_rate = resolve_monthly_rate_decimal("consolidated", None, loan_type_code="CONSOLIDATED")
        if monthly_rate <= 0:
            raise HTTPException(status_code=400, detail="Interest rate for CONSOLIDATED is not configured in loan_types.")

        principal_component = money(principal / Decimal(term))
        interest_component = money(principal * monthly_rate)
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
        monthly_rate = resolve_monthly_rate_decimal("emergency", None, loan_type_code="EMERGENCY")
        if monthly_rate <= 0:
            raise HTTPException(status_code=400, detail="Interest rate for EMERGENCY is not configured in loan_types.")

        principal_component = money(principal / Decimal(term))
        service_fee = money(Decimal("100"))
        cbu_deduction = money(principal * Decimal("0.02"))

        for installment_no in range(1, term + 1):
            interest_component = money((principal / Decimal(term)) * monthly_rate * Decimal(term - installment_no))
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
        loan_type_code = resolve_loan_type_code("bonus", member_category)
        monthly_rate = resolve_monthly_rate_decimal("bonus", None, loan_type_code=loan_type_code)
        if monthly_rate <= 0:
            raise HTTPException(status_code=400, detail=f"Interest rate for {loan_type_code} is not configured in loan_types.")

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
            is_confirmed = status in {"validated", "confirmed", "bookkeeper_confirmed", "approved"}
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
            resolved_interest_rate_percent = Decimal(str(loan.get("interest_rate") or 0)) if loan.get("interest_rate") is not None else Decimal("0")
            if resolved_interest_rate_percent <= 0:
                fallback_rate = fetch_loan_type_interest_rate_percent(
                    resolve_loan_type_code(normalized_loan_type),
                    loan_type_name,
                )
                if fallback_rate is not None and fallback_rate > 0:
                    resolved_interest_rate_percent = fallback_rate

            if remaining_balance <= 0:
                repayment_status = "Fully Paid"
            elif confirmed_paid > 0:
                repayment_status = "Partially Paid"
            else:
                repayment_status = "Unpaid"

            mapped_loans.append(
                {
                    "loan_id": control_number,
                    "schedule_id": next_schedule.get("schedule_id") or next_schedule.get("id") if next_schedule else None,
                    "member_id": loan.get("member_id"),
                    "member_name": member_name,
                    "loan_type": normalized_loan_type,
                    "is_migs_member": is_migs,
                    "loan_amount": decimal_to_float(principal_amount),
                    "interest_rate": decimal_to_float(resolved_interest_rate_percent),
                    "term_months": int(loan.get("term") or 0),
                    "amortization": decimal_to_float((loan.get("monthly_amortization") or 0)),
                    "due_date": next_schedule.get("due_date") if next_schedule else None,
                    "grace_deadline": grace_deadline.isoformat() if grace_deadline else None,
                    "delayed_deadline": delayed_deadline.isoformat() if delayed_deadline else None,
                    "is_delayed": is_delayed,
                    "remaining_balance": decimal_to_float(remaining_balance),
                    "loan_status": repayment_status,
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
            if str(row.get("loan_status") or "").strip().lower() == "ready for disbursement"
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


@app.get("/api/cashier/cbu/members")
async def get_cashier_cbu_members():
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase client is not initialized.")

    try:
        try:
            member_response = (
                supabase.table("member")
                .select("id,membership_id,first_name,middle_initial,last_name,created_at")
                .execute()
            )
        except Exception:
            try:
                member_response = (
                    supabase.table("member")
                    .select("id,membership_id,first_name,middle_initial,last_name")
                    .execute()
                )
            except Exception as err:
                raise HTTPException(status_code=500, detail=f"Unable to load members: {err}")

        member_rows = member_response.data or []

        cbu_rows = []
        try:
            cbu_response = (
                supabase.table("capital_build_up")
                .select("id,member_id,transaction_date,starting_share_capital,capital_added,ending_share_capital,cbu_deposit_id")
                .execute()
            )
            cbu_rows = cbu_response.data or []
        except Exception:
            cbu_response = (
                supabase.table("capital_build_up")
                .select("id,member_id,transaction_date,starting_share_capital,capital_added,ending_share_capital")
                .execute()
            )
            cbu_rows = cbu_response.data or []

        latest_cbu_by_member: dict[str, dict] = {}
        for row in cbu_rows:
            member_id = str(row.get("member_id") or "").strip()
            if not member_id:
                continue
            previous = latest_cbu_by_member.get(member_id)
            current_ts = str(row.get("transaction_date") or "")
            previous_ts = str(previous.get("transaction_date") or "") if previous else ""
            if (not previous) or current_ts > previous_ts:
                latest_cbu_by_member[member_id] = row

        mapped_members = []
        for member in member_rows:
            member_uuid = str(member.get("id") or "").strip()
            if not member_uuid:
                continue

            latest = latest_cbu_by_member.get(member_uuid)
            is_new_member = latest is None
            current_balance = Decimal(str(latest.get("ending_share_capital") if latest else CBU_STARTING_CAPITAL))
            if current_balance < 0:
                current_balance = Decimal("0")

            mapped_members.append(
                {
                    "member_uuid": member_uuid,
                    "member_id": member.get("membership_id") or member_uuid,
                    "member_name": resolve_member_full_name(member),
                    "created_at": member.get("created_at"),
                    "current_balance": decimal_to_float(current_balance),
                    "current_shares": decimal_to_float(current_balance / CBU_SHARE_VALUE),
                    "is_new_member": is_new_member,
                    "starting_capital": decimal_to_float(CBU_STARTING_CAPITAL),
                }
            )

        # Show newest created members first so newly created accounts appear at the top.
        has_created_at = any(str(row.get("created_at") or "").strip() for row in mapped_members)
        if has_created_at:
            mapped_members.sort(
                key=lambda row: (
                    str(row.get("created_at") or ""),
                    str(row.get("member_name") or "").lower(),
                ),
                reverse=True,
            )
        else:
            mapped_members.sort(key=lambda row: str(row.get("member_name") or "").lower())
        return {"success": True, "data": mapped_members}
    except HTTPException as err:
        raise err
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Failed to load CBU members: {err}")


@app.get("/api/cashier/cbu/members/{member_ref}")
async def get_cashier_cbu_member(member_ref: str):
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase client is not initialized.")

    try:
        clean_ref = str(member_ref or "").strip()
        if not clean_ref:
            raise HTTPException(status_code=400, detail="member_ref is required.")

        members_payload = await get_cashier_cbu_members()
        members = members_payload.get("data") or []

        target = next(
            (
                row
                for row in members
                if str(row.get("member_uuid") or "") == clean_ref
                or str(row.get("member_id") or "") == clean_ref
            ),
            None,
        )

        if not target:
            raise HTTPException(status_code=404, detail="Member not found.")

        return {"success": True, "data": target}
    except HTTPException as err:
        raise err
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Failed to load CBU member: {err}")


@app.get("/api/cashier/cbu/transactions")
async def get_cashier_cbu_transactions():
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase client is not initialized.")

    try:
        try:
            response = (
                supabase.table("capital_build_up")
                .select("id,member_id,transaction_date,capital_added,deposit_account,cbu_deposit_id,member:member_id(first_name,middle_initial,last_name,membership_id)")
                .order("transaction_date", desc=True)
                .execute()
            )
        except Exception:
            response = (
                supabase.table("capital_build_up")
                .select("id,member_id,transaction_date,capital_added,deposit_account,member:member_id(first_name,middle_initial,last_name,membership_id)")
                .order("transaction_date", desc=True)
                .execute()
            )

        rows = response.data or []
        mapped = []
        for idx, row in enumerate(rows, start=1):
            member = row.get("member") or {}
            mapped.append(
                {
                    "cbu_deposit_id": row.get("cbu_deposit_id") or build_cbu_deposit_id(idx),
                    "member_id": member.get("membership_id") or row.get("member_id"),
                    "member_name": resolve_member_full_name(member),
                    "capital_added": decimal_to_float(row.get("capital_added") or 0),
                    "deposit_account": row.get("deposit_account") or "Cash",
                    "transaction_date": row.get("transaction_date"),
                    "status": "VERIFIED",
                }
            )

        return {"success": True, "data": mapped}
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Failed to load CBU transactions: {err}")


@app.post("/api/cashier/cbu/deposits")
async def create_cashier_cbu_deposit(payload: CashierCBUDepositRequest):
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase client is not initialized.")

    try:
        member_ref = str(payload.member_id or "").strip()
        if not member_ref:
            raise HTTPException(status_code=400, detail="member_id is required.")

        members_payload = await get_cashier_cbu_members()
        members = members_payload.get("data") or []
        member_row = next(
            (
                row
                for row in members
                if str(row.get("member_uuid") or "") == member_ref
                or str(row.get("member_id") or "") == member_ref
            ),
            None,
        )
        if not member_row:
            raise HTTPException(status_code=404, detail="Member not found.")

        member_uuid = str(member_row.get("member_uuid") or "").strip()
        if not member_uuid:
            raise HTTPException(status_code=400, detail="Member UUID is missing.")

        deposit_amount = Decimal(str(payload.deposit_amount or 0))
        if deposit_amount <= 0:
            raise HTTPException(status_code=400, detail="deposit_amount must be greater than zero.")

        latest_cbu_response = (
            supabase.table("capital_build_up")
            .select("ending_share_capital")
            .eq("member_id", member_uuid)
            .order("transaction_date", desc=True)
            .limit(1)
            .execute()
        )
        latest_cbu_row = (latest_cbu_response.data or [None])[0]

        starting_balance = Decimal(str((latest_cbu_row or {}).get("ending_share_capital") or CBU_STARTING_CAPITAL))
        if starting_balance < 0:
            starting_balance = Decimal("0")
        ending_balance = starting_balance + deposit_amount

        sequence_count_response = supabase.table("capital_build_up").select("id").execute()
        next_sequence = len(sequence_count_response.data or []) + 1

        cbu_deposit_id = build_cbu_deposit_id(next_sequence)

        # Keep IDs unique even if the frontend sends a fixed placeholder (e.g., CBUD_001).
        try:
            existing_id_response = (
                supabase.table("capital_build_up")
                .select("id")
                .eq("cbu_deposit_id", cbu_deposit_id)
                .limit(1)
                .execute()
            )
            if existing_id_response.data:
                fallback_sequence = next_sequence
                while True:
                    candidate = build_cbu_deposit_id(fallback_sequence)
                    candidate_exists = (
                        supabase.table("capital_build_up")
                        .select("id")
                        .eq("cbu_deposit_id", candidate)
                        .limit(1)
                        .execute()
                    )
                    if not candidate_exists.data:
                        cbu_deposit_id = candidate
                        break
                    fallback_sequence += 1
        except Exception:
            # If cbu_deposit_id column does not exist yet, insertion fallback handles it.
            pass

        insert_payload = {
            "member_id": member_uuid,
            "transaction_date": (payload.transaction_date or datetime.utcnow()).isoformat(),
            "starting_share_capital": decimal_to_float(starting_balance),
            "capital_added": decimal_to_float(deposit_amount),
            "deposit_account": str(payload.deposit_account or "Cash").strip() or "Cash",
            "ending_share_capital": decimal_to_float(ending_balance),
            "cbu_deposit_id": cbu_deposit_id,
        }

        inserted_row = None
        try:
            insert_response = supabase.table("capital_build_up").insert(insert_payload).execute()
            inserted_row = (insert_response.data or [None])[0]
        except Exception:
            fallback_payload = {
                "member_id": member_uuid,
                "transaction_date": insert_payload["transaction_date"],
                "starting_share_capital": insert_payload["starting_share_capital"],
                "capital_added": insert_payload["capital_added"],
                "deposit_account": insert_payload["deposit_account"],
                "ending_share_capital": insert_payload["ending_share_capital"],
            }
            insert_response = supabase.table("capital_build_up").insert(fallback_payload).execute()
            inserted_row = (insert_response.data or [None])[0]

        return {
            "success": True,
            "message": "CBU deposit recorded successfully.",
            "data": {
                "cbu_deposit_id": (inserted_row or {}).get("cbu_deposit_id") or cbu_deposit_id,
                "member_id": member_row.get("member_id"),
                "member_uuid": member_uuid,
                "member_name": member_row.get("member_name"),
                "starting_balance": decimal_to_float(starting_balance),
                "capital_added": decimal_to_float(deposit_amount),
                "ending_balance": decimal_to_float(ending_balance),
                "ending_shares": decimal_to_float(ending_balance / CBU_SHARE_VALUE),
                "transaction_date": (inserted_row or {}).get("transaction_date") or insert_payload["transaction_date"],
                "deposit_account": insert_payload["deposit_account"],
            },
        }
    except HTTPException as err:
        raise err
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Failed to create CBU deposit: {err}")


@app.post("/api/cashier/disbursements/{loan_id}/disburse")
async def disburse_cashier_loan(loan_id: str, payload: CashierDisbursementRequest):
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
        if current_status != "ready for disbursement":
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
        monthly_rate_decimal = resolve_monthly_rate_decimal(
            normalized_loan_type,
            interest_rate_percent,
            loan_type_code=resolve_loan_type_code(normalized_loan_type),
            loan_type_name=loan_type_name,
        )
        if monthly_rate_decimal <= 0:
            raise HTTPException(status_code=400, detail="Loan interest rate is not configured in loan_types.")

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

            next_due_row = build_single_schedule_row(
                loan_type=normalized_loan_type,
                principal=principal_amount,
                term_months=term_months,
                monthly_rate_decimal=monthly_rate_decimal,
                due_date=first_due_date,
                loan_id=clean_loan_id,
                installment_no=1,
                remaining_principal_before=principal_amount,
                start_sequence_number=start_sequence_number,
            )

            try:
                insert_schedule_response = supabase.table("loan_schedules").insert(next_due_row).execute()
                created_schedules = insert_schedule_response.data or []
            except Exception:
                legacy_schedule_row = {
                    "loan_id": next_due_row["loan_id"],
                    "installment_no": next_due_row["installment_no"],
                    "due_date": next_due_row["due_date"],
                    "expected_amount": next_due_row["expected_amount"],
                    "principal_component": next_due_row["principal_component"],
                    "interest_component": next_due_row["interest_component"],
                    "schedule_status": "Unpaid",
                }
                insert_schedule_response = supabase.table("loan_schedules").insert(legacy_schedule_row).execute()
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
            "message": "Loan disbursed successfully. Only the next due schedule is created.",
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
            "entered_by_role": "cashier",
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


def is_validated_payment_status(status_value: str | None) -> bool:
    normalized = str(status_value or "").strip().lower()
    return normalized in {"validated", "confirmed", "bookkeeper_confirmed", "approved"}


@app.get("/api/bookkeeper/manage-loans")
async def get_bookkeeper_manage_loans():
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase client is not initialized.")

    try:
        loans_response = (
            supabase.table("loans")
            .select(
                "control_number,loan_amount,principal_amount,interest_rate,term,loan_status,application_status,monthly_amortization,application_date," \
                "member:member_id(first_name,last_name,is_bona_fide),loan_type:loan_type_id(code,name)"
            )
            .order("application_date", desc=True)
            .execute()
        )
        loan_rows = loans_response.data or []

        visible_statuses = {
            "approved",
            "ready for disbursement",
            "to be disbursed",
            "released",
            "partially paid",
            "fully paid",
        }
        loan_rows = [
            row
            for row in loan_rows
            if str(row.get("loan_status") or "").strip().lower() in visible_statuses
        ]

        loan_ids = [str(row.get("control_number") or "").strip() for row in loan_rows if row.get("control_number")]
        if not loan_ids:
            return {
                "success": True,
                "data": {
                    "server_time": datetime.utcnow().isoformat(),
                    "counts": {"active_loans": 0, "fully_paid_loans": 0},
                    "rows": [],
                },
            }

        payments_response = (
            supabase.table("loan_payments")
            .select("id,loan_id,amount_paid,penalties,payment_date,confirmation_status,payment_reference,transaction_reference")
            .in_("loan_id", loan_ids)
            .order("payment_date")
            .execute()
        )
        payment_rows = payments_response.data or []

        schedule_rows = []
        try:
            schedule_rows = (
                supabase.table("loan_schedules")
                .select("loan_id,due_date,schedule_status")
                .in_("loan_id", loan_ids)
                .order("due_date")
                .execute()
            ).data or []
        except Exception:
            schedule_rows = []

        payments_by_loan: dict[str, list[dict]] = {}
        for payment in payment_rows:
            payments_by_loan.setdefault(str(payment.get("loan_id") or ""), []).append(payment)

        schedules_by_loan: dict[str, list[dict]] = {}
        for schedule in schedule_rows:
            schedules_by_loan.setdefault(str(schedule.get("loan_id") or ""), []).append(schedule)

        mapped_rows = []
        active_count = 0
        fully_paid_count = 0

        for row in loan_rows:
            loan_id = str(row.get("control_number") or "").strip()
            if not loan_id:
                continue

            member = row.get("member") or {}
            member_name = f"{member.get('first_name') or ''} {member.get('last_name') or ''}".strip() or "Unknown Member"
            member_type = "Member" if bool(member.get("is_bona_fide")) else "Non-Member"

            loan_type = row.get("loan_type") or {}
            loan_type_name = loan_type.get("name") or "N/A"
            loan_type_code = str(loan_type.get("code") or normalize_cashier_loan_type(loan_type_name)).upper()

            principal_amount = Decimal(str(row.get("principal_amount") or row.get("loan_amount") or 0))

            loan_payments = sorted(
                payments_by_loan.get(loan_id, []),
                key=lambda item: str(item.get("payment_date") or ""),
            )

            total_validated = Decimal("0")
            payment_history = []
            for payment in loan_payments:
                amount_paid = Decimal(str(payment.get("amount_paid") or 0))
                if is_validated_payment_status(payment.get("confirmation_status")):
                    total_validated += amount_paid
                running_remaining = max(principal_amount - total_validated, Decimal("0"))

                payment_history.append(
                    {
                        "payment_id": payment.get("payment_reference") or payment.get("id"),
                        "date_paid": payment.get("payment_date"),
                        "reference_no": payment.get("transaction_reference") or payment.get("payment_reference") or payment.get("id"),
                        "amount_paid": decimal_to_float(amount_paid),
                        "penalties": decimal_to_float(payment.get("penalties") or 0),
                        "remaining_after": decimal_to_float(running_remaining),
                        "confirmation_status": payment.get("confirmation_status") or "pending_bookkeeper",
                    }
                )

            remaining_balance = max(principal_amount - total_validated, Decimal("0"))
            if remaining_balance <= 0:
                repayment_status = "Fully Paid"
            elif total_validated > 0:
                repayment_status = "Partially Paid"
            else:
                repayment_status = "Unpaid"

            active_due = None
            for schedule in schedules_by_loan.get(loan_id, []):
                status = str(schedule.get("schedule_status") or "").strip().lower()
                if status in {"unpaid", "pending", "overdue", ""}:
                    active_due = schedule
                    break

            due_date = active_due.get("due_date") if active_due else None

            if repayment_status == "Fully Paid":
                fully_paid_count += 1
            else:
                active_count += 1

            mapped_rows.append(
                {
                    "loan_id": loan_id,
                    "member_name": member_name,
                    "member_type": member_type,
                    "loan_type": loan_type_name,
                    "loan_type_code": loan_type_code,
                    "loan_amount": decimal_to_float(principal_amount),
                    "interest_rate": decimal_to_float(row.get("interest_rate") or 0),
                    "term_months": int(row.get("term") or 0),
                    "amortization": decimal_to_float(row.get("monthly_amortization") or 0),
                    "remaining_balance": decimal_to_float(remaining_balance),
                    "due_date": due_date,
                    "status": repayment_status,
                    "source_loan_status": row.get("loan_status"),
                    "source_application_status": row.get("application_status"),
                    "payment_history": payment_history,
                }
            )

        return {
            "success": True,
            "data": {
                "server_time": datetime.utcnow().isoformat(),
                "counts": {"active_loans": active_count, "fully_paid_loans": fully_paid_count},
                "rows": mapped_rows,
            },
        }
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Failed to load manage loans data: {err}")


@app.get("/api/bookkeeper/loan-ledger/{loan_id}")
async def get_bookkeeper_loan_ledger(loan_id: str):
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase client is not initialized.")

    clean_loan_id = str(loan_id or "").strip()
    if not clean_loan_id:
        raise HTTPException(status_code=400, detail="loan_id is required.")

    payload = await get_bookkeeper_manage_loans()
    rows = (payload.get("data") or {}).get("rows") or []
    target = next((item for item in rows if str(item.get("loan_id") or "") == clean_loan_id), None)

    if not target:
        raise HTTPException(status_code=404, detail="Loan ledger not found.")

    return {"success": True, "data": target}


@app.get("/api/member/lifecycle/{member_id}")
async def get_member_lifecycle(member_id: str):
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase client is not initialized.")

    try:
        clean_member_id = str(member_id or "").strip()
        if not clean_member_id:
            raise HTTPException(status_code=400, detail="member_id is required.")

        member_response = (
            supabase.table("member")
            .select("*")
            .eq("id", clean_member_id)
            .limit(1)
            .execute()
        )
        member_row = (member_response.data or [None])[0]
        if not member_row:
            raise HTTPException(status_code=404, detail="Member not found.")

        account_email = ""
        for account_table in ["member_account", "member_accounts"]:
            try:
                account_response = (
                    supabase.table(account_table)
                    .select("email")
                    .eq("user_id", clean_member_id)
                    .limit(1)
                    .execute()
                )
                account_row = (account_response.data or [None])[0]
                if account_row and account_row.get("email"):
                    account_email = str(account_row.get("email") or "").strip()
                    break
            except Exception:
                continue

        application_row = None
        membership_id = str(member_row.get("membership_id") or "").strip()
        if membership_id:
            try:
                app_by_membership = (
                    supabase.table("member_applications")
                    .select("*")
                    .eq("membership_id", membership_id)
                    .order("created_at", desc=True)
                    .limit(1)
                    .execute()
                )
                application_row = (app_by_membership.data or [None])[0]
            except Exception:
                application_row = None

        if not application_row and account_email:
            try:
                app_by_email = (
                    supabase.table("member_applications")
                    .select("*")
                    .ilike("email", account_email)
                    .order("created_at", desc=True)
                    .limit(1)
                    .execute()
                )
                application_row = (app_by_email.data or [None])[0]
            except Exception:
                application_row = None

        full_name = " ".join(
            part for part in [
                application_row.get("first_name") if application_row else None,
                application_row.get("middle_name") if application_row else None,
                (application_row.get("surname") if application_row else None)
                or (application_row.get("last_name") if application_row else None)
                or member_row.get("last_name"),
            ] if part
        ).strip()

        profile_payload = {
            "full_name": full_name or "N/A",
            "member_id": member_row.get("membership_id") or "N/A",
            "email": (application_row.get("email") if application_row else None) or account_email or "N/A",
            "mobile": (application_row.get("contact_number") if application_row else None) or "N/A",
            "civil_status": (application_row.get("civil_status") if application_row else None) or "N/A",
            "gender": (application_row.get("gender") if application_row else None) or "N/A",
            "employer": (application_row.get("employer_name") if application_row else None) or "N/A",
            "position": (application_row.get("position") if application_row else None) or (application_row.get("occupation") if application_row else None) or "N/A",
            "salary_grade": (application_row.get("salary_grade") if application_row else None) or "N/A",
            "address": (application_row.get("permanent_address") if application_row else None) or "N/A",
        }

        loans_response = (
            supabase.table("loans")
            .select(
                "control_number,loan_amount,principal_amount,interest_rate,monthly_amortization,term,loan_status,application_status,application_date,disbursal_date," \
                "loan_type:loan_type_id(name)"
            )
            .eq("member_id", clean_member_id)
            .order("application_date", desc=True)
            .execute()
        )
        loan_rows = loans_response.data or []

        loan_ids = [str(row.get("control_number") or "").strip() for row in loan_rows if row.get("control_number")]

        schedules_by_loan: dict[str, list[dict]] = {}
        if loan_ids:
            try:
                schedules_response = (
                    supabase.table("loan_schedules")
                    .select("id,schedule_id,loan_id,installment_no,due_date,expected_amount,expected_principal,expected_interest,principal_component,interest_component,schedule_status")
                    .in_("loan_id", loan_ids)
                    .order("due_date")
                    .execute()
                )
                for row in schedules_response.data or []:
                    schedules_by_loan.setdefault(str(row.get("loan_id") or ""), []).append(row)
            except Exception:
                schedules_by_loan = {}

        payment_rows = []
        if loan_ids:
            payments_response = (
                supabase.table("loan_payments")
                .select("id,payment_reference,loan_id,schedule_id,amount_paid,penalties,payment_date,confirmation_status,transaction_reference")
                .in_("loan_id", loan_ids)
                .order("payment_date", desc=True)
                .execute()
            )
            payment_rows = payments_response.data or []

        mapped_loans = []
        for row in loan_rows:
            loan_id = str(row.get("control_number") or "").strip()
            if not loan_id:
                continue

            ordered_schedules = sorted(
                schedules_by_loan.get(loan_id, []),
                key=lambda sched: str(sched.get("due_date") or ""),
            )

            mapped_schedules = [
                {
                    "schedule_id": sched.get("schedule_id") or sched.get("id"),
                    "installment_no": int(sched.get("installment_no") or 0),
                    "due_date": sched.get("due_date"),
                    "expected_amount": decimal_to_float(sched.get("expected_amount") or 0),
                    "expected_principal": decimal_to_float(sched.get("expected_principal") or sched.get("principal_component") or 0),
                    "expected_interest": decimal_to_float(sched.get("expected_interest") or sched.get("interest_component") or 0),
                    "schedule_status": sched.get("schedule_status") or "unpaid",
                }
                for sched in ordered_schedules
            ]

            next_due_schedule = next(
                (
                    sched
                    for sched in mapped_schedules
                    if str(sched.get("schedule_status") or "").strip().lower() in {"unpaid", "pending", "overdue", ""}
                ),
                None,
            )

            mapped_loans.append(
                {
                    "loan_id": loan_id,
                    "loan_type": (row.get("loan_type") or {}).get("name") or "N/A",
                    "principal": decimal_to_float(row.get("principal_amount") or row.get("loan_amount") or 0),
                    "monthly_amortization": decimal_to_float(row.get("monthly_amortization") or 0),
                    "term": int(row.get("term") or 0),
                    "loan_status": row.get("loan_status") or "N/A",
                    "application_status": row.get("application_status") or "N/A",
                    "application_date": row.get("application_date"),
                    "disbursal_date": row.get("disbursal_date"),
                    "schedules": mapped_schedules,
                    "next_due_schedule": next_due_schedule,
                }
            )

        mapped_payments = [
            {
                "payment_id": row.get("payment_reference") or row.get("id"),
                "loan_id": row.get("loan_id"),
                "schedule_id": row.get("schedule_id"),
                "reference_no": row.get("transaction_reference") or row.get("payment_reference") or row.get("id"),
                "amount_paid": decimal_to_float(row.get("amount_paid") or 0),
                "penalties": decimal_to_float(row.get("penalties") or 0),
                "payment_date": row.get("payment_date"),
                "confirmation_status": row.get("confirmation_status") or "pending_bookkeeper",
            }
            for row in payment_rows
        ]

        return {
            "success": True,
            "data": {
                "server_time": datetime.utcnow().isoformat(),
                "profile": profile_payload,
                "loans": mapped_loans,
                "payments": mapped_payments,
            },
        }
    except HTTPException as err:
        raise err
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Failed to fetch member lifecycle: {err}")


@app.get("/api/secretary/membership-records")
async def get_secretary_membership_records():
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase client is not initialized.")

    try:
        members_response = (
            supabase.table("member")
            .select("*")
            .order("created_at", desc=True)
            .execute()
        )
        member_rows = members_response.data or []

        cbu_response = (
            supabase.table("capital_build_up")
            .select("member_id,transaction_date,ending_share_capital")
            .order("transaction_date", desc=True)
            .execute()
        )
        cbu_rows = cbu_response.data or []

        latest_cbu_by_member: dict[str, dict] = {}
        for cbu in cbu_rows:
            member_id = str(cbu.get("member_id") or "").strip()
            if member_id and member_id not in latest_cbu_by_member:
                latest_cbu_by_member[member_id] = cbu

        records = []
        seen_membership_numbers: set[str] = set()
        for row in member_rows:
            member_uuid = str(row.get("id") or "").strip()
            if not member_uuid:
                continue

            full_name = resolve_member_full_name(row)
            membership_number = row.get("membership_id") or member_uuid
            joined_value = row.get("membership_date") or row.get("created_at")

            cbu_row = latest_cbu_by_member.get(member_uuid)
            ending_capital = Decimal(str((cbu_row or {}).get("ending_share_capital") or 0))

            amount_value = row.get("share_capital_amount")
            if amount_value is None:
                amount_value = ending_capital

            shares_value = row.get("number_of_shares")
            if shares_value is None:
                shares_value = (Decimal(str(amount_value or 0)) / CBU_SHARE_VALUE) if amount_value else Decimal("0")

            paid_up_value = row.get("initial_paid_up_capital")
            if paid_up_value is None:
                paid_up_value = amount_value or Decimal("0")

            records.append(
                {
                    "member_uuid": member_uuid,
                    "applicant_id": membership_number,
                    "applicant_name": full_name,
                    "date_joined": joined_value,
                    "shares": decimal_to_float(shares_value),
                    "paid_up_capital": decimal_to_float(paid_up_value),
                    "editable": True,
                    "edit_scope": "member",
                }
            )
            seen_membership_numbers.add(str(membership_number or "").strip())

        # Include personal_data_sheet records not yet present in member table.
        try:
            pds_rows = (
                supabase.table("personal_data_sheet")
                .select("*")
                .order("created_at", desc=True)
                .execute()
            ).data or []
        except Exception:
            pds_rows = (
                supabase.table("personal_data_sheet")
                .select("*")
                .execute()
            ).data or []

        for pds in pds_rows:
            membership_number = str(pds.get("membership_number_id") or "").strip()
            if not membership_number or membership_number in seen_membership_numbers:
                continue

            full_name = " ".join(
                part
                for part in [
                    str(pds.get("first_name") or "").strip(),
                    str(pds.get("middle_name") or "").strip(),
                    str(pds.get("surname") or "").strip(),
                ]
                if part
            ) or "Unknown Member"

            records.append(
                {
                    "member_uuid": membership_number,
                    "applicant_id": membership_number,
                    "applicant_name": full_name,
                    "date_joined": pds.get("date_of_membership") or pds.get("created_at") or "",
                    "shares": decimal_to_float(pds.get("number_of_shares") or 0),
                    "paid_up_capital": decimal_to_float(pds.get("initial_paid_up_capital") or pds.get("amount") or 0),
                    "editable": True,
                    "edit_scope": "personal_data_sheet",
                }
            )

        return {"success": True, "data": records}
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Failed to load secretary membership records: {err}")


@app.get("/api/personal_data_sheet")
async def get_personal_datasheet_records():
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase client is not initialized.")

    try:
        rows = []
        try:
            response = (
                supabase.table("personal_data_sheet")
                .select("*")
                .order("created_at", desc=True)
                .execute()
            )
            rows = response.data or []
        except Exception:
            response = (
                supabase.table("personal_data_sheet")
                .select("*")
                .execute()
            )
            rows = response.data or []

        membership_ids = sorted(
            {
                str(row.get("membership_number_id") or "").strip()
                for row in rows
                if str(row.get("membership_number_id") or "").strip()
            }
        )

        email_by_membership: dict[str, str] = {}
        if membership_ids:
            try:
                apps_response = (
                    supabase.table("member_applications")
                    .select("membership_id,email,created_at")
                    .in_("membership_id", membership_ids)
                    .order("created_at", desc=True)
                    .execute()
                )
                for app_row in apps_response.data or []:
                    membership_id = str(app_row.get("membership_id") or "").strip()
                    email_value = str(app_row.get("email") or "").strip()
                    if membership_id and email_value and membership_id not in email_by_membership:
                        email_by_membership[membership_id] = email_value
            except Exception:
                email_by_membership = {}

        normalized = []
        for idx, row in enumerate(rows, start=1):
            first = row.get("first_name") or ""
            middle = row.get("middle_name") or row.get("middle_initial") or ""
            last = row.get("last_name") or row.get("surname") or ""
            full_name = " ".join(part for part in [str(first).strip(), str(middle).strip(), str(last).strip()] if part)

            membership_id = str(row.get("membership_number_id") or "").strip()
            email_value = str(row.get("email") or "").strip() or email_by_membership.get(membership_id, "")
            contact_number = row.get("contact_number") or row.get("mobile_number") or ""
            address_value = row.get("permanent_address") or row.get("address") or ""

            normalized.append(
                {
                    "id": row.get("personal_data_sheet_id") or row.get("id") or idx,
                    "member_id": membership_id,
                    "full_name": full_name,
                    "email": email_value,
                    "contact_number": contact_number,
                    "address": address_value,
                    "permanent_address": row.get("permanent_address") or "",
                    "created_at": row.get("created_at"),
                    "raw": row,
                }
            )

        return {"success": True, "data": normalized}
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Failed to load personal datasheet records: {err}")


@app.get("/api/personal_data_sheet/{membership_number_id}")
async def get_personal_datasheet_record_by_membership(membership_number_id: str):
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase client is not initialized.")

    try:
        clean_membership_id = str(membership_number_id or "").strip()
        if not clean_membership_id:
            raise HTTPException(status_code=400, detail="membership_number_id is required.")

        response = (
            supabase.table("personal_data_sheet")
            .select("*")
            .eq("membership_number_id", clean_membership_id)
            .limit(1)
            .execute()
        )

        row = (response.data or [None])[0]
        if not row:
            raise HTTPException(status_code=404, detail="Personal data sheet record not found.")

        try:
            app_response = (
                supabase.table("member_applications")
                .select("membership_id,email")
                .eq("membership_id", clean_membership_id)
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )
            app_row = (app_response.data or [None])[0]
            if app_row and not str(row.get("email") or "").strip():
                row["email"] = str(app_row.get("email") or "").strip()
        except Exception:
            pass

        return {"success": True, "data": row}
    except HTTPException as err:
        raise err
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Failed to load personal data sheet details: {err}")


@app.post("/api/savings/transactions")
async def create_savings_transaction(payload: SavingsTransactionCreateRequest):
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase client is not initialized.")

    try:
        membership_number_id = str(payload.membership_number_id or "").strip()
        if not membership_number_id:
            raise HTTPException(status_code=400, detail="membership_number_id is required.")

        pds_response = (
            supabase.table("personal_data_sheet")
            .select("membership_number_id")
            .eq("membership_number_id", membership_number_id)
            .limit(1)
            .execute()
        )
        if not (pds_response.data or []):
            raise HTTPException(status_code=404, detail="Member not found in personal_data_sheet.")

        savings_id = get_next_savings_id()
        opening_savings_amount = payload.savings_amount
        amount_value = payload.amount if payload.amount is not None else opening_savings_amount
        balance_value = payload.balance if payload.balance is not None else opening_savings_amount

        insert_payload = {
            "Savings_ID": savings_id,
            "membership_number_id": membership_number_id,
            "Account_Number": savings_id,
            "Savings_Amount": opening_savings_amount,
            "Amount": amount_value,
            "Balance": balance_value,
            "Account_Name": payload.account_name,
            "Adult dependents": payload.adult_dependents,
            "Child dependents": payload.child_dependents,
            "Nominee_Full_Name": payload.nominee_full_name,
            "Nominee_Relationship": payload.nominee_relationship,
            "Nominee Date of Birth": payload.nominee_date_of_birth,
            "Nominee_Age": payload.nominee_age,
            "Nominee_Address": payload.nominee_address,
        }

        response = (
            supabase.table("Savings_Transactions")
            .insert(insert_payload)
            .execute()
        )

        created_row = (response.data or [None])[0] if response else None

        return {
            "success": True,
            "data": {
                "Savings_ID": savings_id,
                "Account_Number": savings_id,
                "record": created_row or insert_payload,
            },
        }
    except HTTPException as err:
        raise err
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Failed to create savings transaction: {err}")


@app.get("/api/cashier/savings/accounts")
async def get_cashier_savings_accounts():
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase client is not initialized.")

    try:
        response = (
            supabase.table("Savings_Transactions")
            .select("*")
            .order("created_at", desc=True)
            .execute()
        )
        rows = response.data or []

        membership_ids = sorted(
            {
                str(row.get("membership_number_id") or "").strip()
                for row in rows
                if str(row.get("membership_number_id") or "").strip()
            }
        )

        pds_by_membership: dict[str, dict] = {}
        if membership_ids:
            try:
                pds_response = (
                    supabase.table("personal_data_sheet")
                    .select("membership_number_id,first_name,middle_name,surname,last_name")
                    .in_("membership_number_id", membership_ids)
                    .order("created_at", desc=True)
                    .execute()
                )
                for pds_row in pds_response.data or []:
                    membership_key = str(pds_row.get("membership_number_id") or "").strip()
                    if membership_key and membership_key not in pds_by_membership:
                        pds_by_membership[membership_key] = pds_row
            except Exception:
                pds_by_membership = {}

        normalized = []
        for row in rows:
            membership_key = str(row.get("membership_number_id") or "").strip()
            pds_row = pds_by_membership.get(membership_key, {})

            first_name = str(pds_row.get("first_name") or "").strip()
            middle_name = str(pds_row.get("middle_name") or "").strip()
            last_name = str(pds_row.get("surname") or pds_row.get("last_name") or "").strip()
            fallback_name = " ".join(part for part in [first_name, middle_name, last_name] if part).strip()

            normalized.append(
                {
                    "id": str(row.get("Savings_ID") or "").strip(),
                    "membership_number_id": membership_key,
                    "account_number": str(row.get("Account_Number") or "").strip(),
                    "member_name": str(row.get("Account_Name") or "").strip() or fallback_name or "Unknown Member",
                    "amount": (
                        row.get("Balance")
                        if row.get("Balance") is not None
                        else (row.get("Savings_Amount") if row.get("Savings_Amount") is not None else row.get("Amount"))
                    ),
                    "balance": row.get("Balance"),
                    "date_opened": row.get("created_at"),
                    "status": "ACTIVE",
                }
            )

        return {"success": True, "data": normalized}
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Failed to load savings accounts: {err}")


@app.get("/api/cashier/savings/accounts/{savings_id}")
async def get_cashier_savings_account_details(savings_id: str):
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase client is not initialized.")

    try:
        clean_savings_id = str(savings_id or "").strip()
        if not clean_savings_id:
            raise HTTPException(status_code=400, detail="savings_id is required.")

        account_response = (
            supabase.table("Savings_Transactions")
            .select("*")
            .eq("Savings_ID", clean_savings_id)
            .limit(1)
            .execute()
        )
        account_row = (account_response.data or [None])[0]
        if not account_row:
            raise HTTPException(status_code=404, detail="Savings account not found.")

        membership_key = str(account_row.get("membership_number_id") or "").strip()
        member_name = str(account_row.get("Account_Name") or "").strip()

        if not member_name and membership_key:
            try:
                pds_response = (
                    supabase.table("personal_data_sheet")
                    .select("first_name,middle_name,surname,last_name")
                    .eq("membership_number_id", membership_key)
                    .order("created_at", desc=True)
                    .limit(1)
                    .execute()
                )
                pds_row = (pds_response.data or [None])[0] or {}
                first_name = str(pds_row.get("first_name") or "").strip()
                middle_name = str(pds_row.get("middle_name") or "").strip()
                last_name = str(pds_row.get("surname") or pds_row.get("last_name") or "").strip()
                member_name = " ".join(part for part in [first_name, middle_name, last_name] if part).strip()
            except Exception:
                pass

        amount_value = (
            account_row.get("Balance")
            if account_row.get("Balance") is not None
            else (
                account_row.get("Savings_Amount")
                if account_row.get("Savings_Amount") is not None
                else account_row.get("Amount")
            )
        )
        opening_deposit = account_row.get("Savings_Amount")
        created_at = account_row.get("created_at")

        return {
            "success": True,
            "data": {
                "id": clean_savings_id,
                "membership_number_id": membership_key,
                "account_number": str(account_row.get("Account_Number") or clean_savings_id).strip(),
                "member_name": member_name or "Unknown Member",
                "savings_type": "Regular Savings",
                "date_opened": created_at,
                "total_amount": amount_value,
                "previous_deposit": opening_deposit,
                "previous_date": created_at,
                "deposits": [
                    {
                        "label": "Account Opening Deposit",
                        "amount": opening_deposit,
                        "date": created_at,
                    }
                ] if opening_deposit is not None else [],
            },
        }
    except HTTPException as err:
        raise err
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Failed to load savings account details: {err}")


@app.post("/api/cashier/savings/accounts/{savings_id}/deposit")
async def post_cashier_savings_deposit(savings_id: str, payload: CashierSavingsDepositRequest):
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase client is not initialized.")

    try:
        clean_savings_id = str(savings_id or "").strip()
        if not clean_savings_id:
            raise HTTPException(status_code=400, detail="savings_id is required.")

        account_response = (
            supabase.table("Savings_Transactions")
            .select("Savings_ID,membership_number_id,Account_Name")
            .eq("Savings_ID", clean_savings_id)
            .limit(1)
            .execute()
        )
        account_row = (account_response.data or [None])[0]
        if not account_row:
            raise HTTPException(status_code=404, detail="Savings account not found.")

        membership_key = str(account_row.get("membership_number_id") or "").strip()
        if membership_key:
            try:
                member_response = (
                    supabase.table("member")
                    .select("membership_id,is_bona_fide")
                    .eq("membership_id", membership_key)
                    .limit(1)
                    .execute()
                )
                member_row = (member_response.data or [None])[0]
                if member_row and member_row.get("is_bona_fide") is False:
                    raise HTTPException(status_code=400, detail="Member is not bonafide and cannot transact.")
            except HTTPException as err:
                raise err
            except Exception:
                pass

        transaction_id = get_next_savings_cashier_transaction_id()
        queue_payload = {
            "transaction_id": transaction_id,
            "savings_id": clean_savings_id,
            "membership_number_id": membership_key,
            "member_name": str(account_row.get("Account_Name") or "").strip() or None,
            "account_type": "Savings Deposit",
            "transaction_type": "deposit",
            "amount": decimal_to_float(money(Decimal(str(payload.amount)))),
            "transaction_status": "pending_verification",
            "entered_by_role": "cashier",
            "requested_at": datetime.utcnow().isoformat(),
        }

        queue_response = (
            supabase.table("savings_transaction_queue")
            .insert(queue_payload)
            .execute()
        )
        queued_row = (queue_response.data or [None])[0]

        return {
            "success": True,
            "data": {
                "transaction_id": transaction_id,
                "savings_id": clean_savings_id,
                "amount_deposited": decimal_to_float(money(Decimal(str(payload.amount)))),
                "transaction_status": "pending_verification",
                "record": queued_row,
            },
            "message": "Deposit submitted and is pending Bookkeeper verification.",
        }
    except HTTPException as err:
        raise err
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Failed to post savings deposit: {err}")


@app.post("/api/cashier/savings/accounts/{savings_id}/withdraw")
async def post_cashier_savings_withdrawal(savings_id: str, payload: CashierSavingsWithdrawRequest):
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase client is not initialized.")

    try:
        clean_savings_id = str(savings_id or "").strip()
        if not clean_savings_id:
            raise HTTPException(status_code=400, detail="savings_id is required.")

        account_response = (
            supabase.table("Savings_Transactions")
            .select("Savings_ID,membership_number_id,Account_Name")
            .eq("Savings_ID", clean_savings_id)
            .limit(1)
            .execute()
        )
        account_row = (account_response.data or [None])[0]
        if not account_row:
            raise HTTPException(status_code=404, detail="Savings account not found.")

        transaction_id = get_next_savings_cashier_transaction_id()
        queue_payload = {
            "transaction_id": transaction_id,
            "savings_id": clean_savings_id,
            "membership_number_id": str(account_row.get("membership_number_id") or "").strip() or None,
            "member_name": str(account_row.get("Account_Name") or "").strip() or None,
            "account_type": "Savings Withdrawal",
            "transaction_type": "withdraw",
            "amount": decimal_to_float(money(Decimal(str(payload.amount)))),
            "transaction_status": "pending_verification",
            "entered_by_role": "cashier",
            "requested_at": datetime.utcnow().isoformat(),
        }

        queue_response = (
            supabase.table("savings_transaction_queue")
            .insert(queue_payload)
            .execute()
        )
        queued_row = (queue_response.data or [None])[0]

        return {
            "success": True,
            "data": {
                "transaction_id": transaction_id,
                "savings_id": clean_savings_id,
                "amount_withdrawn": decimal_to_float(money(Decimal(str(payload.amount)))),
                "transaction_status": "pending_verification",
                "record": queued_row,
            },
            "message": "Withdrawal submitted and is pending Bookkeeper verification.",
        }
    except HTTPException as err:
        raise err
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Failed to post savings withdrawal: {err}")


@app.get("/api/bookkeeper/savings-transactions")
async def get_bookkeeper_savings_transactions():
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase client is not initialized.")

    try:
        queue_response = (
            supabase.table("savings_transaction_queue")
            .select("*")
            .order("requested_at", desc=True)
            .execute()
        )
        queue_rows = queue_response.data or []

        membership_ids = sorted(
            {
                str(row.get("membership_number_id") or "").strip()
                for row in queue_rows
                if str(row.get("membership_number_id") or "").strip()
            }
        )

        pds_by_membership: dict[str, dict] = {}
        if membership_ids:
            try:
                pds_response = (
                    supabase.table("personal_data_sheet")
                    .select("membership_number_id,first_name,middle_name,surname,last_name")
                    .in_("membership_number_id", membership_ids)
                    .order("created_at", desc=True)
                    .execute()
                )
                for pds_row in pds_response.data or []:
                    membership_key = str(pds_row.get("membership_number_id") or "").strip()
                    if membership_key and membership_key not in pds_by_membership:
                        pds_by_membership[membership_key] = pds_row
            except Exception:
                pds_by_membership = {}

        normalized = []
        for row in queue_rows:
            membership_key = str(row.get("membership_number_id") or "").strip()
            pds_row = pds_by_membership.get(membership_key, {})
            member_name = str(row.get("member_name") or "").strip()
            if not member_name:
                first_name = str(pds_row.get("first_name") or "").strip()
                middle_name = str(pds_row.get("middle_name") or "").strip()
                last_name = str(pds_row.get("surname") or pds_row.get("last_name") or "").strip()
                member_name = " ".join(part for part in [first_name, middle_name, last_name] if part).strip() or "Unknown Member"

            normalized.append(
                {
                    "transaction_id": str(row.get("transaction_id") or "").strip(),
                    "savings_id": str(row.get("savings_id") or "").strip(),
                    "membership_number_id": membership_key,
                    "member_name": member_name,
                    "account_type": str(row.get("account_type") or "Savings").strip(),
                    "transaction_type": str(row.get("transaction_type") or "deposit").strip().lower(),
                    "amount": decimal_to_float(row.get("amount") or 0),
                    "transaction_status": str(row.get("transaction_status") or "pending_verification").strip().lower(),
                    "requested_at": row.get("requested_at"),
                    "verified_at": row.get("verified_at"),
                    "verified_by": row.get("verified_by"),
                    "notes": row.get("notes"),
                }
            )

        return {"success": True, "data": normalized}
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Failed to load savings transaction queue: {err}")


@app.post("/api/bookkeeper/savings-transactions/{transaction_id}/confirm")
async def confirm_bookkeeper_savings_transaction(transaction_id: str, payload: BookkeeperPaymentDecisionRequest):
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase client is not initialized.")

    try:
        clean_transaction_id = str(transaction_id or "").strip()
        if not clean_transaction_id:
            raise HTTPException(status_code=400, detail="transaction_id is required.")

        queue_response = (
            supabase.table("savings_transaction_queue")
            .select("*")
            .eq("transaction_id", clean_transaction_id)
            .limit(1)
            .execute()
        )
        queue_row = (queue_response.data or [None])[0]
        if not queue_row:
            raise HTTPException(status_code=404, detail="Savings transaction not found.")

        current_status = str(queue_row.get("transaction_status") or "pending_verification").strip().lower()
        if current_status != "pending_verification":
            raise HTTPException(status_code=400, detail="Only pending transactions can be confirmed.")

        savings_id = str(queue_row.get("savings_id") or "").strip()
        if not savings_id:
            raise HTTPException(status_code=400, detail="savings_id is missing on transaction queue.")

        savings_response = (
            supabase.table("Savings_Transactions")
            .select("Savings_ID,Balance,Savings_Amount,Amount")
            .eq("Savings_ID", savings_id)
            .limit(1)
            .execute()
        )
        savings_row = (savings_response.data or [None])[0]
        if not savings_row:
            raise HTTPException(status_code=404, detail="Savings account not found.")

        current_balance = Decimal(
            str(
                savings_row.get("Balance")
                if savings_row.get("Balance") is not None
                else (
                    savings_row.get("Savings_Amount")
                    if savings_row.get("Savings_Amount") is not None
                    else savings_row.get("Amount") or 0
                )
            )
        )

        transaction_amount = money(Decimal(str(queue_row.get("amount") or 0)))
        if transaction_amount <= 0:
            raise HTTPException(status_code=400, detail="Invalid transaction amount.")

        transaction_type = str(queue_row.get("transaction_type") or "deposit").strip().lower()
        if transaction_type == "withdraw":
            if transaction_amount > current_balance:
                raise HTTPException(status_code=400, detail="Insufficient balance for this withdrawal.")
            new_balance = money(current_balance - transaction_amount)
            ledger_entry_type = "debit"
        else:
            new_balance = money(current_balance + transaction_amount)
            ledger_entry_type = "credit"

        db_balance_value = int(new_balance.to_integral_value(rounding=ROUND_HALF_UP))
        (
            supabase.table("Savings_Transactions")
            .update({"Balance": db_balance_value, "Amount": db_balance_value})
            .eq("Savings_ID", savings_id)
            .execute()
        )

        verified_at_value = datetime.utcnow().isoformat()
        queue_update_payload = {
            "transaction_status": "validated",
            "verified_at": verified_at_value,
            "verified_by": payload.validated_by,
            "notes": payload.notes,
            "posted_at": verified_at_value,
        }
        (
            supabase.table("savings_transaction_queue")
            .update(queue_update_payload)
            .eq("transaction_id", clean_transaction_id)
            .execute()
        )

        ledger_payload = {
            "transaction_id": clean_transaction_id,
            "ledger_source": "Savings_Transactions",
            "source_id": savings_id,
            "membership_number_id": queue_row.get("membership_number_id"),
            "account_type": queue_row.get("account_type") or "Savings",
            "entry_type": ledger_entry_type,
            "amount": decimal_to_float(transaction_amount),
            "running_balance": decimal_to_float(new_balance),
            "posted_at": verified_at_value,
            "posted_by": payload.validated_by,
            "remarks": payload.notes,
        }
        try:
            (
                supabase.table("ledger_transactions")
                .insert(ledger_payload)
                .execute()
            )
        except Exception:
            pass

        return {
            "success": True,
            "message": "Savings transaction confirmed and posted.",
            "data": {
                "transaction_id": clean_transaction_id,
                "savings_id": savings_id,
                "transaction_type": transaction_type,
                "posted_amount": decimal_to_float(transaction_amount),
                "new_balance": decimal_to_float(new_balance),
            },
        }
    except HTTPException as err:
        raise err
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Failed to confirm savings transaction: {err}")


@app.post("/api/bookkeeper/savings-transactions/{transaction_id}/reject")
async def reject_bookkeeper_savings_transaction(transaction_id: str, payload: BookkeeperPaymentDecisionRequest):
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase client is not initialized.")

    try:
        clean_transaction_id = str(transaction_id or "").strip()
        if not clean_transaction_id:
            raise HTTPException(status_code=400, detail="transaction_id is required.")

        queue_response = (
            supabase.table("savings_transaction_queue")
            .select("transaction_id,transaction_status")
            .eq("transaction_id", clean_transaction_id)
            .limit(1)
            .execute()
        )
        queue_row = (queue_response.data or [None])[0]
        if not queue_row:
            raise HTTPException(status_code=404, detail="Savings transaction not found.")

        current_status = str(queue_row.get("transaction_status") or "pending_verification").strip().lower()
        if current_status != "pending_verification":
            raise HTTPException(status_code=400, detail="Only pending transactions can be rejected.")

        update_payload = {
            "transaction_status": "rejected",
            "verified_at": datetime.utcnow().isoformat(),
            "verified_by": payload.validated_by,
            "notes": payload.notes,
        }
        (
            supabase.table("savings_transaction_queue")
            .update(update_payload)
            .eq("transaction_id", clean_transaction_id)
            .execute()
        )

        return {
            "success": True,
            "message": "Savings transaction rejected.",
            "data": {"transaction_id": clean_transaction_id},
        }
    except HTTPException as err:
        raise err
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Failed to reject savings transaction: {err}")


@app.get("/api/cashier/withdrawals/transactions")
async def get_cashier_validated_withdrawal_transactions():
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase client is not initialized.")

    try:
        response = (
            supabase.table("savings_transaction_queue")
            .select("transaction_id,savings_id,membership_number_id,member_name,account_type,transaction_type,amount,transaction_status,requested_at,verified_at,posted_at,notes")
            .eq("transaction_type", "withdraw")
            .eq("transaction_status", "validated")
            .order("posted_at", desc=True)
            .execute()
        )
        rows = response.data or []

        membership_ids = sorted(
            {
                str(row.get("membership_number_id") or "").strip()
                for row in rows
                if str(row.get("membership_number_id") or "").strip()
            }
        )

        pds_by_membership: dict[str, dict] = {}
        if membership_ids:
            try:
                pds_response = (
                    supabase.table("personal_data_sheet")
                    .select("membership_number_id,first_name,middle_name,surname,last_name")
                    .in_("membership_number_id", membership_ids)
                    .order("created_at", desc=True)
                    .execute()
                )
                for pds_row in pds_response.data or []:
                    membership_key = str(pds_row.get("membership_number_id") or "").strip()
                    if membership_key and membership_key not in pds_by_membership:
                        pds_by_membership[membership_key] = pds_row
            except Exception:
                pds_by_membership = {}

        normalized = []
        for row in rows:
            membership_key = str(row.get("membership_number_id") or "").strip()
            member_name = str(row.get("member_name") or "").strip()
            if not member_name:
                pds_row = pds_by_membership.get(membership_key, {})
                first_name = str(pds_row.get("first_name") or "").strip()
                middle_name = str(pds_row.get("middle_name") or "").strip()
                last_name = str(pds_row.get("surname") or pds_row.get("last_name") or "").strip()
                member_name = " ".join(part for part in [first_name, middle_name, last_name] if part).strip() or "Unknown Member"

            normalized.append(
                {
                    "transaction_id": str(row.get("transaction_id") or "").strip(),
                    "savings_id": str(row.get("savings_id") or "").strip(),
                    "membership_number_id": membership_key,
                    "member_name": member_name,
                    "account_type": str(row.get("account_type") or "Savings Withdrawal").strip(),
                    "amount": decimal_to_float(row.get("amount") or 0),
                    "status": "VALIDATED",
                    "date_posted": row.get("posted_at") or row.get("verified_at") or row.get("requested_at"),
                    "notes": row.get("notes"),
                }
            )

        return {"success": True, "data": normalized}
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Failed to load cashier withdrawal transactions: {err}")


@app.get("/api/secretary/membership-records/{member_ref}")
async def get_secretary_membership_record_details(member_ref: str):
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase client is not initialized.")

    try:
        member_row = resolve_member_by_ref(member_ref)
        pds_row = resolve_personal_data_sheet_by_ref(member_ref)

        if not member_row and not pds_row:
            raise HTTPException(status_code=403, detail="Applicant-only records cannot be edited. Record must exist in member or personal_data_sheet.")

        member_uuid = str((member_row or {}).get("id") or "").strip()
        membership_number = (
            (member_row or {}).get("membership_id")
            or (pds_row or {}).get("membership_number_id")
            or member_uuid
        )

        latest_application = None
        if membership_number:
            application_response = (
                supabase.table("member_applications")
                .select("*")
                .eq("membership_id", membership_number)
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )
            latest_application = (application_response.data or [None])[0]

        latest_cbu = None
        if member_uuid:
            latest_cbu_response = (
                supabase.table("capital_build_up")
                .select("ending_share_capital")
                .eq("member_id", member_uuid)
                .order("transaction_date", desc=True)
                .limit(1)
                .execute()
            )
            latest_cbu = (latest_cbu_response.data or [None])[0]

        amount_value = (member_row or {}).get("share_capital_amount")
        if amount_value is None:
            amount_value = (pds_row or {}).get("amount")
        if amount_value is None:
            amount_value = (latest_cbu or {}).get("ending_share_capital") or 0

        shares_value = (member_row or {}).get("number_of_shares")
        if shares_value is None:
            shares_value = (pds_row or {}).get("number_of_shares")
        if shares_value is None:
            amount_decimal = Decimal(str(amount_value or 0))
            shares_value = amount_decimal / CBU_SHARE_VALUE if amount_decimal > 0 else Decimal("0")

        paid_up_value = (member_row or {}).get("initial_paid_up_capital")
        if paid_up_value is None:
            paid_up_value = (pds_row or {}).get("initial_paid_up_capital")
        if paid_up_value is None:
            paid_up_value = amount_value or 0

        full_name = resolve_member_full_name(member_row) if member_row else " ".join(
            part
            for part in [
                str((pds_row or {}).get("first_name") or "").strip(),
                str((pds_row or {}).get("middle_name") or "").strip(),
                str((pds_row or {}).get("surname") or "").strip(),
            ]
            if part
        ).strip()

        date_of_membership_value = (
            (member_row or {}).get("membership_date")
            or (pds_row or {}).get("date_of_membership")
            or (member_row or {}).get("created_at")
            or (pds_row or {}).get("created_at")
            or ""
        )

        bod_resolution_value = (
            (member_row or {}).get("bod_resolution_number")
            or (pds_row or {}).get("BOD_resolution_number")
            or ""
        )
        if not str(bod_resolution_value).strip():
            reference_value = (
                (latest_application or {}).get("id")
                or (pds_row or {}).get("personal_data_sheet_id")
                or membership_number
            )
            bod_resolution_value = build_bod_resolution_number(reference_value, date_of_membership_value)

        details = {
            "member_uuid": member_uuid,
            "name": full_name or "Membership Record",
            "membership_number": membership_number,
            "date_of_membership": date_of_membership_value,
            "bod_resolution_number": bod_resolution_value,
            "number_of_shares": decimal_to_float(shares_value),
            "amount": decimal_to_float(amount_value or 0),
            "initial_paid_up_capital": decimal_to_float(paid_up_value or 0),
            "termination_resolution_number": (member_row or {}).get("termination_resolution_number") or "",
            "termination_date": (member_row or {}).get("termination_date") or "",
            "application_id": (latest_application or {}).get("id"),
            "editable": bool(member_row or pds_row),
            "edit_scope": "member" if member_row else "personal_data_sheet",
        }

        return {"success": True, "data": details}
    except HTTPException as err:
        raise err
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Failed to load membership record details: {err}")


@app.put("/api/secretary/membership-records/{member_ref}")
async def update_secretary_membership_record(member_ref: str, payload: SecretaryMembershipRecordUpdateRequest):
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase client is not initialized.")

    try:
        member_row = resolve_member_by_ref(member_ref)
        pds_row = resolve_personal_data_sheet_by_ref(member_ref)

        if not member_row and not pds_row:
            raise HTTPException(status_code=403, detail="Applicant-only records cannot be edited. Record must exist in member or personal_data_sheet.")

        update_payload = {
            "membership_id": payload.membership_number,
            "membership_date": payload.date_of_membership,
            "bod_resolution_number": payload.bod_resolution_number,
            "number_of_shares": decimal_to_float(payload.number_of_shares) if payload.number_of_shares is not None else None,
            "share_capital_amount": decimal_to_float(payload.amount) if payload.amount is not None else None,
            "initial_paid_up_capital": decimal_to_float(payload.initial_paid_up_capital) if payload.initial_paid_up_capital is not None else None,
            "termination_resolution_number": payload.termination_resolution_number,
            "termination_date": payload.termination_date,
        }
        update_payload = {k: v for k, v in update_payload.items() if v is not None}

        if not update_payload:
            raise HTTPException(status_code=400, detail="No valid fields provided for update.")

        update_results = {}

        if member_row:
            member_uuid = str(member_row.get("id") or "").strip()
            if not member_uuid:
                raise HTTPException(status_code=400, detail="Member UUID is missing.")

            updated_response = (
                supabase.table("member")
                .update(update_payload)
                .eq("id", member_uuid)
                .execute()
            )
            update_results["member"] = (updated_response.data or [None])[0]

        if pds_row:
            pds_payload = {
                "membership_number_id": payload.membership_number,
                "date_of_membership": payload.date_of_membership,
                "BOD_resolution_number": payload.bod_resolution_number,
                "number_of_shares": decimal_to_float(payload.number_of_shares) if payload.number_of_shares is not None else None,
                "amount": decimal_to_float(payload.amount) if payload.amount is not None else None,
                "initial_paid_up_capital": decimal_to_float(payload.initial_paid_up_capital) if payload.initial_paid_up_capital is not None else None,
            }
            pds_payload = {k: v for k, v in pds_payload.items() if v is not None}

            if pds_payload:
                updated_pds_response = (
                    supabase.table("personal_data_sheet")
                    .update(pds_payload)
                    .eq("personal_data_sheet_id", pds_row.get("personal_data_sheet_id"))
                    .execute()
                )
                update_results["personal_data_sheet"] = (updated_pds_response.data or [None])[0]

        return {
            "success": True,
            "message": "Membership record updated successfully.",
            "data": update_results,
        }
    except HTTPException as err:
        raise err
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Failed to update membership record: {err}")


@app.get("/api/bookkeeper/payments/pending")
async def get_bookkeeper_pending_payments():
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase client is not initialized.")

    try:
        payments_response = (
            supabase.table("loan_payments")
            .select("id,payment_reference,loan_id,schedule_id,amount_paid,penalties,payment_date,confirmation_status,transaction_reference")
            .order("payment_date", desc=True)
            .execute()
        )
        payment_rows = [
            row
            for row in (payments_response.data or [])
            if str(row.get("confirmation_status") or "pending_bookkeeper").strip().lower() == "pending_bookkeeper"
        ]

        loan_ids = sorted({str(row.get("loan_id") or "").strip() for row in payment_rows if row.get("loan_id")})
        member_name_by_loan: dict[str, str] = {}
        if loan_ids:
            loans_response = (
                supabase.table("loans")
                .select("control_number,member:member_id(first_name,last_name)")
                .in_("control_number", loan_ids)
                .execute()
            )
            for loan_row in loans_response.data or []:
                member = loan_row.get("member") or {}
                member_name_by_loan[str(loan_row.get("control_number") or "")] = (
                    f"{member.get('first_name') or ''} {member.get('last_name') or ''}".strip() or "Unknown Member"
                )

        schedule_code_by_id: dict[str, str] = {}
        try:
            schedule_rows = (
                supabase.table("loan_schedules")
                .select("id,schedule_id")
                .execute()
            ).data or []
            for sched in schedule_rows:
                internal_id = str(sched.get("id") or "")
                if internal_id:
                    schedule_code_by_id[internal_id] = str(sched.get("schedule_id") or internal_id)
        except Exception:
            schedule_code_by_id = {}

        result = []
        for idx, row in enumerate(payment_rows, start=1):
            internal_schedule_id = str(row.get("schedule_id") or "")
            result.append(
                {
                    "payment_id": row.get("payment_reference") or build_sequence_id("TTMPCLP-", idx),
                    "loan_id": row.get("loan_id"),
                    "schedule_id": schedule_code_by_id.get(internal_schedule_id, row.get("schedule_id")),
                    "amount_paid": decimal_to_float(row.get("amount_paid") or 0),
                    "penalties": decimal_to_float(row.get("penalties") or 0),
                    "date_paid": row.get("payment_date"),
                    "entered_by": "Cashier",
                    "confirmation_status": row.get("confirmation_status") or "pending_bookkeeper",
                    "transaction_reference": row.get("transaction_reference"),
                    "member_name": member_name_by_loan.get(str(row.get("loan_id") or ""), "Unknown Member"),
                }
            )

        return {"success": True, "data": result}
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Failed to fetch pending payments: {err}")


@app.post("/api/bookkeeper/payments/{payment_id}/approve")
async def approve_bookkeeper_payment(payment_id: str, payload: BookkeeperPaymentDecisionRequest):
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase client is not initialized.")

    try:
        clean_payment_id = str(payment_id or "").strip()
        if not clean_payment_id:
            raise HTTPException(status_code=400, detail="payment_id is required.")

        payment_response = (
            supabase.table("loan_payments")
            .select("id,payment_reference,loan_id,schedule_id,amount_paid,penalties,payment_date,confirmation_status")
            .eq("payment_reference", clean_payment_id)
            .limit(1)
            .execute()
        )
        payment_row = (payment_response.data or [None])[0]

        if not payment_row:
            payment_response = (
                supabase.table("loan_payments")
                .select("id,payment_reference,loan_id,schedule_id,amount_paid,penalties,payment_date,confirmation_status")
                .eq("id", clean_payment_id)
                .limit(1)
                .execute()
            )
            payment_row = (payment_response.data or [None])[0]

        if not payment_row:
            raise HTTPException(status_code=404, detail="Payment not found.")

        current_payment_status = str(payment_row.get("confirmation_status") or "pending_bookkeeper").strip().lower()
        if current_payment_status != "pending_bookkeeper":
            raise HTTPException(status_code=400, detail="Only pending payments can be approved.")

        loan_id = str(payment_row.get("loan_id") or "").strip()
        if not loan_id:
            raise HTTPException(status_code=400, detail="Payment loan_id is missing.")

        loan_response = (
            supabase.table("loans")
            .select(
                "control_number,loan_amount,principal_amount,interest_rate,term,loan_status," \
                "loan_type:loan_type_id(name)"
            )
            .eq("control_number", loan_id)
            .limit(1)
            .execute()
        )
        loan_row = (loan_response.data or [None])[0]
        if not loan_row:
            raise HTTPException(status_code=404, detail="Loan not found for this payment.")

        principal_amount = Decimal(str(loan_row.get("principal_amount") or loan_row.get("loan_amount") or 0))
        if principal_amount <= 0:
            raise HTTPException(status_code=400, detail="Invalid loan principal.")

        term_months = int(loan_row.get("term") or 0)
        if term_months <= 0:
            raise HTTPException(status_code=400, detail="Invalid loan term.")

        loan_type_name = (loan_row.get("loan_type") or {}).get("name")
        normalized_loan_type = normalize_cashier_loan_type(loan_type_name)
        interest_rate_percent = Decimal(str(loan_row.get("interest_rate") or 0)) if loan_row.get("interest_rate") is not None else None
        monthly_rate_decimal = resolve_monthly_rate_decimal(
            normalized_loan_type,
            interest_rate_percent,
            loan_type_code=resolve_loan_type_code(normalized_loan_type),
            loan_type_name=loan_type_name,
        )
        if monthly_rate_decimal <= 0:
            raise HTTPException(status_code=400, detail="Loan interest rate is not configured in loan_types.")

        schedule_internal_id = str(payment_row.get("schedule_id") or "").strip()
        current_schedule_response = (
            supabase.table("loan_schedules")
            .select("id,schedule_id,loan_id,installment_no,due_date,remaining_principal,schedule_status")
            .eq("id", schedule_internal_id)
            .limit(1)
            .execute()
        )
        current_schedule = (current_schedule_response.data or [None])[0]
        if not current_schedule:
            raise HTTPException(status_code=404, detail="Current schedule not found.")

        payment_amount = Decimal(str(payment_row.get("amount_paid") or 0))
        if payment_amount <= 0:
            raise HTTPException(status_code=400, detail="Payment amount must be greater than zero.")

        validated_response = (
            supabase.table("loan_payments")
            .select("amount_paid")
            .eq("loan_id", loan_id)
            .in_("confirmation_status", ["validated", "confirmed", "bookkeeper_confirmed", "approved"])
            .execute()
        )
        total_validated_before = sum(Decimal(str(row.get("amount_paid") or 0)) for row in (validated_response.data or []))
        total_validated_after = total_validated_before + payment_amount
        remaining_loan_balance = max(principal_amount - total_validated_after, Decimal("0"))

        schedule_update_payload = {"schedule_status": "Paid"}
        (
            supabase.table("loan_schedules")
            .update(schedule_update_payload)
            .eq("id", schedule_internal_id)
            .execute()
        )

        payment_update_payload = {
            "confirmation_status": "validated",
            "reviewed_at": datetime.utcnow().isoformat(),
            "confirmed_at": datetime.utcnow().isoformat(),
        }
        if payload.validated_by:
            payment_update_payload["validated_by"] = payload.validated_by
            payment_update_payload["reviewed_by"] = payload.validated_by
            payment_update_payload["confirmed_by"] = payload.validated_by
        if payload.notes:
            payment_update_payload["validation_notes"] = payload.notes

        try:
            (
                supabase.table("loan_payments")
                .update(payment_update_payload)
                .eq("id", payment_row.get("id"))
                .execute()
            )
        except Exception:
            # Backward-compatible fallback for DBs where check constraint still allows confirmed but not validated.
            (
                supabase.table("loan_payments")
                .update({"confirmation_status": "confirmed"})
                .eq("id", payment_row.get("id"))
                .execute()
            )

        created_next_schedule = None
        current_installment_no = int(current_schedule.get("installment_no") or 1)
        if remaining_loan_balance > 0 and current_installment_no < term_months:
            next_installment_no = current_installment_no + 1

            next_due_date = parse_date_value(current_schedule.get("due_date"))
            if not next_due_date:
                next_due_date = add_months(datetime.utcnow().date(), 1)
            else:
                next_due_date = add_months(next_due_date, 1)

            remaining_before = Decimal(str(current_schedule.get("remaining_principal") or remaining_loan_balance))
            schedule_count_response = supabase.table("loan_schedules").select("id").execute()
            next_sequence_number = len(schedule_count_response.data or []) + 1

            next_schedule_row = build_single_schedule_row(
                loan_type=normalized_loan_type,
                principal=principal_amount,
                term_months=term_months,
                monthly_rate_decimal=monthly_rate_decimal,
                due_date=next_due_date,
                loan_id=loan_id,
                installment_no=next_installment_no,
                remaining_principal_before=remaining_before,
                start_sequence_number=next_sequence_number,
            )

            try:
                insert_next_response = supabase.table("loan_schedules").insert(next_schedule_row).execute()
                created_next_schedule = (insert_next_response.data or [None])[0]
            except Exception:
                legacy_next_row = {
                    "loan_id": next_schedule_row["loan_id"],
                    "installment_no": next_schedule_row["installment_no"],
                    "due_date": next_schedule_row["due_date"],
                    "expected_amount": next_schedule_row["expected_amount"],
                    "principal_component": next_schedule_row["principal_component"],
                    "interest_component": next_schedule_row["interest_component"],
                    "schedule_status": "Unpaid",
                }
                insert_next_response = supabase.table("loan_schedules").insert(legacy_next_row).execute()
                created_next_schedule = (insert_next_response.data or [None])[0]

        loan_status_update = "fully paid" if remaining_loan_balance <= 0 else "partially paid"
        try:
            (
                supabase.table("loans")
                .update({"loan_status": loan_status_update, "application_status": loan_status_update})
                .eq("control_number", loan_id)
                .execute()
            )
        except Exception:
            # If status constraints do not allow repayment status values, keep released while returning computed repayment status.
            (
                supabase.table("loans")
                .update({"loan_status": "released"})
                .eq("control_number", loan_id)
                .execute()
            )

        return {
            "success": True,
            "message": "Payment validated. Current due marked paid and next due generated if balance remains.",
            "data": {
                "payment_id": payment_row.get("payment_reference") or payment_row.get("id"),
                "loan_id": loan_id,
                "remaining_balance": decimal_to_float(remaining_loan_balance),
                "loan_status": loan_status_update,
                "next_schedule_id": (
                    created_next_schedule.get("schedule_id")
                    if created_next_schedule and created_next_schedule.get("schedule_id")
                    else (created_next_schedule.get("id") if created_next_schedule else None)
                ),
            },
        }
    except HTTPException as err:
        raise err
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Failed to approve payment: {err}")


@app.post("/api/bookkeeper/payments/{payment_id}/reject")
async def reject_bookkeeper_payment(payment_id: str, payload: BookkeeperPaymentDecisionRequest):
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase client is not initialized.")

    try:
        clean_payment_id = str(payment_id or "").strip()
        if not clean_payment_id:
            raise HTTPException(status_code=400, detail="payment_id is required.")

        payment_response = (
            supabase.table("loan_payments")
            .select("id,payment_reference,confirmation_status")
            .eq("payment_reference", clean_payment_id)
            .limit(1)
            .execute()
        )
        payment_row = (payment_response.data or [None])[0]

        if not payment_row:
            payment_response = (
                supabase.table("loan_payments")
                .select("id,payment_reference,confirmation_status")
                .eq("id", clean_payment_id)
                .limit(1)
                .execute()
            )
            payment_row = (payment_response.data or [None])[0]

        if not payment_row:
            raise HTTPException(status_code=404, detail="Payment not found.")

        update_payload = {
            "confirmation_status": "rejected",
            "reviewed_at": datetime.utcnow().isoformat(),
        }
        if payload.validated_by:
            update_payload["reviewed_by"] = payload.validated_by
        if payload.notes:
            update_payload["rejection_reason"] = payload.notes

        try:
            (
                supabase.table("loan_payments")
                .update(update_payload)
                .eq("id", payment_row.get("id"))
                .execute()
            )
        except Exception:
            (
                supabase.table("loan_payments")
                .update({"confirmation_status": "rejected"})
                .eq("id", payment_row.get("id"))
                .execute()
            )

        return {
            "success": True,
            "message": "Payment rejected successfully.",
            "data": {"payment_id": payment_row.get("payment_reference") or payment_row.get("id")},
        }
    except HTTPException as err:
        raise err
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Failed to reject payment: {err}")

@app.post("/api/send-status-email")
async def send_status_email(payload: StatusEmailRequest):
    # Reload env values at request time so key updates are picked up without restart.
    load_dotenv(ROOT_ENV_PATH, override=True)
    runtime_resend_api_key = os.environ.get("RESEND_API_KEY") or os.environ.get("VITE_RESEND_API_KEY")
    runtime_resend_from_email = os.environ.get("RESEND_FROM_EMAIL", resend_from_email)

    if not runtime_resend_api_key:
        raise HTTPException(status_code=500, detail="RESEND_API_KEY is not configured.")

    status_color = "#2563eb" # Default Blue
    status_text = payload.status.upper()
    
    # Designer Note: You can expand this logic to change colors based on the status string
    if "approved" in status_text.lower(): status_color = "#059669" # Green
    if "pending" in status_text.lower(): status_color = "#d97706" # Orange

    details_html = ""
    if payload.remarks:
        details_html = f"""
            <div style="margin-top: 24px; padding: 20px; background-color: #fff7ed; border-radius: 8px; border: 1px solid #ffedd5;">
                <p style="margin: 0 0 8px 0; font-size: 12px; font-weight: 700; color: #9a3412; text-transform: uppercase; letter-spacing: 0.05em;">Notes from the Board</p>
                <p style="margin: 0; font-size: 14px; color: #7c2d12; line-height: 1.5;">{payload.remarks}</p>
            </div>
        """

    resend_payload = {
        "from": runtime_resend_from_email,
        "to": [payload.to_email],
        "subject": f"Update: Your Membership Application is {payload.status}",
        "html": f"""
        <div style="background-color: #f8fafc; padding: 40px 10px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
            <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.03); border: 1px solid #e2e8f0;">
                
                <div style="background-color: #111827; padding: 32px; text-align: center;">
                    <p style="color: #60a5fa; font-size: 12px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 8px;">TTMPC BOD Portal</p>
                    <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 700;">Application Update</h1>
                </div>

                <div style="padding: 40px;">
                    <p style="font-size: 16px; color: #4b5563; margin-top: 0;">Hello <strong>{payload.member_name}</strong>,</p>
                    
                    <p style="font-size: 15px; color: #64748b; line-height: 1.6;">
                        This is an official notification regarding your current membership and training application. The Board of Directors has updated your profile status:
                    </p>

                    <div style="margin: 32px 0; text-align: center; padding: 32px; background-color: #f1f5f9; border-radius: 12px; border: 1px dashed #cbd5e1;">
                        <span style="font-size: 13px; color: #64748b; text-transform: uppercase; letter-spacing: 1px;">Current Status</span>
                        <div style="margin-top: 12px; font-size: 28px; font-weight: 800; color: {status_color}; letter-spacing: -0.5px;">
                            {status_text}
                        </div>
                    </div>

                    {details_html}

                    <p style="margin-top: 32px; font-size: 15px; color: #4b5563;">
                        If further action is required, please log in to the portal or contact your training coordinator.
                    </p>

                    <div style="margin-top: 40px; padding-top: 24px; border-top: 1px solid #f1f5f9;">
                        <p style="margin: 0; font-size: 14px; font-weight: 700; color: #111827;">TTMPC Board of Directors</p>
                        <p style="margin: 4px 0 0 0; font-size: 13px; color: #94a3b8;">Official Membership & Training Division</p>
                    </div>
                </div>

                <div style="background-color: #f8fafc; padding: 20px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0;">
                    <p style="margin: 0;">This is an automated administrative message. Please do not reply directly to this email.</p>
                </div>
            </div>
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
            send_email=payload.send_email,
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
            send_email=payload.send_email,
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


@app.post("/api/membership-form/print-pdf")
async def print_membership_form_pdf(payload: MembershipFormPdfRequest):
    try:
        try:
            from pypdf import PdfReader, PdfWriter
        except ModuleNotFoundError:
            raise HTTPException(
                status_code=500,
                detail="pypdf is not installed in the backend runtime environment.",
            )

        template_path = os.path.abspath(
            os.path.join(os.path.dirname(__file__), "..", "PDF", "MEMBERSHIP_FORM.pdf")
        )
        if not os.path.exists(template_path):
            raise HTTPException(status_code=404, detail="MEMBERSHIP_FORM.pdf not found.")

        def clean(value: str | None) -> str:
            return str(value or "").strip()

        gender = clean(payload.gender).lower()
        field_values = {
            "application_id": clean(payload.application_id),
            "date": clean(payload.date),
            "surname": clean(payload.surname),
            "first_name": clean(payload.first_name),
            "middle_name": clean(payload.middle_name),
            "male": "/Yes" if gender == "male" else "/Off",
            "female": "/Yes" if gender == "female" else "/Off",
            "civil_status": clean(payload.civil_status),
            "date_of_birth": clean(payload.date_of_birth),
            "age": clean(payload.age),
            "place_of_birth": clean(payload.place_of_birth),
            "citizenship": clean(payload.citizenship),
            "religion": clean(payload.religion),
            "height": clean(payload.height),
            "weight": clean(payload.weight),
            "blood_type": clean(payload.blood_type),
            "tin_number": clean(payload.tin_number),
            "maiden_name": clean(payload.maiden_name),
            "spouse_name": clean(payload.spouse_name),
            "spouse_date_of_birth": clean(payload.spouse_date_of_birth),
            "spouse_occupation": clean(payload.spouse_occupation),
            "number_of_dependents": clean(payload.number_of_dependents),
            "permanent_address": clean(payload.permanent_address),
            "contact_number": clean(payload.contact_number),
            "email": clean(payload.email),
            "educational_attainment": clean(payload.educational_attainment),
            "occupation": clean(payload.occupation),
            "position": clean(payload.position),
            "annual_income": clean(payload.annual_income),
            "other_income": clean(payload.other_income),
        }

        reader = PdfReader(template_path)
        if not reader.get_fields():
            raise HTTPException(
                status_code=400,
                detail="MEMBERSHIP_FORM.pdf has no fillable form fields (AcroForm). Use a fillable template first.",
            )

        writer = PdfWriter()
        writer.append(reader)

        for page in writer.pages:
            writer.update_page_form_field_values(page, field_values, auto_regenerate=False)

        writer.set_need_appearances_writer()

        output = io.BytesIO()
        writer.write(output)
        output.seek(0)

        return Response(
            content=output.getvalue(),
            media_type="application/pdf",
            headers={"Content-Disposition": 'inline; filename="MEMBERSHIP_FORM_FILLED.pdf"'},
        )
    except HTTPException as err:
        raise err
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Failed to generate printable membership PDF: {err}")

def build_loan_pdf_response(
    payload: LoanPdfRequest,
    template_filename: str,
    output_filename: str,
    loan_kind: str,
):
    try:
        try:
            from pypdf import PdfReader, PdfWriter
        except ModuleNotFoundError:
            raise HTTPException(
                status_code=500,
                detail="pypdf is not installed in the backend runtime environment.",
            )

        def clean(value: str | None) -> str:
            return str(value or "").strip()

        def format_date(value: str | None) -> str:
            raw_value = clean(value)
            if not raw_value:
                return ""

            for pattern in ("%Y-%m-%d", "%Y/%m/%d", "%m/%d/%Y", "%d/%m/%Y"):
                try:
                    return datetime.strptime(raw_value, pattern).strftime("%m/%d/%Y")
                except ValueError:
                    continue

            return raw_value

        def format_amount(value: str | None) -> str:
            raw_value = clean(value).replace(",", "")
            if not raw_value:
                return ""

            try:
                amount = float(raw_value)
            except ValueError:
                return clean(value)

            if amount.is_integer():
                return f"{int(amount):,}"
            return f"{amount:,.2f}".rstrip("0").rstrip(".")

        def loan_purpose_text() -> str:
            purpose = clean(payload.loan_purpose)
            purpose_other = clean(payload.loan_purpose_other)
            if purpose.lower() == "others" and purpose_other:
                return f"Others: {purpose_other}"
            return purpose

        def escape_pdf_text(value: str) -> str:
            return (
                value.replace("\\", "\\\\")
                .replace("(", "\\(")
                .replace(")", "\\)")
                .replace("\r", " ")
                .replace("\n", " ")
            )

        def estimate_max_chars(max_width: float, font_size: float) -> int:
            return max(1, int(max_width / max(font_size * 0.45, 1)))

        def wrap_text_by_words(text: str, max_width: float, font_size: float, max_lines: int = 2) -> list[str]:
            content = clean(text)
            if not content:
                return []

            max_chars = estimate_max_chars(max_width, font_size)
            words = content.split()
            lines: list[str] = []
            current_line = ""

            for word in words:
                candidate = word if not current_line else f"{current_line} {word}"
                if len(candidate) <= max_chars:
                    current_line = candidate
                    continue

                if current_line:
                    lines.append(current_line)
                else:
                    lines.append(word[:max_chars])
                    word = word[max_chars:]

                current_line = word
                if len(lines) >= max_lines:
                    break

            if current_line and len(lines) < max_lines:
                lines.append(current_line)

            return lines[:max_lines]

        def truncate_to_width(text: str, max_width: float, font_size: float) -> str:
            content = clean(text)
            if not content:
                return ""

            max_chars = estimate_max_chars(max_width, font_size)
            if len(content) <= max_chars:
                return content

            if max_chars <= 3:
                return content[:max_chars]

            return content[: max_chars - 3].rstrip() + "..."

        def build_text_commands() -> str:
            commands: list[str] = []

            def add_text(x: float, y: float, text: str, font_size: float = 7.5, font_name: str = "/F1") -> None:
                content = clean(text)
                if not content:
                    return
                commands.append(f"BT {font_name} {font_size:.2f} Tf {x:.2f} {y:.2f} Td ({escape_pdf_text(content)}) Tj ET")

            def add_wrapped_text(x: float, y: float, text: str, max_width: float, font_size: float = 7.0, line_height: float = 8.5, max_lines: int = 2) -> None:
                lines = wrap_text_by_words(text, max_width, font_size, max_lines=max_lines)
                for index, line in enumerate(lines):
                    add_text(x, y - (index * line_height), line, font_size)

            def add_checkbox(x: float, y: float) -> None:
                add_text(x, y, "3", 15.0, "/F2")

            def render_common_identity_fields() -> str:
                application_type = clean(payload.application_type).lower()
                if application_type == "new":
                    add_checkbox(page_width * 0.03, top_y)
                elif application_type == "renewal":
                    add_checkbox(page_width * 0.10, top_y)

                add_text(page_width * 0.23, top_y - 8, clean(payload.control_no), 7.5)
                add_text(page_width * 0.105, page_height * 0.915, format_date(payload.date_applied), 7.5)

                add_text(left_x, info_y - 20, clean(payload.surname), 7.0)
                add_text(page_width * 0.125, info_y - 20, clean(payload.first_name), 7.0)
                add_text(page_width * 0.245, info_y - 20, clean(payload.middle_name), 7.0)

                add_text(page_width * 0.125, info_y - 50, clean(payload.contact_no), 7.0)
                add_wrapped_text(page_width * 0.125, page_height * 0.75, clean(payload.residence_address), page_width * 0.26, 7.0, 8.2, 2)
                add_text(page_width * 0.115, page_height * 0.72, format_amount(payload.latest_net_pay), 7.0)
                add_text(page_width * 0.245, page_height * 0.72, format_amount(payload.share_capital), 7.0)
                add_text(page_width * 0.105, page_height * 0.70, format_date(payload.date_of_birth), 7.0)
                add_text(page_width *0.205, page_height * 0.70, clean(payload.age), 7.0)
                add_text(page_width * 0.105, page_height * 0.67, clean(payload.civil_status), 7.0)
                add_text(page_width *0.205, page_height *0.67, clean(payload.gender), 7.0)
                add_text(page_width *0.105, page_height * 0.65, clean(payload.tin_no), 7.0)
                add_text(page_width * 0.105, page_height * 0.62, clean(payload.gsis_sss_no), 7.0)
                add_wrapped_text(page_width *0.120, page_height * 0.60, clean(payload.employer_name), page_width * 0.26, 7.0, 8.2, 2)
                add_wrapped_text(page_width *0.120, page_height * 0.58, clean(payload.office_address), page_width * 0.26, 7.0, 8.2, 2)

                if clean(payload.spouse_name):
                    add_wrapped_text(page_width *0.120, page_height * 0.56, clean(payload.spouse_name), page_width * 0.26, 7.0, 8.2, 1)
                if clean(payload.spouse_occupation):
                    add_wrapped_text(page_width *0.120, page_height * 0.54, clean(payload.spouse_occupation), page_width * 0.26, 7.0, 8.2, 1)

                borrower_name = " ".join(part for part in [clean(payload.first_name), clean(payload.middle_name), ".", clean(payload.surname)] if part)
                add_text(page_width * 0.125, page_height * 0.09, borrower_name, 9.0)
                return borrower_name

            def render_consolidated_fields() -> None:
                render_common_identity_fields()
                add_wrapped_text(page_width *0.245, page_height * 0.41, clean(payload.loan_amount_words), page_width * 0.24, 7.0, 8.2, 2)
                add_text(page_width * 0.245, page_height * 0.38, format_amount(payload.loan_amount_numeric), 7.0)
                add_wrapped_text(page_width * 0.155, page_height * 0.36, loan_purpose_text(), page_width * 0.16, 7.0, 8.2, 2)
                add_text(page_width * 0.255, page_height * 0.33, clean(payload.loan_term_months), 7.0)
                add_text(page_width * 0.205, page_height * 0.31, format_amount(payload.monthly_amortization), 7.0)

                borrower_name = " ".join(part for part in [clean(payload.first_name), clean(payload.middle_name), ".", clean(payload.surname)] if part)
                add_text(page_width * 0.405, info_y - 8, borrower_name, 9.0)
                add_wrapped_text(page_width *0.455,  info_y - 35, clean(payload.loan_amount_words), page_width * 0.24, 7.0, 8.2, 2)
                add_text(page_width *0.565, info_y - 50, format_amount(payload.loan_amount_numeric), 7.0)
                add_text(page_width *0.455, page_height * 0.50, borrower_name, 10.0)

                footer_email = clean(payload.user_email)
                if footer_email:
                    email_parts = footer_email.split("@", 1)
                    if len(email_parts) == 2:
                        add_text(center_x, footer_y + 4, f"{email_parts[0]}@", 8.6)
                        add_text(center_x, footer_y - 4, email_parts[1], 8.6)
                    else:
                        add_wrapped_text(center_x, footer_y + 2, footer_email, page_width * 0.09, 7.2, 7.2, 3)
                add_text(page_width * 0.48, footer_y, clean(payload.contact_no), 8.6)
                add_wrapped_text(page_width * 0.58, footer_y, clean(payload.residence_address), page_width * 0.13, 8.6, 8.2, 2)

            def render_bonus_fields() -> None:
                render_common_identity_fields()
                add_wrapped_text(page_width * 0.245, page_height * 0.41, clean(payload.loan_amount_words), page_width * 0.24, 7.0, 8.2, 2)
                add_text(page_width * 0.245, page_height * 0.38, format_amount(payload.loan_amount_numeric), 7.0)
                add_wrapped_text(page_width * 0.155, page_height * 0.36, loan_purpose_text(), page_width * 0.16, 7.0, 8.2, 2)
                add_text(page_width * 0.255, page_height * 0.33, clean(payload.loan_term_months), 7.0)
                add_text(page_width * 0.205, page_height * 0.31, format_amount(payload.monthly_amortization), 7.0)

                bonus_words = clean(payload.bonus_amount_words) or clean(payload.loan_amount_words)
                bonus_numeric = clean(payload.bonus_amount_numeric) or clean(payload.loan_amount_numeric)
                add_wrapped_text(page_width * 0.21, page_height * 0.23, bonus_words, page_width * 0.28, 7.0, 8.2, 2)
                add_text(page_width * 0.22, page_height * 0.20, format_amount(bonus_numeric), 7.0)

            def render_emergency_fields() -> None:
                render_common_identity_fields()
                add_wrapped_text(page_width * 0.245, page_height * 0.41, clean(payload.loan_amount_words), page_width * 0.24, 7.0, 8.2, 2)
                add_text(page_width * 0.245, page_height * 0.38, format_amount(payload.loan_amount_numeric), 7.0)
                add_wrapped_text(page_width * 0.155, page_height * 0.36, loan_purpose_text(), page_width * 0.16, 7.0, 8.2, 2)
                add_text(page_width * 0.255, page_height * 0.33, clean(payload.loan_term_months), 7.0)
                add_text(page_width * 0.205, page_height * 0.31, format_amount(payload.monthly_amortization), 7.0)

            if loan_kind == "consolidated":
                render_consolidated_fields()
            elif loan_kind == "bonus":
                render_bonus_fields()
            elif loan_kind == "emergency":
                render_emergency_fields()
            else:
                raise HTTPException(status_code=400, detail=f"Unsupported loan kind: {loan_kind}")

            return "\n".join(commands)

        amount_value = clean(payload.loan_amount_numeric)
        amount_number = 0.0
        try:
            amount_number = float(amount_value.replace(",", "")) if amount_value else 0.0
        except ValueError:
            amount_number = 0.0

        template_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "PDF", template_filename))

        if not os.path.exists(template_path):
            raise HTTPException(status_code=404, detail=f"{template_filename} not found.")

        reader = PdfReader(template_path)
        if not reader.pages:
            raise HTTPException(status_code=400, detail=f"{template_filename} has no pages.")

        base_page = reader.pages[0]
        page_width = float(base_page.mediabox.width)
        page_height = float(base_page.mediabox.height)

        left_x = page_width * 0.045
        center_x = page_width * 0.365

        top_y = page_height * 0.945
        info_y = page_height * 0.86
        lower_y = page_height * 0.23
        footer_y = page_height * 0.12

        overlay_writer = PdfWriter()
        overlay_page = overlay_writer.add_blank_page(width=page_width, height=page_height)
        overlay_page[NameObject("/Resources")] = DictionaryObject(
            {
                NameObject("/Font"): DictionaryObject(
                    {
                        NameObject("/F1"): DictionaryObject(
                            {
                                NameObject("/Type"): NameObject("/Font"),
                                NameObject("/Subtype"): NameObject("/Type1"),
                                NameObject("/BaseFont"): NameObject("/Helvetica"),
                            }
                        )
                        ,
                        NameObject("/F2"): DictionaryObject(
                            {
                                NameObject("/Type"): NameObject("/Font"),
                                NameObject("/Subtype"): NameObject("/Type1"),
                                NameObject("/BaseFont"): NameObject("/ZapfDingbats"),
                            }
                        )
                    }
                )
            }
        )

        content_stream = DecodedStreamObject()
        content_stream.set_data(build_text_commands().encode("utf-8"))
        overlay_page[NameObject("/Contents")] = content_stream

        overlay_buffer = io.BytesIO()
        overlay_writer.write(overlay_buffer)
        overlay_buffer.seek(0)

        overlay_reader = PdfReader(overlay_buffer)
        overlay_page = overlay_reader.pages[0]
        base_page.merge_page(overlay_page)

        writer = PdfWriter()
        writer.add_page(base_page)
        for page in reader.pages[1:]:
            writer.add_page(page)

        output = io.BytesIO()
        writer.write(output)
        output.seek(0)

        return Response(
            content=output.getvalue(),
            media_type="application/pdf",
            headers={"Content-Disposition": f'inline; filename="{output_filename}"'},
        )
    except HTTPException as err:
        raise err
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Failed to generate printable {loan_kind} loan PDF: {err}")


@app.post("/api/loans/consolidated/print-pdf")
async def print_consolidated_loan_pdf(payload: ConsolidatedLoanPdfRequest):
    amount_value = str(payload.loan_amount_numeric or "").strip().replace(",", "")
    amount_number = 0.0
    try:
        amount_number = float(amount_value) if amount_value else 0.0
    except ValueError:
        amount_number = 0.0

    template_filename = "CONSOLIDATED LOAN-500,000 AND UP.pdf" if amount_number >= 500000 else "CONSOLIDATED LOAN -A4.pdf"
    return build_loan_pdf_response(payload, template_filename, "CONSOLIDATED_LOAN_FILLED.pdf", "consolidated")


@app.post("/api/loans/bonus/print-pdf")
async def print_bonus_loan_pdf(payload: BonusLoanPdfRequest):
    return build_loan_pdf_response(payload, "BONUS LOAN A4.pdf", "BONUS_LOAN_FILLED.pdf", "bonus")


@app.post("/api/loans/emergency/print-pdf")
async def print_emergency_loan_pdf(payload: EmergencyLoanPdfRequest):
    return build_loan_pdf_response(payload, "EMERGENCY LOAN A4.pdf", "EMERGENCY_LOAN_FILLED.pdf", "emergency")