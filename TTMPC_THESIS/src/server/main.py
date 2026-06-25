import os
import json
import io
import calendar
from datetime import date, datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import Annotated, Any, Literal, Union
from fastapi import BackgroundTasks, Body, FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, model_validator
from supabase import create_client, Client
from dotenv import load_dotenv
from urllib import request as urlrequest
from urllib.error import HTTPError, URLError
from applicationConfirmation import (
    MembershipConfirmationError,
    confirm_membership,
    confirm_membership_batch,
    get_next_membership_id,
    _build_default_password,
    _extract_user_id,
)
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject
from risk_model import ModelNotAvailableError, score as risk_score
from demand_model import (
    DemandModelNotAvailableError,
    SUPPORTED_LOAN_TYPES as DEMAND_LOAN_TYPES,
    get_forecast_payload as demand_get_forecast_payload,
)
from services.notification_service import dispatch_loan_status_email as _dispatch_loan_status_email
from services.loan_notification_service import create_loan_notification as _create_loan_notification

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


class LoanStatusEmailRequest(BaseModel):
    loan_id: str
    stage: Literal["bookkeeper", "manager", "treasurer"]
    action: Literal["recommend", "reject", "revise", "approve", "proceed", "disburse", "released"]
    remarks: str | None = None
    actor_user_id: str | None = None
    next_approver_email: str | None = None
    override_member_email: str | None = None


class LoanInAppNotificationRequest(BaseModel):
    loan_id: str
    recipient_role: Literal["manager", "treasurer", "bookkeeper"]
    notification_type: Literal["recommend", "decline", "approve", "revise", "reject"]
    actor_user_id: str | None = None
    # Optional client-supplied metadata; backend re-reads the loan to fill blanks.
    member_name: str | None = None
    loan_type: str | None = None


class LoanMemberNotificationRequest(BaseModel):
    loan_id: str
    notification_type: Literal[
        "member_submitted",
        "member_recommended",
        "member_bk_declined",
        "member_approved",
        "member_mgr_rejected",
        "member_mgr_revise",
        "member_ready_claim",
        "member_released",
        "member_cancelled",
    ]
    member_id: str | None = None
    member_name: str | None = None
    loan_type: str | None = None
    actor_user_id: str | None = None


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
    cashier_id: str | None = None
    cashier_name: str | None = None
    cashier_email: str | None = None


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
        # The `interest_rate` column stores the monthly rate in PERCENT
        # (e.g., 0.83 means 0.83%/month → 0.0083 decimal).
        # Do not auto-scale: a value < 1 is a legitimate sub-1% rate, not a decimal.
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


def resolve_legacy_savings_id(account_number: str | None) -> str | None:
    """Inverse of resolve_savings_account_number: SA-NNNNNN -> legacy Savings_ID.

    Returns None when the bridge row has no legacy_savings_id (CSV-migrated
    accounts that were never opened in the legacy table)."""
    key = str(account_number or "").strip()
    if not key or not supabase:
        return None
    try:
        response = (
            supabase.table("savings_accounts")
            .select("legacy_savings_id")
            .eq("account_number", key)
            .limit(1)
            .execute()
        )
    except Exception:
        return None
    row = (response.data or [None])[0]
    return str(row["legacy_savings_id"]) if row and row.get("legacy_savings_id") else None


def resolve_savings_account_number(legacy_savings_id: str | None) -> str | None:
    """Map a legacy Savings_Transactions.Savings_ID to savings_accounts.account_number.

    Returns None if no bridge row exists yet (e.g. queue inserted before backfill ran).
    Callers should treat None as a non-fatal skip — legacy table remains authoritative
    until Phase 3 of the savings consolidation.
    """
    key = str(legacy_savings_id or "").strip()
    if not key or not supabase:
        return None
    try:
        response = (
            supabase.table("savings_accounts")
            .select("account_number")
            .eq("legacy_savings_id", key)
            .limit(1)
            .execute()
        )
    except Exception:
        return None
    row = (response.data or [None])[0]
    return str(row["account_number"]) if row and row.get("account_number") else None


def mirror_savings_ledger_entry(
    *,
    account_number: str | None,
    entry_type: str,
    amount: Decimal,
    transaction_id: str,
    posted_by: str | None,
    remarks: str | None,
) -> None:
    """Best-effort write to public.savings_ledger.

    Failures are swallowed and logged — the legacy Savings_Transactions update
    is still the source of truth until Phase 3. The savings_ledger trigger
    auto-updates savings_accounts.balance, so a successful insert keeps the
    new tables in sync with the legacy ones.
    """
    if not account_number or not supabase or amount <= 0:
        return
    try:
        supabase.table("savings_ledger").insert({
            "account_number": account_number,
            "entry_type": entry_type,
            "amount": decimal_to_float(amount),
            "reference": transaction_id,
            "source": "savings_queue_mirror",
            "remarks": remarks,
            "posted_by": posted_by or "system",
        }).execute()
    except Exception as exc:  # noqa: BLE001
        print(f"[savings_ledger mirror] skipped ({entry_type} {amount} on {account_number}): {exc}")


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

    penalty_rate_percent = Decimal("1") if loan_type == "bonus" else Decimal("2")

    if loan_type == "emergency":
        # Mirror /api/loans/compute: equal principal in centavos with a
        # last-month cleanup, interest on the balance AFTER the principal
        # payment for the month.
        total_principal_cents = int(
            (principal * Decimal("100")).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
        )
        monthly_principal_cents = int(Decimal(total_principal_cents) / Decimal(term_months))
        balance_before_cents = int(
            (max(remaining_principal_before, Decimal("0")) * Decimal("100")).quantize(
                Decimal("1"), rounding=ROUND_HALF_UP
            )
        )

        if installment_no >= term_months:
            principal_cents = balance_before_cents
        else:
            principal_cents = min(monthly_principal_cents, balance_before_cents)

        ending_balance_cents = balance_before_cents - principal_cents
        interest_cents = int(
            (Decimal(ending_balance_cents) * monthly_rate_decimal).quantize(
                Decimal("1"), rounding=ROUND_HALF_UP
            )
        )

        principal_component = Decimal(principal_cents) / Decimal("100")
        interest_component = Decimal(interest_cents) / Decimal("100")
        expected_amount = Decimal(principal_cents + interest_cents) / Decimal("100")
        remaining_after = Decimal(ending_balance_cents) / Decimal("100")
    else:
        principal_component = money(principal / Decimal(term_months))
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


def sanitize_monthly_rate_percent(
    stored_rate,
    loan_type_rate,
    sanity_max_percent: float = 5.0,
) -> float:
    """
    Return a clean monthly interest rate in PERCENT for display/reporting.
    Legacy data may hold a corrupted snapshot (e.g., 8.3 stored when 0.83 was
    intended). If the stored value exceeds the realistic ceiling, fall back to
    the loan_types row which is the current source of truth.
    """
    try:
        stored = float(stored_rate) if stored_rate is not None else None
    except (TypeError, ValueError):
        stored = None
    try:
        lt_rate = float(loan_type_rate) if loan_type_rate is not None else None
    except (TypeError, ValueError):
        lt_rate = None

    if stored is not None and 0 < stored <= sanity_max_percent:
        return stored
    if lt_rate is not None and 0 < lt_rate <= sanity_max_percent:
        return lt_rate
    return stored if stored is not None else (lt_rate or 0.0)


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


_FEE_POLICY_FALLBACKS = {
    "CONSOLIDATED": {
        "service_fee_mode": "bracket",
        "service_fee_per_bracket": Decimal("100"),
        "service_fee_bracket_size": Decimal("50000"),
        "cbu_rate": Decimal("0.02"),
        "insurance_per_thousand": Decimal("1.35"),
        "notarial_fee": Decimal("100"),
    },
    "EMERGENCY": {
        "service_fee_mode": "flat",
        "service_fee_per_bracket": Decimal("100"),
        "service_fee_bracket_size": Decimal("999999999"),
        "cbu_rate": Decimal("0.02"),
        "insurance_per_thousand": Decimal("0"),
        "notarial_fee": Decimal("0"),
    },
    "BONUS": {
        "service_fee_mode": "flat",
        "service_fee_per_bracket": Decimal("100"),
        "service_fee_bracket_size": Decimal("999999999"),
        "cbu_rate": Decimal("0"),
        "insurance_per_thousand": Decimal("0"),
        "notarial_fee": Decimal("0"),
    },
    "NONMEMBER_BONUS": {
        "service_fee_mode": "flat",
        "service_fee_per_bracket": Decimal("100"),
        "service_fee_bracket_size": Decimal("999999999"),
        "cbu_rate": Decimal("0"),
        "insurance_per_thousand": Decimal("0"),
        "notarial_fee": Decimal("0"),
    },
}


def resolve_fee_policy(loan_type_code: str) -> dict:
    """Fetch the fee policy row for the given loan type code, falling back
    to the seeded defaults if the table is unavailable or has no row."""
    code = str(loan_type_code or "").strip().upper()
    if not code:
        return _FEE_POLICY_FALLBACKS.get("CONSOLIDATED", {})
    if supabase is not None:
        try:
            response = (
                supabase.table("loan_fee_policies")
                .select(
                    "service_fee_mode,service_fee_per_bracket,service_fee_bracket_size,"
                    "cbu_rate,insurance_per_thousand,notarial_fee"
                )
                .eq("loan_type_code", code)
                .limit(1)
                .execute()
            )
            row = (response.data or [None])[0]
            if row:
                return {
                    "service_fee_mode": row.get("service_fee_mode") or "none",
                    "service_fee_per_bracket": Decimal(str(row.get("service_fee_per_bracket") or 0)),
                    "service_fee_bracket_size": Decimal(str(row.get("service_fee_bracket_size") or 0)),
                    "cbu_rate": Decimal(str(row.get("cbu_rate") or 0)),
                    "insurance_per_thousand": Decimal(str(row.get("insurance_per_thousand") or 0)),
                    "notarial_fee": Decimal(str(row.get("notarial_fee") or 0)),
                }
        except Exception:
            pass
    return _FEE_POLICY_FALLBACKS.get(code, _FEE_POLICY_FALLBACKS["BONUS"])


