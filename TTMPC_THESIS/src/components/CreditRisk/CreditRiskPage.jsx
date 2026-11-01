import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../supabaseClient";
import { useRealtimeRefetch } from "../../hooks/useRealtimeRefetch";
import { RT } from "../../lib/realtimeSync";
import { cachedFetch, getCached, invalidateCache } from "../../utils/pageCache";
import StaffSidebar from "../StaffSidebar";
import { bookkeeperNav } from "../StaffSidebar/configs/bookkeeper";
import { managerNav } from "../StaffSidebar/configs/manager";
import { bodNav } from "../StaffSidebar/configs/bod";
import StaffTopbar from "../StaffTopbar";
import LoanNotificationBell from "../LoanNotificationBell";
import Pagination from "../Pagination";
import TableStateRow from "../TableStateRow";
import {
  Brain,
  ArrowUpDown,
  X,
  AlertCircle,
  Inbox,
  Info,
} from "lucide-react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";
const ITEMS_PER_PAGE = 8;

const PESO = "₱";

const formatPeso = (value) =>
  `${PESO}${Number(value || 0).toLocaleString("en-PH", { maximumFractionDigits: 0 })}`;

const formatDate = (value) =>
  value
    ? new Date(value).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" })
    : "—";

const formatPct = (p) => (p == null ? "—" : `${(Number(p) * 100).toFixed(1)}%`);

const getModelThreshold = (modelInfo, key) => {
  const value = modelInfo?.thresholds?.[key];
  if (value == null || !Number.isFinite(Number(value))) return null;
  const threshold = Number(value);
  return threshold >= 0 && threshold <= 1 ? threshold : null;
};

// Presentation for each of the model's traffic-light bands.
//
// The band itself is decided by the backend, which reads its cut-offs from the
// model file. Do NOT reintroduce probability thresholds here: they are
// recomputed at every retraining, and the model's scores are low in absolute
// terms (most sit between 0.05 and 0.35), so an intuitive-looking 0.3/0.6 split
// would label every application low-risk.
const BAND_STYLES = {
  RED: { key: "high", label: "High Risk", chip: "bg-red-100 text-red-700", bar: "bg-red-500" },
  AMBER: { key: "watch", label: "Medium Risk", chip: "bg-amber-50 text-amber-700 ring-1 ring-amber-200", bar: "bg-amber-500" },
  GREEN: { key: "low", label: "Low Risk", chip: "bg-emerald-100 text-emerald-700", bar: "bg-emerald-500" },
};

const UNKNOWN_BAND = { key: "unknown", label: "Unavailable", chip: "bg-gray-100 text-gray-700", bar: "bg-gray-300" };

// Takes the scored row (not a bare probability) so the band travels with the
// server's decision.
const riskBand = (row) => {
  if (!row || row.band == null) return UNKNOWN_BAND;
  return BAND_STYLES[row.band] || UNKNOWN_BAND;
};

// Human-readable labels for the model's feature names. Keeps the UI clean
// without hardcoding the feature list — new features just show their raw
// name if we forget to add a label.
const FEATURE_LABELS = {
  LoanAmount: "Principal (LoanAmount)",
  MonthlyDue: "Monthly Amortization (MonthlyDue)",
  Savings: "Savings Balance (Savings)",
  ShareCapital: "Share Capital Points (ShareCapital)",
  Age: "Borrower Age (Age)",
  Term: "Loan Term (Term)",
  PriorBorrowed: "Total Previously Borrowed (PriorBorrowed)",
  DebtGrowth: "Loan Amount Growth (DebtGrowth)",
  MonthsSinceLastLoan: "Months Since Last Loan",
  Groceries: "Grocery Patronage Points (Groceries)",
  PriorRestructured: "Amount of Restructured (PriorRestructured)",
  PriorBehind: "Number of Late Payments (PriorBehind)",
  Dependents: "Number of Dependents (Dependents)",
  OccTier: "Job Stability Tier (OccTier)",
  ConcurrentLoans: "Other Active Loans (ConcurrentLoans)",
  PriorLoans: "Previous Loans Count (PriorLoans)",
  PriorRefinances: "Previous Renewals (PriorRefinances)",
  PriorPenalties: "Number of Penalties (PriorPenalties)",
  HasTimeDeposit: "Has Time Deposit",
  SavingsChange: "Annual Savings Growth (SavingsChange)",
  HasSnapshot: "Has Financial History (HasSnapshot)",
};

