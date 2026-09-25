import React, { useEffect, useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { TrendingUp, Loader2, AlertCircle, Info } from "lucide-react";
import { FORECAST_LOAN_TYPE_COLORS } from "../lib/chartColors";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

const LOAN_TYPES = [
  { value: "consolidated", label: "Consolidated", color: FORECAST_LOAN_TYPE_COLORS.consolidated },
  { value: "emergency",    label: "Emergency",    color: FORECAST_LOAN_TYPE_COLORS.emergency },
  { value: "bonus",        label: "Bonus",        color: FORECAST_LOAN_TYPE_COLORS.bonus },
];

// Picker value for the rolling 12-month view starting this month (the
// default) — this month is included so loans filed today show up as actuals
// against the forecast. Every other picker value is a calendar year.
const NEXT_12 = "next12";
const HORIZON_MONTHS = 12;

const PHP = (value) =>
  `₱${Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;

// Compact peso for axis ticks and headline figures: ₱850k, ₱4.3M.
const PHP_COMPACT = (value) => {
  const v = Number(value || 0);
  const abs = Math.abs(v);
  if (abs >= 1e6) return `₱${(v / 1e6).toFixed(abs >= 1e7 || v % 1e6 === 0 ? 0 : 1)}M`;
  if (abs >= 1e3) return `₱${(v / 1e3).toFixed(0)}k`;
  return `₱${v.toFixed(0)}`;
};

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

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

// The months a view covers, as {key: "YYYY-MM", label, fullLabel}.
// NEXT_12 = this month + the next 11; a year = its Jan–Dec.
const periodsForView = (view) => {
  const out = [];
  const push = (y, m0, rolling) => out.push({
    key: `${y}-${String(m0 + 1).padStart(2, "0")}`,
    label: rolling ? `${MONTH_LABELS[m0]} '${String(y).slice(2)}` : MONTH_LABELS[m0],
    fullLabel: `${MONTH_LABELS[m0]} ${y}`,
  });
  if (view === NEXT_12) {
    const now = new Date();
    for (let i = 0; i < HORIZON_MONTHS; i += 1) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      push(d.getFullYear(), d.getMonth(), true);
    }
  } else {
    for (let m0 = 0; m0 < 12; m0 += 1) push(view, m0, false);
  }
  return out;
};

const viewLabel = (view, periods) =>
  view === NEXT_12
    ? `Next 12 Months (${periods[0]?.fullLabel} – ${periods[periods.length - 1]?.fullLabel})`
    : String(view);

/**
 * One row per month in the view, merging actuals (from the loan dataset) with
 * the model's predictions. The model's `forecast` array covers months after
 * its training end; for months inside the training range we use `fitted`
 * (one-step-ahead in-sample predictions) so every month with a prediction
 * gets a dashed line to compare against the solid actual. Out-of-sample
 * values win where both exist.
 */
const buildSeries = (actualsByYear, forecast, periods) => {
  const fcByPeriod = new Map(
    [...(forecast?.fitted || []), ...(forecast?.forecast || [])].map((r) => [monthKey(r.period), r])
  );
  const actualsByPeriod = new Map();
  Object.values(actualsByYear || {}).forEach((a) =>
    (a?.months || []).forEach((r) => actualsByPeriod.set(monthKey(r.period), r))
  );
  return periods.map((p) => {
    const actualRow = actualsByPeriod.get(p.key);
    const fcRow = fcByPeriod.get(p.key);
    const hasActual = actualRow && actualRow.loan_count > 0;
    return {
      ...p,
      period: p.key,
      actual: hasActual ? actualRow.actual : null,
      liveCount: hasActual ? actualRow.live_count || 0 : 0,
      loanCount: hasActual ? actualRow.loan_count || 0 : 0,
      predicted: fcRow ? fcRow.predicted : null,
      lower: fcRow?.lower ?? null,
      upper: fcRow?.upper ?? null,
      lower95: fcRow?.lower95 ?? null,
      upper95: fcRow?.upper95 ?? null,
    };
  });
};

