const peso = (value) =>
  `₱${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const ROWS = [
  ['service_fee', 'Service Fee'],
  ['cbu_deduction', 'Capital Build-Up'],
  ['insurance_fee', 'Insurance Fee'],
  ['notarial_fee', 'Notarial Fee'],
];

// Shows the fee breakdown saved on the loan at application time
// (loans.service_fee / cbu_deduction / insurance_fee / notarial_fee / net_proceeds),
// so every role sees the same numbers the Cashier releases against.
// estimated: fees were not saved on this loan (applied before they were
// recorded), so they come from the current fee policy, as the Cashier does.
export default function LoanDeductionsCard({ loan, isRenewal = false, estimated = false, className = '' }) {
  const saved = loan && ROWS.every(([key]) => loan[key] !== null && loan[key] !== undefined);

  return (
    <div className={`rounded-xl border border-amber-200 bg-amber-50 p-4 ${className}`}>
      <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-amber-800">
        Deductions on Release
      </p>

      {saved ? (
        <>
          <div className="space-y-1.5 text-sm">
            {ROWS.map(([key, label]) => (
              <div key={key} className="flex justify-between">
                <span className="text-gray-600">{label}</span>
                <span className="font-semibold text-gray-800">{peso(loan[key])}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between border-t border-amber-200 pt-2 text-sm">
            <span className="font-semibold text-gray-700">Total Deductions</span>
            <span className="font-bold text-gray-900">
              {peso(ROWS.reduce((sum, [key]) => sum + Number(loan[key] || 0), 0))}
            </span>
          </div>
          <div className="mt-2 flex justify-between">
            <span className="font-bold text-gray-900">Net Proceeds</span>
            <span className="font-black text-member-green">{peso(loan.net_proceeds)}</span>
          </div>
          {estimated && (
            <p className="mt-2 text-[11px] text-amber-800">
              Based on the current fee policy. This loan was submitted before fees were recorded on each application.
            </p>
          )}
          {isRenewal && (
            <p className="mt-2 text-[11px] text-amber-800">
              Renewal: the remaining balance of the old loan is also deducted at release.
            </p>
          )}
        </>
      ) : (
        <p className="text-xs text-amber-800">
          Not recorded for this loan. The Cashier computes the deductions at release.
        </p>
      )}
    </div>
  );
}
