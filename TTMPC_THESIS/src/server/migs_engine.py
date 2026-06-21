"""MIGS scoring engine — pure functions, no DB, no side effects.

Implements the TTMPC institutional 7-criterion 100-point matrix and
membership classification rules. Pass raw values in, get a breakdown out.

Boundary policy (where the printed spec has gaps like "0" vs "300 to 2000"
leaving 0.01-299.99 unscored): we round DOWN to the lower bracket. A value
of 100 CBU lands in the "0 pts" bracket because 300 is the next floor.

Classification:
  - MIGS:     50-100 points  (multiplier 5.0x, voting yes)
  - Non-MIGS:  0-49 points   (multiplier 3.0x, voting no)
"""

from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Optional


# ---------------------------------------------------------------------------
# Bracket scorers — each returns an int score for the given raw value.
# ---------------------------------------------------------------------------

def score_cbu_added(amount: float | None) -> int:
    """CBU added for the year (max 20 pts)."""
    v = float(amount or 0)
    if v <= 0:
        return 0
    if v < 300:
        return 0           # below the first scoring bracket
    if v <= 2000:
        return 5
    if v <= 4000:
        return 8
    if v <= 6000:
        return 11
    if v <= 8000:
        return 14
    if v <= 10000:
        return 17
    return 20              # above 10000


def score_loan_availed(amount: float | None) -> int:
    """Amount of loan availed for the year (max 20 pts)."""
    v = float(amount or 0)
    if v <= 0:
        return 0
    if v <= 20000:
        return 2           # "Below 20000" — 20000.00 inclusive at low bracket
    if v <= 40000:
        return 4
    if v <= 60000:
        return 8
    if v <= 80000:
        return 12
    if v <= 100000:
        return 16
    return 20


def score_savings_balance(amount: float | None) -> int:
    """Savings + time deposit balance (max 15 pts)."""
    v = float(amount or 0)
    if v < 2000:
        return 0
    if v <= 5000:
        return 3
    if v < 20000:
        return 6
    if v < 50000:
        return 10
    return 15


def score_payment_record(late_count: int | None) -> int:
    """Late payments this year (max 20 pts). Lower is better."""
    n = int(late_count or 0)
    if n <= 0:
        return 20
    if n == 1:
        return 15
    if n == 2:
        return 10
    if n == 3:
        return 5
    return 0


def score_groceries(amount: float | None) -> int:
    """Groceries availed for the year (max 10 pts).

    Spec gives no explicit 0 bracket; "Below 20000 = 3 pts" implies even
    zero earns the base 3. Adjust here if cooperative says 0 should = 0.
    """
    v = float(amount or 0)
    if v <= 20000:
        return 3
    if v <= 30000:
        return 5
    if v <= 40000:
        return 7
    return 10


def score_outside_loan(has_outside_loan: bool | None) -> int:
    """Loans from other Private Lending Institutions (max 10 pts)."""
    # Default to 10 (no outside loan) when unknown — innocent until flagged.
    if has_outside_loan is True:
        return 0
    return 10


def score_attendance(present: bool | None) -> int:
    """Assembly attendance (max 5 pts)."""
    return 5 if present is True else 0


# ---------------------------------------------------------------------------
# Aggregation + classification
# ---------------------------------------------------------------------------

MIGS_THRESHOLD = 50
MIGS_LOAN_MULTIPLIER = 5.0
NON_MIGS_LOAN_MULTIPLIER = 3.0


@dataclass
class CriterionResult:
    criterion: str
    value: object              # raw value (number / bool / None)
    score: int                 # awarded points
    max_score: int             # bracket cap
    progress: int              # 0-100 (score / max_score * 100, rounded)


@dataclass
class MigsResult:
    total_score: int
    max_score: int             # 100
    status: str                # "MIGS Qualified" | "Non-MIGS"
    loan_multiplier: float     # 5.0 or 3.0
    can_vote: bool
    breakdown: list[CriterionResult]


def _progress(score: int, max_score: int) -> int:
    if max_score <= 0:
        return 0
    return round((score / max_score) * 100)


def compute_migs_score(
    *,
    cbu_added: float | None = None,
    loan_availed: float | None = None,
    savings_balance: float | None = None,
    late_payment_count: int | None = None,
    groceries_availed: float | None = None,
    has_outside_loan: bool | None = None,
    assembly_present: bool | None = None,
) -> MigsResult:
    """Compute the full MIGS scorecard from raw per-member values.

    All inputs are optional; missing values use the criterion's safe default
    (see individual scoring functions). The engine never raises.
    """
    breakdown: list[CriterionResult] = []

    s = score_cbu_added(cbu_added)
    breakdown.append(CriterionResult("Capital Build-Up", cbu_added, s, 20, _progress(s, 20)))

    s = score_loan_availed(loan_availed)
    breakdown.append(CriterionResult("Loan Availed", loan_availed, s, 20, _progress(s, 20)))

    s = score_savings_balance(savings_balance)
    breakdown.append(CriterionResult("Savings / Time Deposit", savings_balance, s, 15, _progress(s, 15)))

    s = score_payment_record(late_payment_count)
    breakdown.append(CriterionResult("Payment Record (late count)", late_payment_count, s, 20, _progress(s, 20)))

    s = score_groceries(groceries_availed)
    breakdown.append(CriterionResult("Groceries Availed", groceries_availed, s, 10, _progress(s, 10)))

    s = score_outside_loan(has_outside_loan)
    breakdown.append(CriterionResult("Loans from Other PLIs", has_outside_loan, s, 10, _progress(s, 10)))

    s = score_attendance(assembly_present)
    breakdown.append(CriterionResult("Assembly Attendance", assembly_present, s, 5, _progress(s, 5)))

    total = sum(c.score for c in breakdown)
    is_migs = total >= MIGS_THRESHOLD

    return MigsResult(
        total_score=total,
        max_score=100,
        status="MIGS Qualified" if is_migs else "Non-MIGS",
        loan_multiplier=MIGS_LOAN_MULTIPLIER if is_migs else NON_MIGS_LOAN_MULTIPLIER,
        can_vote=is_migs,
        breakdown=breakdown,
    )


def result_to_dict(result: MigsResult) -> dict:
    """Serialize a MigsResult to plain JSON-friendly dicts."""
    return {
        "total_score": result.total_score,
        "max_score": result.max_score,
        "status": result.status,
        "loan_multiplier": result.loan_multiplier,
        "can_vote": result.can_vote,
        "breakdown": [asdict(c) for c in result.breakdown],
    }
