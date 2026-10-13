"""Time Deposit (TD) engine: pure business logic and double-entry postings.

No database access. Every execute_* function receives a `post_transaction`
callable (debit, credit, amount, ref_id, desc) supplied by the caller, builds
ALL journal lines first, checks them, and only then posts. The caller must run
the posting inside one database transaction (e.g. a Postgres RPC) so a failure
mid-way cannot leave half a settlement on the books.

Day count: actual days, interest year of `divisor` (default 360).
Interest-bearing days run from start_date (inclusive) to maturity_date (exclusive).
Rounding: ROUND_HALF_UP to the centavo. Each daily accrual is rounded when
posted, so cumulative totals always equal what is on the books.
"""

from __future__ import annotations

from dataclasses import dataclass, replace
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal
from enum import Enum
from typing import Callable, Iterable

CENT = Decimal("0.01")
ZERO = Decimal("0")

MEMBER_SAVINGS = "MEMBER_SAVINGS"
TIME_DEPOSIT_LIABILITY = "TIME_DEPOSIT_LIABILITY"
INTEREST_EXPENSE_TD = "INTEREST_EXPENSE_TD"
ACCRUED_INTEREST_PAYABLE = "ACCRUED_INTEREST_PAYABLE"
WITHHOLDING_TAX_PAYABLE = "WITHHOLDING_TAX_PAYABLE"
FEE_INCOME = "FEE_INCOME"

PostTransaction = Callable[[str, str, Decimal, str, str], object]


class TimeDepositError(ValueError):
    pass


class RolloverMode(str, Enum):
    FULL_PAYOUT = "FULL_PAYOUT"
    ROLL_PRINCIPAL_ONLY = "ROLL_PRINCIPAL_ONLY"
    ROLL_ALL = "ROLL_ALL"


class ContractStatus(str, Enum):
    ACTIVE = "ACTIVE"
    MATURED = "MATURED"
    PRE_TERMINATED = "PRE_TERMINATED"


def money(value: Decimal) -> Decimal:
    return Decimal(value).quantize(CENT, rounding=ROUND_HALF_UP)


def _dec(value, name: str) -> Decimal:
    try:
        d = Decimal(str(value))
    except Exception as exc:
        raise TimeDepositError(f"{name} is not a number: {value!r}") from exc
    if not d.is_finite():
        raise TimeDepositError(f"{name} must be finite.")
    return d


@dataclass(frozen=True)
class TDTerms:
    annual_rate: Decimal          # e.g. Decimal("0.045") for 4.5% p.a.
    term_days: int
    start_date: date
    tax_rate: Decimal = ZERO      # 0 when the member is tax-exempt
    divisor: int = 360


@dataclass(frozen=True)
class TDContract:
    contract_id: str
    savings_account_id: str
    principal: Decimal
    annual_rate: Decimal
    tax_rate: Decimal
    term_days: int
    start_date: date
    divisor: int = 360
    cumulative_gross: Decimal = ZERO
    cumulative_tax: Decimal = ZERO
    last_accrual_date: date | None = None   # last interest day accrued
    status: ContractStatus = ContractStatus.ACTIVE
    cycle: int = 1                           # increments on each rollover

    @property
    def maturity_date(self) -> date:
        return self.start_date + timedelta(days=self.term_days)

    @property
    def cumulative_net(self) -> Decimal:
        return self.cumulative_gross - self.cumulative_tax

    @property
    def days_accrued(self) -> int:
        if self.last_accrual_date is None:
            return 0
        return (self.last_accrual_date - self.start_date).days + 1


@dataclass(frozen=True)
class JournalLine:
    debit: str
    credit: str
    amount: Decimal
    ref_id: str
    desc: str


@dataclass(frozen=True)
class AccrualQuote:
    gross: Decimal
    tax: Decimal
    net: Decimal


@dataclass(frozen=True)
class PreTerminationQuote:
    elapsed_ratio: Decimal
    applied_rate: Decimal
    adjusted_gross: Decimal
    adjusted_tax: Decimal
    adjusted_net: Decimal
    admin_fee: Decimal
    principal_payout: Decimal
    total_payout: Decimal


# ---------------------------------------------------------------------------
# Validation and posting helpers
# ---------------------------------------------------------------------------

