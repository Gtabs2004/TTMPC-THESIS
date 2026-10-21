// One-click reasons for the reject / decline / return-for-revision modals (see
// components/QuickReasons.jsx). They only fill the note box; staff can edit the
// text, and the field is still required before the decision can be saved.
export const QUICK_REASONS = {
  loanReject: [
    "Insufficient capacity to repay based on the submitted net pay.",
    "The member has an outstanding loan balance or arrears on record.",
    "The requested amount exceeds the member's loan limit.",
    "The submitted documents are incomplete or inconsistent.",
    "The member does not meet the eligibility requirements for this loan.",
  ],
  loanBodReject: [
    "Not approved by the Board of Directors.",
    "Insufficient capacity to repay based on the submitted net pay.",
    "The member has an outstanding loan balance or arrears on record.",
    "The requested amount exceeds the member's loan limit.",
  ],
  loanRevision: [
    "Please attach the missing or unreadable supporting documents.",
    "Please correct the loan amount or term and resubmit.",
    "Net pay or income details need to be verified. Please update them.",
    "Co-maker details are incomplete. Please complete them.",
    "Signatures are missing or do not match.",
  ],
  membershipRevision: [
    "Please upload a clear copy of a valid government ID.",
    "Some required fields are incomplete. Please complete them.",
    "Personal details do not match the submitted documents.",
    "Please attach proof of income or employment.",
    "The proof of the membership payment is missing or unclear.",
  ],
  paymentReject: [
    "The payment amount does not match the amount due.",
    "The reference number or proof of payment is missing or unclear.",
    "The payment could not be verified.",
    "Duplicate of an earlier payment.",
  ],
  savingsReject: [
    "Insufficient balance for this transaction.",
    "The proof of payment is missing or unclear.",
    "The amount or details do not match the request.",
    "Duplicate transaction.",
  ],
  overrideDecline: [
    "The reason given does not show an urgent need.",
    "Please complete the required monthly payments first.",
    "Please give more details and send the request again.",
  ],
  profileChangeDecline: [
    "The amount doesn't match the payslip.",
    "The payslip is unclear. Please attach a clearer photo.",
    "The payslip is out of date. Please attach a recent one.",
  ],
};