const featureLabel = (feat) => FEATURE_LABELS[feat] || feat;

const renderSplitFeatureLabel = (feat) => {
  const fullLabel = FEATURE_LABELS[feat] || feat;
  const match = fullLabel.match(/^(.*?)\s*(\(.*?\))$/);
  if (match) {
    return (
      <span className="block leading-tight">
        <span className="block">{match[1]}</span>
        <span className="block text-[9px] text-gray-400 font-normal tracking-normal">{match[2]}</span>
      </span>
    );
  }
  return <span className="block leading-tight">{fullLabel}</span>;
};

// Small "?" hover hint that explains a label in plain words.
const InfoTip = ({ text }) => (
  <span title={text} aria-label={text} className="inline-flex cursor-help align-middle ml-1 text-gray-400">
    <Info size={12} />
  </span>
);

// Plain-language summary lists ordered by each feature's contribution.
const summarizeDrivers = (drivers) => {
  const byStrength = (dir) =>
    (drivers || [])
      .filter((d) => d.direction === dir && Number.isFinite(Number(d.contribution)))
      .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
      .map((d) => featureLabel(d.feature));
  return { decreaseRisk: byStrength("down"), increaseRisk: byStrength("up") };
};

// Plain-word rating for the assessment's ranking accuracy (ROC-AUC, 0-1).
const accuracyRating = (auc) => (auc >= 0.8 ? "Strong" : auc >= 0.7 ? "Fair" : "Limited");