def _validate_rate(rate: Decimal, name: str) -> None:
    if rate < 0 or rate >= 1:
        raise TimeDepositError(f"{name} must be a fraction between 0 and 1 (got {rate}).")


def _validate_terms(principal: Decimal, terms: TDTerms) -> None:
    if principal <= 0:
        raise TimeDepositError("Principal must be greater than zero.")
    if money(principal) != principal:
        raise TimeDepositError("Principal must be in whole centavos.")
    _validate_rate(_dec(terms.annual_rate, "annual_rate"), "annual_rate")
    _validate_rate(_dec(terms.tax_rate, "tax_rate"), "tax_rate")
    if int(terms.term_days) <= 0:
        raise TimeDepositError("term_days must be greater than zero.")
    if int(terms.divisor) not in (360, 365):
        raise TimeDepositError("divisor must be 360 or 365.")


def _line(debit: str, credit: str, amount: Decimal, ref_id: str, desc: str) -> JournalLine | None:
    """One debit/credit pair. Zero amounts are dropped; negative amounts swap sides."""
    amount = money(amount)
    if amount == 0:
        return None
    if amount < 0:
        return JournalLine(credit, debit, -amount, ref_id, f"{desc} (reversal)")
    return JournalLine(debit, credit, amount, ref_id, desc)


def _commit(lines: Iterable[JournalLine | None], post_transaction: PostTransaction) -> list[JournalLine]:
    batch = [ln for ln in lines if ln is not None]
    for ln in batch:
        if ln.debit == ln.credit:
            raise TimeDepositError(f"Line debits and credits the same account: {ln}")
        if ln.amount <= 0 or money(ln.amount) != ln.amount:
            raise TimeDepositError(f"Invalid line amount: {ln}")
    for ln in batch:
        post_transaction(ln.debit, ln.credit, ln.amount, ln.ref_id, ln.desc)
    return batch


# ---------------------------------------------------------------------------
# Quotes (no posting)
# ---------------------------------------------------------------------------

def calculate_daily_accrual(principal, rate, tax_rate, divisor: int = 360) -> AccrualQuote:
    principal = _dec(principal, "principal")
    rate = _dec(rate, "rate")
    tax_rate = _dec(tax_rate, "tax_rate")
    _validate_rate(rate, "rate")
    _validate_rate(tax_rate, "tax_rate")
    gross = money(principal * rate / Decimal(divisor))
    tax = money(gross * tax_rate)
    return AccrualQuote(gross=gross, tax=tax, net=gross - tax)


def _step_down_rate(elapsed_ratio: Decimal, contract_rate: Decimal, savings_rate: Decimal) -> Decimal:
    if elapsed_ratio < Decimal("0.25"):
        return ZERO
    if elapsed_ratio < Decimal("0.50"):
        # Never pay more for breaking early than the contract itself would.
        return min(savings_rate, contract_rate)
    if elapsed_ratio < Decimal("0.75"):
        return contract_rate * Decimal("0.50")
    return contract_rate * Decimal("0.75")


def quote_pre_termination(
    principal, rate, tax_rate, term_days: int, days_elapsed: int, savings_rate, admin_fee,
    divisor: int = 360,
) -> PreTerminationQuote:
    principal = _dec(principal, "principal")
    rate = _dec(rate, "rate")
    tax_rate = _dec(tax_rate, "tax_rate")
    savings_rate = _dec(savings_rate, "savings_rate")
    admin_fee = money(_dec(admin_fee, "admin_fee"))
    for r, n in ((rate, "rate"), (tax_rate, "tax_rate"), (savings_rate, "savings_rate")):
        _validate_rate(r, n)
    if term_days <= 0:
        raise TimeDepositError("term_days must be greater than zero.")
    if not 0 <= days_elapsed < term_days:
        raise TimeDepositError("Pre-termination needs 0 <= days_elapsed < term_days; at or past maturity use settlement.")
    if admin_fee < 0 or admin_fee > principal:
        raise TimeDepositError("admin_fee must be between 0 and the principal.")

    elapsed_ratio = Decimal(days_elapsed) / Decimal(term_days)
    applied_rate = _step_down_rate(elapsed_ratio, rate, savings_rate)
    # Rounded once over the whole period, not per day.
    adjusted_gross = money(principal * applied_rate * Decimal(days_elapsed) / Decimal(divisor))
    adjusted_tax = money(adjusted_gross * tax_rate)
    adjusted_net = adjusted_gross - adjusted_tax
    principal_payout = principal - admin_fee
    return PreTerminationQuote(
        elapsed_ratio=elapsed_ratio,
        applied_rate=applied_rate,
        adjusted_gross=adjusted_gross,
        adjusted_tax=adjusted_tax,
        adjusted_net=adjusted_net,
        admin_fee=admin_fee,
        principal_payout=principal_payout,
        total_payout=principal_payout + adjusted_net,
    )


