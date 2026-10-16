from decimal import Decimal

import pytest

from services.time_deposit_engine import TimeDepositError, calculate_td_interest


@pytest.mark.parametrize(
    ("principal", "term_days", "rate", "interest", "maturity_value"),
    [
        ("50000", 180, "0.015", "369.86", "50369.86"),
        ("50000", 365, "0.020", "1000.00", "51000.00"),
        ("200000", 180, "0.020", "1972.60", "201972.60"),
        ("200000", 365, "0.025", "5000.00", "205000.00"),
        ("500000", 180, "0.025", "6164.38", "506164.38"),
        ("500000", 365, "0.030", "15000.00", "515000.00"),
        ("800000", 180, "0.030", "11835.62", "811835.62"),
        ("800000", 365, "0.040", "32000.00", "832000.00"),
    ],
)
def test_calculate_td_interest_matches_confirmed_examples(
    principal, term_days, rate, interest, maturity_value
):
    quote = calculate_td_interest(principal, term_days)

    assert quote.annual_rate == Decimal(rate)
    assert quote.interest == Decimal(interest)
    assert quote.maturity_value == Decimal(maturity_value)


@pytest.mark.parametrize(
    ("principal", "bracket_label"),
    [
        ("199999.98", "PHP 50,000.00-PHP 199,999.99"),
        ("199999.99", "PHP 50,000.00-PHP 199,999.99"),
        ("200000.00", "PHP 200,000.00-PHP 499,999.99"),
        ("499999.99", "PHP 200,000.00-PHP 499,999.99"),
        ("500000.00", "PHP 500,000.00-PHP 799,999.99"),
        ("799999.99", "PHP 500,000.00-PHP 799,999.99"),
        ("800000.00", "PHP 800,000.00 and above"),
    ],
)
def test_rate_brackets_use_exact_boundaries(principal, bracket_label):
    assert calculate_td_interest(principal, 365).bracket_label == bracket_label


@pytest.mark.parametrize("term_days", [0, 30, 181, 360, 366])
def test_unsupported_terms_are_rejected(term_days):
    with pytest.raises(TimeDepositError, match="180 or 365"):
        calculate_td_interest("50000", term_days)


def test_amount_below_first_defined_bracket_has_no_quote():
    with pytest.raises(TimeDepositError, match="No applicable"):
        calculate_td_interest("49999.99", 180)