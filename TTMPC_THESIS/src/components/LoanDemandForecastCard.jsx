import React, { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { TrendingUp, Loader2, AlertCircle, Info } from "lucide-react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

const LOAN_TYPES = [
  { value: "consolidated", label: "Consolidated", color: "#1D6021" },
  { value: "emergency",    label: "Emergency",    color: "#B45309" },
];

const PHP = (value) =>
  `₱${Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Build 12 month rows for the target year, merging CSV actuals (past months)
 * with API forecast (future months). The "boundary" between actual and forecast
 * is the actuals.months array — any month with loan_count > 0 is treated as
 * historical. Months without actuals fall back to the forecast for that period.
 */
// Normalize any period representation ("2026-01", "2026-01-31", Date, …) to "YYYY-MM"
// so we can join actuals and forecast by month regardless of source format.
const monthKey = (period) => {
  if (!period) return "";
  const s = String(period);
  // Already "YYYY-MM-…" — just truncate.
  if (/^\d{4}-\d{2}/.test(s)) return s.slice(0, 7);
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  return s;
};

const buildYearSeries = (actuals, forecast, color, targetYear) => {
  const year = targetYear ?? actuals?.year;
  const fcByPeriod = new Map(
    (forecast?.forecast || []).map((r) => [monthKey(r.period), r])
  );
  const actualsByPeriod = new Map(
    (actuals?.months || []).map((r) => [monthKey(r.period), r])
  );
  return MONTH_LABELS.map((label, idx) => {
    const m = idx + 1;
    const key = `${year}-${String(m).padStart(2, "0")}`;
    const actualRow = actualsByPeriod.get(key);
    const fcRow = fcByPeriod.get(key);
    const hasActual = actualRow && actualRow.loan_count > 0;
    const actualValue = hasActual ? actualRow.actual : null;
    const predictedValue = !hasActual && fcRow ? fcRow.predicted : null;
    return {
      label,
      period: key,
      actual: actualValue,
      predicted: predictedValue,
      lower: fcRow?.lower ?? null,
      upper: fcRow?.upper ?? null,
      color,
      kind: hasActual ? "actual" : (predictedValue !== null ? "forecast" : "n/a"),
    };
  });
};

const LoanDemandForecastCard = ({ className = "" }) => {
  const [actuals, setActuals] = useState({});    // {consolidated: {year, months: [...]}, emergency: ...}
  const [forecasts, setForecasts] = useState({}); // {consolidated: {forecast: [...]}, emergency: ...}
  const [displayYear, setDisplayYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const fetchAll = async () => {
      setLoading(true);
      setError("");
      try {
        // Step 1: probe actuals to find what years the CSV has.
        const probeRes = await fetch(
          `${API_BASE_URL}/api/analytics/demand/actuals?loan_type=consolidated`,
          { headers: { Accept: "application/json" } }
        );
        const probePayload = await probeRes.json().catch(() => ({}));
        if (!probeRes.ok) {
          throw new Error(probePayload?.detail || "Failed to discover available years.");
        }
        const latestCsvYear = Math.max(...(probePayload.available_years || [probePayload.year]));
        // Display the *next* year after the latest CSV year, so months without
        // actuals naturally fall through to forecast values.
        const targetYear = latestCsvYear + 1;
        if (cancelled) return;
        setDisplayYear(targetYear);

        // Step 2: fetch actuals (for targetYear) + forecast (long enough to reach Dec of targetYear).
        // ──────────────────────────────────────────────────────────────────────
        // IF YOU RETRAIN / SWAP THE SARIMA MODEL: update `trainingEndYear` to the
        // last year present in the new model's training set. The model's forecast
        // starts the month *after* training ends, so this number controls how
        // many `periods` we request to reach Dec of the year we want to display.
        // Files to update when retraining:
        //   • src/server/models/consolidated_model.pkl
        //   • src/server/models/emergency_model.pkl
        //   • src/analytics/Loan Demand Forecasting/Data/df_modeling_export (1).csv
        //     (regenerate so `available_years` reflects the new training range)
        // ──────────────────────────────────────────────────────────────────────
        const trainingEndYear = 2024;
        const requiredPeriods = Math.max(12, (targetYear - trainingEndYear) * 12);

        const results = await Promise.all(
          LOAN_TYPES.map(async (t) => {
            const [actRes, fcRes] = await Promise.all([
              fetch(`${API_BASE_URL}/api/analytics/demand/actuals?loan_type=${t.value}&year=${targetYear}`, {
                headers: { Accept: "application/json" },
              }),
              fetch(`${API_BASE_URL}/api/analytics/demand/forecast?loan_type=${t.value}&periods=${requiredPeriods}`, {
                headers: { Accept: "application/json" },
              }),
            ]);
            const actPayload = await actRes.json().catch(() => ({}));
            const fcPayload = await fcRes.json().catch(() => ({}));
            if (!actRes.ok) throw new Error(actPayload?.detail || `Failed to load ${t.label} actuals.`);
            if (!fcRes.ok) throw new Error(fcPayload?.detail || `Failed to load ${t.label} forecast.`);
            const fcData = fcPayload?.data ?? fcPayload;
            return [t.value, { actuals: actPayload, forecast: fcData }];
          })
        );
        if (cancelled) return;
        const actMap = {};
        const fcMap = {};
        for (const [k, v] of results) {
          actMap[k] = v.actuals;
          fcMap[k] = v.forecast;
        }
        setActuals(actMap);
        setForecasts(fcMap);
      } catch (err) {
        if (!cancelled) setError(err?.message || "Unable to load forecast data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchAll();
    return () => { cancelled = true; };
  }, []);

  const seriesByType = useMemo(() => {
    const out = {};
    for (const t of LOAN_TYPES) {
      out[t.value] = buildYearSeries(actuals[t.value], forecasts[t.value], t.color, displayYear);
    }
    return out;
  }, [actuals, forecasts, displayYear]);

  // Combine the two series into one chart dataset keyed by month label.
  const chartData = useMemo(() => {
    return MONTH_LABELS.map((label, idx) => {
      const row = { label };
      for (const t of LOAN_TYPES) {
        const point = seriesByType[t.value]?.[idx];
        if (!point) continue;
        // For the chart, pick whichever value exists (actual or predicted) and
        // tag whether it's a forecast so the table can highlight it.
        const value = point.actual !== null ? point.actual : point.predicted;
        row[`${t.value}_value`] = value;
        row[`${t.value}_kind`] = point.kind;
      }
      return row;
    });
  }, [seriesByType]);

  const currentYear = displayYear;

  const renderTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-white border border-gray-200 rounded-lg shadow-md px-3 py-2 text-xs space-y-1">
        <p className="font-bold text-gray-800">{label} {currentYear}</p>
        {LOAN_TYPES.map((t) => {
          const row = payload[0]?.payload || {};
          const v = row[`${t.value}_value`];
          const kind = row[`${t.value}_kind`];
          if (v === undefined || v === null) return null;
          return (
            <p key={t.value} style={{ color: t.color }}>
              <span className="font-semibold">{t.label}:</span> {PHP(v)}
              <span className="ml-1 text-gray-400 font-normal">({kind === "actual" ? "actual" : "forecast"})</span>
            </p>
          );
        })}
      </div>
    );
  };

  return (
    <div className={`bg-white rounded-xl border border-gray-200 shadow-sm p-6 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h2 className="flex items-center text-lg font-bold text-[#1F3E35]">
            <TrendingUp className="w-5 h-5 mr-2 text-[#1D6021]" />
            Loan Demand Forecast — {currentYear}
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            Predicted monthly disbursement demand per loan type for {currentYear}.
            Months with historical actuals (from the training dataset) show as actuals;
            future months show SARIMA point forecasts.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center gap-2 mb-4">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      {/* Line chart */}
      <div className="h-72 mb-6">
        {loading ? (
          <div className="h-full flex items-center justify-center text-sm text-gray-500">
            <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading…
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#eef2f7" vertical={false} />
              <XAxis dataKey="label" stroke="#94a3b8" tick={{ fontSize: 11 }} />
              <YAxis
                stroke="#94a3b8"
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => `₱${(v / 1000).toFixed(0)}k`}
                width={70}
              />
              <Tooltip content={renderTooltip} />
              <Legend wrapperStyle={{ fontSize: 12 }} iconType="line" />
              {LOAN_TYPES.map((t) => (
                <Line
                  key={t.value}
                  type="monotone"
                  dataKey={`${t.value}_value`}
                  stroke={t.color}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                  name={t.label}
                  connectNulls
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Per-loan-type tables — hidden for now, chart only.
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {LOAN_TYPES.map((t) => (
          <div key={t.value} className="border border-gray-200 rounded-lg overflow-hidden">
            <div
              className="px-4 py-3 border-b border-gray-200 flex items-center gap-2"
              style={{ background: `${t.color}10` }}
            >
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: t.color }} />
              <h3 className="text-sm font-bold text-gray-800">{t.label} Loan</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50">
                  <tr className="text-[10px] uppercase tracking-wider text-gray-500">
                    <th className="px-4 py-2 font-bold">Month</th>
                    <th className="px-4 py-2 font-bold text-right">Amount</th>
                    <th className="px-4 py-2 font-bold">Type</th>
                    <th className="px-4 py-2 font-bold text-right">80% CI</th>
                  </tr>
                </thead>
                <tbody>
                  {(seriesByType[t.value] || []).map((row) => {
                    const value = row.actual !== null ? row.actual : row.predicted;
                    const isForecast = row.kind === "forecast";
                    return (
                      <tr key={row.period} className="border-t border-gray-100">
                        <td className="px-4 py-2 text-gray-700 font-medium">{row.label}</td>
                        <td className="px-4 py-2 text-right font-bold text-gray-800">
                          {value !== null ? PHP(value) : "—"}
                        </td>
                        <td className="px-4 py-2">
                          {row.kind === "actual" ? (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-green-50 text-green-700">Actual</span>
                          ) : row.kind === "forecast" ? (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-700">Forecast</span>
                          ) : (
                            <span className="text-[10px] text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right text-[10px] text-gray-500">
                          {isForecast && row.lower !== null && row.upper !== null
                            ? `${PHP(row.lower)} – ${PHP(row.upper)}`
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
      */}

      <p className="mt-4 text-[10px] text-gray-400 flex items-start gap-1">
        <Info className="w-3 h-3 mt-0.5 shrink-0" />
        Actuals are aggregated from the normalized loan dataset. Forecast values are SARIMA point estimates;
        the 80% confidence interval indicates the range within which actual demand is expected to fall.
      </p>
    </div>
  );
};

export default LoanDemandForecastCard;