def compute_service_fee(policy: dict, principal: Decimal) -> Decimal:
    mode = str(policy.get("service_fee_mode") or "none").lower()
    if mode == "none":
        return Decimal("0")
    per = Decimal(str(policy.get("service_fee_per_bracket") or 0))
    if mode == "flat":
        return money(per)
    size = Decimal(str(policy.get("service_fee_bracket_size") or 0))
    if size <= 0 or per <= 0 or principal <= 0:
        return Decimal("0")
    brackets = ((int(principal) - 1) // int(size)) + 1
    return money(Decimal(brackets) * per)


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

        fee_policy = resolve_fee_policy("CONSOLIDATED")
        service_fee = compute_service_fee(fee_policy, principal)
        insurance_fee = money((principal * fee_policy["insurance_per_thousand"]) / Decimal("1000"))
        cbu_deduction = money(principal * fee_policy["cbu_rate"])
        notarial_fee = money(fee_policy["notarial_fee"])

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

        fee_policy = resolve_fee_policy("EMERGENCY")
        service_fee = compute_service_fee(fee_policy, principal)
        cbu_deduction = money(principal * fee_policy["cbu_rate"])
        insurance_fee = money((principal * fee_policy["insurance_per_thousand"]) / Decimal("1000"))
        notarial_fee = money(fee_policy["notarial_fee"])

        # Equal-principal, declining-interest schedule (matches client UI).
        # Interest each month is computed on the balance AFTER the principal
        # payment for that month. Final month does a cents cleanup so the
        # ending balance lands exactly on zero. Work in integer centavos to
        # avoid floating drift.
        total_principal_cents = int((principal * Decimal("100")).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
        monthly_principal_cents = int(Decimal(total_principal_cents) / Decimal(term))
        accumulated_principal_cents = 0
        balance_cents = total_principal_cents
        first_total_payment = Decimal("0")

        for installment_no in range(1, term + 1):
            starting_balance_cents = balance_cents

            if installment_no < term:
                principal_paid_cents = monthly_principal_cents
            else:
                principal_paid_cents = total_principal_cents - accumulated_principal_cents

            ending_balance_cents = starting_balance_cents - principal_paid_cents
            interest_paid_cents = int(
                (Decimal(ending_balance_cents) * monthly_rate).quantize(
                    Decimal("1"), rounding=ROUND_HALF_UP
                )
            )
            total_payment_cents = principal_paid_cents + interest_paid_cents

            balance_cents = ending_balance_cents
            accumulated_principal_cents += principal_paid_cents

            principal_component = Decimal(principal_paid_cents) / Decimal("100")
            interest_component = Decimal(interest_paid_cents) / Decimal("100")
            expected_amount = Decimal(total_payment_cents) / Decimal("100")

            if installment_no == 1:
                first_total_payment = expected_amount

            monthly_breakdown.append(
                MonthlyBreakdownRow(
                    installment_no=installment_no,
                    due_date=add_months(first_due_date, installment_no - 1),
                    expected_amount=expected_amount,
                    principal_component=principal_component,
                    interest_component=interest_component,
                )
            )

        monthly_amortization = first_total_payment

    elif payload.loan_type == "bonus":
        member_category = str(payload.member_category).strip().lower()
        loan_type_code = resolve_loan_type_code("bonus", member_category)
        monthly_rate = resolve_monthly_rate_decimal("bonus", None, loan_type_code=loan_type_code)
        if monthly_rate <= 0:
            raise HTTPException(status_code=400, detail=f"Interest rate for {loan_type_code} is not configured in loan_types.")

        principal_component = money(principal / Decimal(term))
        interest_component = money(principal * monthly_rate)
        monthly_amortization = money(principal_component + interest_component)

        fee_policy = resolve_fee_policy(loan_type_code)
        service_fee = compute_service_fee(fee_policy, principal)
        cbu_deduction = money(principal * fee_policy["cbu_rate"])
        insurance_fee = money((principal * fee_policy["insurance_per_thousand"]) / Decimal("1000"))
        notarial_fee = money(fee_policy["notarial_fee"])

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
                    "control_number,loan_amount,principal_amount,interest_rate,term,loan_status,application_date,monthly_amortization,total_interest," \
                    "member:member_id(first_name,last_name,is_bona_fide),loan_type:loan_type_id(name,interest_rate)"
                )
                .order("application_date", desc=True)
                .execute()
            )
        except Exception:
            loans_response = (
                supabase.table("loans")
                .select(
                    "control_number,loan_amount,principal_amount,interest_rate,term,loan_status,application_date,total_interest," \
                    "member:member_id(first_name,last_name,is_bona_fide),loan_type:loan_type_id(name,interest_rate)"
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
            total_interest_amount = Decimal(str(loan.get("total_interest") or 0))
            if total_interest_amount <= 0:
                term_months_val = int(loan.get("term") or 0)
                monthly_amort_val = Decimal(str(loan.get("monthly_amortization") or 0))
                if term_months_val > 0 and monthly_amort_val > 0:
                    total_interest_amount = max(monthly_amort_val * term_months_val - principal_amount, Decimal("0"))
            total_payable_amount = principal_amount + total_interest_amount
            remaining_balance = max(total_payable_amount - confirmed_paid, Decimal("0"))

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
            # Use the same sanitizer used by disbursement/treasurer endpoints so legacy
            # snapshots (e.g., 83 stored where 0.83 was meant) don't bleed into the UI.
            loan_type_row = loan.get("loan_type") or {}
            displayed_rate = sanitize_monthly_rate_percent(
                loan.get("interest_rate"),
                loan_type_row.get("interest_rate"),
            )
            resolved_interest_rate_percent = Decimal(str(displayed_rate or 0))
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
                    "total_payable": decimal_to_float(total_payable_amount),
                    "total_interest": decimal_to_float(total_interest_amount),
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
                "member:member_id(first_name,last_name)," \
                "loan_type:loan_type_id(name,interest_rate)"
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
            loan_type_row = row.get("loan_type") or {}
            displayed_rate = sanitize_monthly_rate_percent(
                row.get("interest_rate"),
                loan_type_row.get("interest_rate"),
            )
            mapped.append(
                {
                    "loan_id": row.get("control_number"),
                    "member_name": f"{member.get('first_name') or ''} {member.get('last_name') or ''}".strip() or "Unknown Member",
                    "loan_type": loan_type_row.get("name") or "N/A",
                    "loan_amount": decimal_to_float(row.get("loan_amount") or 0),
                    "principal_amount": decimal_to_float(row.get("principal_amount") or row.get("loan_amount") or 0),
                    "interest_rate": displayed_rate,
                    "term_months": int(row.get("term") or 0),
                    "loan_status": row.get("loan_status") or "ready for disbursement",
                    "application_status": row.get("application_status") or row.get("loan_status") or "ready for disbursement",
                    "application_date": row.get("application_date"),
                }
            )

        return {"success": True, "data": mapped}
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Failed to fetch ready disbursement loans: {err}")


def _classify_migs(member: dict) -> str:
    if not member:
        return "Non-Member"
    if member.get("is_bona_fide"):
        return "MIGS"
    return "Non-MIGS"


def _normalize_disbursement_loan_type(raw: str) -> str:
    text = (raw or "").strip().lower()
    if "emergency" in text:
        return "Emergency"
    if "consolidated" in text:
        return "Consolidated"
    if "abff" in text or "koica" in text:
        return "ABFF"
    if "bonus" in text:
        return "Bonus"
    return (raw or "Other").title()


@app.get("/api/treasurer/disbursements/released-loans")
async def get_treasurer_released_loans():
    """Read-only audit feed of loans already released by the Cashier."""
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase client is not initialized.")

    try:
        response = (
            supabase.table("loans")
            .select(
                "control_number,loan_amount,principal_amount,interest_rate,term,loan_status,application_status," \
                "application_date,disbursal_date,release_method,released_by,raw_payload," \
                "member:member_id(membership_id,first_name,last_name,is_bona_fide)," \
                "loan_type:loan_type_id(name,interest_rate)"
            )
            .order("disbursal_date", desc=True)
            .execute()
        )
        rows = response.data or []
    except Exception:
        # Fallback if release_method / released_by columns are not present in the schema.
        response = (
            supabase.table("loans")
            .select(
                "control_number,loan_amount,principal_amount,interest_rate,term,loan_status,application_status," \
                "application_date,disbursal_date,raw_payload," \
                "member:member_id(membership_id,first_name,last_name,is_bona_fide)," \
                "loan_type:loan_type_id(name,interest_rate)"
            )
            .order("disbursal_date", desc=True)
            .execute()
        )
        rows = response.data or []

    released = [
        row for row in rows
        if str(row.get("loan_status") or "").strip().lower() in {"released", "disbursed", "fully paid", "partially paid", "unpaid"}
        and row.get("disbursal_date")
    ]

    def _document_status(loan_row: dict) -> tuple[bool, int]:
        """Return (has_documents, document_count) from attached supporting documents.

        A loan is considered complete once it has at least one file uploaded to
        Supabase Storage under raw_payload.optionalFields.bookkeeper_loan_details.supporting_documents.
        """
        payload = loan_row.get("raw_payload") or {}
        if not isinstance(payload, dict):
            return False, 0
        docs = (
            (payload.get("optionalFields") or {}).get("bookkeeper_loan_details", {}) or {}
        ).get("supporting_documents")
        if not isinstance(docs, list):
            return False, 0
        count = sum(1 for d in docs if isinstance(d, dict) and str(d.get("storage_path") or "").strip())
        return count > 0, count

    mapped = []
    total_released = Decimal("0")
    today_iso = datetime.utcnow().date().isoformat()
    released_today_total = Decimal("0")

    for row in released:
        member = row.get("member") or {}
        loan_type_name = (row.get("loan_type") or {}).get("name")
        loan_type = _normalize_disbursement_loan_type(loan_type_name)
        migs = _classify_migs(member)
        member_name = f"{member.get('first_name') or ''} {member.get('last_name') or ''}".strip() or "Unknown Member"
        amount = Decimal(str(row.get("principal_amount") or row.get("loan_amount") or 0))
        total_released += amount
        disbursal_date = str(row.get("disbursal_date") or "")[:10] or None
        if disbursal_date == today_iso:
            released_today_total += amount

        control_number = row.get("control_number")
        has_documents, document_count = _document_status(row)

        mapped.append({
            "loan_id": control_number,
            "member_id": member.get("membership_id"),
            "member_name": member_name,
            "loan_type": loan_type,
            "loan_type_raw": loan_type_name,
            "migs": migs,
            "amount": decimal_to_float(amount),
            "interest_rate": sanitize_monthly_rate_percent(
                row.get("interest_rate"),
                (row.get("loan_type") or {}).get("interest_rate"),
            ),
            "term_months": int(row.get("term") or 0),
            "method": row.get("release_method") or "Cash",
            "released_by": row.get("released_by") or "Cashier",
            "approved_date": row.get("application_date"),
            "released_date": disbursal_date,
            "has_documents": has_documents,
            "document_count": document_count,
            "status": "Released",
        })

    summary = {
        "total_released_count": len(mapped),
        "total_released_amount": decimal_to_float(total_released),
        "released_today_amount": decimal_to_float(released_today_total),
    }

    return {"success": True, "data": mapped, "summary": summary}


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

        # Pick the most recent CBU row per member. Same-day deposits can share
        # an identical `transaction_date` (legacy date-only rows), so we tie-
        # break on the row `id` — newer inserts get larger UUIDs as text, and
        # we additionally use `>=` so a later iteration always overrides an
        # earlier one when timestamps are equal.
        latest_cbu_by_member: dict[str, dict] = {}
        for row in cbu_rows:
            member_id = str(row.get("member_id") or "").strip()
            if not member_id:
                continue
            previous = latest_cbu_by_member.get(member_id)
            current_ts = str(row.get("transaction_date") or "")
            current_id = str(row.get("id") or "")
            if previous is None:
                latest_cbu_by_member[member_id] = row
                continue
            previous_ts = str(previous.get("transaction_date") or "")
            previous_id = str(previous.get("id") or "")
            if (current_ts, current_id) > (previous_ts, previous_id):
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

        # Two same-day deposits can share an identical `transaction_date`
        # (legacy rows stored date-only). Add `id` as a tiebreaker so the most
        # recently inserted row consistently wins.
        latest_cbu_response = (
            supabase.table("capital_build_up")
            .select("ending_share_capital,transaction_date,id")
            .eq("member_id", member_uuid)
            .order("transaction_date", desc=True)
            .order("id", desc=True)
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
async def disburse_cashier_loan(loan_id: str, payload: CashierDisbursementRequest, background_tasks: BackgroundTasks):
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase client is not initialized.")

    try:
        clean_loan_id = str(loan_id or "").strip()
        if not clean_loan_id:
            raise HTTPException(status_code=400, detail="loan_id is required.")

        loan_response = (
            supabase.table("loans")
            .select(
                "control_number,loan_amount,principal_amount,interest_rate,term,loan_status,total_interest,monthly_amortization,member_id," \
                "member:member_id(first_name,last_name)," \
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

        if has_existing_schedule:
            try:
                schedules_response = (
                    supabase.table("loan_schedules")
                    .select("id,due_date,schedule_status")
                    .eq("loan_id", clean_loan_id)
                    .order("due_date")
                    .execute()
                )
                schedules = schedules_response.data or []
                next_sched = None
                for sched in schedules:
                    status = str(sched.get("schedule_status") or "").strip().lower()
                    if status in {"unpaid", "pending", "overdue", ""}:
                        next_sched = sched
                        break
                if schedules and not next_sched:
                    next_sched = schedules[0]

                if next_sched:
                    current_due = parse_date_value(next_sched.get("due_date"))
                    if not current_due or current_due <= disbursed_at.date():
                        (
                            supabase.table("loan_schedules")
                            .update({"due_date": first_due_date.isoformat()})
                            .eq("id", next_sched.get("id"))
                            .execute()
                        )
            except Exception:
                pass

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

        member_info = loan_row.get("member") or {}
        member_full_name = (
            f"{member_info.get('first_name') or ''} {member_info.get('last_name') or ''}".strip()
            or "Unknown Member"
        )
        loan_type_label = (loan_row.get("loan_type") or {}).get("name") or "N/A"

        reference_number = f"TTMPC-DSB-{disbursed_at.strftime('%Y%m%d%H%M%S')}-{clean_loan_id[-6:].upper()}"
        cashier_display = (payload.cashier_name or payload.cashier_email or "Cashier").strip()

        confirmation_record = {
            "reference_number": reference_number,
            "loan_id": clean_loan_id,
            "member_id": loan_row.get("member_id"),
            "member_name": member_full_name,
            "loan_type": loan_type_label,
            "loan_amount": float(principal_amount),
            "disbursed_at": disbursed_at.isoformat(),
            "first_due_date": first_due_date.isoformat(),
            "cashier_id": payload.cashier_id,
            "cashier_name": cashier_display,
            "loan_status": (updated_loan or {}).get("loan_status") or "released",
        }
        try:
            supabase.table("disbursement_confirmations").insert(confirmation_record).execute()
        except Exception:
            # Table may not exist yet in legacy DBs; surface confirmation client-side regardless.
            pass

        # Member-facing email is sent earlier in the workflow, when the
        # Treasurer confirms disbursement (frontend → /api/loans/email/dispatch
        # with stage=treasurer action=disburse). The cashier confirm step does
        # not re-email, to avoid duplicates.
        #
        # However we DO fire an in-app member-bell notification so the member
        # sees the final "released" step in their portal.
        try:
            background_tasks.add_task(
                _fan_out_member_notification,
                notification_type="member_released",
                loan_id=clean_loan_id,
                member_id=str(loan_row.get("member_id") or "").strip() or None,
                member_name=member_full_name,
                loan_type=loan_type_label,
                actor_user_id=payload.cashier_id,
            )
        except Exception:
            pass

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
                "confirmation": confirmation_record,
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
                "control_number,loan_amount,principal_amount,interest_rate,term,loan_status,application_status,monthly_amortization,total_interest,application_date," \
                "member:member_id(membership_id,first_name,last_name,is_bona_fide),loan_type:loan_type_id(code,name,interest_rate)"
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
            membership_id = str(member.get("membership_id") or "").strip()

            loan_type = row.get("loan_type") or {}
            loan_type_name = loan_type.get("name") or "N/A"
            loan_type_code = str(loan_type.get("code") or normalize_cashier_loan_type(loan_type_name)).upper()

            principal_amount = Decimal(str(row.get("principal_amount") or row.get("loan_amount") or 0))
            total_interest_amount = Decimal(str(row.get("total_interest") or 0))
            if total_interest_amount <= 0:
                term_months_val = int(row.get("term") or 0)
                monthly_amort_val = Decimal(str(row.get("monthly_amortization") or 0))
                if term_months_val > 0 and monthly_amort_val > 0:
                    total_interest_amount = max(monthly_amort_val * term_months_val - principal_amount, Decimal("0"))
            total_payable_amount = principal_amount + total_interest_amount

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
                running_remaining = max(total_payable_amount - total_validated, Decimal("0"))

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

            remaining_balance = max(total_payable_amount - total_validated, Decimal("0"))
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
                    "membership_id": membership_id,
                    "member_name": member_name,
                    "member_type": member_type,
                    "loan_type": loan_type_name,
                    "loan_type_code": loan_type_code,
                    "loan_amount": decimal_to_float(principal_amount),
                    "interest_rate": sanitize_monthly_rate_percent(
                        row.get("interest_rate"),
                        (row.get("loan_type") or {}).get("interest_rate"),
                    ),
                    "term_months": int(row.get("term") or 0),
                    "amortization": decimal_to_float(row.get("monthly_amortization") or 0),
                    "remaining_balance": decimal_to_float(remaining_balance),
                    "total_payable": decimal_to_float(total_payable_amount),
                    "total_interest": decimal_to_float(total_interest_amount),
                    "due_date": due_date,
                    "status": repayment_status,
                    "source_loan_status": row.get("loan_status"),
                    "source_application_status": row.get("application_status"),
                    "application_date": row.get("application_date"),
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
                "control_number,loan_amount,principal_amount,interest_rate,monthly_amortization,total_interest,term,loan_status,application_status,application_date,disbursal_date," \
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

            principal_value = Decimal(str(row.get("principal_amount") or row.get("loan_amount") or 0))
            total_interest_value = Decimal(str(row.get("total_interest") or 0))
            if total_interest_value <= 0:
                schedule_interest_sum = sum(
                    (Decimal(str(s.get("expected_interest") or 0)) for s in mapped_schedules),
                    Decimal("0"),
                )
                if schedule_interest_sum > 0:
                    total_interest_value = schedule_interest_sum
                else:
                    monthly_amort = Decimal(str(row.get("monthly_amortization") or 0))
                    term_val = int(row.get("term") or 0)
                    if monthly_amort > 0 and term_val > 0:
                        total_interest_value = max(monthly_amort * term_val - principal_value, Decimal("0"))
            total_payable_value = principal_value + total_interest_value

            # Sum of confirmed payments for this loan (status normalization mirrors backend payment trigger).
            confirmed_paid_value = Decimal("0")
            for pay in payment_rows:
                if str(pay.get("loan_id") or "") != loan_id:
                    continue
                status_norm = str(pay.get("confirmation_status") or "").strip().lower()
                if status_norm in {"validated", "confirmed", "bookkeeper_confirmed", "approved"}:
                    confirmed_paid_value += Decimal(str(pay.get("amount_paid") or 0))
            remaining_balance_value = max(total_payable_value - confirmed_paid_value, Decimal("0"))

            mapped_loans.append(
                {
                    "loan_id": loan_id,
                    "loan_type": (row.get("loan_type") or {}).get("name") or "N/A",
                    "principal": decimal_to_float(principal_value),
                    "total_interest": decimal_to_float(total_interest_value),
                    "total_payable": decimal_to_float(total_payable_value),
                    "amount_paid": decimal_to_float(confirmed_paid_value),
                    "remaining_balance": decimal_to_float(remaining_balance_value),
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

        # Final fallback: member_account.email. For migrated members who never
        # had a PDS email or an application row (the 22 TTMPC-272..293 batch),
        # the placeholder `ttmpc-XXX@ttmpc.local` lives only in member_account.
        if membership_ids:
            try:
                account_response = (
                    supabase.table("member_account")
                    .select("membership_id,email")
                    .in_("membership_id", membership_ids)
                    .execute()
                )
                for acc_row in account_response.data or []:
                    membership_id = str(acc_row.get("membership_id") or "").strip()
                    email_value = str(acc_row.get("email") or "").strip()
                    if membership_id and email_value and membership_id not in email_by_membership:
                        email_by_membership[membership_id] = email_value
            except Exception:
                pass

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

        # Phase-2 mirror: create the savings_accounts bridge row so future
        # deposits/withdrawals on this Savings_ID land in the new ledger too.
        bridge_account_number: str | None = None
        try:
            member_lookup = (
                supabase.table("member")
                .select("id")
                .eq("membership_id", membership_number_id)
                .limit(1)
                .execute()
            )
            member_row = (member_lookup.data or [None])[0]
            member_uuid = member_row.get("id") if member_row else None

            # Generate next free SA-NNNNNN by scanning existing rows.
            existing = (
                supabase.table("savings_accounts")
                .select("account_number")
                .like("account_number", "SA-%")
                .execute()
            )
            max_seq = 0
            for r in existing.data or []:
                num = str(r.get("account_number") or "")
                if num.startswith("SA-"):
                    try:
                        max_seq = max(max_seq, int(num[3:]))
                    except ValueError:
                        continue
            bridge_account_number = f"SA-{max_seq + 1:06d}"

            supabase.table("savings_accounts").insert({
                "account_number": bridge_account_number,
                "account_name": payload.account_name or savings_id,
                "member_id": member_uuid,
                "account_kind": "member" if member_uuid else "standalone",
                "balance": 0,
                "legacy_savings_id": savings_id,
                "notes": f"Auto-created from POST /api/savings/transactions ({savings_id})",
            }).execute()

            # Seed opening balance as the first credit.
            opening = Decimal(str(opening_savings_amount or 0))
            if opening > 0:
                mirror_savings_ledger_entry(
                    account_number=bridge_account_number,
                    entry_type="credit",
                    amount=opening,
                    transaction_id=f"OPEN-{savings_id}",
                    posted_by="cashier",
                    remarks="Account opening deposit",
                )
        except Exception as exc:  # noqa: BLE001
            print(f"[savings_accounts bridge] skipped for {savings_id}: {exc}")

        return {
            "success": True,
            "data": {
                "Savings_ID": savings_id,
                "Account_Number": savings_id,
                "savings_accounts_account_number": bridge_account_number,
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
            .select("Savings_ID,membership_number_id,Account_Name,Balance,Savings_Amount,Amount")
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

        transaction_amount = money(Decimal(str(payload.amount or 0)))
        if transaction_amount <= 0:
            raise HTTPException(status_code=400, detail="Deposit amount must be greater than zero.")

        current_balance = Decimal(
            str(
                account_row.get("Balance")
                if account_row.get("Balance") is not None
                else (
                    account_row.get("Savings_Amount")
                    if account_row.get("Savings_Amount") is not None
                    else account_row.get("Amount") or 0
                )
            )
        )
        new_balance = money(current_balance + transaction_amount)
        db_balance_value = int(new_balance.to_integral_value(rounding=ROUND_HALF_UP))

        (
            supabase.table("Savings_Transactions")
            .update({"Balance": db_balance_value, "Amount": db_balance_value})
            .eq("Savings_ID", clean_savings_id)
            .execute()
        )

        transaction_id = get_next_savings_cashier_transaction_id()
        posted_at_value = datetime.utcnow().isoformat()
        bridged_account_number = resolve_savings_account_number(clean_savings_id)
        queue_payload = {
            "transaction_id": transaction_id,
            "savings_id": clean_savings_id,
            "account_number": bridged_account_number,
            "membership_number_id": membership_key,
            "member_name": str(account_row.get("Account_Name") or "").strip() or None,
            "account_type": "Savings Deposit",
            "transaction_type": "deposit",
            "amount": decimal_to_float(transaction_amount),
            "transaction_status": "validated",
            "entered_by_role": "cashier",
            "requested_at": posted_at_value,
            "verified_at": posted_at_value,
            "verified_by": "system",
            "posted_at": posted_at_value,
            "notes": "Auto-posted deposit",
        }

        queue_response = (
            supabase.table("savings_transaction_queue")
            .insert(queue_payload)
            .execute()
        )
        queued_row = (queue_response.data or [None])[0]

        ledger_payload = {
            "transaction_id": transaction_id,
            "ledger_source": "Savings_Transactions",
            "source_id": clean_savings_id,
            "membership_number_id": membership_key,
            "account_type": "Savings Deposit",
            "entry_type": "credit",
            "amount": decimal_to_float(transaction_amount),
            "running_balance": decimal_to_float(new_balance),
            "posted_at": posted_at_value,
            "posted_by": "system",
            "remarks": "Auto-posted deposit",
        }
        try:
            (
                supabase.table("ledger_transactions")
                .insert(ledger_payload)
                .execute()
            )
        except Exception:
            pass

        # Phase-2 mirror write: keep savings_accounts.balance in sync.
        mirror_savings_ledger_entry(
            account_number=bridged_account_number,
            entry_type="credit",
            amount=transaction_amount,
            transaction_id=transaction_id,
            posted_by="cashier",
            remarks="Cashier deposit (auto-posted)",
        )

        return {
            "success": True,
            "data": {
                "transaction_id": transaction_id,
                "savings_id": clean_savings_id,
                "amount_deposited": decimal_to_float(transaction_amount),
                "transaction_status": "validated",
                "new_balance": decimal_to_float(new_balance),
                "record": queued_row,
            },
            "message": "Deposit posted successfully.",
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
            "account_number": resolve_savings_account_number(clean_savings_id),
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


# ---------------------------------------------------------------------------
# Phase-3 read endpoints (savings_accounts + savings_ledger)
# These are the new canonical reads. The legacy /api/cashier/savings/accounts*
# endpoints stay alive during cut-over so older UI continues to work.
# ---------------------------------------------------------------------------

def _resolve_account_number_from_param(param: str) -> str | None:
    """Accept either a savings_accounts.account_number (SA-NNNNNN) directly,
    or a legacy Savings_Transactions.Savings_ID and resolve it via the bridge.
    Returns None if neither matches."""
    if not supabase:
        return None
    key = str(param or "").strip()
    if not key:
        return None
    if key.upper().startswith("SA-"):
        return key
    return resolve_savings_account_number(key)


@app.get("/api/savings/accounts")
async def list_savings_accounts(
    kind: str | None = None,
    status: str | None = None,
    search: str | None = None,
):
    """List all savings accounts from the new canonical table.

    Query params:
      - kind:   'member' | 'standalone'
      - status: 'active' | 'closed' | 'frozen'
      - search: matches account_number, account_name (case-insensitive)
    """
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase client is not initialized.")

    try:
        query = (
            supabase.table("savings_accounts")
            .select("account_number,account_name,member_id,account_kind,balance,status,legacy_savings_id,created_at,updated_at")
            .order("account_name")
        )
        if kind:
            query = query.eq("account_kind", kind)
        if status:
            query = query.eq("status", status)
        rows = (query.execute().data or [])

        if search:
            term = search.strip().lower()
            rows = [
                r for r in rows
                if term in str(r.get("account_number", "")).lower()
                or term in str(r.get("account_name", "")).lower()
            ]

        # Enrich with membership_id when account is linked to a member.
        member_ids = sorted({r["member_id"] for r in rows if r.get("member_id")})
        member_lookup: dict[str, dict] = {}
        if member_ids:
            try:
                member_rows = (
                    supabase.table("member")
                    .select("id,membership_id,first_name,last_name")
                    .in_("id", member_ids)
                    .execute()
                ).data or []
                for m in member_rows:
                    member_lookup[m["id"]] = m
            except Exception:
                pass

        for r in rows:
            m = member_lookup.get(r.get("member_id"))
            r["membership_id"] = m.get("membership_id") if m else None

        return {"success": True, "data": rows, "count": len(rows)}
    except HTTPException as err:
        raise err
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Failed to list savings accounts: {err}")


@app.get("/api/savings/accounts/{account_param}")
async def get_savings_account(account_param: str):
    """Fetch one savings account with the most recent ledger entries.

    `account_param` may be a SA-NNNNNN number OR a legacy Savings_ID.
    """
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase client is not initialized.")

    account_number = _resolve_account_number_from_param(account_param)
    if not account_number:
        raise HTTPException(status_code=404, detail="Savings account not found.")

    try:
        acc_response = (
            supabase.table("savings_accounts")
            .select("*")
            .eq("account_number", account_number)
            .limit(1)
            .execute()
        )
        account = (acc_response.data or [None])[0]
        if not account:
            raise HTTPException(status_code=404, detail="Savings account not found.")

        ledger_response = (
            supabase.table("savings_ledger")
            .select("*")
            .eq("account_number", account_number)
            .order("posted_at", desc=True)
            .limit(10)
            .execute()
        )
        ledger = ledger_response.data or []

        member: dict | None = None
        if account.get("member_id"):
            try:
                member_response = (
                    supabase.table("member")
                    .select("id,membership_id,first_name,last_name,middle_name,is_bona_fide")
                    .eq("id", account["member_id"])
                    .limit(1)
                    .execute()
                )
                member = (member_response.data or [None])[0]
            except Exception:
                member = None

        return {
            "success": True,
            "data": {
                "account": account,
                "member": member,
                "recent_ledger": ledger,
            },
        }
    except HTTPException as err:
        raise err
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Failed to fetch savings account: {err}")


@app.get("/api/savings/accounts/{account_param}/ledger")
async def get_savings_account_ledger(
    account_param: str,
    limit: int = 100,
    offset: int = 0,
):
    """Paginated debit/credit history for one account, newest first."""
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase client is not initialized.")

    account_number = _resolve_account_number_from_param(account_param)
    if not account_number:
        raise HTTPException(status_code=404, detail="Savings account not found.")

    safe_limit = max(1, min(int(limit or 100), 500))
    safe_offset = max(0, int(offset or 0))

    try:
        response = (
            supabase.table("savings_ledger")
            .select("*")
            .eq("account_number", account_number)
            .order("posted_at", desc=True)
            .range(safe_offset, safe_offset + safe_limit - 1)
            .execute()
        )
        return {
            "success": True,
            "data": response.data or [],
            "limit": safe_limit,
            "offset": safe_offset,
        }
    except HTTPException as err:
        raise err
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Failed to fetch ledger: {err}")


@app.post("/api/savings/accounts/{account_number}/deposit")
async def post_savings_account_deposit(account_number: str, payload: CashierSavingsDepositRequest):
    """New-table-native deposit. Writes savings_ledger credit (trigger updates
    savings_accounts.balance) and mirrors to legacy Savings_Transactions when
    a legacy_savings_id bridge exists."""
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase client is not initialized.")

    account_number = str(account_number or "").strip()
    if not account_number:
        raise HTTPException(status_code=400, detail="account_number is required.")

    try:
        account_response = (
            supabase.table("savings_accounts")
            .select("account_number,account_name,member_id,balance,status,legacy_savings_id")
            .eq("account_number", account_number)
            .limit(1)
            .execute()
        )
        account = (account_response.data or [None])[0]
        if not account:
            raise HTTPException(status_code=404, detail="Savings account not found.")
        if account.get("status") != "active":
            raise HTTPException(status_code=400, detail=f"Account is {account.get('status')}; deposits not allowed.")

        amount = money(Decimal(str(payload.amount or 0)))
        if amount <= 0:
            raise HTTPException(status_code=400, detail="Deposit amount must be greater than zero.")

        transaction_id = get_next_savings_cashier_transaction_id()
        posted_at_value = datetime.utcnow().isoformat()

        # Queue row (validated immediately since cashier-posted deposit).
        try:
            supabase.table("savings_transaction_queue").insert({
                "transaction_id": transaction_id,
                "savings_id": account.get("legacy_savings_id") or account_number,
                "account_number": account_number,
                "member_name": account.get("account_name"),
                "account_type": "Savings Deposit",
                "transaction_type": "deposit",
                "amount": decimal_to_float(amount),
                "transaction_status": "validated",
                "entered_by_role": "cashier",
                "requested_at": posted_at_value,
                "verified_at": posted_at_value,
                "verified_by": "system",
                "posted_at": posted_at_value,
                "notes": "Cashier deposit (auto-posted)",
            }).execute()
        except Exception as exc:  # noqa: BLE001
            print(f"[deposit] queue insert failed: {exc}")

        # Canonical write: ledger credit. Trigger updates savings_accounts.balance.
        try:
            supabase.table("savings_ledger").insert({
                "account_number": account_number,
                "entry_type": "credit",
                "amount": decimal_to_float(amount),
                "reference": transaction_id,
                "source": "cashier_deposit",
                "remarks": "Cashier deposit",
                "posted_by": "cashier",
            }).execute()
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=500, detail=f"Failed to post ledger credit: {exc}")

        # Mirror to legacy Savings_Transactions if bridge exists.
        legacy_id = account.get("legacy_savings_id")
        if legacy_id:
            try:
                legacy_response = (
                    supabase.table("Savings_Transactions")
                    .select("Balance,Savings_Amount,Amount")
                    .eq("Savings_ID", legacy_id)
                    .limit(1)
                    .execute()
                )
                legacy_row = (legacy_response.data or [None])[0]
                if legacy_row:
                    current = Decimal(str(
                        legacy_row.get("Balance")
                        if legacy_row.get("Balance") is not None
                        else (legacy_row.get("Savings_Amount") or legacy_row.get("Amount") or 0)
                    ))
                    new_legacy = int(money(current + amount).to_integral_value(rounding=ROUND_HALF_UP))
                    supabase.table("Savings_Transactions").update({
                        "Balance": new_legacy,
                        "Amount": new_legacy,
                    }).eq("Savings_ID", legacy_id).execute()
            except Exception as exc:  # noqa: BLE001
                print(f"[deposit] legacy mirror skipped: {exc}")

        # Re-read account to return the trigger-updated balance.
        try:
            refreshed = (
                supabase.table("savings_accounts")
                .select("balance")
                .eq("account_number", account_number)
                .limit(1)
                .execute()
            )
            new_balance = (refreshed.data or [{"balance": 0}])[0].get("balance") or 0
        except Exception:
            new_balance = decimal_to_float(Decimal(str(account.get("balance") or 0)) + amount)

        return {
            "success": True,
            "message": "Deposit posted successfully.",
            "data": {
                "transaction_id": transaction_id,
                "account_number": account_number,
                "amount_deposited": decimal_to_float(amount),
                "new_balance": float(new_balance),
            },
        }
    except HTTPException as err:
        raise err
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Failed to post deposit: {err}")


@app.post("/api/savings/accounts/{account_number}/withdraw")
async def post_savings_account_withdraw(account_number: str, payload: CashierSavingsWithdrawRequest):
    """New-table-native withdrawal request. Inserts a pending_verification queue
    row only; no balance change until Bookkeeper confirms."""
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase client is not initialized.")

    account_number = str(account_number or "").strip()
    if not account_number:
        raise HTTPException(status_code=400, detail="account_number is required.")

    try:
        account_response = (
            supabase.table("savings_accounts")
            .select("account_number,account_name,balance,status,legacy_savings_id")
            .eq("account_number", account_number)
            .limit(1)
            .execute()
        )
        account = (account_response.data or [None])[0]
        if not account:
            raise HTTPException(status_code=404, detail="Savings account not found.")
        if account.get("status") != "active":
            raise HTTPException(status_code=400, detail=f"Account is {account.get('status')}; withdrawals not allowed.")

        amount = money(Decimal(str(payload.amount or 0)))
        if amount <= 0:
            raise HTTPException(status_code=400, detail="Withdrawal amount must be greater than zero.")

        current_balance = Decimal(str(account.get("balance") or 0))
        if amount > current_balance:
            raise HTTPException(status_code=400, detail="Withdrawal exceeds available balance.")

        transaction_id = get_next_savings_cashier_transaction_id()
        try:
            queue_response = supabase.table("savings_transaction_queue").insert({
                "transaction_id": transaction_id,
                "savings_id": account.get("legacy_savings_id") or account_number,
                "account_number": account_number,
                "member_name": account.get("account_name"),
                "account_type": "Savings Withdrawal",
                "transaction_type": "withdraw",
                "amount": decimal_to_float(amount),
                "transaction_status": "pending_verification",
                "entered_by_role": "cashier",
                "requested_at": datetime.utcnow().isoformat(),
            }).execute()
            queued = (queue_response.data or [None])[0]
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=500, detail=f"Failed to queue withdrawal: {exc}")

        return {
            "success": True,
            "message": "Withdrawal submitted; pending Bookkeeper verification.",
            "data": {
                "transaction_id": transaction_id,
                "account_number": account_number,
                "amount_requested": decimal_to_float(amount),
                "transaction_status": "pending_verification",
                "record": queued,
            },
        }
    except HTTPException as err:
        raise err
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Failed to post withdrawal: {err}")


# ---------------------------------------------------------------------------
# MIGS scoring — read-only roster + per-member detail for the bookkeeper.
# Live values: capital, loan availed YTD, savings balance, late-payment count.
# Defaulted values (until those modules are wired): groceries=0, PLI=no
# outside loan (10 pts), attendance=absent (0 pts). Scoring engine in
# migs_engine.py awards points and classifies MIGS vs Non-MIGS.
# ---------------------------------------------------------------------------
from migs_engine import compute_migs_score, result_to_dict  # noqa: E402

@app.get("/api/migs/members")
async def list_migs_members(year: int | None = None):
    """List all members with the raw inputs needed for MIGS scoring.

    Query params:
      - year: filter loan-availed and late-payment counts to this calendar year.
              Defaults to the current UTC year. Capital and savings are
              point-in-time balances and ignore the year filter.
    """
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase client is not initialized.")

    target_year = int(year) if year else datetime.utcnow().year

    try:
        # --- Member roster ------------------------------------------------
        member_table = _resolve_member_table(supabase) if "_resolve_member_table" in globals() else "member"
        members_response = (
            supabase.table(member_table)
            .select("id,membership_id,first_name,last_name,is_bona_fide")
            .order("last_name")
            .execute()
        )
        members = members_response.data or []
        member_ids = [m["id"] for m in members if m.get("id")]
        if not member_ids:
            return {"success": True, "data": [], "year": target_year, "count": 0}

        # --- Middle name from personal_data_sheet (latest row per member) -
        # member table only stores first/last; PDS has middle/surname split.
        membership_keys = [m.get("membership_id") for m in members if m.get("membership_id")]
        pds_by_membership: dict[str, dict] = {}
        if membership_keys:
            try:
                pds_response = (
                    supabase.table("personal_data_sheet")
                    .select("membership_number_id,first_name,middle_name,surname,last_name,created_at")
                    .in_("membership_number_id", membership_keys)
                    .order("created_at", desc=True)
                    .execute()
                )
                for row in pds_response.data or []:
                    key = row.get("membership_number_id")
                    if key and key not in pds_by_membership:
                        pds_by_membership[key] = row
            except Exception as exc:  # noqa: BLE001
                print(f"[migs] PDS lookup failed: {exc}")

        # --- Capital Build-Up (latest ending_share_capital per member) ----
        # We need the most recent row per member, so pull all rows ordered
        # by transaction_date DESC and pick the first occurrence of each id.
        cbu_by_member: dict[str, float] = {}
        try:
            cbu_response = (
                supabase.table("capital_build_up")
                .select("member_id,ending_share_capital,transaction_date")
                .in_("member_id", member_ids)
                .order("transaction_date", desc=True)
                .execute()
            )
            for row in cbu_response.data or []:
                mid = row.get("member_id")
                if mid and mid not in cbu_by_member:
                    cbu_by_member[mid] = float(row.get("ending_share_capital") or 0)
        except Exception as exc:  # noqa: BLE001
            print(f"[migs] cbu lookup failed: {exc}")

        # --- Loan availed YTD (sum of principal_amount this year) ---------
        loans_by_member: dict[str, float] = {m: 0.0 for m in member_ids}
        try:
            loans_response = (
                supabase.table("loans")
                .select("member_id,principal_amount,application_date,loan_status")
                .in_("member_id", member_ids)
                .gte("application_date", f"{target_year}-01-01")
                .lte("application_date", f"{target_year}-12-31")
                .execute()
            )
            for row in loans_response.data or []:
                status_lc = str(row.get("loan_status") or "").lower()
                if status_lc in {"rejected", "cancelled", "canceled"}:
                    continue
                mid = row.get("member_id")
                if mid:
                    loans_by_member[mid] = loans_by_member.get(mid, 0.0) + float(
                        row.get("principal_amount") or 0
                    )
        except Exception as exc:  # noqa: BLE001
            print(f"[migs] loans lookup failed: {exc}")

        # --- Savings balance (sum of savings_accounts.balance, kind=member, active)
        savings_by_member: dict[str, float] = {m: 0.0 for m in member_ids}
        try:
            savings_response = (
                supabase.table("savings_accounts")
                .select("member_id,balance,account_kind,status")
                .in_("member_id", member_ids)
                .eq("account_kind", "member")
                .eq("status", "active")
                .execute()
            )
            for row in savings_response.data or []:
                mid = row.get("member_id")
                if mid:
                    savings_by_member[mid] = savings_by_member.get(mid, 0.0) + float(
                        row.get("balance") or 0
                    )
        except Exception as exc:  # noqa: BLE001
            print(f"[migs] savings lookup failed: {exc}")

        # --- Late payment count YTD ---------------------------------------
        # Pull validated payments for this year, join in-memory to schedules
        # so we can compare payment_date > due_date.
        late_count_by_member: dict[str, int] = {m: 0 for m in member_ids}
        try:
            payments_response = (
                supabase.table("loan_payments")
                .select("loan_id,schedule_id,payment_date,confirmation_status")
                .gte("payment_date", f"{target_year}-01-01")
                .lte("payment_date", f"{target_year}-12-31")
                .eq("confirmation_status", "validated")
                .execute()
            )
            payments = payments_response.data or []

            schedule_ids = sorted({p["schedule_id"] for p in payments if p.get("schedule_id")})
            loan_ids = sorted({p["loan_id"] for p in payments if p.get("loan_id")})

            schedule_due: dict[str, str] = {}
            if schedule_ids:
                sched_response = (
                    supabase.table("loan_schedules")
                    .select("id,due_date")
                    .in_("id", schedule_ids)
                    .execute()
                )
                for s in sched_response.data or []:
                    if s.get("id") and s.get("due_date"):
                        schedule_due[s["id"]] = s["due_date"]

            loan_to_member: dict[str, str] = {}
            if loan_ids:
                loan_member_response = (
                    supabase.table("loans")
                    .select("control_number,member_id")
                    .in_("control_number", loan_ids)
                    .execute()
                )
                for l in loan_member_response.data or []:
                    if l.get("control_number") and l.get("member_id"):
                        loan_to_member[l["control_number"]] = l["member_id"]

            for p in payments:
                due_str = schedule_due.get(p.get("schedule_id"))
                paid_str = p.get("payment_date")
                if not due_str or not paid_str:
                    continue
                try:
                    paid_dt = datetime.fromisoformat(str(paid_str).replace("Z", "+00:00")).date()
                    due_dt = datetime.fromisoformat(str(due_str)).date() if "T" in str(due_str) else datetime.strptime(str(due_str), "%Y-%m-%d").date()
                except Exception:
                    continue
                if paid_dt > due_dt:
                    mid = loan_to_member.get(p.get("loan_id"))
                    if mid:
                        late_count_by_member[mid] = late_count_by_member.get(mid, 0) + 1
        except Exception as exc:  # noqa: BLE001
            print(f"[migs] late-payment lookup failed: {exc}")

        # --- General Assembly attendance (this year) ----------------------
        # Member is "Present" if general_assembly_attendance has any row with
        # status='Present' within the target year.
        ga_present_by_member: dict[str, bool] = {}
        try:
            ga_response = (
                supabase.table("general_assembly_attendance")
                .select("member_id,status,meeting_date")
                .eq("status", "Present")
                .gte("meeting_date", f"{target_year}-01-01")
                .lte("meeting_date", f"{target_year}-12-31")
                .execute()
            )
            for row in ga_response.data or []:
                mid = row.get("member_id")
                if mid:
                    ga_present_by_member[mid] = True
        except Exception as exc:  # noqa: BLE001
            print(f"[migs] GA attendance lookup failed: {exc}")

        # --- Compose response --------------------------------------------
        rows = []
        for m in members:
            mid = m.get("id")
            pds = pds_by_membership.get(m.get("membership_id")) or {}
            first = pds.get("first_name") or m.get("first_name")
            middle = pds.get("middle_name")
            last = pds.get("surname") or pds.get("last_name") or m.get("last_name")
            full_name = " ".join(
                str(part).strip()
                for part in (first, middle, last)
                if str(part or "").strip()
            ).strip() or "Unknown Member"

            capital_v = cbu_by_member.get(mid, 0.0)
            loan_v = loans_by_member.get(mid, 0.0)
            savings_v = savings_by_member.get(mid, 0.0)
            late_v = late_count_by_member.get(mid, 0)

            attendance_v = ga_present_by_member.get(mid, False)
            result = compute_migs_score(
                cbu_added=capital_v,
                loan_availed=loan_v,
                savings_balance=savings_v,
                late_payment_count=late_v,
                # Unwired modules — pass None so engine applies safe defaults:
                # groceries=0 (3 pts base), outside_loan=False (10 pts).
                groceries_availed=None,
                has_outside_loan=None,
                assembly_present=attendance_v,
            )

            rows.append({
                "id": mid,
                "member_id": m.get("membership_id"),
                "full_name": full_name,
                "is_bona_fide": bool(m.get("is_bona_fide")),
                "capital": capital_v,
                "loan_balance": loan_v,
                "savings_balance": savings_v,
                "late_payment_count": late_v,
                # Unwired criteria — surfaced for transparency in the UI.
                "groceries_availed": None,
                "has_outside_loan": None,
                "assembly_attendance": "Present" if attendance_v else "Absent",
                # Live score + classification.
                "migs_score": result.total_score,
                "migs_status": result.status,
                "loan_multiplier": result.loan_multiplier,
                "can_vote": result.can_vote,
            })

        return {
            "success": True,
            "data": rows,
            "year": target_year,
            "count": len(rows),
        }
    except HTTPException as err:
        raise err
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Failed to load MIGS members: {err}")


@app.post("/api/migs/recompute-all")
async def recompute_all_migs(year: int | None = None):
    """Run the MIGS engine for every member and persist a snapshot row into
    public.member_classification_temporal.

    Snapshot keying:
      - accrual_date = current week's Saturday (table constraint requires it)
      - one row per (member_id, accrual_date); re-running the same week
        updates the existing row instead of creating duplicates.

    Other modules can then read the latest snapshot via /api/migs/label/{id}.
    """
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase client is not initialized.")

    target_year = int(year) if year else datetime.utcnow().year

    # Resolve the upcoming/current Saturday (ISO weekday 6).
    today = datetime.utcnow().date()
    days_until_sat = (5 - today.weekday()) % 7  # weekday(): Mon=0..Sun=6, Sat=5
    accrual_date = (today if days_until_sat == 0 else today.replace()) if days_until_sat == 0 else today
    if days_until_sat != 0:
        from datetime import timedelta
        # Snap to the most recent past Saturday so the snapshot covers a complete week.
        days_since_sat = (today.weekday() - 5) % 7
        accrual_date = today - timedelta(days=days_since_sat)
    accrual_iso = accrual_date.isoformat()

    # Resolve classification_level FK ids once.
    try:
        levels_response = (
            supabase.table("classification_level")
            .select("classification_level_id,code")
            .in_("code", ["migs", "non_migs"])
            .execute()
        )
        levels = {row["code"]: row["classification_level_id"] for row in levels_response.data or []}
        if "migs" not in levels or "non_migs" not in levels:
            raise HTTPException(
                status_code=500,
                detail="classification_level rows missing. Apply migs_classification_levels.sql.",
            )
    except HTTPException as err:
        raise err
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Failed to resolve classification levels: {exc}")

    # Reuse the same data-gathering as /api/migs/members.
    try:
        members_payload = await list_migs_members(year=target_year)  # type: ignore[arg-type]
    except HTTPException as err:
        raise err
    members = members_payload.get("data", [])

    # Compute all rows in-memory first, then write in two bulk calls.
    from migs_engine import compute_migs_score
    payloads = []
    errors = []
    for m in members:
        mid = m.get("id")
        if not mid:
            continue
        result = compute_migs_score(
            cbu_added=m.get("capital") or 0,
            loan_availed=m.get("loan_balance") or 0,
            savings_balance=m.get("savings_balance") or 0,
            late_payment_count=m.get("late_payment_count") or 0,
            groceries_availed=None,
            has_outside_loan=None,
            assembly_present=(m.get("assembly_attendance") == "Present"),
        )
        bp = {c.criterion: c.score for c in result.breakdown}
        # Schema constraint allows `final_status` only on first-week snapshots
        # (accrual day <= 7). Outside that window, leave it NULL — the label is
        # still resolvable via classification_level_id.
        in_first_week = accrual_date.day <= 7
        payloads.append({
            "membership_number_id": mid,
            "classification_level_id": levels["migs"] if result.status == "MIGS Qualified" else levels["non_migs"],
            "accrual_date": accrual_iso,
            "cbu_points":        bp.get("Capital Build-Up", 0),
            "loan_points":       bp.get("Loan Availed", 0),
            "savings_points":    bp.get("Savings / Time Deposit", 0),
            "payment_points":    bp.get("Payment Record (late count)", 0),
            "grocery_points":    bp.get("Groceries Availed", 0),
            "pli_points":        bp.get("Loans from Other PLIs", 0),
            "attendance_points": bp.get("Assembly Attendance", 0),
            "final_status": result.status if in_first_week else None,
        })

    # Bulk wipe + insert for this snapshot date. Two network calls instead of 2N.
    inserted = 0
    updated = 0
    if payloads:
        try:
            # Count how many existed before (for reporting; not strictly needed).
            pre = (
                supabase.table("member_classification_temporal")
                .select("classification_id", count="exact")
                .eq("accrual_date", accrual_iso)
                .execute()
            )
            pre_count = pre.count or 0

            supabase.table("member_classification_temporal").delete().eq(
                "accrual_date", accrual_iso
            ).execute()

            # Supabase Python client batch-inserts in one network round-trip.
            supabase.table("member_classification_temporal").insert(payloads).execute()

            # Treat overlap as "updated", new ones as "inserted".
            updated = min(pre_count, len(payloads))
            inserted = max(0, len(payloads) - pre_count)
        except Exception as exc:  # noqa: BLE001
            errors.append({"member": "BULK", "error": str(exc)[:400]})

    return {
        "success": True if not errors else False,
        "accrual_date": accrual_iso,
        "year": target_year,
        "members_processed": len(members),
        "inserted": inserted,
        "updated": updated,
        "errors": errors,
    }


@app.get("/api/migs/label/{member_key}")
async def get_migs_label(member_key: str):
    """Cheap MIGS classification lookup for other modules.

    Returns the most recent snapshot row from member_classification_temporal.
    Used by loan-approval, member-dashboard, etc. to know if a member is MIGS
    without re-running the scoring engine.

    `member_key` accepts either member.id (UUID) or member.membership_id.
    """
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase client is not initialized.")

    key = str(member_key or "").strip()
    if not key:
        raise HTTPException(status_code=400, detail="member_key is required.")

    try:
        member_table = _resolve_member_table(supabase) if "_resolve_member_table" in globals() else "member"
        lookup_field = "id" if len(key) == 36 and key.count("-") == 4 else "membership_id"
        member_response = (
            supabase.table(member_table)
            .select("id,membership_id,first_name,last_name")
            .eq(lookup_field, key)
            .limit(1)
            .execute()
        )
        member = (member_response.data or [None])[0]
        if not member:
            raise HTTPException(status_code=404, detail="Member not found.")

        snapshot_response = (
            supabase.table("member_classification_temporal")
            .select("accrual_date,total_score,final_status,classification_level_id,cbu_points,loan_points,savings_points,payment_points,grocery_points,pli_points,attendance_points")
            .eq("membership_number_id", member["id"])
            .order("accrual_date", desc=True)
            .limit(1)
            .execute()
        )
        snapshot = (snapshot_response.data or [None])[0]

        if not snapshot:
            return {
                "success": True,
                "data": {
                    "member_id": member["id"],
                    "membership_id": member.get("membership_id"),
                    "label": "Unscored",
                    "score": None,
                    "as_of": None,
                    "loan_multiplier": 3.0,
                    "can_vote": False,
                },
            }

        # final_status is only populated on first-week snapshots (schema constraint).
        # Fall back to the classification_level lookup for mid-month snapshots.
        label = snapshot.get("final_status")
        if not label and snapshot.get("classification_level_id"):
            try:
                level_response = (
                    supabase.table("classification_level")
                    .select("label")
                    .eq("classification_level_id", snapshot["classification_level_id"])
                    .limit(1)
                    .execute()
                )
                lvl = (level_response.data or [None])[0]
                if lvl:
                    label = lvl.get("label")
            except Exception:
                pass
        snapshot["final_status"] = label
        is_migs = str(label or "").lower().startswith("migs")
        return {
            "success": True,
            "data": {
                "member_id": member["id"],
                "membership_id": member.get("membership_id"),
                "label": snapshot.get("final_status"),
                "score": snapshot.get("total_score"),
                "as_of": snapshot.get("accrual_date"),
                "loan_multiplier": 5.0 if is_migs else 3.0,
                "can_vote": is_migs,
                "breakdown": {
                    "cbu":        snapshot.get("cbu_points"),
                    "loan":       snapshot.get("loan_points"),
                    "savings":    snapshot.get("savings_points"),
                    "payment":    snapshot.get("payment_points"),
                    "grocery":    snapshot.get("grocery_points"),
                    "pli":        snapshot.get("pli_points"),
                    "attendance": snapshot.get("attendance_points"),
                },
            },
        }
    except HTTPException as err:
        raise err
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Failed to fetch MIGS label: {err}")


@app.get("/api/migs/members/{member_key}")
async def get_migs_member_detail(member_key: str, year: int | None = None):
    """Single-member MIGS detail for the Evaluate page.

    `member_key` may be either the member.id UUID or the membership_id (e.g. TTMPC-123).
    Returns the same raw fields as the list endpoint plus a scoring_breakdown stub
    so the existing UI can render. Score/status remain null until the engine ships.
    """
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase client is not initialized.")

    target_year = int(year) if year else datetime.utcnow().year
    key = str(member_key or "").strip()
    if not key:
        raise HTTPException(status_code=400, detail="member_key is required.")

    try:
        member_table = _resolve_member_table(supabase) if "_resolve_member_table" in globals() else "member"
        lookup_field = "id" if len(key) == 36 and key.count("-") == 4 else "membership_id"
        member_response = (
            supabase.table(member_table)
            .select("id,membership_id,first_name,last_name,is_bona_fide")
            .eq(lookup_field, key)
            .limit(1)
            .execute()
        )
        member = (member_response.data or [None])[0]
        if not member:
            raise HTTPException(status_code=404, detail="Member not found.")

        mid = member["id"]
        membership_id = member.get("membership_id")

        # --- Middle name from PDS -----------------------------------------
        pds = None
        if membership_id:
            try:
                pds_response = (
                    supabase.table("personal_data_sheet")
                    .select("first_name,middle_name,surname,last_name")
                    .eq("membership_number_id", membership_id)
                    .order("created_at", desc=True)
                    .limit(1)
                    .execute()
                )
                pds = (pds_response.data or [None])[0]
            except Exception:
                pds = None
        pds = pds or {}
        first = pds.get("first_name") or member.get("first_name")
        middle = pds.get("middle_name")
        last = pds.get("surname") or pds.get("last_name") or member.get("last_name")
        full_name = " ".join(
            str(part).strip() for part in (first, middle, last) if str(part or "").strip()
        ).strip() or "Unknown Member"

        # --- Capital ------------------------------------------------------
        capital = 0.0
        try:
            cbu_response = (
                supabase.table("capital_build_up")
                .select("ending_share_capital,transaction_date")
                .eq("member_id", mid)
                .order("transaction_date", desc=True)
                .limit(1)
                .execute()
            )
            cbu_row = (cbu_response.data or [None])[0]
            if cbu_row:
                capital = float(cbu_row.get("ending_share_capital") or 0)
        except Exception as exc:  # noqa: BLE001
            print(f"[migs detail] cbu lookup failed: {exc}")

        # --- Loan availed (this year) ------------------------------------
        loan_availed = 0.0
        try:
            loans_response = (
                supabase.table("loans")
                .select("principal_amount,application_date,loan_status")
                .eq("member_id", mid)
                .gte("application_date", f"{target_year}-01-01")
                .lte("application_date", f"{target_year}-12-31")
                .execute()
            )
            for row in loans_response.data or []:
                status_lc = str(row.get("loan_status") or "").lower()
                if status_lc in {"rejected", "cancelled", "canceled"}:
                    continue
                loan_availed += float(row.get("principal_amount") or 0)
        except Exception as exc:  # noqa: BLE001
            print(f"[migs detail] loans lookup failed: {exc}")

        # --- Savings ------------------------------------------------------
        savings = 0.0
        try:
            savings_response = (
                supabase.table("savings_accounts")
                .select("balance")
                .eq("member_id", mid)
                .eq("account_kind", "member")
                .eq("status", "active")
                .execute()
            )
            for row in savings_response.data or []:
                savings += float(row.get("balance") or 0)
        except Exception as exc:  # noqa: BLE001
            print(f"[migs detail] savings lookup failed: {exc}")

        # --- Late payments (this year) -----------------------------------
        late_count = 0
        try:
            loans_for_member = (
                supabase.table("loans")
                .select("control_number")
                .eq("member_id", mid)
                .execute()
            ).data or []
            control_numbers = [l["control_number"] for l in loans_for_member if l.get("control_number")]
            if control_numbers:
                payments_response = (
                    supabase.table("loan_payments")
                    .select("schedule_id,payment_date,confirmation_status,loan_id")
                    .in_("loan_id", control_numbers)
                    .gte("payment_date", f"{target_year}-01-01")
                    .lte("payment_date", f"{target_year}-12-31")
                    .eq("confirmation_status", "validated")
                    .execute()
                )
                payments = payments_response.data or []
                schedule_ids = sorted({p["schedule_id"] for p in payments if p.get("schedule_id")})
                schedule_due: dict[str, str] = {}
                if schedule_ids:
                    sched_response = (
                        supabase.table("loan_schedules")
                        .select("id,due_date")
                        .in_("id", schedule_ids)
                        .execute()
                    )
                    for s in sched_response.data or []:
                        if s.get("id") and s.get("due_date"):
                            schedule_due[s["id"]] = s["due_date"]
                for p in payments:
                    due_str = schedule_due.get(p.get("schedule_id"))
                    paid_str = p.get("payment_date")
                    if not due_str or not paid_str:
                        continue
                    try:
                        paid_dt = datetime.fromisoformat(str(paid_str).replace("Z", "+00:00")).date()
                        due_dt = (
                            datetime.fromisoformat(str(due_str)).date()
                            if "T" in str(due_str)
                            else datetime.strptime(str(due_str), "%Y-%m-%d").date()
                        )
                    except Exception:
                        continue
                    if paid_dt > due_dt:
                        late_count += 1
        except Exception as exc:  # noqa: BLE001
            print(f"[migs detail] late-payment lookup failed: {exc}")

        # --- General Assembly attendance (this year) ----------------------
        attendance_present = False
        try:
            ga_response = (
                supabase.table("general_assembly_attendance")
                .select("status,meeting_date")
                .eq("member_id", mid)
                .eq("status", "Present")
                .gte("meeting_date", f"{target_year}-01-01")
                .lte("meeting_date", f"{target_year}-12-31")
                .limit(1)
                .execute()
            )
            attendance_present = bool(ga_response.data)
        except Exception as exc:  # noqa: BLE001
            print(f"[migs detail] GA lookup failed: {exc}")

        # --- Score using the engine (safe defaults for unwired modules) ---
        result = compute_migs_score(
            cbu_added=capital,
            loan_availed=loan_availed,
            savings_balance=savings,
            late_payment_count=late_count,
            groceries_availed=None,
            has_outside_loan=None,
            assembly_present=attendance_present,
        )
        scored = result_to_dict(result)

        return {
            "success": True,
            "data": {
                "id": mid,
                "member_id": membership_id,
                "full_name": full_name,
                "is_bona_fide": bool(member.get("is_bona_fide")),
                "year": target_year,
                "capital": capital,
                "loan_availed": loan_availed,
                "savings_balance": savings,
                "late_payment_count": late_count,
                "migs_score": scored["total_score"],
                "migs_status": scored["status"],
                "loan_multiplier": scored["loan_multiplier"],
                "can_vote": scored["can_vote"],
                "scoring_breakdown": scored["breakdown"],
            },
        }
    except HTTPException as err:
        raise err
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Failed to load MIGS member detail: {err}")


# ---------------------------------------------------------------------------
# General Assembly attendance — Secretary portal.
# Stores Present/Absent + remarks per member into attendance_logs with
# meeting_type='GA'. Each GA day is identified by (meeting_date, membership_number_id).
# The MIGS scoring engine reads from this table to award the 5pt attendance criterion.
# ---------------------------------------------------------------------------

@app.get("/api/secretary/general-assembly/{year}")
async def get_ga_attendance_roster(year: int):
    """Return every coop member with their GA attendance status for the year.

    Defaults each member to status='Absent' (no row) unless an attendance_logs
    row exists with meeting_type='GA' for that member within the year.
    """
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase client is not initialized.")

    try:
        year_int = int(year)
        member_table = _resolve_member_table(supabase) if "_resolve_member_table" in globals() else "member"
        members_response = (
            supabase.table(member_table)
            .select("id,membership_id,first_name,last_name")
            .order("last_name")
            .execute()
        )
        members = members_response.data or []

        # Load PDS for middle names (best-effort).
        membership_keys = [m.get("membership_id") for m in members if m.get("membership_id")]
        pds_by_membership: dict[str, dict] = {}
        if membership_keys:
            try:
                pds_response = (
                    supabase.table("personal_data_sheet")
                    .select("membership_number_id,first_name,middle_name,surname,last_name,created_at")
                    .in_("membership_number_id", membership_keys)
                    .order("created_at", desc=True)
                    .execute()
                )
                for row in pds_response.data or []:
                    key = row.get("membership_number_id")
                    if key and key not in pds_by_membership:
                        pds_by_membership[key] = row
            except Exception:
                pds_by_membership = {}

        # Load existing GA rows for the year.
        ga_by_member: dict[str, dict] = {}
        ga_meeting_date_used: str | None = None
        try:
            ga_response = (
                supabase.table("general_assembly_attendance")
                .select("member_id,meeting_date,status,remarks,recorded_at")
                .gte("meeting_date", f"{year_int}-01-01")
                .lte("meeting_date", f"{year_int}-12-31")
                .order("recorded_at", desc=True)
                .execute()
            )
            for row in ga_response.data or []:
                mid = row.get("member_id")
                if mid and mid not in ga_by_member:
                    ga_by_member[mid] = row
                    if row.get("meeting_date") and not ga_meeting_date_used:
                        ga_meeting_date_used = str(row["meeting_date"])
        except Exception as exc:  # noqa: BLE001
            print(f"[GA] roster lookup failed: {exc}")

        rows = []
        for m in members:
            mid = m.get("id")
            pds = pds_by_membership.get(m.get("membership_id")) or {}
            first = pds.get("first_name") or m.get("first_name")
            middle = pds.get("middle_name")
            last = pds.get("surname") or pds.get("last_name") or m.get("last_name")
            full_name = " ".join(
                str(p).strip() for p in (first, middle, last) if str(p or "").strip()
            ).strip() or "Unknown Member"

            log = ga_by_member.get(mid)
            rows.append({
                "id": mid,
                "membership_id": m.get("membership_id"),
                "full_name": full_name,
                "status": (log or {}).get("status") or "Absent",
                "remarks": (log or {}).get("remarks") or "",
                "meeting_date": (log or {}).get("meeting_date"),
                "recorded_at": (log or {}).get("recorded_at"),
            })

        return {
            "success": True,
            "year": year_int,
            "default_meeting_date": ga_meeting_date_used or f"{year_int}-03-01",
            "data": rows,
            "count": len(rows),
        }
    except HTTPException as err:
        raise err
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Failed to load GA roster: {err}")


@app.post("/api/secretary/general-assembly/save")
async def save_ga_attendance(payload: dict = Body(...)):
    """Bulk-save GA attendance for a given meeting date.

    Body shape:
      {
        "meeting_date": "2026-03-15",
        "recorded_by": "<uuid|null>",
        "entries": [
          { "membership_number_id": "<member.id uuid>", "status": "Present", "remarks": "" },
          ...
        ]
      }

    Upserts one row per member into attendance_logs with meeting_type='GA'.
    Conflict key: (membership_number_id, meeting_date, meeting_type).
    """
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase client is not initialized.")

    meeting_date = str(payload.get("meeting_date") or "").strip()
    if not meeting_date:
        raise HTTPException(status_code=400, detail="meeting_date is required.")
    try:
        datetime.strptime(meeting_date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="meeting_date must be YYYY-MM-DD.")

    entries = payload.get("entries") or []
    if not isinstance(entries, list) or not entries:
        raise HTTPException(status_code=400, detail="entries must be a non-empty list.")

    recorded_by = payload.get("recorded_by") or None
    now_iso = datetime.utcnow().isoformat()

    inserted = 0
    updated = 0
    errors = []

    for entry in entries:
        mid = str(entry.get("membership_number_id") or "").strip()
        status = str(entry.get("status") or "").strip()
        remarks = str(entry.get("remarks") or "").strip() or None
        if not mid:
            continue
        if status not in {"Present", "Absent"}:
            errors.append({"member": mid, "error": f"invalid status '{status}'"})
            continue

        # Look up existing row (member_id + meeting_date).
        try:
            existing = (
                supabase.table("general_assembly_attendance")
                .select("id")
                .eq("member_id", mid)
                .eq("meeting_date", meeting_date)
                .limit(1)
                .execute()
            )
            existing_row = (existing.data or [None])[0]
        except Exception as exc:  # noqa: BLE001
            errors.append({"member": mid, "error": f"lookup failed: {exc}"})
            continue

        if existing_row:
            try:
                supabase.table("general_assembly_attendance").update({
                    "status": status,
                    "remarks": remarks,
                    "recorded_at": now_iso,
                    "recorded_by": recorded_by,
                    "updated_at": now_iso,
                }).eq("id", existing_row["id"]).execute()
                updated += 1
            except Exception as exc:  # noqa: BLE001
                errors.append({"member": mid, "error": f"update failed: {exc}"})
        else:
            insert_payload = {
                "member_id": mid,
                "meeting_date": meeting_date,
                "status": status,
                "remarks": remarks,
                "recorded_at": now_iso,
                "recorded_by": recorded_by,
            }
            try:
                supabase.table("general_assembly_attendance").insert(insert_payload).execute()
                inserted += 1
            except Exception as exc:  # noqa: BLE001
                errors.append({"member": mid, "error": f"insert failed: {exc}"})

    return {
        "success": True if not errors else False,
        "inserted": inserted,
        "updated": updated,
        "errors": errors,
        "meeting_date": meeting_date,
    }


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

        # Try legacy Savings_Transactions first; if missing (account only lives
        # in the new tables), fall back to savings_accounts.balance.
        savings_response = (
            supabase.table("Savings_Transactions")
            .select("Savings_ID,Balance,Savings_Amount,Amount")
            .eq("Savings_ID", savings_id)
            .limit(1)
            .execute()
        )
        savings_row = (savings_response.data or [None])[0]

        account_number_bridge = (
            queue_row.get("account_number")
            or resolve_savings_account_number(savings_id)
        )

        if savings_row:
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
        elif account_number_bridge:
            new_acc_response = (
                supabase.table("savings_accounts")
                .select("balance")
                .eq("account_number", account_number_bridge)
                .limit(1)
                .execute()
            )
            new_acc_row = (new_acc_response.data or [None])[0]
            if not new_acc_row:
                raise HTTPException(status_code=404, detail="Savings account not found.")
            current_balance = Decimal(str(new_acc_row.get("balance") or 0))
        else:
            raise HTTPException(status_code=404, detail="Savings account not found.")

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

        # Only mutate legacy table if the row exists.
        if savings_row:
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

        # Phase-2 mirror write: keep savings_accounts.balance in sync.
        # Deposits were already mirrored at cashier-post time (auto-validated),
        # so only mirror withdrawals here to avoid double-credit.
        if transaction_type == "withdraw":
            mirror_savings_ledger_entry(
                account_number=account_number_bridge,
                entry_type="debit",
                amount=transaction_amount,
                transaction_id=clean_transaction_id,
                posted_by=payload.validated_by or "bookkeeper",
                remarks=payload.notes or "Bookkeeper-confirmed withdrawal",
            )

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
                "control_number,loan_amount,principal_amount,interest_rate,term,loan_status,total_interest,monthly_amortization," \
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
        total_interest_amount = Decimal(str(loan_row.get("total_interest") or 0))
        if total_interest_amount <= 0:
            monthly_amort_val = Decimal(str(loan_row.get("monthly_amortization") or 0))
            if monthly_amort_val > 0 and term_months > 0:
                total_interest_amount = max(monthly_amort_val * term_months - principal_amount, Decimal("0"))
        total_payable_amount = principal_amount + total_interest_amount
        remaining_loan_balance = max(total_payable_amount - total_validated_after, Decimal("0"))

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

def _resolve_loan_member_meta(loan_id: str) -> dict[str, Any]:
    """Server-side lookup of member_name + loan_type + member_id for a loan
    control number. Used by the notification endpoints so the frontend doesn't
    have to pass (and can't spoof) display metadata. Returns empty values on miss."""
    out: dict[str, Any] = {"member_name": "", "loan_type": "", "member_id": ""}
    if not supabase or not loan_id:
        return out
    try:
        resp = (
            supabase.table("loans")
            .select(
                "control_number, member_id, member:member_id(first_name,last_name), "
                "loan_type:loan_type_id(name)"
            )
            .eq("control_number", loan_id)
            .limit(1)
            .execute()
        )
        row = (resp.data or [None])[0]
        if row:
            out["member_id"] = str(row.get("member_id") or "").strip()
            member = row.get("member") or {}
            name = f"{(member.get('first_name') or '').strip()} {(member.get('last_name') or '').strip()}".strip()
            out["member_name"] = name
            lt = row.get("loan_type") or {}
            out["loan_type"] = (lt.get("name") or "").strip() if isinstance(lt, dict) else ""
    except Exception:
        pass
    # Fallback to koica_loans for non-member applicants.
    if not out["member_name"]:
        try:
            resp = (
                supabase.table("koica_loans")
                .select("control_number, full_name")
                .eq("control_number", loan_id)
                .limit(1)
                .execute()
            )
            row = (resp.data or [None])[0]
            if row:
                out["member_name"] = (row.get("full_name") or "").strip()
        except Exception:
            pass
    return out


# Maps each staff (workflow) notification type to the corresponding
# member-facing notification type fired in parallel. None = no member echo.
_STAFF_TO_MEMBER_NOTIFICATION: dict[str, str | None] = {
    "recommend": "member_recommended",     # bookkeeper recommended -> member: forwarded to Manager
    "decline":   "member_bk_declined",     # bookkeeper declined    -> member: declined
    "approve":   "member_approved",        # manager approved       -> member: approved
    "reject":    "member_mgr_rejected",    # manager rejected       -> member: rejected
    "revise":    "member_mgr_revise",      # manager revise         -> member: revise
}


def _fan_out_member_notification(
    *,
    notification_type: str,
    loan_id: str,
    member_id: str | None,
    member_name: str | None,
    loan_type: str | None,
    actor_user_id: str | None,
    status_label: str | None = None,
) -> None:
    """Fire a member-targeted notification. Safe wrapper for BackgroundTasks.
    Always swallows exceptions so it never blocks the workflow."""
    try:
        _create_loan_notification(
            supabase,
            recipient_role="member",
            notification_type=notification_type,
            loan_id=loan_id,
            member_name=member_name or None,
            loan_type=loan_type or None,
            status_label=status_label or notification_type,
            actor_user_id=actor_user_id,
            recipient_member_id=member_id or None,
        )
    except Exception:
        pass


@app.post("/api/loans/notifications/dispatch")
async def dispatch_loan_in_app_notification(
    payload: LoanInAppNotificationRequest,
    background_tasks: BackgroundTasks,
):
    """Create an internal staff notification (bell feed) for a loan transition.

    Fire-and-forget: scheduled via BackgroundTasks. Dedup, persistence, and
    error handling are owned by `loan_notification_service.create_loan_notification`.
    Workflow MUST NOT break if this fails — endpoint always returns 200.
    """
    if not supabase:
        return {"success": False, "queued": False, "detail": "Supabase client unavailable."}

    # Resolve trusted metadata server-side. Falls back to client-supplied values.
    meta = _resolve_loan_member_meta(payload.loan_id)
    member_name = meta["member_name"] or (payload.member_name or "").strip()
    loan_type = meta["loan_type"] or (payload.loan_type or "").strip()

    background_tasks.add_task(
        _create_loan_notification,
        supabase,
        recipient_role=payload.recipient_role,
        notification_type=payload.notification_type,
        loan_id=payload.loan_id,
        member_name=member_name or None,
        loan_type=loan_type or None,
        status_label=payload.notification_type,  # used for dedup uniqueness
        actor_user_id=payload.actor_user_id,
    )

    # Fan-out: mirror staff transition to a member-facing notification so the
    # member sees every step of their loan in the Member portal bell.
    member_ntype = _STAFF_TO_MEMBER_NOTIFICATION.get(payload.notification_type)
    if member_ntype:
        background_tasks.add_task(
            _fan_out_member_notification,
            notification_type=member_ntype,
            loan_id=payload.loan_id,
            member_id=meta.get("member_id") or None,
            member_name=member_name or None,
            loan_type=loan_type or None,
            actor_user_id=payload.actor_user_id,
        )

    return {"success": True, "queued": True}


@app.post("/api/loans/notifications/member")
async def dispatch_member_notification(
    payload: LoanMemberNotificationRequest,
    background_tasks: BackgroundTasks,
):
    """Direct member-only notification dispatch (used at submission time and
    anywhere we need a member bell entry without a staff transition).

    Fire-and-forget. Backend re-reads the loan to fill member_id / loan_type
    so the frontend can't spoof recipient routing.
    """
    if not supabase:
        return {"success": False, "queued": False, "detail": "Supabase client unavailable."}

    meta = _resolve_loan_member_meta(payload.loan_id)
    member_id = (payload.member_id or "").strip() or meta.get("member_id") or None
    member_name = meta.get("member_name") or (payload.member_name or "").strip() or None
    loan_type = meta.get("loan_type") or (payload.loan_type or "").strip() or None

    background_tasks.add_task(
        _fan_out_member_notification,
        notification_type=payload.notification_type,
        loan_id=payload.loan_id,
        member_id=member_id,
        member_name=member_name,
        loan_type=loan_type,
        actor_user_id=payload.actor_user_id,
    )
    return {"success": True, "queued": True}


@app.post("/api/loans/email/dispatch")
async def dispatch_loan_email(payload: LoanStatusEmailRequest, background_tasks: BackgroundTasks):
    """Fire-and-forget loan workflow notification.

    The HTTP call returns immediately. The actual Resend send + Supabase logging
    happens in a `BackgroundTask`, so even a slow/failed email never blocks the
    loan approval workflow on the frontend.

    Duplicate protection, transition guards, and audit logging are all handled
    inside `notification_service.dispatch_loan_status_email`. This handler only
    validates the request and schedules the work.
    """
    # Reload env at request time so RESEND_API_KEY changes are picked up.
    load_dotenv(ROOT_ENV_PATH, override=True)

    if not supabase:
        # We don't fail the workflow over this — log and return 202.
        return {"success": False, "queued": False, "detail": "Supabase client unavailable."}

    background_tasks.add_task(
        _dispatch_loan_status_email,
        supabase,
        loan_id=payload.loan_id,
        stage=payload.stage,
        action=payload.action,
        remarks=payload.remarks,
        actor_user_id=payload.actor_user_id,
        next_approver_email=payload.next_approver_email,
        override_member_email=payload.override_member_email,
    )

    # Fan-out: any email-dispatched workflow event also mirrors into the
    # member's in-app notification bell. Maps stage/action to a member ntype.
    email_to_member_ntype: dict[tuple[str, str], str] = {
        ("manager", "approve"):      "member_approved",
        ("manager", "proceed"):      "member_approved",
        ("manager", "reject"):       "member_mgr_rejected",
        ("manager", "revise"):       "member_mgr_revise",
        ("treasurer", "disburse"):   "member_ready_claim",
        ("treasurer", "released"):   "member_released",
        ("treasurer", "reject"):     "member_cancelled",
        ("bookkeeper", "recommend"): "member_recommended",
        ("bookkeeper", "reject"):    "member_bk_declined",
    }
    member_ntype = email_to_member_ntype.get((payload.stage, payload.action))
    if member_ntype:
        meta = _resolve_loan_member_meta(payload.loan_id)
        background_tasks.add_task(
            _fan_out_member_notification,
            notification_type=member_ntype,
            loan_id=payload.loan_id,
            member_id=meta.get("member_id") or None,
            member_name=meta.get("member_name") or None,
            loan_type=meta.get("loan_type") or None,
            actor_user_id=payload.actor_user_id,
        )

    return {"success": True, "queued": True}


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
    # Payment-status gate — applicant must have paid membership fee and met paid-up capital
    # before final approval. The `force` flag (BOD override) skips this gate.
    if not payload.force:
        try:
            summary = _get_application_payment_summary(payload.application_id)
        except Exception:
            summary = None
        if summary:
            missing = []
            if not summary.get("membership_fee_paid"):
                missing.append(
                    f"Membership Fee (₱{summary.get('required_membership_fee', 100):,.2f}) is unpaid."
                )
            if not summary.get("paid_up_capital_satisfied"):
                paid = summary.get("paid_up_capital_amount") or 0
                req = summary.get("required_paid_up_capital") or 10000
                missing.append(
                    f"Initial Paid-Up Capital is insufficient (₱{paid:,.2f} / ₱{req:,.2f})."
                )
            if missing:
                raise HTTPException(
                    status_code=400,
                    detail="Cannot approve: " + " ".join(missing)
                )

    try:
        result = confirm_membership(
            payload.application_id,
            confirmed_by_user_id=payload.confirmed_by_user_id,
            force=payload.force,
            send_email=payload.send_email,
        )
    except MembershipConfirmationError as err:
        raise HTTPException(status_code=400, detail=str(err))
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Membership confirmation failed: {err}")

    # Seed capital_build_up with the initial paid-up capital that was already
    # collected via membership_payments. Idempotent — skips if a row already exists.
    try:
        _seed_initial_capital_build_up(payload.application_id, result)
    except Exception as seed_err:
        # Non-fatal: log to response so the BOD knows seeding failed but the member exists.
        if isinstance(result, dict):
            result["capital_build_up_seed_warning"] = str(seed_err)

    return {"success": True, "data": result}


def _seed_initial_capital_build_up(application_id: str, confirm_result: Any) -> None:
    """Insert the first capital_build_up row using the applicant's INITIAL_PAID_UP_CAPITAL
    payment. Looks up the newly-minted member.id from the confirm_membership result.
    Safe to call multiple times — does nothing if a row already exists or no payment
    record was found."""
    if not supabase:
        return

    member_uuid = None
    if isinstance(confirm_result, dict):
        member_uuid = (
            confirm_result.get("member_id")
            or confirm_result.get("id")
            or (confirm_result.get("member") or {}).get("id")
        )

    if not member_uuid:
        return

    # Already seeded?
    try:
        existing = (
            supabase.table("capital_build_up")
            .select("id")
            .eq("member_id", member_uuid)
            .eq("deposit_account", "INITIAL_PAID_UP_CAPITAL")
            .limit(1)
            .execute()
        )
        if existing.data:
            return
    except Exception:
        pass

    # Read the paid-up capital payment record
    try:
        payment_resp = (
            supabase.table("membership_payments")
            .select("amount, payment_date, payment_id")
            .eq("application_id", application_id)
            .eq("payment_type", "INITIAL_PAID_UP_CAPITAL")
            .eq("payment_status", "paid")
            .order("payment_date", desc=True)
            .limit(1)
            .execute()
        )
    except Exception:
        return

    payment_row = (payment_resp.data or [None])[0]
    if not payment_row:
        return

    try:
        amount = Decimal(str(payment_row.get("amount") or 0))
    except Exception:
        amount = Decimal("0")
    if amount <= 0:
        return

    insert_payload = {
        "member_id": member_uuid,
        "transaction_date": payment_row.get("payment_date") or datetime.utcnow().isoformat(),
        "starting_share_capital": 0,
        "capital_added": float(amount),
        "deposit_account": "INITIAL_PAID_UP_CAPITAL",
        "ending_share_capital": float(amount),
    }
    try:
        supabase.table("capital_build_up").insert(insert_payload).execute()
    except Exception:
        # Trigger may auto-assign cbu_deposit_id; try once more without the column
        try:
            supabase.table("capital_build_up").insert(insert_payload).execute()
        except Exception:
            pass


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


class RiskPredictRequest(BaseModel):
    loan_control_number: str
    source: Literal["loans", "koica_loans"] = "loans"
    scored_by: str | None = None  # auth.uid() of the manager, optional
    force_refresh: bool = False


def _fetch_loan_for_scoring(control_number: str, source: str) -> dict:
    table = "koica_loans" if source == "koica_loans" else "loans"
    select_cols = (
        "control_number, loan_amount, monthly_amortization, member_id"
        if table == "loans"
        else "control_number, loan_amount, raw_payload"
    )
    resp = (
        supabase.table(table)
        .select(select_cols)
        .eq("control_number", control_number)
        .limit(1)
        .execute()
    )
    rows = resp.data or []
    if not rows:
        raise HTTPException(status_code=404, detail=f"Loan {control_number} not found in {table}.")
    return rows[0]


def _fetch_member_pds(member_id: str | None) -> dict:
    """Resolve member -> personal_data_sheet to get occupation, annual_income,
    and monthly net pay. The PDS table has `salary` (monthly) — there is no
    dedicated `latest_net_pay` column, so we treat `salary` as the monthly net
    pay used by the risk model's Debt-to-Income formula."""
    empty = {
        "occupation": None,
        "annual_income": None,
        "latest_net_pay": None,
        "membership_number_id": None,
    }
    if not member_id:
        return empty

    member_resp = (
        supabase.table("member")
        .select("id, membership_id")
        .eq("id", member_id)
        .limit(1)
        .execute()
    )
    member_rows = member_resp.data or []
    if not member_rows:
        return empty

    membership_number_id = member_rows[0].get("membership_id")
    if not membership_number_id:
        return empty

    # Try the richest column set first; degrade gracefully if any column is
    # missing on legacy databases.
    column_attempts = [
        "occupation, annual_income, salary, membership_number_id",
        "occupation, annual_income, membership_number_id",
        "occupation, membership_number_id",
    ]
    pds_rows: list[dict] = []
    for cols in column_attempts:
        try:
            pds_resp = (
                supabase.table("personal_data_sheet")
                .select(cols)
                .eq("membership_number_id", membership_number_id)
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )
            pds_rows = pds_resp.data or []
            break
        except Exception:
            continue

    if not pds_rows:
        return {**empty, "membership_number_id": membership_number_id}

    row = pds_rows[0]
    return {
        "occupation": row.get("occupation"),
        "annual_income": row.get("annual_income"),
        # PDS stores monthly net pay in `salary` (text column). The risk model
        # treats this value as latest_net_pay for the DTI calculation.
        "latest_net_pay": row.get("salary") if isinstance(row, dict) else None,
        "membership_number_id": membership_number_id,
    }


@app.post("/api/risk/predict")
async def predict_loan_risk(payload: RiskPredictRequest):
    if supabase is None:
        raise HTTPException(status_code=503, detail="Supabase client is not configured.")

    # Return cached row unless force_refresh requested
    if not payload.force_refresh:
        cached = (
            supabase.table("risk_assessments")
            .select("*")
            .eq("loan_control_number", payload.loan_control_number)
            .limit(1)
            .execute()
        )
        if cached.data:
            return {"cached": True, **cached.data[0]}

    loan = _fetch_loan_for_scoring(payload.loan_control_number, payload.source)

    member_id = loan.get("member_id")
    loan_amount = loan.get("loan_amount")
    # monthly_amortization may be stored on the loan row or inside raw_payload.optionalFields
    monthly_amortization = loan.get("monthly_amortization") or (
        (loan.get("raw_payload") or {}).get("optionalFields", {}) or {}
    ).get("monthly_amortization")

    # KOICA loans store applicant info inside raw_payload — pull from there if needed
    occupation = None
    annual_income = None
    pds: dict | None = None
    if payload.source == "koica_loans":
        raw = loan.get("raw_payload") or {}
        occupation = raw.get("occupation")
        annual_income = raw.get("annual_income")
    else:
        pds = _fetch_member_pds(member_id)
        occupation = pds.get("occupation")
        annual_income = pds.get("annual_income")

    # Resolve latest_net_pay through every available source, in order of
    # confidence. The first non-empty, positive value wins. Order matters:
    #   1. loan row optionalFields (form-submitted value, most current)
    #   2. PDS salary (canonical member record)
    #   3. raw_payload root (KOICA-style payloads)
    def _is_positive_number(value: Any) -> bool:
        try:
            return value is not None and float(str(value).replace(",", "")) > 0
        except (TypeError, ValueError):
            return False

    raw_payload = loan.get("raw_payload") or {}
    optional_fields = (raw_payload.get("optionalFields") or {}) if isinstance(raw_payload, dict) else {}

    latest_net_pay_candidates = [
        optional_fields.get("latest_net_pay"),
        loan.get("latest_net_pay"),
        (pds or {}).get("latest_net_pay"),
        raw_payload.get("latest_net_pay") if isinstance(raw_payload, dict) else None,
    ]
    latest_net_pay = next(
        (val for val in latest_net_pay_candidates if _is_positive_number(val)),
        None,
    )

    try:
        result = risk_score(
            loan_amount=loan_amount,
            occupation=occupation,
            annual_income=annual_income,
            advance_payment_count=0,
            monthly_amortization=monthly_amortization,
            latest_net_pay=latest_net_pay,
        )
    except ModelNotAvailableError as e:
        raise HTTPException(status_code=503, detail=str(e))

    insert_row = {
        "loan_control_number": payload.loan_control_number,
        "member_id": member_id,
        "risk_class": result["risk_class"],
        "risk_probability": round(result["risk_probability"], 4),
        "features_used": result["features_used"],
        "model_version": result.get("model_version"),
        "scored_by": payload.scored_by,
    }

    upsert_resp = (
        supabase.table("risk_assessments")
        .upsert(insert_row, on_conflict="loan_control_number")
        .execute()
    )
    saved = (upsert_resp.data or [insert_row])[0]
    return {"cached": False, **saved, "risk_label": result["risk_label"]}


# =============================================================================
# Membership Payments Module
# =============================================================================
# Scalable table for membership-related fees. Currently records the ₱100
# Membership Fee for applicants. The paid-up capital (₱10,000) continues to
# be tracked by personal_data_sheet.initial_paid_up_capital / capital_build_up.

MEMBERSHIP_FEE_AMOUNT = Decimal("100")
INITIAL_PAID_UP_CAPITAL_REQUIRED = Decimal("10000")


class MembershipPaymentCreateRequest(BaseModel):
    application_id: str
    payment_type: Literal["MEMBERSHIP_FEE", "INITIAL_PAID_UP_CAPITAL"] = "MEMBERSHIP_FEE"
    amount: Decimal | None = None
    payment_method: Literal["cash", "gcash", "bank_transfer", "check", "other"] = "cash"
    reference_number: str | None = None
    processed_by: str | None = None
    processed_by_name: str | None = None
    notes: str | None = None


def _next_membership_payment_sequence() -> int:
    try:
        resp = supabase.table("membership_payments").select("id").execute()
        return len(resp.data or []) + 1
    except Exception:
        return 1


def _get_application_payment_summary(application_id: str) -> dict:
    """Aggregate verification flags for the BOD approval gate."""
    clean_id = str(application_id or "").strip()
    empty_response = {
        "application_id": None,
        "membership_fee_paid": False,
        "membership_fee_payment": None,
        "paid_up_capital_paid": False,
        "paid_up_capital_payment": None,
        "paid_up_capital_amount": 0.0,
        "paid_up_capital_satisfied": False,
        "required_paid_up_capital": float(INITIAL_PAID_UP_CAPITAL_REQUIRED),
        "required_membership_fee": float(MEMBERSHIP_FEE_AMOUNT),
    }
    if not clean_id:
        return empty_response

    def _latest_paid_payment(payment_type: str):
        try:
            resp = (
                supabase.table("membership_payments")
                .select("*")
                .eq("application_id", clean_id)
                .eq("payment_type", payment_type)
                .eq("payment_status", "paid")
                .order("payment_date", desc=True)
                .limit(1)
                .execute()
            )
            return (resp.data or [None])[0]
        except Exception:
            return None

    # 1) Membership fee
    fee_payment = _latest_paid_payment("MEMBERSHIP_FEE")
    fee_paid = fee_payment is not None

    # 2) Initial paid-up capital — primary source is a membership_payments record.
    paid_up_payment = _latest_paid_payment("INITIAL_PAID_UP_CAPITAL")
    paid_up_amount = Decimal("0")
    if paid_up_payment is not None:
        try:
            paid_up_amount = Decimal(str(paid_up_payment.get("amount") or 0))
        except Exception:
            paid_up_amount = Decimal("0")

    # Fallback to personal_data_sheet.initial_paid_up_capital for legacy applicants
    if paid_up_amount <= 0:
        try:
            try:
                app_resp = (
                    supabase.table("member_applications")
                    .select("application_id, tin_number, membership_id")
                    .eq("application_id", clean_id)
                    .limit(1)
                    .execute()
                )
            except Exception:
                app_resp = (
                    supabase.table("member_applications")
                    .select("application_id, tin_number")
                    .eq("application_id", clean_id)
                    .limit(1)
                    .execute()
                )
            app_row = (app_resp.data or [{}])[0]
            tin = str(app_row.get("tin_number") or "").strip()
            mem_no = str(app_row.get("membership_id") or "").strip()
            for lookup_key, lookup_value in (("tin_number", tin), ("membership_number_id", mem_no)):
                if paid_up_amount > 0 or not lookup_value:
                    continue
                try:
                    pds = (
                        supabase.table("personal_data_sheet")
                        .select("initial_paid_up_capital")
                        .eq(lookup_key, lookup_value)
                        .order("created_at", desc=True)
                        .limit(1)
                        .execute()
                    )
                    if pds.data:
                        v = pds.data[0].get("initial_paid_up_capital")
                        if v is not None:
                            paid_up_amount = Decimal(str(v))
                except Exception:
                    pass
        except Exception:
            pass

    paid_up_ok = paid_up_amount >= INITIAL_PAID_UP_CAPITAL_REQUIRED

    return {
        "application_id": clean_id,
        "membership_fee_paid": fee_paid,
        "membership_fee_payment": fee_payment,
        "paid_up_capital_paid": paid_up_payment is not None,
        "paid_up_capital_payment": paid_up_payment,
        "paid_up_capital_amount": float(paid_up_amount),
        "paid_up_capital_satisfied": paid_up_ok,
        "required_paid_up_capital": float(INITIAL_PAID_UP_CAPITAL_REQUIRED),
        "required_membership_fee": float(MEMBERSHIP_FEE_AMOUNT),
    }


@app.get("/api/cashier/membership-payments/applicants")
async def list_membership_applicants():
    """List applicants eligible to be charged the membership fee.
    Includes their current membership-payment status for the table UI."""
    if not supabase:
        raise HTTPException(status_code=503, detail="Supabase client is not configured.")
    try:
        apps_resp = (
            supabase.table("member_applications")
            .select(
                "application_id, surname, first_name, middle_name, email, contact_number, "
                "application_status, attendance_status, created_at"
            )
            .order("created_at", desc=True)
            .limit(500)
            .execute()
        )
        rows = apps_resp.data or []

        eligible_statuses = {"pending", "training", "1st training", "first training", "for revision"}
        filtered = [
            row for row in rows
            if str(row.get("application_status") or "").strip().lower() in eligible_statuses
        ]

        results = []
        for row in filtered:
            app_id = row.get("application_id")
            summary = _get_application_payment_summary(app_id) if app_id else {}
            full_name = " ".join(
                part for part in [
                    row.get("first_name"),
                    row.get("middle_name"),
                    row.get("surname"),
                ] if part
            ).strip() or "Unknown Applicant"
            results.append({
                "application_id": app_id,
                "full_name": full_name,
                "email": row.get("email"),
                "contact_number": row.get("contact_number"),
                "application_status": row.get("application_status"),
                "submitted_at": row.get("created_at"),
                "membership_fee_paid": summary.get("membership_fee_paid", False),
                "membership_fee_payment": summary.get("membership_fee_payment"),
                "paid_up_capital_paid": summary.get("paid_up_capital_paid", False),
                "paid_up_capital_payment": summary.get("paid_up_capital_payment"),
                "paid_up_capital_amount": summary.get("paid_up_capital_amount", 0),
                "paid_up_capital_satisfied": summary.get("paid_up_capital_satisfied", False),
            })

        return {"success": True, "data": results}
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Failed to list applicants: {err}")


@app.post("/api/cashier/membership-payments")
async def create_membership_payment(payload: MembershipPaymentCreateRequest):
    """Record a membership-fee payment for an applicant."""
    if not supabase:
        raise HTTPException(status_code=503, detail="Supabase client is not configured.")

    # Verify the applicant exists and is still eligible
    try:
        app_resp = (
            supabase.table("member_applications")
            .select("application_id, surname, first_name, application_status, membership_id, tin_number")
            .eq("application_id", payload.application_id)
            .limit(1)
            .execute()
        )
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Failed to load applicant: {err}")

    rows = app_resp.data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Applicant not found.")
    application = rows[0]

    status_value = str(application.get("application_status") or "").strip().lower()
    if status_value in {"member", "official member", "approved", "rejected"}:
        raise HTTPException(
            status_code=400,
            detail="Applicant is no longer eligible (already approved or rejected)."
        )

    # Reject duplicate paid payment for the same application + type
    summary = _get_application_payment_summary(payload.application_id)
    if payload.payment_type == "MEMBERSHIP_FEE" and summary.get("membership_fee_paid"):
        raise HTTPException(
            status_code=400,
            detail="Membership fee has already been recorded for this applicant."
        )
    if payload.payment_type == "INITIAL_PAID_UP_CAPITAL" and summary.get("paid_up_capital_paid"):
        raise HTTPException(
            status_code=400,
            detail="Initial Paid-Up Capital has already been recorded for this applicant."
        )

    # Default amount by type
    if payload.amount is None:
        amount = (
            INITIAL_PAID_UP_CAPITAL_REQUIRED
            if payload.payment_type == "INITIAL_PAID_UP_CAPITAL"
            else MEMBERSHIP_FEE_AMOUNT
        )
    else:
        amount = Decimal(payload.amount)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than zero.")
    if payload.payment_type == "INITIAL_PAID_UP_CAPITAL" and amount < INITIAL_PAID_UP_CAPITAL_REQUIRED:
        raise HTTPException(
            status_code=400,
            detail=f"Initial Paid-Up Capital must be at least ₱{INITIAL_PAID_UP_CAPITAL_REQUIRED:,.2f}.",
        )

    # Build payment_id (TTMPCMF-### or TTMPCPC-### sequence)
    prefix = "TTMPCPC-" if payload.payment_type == "INITIAL_PAID_UP_CAPITAL" else "TTMPCMF-"
    payment_id = build_sequence_id(prefix, _next_membership_payment_sequence())

    insert_row = {
        "payment_id": payment_id,
        "application_id": payload.application_id,
        "membership_number_id": application.get("membership_id"),
        "payment_type": payload.payment_type,
        "amount": float(amount),
        "payment_status": "paid",
        "payment_method": payload.payment_method,
        "reference_number": (payload.reference_number or "").strip() or None,
        "processed_by": payload.processed_by,
        "processed_by_name": (payload.processed_by_name or "").strip() or None,
        "notes": (payload.notes or "").strip() or None,
    }

    try:
        insert_resp = (
            supabase.table("membership_payments")
            .insert(insert_row)
            .execute()
        )
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Failed to record payment: {err}")

    saved = (insert_resp.data or [insert_row])[0]
    return {"success": True, "message": "Membership fee recorded successfully.", "data": saved}


@app.get("/api/cashier/membership-payments")
async def list_membership_payments(
    status: str | None = None,
    payment_type: str | None = None,
    search: str | None = None,
):
    """List all membership-payment transactions for the table view."""
    if not supabase:
        raise HTTPException(status_code=503, detail="Supabase client is not configured.")
    try:
        q = supabase.table("membership_payments").select("*").order("payment_date", desc=True).limit(500)
        if status:
            q = q.eq("payment_status", status)
        if payment_type:
            q = q.eq("payment_type", payment_type)
        resp = q.execute()
        rows = resp.data or []

        # Enrich with applicant name (read each application once, by id)
        app_ids = {row.get("application_id") for row in rows if row.get("application_id")}
        applicant_lookup: dict[str, dict] = {}
        if app_ids:
            try:
                apps_resp = (
                    supabase.table("member_applications")
                    .select("application_id, surname, first_name, middle_name")
                    .in_("application_id", list(app_ids))
                    .execute()
                )
                for row in (apps_resp.data or []):
                    applicant_lookup[row.get("application_id")] = row
            except Exception:
                pass

        results = []
        for row in rows:
            app = applicant_lookup.get(row.get("application_id")) or {}
            full_name = " ".join(
                part for part in [
                    app.get("first_name"),
                    app.get("middle_name"),
                    app.get("surname"),
                ] if part
            ).strip()
            results.append({**row, "applicant_name": full_name or "Unknown Applicant"})

        if search:
            needle = search.strip().lower()
            results = [
                r for r in results
                if needle in str(r.get("applicant_name") or "").lower()
                or needle in str(r.get("payment_id") or "").lower()
                or needle in str(r.get("reference_number") or "").lower()
            ]

        return {"success": True, "data": results}
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Failed to list payments: {err}")


@app.get("/api/bod/membership-approval/{application_id}/payment-status")
async def bod_get_payment_status(application_id: str):
    """Verification summary used by the BOD approval gate."""
    if not supabase:
        raise HTTPException(status_code=503, detail="Supabase client is not configured.")
    summary = _get_application_payment_summary(application_id)
    return {"success": True, "data": summary}


# =============================================================================
# Loan Demand Forecasting
# =============================================================================

@app.get("/api/analytics/demand/forecast")
async def get_loan_demand_forecast(
    loan_type: str = "consolidated",
    periods: int = 12,
    alpha: float = 0.20,
):
    """Return historical training series + N-month forecast for the requested loan type.

    Query params:
      - loan_type: 'consolidated' (default) or 'emergency'
      - periods:   number of future months to forecast (default 12)
      - alpha:     1 - confidence level for the band; default 0.20 → 80% CI
    """
    loan_type_clean = (loan_type or "").strip().lower()
    if loan_type_clean not in DEMAND_LOAN_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid loan_type. Supported: {', '.join(DEMAND_LOAN_TYPES)}.",
        )

    periods_clean = max(1, min(int(periods), 60))  # safety bounds
    alpha_clean = max(0.01, min(float(alpha), 0.50))

    try:
        payload = demand_get_forecast_payload(
            loan_type=loan_type_clean,  # type: ignore[arg-type]
            periods=periods_clean,
            alpha=alpha_clean,
        )
    except DemandModelNotAvailableError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Forecast failed: {e}")

    return payload


@app.get("/api/analytics/demand/actuals")
def get_loan_demand_actuals(
    loan_type: str = "consolidated",
    year: int | None = None,
):
    """Monthly disbursement totals from the normalized loan CSV.

    Returns 12 rows (Jan–Dec) for the requested year with `actual` summed by
    LoanType. Months with no rows in the CSV come back with actual=0 so the
    frontend can decide whether to show that month as actual=0 or fall back to
    a forecast for future months.

    Query params:
      - loan_type: 'consolidated' or 'emergency' (case-insensitive)
      - year:      4-digit year; defaults to the latest year present in the CSV.
    """
    lt = (loan_type or "").strip().lower()
    if lt not in ("consolidated", "emergency"):
        raise HTTPException(status_code=400, detail="Invalid loan_type. Use 'consolidated' or 'emergency'.")

    csv_path = _REPO_ROOT / "src" / "analytics" / "Loan Demand Forecasting" / "Data" / "df_modeling_export (1).csv"
    rows = _read_csv_resilient(csv_path)
    if not rows:
        raise HTTPException(status_code=503, detail="Loan demand CSV not found on server.")

    parsed: list[tuple[int, int, float, str]] = []
    years_seen: set[int] = set()
    for r in rows:
        raw_type = str(r.get("LoanType") or "").strip().lower()
        if raw_type != lt:
            continue
        date_str = str(r.get("ApplicationDate") or "").strip()
        if not date_str:
            continue
        try:
            d = datetime.fromisoformat(date_str)
        except ValueError:
            continue
        amount = 0.0
        try:
            amount = float(r.get("LoanAmount") or 0)
        except (TypeError, ValueError):
            amount = 0.0
        parsed.append((d.year, d.month, amount, date_str))
        years_seen.add(d.year)

    if not years_seen:
        raise HTTPException(status_code=404, detail=f"No CSV rows for loan_type '{lt}'.")

    target_year = year if year is not None else max(years_seen)

    monthly: dict[int, float] = {m: 0.0 for m in range(1, 13)}
    count_by_month: dict[int, int] = {m: 0 for m in range(1, 13)}
    for y, m, amt, _ in parsed:
        if y == target_year:
            monthly[m] += amt
            count_by_month[m] += 1

    return {
        "loan_type": lt,
        "year": target_year,
        "available_years": sorted(years_seen),
        "months": [
            {
                "period": f"{target_year}-{m:02d}",
                "actual": round(monthly[m], 2),
                "loan_count": count_by_month[m],
            }
            for m in range(1, 13)
        ],
    }


# ---------------------------------------------------------------------------
# Auth backfill for imported members
# ---------------------------------------------------------------------------
# Members imported via CSV / SQL migration have rows in `member` and
# `member_account` but no corresponding `auth.users` account, so they cannot
# sign in. This endpoint scans `member_account` for rows with
# auth_user_id IS NULL, provisions a Supabase Auth user using the existing
# `_build_default_password(last_name)` convention (e.g. "Tabiolo1234"), and
# writes auth_user_id + user_id + password back onto member_account.
#
# Email resolution waterfall (first non-empty wins):
#   1. member_account.email
#   2. member.email (if column present)
#   3. personal_data_sheet.email   (joined on membership_number_id)
#   4. member_applications.email   (joined on membership_id)
# Members with no resolvable email are returned in `skipped` with reason.


def _resolve_member_email(supabase: Client, account_row: dict, member_row: dict | None) -> str:
    candidate = str(account_row.get("email") or "").strip()
    if candidate:
        return candidate.lower()

    if member_row:
        candidate = str(member_row.get("email") or "").strip()
        if candidate:
            return candidate.lower()

    membership_id = str(account_row.get("membership_id") or "").strip()
    if not membership_id:
        return ""

    try:
        pds = (
            supabase.table("personal_data_sheet")
            .select("email")
            .eq("membership_number_id", membership_id)
            .limit(1)
            .execute()
        )
        pds_row = (pds.data or [None])[0]
        if pds_row:
            candidate = str(pds_row.get("email") or "").strip()
            if candidate:
                return candidate.lower()
    except Exception:
        pass

    try:
        apps = (
            supabase.table("member_applications")
            .select("email")
            .eq("membership_id", membership_id)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        app_row = (apps.data or [None])[0]
        if app_row:
            candidate = str(app_row.get("email") or "").strip()
            if candidate:
                return candidate.lower()
    except Exception:
        pass

    return ""


def _resolve_member_last_name(member_row: dict | None, account_row: dict, supabase: Client) -> str:
    if member_row:
        for key in ("surname", "last_name"):
            value = str(member_row.get(key) or "").strip()
            if value:
                return value

    membership_id = str(account_row.get("membership_id") or "").strip()
    if not membership_id:
        return ""

    try:
        pds = (
            supabase.table("personal_data_sheet")
            .select("surname,last_name")
            .eq("membership_number_id", membership_id)
            .limit(1)
            .execute()
        )
        pds_row = (pds.data or [None])[0]
        if pds_row:
            for key in ("surname", "last_name"):
                value = str(pds_row.get(key) or "").strip()
                if value:
                    return value
    except Exception:
        pass

    return ""


@app.post("/api/admin/backfill-member-auth")
async def backfill_member_auth(dry_run: bool = False, limit: int | None = None):
    """Provision auth.users accounts for member_account rows missing one.

    Query params:
      - dry_run: if true, returns the list of candidates without creating
        any auth users or writing to member_account.
      - limit: optional cap on how many rows to process this run.
    """
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase client is not initialized.")

    try:
        missing_response = (
            supabase.table("member_account")
            .select("membership_id,email,role,user_id,auth_user_id")
            .is_("auth_user_id", "null")
            .execute()
        )
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Failed to query member_account: {err}")

    candidates = list(missing_response.data or [])
    if isinstance(limit, int) and limit > 0:
        candidates = candidates[:limit]

    # Build the auth.users email → UUID lookup once instead of paging
    # through every user for each candidate. Repeated pagination per row
    # triggered connection drops (WinError 10054) on larger directories.
    existing_auth_by_email: dict[str, str] = {}
    try:
        page = 1
        per_page = 1000
        while True:
            users = supabase.auth.admin.list_users(page=page, per_page=per_page)
            if not users:
                break
            for user in users:
                ue = str(getattr(user, "email", "") or "").strip().lower()
                if ue:
                    uid = _extract_user_id(user)
                    if uid:
                        existing_auth_by_email[ue] = uid
            if len(users) < per_page:
                break
            page += 1
    except Exception as err:
        raise HTTPException(status_code=502, detail=f"Failed to list auth users: {err}")

    created: list[dict[str, Any]] = []
    already_linked: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []

    for row in candidates:
        membership_id = str(row.get("membership_id") or "").strip()
        if not membership_id:
            skipped.append({"membership_id": None, "reason": "missing membership_id"})
            continue

        # Load matching member row for email/last-name fallback.
        member_row: dict | None = None
        try:
            member_response = (
                supabase.table("member")
                .select("*")
                .eq("membership_id", membership_id)
                .limit(1)
                .execute()
            )
            member_row = (member_response.data or [None])[0]
        except Exception:
            member_row = None

        email = _resolve_member_email(supabase, row, member_row)
        is_placeholder_email = False
        if not email:
            # Imported member with no email on file. Generate a deterministic
            # placeholder so they can sign in immediately with a temporary
            # password; staff are expected to collect the member's real email
            # later and update it via the Manage Member screen.
            placeholder_slug = membership_id.lower().replace(" ", "")
            email = f"{placeholder_slug}@ttmpc.local"
            is_placeholder_email = True

        last_name = _resolve_member_last_name(member_row, row, supabase)

        # Check whether an auth.users row already exists for this email (e.g.
        # account was provisioned earlier through another flow but never
        # linked back). If found, just link it without creating a new user.
        existing_user_id: str | None = existing_auth_by_email.get(email)

        if dry_run:
            (already_linked if existing_user_id else created).append({
                "membership_id": membership_id,
                "email": email,
                "would_link_existing": bool(existing_user_id),
                "would_reset_password": bool(existing_user_id),
                "placeholder_email": is_placeholder_email,
            })
            continue

        password: str | None = None
        if existing_user_id:
            # Orphan auth user already exists (e.g. from a half-finished prior
            # backfill). We can't delete it — DELETE on auth.users fires a
            # cleanup trigger that cascades into member/personal_data_sheet
            # and is blocked by the loans FK. Instead, reset its password to
            # the known `<LastName>1234` convention so the credentials become
            # recoverable, then link it.
            auth_user_id = existing_user_id
            link_mode = "linked_existing"
            password = _build_default_password(last_name)
            try:
                supabase.auth.admin.update_user_by_id(
                    auth_user_id,
                    {
                        "password": password,
                        "user_metadata": {
                            "membership_id": membership_id,
                            "role": row.get("role") or "Member",
                        },
                    },
                )
            except Exception as err:
                skipped.append({
                    "membership_id": membership_id,
                    "email": email,
                    "auth_user_id": auth_user_id,
                    "reason": f"auth password reset failed: {err}",
                })
                continue
        else:
            password = _build_default_password(last_name)
            try:
                created_user = supabase.auth.admin.create_user(
                    {
                        "email": email,
                        "password": password,
                        "email_confirm": True,
                        "user_metadata": {
                            "membership_id": membership_id,
                            "role": row.get("role") or "Member",
                        },
                    }
                )
            except Exception as err:
                skipped.append({
                    "membership_id": membership_id,
                    "email": email,
                    "reason": f"auth create failed: {err}",
                })
                continue

            auth_user_id = _extract_user_id(getattr(created_user, "user", None))
            if not auth_user_id:
                skipped.append({
                    "membership_id": membership_id,
                    "email": email,
                    "reason": "auth user created but no id returned",
                })
                continue
            link_mode = "created"

        update_payload: dict[str, Any] = {
            "auth_user_id": auth_user_id,
            "email": email,
            "is_temporary": True,
        }
        # Only set user_id when we created a brand-new auth user (in that
        # case the new auth UUID is also intended to become the member-row
        # link). When linking an existing orphan, leave user_id alone — it
        # already points at the correct member.id and overwriting could
        # break the FK to public.member.
        if link_mode == "created":
            update_payload["user_id"] = auth_user_id
        if password:
            update_payload["password"] = password

        try:
            supabase.table("member_account").update(update_payload).eq(
                "membership_id", membership_id
            ).execute()
        except Exception as err:
            skipped.append({
                "membership_id": membership_id,
                "email": email,
                "auth_user_id": auth_user_id,
                "reason": f"member_account update failed: {err}",
            })
            continue

        record = {
            "membership_id": membership_id,
            "email": email,
            "auth_user_id": auth_user_id,
            "mode": link_mode,
            "placeholder_email": is_placeholder_email,
        }
        if password:
            record["temporary_password"] = password
        (already_linked if link_mode == "linked_existing" else created).append(record)

    return {
        "success": True,
        "dry_run": dry_run,
        "total_missing": len(missing_response.data or []),
        "processed": len(candidates),
        "created_count": len(created),
        "linked_existing_count": len(already_linked),
        "skipped_count": len(skipped),
        "created": created,
        "linked_existing": already_linked,
        "skipped": skipped,
    }

    return {"success": True, "data": payload}


# =============================================================================
# Legacy Member Link (coop validation UI)
# =============================================================================
# The pre-migration data ("legacy") uses a different ID system: every member
# had a MasterUUID, every loan had a LoanID. We pulled those into Supabase
# but a handful of MasterUUIDs could NOT be auto-mapped to a Supabase member
# (name not in Normalized_Profiles, or blank in Cleaned_Members.csv). These
# endpoints power the bookkeeper-side screen that lets the coop manually pick
# the correct Supabase member for each pending MasterUUID, or mark it as
# having no legacy history.

import csv as _csv
from pathlib import Path as _Path

_MIGRATION_DIR = _Path(__file__).resolve().parent / "migration"
_REPO_ROOT = _Path(__file__).resolve().parent.parent.parent
_NORMALIZED_PROFILES = _REPO_ROOT / "src" / "server" / "migration" / "Normalized_Profiles.csv"
_CLEANED_MEMBERS = _MIGRATION_DIR / "Cleaned_Members.csv"
_MATRIX_CSV = _REPO_ROOT / "src" / "analytics" / "RISK Assesment" / "TTMPC_Credit_Risk" / "Master_Analytical_Matrix.csv"


def _read_csv_resilient(path: _Path) -> list[dict]:
    """Read a CSV that may have been re-saved by Excel in cp1252."""
    if not path.exists():
        return []
    try:
        with path.open("r", encoding="utf-8-sig", newline="") as fh:
            return list(_csv.DictReader(fh))
    except UnicodeDecodeError:
        with path.open("r", encoding="cp1252", newline="") as fh:
            return list(_csv.DictReader(fh))


def _load_legacy_member_index() -> dict[str, dict]:
    """Map MasterUUID -> {name, occupation, address, loan_count} from CSVs."""
    profiles: dict[str, dict] = {}
    for row in _read_csv_resilient(_NORMALIZED_PROFILES):
        mu = (row.get("membership_number_id") or "").strip()
        if not mu:
            continue
        profiles[mu] = {
            "master_uuid": mu,
            "last_name": (row.get("LastName") or "").strip(),
            "first_name": (row.get("FirstName") or "").strip(),
            "middle_name": (row.get("MiddleName") or "").strip(),
            "occupation": (row.get("Occupation") or "").strip(),
            "address": (row.get("Address") or "").strip(),
            "civil_status": (row.get("CivilStatus") or "").strip(),
            "date_of_birth": (row.get("DateOfBirth") or "").strip(),
            "loan_count": 0,
        }

    for row in _read_csv_resilient(_MATRIX_CSV):
        mu = (row.get("MasterUUID") or "").strip()
        if mu and mu in profiles:
            profiles[mu]["loan_count"] += 1

    return profiles


def _load_resolved_master_uuids() -> set[str]:
    """MasterUUIDs already wired into Supabase via Cleaned_Members.csv."""
    resolved: set[str] = set()
    for row in _read_csv_resilient(_CLEANED_MEMBERS):
        mu = (row.get("MasterUUID") or "").strip()
        if mu:
            resolved.add(mu)
    return resolved


@app.get("/api/admin/unlinked-legacy-members")
async def list_unlinked_legacy_members():
    """List MasterUUIDs from legacy data that are NOT yet bridged to a
    Supabase member, AND have not been resolved through the
    legacy_member_link validation table.

    Each entry includes legacy-side info (name, occupation, address,
    loan count) so the coop can identify who the member is.
    """
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase client is not initialized.")

    profiles = _load_legacy_member_index()
    resolved_via_bridge = _load_resolved_master_uuids()

    # MasterUUIDs already validated via legacy_member_link (either linked or
    # marked as having no history) should NOT be shown again.
    try:
        link_resp = (
            supabase.table("legacy_member_link")
            .select("legacy_master_uuid")
            .execute()
        )
        resolved_via_link = {
            (r.get("legacy_master_uuid") or "").strip()
            for r in (link_resp.data or [])
        }
    except Exception as err:
        # Table may not exist yet; treat as empty rather than 500.
        resolved_via_link = set()

    pending = [
        info for mu, info in profiles.items()
        if mu not in resolved_via_bridge and mu not in resolved_via_link
    ]
    pending.sort(key=lambda r: (r["last_name"].upper(), r["first_name"].upper()))

    return {"success": True, "data": {"pending": pending, "count": len(pending)}}


@app.get("/api/admin/legacy-member-link/candidates")
async def suggest_member_candidates(q: str = "", limit: int = 20):
    """Search Supabase members by name for the dropdown picker."""
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase client is not initialized.")

    query = (
        supabase.table("member")
        .select("id, membership_id, last_name, first_name, middle_name")
        .order("last_name")
        .limit(max(1, min(int(limit or 20), 100)))
    )
    needle = (q or "").strip()
    if needle:
        # Postgres ilike — Supabase chains .or_ for OR across columns.
        pattern = f"%{needle}%"
        query = query.or_(
            f"last_name.ilike.{pattern},first_name.ilike.{pattern},membership_id.ilike.{pattern}"
        )

    try:
        resp = query.execute()
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Member search failed: {err}")

    return {"success": True, "data": resp.data or []}


class _LinkLegacyMemberPayload(BaseModel):
    legacy_master_uuid: str
    member_id: str
    confirmed_by: str | None = None
    notes: str | None = None


@app.post("/api/admin/legacy-member-link/confirm")
async def confirm_legacy_member_link(payload: _LinkLegacyMemberPayload):
    """Coop confirms: this legacy MasterUUID belongs to this Supabase member.

    Inserts into legacy_member_link, then re-links any loans + payments
    in Supabase that still carry that MasterUUID to the correct member_id.
    """
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase client is not initialized.")

    legacy_uuid = payload.legacy_master_uuid.strip()
    member_id = payload.member_id.strip()
    if not legacy_uuid or not member_id:
        raise HTTPException(status_code=400, detail="legacy_master_uuid and member_id are required.")

    try:
        supabase.table("legacy_member_link").upsert({
            "legacy_master_uuid": legacy_uuid,
            "member_id": member_id,
            "marked_no_history": False,
            "confirmed_by": payload.confirmed_by,
            "notes": payload.notes,
        }).execute()
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Failed to record link: {err}")

    # Re-link loans whose raw_payload.legacy_loan_uuid points to a loan
    # owned by this MasterUUID (per Master_Analytical_Matrix).
    loan_uuids_for_master: set[str] = set()
    for row in _read_csv_resilient(_MATRIX_CSV):
        if (row.get("MasterUUID") or "").strip() == legacy_uuid:
            lid = (row.get("LoanID") or "").strip()
            if lid:
                loan_uuids_for_master.add(lid)

    loans_updated = 0
    if loan_uuids_for_master:
        try:
            loans_resp = (
                supabase.table("loans")
                .select("control_number, raw_payload")
                .filter("raw_payload->>legacy", "eq", "true")
                .execute()
            )
            for row in (loans_resp.data or []):
                rp = row.get("raw_payload") or {}
                if isinstance(rp, dict) and rp.get("legacy_loan_uuid") in loan_uuids_for_master:
                    supabase.table("loans").update({"member_id": member_id}).eq(
                        "control_number", row["control_number"]
                    ).execute()
                    loans_updated += 1
        except Exception as err:
            raise HTTPException(status_code=500, detail=f"Loan relink failed: {err}")

    # Re-link legacy payments by legacy_member_uuid.
    try:
        payments_resp = (
            supabase.table("loan_payments_legacy")
            .update({"member_id": member_id})
            .eq("legacy_member_uuid", legacy_uuid)
            .execute()
        )
        payments_updated = len(payments_resp.data or [])
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Payment relink failed: {err}")

    return {
        "success": True,
        "data": {
            "legacy_master_uuid": legacy_uuid,
            "member_id": member_id,
            "loans_relinked": loans_updated,
            "payments_relinked": payments_updated,
        },
    }


class _NoHistoryPayload(BaseModel):
    legacy_master_uuid: str
    confirmed_by: str | None = None
    notes: str | None = None


@app.post("/api/admin/legacy-member-link/no-history")
async def mark_legacy_member_no_history(payload: _NoHistoryPayload):
    """Coop confirms: this legacy MasterUUID has no real legacy history
    (withdrawn placeholder, or new member only). Removes it from the
    pending list without linking to any Supabase member.
    """
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase client is not initialized.")

    legacy_uuid = payload.legacy_master_uuid.strip()
    if not legacy_uuid:
        raise HTTPException(status_code=400, detail="legacy_master_uuid is required.")

    try:
        supabase.table("legacy_member_link").upsert({
            "legacy_master_uuid": legacy_uuid,
            "member_id": None,
            "marked_no_history": True,
            "confirmed_by": payload.confirmed_by,
            "notes": payload.notes,
        }).execute()
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Failed to mark no-history: {err}")


# ============================================================================
# Staff Account Management (BOD + Secretary)
# ----------------------------------------------------------------------------
# Endpoints for changing a member_account role, deactivating/reactivating
# accounts, and the Secretary -> BOD termination workflow.
# ============================================================================

ALLOWED_ROLES = {
    "member",
    "bookkeeper",
    "manager",
    "cashier",
    "treasurer",
    "secretary",
    "bod",
}


class StaffRoleChangeRequest(BaseModel):
    member_id: str
    new_role: str
    actor_user_id: str | None = None


class StaffDeactivateRequest(BaseModel):
    member_id: str
    is_active: bool
    actor_user_id: str | None = None


class StaffTerminationCreateRequest(BaseModel):
    member_id: str
    resolution_no: str | None = None
    resolution_date: str | None = None
    effective_date: str | None = None
    reason: str | None = None
    notes: str | None = None
    requested_by: str | None = None
    requested_by_role: str | None = None


class StaffTerminationDecisionRequest(BaseModel):
    request_id: int
    decision: Literal["approved", "rejected"]
    decided_by: str | None = None
    decision_notes: str | None = None


def _lookup_member_account(member_id: str):
    """Find the member_account row by membership_id (e.g. TTMPC-293)."""
    clean = str(member_id or "").strip()
    if not clean:
        raise HTTPException(status_code=400, detail="member_id is required.")

    account_row = None
    # member_account stores membership_id directly. Try id+is_active first,
    # then fall back if the is_active column hasn't been migrated yet.
    for select_cols in (
        "user_id, auth_user_id, email, role, membership_id, is_active",
        "user_id, auth_user_id, email, role, membership_id",
    ):
        try:
            account_row = (
                supabase.table("member_account")
                .select(select_cols)
                .eq("membership_id", clean)
                .limit(1)
                .execute()
            ).data
            account_row = (account_row or [None])[0]
            break
        except Exception:
            continue

    if not account_row:
        raise HTTPException(status_code=404, detail=f"member_account not found for {clean}.")

    # Synthesize an "id" key the rest of the endpoints can rely on. We use
    # user_id as the stable identifier for member_account updates.
    account_row.setdefault("id", account_row.get("user_id"))
    account_row.setdefault("is_active", True)
    return {"membership_id": clean}, account_row


@app.post("/api/admin/staff/role")
def staff_change_role(payload: StaffRoleChangeRequest):
    if supabase is None:
        raise HTTPException(status_code=500, detail="Supabase client is not initialized.")

    new_role = str(payload.new_role or "").strip().lower()
    if new_role not in ALLOWED_ROLES:
        raise HTTPException(status_code=400, detail=f"Role '{payload.new_role}' is not allowed.")

    member_row, account_row = _lookup_member_account(payload.member_id)

    try:
        supabase.table("member_account").update({"role": new_role}).eq(
            "user_id", account_row["user_id"]
        ).execute()
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Failed to update role: {err}")

    # Best-effort: mirror role into auth.users app_metadata so RLS sees it.
    auth_user_id = account_row.get("auth_user_id")
    if auth_user_id:
        try:
            supabase.auth.admin.update_user_by_id(
                auth_user_id, {"app_metadata": {"role": new_role}}
            )
        except Exception:
            pass

    return {"success": True, "member_id": payload.member_id, "role": new_role}


@app.post("/api/admin/staff/deactivate")
def staff_set_active(payload: StaffDeactivateRequest):
    if supabase is None:
        raise HTTPException(status_code=500, detail="Supabase client is not initialized.")

    _, account_row = _lookup_member_account(payload.member_id)

    try:
        supabase.table("member_account").update(
            {"is_active": bool(payload.is_active)}
        ).eq("id", account_row["id"]).execute()
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Failed to update is_active: {err}")

    return {"success": True, "member_id": payload.member_id, "is_active": bool(payload.is_active)}


@app.post("/api/admin/staff/termination/request")
def staff_request_termination(payload: StaffTerminationCreateRequest):
    """Secretary submits a termination request.

    Side effects:
      - Immediately sets member_account.is_active = false (safety lock).
      - Creates a staff_termination_requests row in 'awaiting_bod_confirmation'.
      - Inserts a BOD-bound row in loan_notifications (best-effort) so the BOD
        sees an actionable alert.
    """
    if supabase is None:
        raise HTTPException(status_code=500, detail="Supabase client is not initialized.")

    _, account_row = _lookup_member_account(payload.member_id)

    insert_row = {
        "member_id": str(payload.member_id).strip(),
        "member_account_id": account_row.get("user_id"),
        "previous_role": account_row.get("role"),
        "resolution_no": payload.resolution_no,
        "resolution_date": payload.resolution_date,
        "effective_date": payload.effective_date,
        "reason": payload.reason,
        "notes": payload.notes,
        "status": "awaiting_bod_confirmation",
        "requested_by": payload.requested_by,
        "requested_by_role": payload.requested_by_role,
    }

    try:
        created = (
            supabase.table("staff_termination_requests")
            .insert(insert_row)
            .execute()
        ).data
        created_row = (created or [None])[0] or insert_row
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Failed to create termination request: {err}")

    # Immediate safety lock.
    try:
        supabase.table("member_account").update({"is_active": False}).eq(
            "user_id", account_row["user_id"]
        ).execute()
    except Exception:
        pass

    # Best-effort BOD notification — non-fatal if the schema/columns differ.
    try:
        supabase.table("loan_notifications").insert({
            "recipient_role": "bod",
            "notification_type": "staff_termination_pending",
            "payload": {
                "request_id": created_row.get("id"),
                "member_id": payload.member_id,
                "previous_role": account_row.get("role"),
                "resolution_no": payload.resolution_no,
            },
        }).execute()
    except Exception:
        pass

    return {"success": True, "request": created_row}


@app.post("/api/admin/staff/termination/decision")
def staff_decide_termination(payload: StaffTerminationDecisionRequest):
    """BOD approves or rejects a pending termination request."""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Supabase client is not initialized.")

    if payload.decision not in ("approved", "rejected"):
        raise HTTPException(status_code=400, detail="Invalid decision.")

    request_row = (
        supabase.table("staff_termination_requests")
        .select("*")
        .eq("id", payload.request_id)
        .limit(1)
        .execute()
    ).data
    request_row = (request_row or [None])[0]
    if not request_row:
        raise HTTPException(status_code=404, detail="Termination request not found.")

    if str(request_row.get("status") or "").lower() != "awaiting_bod_confirmation":
        raise HTTPException(status_code=409, detail="Request has already been decided.")

    try:
        supabase.table("staff_termination_requests").update({
            "status": payload.decision,
            "decided_by": payload.decided_by,
            "decision_notes": payload.decision_notes,
            "decided_at": datetime.utcnow().isoformat(),
        }).eq("id", payload.request_id).execute()
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Failed to record decision: {err}")

    # If rejected, restore the account; if approved, leave is_active = false.
    if payload.decision == "rejected" and request_row.get("member_account_id"):
        try:
            supabase.table("member_account").update({"is_active": True}).eq(
                "user_id", request_row["member_account_id"]
            ).execute()
        except Exception:
            pass

    return {"success": True, "request_id": payload.request_id, "decision": payload.decision}


@app.get("/api/admin/staff/termination/requests")
def staff_list_termination_requests(status: str | None = None):
    if supabase is None:
        raise HTTPException(status_code=500, detail="Supabase client is not initialized.")

    try:
        query = supabase.table("staff_termination_requests").select("*").order(
            "requested_at", desc=True
        )
        if status:
            query = query.eq("status", status.strip().lower())
        data = query.execute().data or []
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Failed to list requests: {err}")

    return {"success": True, "data": data}


@app.get("/api/admin/staff/account/{member_id}")
def staff_get_account(member_id: str):
    if supabase is None:
        raise HTTPException(status_code=500, detail="Supabase client is not initialized.")

    _, account_row = _lookup_member_account(member_id)
    return {"success": True, "data": account_row}

    return {"success": True, "data": {"legacy_master_uuid": legacy_uuid}}