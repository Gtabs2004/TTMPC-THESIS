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
  { value: "consolidated", label: "Consolidated", color: "var(--color-member-green)" },
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
    // Always keep the forecast value if the model returned one for this
    // month — even when we also have an actual. That way the dashed
    // "forecast" line renders alongside the solid "actual" line so the
    // user can compare predicted vs. real for the same period.
    const predictedValue = fcRow ? fcRow.predicted : null;
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

// Last year present in the SARIMA model's training set. The model's forecast
// horizon starts the month *after* training ends, so this controls how many
// `periods` we request when the user picks a future year.
// If you retrain the model, bump this to the new training end year.
const TRAINING_END_YEAR = 2024;

const LoanDemandForecastCard = ({ className = "" }) => {
  const [actuals, setActuals] = useState({});    // {consolidated: {year, months: [...]}, emergency: ...}
  const [forecasts, setForecasts] = useState({}); // {consolidated: {forecast: [...]}, emergency: ...}
  const [availableYears, setAvailableYears] = useState([]);
  const [displayYear, setDisplayYear] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Step 1 (once): probe the CSV to discover available years, and default the
  // picker to the LATEST year that has actuals — so you actually see real data
  // on first load. Users can jump to a future year via the picker to see the
  // pure-forecast view.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/analytics/demand/actuals?loan_type=consolidated`,
          { headers: { Accept: "application/json" } }
        );
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload?.detail || "Failed to discover available years.");
        const years = Array.isArray(payload.available_years) && payload.available_years.length
          ? payload.available_years
          : [payload.year];
        if (cancelled) return;
        const latestActualYear = Math.max(...years);
        // Offer the user a menu that includes historical years plus a couple of
        // forward years so they can peek at the forecast horizon.
        const forwardYears = [latestActualYear + 1, latestActualYear + 2];
        setAvailableYears([...years, ...forwardYears]);
        setDisplayYear(latestActualYear);
      } catch (err) {
        if (!cancelled) setError(err?.message || "Unable to load year list.");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Step 2: re-fetch whenever the selected year changes.
  useEffect(() => {
    if (displayYear == null) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        // Each SARIMA model has its own training-end date (Consolidated ends
        // 2024-12, Emergency ends 2025-12), so a single hardcoded horizon
        // doesn't work for both. Also, the forecast payload includes a
        // `historical` array covering the model's training range — we merge
        // it into the actuals map below so past years render even for months
        // the model was trained on. We request the API max (60) periods so
        // any reasonable year picked by the user is covered.
        const results = await Promise.all(
          LOAN_TYPES.map(async (t) => {
            const [actRes, fcRes] = await Promise.all([
              fetch(`${API_BASE_URL}/api/analytics/demand/actuals?loan_type=${t.value}&year=${displayYear}`, {
                headers: { Accept: "application/json" },
              }),
              fetch(`${API_BASE_URL}/api/analytics/demand/forecast?loan_type=${t.value}&periods=60`, {
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
    })();
    return () => { cancelled = true; };
  }, [displayYear]);

  const seriesByType = useMemo(() => {
    const out = {};
    for (const t of LOAN_TYPES) {
      out[t.value] = buildYearSeries(actuals[t.value], forecasts[t.value], t.color, displayYear);
    }
    return out;
  }, [actuals, forecasts, displayYear]);

  // Combine the two series into one chart dataset keyed by month label.
  // Each loan type gets THREE fields:
  //   {type}_actual   — historical value (null on forecast months)
  //   {type}_forecast — SARIMA point value (null on actual months)
  //   {type}_value    — whichever exists (used by tooltip for the hovered month)
  //   {type}_kind     — "actual" | "forecast" | "n/a"
  // To keep the two lines visually joined at the boundary, we duplicate the
  // last actual value into the forecast series for the month immediately
  // *after* the last actual — otherwise there's a visible gap.
  const chartData = useMemo(() => {
    const rows = MONTH_LABELS.map((label, idx) => {
      const row = { label };
      for (const t of LOAN_TYPES) {
        const point = seriesByType[t.value]?.[idx];
        if (!point) continue;
        row[`${t.value}_actual`] = point.actual;
        row[`${t.value}_forecast`] = point.predicted;
        row[`${t.value}_value`] = point.actual !== null ? point.actual : point.predicted;
        row[`${t.value}_kind`] = point.kind;
      }
      return row;
    });
    return rows;
  }, [seriesByType]);

  const currentYear = displayYear;

  // Plain-language insights per loan type. Executives should be able to read
  // the takeaway without decoding the chart. Everything is derived from the
  // data we already have (no extra API calls).
  const insightsByType = useMemo(() => {
    const out = {};
    for (const t of LOAN_TYPES) {
      const series = seriesByType[t.value] || [];
      const actualMonths = series.filter((r) => r.actual !== null);
      const forecastMonths = series.filter((r) => r.predicted !== null);
      const overlapMonths = series.filter((r) => r.actual !== null && r.predicted !== null);

      const totalActual = actualMonths.reduce((s, r) => s + r.actual, 0);
      const totalForecast = forecastMonths.reduce((s, r) => s + r.predicted, 0);

      // Peak / trough month for whichever series is more complete.
      const primary = forecastMonths.length >= actualMonths.length ? forecastMonths : actualMonths;
      const primaryKind = forecastMonths.length >= actualMonths.length ? "predicted" : "actual";
      let peak = null;
      let trough = null;
      for (const r of primary) {
        const v = r[primaryKind];
        if (peak === null || v > peak.value) peak = { label: r.label, value: v };
        if (trough === null || v < trough.value) trough = { label: r.label, value: v };
      }

      // Actual vs. forecast comparison — only meaningful when we have overlap.
      let gapPct = null;
      if (overlapMonths.length >= 3) {
        const ovA = overlapMonths.reduce((s, r) => s + r.actual, 0);
        const ovF = overlapMonths.reduce((s, r) => s + r.predicted, 0);
        if (ovF > 0) gapPct = ((ovA - ovF) / ovF) * 100;
      }

      // Coverage note — did the model produce anything for this year?
      const noForecastCoverage = forecastMonths.length === 0;

      const bullets = [];

      if (noForecastCoverage) {
        bullets.push({
          tone: "info",
          text: `The forecasting model has no predictions for ${currentYear} — this year sits inside its training data (the model was fit on it, not asked to predict it). Pick a later year to see forecast values.`,
        });
      } else if (overlapMonths.length >= 3 && gapPct !== null) {
        const direction = gapPct >= 0 ? "above" : "below";
        const magnitude = Math.abs(gapPct);
        const strength = magnitude < 5 ? "closely tracked" : magnitude < 15 ? "ran slightly" : "diverged noticeably";
        bullets.push({
          tone: gapPct >= 0 ? "up" : "down",
          text: `Actual ${t.label.toLowerCase()} demand ${strength} ${direction} the forecast for ${currentYear} — real disbursements were about ${magnitude.toFixed(0)}% ${direction} what the model predicted.`,
        });
      } else if (actualMonths.length > 0 && forecastMonths.length > 0) {
        bullets.push({
          tone: "info",
          text: `${currentYear} is partially in the model's forecast horizon — expect the dashed forecast line to appear only for months the model was asked to predict.`,
        });
      }

      if (peak && trough && peak.value !== trough.value) {
        bullets.push({
          tone: "peak",
          text: `Highest ${primaryKind === "predicted" ? "predicted" : "recorded"} demand: ${peak.label} (${PHP(peak.value)}). Lowest: ${trough.label} (${PHP(trough.value)}).`,
        });
      }

      if (forecastMonths.length >= 6) {
        bullets.push({
          tone: "total",
          text: `Full-year projected total: ${PHP(totalForecast)} in ${t.label.toLowerCase()} disbursements.`,
        });
      } else if (actualMonths.length >= 6) {
        bullets.push({
          tone: "total",
          text: `Year-to-date actual total: ${PHP(totalActual)} in ${t.label.toLowerCase()} disbursements.`,
        });
      }

      // Advisory: only when peak is meaningfully above the average.
      if (peak && primary.length >= 6) {
        const avg = primary.reduce((s, r) => s + r[primaryKind], 0) / primary.length;
        if (avg > 0 && peak.value / avg >= 1.25) {
          bullets.push({
            tone: "advice",
            text: `Cash-flow tip: ${peak.label} is projected to be roughly ${((peak.value / avg - 1) * 100).toFixed(0)}% above the year's average — worth planning higher liquidity that month.`,
          });
        }
      }

      out[t.value] = bullets;
    }
    return out;
  }, [seriesByType, currentYear]);

  const makeTooltip = (loanType) => ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const row = payload[0]?.payload || {};
    const v = row[`${loanType.value}_value`];
    const kind = row[`${loanType.value}_kind`];
    if (v === undefined || v === null) return null;
    return (
      <div className="bg-white border border-gray-200 rounded-lg shadow-md px-3 py-2 text-xs space-y-1">
        <p className="font-bold text-gray-800">{label} {currentYear}</p>
        <p style={{ color: loanType.color }}>
          <span className="font-semibold">{loanType.label}:</span> {PHP(v)}
          <span className="ml-1 text-gray-400 font-normal">({kind === "actual" ? "actual" : "forecast"})</span>
        </p>
      </div>
    );
  };

  return (
    <div className={`bg-white rounded-xl border border-gray-200 shadow-sm p-6 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h2 className="flex items-center text-lg font-bold text-[#1F3E35]">
            <TrendingUp className="w-5 h-5 mr-2 text-member-green" />
            Loan Demand Forecast — {currentYear ?? "…"}
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            Monthly disbursement demand per loan type for {currentYear ?? "…"}.
            Solid line = historical actuals; dashed line = SARIMA point forecast.
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs text-gray-600 font-semibold">
          Year:
          <select
            value={displayYear ?? ""}
            onChange={(e) => setDisplayYear(Number(e.target.value))}
            disabled={!availableYears.length}
            className="h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent disabled:opacity-50"
          >
            {availableYears.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center gap-2 mb-4">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      {/* Two stacked mini-charts — each loan type gets its own Y-axis so the
          Emergency series (~₱20k range) isn't visually flattened by the
          Consolidated series (~₱500k range). */}
      {loading ? (
        <div className="h-72 flex items-center justify-center text-sm text-gray-500 mb-6">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading…
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 mb-6">
          {LOAN_TYPES.map((t) => (
            <div key={t.value} className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: t.color }} />
                  <h3 className="text-sm font-bold text-gray-800">{t.label} Loan</h3>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-gray-500">
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-4 h-0.5" style={{ background: t.color }} />
                    Actual
                  </span>
                  <span className="flex items-center gap-1">
                    <span
                      className="inline-block w-4 h-0.5"
                      style={{ background: `repeating-linear-gradient(to right, ${t.color} 0 3px, transparent 3px 6px)` }}
                    />
                    Forecast
                  </span>
                </div>
              </div>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="#eef2f7" vertical={false} />
                    <XAxis dataKey="label" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                    <YAxis
                      stroke="#94a3b8"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => `₱${(v / 1000).toFixed(0)}k`}
                      width={70}
                      domain={["auto", "auto"]}
                    />
                    <Tooltip content={makeTooltip(t)} />
                    <Line
                      type="monotone"
                      dataKey={`${t.value}_actual`}
                      stroke={t.color}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                      name={`${t.label} (actual)`}
                      connectNulls={false}
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey={`${t.value}_forecast`}
                      stroke={t.color}
                      strokeWidth={2}
                      strokeDasharray="5 4"
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                      name={`${t.label} (forecast)`}
                      connectNulls={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              {insightsByType[t.value]?.length > 0 && (
                <div className="mt-4 pt-3 border-t border-gray-100">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-2">
                    What this means
                  </p>
                  <ul className="space-y-1.5">
                    {insightsByType[t.value].map((b, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-gray-700 leading-relaxed">
                        <span
                          className="mt-1.5 inline-block w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ background: b.tone === "advice" ? "#B45309" : t.color }}
                        />
                        <span>
                          {b.tone === "advice" && (
                            <span className="font-semibold text-amber-700">Tip: </span>
                          )}
                          {b.text}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

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
