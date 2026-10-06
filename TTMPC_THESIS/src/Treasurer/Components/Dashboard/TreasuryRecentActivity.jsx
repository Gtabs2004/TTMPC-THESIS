import React from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, ArrowDownRight, ArrowRight, ArrowUpRight, CreditCard, Receipt } from "lucide-react";
import { Skeleton } from "../../../components/Skeleton";
import { PHP_FULL, formatShortDate } from "./treasuryData";

// Labels match TYPE_META on the Ledger Transactions page (Treasurer_Payments.jsx).
const LEDGER_LABEL = {
  loan_payment: "Loan Payment",
  loan_disbursal: "Loan Disbursal",
  savings_deposit: "Savings Deposit",
  savings_withdrawal: "Savings Withdrawal",
  cbu_contribution: "CBU Contribution",
  membership_payment: "Membership Payment",
  vault_adjustment: "Vault Adjustment",
};

const Card = ({ icon, title, subtitle, linkLabel, href, children }) => {
  const navigate = useNavigate();
  const Icon = icon;
  return (
    <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 flex flex-col min-w-0">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h3 className="flex items-center text-gray-800 font-bold text-lg">
            <Icon size={18} className="mr-2 text-green-700" />
            {title}
          </h3>
          <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
        </div>
        <button
          type="button"
          onClick={() => navigate(href)}
          className="inline-flex items-center gap-1 text-sm font-semibold text-green-700 hover:text-green-800 shrink-0"
        >
          {linkLabel} <ArrowRight size={14} />
        </button>
      </div>
      {children}
    </section>
  );
};

const States = ({ query, empty, emptyText }) => {
  if (query.error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 flex items-center gap-2">
        <AlertCircle size={14} /> {query.error.message}
      </div>
    );
  }
  if (query.isPending) {
    return <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;
  }
  if (empty) return <p className="py-8 text-center text-sm text-gray-500">{emptyText}</p>;
  return null;
};

/** Compact previews of the cash ledger and released loans — the full ledgers stay on their own pages. */
const TreasuryRecentActivity = ({ ledger, released }) => {
  const entries = ledger.data?.entries || [];
  const releasedRows = released.data?.rows || [];
  const releasedToday = released.data?.summary?.released_today_amount;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-6">
      <Card icon={Receipt} title="Recent Cash Activity" subtitle="Last 30 days of cash in and out" linkLabel="View ledger" href="/treasurer-payments">
        {ledger.data && (
          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2">
              <p className="text-[11px] text-gray-500">Cash in</p>
              <p className="text-sm font-bold text-green-700 tabular-nums">{PHP_FULL(ledger.data.total_debit)}</p>
            </div>
            <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2">
              <p className="text-[11px] text-gray-500">Cash out</p>
              <p className="text-sm font-bold text-red-700 tabular-nums">{PHP_FULL(ledger.data.total_credit)}</p>
            </div>
            <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2">
              <p className="text-[11px] text-gray-500">Net</p>
              <p className={`text-sm font-bold tabular-nums ${ledger.data.net < 0 ? "text-red-700" : "text-gray-900"}`}>{PHP_FULL(ledger.data.net)}</p>
            </div>
          </div>
        )}
        <States query={ledger} empty={entries.length === 0} emptyText="No cash movement in the last 30 days." />
        {!ledger.isPending && !ledger.error && entries.length > 0 && (
          <ul className="divide-y divide-gray-100">
            {entries.map((e, i) => {
              const isIn = Number(e.debit) > 0;
              const amount = isIn ? e.debit : e.credit;
              return (
                <li key={`${e.source_table}-${e.reference}-${i}`} className="flex items-center gap-3 py-2.5">
                  <span className={`shrink-0 w-7 h-7 rounded-md flex items-center justify-center ${isIn ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                    {isIn ? <ArrowDownRight size={14} /> : <ArrowUpRight size={14} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-800 truncate">{LEDGER_LABEL[e.type] || e.type}</p>
                    <p className="text-[11px] text-gray-500 truncate">
                      {[e.member_name, formatShortDate(e.date)].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <p className={`shrink-0 text-sm font-bold tabular-nums ${isIn ? "text-green-700" : "text-red-700"}`}>
                    {isIn ? "+" : "−"}{PHP_FULL(amount)}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card
        icon={CreditCard}
        title="Recent Releases"
        subtitle={releasedToday != null ? `${PHP_FULL(releasedToday)} released today` : "Loans released by the Cashier"}
        linkLabel="View released loans"
        href="/disbursement"
      >
        <States query={released} empty={releasedRows.length === 0} emptyText="No loans have been released yet." />
        {!released.isPending && !released.error && releasedRows.length > 0 && (
          <ul className="divide-y divide-gray-100">
            {releasedRows.map((r) => (
              <li key={r.loan_id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-800 truncate">{r.member_name}</p>
                  <p className="text-[11px] text-gray-500 truncate">
                    {r.loan_type} · <span className="font-mono">{r.loan_id}</span>
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-bold text-gray-900 tabular-nums">{PHP_FULL(r.amount)}</p>
                  <p className="text-[11px] text-gray-500">{formatShortDate(r.released_date)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
};

export default TreasuryRecentActivity;
