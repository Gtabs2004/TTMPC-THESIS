import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { StatCard, StatCardRow } from "../../components/StatCard";
import StaffTopbar from "../../components/StaffTopbar";
import LoanNotificationBell from "../../components/LoanNotificationBell";
import LoanDemandForecastCard from "../../components/LoanDemandForecastCard";
import StaffSidebar from "../../components/StaffSidebar";
import { treasurerNav } from "../../components/StaffSidebar/configs/treasurer";
import TreasuryCashPosition from "./Dashboard/TreasuryCashPosition";
import TreasuryDecisionQueue from "./Dashboard/TreasuryDecisionQueue";
import TreasuryRecentActivity from "./Dashboard/TreasuryRecentActivity";
import {
  PHP_COMPACT,
  PHP_FULL,
  cashLedgerQuery,
  decisionQueueQuery,
  readyForReleaseQuery,
  releasedLoansQuery,
} from "./Dashboard/treasuryData";
import {
  ClipboardList,
  Landmark,
  Lock,
  TrendingUp,
  Wallet,
} from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

// Next month's "YYYY-MM" key and display label, shared by both forecast tiles.
const nextMonthTarget = () => {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return {
    key: `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`,
    label: next.toLocaleDateString("en-PH", { year: "numeric", month: "long" }),
  };
};

// Forecast per loan type — pull enough periods to reach next month.
// Bonus is never fetched: there is no Bonus SARIMAX model (demand_model.py
// only trains Consolidated and Emergency), so its tile says so instead of
// showing a number that would look model-generated.
async function fetchNextMonthForecast(loanType, targetKey) {
  const res = await fetch(
    `${API_BASE_URL}/api/analytics/demand/forecast?loan_type=${loanType}&periods=60`,
    { headers: { Accept: "application/json" } },
  );
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload?.detail || "Failed");
  const fcArray = payload?.data?.forecast || payload?.forecast || [];
  const row = fcArray.find((r) => String(r.period || "").startsWith(targetKey));
  // Point estimate for the summary tile; the Vault page shows the upper CI band.
  return row ? Number(row.predicted || 0) : null;
}

// Forecasts are model output that only changes when the model is retrained,
// so they're treated as fresh for 10 minutes instead of refetched per visit.
const FORECAST_STALE_TIME = 10 * 60_000;

const ForecastTile = ({ label, value, loading, sub, muted = false }) => (
  <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 min-w-0">
    <p className="text-xs font-medium text-gray-500">{label}</p>
    {loading ? (
      <div className="h-7 mt-1 w-20 bg-gray-200 rounded animate-pulse" />
    ) : (
      <p className={`mt-1 font-bold ${muted ? "text-sm text-gray-500 py-1" : "text-xl text-gray-900 tabular-nums"}`}>{value}</p>
    )}
    <p className="text-[11px] text-gray-500 mt-0.5">{sub}</p>
  </div>
);

