import { useState } from "react";
import { computeLoan } from "./loanComputeApi";

export function useLoanComputation() {
  const [computeLoading, setComputeLoading] = useState(false);
  const [computeError, setComputeError] = useState("");

  const [deductions, setDeductions] = useState({
    service_fee: 0,
    cbu_deduction: 0,
    insurance_fee: 0,
    notarial_fee: 0,
  });

  const [netProceeds, setNetProceeds] = useState(0);
  const [totalInterest, setTotalInterest] = useState(0);
  const [monthlyAmortization, setMonthlyAmortization] = useState(0);
  const [monthlyBreakdown, setMonthlyBreakdown] = useState([]);

  const computeFromPayload = async (payload) => {
    setComputeLoading(true);
    setComputeError("");

    try {
      const data = await computeLoan(payload);

      setDeductions(data?.deductions || {});
      setNetProceeds(data?.net_proceeds || 0);
      setTotalInterest(data?.total_interest || 0);
      setMonthlyAmortization(data?.monthly_amortization || 0);
      setMonthlyBreakdown(data?.monthly_breakdown || []);

      return data;
    } catch (error) {
      setComputeError(error.message || "Unable to compute loan.");
      throw error;
    } finally {
      setComputeLoading(false);
    }
  };

  return {
    computeLoading,
    computeError,
    deductions,
    netProceeds,
    totalInterest,
    monthlyAmortization,
    monthlyBreakdown,
    computeFromPayload,
  };
}