# ---------------------------------------------------------------------------
# Executions (post journal lines, return the new contract state)
# ---------------------------------------------------------------------------

def execute_placement(
    savings_account_id: str, principal, terms: TDTerms, *,
    contract_id: str, post_transaction: PostTransaction,
) -> TDContract:
    principal = _dec(principal, "principal")
    _validate_terms(principal, terms)
    contract = TDContract(
        contract_id=contract_id,
        savings_account_id=savings_account_id,
        principal=principal,
        annual_rate=_dec(terms.annual_rate, "annual_rate"),
        tax_rate=_dec(terms.tax_rate, "tax_rate"),
        term_days=int(terms.term_days),
        start_date=terms.start_date,
        divisor=int(terms.divisor),
    )
    _commit([
        _line(MEMBER_SAVINGS, TIME_DEPOSIT_LIABILITY, principal, contract_id,
              f"TD placement from {savings_account_id}"),
    ], post_transaction)
    return contract


def _accrue_one_day(contract: TDContract, day: date) -> tuple[TDContract, list[JournalLine | None]]:
    q = calculate_daily_accrual(contract.principal, contract.annual_rate, contract.tax_rate, contract.divisor)
    ref = f"{contract.contract_id}:{day.isoformat()}"
    lines = [
        _line(INTEREST_EXPENSE_TD, ACCRUED_INTEREST_PAYABLE, q.gross, ref, f"TD interest accrual {day}"),
        _line(ACCRUED_INTEREST_PAYABLE, WITHHOLDING_TAX_PAYABLE, q.tax, ref, f"TD withholding tax {day}"),
    ]
    updated = replace(
        contract,
        cumulative_gross=contract.cumulative_gross + q.gross,
        cumulative_tax=contract.cumulative_tax + q.tax,
        last_accrual_date=day,
    )
    return updated, lines


def execute_daily_accrual_batch(
    active_contracts: Iterable[TDContract], run_date: date, *, post_transaction: PostTransaction,
) -> list[TDContract]:
    """Accrue every interest day up to and including run_date (catching up missed days).

    Idempotent: days already accrued are skipped, and nothing accrues on or after
    the maturity date. Returns the updated contracts in the same order.
    """
    updated_contracts: list[TDContract] = []
    for contract in active_contracts:
        if contract.status != ContractStatus.ACTIVE:
            updated_contracts.append(contract)
            continue
        next_day = (contract.last_accrual_date + timedelta(days=1)
                    if contract.last_accrual_date else contract.start_date)
        last_day = min(run_date, contract.maturity_date - timedelta(days=1))
        lines: list[JournalLine | None] = []
        current = contract
        day = next_day
        while day <= last_day:
            current, day_lines = _accrue_one_day(current, day)
            lines.extend(day_lines)
            day += timedelta(days=1)
        _commit(lines, post_transaction)
        updated_contracts.append(current)
    return updated_contracts


