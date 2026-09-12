// Shared ordering for `capital_build_up` rows across the Member portal.
//
// `capital_build_up` has no `created_at` column and `id` is a random
// `gen_random_uuid()` — not insertion order — so two rows can share the exact
// same `transaction_date` (same-day deposits, or an ISC capitalization landing
// on the same date as another CBU event) with no reliable way to tell which
// one actually happened last. Sorting by `transaction_date` alone silently
// picks an arbitrary one of the tied rows as "current" — this is the same bug
// class already found and fixed server-side in main.py's CBU running-balance
// chain (see the cbu-running-balance-bug-fixed project note).
//
// `cbu_deposit_id` (CBUD_001, CBUD_002, ...) IS assigned sequentially by the
// `trg_set_cbu_deposit_id` trigger, so its numeric suffix is a reliable
// insertion-order proxy — sort on that as an integer, not as text (so
// CBUD_100 sorts after CBUD_099, not before it), mirroring main.py's
// `_cbu_row_order`.

const cbuSortKey = (row) => {
  const raw = String(row?.cbu_deposit_id || "");
  const digits = raw.replace(/\D/g, "");
  return [
    String(row?.transaction_date || ""),
    digits ? Number(digits) : -1,
    String(row?.id || ""),
  ];
};

const compareCbuKeys = (a, b) => {
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  return 0;
};

/**
 * Every `capital_build_up` row for one member, oldest first — the
 * chronological order a statement/ledger view needs, with same-day rows
 * broken by `cbu_deposit_id` (insertion order) instead of an undefined tie.
 * Rows must include `transaction_date` and `cbu_deposit_id` (and ideally
 * `id`) in their select for the tiebreak to work.
 */
export function sortCbuRowsAscending(rows) {
  return [...(rows || [])].sort((a, b) => compareCbuKeys(cbuSortKey(a), cbuSortKey(b)));
}

/**
 * The single most recent `capital_build_up` row for one member — the row
 * whose `ending_share_capital` is the member's current balance.
 */
export function pickLatestCbuRow(rows) {
  const sorted = sortCbuRowsAscending(rows);
  return sorted.length ? sorted[sorted.length - 1] : null;
}
