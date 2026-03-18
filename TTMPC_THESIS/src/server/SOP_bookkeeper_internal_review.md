# SOP: Bookkeeper Internal Remarks Entry

## 1. Purpose
This SOP defines how Bookkeepers must document internal remarks before a loan application is forwarded to the Manager queue.

## 2. Scope
Applies to all loan applications in Bookkeeper review state (`draft` or `pending`) before transition to `recommended for approval`.

## 3. Required Data Fields
- `bookkeeper_internal_remarks` (required)
- `bookkeeper_reviewed_at` (auto-captured timestamp)
- `manager_review_requested_at` (auto-captured timestamp)

## 4. Roles and Responsibilities
- Bookkeeper:
  - Performs initial underwriting checks.
  - Enters internal remarks.
  - Submits to Manager queue.
- Manager:
  - Views Bookkeeper notes as read-only reference.
  - Cannot alter Bookkeeper notes.
  - Makes final approval/reject/revision decision.
- Compliance Officer / Internal Audit:
  - Verifies completeness and consistency of notes.

## 5. Standard Procedure
1. Open loan record in Bookkeeper portal.
2. Validate borrower profile, loan terms, and supporting documents.
3. In “Recommend for Manager Approval” modal:
   - Enter internal remarks with objective findings.
4. Confirm submit.
5. System transitions status to `recommended for approval`.
6. System logs review timestamps.
7. Manager reviews record and Bookkeeper notes (read-only).

## 6. Legal and Financial Compliance Rules
- Remarks must be factual, professional, and free of discriminatory language.
- Include basis of assessment (income consistency, repayment behavior, collateral/docs checks).
- Do not include unnecessary sensitive personal information.
- Any post-submission correction must be done by Bookkeeper via documented amendment workflow, not by Manager edits.

## 7. Minimum Remark Quality Checklist
- Borrower repayment capacity summary
- Material risk indicators observed
- Document verification result
- Recommendation statement (proceed/revise/reject rationale)

## 8. Auditability and Retention
- Keep review timestamps for every transition.
- Preserve notes for internal audit and dispute handling.
- Changes to note fields must be role-controlled and logged.

## 9. Exception Handling
- If mandatory fields are missing, block transition.
- If status update fails, keep record in current queue and display actionable error.
- If role-check fails, deny update and log event.