const CreditRiskPage = ({ portal = "bookkeeper" }) => {
  const portalLabel = portal === "manager" ? "Manager" : portal === "bod" ? "BOD" : "Bookkeeper";
  const navItems = portal === "manager" ? managerNav : portal === "bod" ? bodNav : bookkeeperNav;

  const [rows, setRows] = useState(() => getCached("credit_risk_queue_data")?.rows || []);
  const [modelInfo, setModelInfo] = useState(() => getCached("credit_risk_model_info") || null);
  const [modelVersion, setModelVersion] = useState(() => getCached("credit_risk_queue_data")?.modelVersion || null);
  const [loading, setLoading] = useState(() => !getCached("credit_risk_queue_data"));
  const [loadError, setLoadError] = useState("");

  const [search, setSearch] = useState("");
  const [bandFilter, setBandFilter] = useState("all");
  const [loanTypeFilter, setLoanTypeFilter] = useState("all");
  const [sortKey, setSortKey] = useState("risk_desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedLoan, setSelectedLoan] = useState(null);
  const [attributionLoading, setAttributionLoading] = useState(false);
  const [attributionError, setAttributionError] = useState("");

  const fetchQueue = async ({ silent = false, force = false } = {}) => {
    if (force) {
      invalidateCache("credit_risk_queue_data");
      invalidateCache("credit_risk_model_info");
    }
    const hasCache = !!getCached("credit_risk_queue_data");
    if (!silent && !hasCache) setLoading(true);
    try {
      const data = await cachedFetch("credit_risk_queue_data", async () => {
        const res = await fetch(`${API_BASE_URL}/api/credit-risk/queue`);
        const json = await res.json();
        if (!res.ok || !json?.success) {
          throw new Error(json?.detail || "Failed to load credit risk queue.");
        }
        const d = json?.data || {};
        return {
          rows: Array.isArray(d.rows) ? d.rows : [],
          modelVersion: d.model_version || null,
        };
      }, 120_000);
      setRows(data.rows);
      setModelVersion(data.modelVersion);

      // Model metadata (accuracy, thresholds, operating point) is served
      // separately so it stays correct across retrainings without a redeploy.
      try {
        const infoData = await cachedFetch("credit_risk_model_info", async () => {
          const infoRes = await fetch(`${API_BASE_URL}/api/risk/model-info`);
          const infoJson = await infoRes.json();
          if (!infoRes.ok || !infoJson?.success || !infoJson?.data) {
            throw new Error(infoJson?.detail || "Failed to load credit risk model thresholds.");
          }
          return infoJson.data;
        }, 120_000);
        setModelInfo(infoData);
      } catch (err) {
        console.error("credit risk model info load failed", err);
      }
      if (!silent) setLoadError("");
    } catch (err) {
      if (silent) return;
      console.error("credit risk load failed", err);
      setLoadError(err?.message || "Unable to load credit risk data.");
    } finally {
      if (!silent) setLoading(false);
    }
  };
  useRealtimeRefetch(RT.LOANS, () => fetchQueue({ silent: true, force: true }));

  useEffect(() => {
    fetchQueue({ silent: !!getCached("credit_risk_queue_data") });
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, bandFilter, loanTypeFilter, sortKey]);

  const loanTypes = useMemo(() => {
    const set = new Set();
    rows.forEach((r) => r.loan_type && set.add(r.loan_type));
    return Array.from(set).sort();
  }, [rows]);

  const summary = useMemo(() => {
    const base = { high: 0, watch: 0, low: 0, unknown: 0 };
    rows.forEach((r) => {
      const band = riskBand(r);
      base[band.key] = (base[band.key] || 0) + 1;
    });
    return { ...base, total: rows.length };
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = rows.filter((r) => {
      const band = riskBand(r);
      if (bandFilter !== "all" && band.key !== bandFilter) return false;
      if (loanTypeFilter !== "all" && r.loan_type !== loanTypeFilter) return false;
      if (!q) return true;
      return (
        String(r.member_name || "").toLowerCase().includes(q) ||
        String(r.loan_id || "").toLowerCase().includes(q)
      );
    });

    switch (sortKey) {
      case "risk_desc":
        list = list.sort((a, b) => (b.probability ?? -1) - (a.probability ?? -1));
        break;
      case "risk_asc":
        list = list.sort((a, b) => (a.probability ?? 2) - (b.probability ?? 2));
        break;
      case "amount_desc":
        list = list.sort((a, b) => Number(b.loan_amount || 0) - Number(a.loan_amount || 0));
        break;
      case "name_asc":
        list = list.sort((a, b) => String(a.member_name || "").localeCompare(String(b.member_name || "")));
        break;
      default:
        break;
    }
    return list;
  }, [rows, search, bandFilter, loanTypeFilter, sortKey]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / ITEMS_PER_PAGE));
  const pagedRows = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredRows.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredRows, currentPage]);

  const openLoanDetails = async (row) => {
    setSelectedLoan(row);
    setAttributionLoading(false);
    setAttributionError("");

    if (row.share_capital_amount == null && row.membership_id) {
      supabase
        .from("member")
        .select("share_capital_amount")
        .eq("membership_id", row.membership_id)
        .maybeSingle()
        .then(({ data }) => {
          if (data?.share_capital_amount != null) {
            setSelectedLoan((current) =>
              current?.loan_id === row.loan_id
                ? { ...current, share_capital_amount: Number(data.share_capital_amount) }
                : current
            );
          }
        });
    }

    if (row.probability == null || row.drivers?.length) return;

    setAttributionLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/risk/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          loan_control_number: row.loan_id,
          source: row.source || "loans",
          attribution_only: true,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.detail || "Could not load the score explanation.");
      }
      if (payload?.attribution_available && Array.isArray(payload.drivers)) {
        setSelectedLoan((current) =>
          current?.loan_id === row.loan_id ? { ...current, ...payload } : current
        );
      } else {
        setAttributionError(payload?.attribution_error || "An explanation matching this saved score is unavailable.");
      }
    } catch (error) {
      console.error("Credit risk attribution load failed:", error);
      setAttributionError(error?.message || "Could not load the score explanation.");
    } finally {
      setAttributionLoading(false);
    }
  };

  const greenAmberThreshold = getModelThreshold(modelInfo, "green_amber");
  const amberRedThreshold = getModelThreshold(modelInfo, "amber_red");
  const thresholdUnavailableLabel = loading ? "Loading threshold..." : "Threshold unavailable";

  return (
    <div className="flex min-h-screen bg-gray-50">
      <StaffSidebar portal={portalLabel} items={navItems} />

      <div className="flex-1 min-w-0 flex flex-col h-screen overflow-y-auto">
        <StaffTopbar
          portal={portalLabel}
          notifications={<LoanNotificationBell role={portal} />}
          search={{
            value: search,
            onChange: (e) => setSearch(e.target.value),
            placeholder: "Search member or loan ID...",
          }}
        />

        <main className="animate-page-in p-8">

          <div className="flex items-start justify-between mb-6 gap-3 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                Credit Risk Assessment
              </h1>
              <p className="text-sm text-gray-500 mt-0.5">
                Applications remain visible through approval and disbursement, then leave the queue when released. New and in-review applications are scored automatically.
              </p>
              {/* The model's credentials, stated plainly. Accuracy and the
                  active operating point come from the model file itself, so
                  they stay honest across retrainings. */}
              <div className="text-xs text-gray-600 mt-2 inline-flex flex-wrap items-center gap-x-2 gap-y-1 bg-indigo-50 border border-indigo-200 rounded-md px-2.5 py-1.5">
                <Brain size={12} className="text-indigo-600 shrink-0" />
                <span>
                  Assessment <span className="font-semibold text-indigo-800">v{modelVersion || "—"}</span>
                  <InfoTip text="Which edition of the credit assessment produced these results, so older and newer results can be told apart." />
                </span>
                {modelInfo?.roc_auc != null && (
                  <>
                    <span className="text-indigo-300">·</span>
                    <span>
                      Ranking Accuracy{" "}
                      <span className="font-semibold text-indigo-800">
                        {Math.round(modelInfo.roc_auc * 100)}% · {accuracyRating(modelInfo.roc_auc)}
                      </span>
                      <InfoTip text="How well the assessment tells loans that were repaid apart from loans that ran into trouble in our past records." />
                    </span>
                  </>
                )}
                {modelInfo?.operating_points?.[modelInfo?.operating_point] && (
                  <>
                    <span className="text-indigo-300">·</span>
                    <span>
                      Review Cut-off: closer review for the top{" "}
                      <span className="font-semibold text-indigo-800">
                        {Math.round(modelInfo.operating_points[modelInfo.operating_point].reviews_share * 100)}%
                      </span>
                      of scores, which would have caught{" "}
                      <span className="font-semibold text-indigo-800">
                        {Math.round(modelInfo.operating_points[modelInfo.operating_point].catches_share * 100)}%
                      </span>{" "}
                      of past problem loans
                      <InfoTip text="Applications scoring at or above this cut-off are flagged for closer review before approval." />
                    </span>
                  </>
                )}
              </div>
              {modelInfo?.limits && (
                <p className="text-[11px] text-gray-400 italic mt-1.5 max-w-2xl">
                  {modelInfo.limits} A score never denies an application — it routes it for review.
                </p>
              )}
            </div>
          </div>

          {loadError ? (
            <div className="mb-6 rounded-lg border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">
              {loadError}
            </div>
          ) : null}

          {/* Summary bands */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {[
              {
                key: "high",
                label: "High Risk",
                subtitle: amberRedThreshold == null ? thresholdUnavailableLabel : `≥ ${formatPct(amberRedThreshold)}`,
                accent: "text-red-600",
                bg: "bg-red-50",
                ring: "border-red-200",
              },
              {
                key: "watch",
                label: "Medium Risk",
                subtitle: greenAmberThreshold == null || amberRedThreshold == null || greenAmberThreshold >= amberRedThreshold
                  ? thresholdUnavailableLabel
                  : `≥ ${formatPct(greenAmberThreshold)} and < ${formatPct(amberRedThreshold)}`,
                accent: "text-amber-600",
                bg: "bg-amber-50",
                ring: "border-amber-200",
              },
              {
                key: "low",
                label: "Low Risk",
                subtitle: greenAmberThreshold == null ? thresholdUnavailableLabel : `< ${formatPct(greenAmberThreshold)}`,
                accent: "text-emerald-600",
                bg: "bg-emerald-50",
                ring: "border-emerald-200",
              },
              { key: "unknown", label: "Unscored", subtitle: "Not yet assessed", accent: "text-gray-600", bg: "bg-gray-50", ring: "border-gray-200" },
            ].map((b) => (
              <button
                key={b.key}
                onClick={() => setBandFilter(bandFilter === b.key ? "all" : b.key)}
                className={`text-left bg-white rounded-xl p-5 shadow-sm border ${
                  bandFilter === b.key ? `${b.ring} ring-2 ring-offset-1` : "border-gray-100"
                } hover:shadow-md transition`}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-gray-500 text-sm font-medium">{b.label}</span>
                    <p className={`text-xs mt-0.5 font-semibold ${b.accent}`}>{b.subtitle}</p>
                  </div>
                  <div className={`p-2 ${b.bg} ${b.accent} rounded-lg`}>
                    <AlertCircle size={18} />
                  </div>
                </div>
                <div className="mt-4">
                  <h3 className="text-3xl font-bold text-gray-800">{loading ? "..." : summary[b.key] || 0}</h3>
                  <div className="mt-2 text-xs text-gray-500">
                    {summary.total > 0
                      ? `${((100 * (summary[b.key] || 0)) / summary.total).toFixed(1)}% of queue`
                      : "no queue"}
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h3 className="text-gray-800 font-bold text-lg">Applicant Queue</h3>
                <p className="text-gray-400 text-xs">
                  {filteredRows.length} application{filteredRows.length === 1 ? "" : "s"}
                  {bandFilter !== "all" ? ` · filtered by ${bandFilter}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={loanTypeFilter}
                  onChange={(e) => setLoanTypeFilter(e.target.value)}
                  className="rounded-md border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-200"
                >
                  <option value="all">All loan types</option>
                  {loanTypes.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <select
                  value={sortKey}
                  onChange={(e) => setSortKey(e.target.value)}
                  className="rounded-md border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-200"
                >
                  <option value="risk_desc">Sort: Risk (high→low)</option>
                  <option value="risk_asc">Sort: Risk (low→high)</option>
                  <option value="amount_desc">Sort: Loan amount (high→low)</option>
                  <option value="name_asc">Sort: Member (A→Z)</option>
                </select>
                {bandFilter !== "all" && (
                  <button
                    onClick={() => setBandFilter("all")}
                    className="text-xs text-green-700 font-semibold hover:underline"
                  >
                    Clear band filter
                  </button>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-primary-deep text-[10px] uppercase tracking-wider text-white font-extrabold">
                    <th className="p-5 font-bold text-left">Applicant</th>
                    <th className="p-5 font-bold text-left">Loan Type</th>
                    <th className="p-5 font-bold text-left">Status</th>
                    <th className="p-5 font-bold text-right">Amount</th>
                    <th className="p-5 font-bold text-center">Applied</th>
                    <th className="p-5 font-bold">
                      <div className="inline-flex items-center gap-1">
                        Risk Score <ArrowUpDown size={12} />
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <TableStateRow colSpan={6} variant="loading" label="Loading risk scores..." />
                  ) : pagedRows.length === 0 ? (
                    <TableStateRow colSpan={6} variant="empty" icon={Inbox} label="No applications match the current filters." />
                  ) : (
                    pagedRows.map((row) => {
                      const band = riskBand(row);
                      return (
                        <tr
                          key={row.loan_id}
                          onClick={() => openLoanDetails(row)}
                          className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors cursor-pointer"
                        >
                          <td className="p-5">
                            <div className="font-semibold text-gray-800">{row.member_name || "—"}</div>
                            <div className="text-xs text-gray-400 mt-0.5">{row.loan_id}</div>
                          </td>
                          <td className="p-5">
                            <span className="text-xs font-semibold text-gray-700">{row.loan_type || "—"}</span>
                          </td>
                          <td className="p-5">
                            <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold capitalize text-gray-700">
                              {String(row.application_status || "status unavailable").replaceAll("_", " ")}
                            </span>
                          </td>
                          <td className="p-5 text-right font-semibold text-gray-800">
                            {formatPeso(row.loan_amount)}
                          </td>
                          <td className="p-5 text-center text-xs text-gray-600">
                            {formatDate(row.application_date)}
                          </td>
                          <td className="p-5">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 min-w-[80px] h-2 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                  className={`h-full ${band.bar}`}
                                  style={{ width: `${row.probability != null ? Math.min(100, row.probability * 100) : 0}%` }}
                                />
                              </div>
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold ${band.chip}`}>
                                {formatPct(row.probability)}
                              </span>
                            </div>
                            <p className={`text-[11px] font-semibold mt-1 ${band.chip.includes("red") ? "text-red-600" : band.chip.includes("amber") ? "text-amber-600" : band.chip.includes("emerald") ? "text-emerald-600" : "text-gray-500"}`}>
                              {band.label}
                            </p>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {filteredRows.length > ITEMS_PER_PAGE && (
              <Pagination page={currentPage} totalPages={totalPages} onChange={setCurrentPage} />
            )}
          </div>
        </main>
      </div>

      {/* Drawer: full driver breakdown */}
      {selectedLoan && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setSelectedLoan(null)}>
          <div className="absolute inset-0 bg-black/30" />
          <div
            className="relative bg-white w-full max-w-md h-full shadow-2xl overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-gray-100 flex justify-between items-start">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Credit Risk Detail</p>
                <h3 className="text-xl font-bold text-gray-800 mt-1">{selectedLoan.member_name}</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {selectedLoan.loan_id} · {selectedLoan.loan_type} · {formatPeso(selectedLoan.loan_amount)}
                </p>
              </div>
              <button
                onClick={() => setSelectedLoan(null)}
                className="p-1 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 border-b border-gray-100">
              {(() => {
                const band = riskBand(selectedLoan);
                return (
                  <>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Risk Score
                      <InfoTip text="Our overall rating of how likely this loan is to run into repayment trouble. Higher means more risk." />
                    </p>
                    <div className="flex items-baseline gap-2 mt-1">
                      <span className="text-4xl font-bold text-gray-800">{formatPct(selectedLoan.probability)}</span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold ${band.chip}`}>
                        {band.label}
                      </span>
                    </div>
                    <div className="mt-3 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${band.bar}`}
                        style={{ width: `${selectedLoan.probability != null ? Math.min(100, selectedLoan.probability * 100) : 0}%` }}
                      />
                    </div>

                    {/* Plain-language summary: why the score is what it is. */}
                    {(() => {
                      const { decreaseRisk, increaseRisk } = summarizeDrivers(selectedLoan.drivers);
                      if (decreaseRisk.length === 0 && increaseRisk.length === 0) return null;
                      return (
                        <div className="mt-4 rounded-lg border border-gray-200 bg-white p-3 space-y-2">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Summary</p>
                          {decreaseRisk.length > 0 && (
                            <p className="text-sm text-gray-700">
                              <span className="font-semibold text-emerald-700">Decrease Risk: </span>
                              {decreaseRisk.join(", ")}.
                            </p>
                          )}
                          {increaseRisk.length > 0 && (
                            <p className="text-sm text-gray-700">
                              <span className="font-semibold text-red-600">Increase Risk: </span>
                              {increaseRisk.join(", ")}.
                            </p>
                          )}
                        </div>
                      );
                    })()}

                    {/* What the cooperative does with this band, and what the
                        band historically meant. Both come from the backend so
                        the numbers stay the team's, not the UI's. */}
                    {selectedLoan.action && (
                      <div className="mt-4 rounded-lg bg-gray-50 border border-gray-200 p-3">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Suggested next step</p>
                        <p className="text-sm font-semibold text-gray-800 mt-0.5">{selectedLoan.action}</p>
                        {selectedLoan.band_bad_rate_per_100 != null && (
                          <p className="text-[11px] text-gray-500 mt-2">
                            Historically about{" "}
                            <span className="font-semibold text-gray-700">
                              {selectedLoan.band_bad_rate_per_100} in 100
                            </span>{" "}
                            loans in this band ran into trouble
                            {selectedLoan.band_share != null && (
                              <>, and the band covers roughly{" "}
                                <span className="font-semibold text-gray-700">
                                  {Math.round(selectedLoan.band_share * 100)}%
                                </span>{" "}
                                of applications
                              </>
                            )}
                            .
                          </p>
                        )}
                      </div>
                    )}

                    {/* Handoff rule: a score routes an application, it never
                        denies one. Stated wherever a score is shown. */}
                    <p className="text-[11px] text-gray-400 italic mt-3">
                      This score routes the application for review. It is not grounds for
                      denial — every member retains the right to apply.
                    </p>
                  </>
                );
              })()}
            </div>

            {(() => {
              const allDrivers = selectedLoan.drivers || [];
              if (allDrivers.length === 0) {
                return (
                  <div className="p-6">
                    <p className="text-sm text-gray-400 italic">
                      {attributionLoading
                        ? "Loading score explanation..."
                        : attributionError || selectedLoan.error || "No attribution available for this applicant."}
                    </p>
                  </div>
                );
              }

              const shown = allDrivers.filter(
                (driver) => driver.direction === "up" || driver.direction === "down"
              );
              const maxAbs = Math.max(...shown.map((driver) => Math.abs(Number(driver.contribution) || 0)), 1e-9);

              const formatValue = (feature, value) => {
                if (value == null) return "not recorded";
                const num = Number(value);
                if (
                  feature === "LoanAmount" ||
                  feature === "MonthlyDue" ||
                  feature === "Savings" ||
                  feature === "PriorBorrowed" ||
                  feature === "SavingsChange"
                ) {
                  return formatPeso(num);
                }
                if (feature === "Age") {
                  return `${Math.round(num)} yrs`;
                }
                if (feature === "Term" || feature === "MonthsSinceLastLoan") {
                  return `${Math.round(num)} mos`;
                }
                if (feature === "DebtGrowth") {
                  return `${num.toFixed(2)}x`;
                }
                if (feature === "HasTimeDeposit") {
                  return num === 1 ? "Yes" : num === 0 ? "No" : "not recorded";
                }
                if (feature === "ShareCapital") {
                  const pts = Math.round(num);
                  const cbu = selectedLoan?.share_capital_amount;
                  return cbu != null ? `${pts} pts (${formatPeso(cbu)})` : `${pts} pts`;
                }
                if (feature === "Groceries") {
                  const pts = Math.round(num);
                  const bracket = pts <= 3 ? "≤ ₱20k" : pts <= 5 ? "₱20k–₱30k" : pts <= 7 ? "₱30k–₱40k" : "> ₱40k";
                  return `${pts} pts (${bracket} spent)`;
                }
                return String(Math.round(num * 100) / 100);
              };

              return (
                <div className="p-6 space-y-6">
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
                      Values the model read
                    </p>
                    {shown.length === 0 ? (
                      <p className="text-xs text-gray-400 italic">
                        No individual variables contributed significantly to shifting this score.
                      </p>
                    ) : (
                      <div className="grid grid-cols-2 gap-x-4 gap-y-3.5 text-sm">
                        {shown.map((driver) => (
                          <div key={driver.feature} className="space-y-0.5">
                            <div className="text-[10px] text-gray-400 uppercase">
                              {renderSplitFeatureLabel(driver.feature)}
                            </div>
                            <p className="font-semibold text-gray-800">
                              {formatValue(driver.feature, driver.value)}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
                      Risk variables
                    </p>
                    {shown.length === 0 ? (
                      <p className="text-xs text-gray-400 italic">
                        No individual variables contributed significantly to shifting this score.
                      </p>
                    ) : (
                      <>
                        <div className="space-y-2.5">
                          {shown.map((driver) => {
                            const contribution = Number(driver.contribution) || 0;
                            const pct = (Math.abs(contribution) / maxAbs) * 100;
                            const isUp = driver.direction === "up";
                            const barColor = isUp ? "bg-red-400" : "bg-green-500";
                            const tagColor = isUp ? "text-red-600" : "text-green-700";
                            return (
                              <div key={driver.feature}>
                                <div className="flex items-center justify-between mb-0.5 gap-2">
                                  <span className="text-xs text-gray-700 font-medium">
                                    {featureLabel(driver.feature)}
                                  </span>
                                  <span className={`text-[10px] font-bold uppercase shrink-0 ${tagColor}`}>
                                    {isUp ? "Increase Risk" : "Decrease Risk"}
                                  </span>
                                </div>
                                <div className="w-full bg-gray-100 rounded-full h-1.5">
                                  <div
                                    className={`${barColor} h-1.5 rounded-full`}
                                    style={{ width: `${pct.toFixed(1)}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <p className="text-[11px] text-gray-400 mt-3">
                          Red bars indicate Increase Risk and green bars indicate Decrease Risk. Longer bars indicate a stronger contribution.
                        </p>
                      </>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
};

export default CreditRiskPage;
