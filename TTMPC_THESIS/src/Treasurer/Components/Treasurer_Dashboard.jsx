import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "../../components/Skeleton";
import { useNavigate } from "react-router-dom";
import { StatCard, StatCardRow } from "../../components/StatCard";
import { UserAuth } from "../../contex/AuthContext";
import { useNotification } from "../../contex/NotificationContext";
import StaffTopbar from "../../components/StaffTopbar";
import LoanNotificationBell from "../../components/LoanNotificationBell";
import LoanDemandForecastCard from "../../components/LoanDemandForecastCard";
import RecentActivityCard from "../../components/RecentActivityCard";
import PriorityQueueCard from "../../components/PriorityQueueCard";
import StaffSidebar from "../../components/StaffSidebar";
import { treasurerNav } from "../../components/StaffSidebar/configs/treasurer";
import {
  ClipboardList,
  TrendingUp,
} from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

const PHP_COMPACT = (v) => {
  const n = Number(v || 0);
  if (Math.abs(n) >= 1_000_000) return `₱${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `₱${Math.round(n / 1_000)}k`;
  return `₱${n.toFixed(0)}`;
};

const PHP_FULL = (v) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 0 }).format(Number(v || 0));

// Bonus loans have no demand-forecasting model yet (SARIMAX is only trained
// for Consolidated and Emergency — see demand_model.py), so this card shows
// a hardcoded placeholder instead of a live fetch until that model exists.
const BONUS_FORECAST_PLACEHOLDER = 40000;

// Next month's "YYYY-MM" key and display label, shared by both forecast cards.
const nextMonthTarget = () => {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return {
    key: `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`,
    label: next.toLocaleDateString("en-PH", { year: "numeric", month: "long" }),
  };
};

// Pending release — reuse the priority-queue summary (already ranked).
async function fetchPendingRelease() {
  const res = await fetch(`${API_BASE_URL}/api/treasurer/disbursements/priority-queue?limit=1`, {
    headers: { Accept: "application/json" },
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok || !payload?.success) throw new Error(payload?.detail || "Failed");
  return {
    count: payload.summary?.total_count ?? 0,
    amount: payload.summary?.total_amount ?? 0,
  };
}

// Forecast per loan type — pull enough periods to reach next month.
// (Bonus has no model yet — its card uses BONUS_FORECAST_PLACEHOLDER.)
async function fetchNextMonthForecast(loanType, targetKey) {
  const res = await fetch(
    `${API_BASE_URL}/api/analytics/demand/forecast?loan_type=${loanType}&periods=60`,
    { headers: { Accept: "application/json" } },
  );
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload?.detail || "Failed");
  const fcArray = payload?.data?.forecast || payload?.forecast || [];
  const row = fcArray.find((r) => String(r.period || "").startsWith(targetKey));
  // Use the point estimate for the KPI card (users expect a single headline
  // number here); the Vault page shows the upper CI band.
  return row ? Number(row.predicted || 0) : null;
}

// Forecasts are model output that only changes when the model is retrained,
// so they're treated as fresh for 10 minutes instead of refetched per visit.
const FORECAST_STALE_TIME = 10 * 60_000;

const Treasurer_Dashboard = () => {
  const { session, signOut } = UserAuth();
  const navigate = useNavigate();

  // Live KPIs, each its own cached query so a partial failure (e.g. forecast
  // API down) doesn't blank out the other numbers, and revisiting the page
  // shows the last-known values instantly while they refresh. (Bonus forecast
  // isn't fetched — see BONUS_FORECAST_PLACEHOLDER above.)
  const target = nextMonthTarget();
  const pendingQuery = useQuery({
    queryKey: ["dashboard", "treasurer", "pending-release"],
    queryFn: fetchPendingRelease,
  });
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
  const kpis = {
    pending: {
      count: pendingQuery.data?.count ?? null,
      amount: pendingQuery.data?.amount ?? null,
      loading: pendingQuery.isPending,
      error: pendingQuery.error?.message || "",
    },
    forecastConsolidated: { value: consolidatedQuery.data ?? null, loading: consolidatedQuery.isPending },
    forecastEmergency: { value: emergencyQuery.data ?? null, loading: emergencyQuery.isPending },
    nextMonthLabel: target.label,
  };
  const { addNotification } = useNotification();
  

  return (
    <div className="flex min-h-screen bg-gray-50">
      <StaffSidebar portal="Treasurer" items={treasurerNav} />

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 min-w-0 flex flex-col h-screen overflow-y-auto">
        <StaffTopbar portal="Treasurer" notifications={<LoanNotificationBell role="treasurer" />} />

        {/* DASHBOARD CONTENT */}
        <main className="p-8">
          
          {/* Top KPI Cards - Consolidated/Emergency forecasts and Pending
              Release are live data; each shows a pulse placeholder while
              loading and "-" on error so a slow/failed sub-fetch doesn't blank the whole
              strip. Bonus forecast is a hardcoded placeholder (no model
              yet) \u2014 see BONUS_FORECAST_PLACEHOLDER. */}
          <StatCardRow cols={4}>
            <StatCard
              label="Forecast - Consolidated"
              value={kpis.forecastConsolidated.value == null ? "—" : PHP_COMPACT(kpis.forecastConsolidated.value)}
              loading={kpis.forecastConsolidated.loading}
              icon={TrendingUp}
              iconColor="text-green-600"
              subtext={`expected in ${kpis.nextMonthLabel || "next month"}`}
            />
            <StatCard
              label="Forecast - Emergency"
              value={kpis.forecastEmergency.value == null ? "—" : PHP_COMPACT(kpis.forecastEmergency.value)}
              loading={kpis.forecastEmergency.loading}
              icon={TrendingUp}
              iconColor="text-amber-700"
              subtext={`expected in ${kpis.nextMonthLabel || "next month"}`}
            />
            {/* Forecast: Bonus (next month) - hardcoded, no model yet */}
            <StatCard
              label="Forecast - Bonus"
              value={PHP_COMPACT(BONUS_FORECAST_PLACEHOLDER)}
              icon={TrendingUp}
              iconColor="text-violet-600"
              subtext={`expected in ${kpis.nextMonthLabel || "next month"}`}
            />
            <StatCard
              label="Pending Release"
              value={kpis.pending.error ? "—" : (kpis.pending.count ?? 0)}
              loading={kpis.pending.loading}
              icon={ClipboardList}
              iconColor="text-orange-500"
              subtext={
                <>
                  {kpis.pending.loading ? <Skeleton className="inline-block h-3 w-16 align-middle" /> : <span className="font-medium tabular-nums">{PHP_FULL(kpis.pending.amount || 0)}</span>}
                  <span className="ml-1">awaiting release</span>
                </>
              }
              onClick={() => navigate("/treasurer-approval")}
            />
          </StatCardRow>

          {/* Priority Queue — full width. The Monthly Disbursement Trend
              chart was removed here because it duplicated info now shown on
              the Cash Ledger page and pushed the actionable Priority Queue
              into a cramped 2-column slot. Full-width lets the treasurer
              see more waiting loans at once without scrolling. */}
          <div className="mb-6">
            <PriorityQueueCard limit={10} seeAllHref="/treasurer-approval" />
          </div>
          <div className="mt-8">
            <RecentActivityCard to="/treasurer-audit-log" title="My Audit Activity" />
          </div>

          <div className="mt-8">
            <LoanDemandForecastCard defaultLoanType="consolidated" periods={12} />
          </div>

        </main>
      </div>
    </div>
  );
};

export default Treasurer_Dashboard;