import React from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, AlertTriangle, ArrowRight, CheckCircle2, Landmark, XCircle } from "lucide-react";
import { Skeleton } from "../../../components/Skeleton";
import { PHP_FULL, liquidityStatus } from "./treasuryData";

const LIQUIDITY_META = {
  healthy: {
    label: "Healthy Liquidity",
    icon: CheckCircle2,
    tone: "text-green-700",
    badge: "bg-green-50 text-green-700 ring-green-200",
    explain: (s) =>
      s.pending > 0
        ? "Free-to-lend cash covers every loan awaiting your decision."
        : "No loans are awaiting a funding decision.",
  },
  limited: {
    label: "Limited Liquidity",
    icon: AlertTriangle,
    tone: "text-amber-700",
    badge: "bg-amber-50 text-amber-700 ring-amber-200",
    explain: () => "Some waiting loans can be funded, but not all of them together. Fund in priority order.",
  },
  shortfall: {
    label: "Funding Shortfall",
    icon: XCircle,
    tone: "text-red-700",
    badge: "bg-red-50 text-red-700 ring-red-200",
    explain: (s) =>
      s.available < 0
        ? "Committed releases already exceed the vault balance."
        : "None of the waiting loans fits in available cash. Consider rescheduling.",
  },
};

const Row = ({ label, value, strong, tone = "text-gray-900", hint }) => (
  <div className="flex items-baseline justify-between gap-3 py-2">
    <div className="min-w-0">
      <p className={`text-sm ${strong ? "font-semibold text-gray-800" : "text-gray-600"}`}>{label}</p>
      {hint ? <p className="text-[11px] text-gray-400">{hint}</p> : null}
    </div>
    <p className={`tabular-nums shrink-0 ${strong ? "text-lg font-extrabold" : "text-sm font-bold"} ${tone}`}>{value}</p>
  </div>
);

/**
 * Cash position (vault − committed = available, with a split bar) beside the
 * liquidity verdict for the loans awaiting the Treasurer's decision.
 * `data` is the decision-queue payload ({vault, summary}).
 */
const TreasuryCashPosition = ({ data, loading, error }) => {
  const navigate = useNavigate();
  const vault = data?.vault;
  const summary = data?.summary;
  const status = liquidityStatus(vault, summary);
  const meta = status ? LIQUIDITY_META[status.level] : null;

  const balance = Number(vault?.balance || 0);
  const committed = Number(vault?.committed || 0);
  const committedPct = balance > 0 ? Math.min(100, (committed / balance) * 100) : committed > 0 ? 100 : 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-6">
      {/* CASH POSITION */}
      <section className="lg:col-span-3 bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="flex items-center text-gray-800 font-bold text-lg">
              <Landmark size={18} className="mr-2 text-green-700" />
              Cash Position
            </h3>
            <p className="text-xs text-gray-500 mt-1">Part of the vault is already promised to approved loans the Cashier hasn’t released yet.</p>
          </div>
          <button
            type="button"
            onClick={() => navigate("/treasurer-vault")}
            className="inline-flex items-center gap-1 text-sm font-semibold text-green-700 hover:text-green-800 shrink-0"
          >
            Vault <ArrowRight size={14} />
          </button>
        </div>

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 flex items-center gap-2">
            <AlertCircle size={14} /> {error}
          </div>
        ) : loading ? (
          <div className="space-y-3">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-5 w-1/2" />
          </div>
        ) : (
          <>
            {/* Split bar: committed (amber) vs available (green) share of the vault */}
            <div
              className="h-3 w-full rounded-full bg-green-500/80 overflow-hidden flex"
              role="img"
              aria-label={`${committedPct.toFixed(0)}% of the vault is reserved for approved loans`}
            >
              <div
                className={`h-full ${status?.available < 0 ? "bg-red-500" : "bg-amber-400"}`}
                style={{ width: `${committedPct}%` }}
              />
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] text-gray-500">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400" /> Reserved {committedPct.toFixed(0)}%
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-green-500/80" /> Free to lend {(100 - committedPct).toFixed(0)}%
              </span>
            </div>

            <div className="mt-4 divide-y divide-gray-100">
              <Row label="Total cash in vault" hint="All physical cash on hand" value={PHP_FULL(balance)} />
              <Row
                label="− Reserved for approved loans"
                hint="Net cash out of loans awaiting Cashier release"
                value={PHP_FULL(committed)}
                tone="text-amber-700"
              />
              <Row
                label="= Free to lend"
                value={PHP_FULL(vault?.available)}
                strong
                tone={Number(vault?.available) < 0 ? "text-red-700" : "text-green-700"}
              />
            </div>
          </>
        )}
      </section>

      {/* LIQUIDITY STATUS */}
      <section className="lg:col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm p-6 flex flex-col">
        <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-3">Liquidity Status</p>

        {error ? (
          <p className="text-sm text-gray-500">Unavailable — vault figures could not be loaded.</p>
        ) : loading || !meta ? (
          <div className="space-y-3">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ) : (
          <>
            <span className={`self-start inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full ring-1 text-sm font-bold ${meta.badge}`}>
              <meta.icon size={16} /> {meta.label}
            </span>
            <p className="text-xs text-gray-500 mt-2">{meta.explain(status)}</p>

            <div className="mt-3 divide-y divide-gray-100">
              <Row label="Free to lend" value={PHP_FULL(status.available)} />
              <Row
                label="Awaiting your decision"
                hint={`${summary.total_count} loan${summary.total_count === 1 ? "" : "s"} · net cash out`}
                value={PHP_FULL(status.pending)}
              />
              <Row
                label="Remaining if all approved"
                value={PHP_FULL(status.remaining)}
                strong
                tone={meta.tone}
              />
            </div>
          </>
        )}
      </section>
    </div>
  );
};

export default TreasuryCashPosition;
