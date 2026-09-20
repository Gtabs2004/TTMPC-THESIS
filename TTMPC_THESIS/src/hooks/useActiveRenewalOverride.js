import { useEffect, useState } from "react";
import { fetchActiveOverrides } from "../utils/renewalOverrides";

/**
 * The member's active 6-month-rule override for one loan type, or null.
 *
 * For loan forms that do not use useLoanEligibility (which already folds the
 * override into its buckets). A failed lookup means "no override" — the normal
 * 6-month rule then applies.
 */
export const useActiveRenewalOverride = (loanType) => {
  const [override, setOverride] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const wanted = String(loanType || "").toLowerCase();
    fetchActiveOverrides()
      .then((list) => {
        if (!cancelled) setOverride(list.find((o) => o.loan_type === wanted) || null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [loanType]);

  return override;
};
