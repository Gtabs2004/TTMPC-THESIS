import React, { useEffect, useMemo, useState } from "react";
import StaffSidebar from "../StaffSidebar";
import { bookkeeperNav } from "../StaffSidebar/configs/bookkeeper";
import { managerNav } from "../StaffSidebar/configs/manager";
import StaffTopbar from "../StaffTopbar";
import Breadcrumb from "../Breadcrumb";
import LoanNotificationBell from "../LoanNotificationBell";
import Pagination from "../Pagination";
import {
  Brain,
  RefreshCw,
  ArrowUpDown,
  X,
  AlertCircle,
  TrendingUp,
  TrendingDown,
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

// Presentation for each of the model's traffic-light bands.
//
// The band itself is decided by the backend, which reads its cut-offs from the
// model file. Do NOT reintroduce probability thresholds here: they are
// recomputed at every retraining, and the model's scores are low in absolute
// terms (most sit between 0.05 and 0.35), so an intuitive-looking 0.3/0.6 split
// would label every application low-risk.
const BAND_STYLES = {
  RED: { key: "high", label: "High Risk", chip: "bg-red-100 text-red-700", bar: "bg-red-500" },
  AMBER: { key: "watch", label: "Watch", chip: "bg-amber-100 text-amber-700", bar: "bg-amber-500" },
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
  LoanAmount: "Loan Amount",
  Term: "Term (months)",
  MonthlyDue: "Monthly Due",
  Dependents: "Dependents",
  OccTier: "Occupation Stability",
  Age: "Age",
  PriorLoans: "Previous Loans",
  PriorRefinances: "Previous Renewals",
  PriorBehind: "Previously Behind",
  PriorRestructured: "Previously Restructured",
  PriorPenalties: "Previous Penalties",
  PriorBorrowed: "Total Previously Borrowed",
  DebtGrowth: "Debt Growth",
  MonthsSinceLastLoan: "Months Since Last Loan",
  ConcurrentLoans: "Concurrent Loans",
  ShareCapital: "Share Capital (points)",
  Savings: "Savings Balance",
  HasTimeDeposit: "Has Time Deposit",
  SavingsChange: "Savings Change (yr)",
  Groceries: "Grocery Patronage (points)",
  HasSnapshot: "Has Financial Snapshot",
};

const featureLabel = (feat) => FEATURE_LABELS[feat] || feat;

// The model returns all 21 features ranked by impact. Showing every one buries
// the signal, so the detail panel lists the strongest drivers only.
const DRIVERS_SHOWN = 8;

const CreditRiskPage = ({ portal = "bookkeeper" }) => {
  const portalLabel = portal === "manager" ? "Manager" : "Bookkeeper";
  const navItems = portal === "manager" ? managerNav : bookkeeperNav;

  const [rows, setRows] = useState([]);
  const [modelInfo, setModelInfo] = useState(null);
  const [modelVersion, setModelVersion] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");

  const [search, setSearch] = useState("");
  const [bandFilter, setBandFilter] = useState("all");
  const [loanTypeFilter, setLoanTypeFilter] = useState("all");
  const [sortKey, setSortKey] = useState("risk_desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedLoan, setSelectedLoan] = useState(null);

  const fetchQueue = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/credit-risk/queue`);
      const json = await res.json();
      if (!res.ok || !json?.success) {
        throw new Error(json?.detail || "Failed to load credit risk queue.");
      }
      const data = json?.data || {};
      setRows(Array.isArray(data.rows) ? data.rows : []);
      setModelVersion(data.model_version || null);
      // Model metadata (accuracy, thresholds, operating point) is served
      // separately so it stays correct across retrainings without a redeploy.
      try {
        const infoRes = await fetch(`${API_BASE_URL}/api/risk/model-info`);
        if (infoRes.ok) {
          const infoJson = await infoRes.json();
          setModelInfo(infoJson?.data || null);
        }
      } catch {
        setModelInfo(null);
      }
      setLoadError("");
    } catch (err) {
      console.error("credit risk load failed", err);
      setLoadError(err?.message || "Unable to load credit risk data.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchQueue();
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

  const handleRefresh = () => {
    setRefreshing(true);
    fetchQueue();
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      <StaffSidebar portal={portalLabel} items={navItems} />

      <div className="flex-1 flex flex-col h-screen overflow-y-auto">
        <StaffTopbar
          portal={portalLabel}
          notifications={<LoanNotificationBell role={portal} />}
          search={{
            value: search,
            onChange: (e) => setSearch(e.target.value),
            placeholder: "Search member or loan ID...",
          }}
        />

        <main className="p-8">
          <Breadcrumb portal={portalLabel} page="Credit Risk" />

          <div className="flex items-start justify-between mb-6 gap-3 flex-wrap">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                Credit Risk Assessment
              </h2>
              <p className="text-sm text-gray-500 mt-0.5">
                Model-scored loan applications currently under review. Higher probability = higher predicted default risk.
              </p>
              {/* The model's credentials, stated plainly. Accuracy and the
                  active operating point come from the model file itself, so
                  they stay honest across retrainings. */}
              <div className="text-xs text-gray-600 mt-2 inline-flex flex-wrap items-center gap-x-2 gap-y-1 bg-indigo-50 border border-indigo-200 rounded-md px-2.5 py-1.5">
                <Brain size={12} className="text-indigo-600 shrink-0" />
                <span>
                  Model <span className="font-semibold text-indigo-800">v{modelVersion || "—"}</span>
                </span>
                {modelInfo?.roc_auc != null && (
                  <>
                    <span className="text-indigo-300">·</span>
                    <span>
                      ROC-AUC <span className="font-semibold text-indigo-800">{modelInfo.roc_auc}</span>
                    </span>
                  </>
                )}
                {modelInfo?.operating_points?.[modelInfo?.operating_point] && (
                  <>
                    <span className="text-indigo-300">·</span>
                    <span>
                      Reviewing the top{" "}
                      <span className="font-semibold text-indigo-800">
                        {Math.round(modelInfo.operating_points[modelInfo.operating_point].reviews_share * 100)}%
                      </span>
                      , catching{" "}
                      <span className="font-semibold text-indigo-800">
                        {Math.round(modelInfo.operating_points[modelInfo.operating_point].catches_share * 100)}%
                      </span>{" "}
                      of problem loans
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
            <button
              onClick={handleRefresh}
              disabled={refreshing || loading}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>

          {loadError ? (
            <div className="mb-6 rounded-lg border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">
              {loadError}
            </div>
          ) : null}

          {/* Summary bands */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {[
              { key: "high", label: "High Risk", subtitle: "≥ 60%", accent: "text-red-600", bg: "bg-red-50", ring: "border-red-200" },
              { key: "watch", label: "Watch", subtitle: "30% - 60%", accent: "text-amber-600", bg: "bg-amber-50", ring: "border-amber-200" },
              { key: "low", label: "Low Risk", subtitle: "< 30%", accent: "text-emerald-600", bg: "bg-emerald-50", ring: "border-emerald-200" },
              { key: "unknown", label: "Unscored", subtitle: "Model unavailable", accent: "text-gray-600", bg: "bg-gray-50", ring: "border-gray-200" },
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
                  {filteredRows.length} applicant{filteredRows.length === 1 ? "" : "s"}
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
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                  <tr>
                    <th className="text-left px-6 py-3 font-semibold">Applicant</th>
                    <th className="text-left px-6 py-3 font-semibold">Loan Type</th>
                    <th className="text-right px-6 py-3 font-semibold">Amount</th>
                    <th className="text-center px-6 py-3 font-semibold">Applied</th>
                    <th className="text-left px-6 py-3 font-semibold">
                      <div className="inline-flex items-center gap-1">
                        Risk Score <ArrowUpDown size={12} />
                      </div>
                    </th>
                  
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-10 text-center text-sm text-gray-400">
                        Loading model scores...
                      </td>
                    </tr>
                  ) : pagedRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-10 text-center text-sm text-gray-400">
                        No applicants match the current filters.
                      </td>
                    </tr>
                  ) : (
                    pagedRows.map((row) => {
                      const band = riskBand(row);
                      const topDrivers = (row.drivers || []).slice(0, 3);
                      return (
                        <tr
                          key={row.loan_id}
                          onClick={() => setSelectedLoan(row)}
                          className="hover:bg-gray-50 cursor-pointer"
                        >
                          <td className="px-6 py-4">
                            <div className="font-semibold text-gray-800">{row.member_name || "—"}</div>
                            <div className="text-xs text-gray-400 mt-0.5">{row.loan_id}</div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-xs font-semibold text-gray-700">{row.loan_type || "—"}</span>
                          </td>
                          <td className="px-6 py-4 text-right font-semibold text-gray-800">
                            {formatPeso(row.loan_amount)}
                          </td>
                          <td className="px-6 py-4 text-center text-xs text-gray-600">
                            {formatDate(row.application_date)}
                          </td>
                          <td className="px-6 py-4">
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
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Predicted Default Probability</p>
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

                    {/* What the cooperative does with this band, and what the
                        band historically meant. Both come from the backend so
                        the numbers stay the team's, not the UI's. */}
                    {selectedLoan.action && (
                      <div className="mt-4 rounded-lg bg-gray-50 border border-gray-200 p-3">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Recommended action</p>
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

            <div className="p-6">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">Feature Contributions</p>
              {(selectedLoan.drivers || []).length === 0 ? (
                <p className="text-sm text-gray-400 italic">
                  {selectedLoan.error || "No attribution available for this applicant."}
                </p>
              ) : (
                <ul className="space-y-4">
                  {(selectedLoan.drivers || []).slice(0, DRIVERS_SHOWN).map((d) => {
                    // A null value means the cooperative has no record of this
                    // feature for the applicant. That is not a zero, and must
                    // not be rendered as one — the model treats the two
                    // differently and so should the reviewer.
                    const recorded = d.value != null;
                    const bump = recorded ? d.value - d.cohort_median : null;
                    const bumpPct =
                      recorded && d.cohort_median !== 0
                        ? (bump / Math.abs(d.cohort_median)) * 100
                        : 0;
                    const arrow = d.direction === "up" ? TrendingUp : d.direction === "down" ? TrendingDown : null;
                    const color = d.direction === "up" ? "text-red-600" : d.direction === "down" ? "text-emerald-600" : "text-gray-500";
                    return (
                      <li key={d.feature} className="flex flex-col gap-1">
                        <div className="flex justify-between items-baseline">
                          <div className="flex items-center gap-1.5">
                            {arrow ? React.createElement(arrow, { size: 14, className: color }) : null}
                            <span className="font-semibold text-gray-800 text-sm">{featureLabel(d.feature)}</span>
                          </div>
                          <span className={`text-xs font-bold ${color}`}>
                            {d.contribution > 0 ? "+" : ""}
                            {d.contribution.toFixed(3)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <span>
                            Applicant:{" "}
                            <span className="font-semibold text-gray-700">
                              {recorded
                                ? Number(d.value).toLocaleString("en-PH", { maximumFractionDigits: 2 })
                                : "not recorded"}
                            </span>
                          </span>
                          <span>·</span>
                          <span>Cohort median: <span className="font-semibold text-gray-700">{Number(d.cohort_median).toLocaleString("en-PH", { maximumFractionDigits: 2 })}</span></span>
                        </div>
                        <div className="text-[11px] text-gray-400">
                          {!recorded
                            ? "no record on file — scored as unknown"
                            : bump === 0
                            ? "matches cohort"
                            : `${bump > 0 ? "above" : "below"} cohort by ${Math.abs(bumpPct).toFixed(0)}%`}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="p-6 border-t border-gray-100 bg-gray-50">
              <p className="text-[11px] text-gray-500 leading-relaxed">
                Signed contributions show each feature's push on the model's log-odds output.{" "}
                <span className="text-red-600 font-semibold">Positive</span> = pushes score UP (higher risk).{" "}
                <span className="text-emerald-700 font-semibold">Negative</span> = pushes score DOWN (lower risk). Attribution
                method depends on the underlying model — the UI stays constant even when the PKL is swapped.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CreditRiskPage;