const Treasurer_Dashboard = () => {
  const navigate = useNavigate();
  const target = nextMonthTarget();

  // Each section is its own cached query, so one failing endpoint never
  // blanks the rest of the page. "dashboard"-keyed queries refetch on
  // realtime DB changes (RealtimeSync).
  const decisionQuery = useQuery(decisionQueueQuery(5));
  const readyQuery = useQuery(readyForReleaseQuery(5));
  const ledgerQuery = useQuery(cashLedgerQuery(6));
  const releasedQuery = useQuery(releasedLoansQuery(5));
  const consolidatedQuery = useQuery({
    queryKey: ["demand-forecast", "next-month", "consolidated", target.key],
    queryFn: () => fetchNextMonthForecast("consolidated", target.key),
    staleTime: FORECAST_STALE_TIME,
  });
  const emergencyQuery = useQuery({
    queryKey: ["demand-forecast", "next-month", "emergency", target.key],
    queryFn: () => fetchNextMonthForecast("emergency", target.key),
    staleTime: FORECAST_STALE_TIME,
  });

  const vault = decisionQuery.data?.vault;
  const vaultLoading = decisionQuery.isPending;
  const vaultValue = (v) => (decisionQuery.error ? "—" : PHP_FULL(v));
  const available = Number(vault?.available ?? 0);
  const ready = readyQuery.data?.summary;

  return (
    <div className="flex min-h-screen bg-gray-50">
      <StaffSidebar portal="Treasurer" items={treasurerNav} />

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 min-w-0 flex flex-col h-screen overflow-y-auto">
        <StaffTopbar portal="Treasurer" notifications={<LoanNotificationBell role="treasurer" />} />

        {/* DASHBOARD CONTENT — operational first (cash, liquidity, queue,
            activity), analytical second (demand forecast). */}
        <main className="animate-page-in p-4 sm:p-8">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900">Treasurer Dashboard</h1>
            <p className="text-sm text-gray-500 mt-1">Cash position, funding decisions &amp; liquidity outlook</p>
          </div>

          {/* 1. CURRENT CASH POSITION — vault figures come straight from
              _compute_vault_available() (via the decision-queue endpoint). */}
          <StatCardRow cols={4}>
            <StatCard
              label="Total Cash in Vault"
              value={vaultValue(vault?.balance)}
              loading={vaultLoading}
              icon={Landmark}
              iconColor="text-gray-500"
              subtext="All physical cash on hand"
            />
            <StatCard
              label="Reserved for Approved Loans"
              value={vaultValue(vault?.committed)}
              loading={vaultLoading}
              icon={Lock}
              iconColor="text-amber-600"
              subtext="Approved, not yet released by Cashier"
            />
            <StatCard
              label="Free to Lend"
              value={
                decisionQuery.error ? "—" : (
                  <span className={available < 0 ? "text-red-700" : "text-green-700"}>{PHP_FULL(available)}</span>
                )
              }
              loading={vaultLoading}
              icon={Wallet}
              iconColor="text-green-700"
              className="ring-1 ring-green-200"
              subtext="Total cash − reserved · for new approvals"
            />
            <StatCard
              label="Ready for Release"
              value={readyQuery.error ? "—" : `${ready?.total_count ?? 0} loan${ready?.total_count === 1 ? "" : "s"}`}
              loading={readyQuery.isPending}
              icon={ClipboardList}
              iconColor="text-orange-500"
              subtext={
                ready ? (
                  <>
                    <span className="font-medium tabular-nums">{PHP_FULL(ready.total_amount)}</span>
                    <span className="ml-1">· awaiting Cashier release</span>
                  </>
                ) : "Awaiting Cashier release"
              }
              onClick={() => navigate("/treasurer-approval")}
            />
          </StatCardRow>

          {/* 2. CASH POSITION + LIQUIDITY STATUS */}
          <TreasuryCashPosition
            data={decisionQuery.data}
            loading={decisionQuery.isPending}
            error={decisionQuery.error?.message}
          />

          {/* 3. TREASURY DECISION QUEUE */}
          <TreasuryDecisionQueue decision={decisionQuery} ready={readyQuery} />

          {/* 4. RECENT CASH / RELEASE ACTIVITY */}
          <TreasuryRecentActivity ledger={ledgerQuery} released={releasedQuery} />

          {/* 5. LOAN DEMAND FORECAST */}
          <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-4">
            <h3 className="flex items-center text-gray-800 font-bold text-lg">
              <TrendingUp size={18} className="mr-2 text-green-700" />
              Loan Demand Forecast
            </h3>
            <p className="text-xs text-gray-500 mt-1 mb-4">
              Expected loan demand for {target.label}, for liquidity planning. Detailed 12-month view below.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <ForecastTile
                label="Consolidated"
                value={consolidatedQuery.data == null ? "—" : PHP_COMPACT(consolidatedQuery.data)}
                loading={consolidatedQuery.isPending}
                sub={consolidatedQuery.error ? "Forecast service unavailable" : `SARIMAX · ${target.label}`}
              />
              <ForecastTile
                label="Emergency"
                value={emergencyQuery.data == null ? "—" : PHP_COMPACT(emergencyQuery.data)}
                loading={emergencyQuery.isPending}
                sub={emergencyQuery.error ? "Forecast service unavailable" : `SARIMAX · ${target.label}`}
              />
              <ForecastTile
                label="Bonus"
                value="Forecast unavailable"
                muted
                sub="No Bonus forecasting model configured"
              />
            </div>
          </section>
          <LoanDemandForecastCard />
        </main>
      </div>
    </div>
  );
};

export default Treasurer_Dashboard;
