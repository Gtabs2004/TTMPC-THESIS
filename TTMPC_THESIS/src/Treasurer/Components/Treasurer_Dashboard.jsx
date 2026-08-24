import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../supabaseClient";
import { UserAuth } from "../../contex/AuthContext";
import { useNotification } from "../../contex/NotificationContext";
import { PortalTopbarIdentity } from "../../components/PortalIdentity";
import LoanNotificationBell from "../../components/LoanNotificationBell";
import LoanDemandForecastCard from "../../components/LoanDemandForecastCard";
import RecentActivityCard from "../../components/RecentActivityCard";
import PriorityQueueCard from "../../components/PriorityQueueCard";
import StaffSidebar from "../../components/StaffSidebar";
import { treasurerNav } from "../../components/StaffSidebar/configs/treasurer";
import {
  Search,
  ClipboardList,
  Wallet,
  TrendingUp,
  User,
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

const Treasurer_Dashboard = () => {
  const { session, signOut } = UserAuth();
  const navigate = useNavigate();

  // Live KPI state. All four cards refresh together on mount + on demand.
  // Each fetch is independent so a partial failure (e.g. forecast API down)
  // doesn't blank out the vault or pending numbers.
  const [kpis, setKpis] = useState({
    vault: { value: null, loading: true, error: "" },
    pending: { count: null, amount: null, loading: true, error: "" },
    forecastConsolidated: { value: null, loading: true, error: "" },
    forecastEmergency: { value: null, loading: true, error: "" },
    nextMonthLabel: "",
  });

  const fetchKpis = useCallback(async () => {
    // Compute next-month key once so both forecast fetches use the same target.
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const targetKey = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
    const targetLabel = next.toLocaleDateString("en-PH", { year: "numeric", month: "long" });

    setKpis((k) => ({
      vault: { ...k.vault, loading: true, error: "" },
      pending: { ...k.pending, loading: true, error: "" },
      forecastConsolidated: { ...k.forecastConsolidated, loading: true, error: "" },
      forecastEmergency: { ...k.forecastEmergency, loading: true, error: "" },
      nextMonthLabel: targetLabel,
    }));

    // 1) Vault balance — direct Supabase, RLS enforced via user session.
    (async () => {
      try {
        const { data, error } = await supabase.from("vault_balance_v").select("current_balance").maybeSingle();
        if (error) throw error;
        setKpis((k) => ({ ...k, vault: { value: Number(data?.current_balance || 0), loading: false, error: "" } }));
      } catch (e) {
        setKpis((k) => ({ ...k, vault: { value: null, loading: false, error: e?.message || "Failed" } }));
      }
    })();

    // 2) Pending release — reuse the priority-queue summary (already ranked).
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/treasurer/disbursements/priority-queue?limit=1`, {
          headers: { Accept: "application/json" },
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok || !payload?.success) throw new Error(payload?.detail || "Failed");
        setKpis((k) => ({
          ...k,
          pending: {
            count: payload.summary?.total_count ?? 0,
            amount: payload.summary?.total_amount ?? 0,
            loading: false,
            error: "",
          },
        }));
      } catch (e) {
        setKpis((k) => ({ ...k, pending: { count: null, amount: null, loading: false, error: e?.message || "Failed" } }));
      }
    })();

    // 3 & 4) Forecast per loan type — pull enough periods to reach next month.
    const forecastFetch = async (loanType, key) => {
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/analytics/demand/forecast?loan_type=${loanType}&periods=60`,
          { headers: { Accept: "application/json" } },
        );
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload?.detail || "Failed");
        const fcArray = payload?.data?.forecast || payload?.forecast || [];
        const row = fcArray.find((r) => String(r.period || "").startsWith(targetKey));
        setKpis((k) => ({
          ...k,
          [key]: {
            // Use the point estimate for the KPI card (users expect a single
            // headline number here); the Vault page shows the upper CI band.
            value: row ? Number(row.predicted || 0) : null,
            loading: false,
            error: row ? "" : "No forecast for next month",
          },
        }));
      } catch (e) {
        setKpis((k) => ({ ...k, [key]: { value: null, loading: false, error: e?.message || "Failed" } }));
      }
    };
    forecastFetch("consolidated", "forecastConsolidated");
    forecastFetch("emergency", "forecastEmergency");
  }, []);

  useEffect(() => { fetchKpis(); }, [fetchKpis]);
  const { addNotification } = useNotification();
  

  return (
    <div className="flex min-h-screen bg-gray-50">
      <StaffSidebar portal="Treasurer" items={treasurerNav} />

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col h-screen overflow-y-auto">
        <header className="bg-white h-16 shrink-0 shadow-sm flex items-center justify-end px-8 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400"/>
            <input 
              type="text" 
              className="bg-gray-50 w-52 h-10 rounded-lg border border-gray-300 px-4 py-1 pl-9 focus:outline-none focus:ring-2 focus:ring-green-500" 
              placeholder="Search..."
            />
          </div>
          <LoanNotificationBell role="treasurer" />
          <div className="ml-4 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 shrink-0">
            <User className="w-4.5 h-4.5" />
          </div>
          <PortalTopbarIdentity className="text-sm font-medium text-gray-700" fallbackRole="Treasurer" />
        </header>

        {/* DASHBOARD CONTENT */}
        <main className="p-8">
          
          {/* Top KPI Cards \u2014 live data. Each card gracefully shows "\u2014" while
              loading or on error so a slow/failed sub-fetch doesn't blank
              the whole strip. */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
            {/* Card 1 \u2014 Cash in Vault (from vault_balance_v) */}
            <button
              type="button"
              onClick={() => navigate("/treasurer-vault")}
              className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 flex flex-col justify-between text-left hover:border-green-300 hover:shadow-md transition"
            >
              <div className="flex justify-between items-start">
                <span className="text-gray-500 text-sm font-medium">Cash in Vault</span>
                <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                  <Wallet size={18} />
                </div>
              </div>
              <div className="mt-4">
                <h3 className="text-3xl font-bold text-gray-800 tabular-nums">
                  {kpis.vault.loading ? "\u2026" : kpis.vault.error ? "\u2014" : PHP_COMPACT(kpis.vault.value)}
                </h3>
                <div className="flex items-center mt-2 text-xs">
                  <span className="text-gray-400">Manage in Vault →</span>
                </div>
              </div>
            </button>

            {/* Card 2 \u2014 Pending Release (count + total) */}
            <button
              type="button"
              onClick={() => navigate("/treasurer-approval")}
              className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 flex flex-col justify-between text-left hover:border-green-300 hover:shadow-md transition"
            >
              <div className="flex justify-between items-start">
                <span className="text-gray-500 text-sm font-medium">Pending Release</span>
                <div className="p-2 bg-orange-50 text-orange-500 rounded-lg">
                  <ClipboardList size={18} />
                </div>
              </div>
              <div className="mt-4">
                <h3 className="text-3xl font-bold text-gray-800 tabular-nums">
                  {kpis.pending.loading ? "\u2026" : kpis.pending.error ? "\u2014" : (kpis.pending.count ?? 0)}
                </h3>
                <div className="flex items-center mt-2 text-xs">
                  <span className="text-gray-500 font-medium tabular-nums">
                    {kpis.pending.loading ? "" : PHP_FULL(kpis.pending.amount || 0)}
                  </span>
                  <span className="text-gray-400 ml-1">awaiting release</span>
                </div>
              </div>
            </button>

            {/* Card 3 - Forecast: Consolidated (next month) */}
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 flex flex-col justify-between">
              <div className="flex justify-between items-start">
                <span className="text-gray-500 text-sm font-medium">Forecast - Consolidated</span>
                <div className="p-2 bg-green-50 text-green-600 rounded-lg">
                  <TrendingUp size={18} />
                </div>
              </div>
              <div className="mt-4">
                <h3 className="text-3xl font-bold text-gray-800 tabular-nums">
                  {kpis.forecastConsolidated.loading ? "\u2026" : kpis.forecastConsolidated.value == null ? "\u2014" : PHP_COMPACT(kpis.forecastConsolidated.value)}
                </h3>
                <div className="flex items-center mt-2 text-xs">
                  <span className="text-gray-400">expected in {kpis.nextMonthLabel || "next month"}</span>
                </div>
              </div>
            </div>

            {/* Card 4 - Forecast: Emergency (next month) */}
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 flex flex-col justify-between">
              <div className="flex justify-between items-start">
                <span className="text-gray-500 text-sm font-medium">Forecast - Emergency</span>
                <div className="p-2 bg-amber-50 text-amber-700 rounded-lg">
                  <TrendingUp size={18} />
                </div>
              </div>
              <div className="mt-4">
                <h3 className="text-3xl font-bold text-gray-800 tabular-nums">
                  {kpis.forecastEmergency.loading ? "\u2026" : kpis.forecastEmergency.value == null ? "\u2014" : PHP_COMPACT(kpis.forecastEmergency.value)}
                </h3>
                <div className="flex items-center mt-2 text-xs">
                  <span className="text-gray-400">expected in {kpis.nextMonthLabel || "next month"}</span>
                </div>
              </div>
            </div>
          </div>

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