def execute_maturity_settlement(
    contract: TDContract, rollover_mode: RolloverMode | str, *,
    post_transaction: PostTransaction, new_annual_rate=None,
) -> TDContract:
    """Settle a fully accrued contract.

    For the two roll modes, `new_annual_rate` is the rate in force on the
    rollover date; if omitted the old rate is kept.
    """
    mode = RolloverMode(rollover_mode)
    if contract.status != ContractStatus.ACTIVE:
        raise TimeDepositError(f"Contract {contract.contract_id} is {contract.status.value}, not ACTIVE.")
    if contract.days_accrued != contract.term_days:
        raise TimeDepositError(
            f"Contract {contract.contract_id} has {contract.days_accrued} of {contract.term_days} "
            "days accrued; run the accrual batch up to the day before maturity first."
        )

    ref = f"{contract.contract_id}:maturity:{contract.cycle}"
    net = contract.cumulative_net
    new_rate = contract.annual_rate if new_annual_rate is None else _dec(new_annual_rate, "new_annual_rate")
    _validate_rate(new_rate, "new_annual_rate")

    if mode == RolloverMode.FULL_PAYOUT:
        _commit([
            _line(ACCRUED_INTEREST_PAYABLE, MEMBER_SAVINGS, net, ref, "TD interest paid to savings"),
            _line(TIME_DEPOSIT_LIABILITY, MEMBER_SAVINGS, contract.principal, ref, "TD principal paid to savings"),
        ], post_transaction)
        return replace(contract, status=ContractStatus.MATURED)

    if mode == RolloverMode.ROLL_PRINCIPAL_ONLY:
        _commit([
            _line(ACCRUED_INTEREST_PAYABLE, MEMBER_SAVINGS, net, ref, "TD interest paid to savings; principal rolled"),
        ], post_transaction)
        new_principal = contract.principal
    else:  # ROLL_ALL
        _commit([
            _line(ACCRUED_INTEREST_PAYABLE, TIME_DEPOSIT_LIABILITY, net, ref, "TD interest capitalised on rollover"),
        ], post_transaction)
        new_principal = contract.principal + net

    return replace(
        contract,
        principal=new_principal,
        annual_rate=new_rate,
        start_date=contract.maturity_date,
        cumulative_gross=ZERO,
        cumulative_tax=ZERO,
        last_accrual_date=None,
        status=ContractStatus.ACTIVE,
        cycle=contract.cycle + 1,
    )


def execute_pre_termination(
    contract: TDContract, current_date: date, savings_rate, admin_fee, *,
    post_transaction: PostTransaction,
) -> tuple[TDContract, PreTerminationQuote]:
    """Break a contract before maturity and claw back interest not earned.

    Accrued Interest Payable holds only the NET interest (tax was moved to
    Withholding Tax Payable each day), so the clawback is split: excess net comes
    back out of Accrued Interest Payable, excess tax out of Withholding Tax
    Payable. Both reduce Interest Expense by (cumulative_gross - adjusted_gross).
    """
    if contract.status != ContractStatus.ACTIVE:
        raise TimeDepositError(f"Contract {contract.contract_id} is {contract.status.value}, not ACTIVE.")
    days_elapsed = (current_date - contract.start_date).days
    quote = quote_pre_termination(
        contract.principal, contract.annual_rate, contract.tax_rate, contract.term_days,
        days_elapsed, savings_rate, admin_fee, divisor=contract.divisor,
    )

    ref = f"{contract.contract_id}:preterm:{contract.cycle}"
    excess_net = contract.cumulative_net - quote.adjusted_net
    excess_tax = contract.cumulative_tax - quote.adjusted_tax
    _commit([
        # Clawback (a negative amount, e.g. accrual behind schedule, posts as a top-up).
        _line(ACCRUED_INTEREST_PAYABLE, INTEREST_EXPENSE_TD, excess_net, ref, "TD pre-termination: unearned interest reversed"),
        _line(WITHHOLDING_TAX_PAYABLE, INTEREST_EXPENSE_TD, excess_tax, ref, "TD pre-termination: withholding tax on unearned interest reversed"),
        # Earned interest and principal to the member.
        _line(ACCRUED_INTEREST_PAYABLE, MEMBER_SAVINGS, quote.adjusted_net, ref, "TD pre-termination: earned interest to savings"),
        _line(TIME_DEPOSIT_LIABILITY, MEMBER_SAVINGS, quote.principal_payout, ref, "TD pre-termination: principal to savings"),
        _line(TIME_DEPOSIT_LIABILITY, FEE_INCOME, quote.admin_fee, ref, "TD pre-termination admin fee"),
    ], post_transaction)

    closed = replace(
        contract,
        cumulative_gross=quote.adjusted_gross,
        cumulative_tax=quote.adjusted_tax,
        status=ContractStatus.PRE_TERMINATED,
    )
    return closed, quote