// Forecast horizon to request: at least 12 months past today, and far enough
// to fill every forward year offered in the picker (through next December).
const monthsFromTodayNeeded = () => Math.max(HORIZON_MONTHS, 12 - new Date().getMonth() + 11);

const LoanDemandForecastCard = ({ className = "" }) => {
  const [actuals, setActuals] = useState({});     // {consolidated: {2026: {...}, 2027: {...}}, ...}
  const [forecasts, setForecasts] = useState({}); // {consolidated: payload, ...}
  const [typeErrors, setTypeErrors] = useState({}); // {bonus: "No bonus model yet…"}
  const [availableYears, setAvailableYears] = useState([]);
  const [view, setView] = useState(NEXT_12);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const periods = useMemo(() => periodsForView(view), [view]);
  const yearsInView = useMemo(
    () => [...new Set(periods.map((p) => Number(p.key.slice(0, 4))))],
    [periods]
  );

  // Once: discover which years have actuals (for the picker) and load each
  // type's forecast. The forecast doesn't depend on the selected view — one
  // request covers the next 12 months and the forward years in the picker.
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
        const thisYear = new Date().getFullYear();
        if (!cancelled) {
          setAvailableYears([...new Set([...years, thisYear, thisYear + 1])].sort((a, b) => a - b));
        }
      } catch (err) {
        if (!cancelled) setError(err?.message || "Unable to load year list.");
      }
    })();

    (async () => {
      const results = await Promise.all(
        LOAN_TYPES.map(async (t) => {
          try {
            const res = await fetch(
              `${API_BASE_URL}/api/analytics/demand/forecast?loan_type=${t.value}&months_from_today=${monthsFromTodayNeeded()}`,
              { headers: { Accept: "application/json" } }
            );
            const payload = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(payload?.detail || `Failed to load ${t.label} forecast.`);
            return [t.value, payload?.data ?? payload, null];
          } catch (err) {
            return [t.value, null, err?.message || `Failed to load ${t.label} forecast.`];
          }
        })
      );
      if (cancelled) return;
      const fcMap = {};
      const errMap = {};
      for (const [k, fc, err] of results) {
        if (fc) fcMap[k] = fc;
        if (err) errMap[k] = err;
      }
      setForecasts(fcMap);
      setTypeErrors(errMap);
    })();

    return () => { cancelled = true; };
  }, []);

  // Actuals for every calendar year the current view touches (the rolling
  // view can straddle two years). A type with no data yet (e.g. Bonus before
  // its data is loaded) just gets no actuals rather than failing the card.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const results = await Promise.all(
          LOAN_TYPES.flatMap((t) =>
            yearsInView.map(async (y) => {
              const res = await fetch(
                `${API_BASE_URL}/api/analytics/demand/actuals?loan_type=${t.value}&year=${y}`,
                { headers: { Accept: "application/json" } }
              );
              const payload = await res.json().catch(() => ({}));
              return [t.value, y, res.ok ? payload : null];
            })
          )
        );
        if (cancelled) return;
        const actMap = {};
        for (const [k, y, payload] of results) {
          actMap[k] = actMap[k] || {};
          if (payload) actMap[k][y] = payload;
        }
        setActuals(actMap);
      } catch (err) {
        if (!cancelled) setError(err?.message || "Unable to load actual demand.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [yearsInView]);

  // Per type: one chart row per month. `band80` / `band95` are [low, high]
  // pairs, which Recharts draws as a shaded range between the two values.
  const seriesByType = useMemo(() => {
    const out = {};
    for (const t of LOAN_TYPES) {
      out[t.value] = buildSeries(actuals[t.value], forecasts[t.value], periods).map((r) => ({
        ...r,
        band80: r.lower !== null && r.upper !== null ? [r.lower, r.upper] : null,
        band95: r.lower95 !== null && r.upper95 !== null ? [r.lower95, r.upper95] : null,
      }));
    }
    return out;
  }, [actuals, forecasts, periods]);

  // Headline figures per loan type — the numbers an executive reads first,
  // shown as stat tiles above each chart instead of inside the bullets.
  const statsByType = useMemo(() => {
    const out = {};
    for (const t of LOAN_TYPES) {
      const series = seriesByType[t.value] || [];
      const predicted = series.filter((r) => r.predicted !== null);
      const actual = series.filter((r) => r.actual !== null);
      const peak = predicted.reduce((best, r) => (best === null || r.predicted > best.predicted ? r : best), null);
      out[t.value] = {
        projectedTotal: predicted.length ? predicted.reduce((sum, r) => sum + r.predicted, 0) : null,
        peak,
        actualTotal: actual.reduce((sum, r) => sum + r.actual, 0),
        actualLoans: actual.reduce((sum, r) => sum + r.loanCount, 0),
      };
    }
    return out;
  }, [seriesByType]);

  const title = viewLabel(view, periods);
  const periodPhrase = view === NEXT_12 ? "the next 12 months" : String(view);

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

      // Peak / trough month for whichever series is more complete.
      const primary = forecastMonths.length >= actualMonths.length ? forecastMonths : actualMonths;
      const primaryKind = forecastMonths.length >= actualMonths.length ? "predicted" : "actual";
      let peak = null;
      let trough = null;
      for (const r of primary) {
        const v = r[primaryKind];
        if (peak === null || v > peak.value) peak = { label: r.fullLabel, value: v };
        if (trough === null || v < trough.value) trough = { label: r.fullLabel, value: v };
      }

      const bullets = [];

      if (forecastMonths.length === 0 && forecasts[t.value]) {
        bullets.push({
          tone: "info",
          text: `The forecasting model has no values for ${periodPhrase} — this falls outside both its training range and its forecast horizon.`,
        });
      }

      // Actual vs. forecast comparison — only meaningful when we have overlap.
      if (overlapMonths.length >= 3) {
        const ovA = overlapMonths.reduce((s, r) => s + r.actual, 0);
        const ovF = overlapMonths.reduce((s, r) => s + r.predicted, 0);
        if (ovF > 0) {
          const gapPct = ((ovA - ovF) / ovF) * 100;
          const direction = gapPct >= 0 ? "above" : "below";
          const magnitude = Math.abs(gapPct);
          const strength = magnitude < 5 ? "closely tracked" : magnitude < 15 ? "ran slightly" : "ran noticeably";
          bullets.push({
            tone: gapPct >= 0 ? "up" : "down",
            text: `Actual ${t.label.toLowerCase()} demand ${strength} ${direction} the forecast for ${periodPhrase} — real disbursements were about ${magnitude.toFixed(0)}% ${direction} what the model predicted.`,
          });
        }
      }

      // Peak and totals live in the stat tiles; the low/high spread is the
      // one extra fact worth a sentence.
      if (peak && trough && peak.value !== trough.value) {
        bullets.push({
          tone: "peak",
          text: `${primaryKind === "predicted" ? "Expected demand" : "Recorded demand"} ranges from ${PHP(trough.value)} in ${trough.label} to ${PHP(peak.value)} in ${peak.label}.`,
        });
      }

      // Advisory: only when peak is meaningfully above the average.
      if (peak && primary.length >= 6) {
        const avg = primary.reduce((s, r) => s + r[primaryKind], 0) / primary.length;
        if (avg > 0 && peak.value / avg >= 1.25) {
          bullets.push({
            tone: "advice",
            text: `Cash-flow tip: ${peak.label} is projected to be roughly ${((peak.value / avg - 1) * 100).toFixed(0)}% above the period's average — worth planning higher liquidity that month.`,
          });
        }
      }

      out[t.value] = bullets;
    }
    return out;
  }, [seriesByType, periodPhrase, forecasts]);

  // Show actual, forecast and both confidence ranges for the hovered month.
  // When a month has an actual and a forecast we also print the gap, since
  // comparing the two is the whole point of overlaying the lines.
  const makeTooltip = (loanType) => ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const row = payload[0]?.payload || {};
    const { actual, predicted } = row;
    const hasActual = actual !== undefined && actual !== null;
    const hasForecast = predicted !== undefined && predicted !== null;
    if (!hasActual && !hasForecast) return null;

    let gapPct = null;
    if (hasActual && hasForecast && predicted !== 0) {
      gapPct = ((actual - predicted) / predicted) * 100;
    }

    return (
      <div className="bg-white border border-gray-200 rounded-lg shadow-md px-3 py-2 text-xs space-y-1">
        <p className="font-bold text-gray-800">{row.fullLabel}</p>
        {hasActual && (
          <p className="flex items-center gap-1.5 text-gray-700">
            <span className="inline-block w-4 h-0.5 shrink-0" style={{ background: loanType.color }} />
            <span className="font-semibold">Actual:</span> {PHP(actual)}
          </p>
        )}
        {row.liveCount > 0 && (
          <p className="text-[10px] text-gray-500">
            Includes {row.liveCount} loan{row.liveCount === 1 ? "" : "s"} from the live system
          </p>
        )}
        {hasForecast && (
          <p className="flex items-center gap-1.5 text-gray-700">
            <span
              className="inline-block w-4 h-0.5 shrink-0"
              style={{ background: `repeating-linear-gradient(to right, ${loanType.color} 0 3px, transparent 3px 6px)` }}
            />
            <span className="font-semibold">Forecast:</span> {PHP(predicted)}
          </p>
        )}
        {row.band80 && (
          <p className="flex items-center gap-1.5 text-gray-600">
            <span className="inline-block w-4 h-2.5 shrink-0 rounded-sm" style={{ background: loanType.color, opacity: 0.35 }} />
            <span className="font-semibold">80% range:</span> {PHP(row.lower)} – {PHP(row.upper)}
          </p>
        )}
        {row.band95 && (
          <p className="flex items-center gap-1.5 text-gray-600">
            <span className="inline-block w-4 h-2.5 shrink-0 rounded-sm" style={{ background: loanType.color, opacity: 0.15 }} />
            <span className="font-semibold">95% range:</span> {PHP(row.lower95)} – {PHP(row.upper95)}
          </p>
        )}
        {gapPct !== null && (
          <p className="text-gray-500 pt-0.5 border-t border-gray-100">
            Actual is {Math.abs(gapPct).toFixed(1)}% {gapPct >= 0 ? "above" : "below"} forecast
            <span className="ml-1 text-gray-400">({gapPct >= 0 ? "+" : "−"}{PHP(Math.abs(actual - predicted))})</span>
          </p>
        )}
      </div>
    );
  };

  return (
    <div className={`bg-white rounded-xl border border-gray-200 shadow-sm p-6 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h2 className="flex items-center text-lg font-bold text-[#1F3E35]">
            <TrendingUp className="w-5 h-5 mr-2 text-member-green" />
            Loan Demand Forecast — {title}
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            Expected monthly loan demand in pesos, by loan type, compared with the loans actually filed.
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs text-gray-600 font-semibold">
          Period:
          <select
            value={view}
            onChange={(e) => setView(e.target.value === NEXT_12 ? NEXT_12 : Number(e.target.value))}
            className="h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
          >
            <option value={NEXT_12}>Next 12 months</option>
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

      {/* Stacked mini-charts — each loan type gets its own Y-axis so the
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
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: t.color }} />
                  <h3 className="text-sm font-bold text-gray-800">{t.label} Loan</h3>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-500">
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
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-3 h-2.5 rounded-sm" style={{ background: t.color, opacity: 0.35 }} />
                    80% range
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-3 h-2.5 rounded-sm" style={{ background: t.color, opacity: 0.15 }} />
                    95% range
                  </span>
                </div>
              </div>
              {typeErrors[t.value] && (
                <div className="mb-3 flex items-start gap-2 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-gray-400" />
                  <span>{typeErrors[t.value]} Actual loans are still shown below.</span>
                </div>
              )}
              {(() => {
                const st = statsByType[t.value] || {};
                const tiles = [
                  {
                    label: `Projected, ${periodPhrase}`,
                    value: st.projectedTotal != null ? PHP_COMPACT(st.projectedTotal) : "—",
                    title: st.projectedTotal != null ? PHP(st.projectedTotal) : undefined,
                  },
                  {
                    label: "Busiest month (forecast)",
                    value: st.peak ? st.peak.fullLabel : "—",
                    sub: st.peak ? PHP_COMPACT(st.peak.predicted) : null,
                  },
                  {
                    label: "Actual loans filed",
                    value: PHP_COMPACT(st.actualTotal || 0),
                    title: PHP(st.actualTotal || 0),
                    sub: `${st.actualLoans || 0} loan${st.actualLoans === 1 ? "" : "s"}`,
                  },
                ];
                return (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                    {tiles.map((tile) => (
                      <div key={tile.label} className="rounded-lg bg-gray-50 px-3 py-2.5">
                        <p className="text-[11px] text-gray-500">{tile.label}</p>
                        <p className="text-lg font-bold text-gray-800 leading-tight" title={tile.title}>
                          {tile.value}
                          {tile.sub && <span className="ml-1.5 text-xs font-medium text-gray-500">{tile.sub}</span>}
                        </p>
                      </div>
                    ))}
                  </div>
                );
              })()}
              {(
                <div className="h-60">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={seriesByType[t.value]} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke="#eef2f7" vertical={false} />
                      <XAxis dataKey="label" axisLine={{ stroke: "#e5e7eb" }} tickLine={false} tick={{ fontSize: 11, fill: "#6b7280" }} />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 11, fill: "#6b7280" }}
                        tickFormatter={PHP_COMPACT}
                        width={56}
                        domain={[0, "auto"]}
                      />
                      <Tooltip content={makeTooltip(t)} />
                      {/* 95% drawn first so the narrower 80% band sits on top. */}
                      <Area
                        type="monotone"
                        dataKey="band95"
                        stroke="none"
                        fill={t.color}
                        fillOpacity={0.1}
                        connectNulls={false}
                        isAnimationActive={false}
                        activeDot={false}
                      />
                      <Area
                        type="monotone"
                        dataKey="band80"
                        stroke="none"
                        fill={t.color}
                        fillOpacity={0.18}
                        connectNulls={false}
                        isAnimationActive={false}
                        activeDot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="actual"
                        stroke={t.color}
                        strokeWidth={2}
                        dot={{ r: 4, strokeWidth: 2, stroke: "#fff", fill: t.color }}
                        activeDot={{ r: 5 }}
                        name={`${t.label} (actual)`}
                        connectNulls={false}
                        isAnimationActive={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="predicted"
                        stroke={t.color}
                        strokeWidth={2}
                        strokeDasharray="5 4"
                        dot={false}
                        activeDot={{ r: 5 }}
                        name={`${t.label} (forecast)`}
                        connectNulls={false}
                        isAnimationActive={false}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}
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

      <p className="mt-4 text-[10px] text-gray-400 flex items-start gap-1">
        <Info className="w-3 h-3 mt-0.5 shrink-0" />
        Actuals combine the historical loan dataset with every loan filed in the live system since, so new
        applications appear here as soon as they are recorded. Forecast values are SARIMA point estimates;
        the darker band is the 80% confidence interval and the lighter band the 95% interval — the ranges within
        which actual demand is expected to fall 80% and 95% of the time.
      </p>
    </div>
  );
};

export default LoanDemandForecastCard;
