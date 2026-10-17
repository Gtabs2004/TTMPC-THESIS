"""
Exact numerical agreement tests against the 9 reference transaction rows
given in the confirmed cooperative savings spec (1% p.a., Actual/365,
running-balance basis, quarterly posting). Run with: pytest test_ledger_engine.py
"""

from datetime import date
from decimal import Decimal

import pytest

from ledger_engine import SavingsLedgerEngine, Transaction, render_passbook


@pytest.fixture
def engine() -> SavingsLedgerEngine:
    return SavingsLedgerEngine(opening_date=date(2025, 12, 31), opening_balance=Decimal("5000.00"))


def test_opening_balance(engine: SavingsLedgerEngine) -> None:
    assert engine.balance == Decimal("5000.00")


def test_full_reference_sequence(engine: SavingsLedgerEngine) -> None:
    transactions = [
        Transaction(date(2026, 1, 25), "CD", Decimal("5000.00")),
        Transaction(date(2026, 4, 30), "CD", Decimal("10000.00")),
        Transaction(date(2026, 5, 15), "WD", Decimal("6000.00")),
        Transaction(date(2026, 5, 20), "WD", Decimal("5000.00")),
        Transaction(date(2026, 10, 16), "CD", Decimal("2000.00")),
    ]
    quarter_closes = [date(2026, 3, 31), date(2026, 6, 30), date(2026, 9, 30)]

    rows = engine.run(transactions, quarter_closes)
    by_date = {(r.date, r.code): r for r in rows}

    # Row 2: 25-Jan-2026 CD
    r = by_date[(date(2026, 1, 25), "CD")]
    assert r.deposit == Decimal("5000.00")
    assert r.total_balance == Decimal("10000.00")
    assert r.accrued_line_interest == Decimal("6.85")

    # Row 3: 31-Mar-2026 Int. (Q1 close)
    # NOTE: the source spec's worked example prints 17.85 for this one line,
    # but 65 * 10000.00 * 0.01 / 365 = 17.8082... -> 17.81 (half-up to centavo).
    # The spec's own posted total (24.66) and every downstream balance/posting
    # match 17.81, not 17.85, confirming 17.85 is a typo in the spec, not a
    # different rule. Asserting the formula-correct value here.
    r = by_date[(date(2026, 3, 31), "Int.")]
    assert r.accrued_line_interest == Decimal("17.81")
    assert r.interest_posted == Decimal("24.66")  # 6.85 carried + 17.81
    assert r.total_balance == Decimal("10024.66")

    # Row 4: 30-Apr-2026 CD
    r = by_date[(date(2026, 4, 30), "CD")]
    assert r.deposit == Decimal("10000.00")
    assert r.total_balance == Decimal("20024.66")
    assert r.accrued_line_interest == Decimal("16.46")

    # Row 5: 15-May-2026 WD
    r = by_date[(date(2026, 5, 15), "WD")]
    assert r.withdrawal == Decimal("6000.00")
    assert r.total_balance == Decimal("14024.66")
    assert r.accrued_line_interest == Decimal("5.76")

    # Row 6: 20-May-2026 WD
    r = by_date[(date(2026, 5, 20), "WD")]
    assert r.withdrawal == Decimal("5000.00")
    assert r.total_balance == Decimal("9024.66")
    assert r.accrued_line_interest == Decimal("1.24")

    # Row 7: 30-Jun-2026 Int. (Q2 close)
    # Same spec rounding typo as Row 3 (41*9024.66*0.01/365 = 10.1375... ->
    # 10.14, not the spec's printed 10.18); posted total/balance still match.
    r = by_date[(date(2026, 6, 30), "Int.")]
    assert r.accrued_line_interest == Decimal("10.14")
    assert r.interest_posted == Decimal("33.60")  # 16.46+5.76+1.24 + 10.14
    assert r.total_balance == Decimal("9058.26")

    # Row 8: 30-Sep-2026 Int. (Q3 close)
    # Formula-correct: 92*9058.26*0.01/365 = 22.8286... -> 22.83, matching the
    # spec's own posted/balance figures (the spec's printed line value of
    # 22.89 for this row is the same class of typo as Rows 3 and 7).
    r = by_date[(date(2026, 9, 30), "Int.")]
    assert r.accrued_line_interest == Decimal("22.83")
    assert r.interest_posted == Decimal("22.83")
    assert r.total_balance == Decimal("9081.09")

    # Row 9: 16-Oct-2026 CD
    r = by_date[(date(2026, 10, 16), "CD")]
    assert r.deposit == Decimal("2000.00")
    assert r.total_balance == Decimal("11081.09")
    assert r.accrued_line_interest == Decimal("4.86")


def test_non_quarter_end_rejected(engine: SavingsLedgerEngine) -> None:
    with pytest.raises(ValueError, match="not a quarter-end date"):
        engine.post_quarter_close(date(2026, 4, 1))


def test_withdrawal_exceeding_balance_rejected(engine: SavingsLedgerEngine) -> None:
    with pytest.raises(ValueError, match="exceeds balance"):
        engine.post_transaction(Transaction(date(2026, 1, 1), "WD", Decimal("999999")))


def test_backdated_transaction_rejected(engine: SavingsLedgerEngine) -> None:
    engine.post_transaction(Transaction(date(2026, 2, 1), "CD", Decimal("100")))
    with pytest.raises(ValueError, match="precedes prior ledger date"):
        engine.post_transaction(Transaction(date(2026, 1, 1), "CD", Decimal("100")))


def test_invalid_transaction_code_rejected() -> None:
    with pytest.raises(ValueError, match="CD or WD"):
        Transaction(date(2026, 1, 1), "XX", Decimal("100"))


def test_non_positive_amount_rejected() -> None:
    with pytest.raises(ValueError, match="must be positive"):
        Transaction(date(2026, 1, 1), "CD", Decimal("0"))


def test_minimum_balance_blocks_accrual() -> None:
    eng = SavingsLedgerEngine(
        opening_date=date(2026, 1, 1),
        opening_balance=Decimal("500.00"),
        minimum_balance=Decimal("1000.00"),
    )
    close = eng.post_quarter_close(date(2026, 3, 31))
    assert close.accrued_line_interest == Decimal("0")
    assert close.interest_posted == Decimal("0.00")
    assert close.total_balance == Decimal("500.00")


def test_render_passbook_formats_and_skips_null_rows(engine: SavingsLedgerEngine) -> None:
    engine.post_transaction(Transaction(date(2026, 1, 25), "CD", Decimal("5000.00")))
    rows = engine.rows + [None]  # guard against a stray null row (spreadsheet #NUM!-style input)
    table = render_passbook(rows)
    assert len(table) == 1
    assert table[0]["date"] == "2026-01-25"
    assert table[0]["deposits"] == "5000.00"
    assert table[0]["withdrawals"] == ""
    assert table[0]["total_balance"] == "10000.00"


def test_quarter_close_same_day_as_deposit_orders_after(engine: SavingsLedgerEngine) -> None:
    rows = engine.run(
        [Transaction(date(2026, 3, 31), "CD", Decimal("1000.00"))],
        [date(2026, 3, 31)],
    )
    assert [r.code for r in rows] == ["CD", "Int."]
