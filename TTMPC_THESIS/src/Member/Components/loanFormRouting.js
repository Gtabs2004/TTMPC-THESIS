// Loan type label -> application form path, shared between Member_ApplyLoans.jsx
// (new applications) and Member_Loans.jsx (editing a loan sent back for revision).
// Keep in sync with Member_ApplyLoans.jsx's `selectorOptions`.
export const loanFormPathForType = (loanTypeLabel) => {
  const label = String(loanTypeLabel || "").toLowerCase();
  if (label.includes("emergency")) return "/Emergency_Loan";
  if (label.includes("bonus")) return "/Bonus_Loan";
  if (label.includes("consolidated")) return "/conso_choice";
  return null;
};
