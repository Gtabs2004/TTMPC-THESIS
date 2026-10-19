// UI-only mock dataset. The savings-interest v2 engine (SAVINGS_INTEREST_V2_PLAN.md)
// is confirmed and unit-tested but not yet wired into main.py/Supabase/live UI
// (no `savings_interest_v2_schema.sql`, no /api/savings-interest/* endpoints,
// no deposit_interest_policies row set to quarterly). This data exists only so
// the new passbook UI (accrued-interest column, quarterly post modal, YTD
// interest stat) has something to render until that wiring lands — swap for
// the real ledger engine output once the backend exists.
export const mockSavingsData = {
  accountNo: "SA-000127",
  memberName: "MA. CECILIA TACUBAN",
  memberId: "TTMPC-165",
  interestRate: 0.01,
  currentBalance: 11081.09,
  accruedCurrentQuarter: 4.86,
  ytdInterestEarned: 81.09,
  nextPostingDate: "31-Dec-2026",
  ledger: [
    { id: 1, date: "31-Dec-2025", code: "INIT", desc: "Opening Balance", debit: null, credit: null, interest: null, balance: 5000.00, days: 0, accrued: 0.00 },
    { id: 2, date: "25-Jan-2026", code: "CD", desc: "Cash Deposit", debit: null, credit: 5000.00, interest: null, balance: 10000.00, days: 25, accrued: 6.85 },
    { id: 3, date: "31-Mar-2026", code: "Int.", desc: "Q1 Interest Credited", debit: null, credit: null, interest: 24.66, balance: 10024.66, days: 65, accrued: 17.85 },
    { id: 4, date: "30-Apr-2026", code: "CD", desc: "Cash Deposit", debit: null, credit: 10000.00, interest: null, balance: 20024.66, days: 30, accrued: 16.46 },
    { id: 5, date: "15-May-2026", code: "WD", desc: "Cash Withdrawal", debit: 6000.00, credit: null, interest: null, balance: 14024.66, days: 15, accrued: 5.76 },
    { id: 6, date: "20-May-2026", code: "WD", desc: "Cash Withdrawal", debit: 5000.00, credit: null, interest: null, balance: 9024.66, days: 5, accrued: 1.24 },
    { id: 7, date: "30-Jun-2026", code: "Int.", desc: "Q2 Interest Credited", debit: null, credit: null, interest: 33.60, balance: 9058.26, days: 41, accrued: 10.18 },
    { id: 8, date: "30-Sep-2026", code: "Int.", desc: "Q3 Interest Credited", debit: null, credit: null, interest: 22.83, balance: 9081.09, days: 92, accrued: 22.89 },
    { id: 9, date: "16-Oct-2026", code: "CD", desc: "Cash Deposit", debit: null, credit: 2000.00, interest: null, balance: 11081.09, days: 16, accrued: 4.86 },
  ],
};

export const QUARTER_LABELS = {
  "31-Mar": "Q1",
  "30-Jun": "Q2",
  "30-Sep": "Q3",
  "31-Dec": "Q4",
};
