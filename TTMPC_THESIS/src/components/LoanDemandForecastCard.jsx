import React, { useEffect, useMemo, useState } from "react";
import {
  Area,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { TrendingUp, Loader2, AlertCircle, AlertTriangle, Info, Wallet } from "lucide-react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

const LOAN_TYPES = [
  { value: "consolidated", label: "Consolidated", color: "#1D6021", forecastColor: "#0D4F8B" },
  { value: "emergency",    label: "Emergency",    color: "#B45309", forecastColor: "#92400E" },
];

const PHP = (value) =>
  `₱${Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;

const monthLabel = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-PH", { month: "short", year: "2-digit" });
};

/**
 * LoanDemandForecastCard — multi-loan demand panel.
 * Top: per-loan-type "next month" tiles + combined Total Liquidity Alert.
 * Bottom: detail chart with historical actuals + forecast band, toggle per loan type.
 */
const LoanDemandForecastCard = ({ defaultLoanType = "consolidated", periods = 12, className = "" }) => {
  const [activeLoanType, setActiveLoanType] = useState(defaultLoanType);
  const [horizon, setHorizon] = useState(periods);
  const [forecasts, setForecasts] = useState({}); // {consolidated: {...}, emergency: {...}}
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const fetchAll = async () => {
      setLoading(true);
      setError("");
      try {
        const results = await Promise.all(
          LOAN_TYPES.map(async (t) => {
            const res = await fetch(
              `${API_BASE_URL}/api/analytics/demand/forecast?loan_type=${t.value}&periods=${horizon}`,
              { headers: { Accept: "application/json" } }
            );
            const payload = await res.json().catch(() => ({}));
            if (!res.ok || !payload?.success) {
              throw new Error(payload?.detail || `Failed to load ${t.label} forecast.`);
            }
            return [t.value, payload.data];
          })
        );
        if (!cancelled) {
          const map = {};
          for (const [k, v] of results) map[k] = v;
          setForecasts(map);
        }
      } catch (err) {
        if (!cancelled) setError(err?.message || "Unable to load forecast.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchAll();
    return () => {
      cancelled = true;
    };
  }, [horizon]);

  // Per-loan summary
  const summaries = useMemo(() => {
    return LOAN_TYPES.map((t) => {
      const data = forecasts[t.value];
      if (!data) {
        return { ...t, nextMonth: null, nextMonthBand: null, horizonTotal: 0, historicalAvg: 0 };
      }
      const fc = data.forecast || [];
      const nextMonthRow = fc[0] || null;
      const horizonTotal = fc.reduce((s, r) => s + (r.predicted || 0), 0);
      const histTotal = (data.historical || []).reduce((s, r) => s + (r.actual || 0), 0);
      const historicalAvg = data.historical?.length ? histTotal / data.historical.length : 0;
      return {
        ...t,
        nextMonth: nextMonthRow ? nextMonthRow.predicted : null,
        nextMonthPeriod: nextMonthRow?.period || null,
        nextMonthBand: nextMonthRow ? [nextMonthRow.lower, nextMonthRow.upper] : null,
        horizonTotal,
        historicalAvg,
      };
    });
  }, [forecasts]);

  // Combined liquidity totals
  const liquidity = useMemo(() => {
    const nextMonthTotal = summaries.reduce((s, x) => s + (x.nextMonth || 0), 0);
    const horizonTotal = summaries.reduce((s, x) => s + (x.horizonTotal || 0), 0);
    const histAvgTotal = summaries.reduce((s, x) => s + (x.historicalAvg || 0), 0);
    const trendPct = histAvgTotal > 0
      ? ((horizonTotal / horizon - histAvgTotal) / histAvgTotal) * 100
      : null;
    const nextMonthPeriod = summaries.find((s) => s.nextMonthPeriod)?.nextMonthPeriod || null;
    return { nextMonthTotal, horizonTotal, histAvgTotal, trendPct, nextMonthPeriod };
  }, [summaries, horizon]);

  // Chart data for the active loan type
  const { chartData, lastActualPeriod } = useMemo(() => {
    const data = forecasts[activeLoanType];
    if (!data) return { chartData: [], lastActualPeriod: null };
    const merged = [];
    for (const row of data.historical || []) {
      merged.push({
        period: row.period,
        label: monthLabel(row.period),
        actual: row.actual,
      });
    }
    const lastPeriod = (data.historical || []).slice(-1)[0]?.period || null;
    for (const row of data.forecast || []) {
      merged.push({
        period: row.period,
        label: monthLabel(row.period),
        predicted: row.predicted,
        band: [row.lower, row.upper],
      });
    }
    return { chartData: merged, lastActualPeriod: lastPeriod };
  }, [forecasts, activeLoanType]);

  const renderTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const row = payload[0]?.payload || {};
    return (
      <div className="bg-white border border-gray-200 rounded-lg shadow-md px-3 py-2 text-xs">
        <p className="font-bold text-gray-800 mb-1">{label}</p>
        {row.actual !== undefined && (
          <p className="text-[#1D6021]">
            <span className="font-semibold">Actual:</span> {PHP(row.actual)}
          </p>
        )}
        {row.predicted !== undefined && (
          <>
            <p className="text-[#0D4F8B]">
              <span className="font-semibold">Forecast:</span> {PHP(row.predicted)}
            </p>
            {row.band && (
              <p className="text-gray-500">
                <span className="font-semibold">80% CI:</span> {PHP(row.band[0])} – {PHP(row.band[1])}
              </p>
            )}
          </>
        )}
      </div>
    );
  };

  const activeMeta = LOAN_TYPES.find((t) => t.value === activeLoanType);

  return (
    <div className={`bg-white rounded-xl border border-gray-200 shadow-sm p-6 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="flex items-center text-lg font-bold text-[#1F3E35]">
            <TrendingUp className="w-5 h-5 mr-2 text-[#1D6021]" />
            Loan Demand Forecast & Liquidity Outlook
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            Next-month demand per loan type and combined liquidity required to cover the next {horizon} months.
          </p>
        </div>
        <select
          value={horizon}
          onChange={(e) => setHorizon(Number(e.target.value))}
          disabled={loading}
          className="h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#389734]"
        >
          <option value={6}>6 mo horizon</option>
          <option value={12}>12 mo horizon</option>
          <option value={18}>18 mo horizon</option>
          <option value={24}>24 mo horizon</option>
        </select>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center gap-2 mb-4">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      {/* Next-month tiles per loan type */}
      <div className="mb-5">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
          Next Month Forecast
          {liquidity.nextMonthPeriod && (
            <span className="ml-2 text-gray-500 font-normal normal-case">
              ({monthLabel(liquidity.nextMonthPeriod)})
            </span>
          )}
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {summaries.map((s) => (
            <div
              key={s.value}
              className="border border-gray-200 rounded-lg px-4 py-3"
              style={{ borderLeftWidth: 4, borderLeftColor: s.color }}
            >
              <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                {s.label} Loan
              </p>
              <p className="text-xl font-black text-gray-800 mt-1">
                {loading ? (
                  <Loader2 className="w-4 h-4 inline animate-spin text-gray-400" />
                ) : (
                  PHP(s.nextMonth)
                )}
              </p>
              {s.nextMonthBand && (
                <p className="text-[10px] text-gray-400 mt-0.5">
                  80% CI: {PHP(s.nextMonthBand[0])} – {PHP(s.nextMonthBand[1])}
                </p>
              )}
            </div>
          ))}

          {/* Total Liquidity Alert tile */}
          <div className="rounded-lg px-4 py-3 bg-gradient-to-br from-[#1D6021] to-[#0F4515] text-white shadow-md">
            <p className="text-[11px] font-bold uppercase tracking-wider flex items-center gap-1 opacity-90">
              <AlertTriangle className="w-3.5 h-3.5" /> Total Liquidity Alert
            </p>
            <p className="text-xl font-black mt-1">
              {loading ? (
                <Loader2 className="w-4 h-4 inline animate-spin" />
              ) : (
                PHP(liquidity.nextMonthTotal)
              )}
            </p>
            <p className="text-[10px] opacity-80 mt-0.5">
              Cash needed next month (all loan types)
            </p>
          </div>
        </div>
      </div>

      {/* Horizon totals */}
      <div className="mb-6">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
          Total Liquidity Needed — Next {horizon} Months
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {summaries.map((s) => (
            <div key={s.value} className="border border-gray-200 rounded-lg px-4 py-3">
              <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                {s.label} — {horizon} mo
              </p>
              <p className="text-lg font-bold text-gray-800 mt-1">
                {loading ? (
                  <Loader2 className="w-4 h-4 inline animate-spin text-gray-400" />
                ) : (
                  PHP(s.horizonTotal)
                )}
              </p>
              <p className="text-[10px] text-gray-400 mt-0.5">
                Avg {PHP(s.horizonTotal / horizon)} / month
              </p>
            </div>
          ))}

          <div className="rounded-lg px-4 py-3 bg-[#FFF7ED] border border-amber-300">
            <p className="text-[11px] font-bold uppercase tracking-wider flex items-center gap-1 text-amber-700">
              <Wallet className="w-3.5 h-3.5" /> Combined Cash Demand
            </p>
            <p className="text-xl font-black mt-1 text-amber-800">
              {loading ? (
                <Loader2 className="w-4 h-4 inline animate-spin" />
              ) : (
                PHP(liquidity.horizonTotal)
              )}
            </p>
            <p className="text-[10px] text-amber-700 mt-0.5">
              {liquidity.trendPct === null
                ? "next horizon"
                : `${liquidity.trendPct >= 0 ? "+" : ""}${liquidity.trendPct.toFixed(1)}% vs historical avg`}
            </p>
          </div>
        </div>
      </div>

      {/* Detail chart */}
      <div className="border-t border-gray-100 pt-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
            Detail Chart
          </p>
          <div className="flex gap-1">
            {LOAN_TYPES.map((t) => (
              <button
                key={t.value}
                onClick={() => setActiveLoanType(t.value)}
                className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${
                  activeLoanType === t.value
                    ? "bg-[#1D6021] text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="h-72 flex items-center justify-center text-sm text-gray-500">
            <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading...
          </div>
        ) : chartData.length > 0 ? (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="bandFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={activeMeta?.forecastColor || "#0D4F8B"} stopOpacity={0.2} />
                    <stop offset="100%" stopColor={activeMeta?.forecastColor || "#0D4F8B"} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#eef2f7" vertical={false} />
                <XAxis dataKey="label" stroke="#94a3b8" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis
                  stroke="#94a3b8"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => `₱${(v / 1000).toFixed(0)}k`}
                  width={70}
                />
                <Tooltip content={renderTooltip} />
                <Legend wrapperStyle={{ fontSize: 12 }} iconType="line" />
                <Area
                  type="monotone"
                  dataKey="band"
                  stroke="none"
                  fill="url(#bandFill)"
                  name="80% CI"
                  isAnimationActive={false}
                  connectNulls={false}
                />
                <Line
                  type="monotone"
                  dataKey="actual"
                  stroke={activeMeta?.color || "#1D6021"}
                  strokeWidth={2}
                  dot={{ r: 2 }}
                  activeDot={{ r: 5 }}
                  name="Historical"
                  connectNulls={false}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="predicted"
                  stroke={activeMeta?.forecastColor || "#0D4F8B"}
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  dot={{ r: 2 }}
                  activeDot={{ r: 5 }}
                  name="Forecast"
                  connectNulls={false}
                  isAnimationActive={false}
                />
                {lastActualPeriod && (
                  <ReferenceLine
                    x={monthLabel(lastActualPeriod)}
                    stroke="#cbd5e1"
                    strokeDasharray="3 3"
                    label={{
                      value: "Forecast start",
                      fontSize: 10,
                      fill: "#64748b",
                      position: "insideTopRight",
                    }}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-72 flex items-center justify-center text-sm text-gray-400">
            No data available.
          </div>
        )}
      </div>

      <p className="mt-3 text-[10px] text-gray-400 flex items-start gap-1">
        <Info className="w-3 h-3 mt-0.5" />
        Model: SARIMA fit on Jan 2022 – Dec 2024 monthly aggregates. The shaded band is an 80% confidence interval.
        Liquidity totals are point estimates — use upper-bound for conservative cash planning.
      </p>
    </div>
  );
};

export default LoanDemandForecastCard;
