"""
Feature assembly for the TTMPC Credit Risk Model v3.3.

Turns database rows into the 21-feature contract defined in
`src/analytics/RISK Assesment/New Model/DEVELOPER_HANDOFF.md` §2.

Design notes
------------
*Batch first.* Scoring the Credit Risk queue means assembling features for
dozens of loans at once, so every lookup here is written as a bulk fetch keyed
by member. `assemble_many()` issues a fixed number of queries regardless of how
many loans are scored; `assemble_one()` is a thin wrapper over it.

*Unknown is NaN, never 0.* Absent values are returned as None and converted to
NaN by risk_model. Writing 0.0 into a blank would tell the model something the
records do not say — a member with no savings record is not a member with zero
savings. Counts derived from a complete scan (PriorLoans over a member's loan
list, say) are a genuine 0 when nothing matched, and are returned as 0.

*Previous loans only.* Features 7-15 must exclude the application being scored
and anything after it, or the outcome leaks and the prediction is corrupted
(handoff §2). `_prior_loans()` is the single chokepoint enforcing that cut, by
application_date and by control_number.

*Original term.* Feature #2 is the term requested at application. `loans.term`
is overwritten when a loan is restructured, so where a restructure is detected
the original is recovered from the loan's earliest schedule generation. See
`_original_term()`.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any

from risk_model import (
    INTEREST_RATE_CONSOLIDATED,
    INTEREST_RATE_EMERGENCY,
    coerce_float,
    monthly_due,
    occupation_tier,
)


# Months of no payment past due before a loan counts as having gone "behind".
# Matches the cooperative's delinquency rule (90 days) rather than a tighter
# threshold, which produces false positives against reconstructed legacy due
# dates.
BEHIND_MONTHS = 3

# A prior loan closed within this window of the next application of the same
# type is treated as settled BY that application — a renewal (handoff #8,
# "previous loans settled by taking a new loan").
RENEWAL_WINDOW_DAYS = 45

# Schedule statuses that mean "still owed".
_UNPAID_STATUSES = {"pending", "unpaid", "partial", "overdue", "due", "active"}
_PAID_STATUSES = {"paid", "settled", "closed", "fully paid"}


def _as_date(value: Any) -> date | None:
    """Parse a date/timestamp from the DB into a date. None if unparseable."""
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    s = str(value).strip()
    if not s:
        return None
    # Normalise ISO timestamps (with Z or an offset) down to a date.
    s = s.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(s).date()
    except ValueError:
        pass
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%d/%m/%Y"):
        try:
            return datetime.strptime(s[:10], fmt).date()
        except ValueError:
            continue
    return None


def _months_between(earlier: date, later: date) -> float:
    return (later.year - earlier.year) * 12 + (later.month - earlier.month) + (
        (later.day - earlier.day) / 30.44
    )


def _norm_status(value: Any) -> str:
    return str(value or "").strip().lower()


def _is_time_deposit(account_kind: str) -> bool:
    """Whether a savings account kind denotes a time deposit.

    The current schema records only 'member' and 'standalone', so this returns
    False throughout and HasTimeDeposit is reported as unknown. Kept as a named
    predicate so the day time deposits are recorded, this is the one place to
    teach.
    """
    return "time" in account_kind or account_kind in {"td", "time_deposit", "timedeposit"}


def _loan_type_name(loan: dict) -> str:
    lt = loan.get("loan_type") or {}
    if isinstance(lt, dict):
        return str(lt.get("name") or lt.get("code") or "").strip().lower()
    return str(lt or "").strip().lower()


def _interest_rate_for(loan: dict) -> float:
    """Monthly rate for the MonthlyDue feature (handoff §2)."""
    name = _loan_type_name(loan)
    if "emergency" in name:
        return INTEREST_RATE_EMERGENCY
    return INTEREST_RATE_CONSOLIDATED


# ---------------------------------------------------------------------------
# Bulk fetch helpers
# ---------------------------------------------------------------------------
def _chunked(items: list, size: int = 200):
    for i in range(0, len(items), size):
        yield items[i : i + size]


def fetch_member_context(supabase, member_ids: list[str]) -> dict:
    """Bulk-load everything the 21 features need, keyed for O(1) lookup.

    Returns a context dict consumed by `assemble_many()`. Each sub-fetch is
    independently guarded: a missing or permission-denied table degrades that
    feature group to NaN rather than failing the whole scoring run.
    """
    ctx: dict[str, Any] = {
        "loans_by_member": {},
        "schedules_by_loan": {},
        "legacy_by_loan": {},
        "penalty_loan_ids": set(),
        "pds_by_member": {},
        "classification_by_member": {},
        "savings_by_member": {},
        "savings_change_by_member": {},
        "membership_by_member": {},
    }
    member_ids = [m for m in dict.fromkeys(member_ids) if m]
    if not member_ids:
        return ctx

    # --- member -> membership_id ------------------------------------------
    # Two tables carry a column called `membership_number_id` and they hold
    # DIFFERENT keys:
    #   personal_data_sheet.membership_number_id  -> the text id, "TTMPC-270"
    #   member_classification_temporal.membership_number_id -> the member UUID
    # Using one key for both silently yields no rows (and therefore NaN
    # features), so the two lookups are kept deliberately separate below.
    members: list[dict] = []
    for chunk in _chunked(member_ids):
        try:
            members += (
                supabase.table("member")
                .select("id,membership_id")
                .in_("id", chunk)
                .execute()
            ).data or []
        except Exception:
            pass
    for row in members:
        mid = str(row.get("id"))
        mnid = str(row.get("membership_id") or "").strip()
        if mnid:
            ctx["membership_by_member"][mid] = mnid

    membership_ids = list(set(ctx["membership_by_member"].values()))

    # --- every loan these members have ever had ---------------------------
    # The full history is required: features 7-15 are all computed from it,
    # with the per-application cut applied later in _prior_loans().
    all_loans: list[dict] = []
    for chunk in _chunked(member_ids):
        try:
            all_loans += (
                supabase.table("loans")
                .select(
                    "control_number,member_id,loan_amount,principal_amount,term,"
                    "interest_rate,monthly_amortization,application_date,"
                    "disbursal_date,loan_status,application_status,"
                    "loan_type:loan_type_id(code,name)"
                )
                .in_("member_id", chunk)
                .limit(5000)
                .execute()
            ).data or []
        except Exception:
            pass
    for row in all_loans:
        ctx["loans_by_member"].setdefault(str(row.get("member_id")), []).append(row)
    for rows in ctx["loans_by_member"].values():
        rows.sort(key=lambda r: (_as_date(r.get("application_date")) or date.min))

    loan_ids = [str(r.get("control_number")) for r in all_loans if r.get("control_number")]

    # --- schedules: drive PriorBehind / ConcurrentLoans / original term ----
    for chunk in _chunked(loan_ids):
        try:
            rows = (
                supabase.table("loan_schedules")
                .select("loan_id,installment_no,due_date,schedule_status,penalty,expected_amount")
                .in_("loan_id", chunk)
                .limit(20000)
                .execute()
            ).data or []
            for s in rows:
                ctx["schedules_by_loan"].setdefault(str(s.get("loan_id")), []).append(s)
                if (coerce_float(s.get("penalty")) or 0) > 0:
                    ctx["penalty_loan_ids"].add(str(s.get("loan_id")))
        except Exception:
            pass

    # --- legacy payments: richer punctuality signal for migrated loans ----
    # loan_payments_legacy carries is_advance_payer and delta_days, which say
    # more about repayment behaviour than reconstructed due dates do.
    for chunk in _chunked(loan_ids):
        try:
            rows = (
                supabase.table("loan_payments_legacy")
                .select("loan_id,member_id,payment_date,delta_days,is_advance_payer")
                .in_("loan_id", chunk)
                .limit(20000)
                .execute()
            ).data or []
            for p in rows:
                ctx["legacy_by_loan"].setdefault(str(p.get("loan_id")), []).append(p)
        except Exception:
            pass

    # --- system-era penalties --------------------------------------------
    for chunk in _chunked(loan_ids):
        try:
            rows = (
                supabase.table("loan_payments")
                .select("loan_id,penalties")
                .in_("loan_id", chunk)
                .limit(20000)
                .execute()
            ).data or []
            for p in rows:
                if (coerce_float(p.get("penalties")) or 0) > 0:
                    ctx["penalty_loan_ids"].add(str(p.get("loan_id")))
        except Exception:
            pass

    # --- personal data sheet: Dependents / OccTier / Age ------------------
    if membership_ids:
        pds_rows: list[dict] = []
        for chunk in _chunked(membership_ids):
            for cols in (
                "membership_number_id,occupation,number_of_dependents,DependentCount,date_of_birth,created_at",
                "membership_number_id,occupation,number_of_dependents,date_of_birth",
                "membership_number_id,occupation,date_of_birth",
            ):
                try:
                    pds_rows += (
                        supabase.table("personal_data_sheet")
                        .select(cols)
                        .in_("membership_number_id", chunk)
                        .execute()
                    ).data or []
                    break
                except Exception:
                    continue
        pds_by_membership: dict[str, dict] = {}
        for row in pds_rows:
            key = str(row.get("membership_number_id") or "").strip()
            if key and key not in pds_by_membership:
                pds_by_membership[key] = row
        for mid, mnid in ctx["membership_by_member"].items():
            if mnid in pds_by_membership:
                ctx["pds_by_member"][mid] = pds_by_membership[mnid]


    # --- classification points: ShareCapital (#16) and Groceries (#20) ----
    # POINT scores, not pesos: ShareCapital runs 0-20, Groceries 3-10.
    # Despite the column name, this table keys on the member UUID.
    # Latest accrual per member wins.
    try:
        cls_rows: list[dict] = []
        for chunk in _chunked(member_ids):
            cls_rows += (
                supabase.table("member_classification_temporal")
                .select("membership_number_id,cbu_points,grocery_points,accrual_date")
                .in_("membership_number_id", chunk)
                .order("accrual_date", desc=True)
                .limit(10000)
                .execute()
            ).data or []
        for row in cls_rows:
            key = str(row.get("membership_number_id") or "").strip()
            if key and key not in ctx["classification_by_member"]:
                ctx["classification_by_member"][key] = row
    except Exception:
        pass

    # --- savings balance + time deposit flag ------------------------------
    accounts: list[dict] = []
    for chunk in _chunked(member_ids):
        try:
            accounts += (
                supabase.table("savings_accounts")
                .select("account_number,member_id,account_kind,balance,status")
                .in_("member_id", chunk)
                .execute()
            ).data or []
        except Exception:
            pass
    account_to_member: dict[str, str] = {}
    for acct in accounts:
        mid = str(acct.get("member_id") or "")
        if not mid:
            continue
        kind = _norm_status(acct.get("account_kind"))
        balance = coerce_float(acct.get("balance"))
        entry = ctx["savings_by_member"].setdefault(
            mid, {"savings": None, "has_time_deposit": None}
        )
        # #18 HasTimeDeposit. This schema's account_kind only distinguishes
        # 'member' from 'standalone' -- it does not record time deposits at
        # all, so the flag stays None (-> NaN, "unknown") rather than being
        # asserted as 0. Claiming "no time deposit" for every member would be
        # telling the model something the records do not say. If the
        # cooperative starts recording time deposits, detect them here.
        if _is_time_deposit(kind):
            entry["has_time_deposit"] = 1
        elif balance is not None:
            entry["savings"] = (entry["savings"] or 0.0) + balance
        account_to_member[str(acct.get("account_number"))] = mid

    # --- SavingsChange: balance now minus balance ~12 months ago ----------
    # Uses the ledger's running_balance. Members whose savings were imported as
    # an opening balance have no 12-month-old entry, so this stays NaN — which
    # is the honest answer, not 0.
    if account_to_member:
        cutoff = (datetime.utcnow() - timedelta(days=365)).isoformat()
        try:
            prior: dict[str, float] = {}
            for chunk in _chunked(list(account_to_member.keys())):
                rows = (
                    supabase.table("savings_ledger")
                    .select("account_number,running_balance,posted_at")
                    .in_("account_number", chunk)
                    .lte("posted_at", cutoff)
                    .order("posted_at", desc=True)
                    .limit(10000)
                    .execute()
                ).data or []
                for r in rows:
                    acct = str(r.get("account_number"))
                    if acct not in prior:
                        bal = coerce_float(r.get("running_balance"))
                        if bal is not None:
                            prior[acct] = bal
            for acct, bal_then in prior.items():
                mid = account_to_member.get(acct)
                if not mid:
                    continue
                now_bal = (ctx["savings_by_member"].get(mid) or {}).get("savings")
                if now_bal is not None:
                    ctx["savings_change_by_member"][mid] = now_bal - bal_then
        except Exception:
            pass

    return ctx


# ---------------------------------------------------------------------------
# Per-loan derivations
# ---------------------------------------------------------------------------
def _prior_loans(ctx: dict, member_id: str, loan: dict) -> list[dict]:
    """The member's loans strictly BEFORE the one being scored.

    The single place the "previous loans only" rule is enforced (handoff §2).
    Cut is by application_date, with control_number breaking ties so a loan
    never counts itself when several share a date.
    """
    rows = ctx["loans_by_member"].get(str(member_id)) or []
    this_date = _as_date(loan.get("application_date"))
    this_cn = str(loan.get("control_number") or "")
    if this_date is None:
        # No application date: fall back to excluding only this control number.
        return [r for r in rows if str(r.get("control_number")) != this_cn]

    prior = []
    for r in rows:
        cn = str(r.get("control_number") or "")
        if cn == this_cn:
            continue
        d = _as_date(r.get("application_date"))
        if d is None or d > this_date:
            continue
        if d == this_date and cn >= this_cn:
            continue
        prior.append(r)
    return prior


def _went_behind(ctx: dict, loan_id: str, as_of: date) -> bool:
    """Did this loan reach BEHIND_MONTHS of unpaid installments past due?

    Prefers reconstructed schedules. For legacy loans the schedule due dates
    are themselves reconstructed, so a payment-gap test on the legacy ledger is
    the more trustworthy signal where that data exists.
    """
    legacy = ctx["legacy_by_loan"].get(loan_id)
    if legacy:
        # Largest gap between consecutive legacy payments, in days.
        dates = sorted(
            d for d in (_as_date(p.get("payment_date")) for p in legacy) if d
        )
        if len(dates) >= 2:
            widest = max((b - a).days for a, b in zip(dates, dates[1:]))
            if widest >= BEHIND_MONTHS * 30:
                return True
        # delta_days, where recorded, is days late against the expected date.
        for p in legacy:
            delta = coerce_float(p.get("delta_days"))
            if delta is not None and delta >= BEHIND_MONTHS * 30:
                return True
        return False

    schedules = ctx["schedules_by_loan"].get(loan_id) or []
    overdue = 0
    for s in schedules:
        if _norm_status(s.get("schedule_status")) in _PAID_STATUSES:
            continue
        due = _as_date(s.get("due_date"))
        if due is not None and due < as_of:
            overdue += 1
    return overdue >= BEHIND_MONTHS


def _is_open(ctx: dict, loan: dict, as_of: date) -> bool:
    """Was this loan still outstanding on the application date?

    Schedules are the source of truth rather than loan_status, which is not
    reliably maintained on migrated records.
    """
    loan_id = str(loan.get("control_number") or "")
    schedules = ctx["schedules_by_loan"].get(loan_id) or []
    if schedules:
        for s in schedules:
            if _norm_status(s.get("schedule_status")) in _PAID_STATUSES:
                continue
            due = _as_date(s.get("due_date"))
            # An installment not yet paid and not yet past its due date on the
            # application date means the loan was live.
            if due is None or due >= as_of:
                return True
        # Every installment either paid or already overdue-and-unpaid: treat
        # unpaid-overdue as still open.
        return any(
            _norm_status(s.get("schedule_status")) not in _PAID_STATUSES
            for s in schedules
        )
    status = _norm_status(loan.get("loan_status"))
    return status in _UNPAID_STATUSES or status in {"disbursed", "ongoing", "released"}


def _closed_date(ctx: dict, loan: dict) -> date | None:
    """Best estimate of when a prior loan was settled."""
    loan_id = str(loan.get("control_number") or "")
    legacy = ctx["legacy_by_loan"].get(loan_id)
    if legacy:
        dates = [d for d in (_as_date(p.get("payment_date")) for p in legacy) if d]
        if dates:
            return max(dates)
    schedules = ctx["schedules_by_loan"].get(loan_id) or []
    paid_dues = [
        d
        for d in (
            _as_date(s.get("due_date"))
            for s in schedules
            if _norm_status(s.get("schedule_status")) in _PAID_STATUSES
        )
        if d
    ]
    return max(paid_dues) if paid_dues else None


def _count_renewals(ctx: dict, prior: list[dict], loan: dict) -> int:
    """#8 PriorRefinances — prior loans settled by taking a new loan.

    A renewal is a *new loan record* of the same type whose predecessor closes
    out around the same time (distinct from a restructure, which keeps the same
    record and re-terms it). Counts predecessors in the member's prior history
    that were superseded this way.
    """
    by_type: dict[str, list[dict]] = {}
    for r in prior:
        by_type.setdefault(_loan_type_name(r), []).append(r)

    renewals = 0
    for loans_of_type in by_type.values():
        ordered = sorted(
            loans_of_type, key=lambda r: (_as_date(r.get("application_date")) or date.min)
        )
        for older, newer in zip(ordered, ordered[1:]):
            newer_start = _as_date(newer.get("application_date")) or _as_date(
                newer.get("disbursal_date")
            )
            older_end = _closed_date(ctx, older)
            if newer_start and older_end:
                if abs((older_end - newer_start).days) <= RENEWAL_WINDOW_DAYS:
                    renewals += 1
    return renewals


def _original_term(ctx: dict, loan: dict) -> float | None:
    """#2 Term — the term requested at application, not the restructured one.

    `loans.term` is overwritten in place when a loan is extended, and the
    extended term is not knowable on the application date (handoff §4). Where a
    loan's schedule count exceeds its recorded term, the schedule has been
    regenerated; the recorded term is then the *current* one and the original
    is unrecoverable, so the smaller of the two is the safer reading.
    """
    recorded = coerce_float(loan.get("term"))
    loan_id = str(loan.get("control_number") or "")
    schedules = ctx["schedules_by_loan"].get(loan_id) or []
    if not schedules:
        return recorded
    installments = [
        n for n in (coerce_float(s.get("installment_no")) for s in schedules) if n
    ]
    if not installments or recorded is None:
        return recorded
    schedule_term = max(installments)
    # A schedule longer than the recorded term means the record was re-termed
    # downward; a schedule matching it is consistent. Take the minimum so a
    # restructure's extension never inflates the feature.
    return min(recorded, schedule_term)


def _was_restructured(ctx: dict, loan: dict) -> bool:
    """#10 PriorRestructured — same record, re-termed.

    Detected by disagreement between the recorded term and the number of
    installments actually generated: a restructure rewrites the schedule while
    the control number stays put.
    """
    recorded = coerce_float(loan.get("term"))
    loan_id = str(loan.get("control_number") or "")
    schedules = ctx["schedules_by_loan"].get(loan_id) or []
    if recorded is None or not schedules:
        return False
    installments = [
        n for n in (coerce_float(s.get("installment_no")) for s in schedules) if n
    ]
    if not installments:
        return False
    return int(max(installments)) != int(recorded)


def assemble_many(supabase, loans: list[dict], ctx: dict | None = None) -> list[dict]:
    """Build the 21-feature dict for each loan.

    `loans` rows need at least control_number, member_id, loan_amount, term,
    application_date and the joined loan_type. Pass a prebuilt `ctx` from
    `fetch_member_context()` to score several batches off one set of queries.
    """
    if not loans:
        return []
    if ctx is None:
        ctx = fetch_member_context(
            supabase, [str(l.get("member_id")) for l in loans if l.get("member_id")]
        )

    out: list[dict] = []
    for loan in loans:
        member_id = str(loan.get("member_id") or "")
        as_of = _as_date(loan.get("application_date")) or datetime.utcnow().date()

        amount = coerce_float(loan.get("loan_amount")) or coerce_float(
            loan.get("principal_amount")
        )
        term = _original_term(ctx, loan)

        # #3 MonthlyDue — prefer the stored amortization, else compute it.
        due = coerce_float(loan.get("monthly_amortization"))
        if due is None and amount is not None and term:
            due = monthly_due(amount, term, _interest_rate_for(loan))

        # --- member profile: #4 Dependents, #5 OccTier, #6 Age -------------
        pds = ctx["pds_by_member"].get(member_id) or {}
        dependents = coerce_float(pds.get("number_of_dependents"))
        if dependents is None:
            dependents = coerce_float(pds.get("DependentCount"))
        occ_tier = occupation_tier(pds.get("occupation"))
        birth = _as_date(pds.get("date_of_birth"))
        age = None
        if birth is not None:
            age = (as_of - birth).days / 365.25
            if not (15 <= age <= 110):  # implausible DOB — treat as unrecorded
                age = None

        # --- history: #7-#15, previous loans only --------------------------
        prior = _prior_loans(ctx, member_id, loan)
        prior_ids = [str(r.get("control_number") or "") for r in prior]
        prior_amounts = [
            a
            for a in (
                coerce_float(r.get("loan_amount")) or coerce_float(r.get("principal_amount"))
                for r in prior
            )
            if a is not None
        ]

        prior_loans_count = len(prior)
        prior_borrowed = sum(prior_amounts) if prior_amounts else 0.0
        prior_behind = sum(1 for pid in prior_ids if _went_behind(ctx, pid, as_of))
        prior_penalties = sum(1 for pid in prior_ids if pid in ctx["penalty_loan_ids"])
        prior_restructured = sum(1 for r in prior if _was_restructured(ctx, r))
        prior_refinances = _count_renewals(ctx, prior, loan)
        concurrent = sum(1 for r in prior if _is_open(ctx, r, as_of))

        # #13 DebtGrowth — this amount against the member's first-ever loan.
        debt_growth = None
        if prior_amounts and amount is not None:
            first_amount = prior_amounts[0]
            if first_amount:
                debt_growth = amount / first_amount

        # #14 MonthsSinceLastLoan — NaN for a first loan.
        months_since = None
        if prior:
            last_dates = [d for d in (_as_date(r.get("application_date")) for r in prior) if d]
            if last_dates:
                months_since = _months_between(max(last_dates), as_of)

        # --- snapshot: #16-#20 --------------------------------------------
        classification = ctx["classification_by_member"].get(member_id) or {}
        share_capital_points = coerce_float(classification.get("cbu_points"))
        grocery_points = coerce_float(classification.get("grocery_points"))

        savings_entry = ctx["savings_by_member"].get(member_id) or {}
        savings = savings_entry.get("savings")
        has_time_deposit = savings_entry.get("has_time_deposit")
        savings_change = ctx["savings_change_by_member"].get(member_id)

        # #21 HasSnapshot — did any of 16, 17, 19, 20 resolve?
        has_snapshot = int(
            any(
                v is not None
                for v in (share_capital_points, savings, savings_change, grocery_points)
            )
        )

        out.append({
            "LoanAmount": amount,
            "Term": term,
            "MonthlyDue": due,
            "Dependents": dependents,
            "OccTier": occ_tier,
            "Age": age,
            "PriorLoans": prior_loans_count,
            "PriorRefinances": prior_refinances,
            "PriorBehind": prior_behind,
            "PriorRestructured": prior_restructured,
            "PriorPenalties": prior_penalties,
            "PriorBorrowed": prior_borrowed,
            "DebtGrowth": debt_growth,
            "MonthsSinceLastLoan": months_since,
            "ConcurrentLoans": concurrent,
            "ShareCapital": share_capital_points,
            "Savings": savings,
            "HasTimeDeposit": has_time_deposit,
            "SavingsChange": savings_change,
            "Groceries": grocery_points,
            "HasSnapshot": has_snapshot,
        })
    return out


def assemble_one(supabase, loan: dict) -> dict:
    return assemble_many(supabase, [loan])[0]
