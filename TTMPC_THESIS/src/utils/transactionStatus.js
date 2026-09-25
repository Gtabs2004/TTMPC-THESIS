// Shared transaction-status vocabulary — one place so every dashboard's
// "Recent Transactions"/"Recent Activity" widget agrees on what "Approved"
// vs "Completed" vs "Pending" vs "Rejected" means, instead of each page
// inventing its own labels (originally built for BOD's B-Dashboard.jsx,
// reused as-is by the Bookkeeper dashboard so the terminology matches
// exactly rather than just resembling it).

// Maps a loans.loan_status value to a status badge. "Approved" covers every
// successful step of the loan workflow (application approved, loan
// released, an installment processed); "Completed" is reserved for a loan
// that has actually been paid off in full, not used as a generic stand-in
// for "the transaction succeeded". "Rejected" surfaces a real negative
// outcome instead of hiding it behind "Pending".
export const loanStatusBadge = (rawStatus) => {
  const s = String(rawStatus || "").toLowerCase().trim();
  if (!s) return "Approved"; // unknown/unlinked status — the record itself still went through
  if (s.includes("fully paid") || s === "paid") return "Completed";
  if (s.includes("reject") || s.includes("declin")) return "Rejected";
  if (s.includes("revision") || s.includes("recommended") || s.includes("review") || s === "pending") return "Pending";
  return "Approved"; // approved / released / partially paid / to be disbursed / ready for disbursement
};

// Same badge vocabulary, generalized for non-loan transaction types (fee
// payments, grocery sales) whose own status columns use plain
// paid/pending/rejected-style values rather than the loan lifecycle's.
export const paymentStatusBadge = (rawStatus) => {
  const s = String(rawStatus || "").toLowerCase().trim();
  if (!s) return "Approved";
  if (s.includes("reject") || s.includes("declin")) return "Rejected";
  if (s.includes("pending")) return "Pending";
  if (s.includes("paid") || s.includes("completed") || s.includes("approved")) return "Completed";
  return "Approved";
};

// Tailwind classes per badge value — kept alongside the classifiers so a
// consumer only needs one import for "what does this status look like".
export const STATUS_BADGE_CLASSES = {
  Completed: "bg-green-100 text-green-800",
  Approved: "bg-blue-100 text-blue-800",
  Rejected: "bg-rose-100 text-rose-800",
  Pending: "bg-amber-100 text-amber-800",
  Late: "bg-red-100 text-red-800",
};
