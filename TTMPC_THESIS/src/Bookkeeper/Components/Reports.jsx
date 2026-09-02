import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { StatCard, StatCardRow } from "../../components/StatCard";
import StaffSidebar from "../../components/StaffSidebar";
import { bookkeeperNav } from "../../components/StaffSidebar/configs/bookkeeper";
import { UserAuth } from "../../contex/AuthContext";
import { useNotification } from "../../contex/NotificationContext";
import StaffTopbar from "../../components/StaffTopbar";
import LoanNotificationBell from "../../components/LoanNotificationBell";
import Breadcrumb from "../../components/Breadcrumb";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  LayoutDashboard,
  Users,
  FileText,
  CreditCard,
  Calculator,
  Activity,
  BarChart3,
  History,
  Search,
  Download,
  ArrowUpRight,
  ArrowDownRight,
  Landmark,
  Wallet,
  BookOpen,
  CircleDollarSign,
  Briefcase,
  Coins,
  PiggyBank,
  ChevronDown,
  ChevronRight,
  Brain,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Clock,
  XCircle,
} from "lucide-react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

const BRAND = {
  dark: "#14532d",
  primary: "#166534",
  mid: "#16a34a",
  light: "#22c55e",
  pale: "#bbf7d0",
  bg: "#f0fdf4",
};

const PIE_COLORS = ["#166534", "#16a34a", "#22c55e", "#4ade80", "#86efac", "#bbf7d0"];

function fmt(n) {
  if (n === undefined || n === null) return "—";
  return "₱" + Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// jsPDF's built-in Helvetica font has no ₱ (U+20B1) glyph — it silently
// substitutes a fallback character instead of throwing, which is why the
// exported PDF showed "±" everywhere a peso amount should be. Use "PHP "
// for anything written into the PDF; `fmt()` above stays ₱ for on-screen
// rendering, which renders fine in the browser. Same pattern already used
// in Loan-Ledger.jsx and Member_StatementOfAccount.jsx's PDF exports.
function fmtPdf(n) {
  if (n === undefined || n === null) return "—";
  return "PHP " + Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function pct(n) {
  return (Number(n) || 0).toFixed(2) + "%";
}


// ─── Custom Tooltip ──────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label, prefix = "₱" }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-100 shadow-lg rounded-lg px-3 py-2 text-xs">
      <p className="font-bold text-gray-700 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }} className="font-medium">
          {p.name}: {prefix}{Number(p.value).toLocaleString("en-PH", { minimumFractionDigits: 2 })}
        </p>
      ))}
    </div>
  );
};

const CountTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-100 shadow-lg rounded-lg px-3 py-2 text-xs">
      <p className="font-bold text-gray-700 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }} className="font-medium">
          {p.name}: {Number(p.value).toLocaleString()}
        </p>
      ))}
    </div>
  );
};

// ─── PDF generation ──────────────────────────────────────────────────────────
function generateExecutivePDF(data, generatedAt) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 14;

  // Header bar
  doc.setFillColor(22, 101, 52);
  doc.rect(0, 0, pageW, 28, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("TTMPC — Bookkeeper Executive Report", pageW / 2, 12, { align: "center" });
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("Tubungan Teachers' Multi-Purpose Cooperative", pageW / 2, 19, { align: "center" });
  const genDate = generatedAt ? new Date(generatedAt).toLocaleString("en-PH") : new Date().toLocaleString("en-PH");
  doc.text(`Generated: ${genDate}`, pageW / 2, 25, { align: "center" });

  doc.setTextColor(30, 41, 59);
  let y = 36;

  // KPI section
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(22, 101, 52);
  doc.text("KEY PERFORMANCE INDICATORS", margin, y);
  y += 6;

  const kpi = data.kpi || {};
  const kpiRows = [
    ["Total Loan Portfolio", fmtPdf(kpi.total_loan_portfolio)],
    ["Total Share Capital (CBU)", fmtPdf(kpi.total_share_capital)],
    ["Total Savings Balance", fmtPdf(kpi.total_savings)],
    ["Active Members", (kpi.active_members ?? "—").toString()],
    ["Total Members", (kpi.total_members ?? "—").toString()],
    ["Active Loans", (kpi.active_loan_count ?? "—").toString()],
    ["Fully Paid Loans", (kpi.fully_paid_count ?? "—").toString()],
    ["Delinquency Rate", pct(kpi.delinquency_rate)],
    ["Total Penalties Collected", fmtPdf(kpi.total_penalties_collected)],
  ];

  autoTable(doc, {
    startY: y,
    head: [["Metric", "Value"]],
    body: kpiRows,
    theme: "grid",
    headStyles: { fillColor: [22, 101, 52], textColor: 255, fontStyle: "bold", fontSize: 9 },
    bodyStyles: { fontSize: 9, textColor: [30, 41, 59] },
    alternateRowStyles: { fillColor: [240, 253, 244] },
    columnStyles: { 1: { halign: "right", fontStyle: "bold" } },
    margin: { left: margin, right: margin },
  });

  y = doc.lastAutoTable.finalY + 8;

  // Loan type distribution
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(22, 101, 52);
  doc.text("LOAN TYPE DISTRIBUTION (ACTIVE LOANS)", margin, y);
  y += 4;

  const distRows = (data.loan_type_distribution || []).map((d) => [
    d.name,
    d.count.toString(),
    fmtPdf(d.total_amount),
    d.count > 0 && kpi.active_loan_count
      ? pct((d.count / kpi.active_loan_count) * 100)
      : "0.00%",
  ]);

  autoTable(doc, {
    startY: y,
    head: [["Loan Type", "Count", "Total Amount", "Share"]],
    body: distRows.length ? distRows : [["No data", "", "", ""]],
    theme: "grid",
    headStyles: { fillColor: [22, 101, 52], textColor: 255, fontStyle: "bold", fontSize: 9 },
    bodyStyles: { fontSize: 9, textColor: [30, 41, 59] },
    alternateRowStyles: { fillColor: [240, 253, 244] },
    columnStyles: { 1: { halign: "center" }, 2: { halign: "right" }, 3: { halign: "right" } },
    margin: { left: margin, right: margin },
  });

  y = doc.lastAutoTable.finalY + 8;

  // Payment status
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(22, 101, 52);
  doc.text("PAYMENT STATUS BREAKDOWN", margin, y);
  y += 4;

  const psb = data.payment_status_breakdown || {};
  const psbRows = [
    ["Validated", (psb.validated ?? 0).toString()],
    ["Pending Review", (psb.pending ?? 0).toString()],
    ["Rejected", (psb.rejected ?? 0).toString()],
  ];

  autoTable(doc, {
    startY: y,
    head: [["Status", "Count"]],
    body: psbRows,
    theme: "grid",
    headStyles: { fillColor: [22, 101, 52], textColor: 255, fontStyle: "bold", fontSize: 9 },
    bodyStyles: { fontSize: 9, textColor: [30, 41, 59] },
    alternateRowStyles: { fillColor: [240, 253, 244] },
    columnStyles: { 1: { halign: "center" } },
    margin: { left: margin, right: margin },
  });

  y = doc.lastAutoTable.finalY + 8;

  // MIGS distribution
  const migs = data.migs_distribution || {};
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(22, 101, 52);
  doc.text("MIGS CLASSIFICATION", margin, y);
  y += 4;

  autoTable(doc, {
    startY: y,
    head: [["Classification", "Count"]],
    body: [
      ["MIGS (≥50 pts)", (migs.migs ?? 0).toString()],
      ["Non-MIGS (<50 pts)", (migs.non_migs ?? 0).toString()],
      ["Unscored", (migs.unscored ?? 0).toString()],
    ],
    theme: "grid",
    headStyles: { fillColor: [22, 101, 52], textColor: 255, fontStyle: "bold", fontSize: 9 },
    bodyStyles: { fontSize: 9, textColor: [30, 41, 59] },
    alternateRowStyles: { fillColor: [240, 253, 244] },
    columnStyles: { 1: { halign: "center" } },
    margin: { left: margin, right: margin },
  });

  y = doc.lastAutoTable.finalY + 8;

  // Monthly collections table
  if (y > 220) { doc.addPage(); y = 20; }
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(22, 101, 52);
  doc.text("MONTHLY COLLECTIONS (LAST 12 MONTHS)", margin, y);
  y += 4;

  const mcRows = (data.monthly_collections || []).map((m) => [
    m.month,
    fmtPdf(m.collections),
  ]);

  autoTable(doc, {
    startY: y,
    head: [["Month", "Collections"]],
    body: mcRows.length ? mcRows : [["No data", ""]],
    theme: "grid",
    headStyles: { fillColor: [22, 101, 52], textColor: 255, fontStyle: "bold", fontSize: 9 },
    bodyStyles: { fontSize: 9, textColor: [30, 41, 59] },
    alternateRowStyles: { fillColor: [240, 253, 244] },
    columnStyles: { 1: { halign: "right" } },
    margin: { left: margin, right: margin },
  });

  // Footer on all pages
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.setFont("helvetica", "normal");
    doc.text(
      `TTMPC Bookkeeper Report  •  Page ${i} of ${totalPages}  •  CONFIDENTIAL`,
      pageW / 2,
      doc.internal.pageSize.getHeight() - 8,
      { align: "center" }
    );
  }

  const today = new Date().toISOString().split("T")[0];
  doc.save(`TTMPC_Bookkeeper_Report_${today}.pdf`);
}

// ─── Main Component ───────────────────────────────────────────────────────────
const Reports = () => {
    const navigate = useNavigate();
  const { addNotification } = useNotification();
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [generatedAt, setGeneratedAt] = useState(null);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/bookkeeper/reports`);
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const json = await res.json();
      setReportData(json);
      setGeneratedAt(json.generated_at);
    } catch (err) {
      setError(err.message || "Failed to load report data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchReports(); }, [fetchReports]);


  const kpi = reportData?.kpi || {};
  const loanDist = reportData?.loan_type_distribution || [];
  const monthlyCollections = reportData?.monthly_collections || [];
  const membershipGrowth = reportData?.membership_growth || [];
  const psb = reportData?.payment_status_breakdown || {};
  const migs = reportData?.migs_distribution || {};

  // Pie data: loan type dist
  const pieData = loanDist.map((d, i) => ({
    name: d.name,
    value: d.count,
    color: PIE_COLORS[i % PIE_COLORS.length],
  }));

  // Payment status pie
  const paymentPieData = [
    { name: "Validated", value: psb.validated || 0, color: BRAND.primary },
    { name: "Pending", value: psb.pending || 0, color: "#f59e0b" },
    { name: "Rejected", value: psb.rejected || 0, color: "#ef4444" },
  ];

  // MIGS pie
  const migsPieData = [
    { name: "MIGS", value: migs.migs || 0, color: BRAND.primary },
    { name: "Non-MIGS", value: migs.non_migs || 0, color: "#94a3b8" },
    ...(migs.unscored ? [{ name: "Unscored", value: migs.unscored, color: "#e2e8f0" }] : []),
  ];

  const kpiCards = [
    {
      title: "TOTAL LOAN PORTFOLIO",
      value: fmt(kpi.total_loan_portfolio),
      sub: `${kpi.active_loan_count ?? 0} loans · ${kpi.active_borrower_count ?? 0} borrowers`,
      icon: BookOpen,
      up: true,
    },
    {
      title: "SHARE CAPITAL (CBU)",
      value: fmt(kpi.total_share_capital),
      sub: `${kpi.active_members ?? 0} bona fide members`,
      icon: Landmark,
      up: true,
    },
    {
      title: "TOTAL SAVINGS",
      value: fmt(kpi.total_savings),
      sub: `${kpi.total_members ?? 0} total members`,
      icon: Wallet,
      up: true,
    },
    {
      title: "DELINQUENCY RATE",
      value: pct(kpi.delinquency_rate),
      sub: `Penalties: ${fmt(kpi.total_penalties_collected)}`,
      icon: AlertTriangle,
      up: false,
      alert: (kpi.delinquency_rate || 0) > 10,
    },
  ];

  return (
    <div className="flex min-h-screen bg-[#F8FAFC]">
      {/* Sidebar */}
      <StaffSidebar portal="Bookkeeper" items={bookkeeperNav} />

      {/* Main */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Topbar */}
        <StaffTopbar portal="Bookkeeper" notifications={<LoanNotificationBell role="bookkeeper" />} />

        {/* Content */}
        <main className="flex-1 p-8 overflow-y-auto">
          {/* Page header */}
          <div className="flex justify-between items-end mb-6">
            <div>
              <Breadcrumb portal="Bookkeeper" page="Reports" />
              <h1 className="font-bold text-2xl text-[#1E293B]">Reports</h1>
              {generatedAt && (
                <p className="text-xs text-gray-400 mt-0.5">
                  Last updated: {new Date(generatedAt).toLocaleString("en-PH")}
                </p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={fetchReports}
                disabled={loading}
                className="flex items-center gap-2 border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                Refresh
              </button>
              <button
                onClick={() => reportData && generateExecutivePDF(reportData, generatedAt)}
                disabled={loading || !reportData}
                className="flex items-center gap-2 bg-[#166534] hover:bg-green-800 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                <Download size={16} />
                Download Executive PDF
              </button>
            </div>
          </div>

          {/* Error banner */}
          {error && (
            <div className="mb-6 flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
              <AlertTriangle size={16} className="shrink-0" />
              {error}
            </div>
          )}

          {/* Loading skeleton */}
          {loading && (
            <div className="grid grid-cols-4 gap-6 mb-6">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-100 p-5 animate-pulse">
                  <div className="w-8 h-8 bg-green-100 rounded-md mb-4" />
                  <div className="h-3 bg-gray-100 rounded w-3/4 mb-3" />
                  <div className="h-6 bg-gray-200 rounded w-1/2 mb-2" />
                  <div className="h-2 bg-gray-100 rounded w-1/3" />
                </div>
              ))}
            </div>
          )}

          {!loading && reportData && (
            <>
              {/* KPI Cards */}
              <StatCardRow cols={4}>
                {kpiCards.map((card, idx) => (
                  <StatCard
                    key={idx}
                    label={card.title}
                    value={card.value}
                    icon={card.icon}
                    iconColor={card.alert ? "text-red-600" : "text-[#166534]"}
                    subtext={
                      <span className="inline-flex items-center">
                        {card.up ? (
                          <ArrowUpRight size={14} className="mr-1" />
                        ) : (
                          <ArrowDownRight size={14} className="mr-1" />
                        )}
                        {card.sub}
                      </span>
                    }
                  />
                ))}
              </StatCardRow>

              {/* Charts Row 1: Collections + Loan Distribution */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                {/* Monthly Collections Bar */}
                <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
                  <div className="flex justify-between items-start mb-5">
                    <div>
                      <h2 className="text-base font-bold text-gray-900">Monthly Collections</h2>
                      <p className="text-xs text-gray-400">Validated payments — last 12 months</p>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                      <div className="w-2.5 h-2.5 rounded-full bg-[#166534]" />
                      Collections
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={monthlyCollections} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <XAxis
                        dataKey="month"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 10, fill: "#9ca3af" }}
                        dy={8}
                      />
                      <YAxis hide />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="collections" fill={BRAND.primary} radius={[4, 4, 0, 0]} barSize={18} name="Collections" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Loan Type Donut */}
                <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm flex flex-col">
                  <h2 className="text-base font-bold text-gray-900 mb-1">Loan Distribution</h2>
                  <p className="text-xs text-gray-400 mb-4">Active loans by type</p>
                  <div className="flex-1 flex items-center justify-center h-36 relative">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={pieData} innerRadius={42} outerRadius={60} paddingAngle={2} dataKey="value" stroke="none">
                          {pieData.map((entry, i) => (
                            <Cell key={i} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            return (
                              <div className="bg-white border border-gray-100 shadow-lg rounded-lg px-3 py-2 text-xs">
                                <p className="font-bold" style={{ color: payload[0].payload.color }}>{payload[0].name}</p>
                                <p className="text-gray-600">{payload[0].value} loans</p>
                              </div>
                            );
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className="text-lg font-black text-gray-900">{kpi.active_loan_count ?? 0}</span>
                      <span className="text-[10px] text-gray-400 font-medium">Active</span>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-col gap-1.5">
                    {pieData.map((item, i) => (
                      <div key={i} className="flex justify-between items-center text-xs">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                          <span className="text-gray-600 font-medium">{item.name}</span>
                        </div>
                        <span className="font-bold text-gray-900">{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Charts Row 2: Membership Growth + Payment Status + MIGS */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                {/* Membership Growth */}
                <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
                  <div className="flex justify-between items-start mb-5">
                    <div>
                      <h2 className="text-base font-bold text-gray-900">Membership Growth</h2>
                      <p className="text-xs text-gray-400">New registrations — last 12 months</p>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                      <div className="w-4 h-0.5 bg-[#166534]" />
                      New Members
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={membershipGrowth} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                      <XAxis
                        dataKey="month"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 10, fill: "#9ca3af" }}
                        dy={8}
                      />
                      <YAxis hide />
                      <Tooltip content={<CountTooltip />} />
                      <Line
                        type="monotone"
                        dataKey="new_members"
                        stroke={BRAND.primary}
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4, fill: BRAND.primary }}
                        name="New Members"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* Right column: Payment Status + MIGS */}
                <div className="flex flex-col gap-6">
                  {/* Payment Status */}
                  <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
                    <h2 className="text-sm font-bold text-gray-900 mb-1">Payment Status</h2>
                    <p className="text-xs text-gray-400 mb-4">All-time breakdown</p>
                    <div className="flex flex-col gap-2">
                      {[
                        { label: "Validated", value: psb.validated || 0, icon: CheckCircle2, color: "text-green-600", bg: "bg-green-50" },
                        { label: "Pending", value: psb.pending || 0, icon: Clock, color: "text-amber-600", bg: "bg-amber-50" },
                        { label: "Rejected", value: psb.rejected || 0, icon: XCircle, color: "text-red-600", bg: "bg-red-50" },
                      ].map((s, i) => {
                        const SIcon = s.icon;
                        const total = (psb.validated || 0) + (psb.pending || 0) + (psb.rejected || 0);
                        const pctVal = total ? (s.value / total) * 100 : 0;
                        return (
                          <div key={i} className="flex items-center gap-3">
                            <div className={`w-7 h-7 rounded-md flex items-center justify-center ${s.bg} ${s.color} shrink-0`}>
                              <SIcon size={14} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex justify-between text-xs mb-1">
                                <span className="font-medium text-gray-700">{s.label}</span>
                                <span className="font-bold text-gray-900">{s.value.toLocaleString()}</span>
                              </div>
                              <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full"
                                  style={{
                                    width: `${pctVal}%`,
                                    backgroundColor: i === 0 ? BRAND.primary : i === 1 ? "#f59e0b" : "#ef4444",
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* MIGS Distribution */}
                  <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
                    <h2 className="text-sm font-bold text-gray-900 mb-1">MIGS Classification</h2>
                    <p className="text-xs text-gray-400 mb-3">Member eligibility</p>
                    <div className="h-24 relative">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={migsPieData} innerRadius={28} outerRadius={42} paddingAngle={2} dataKey="value" stroke="none">
                            {migsPieData.map((entry, i) => (
                              <Cell key={i} fill={entry.color} />
                            ))}
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <span className="text-sm font-black text-gray-900">{(migs.migs || 0) + (migs.non_migs || 0) + (migs.unscored || 0)}</span>
                        <span className="text-[10px] text-gray-400">total</span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5 mt-2">
                      {migsPieData.map((item, i) => (
                        <div key={i} className="flex justify-between items-center text-xs">
                          <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                            <span className="text-gray-600 font-medium">{item.name}</span>
                          </div>
                          <span className="font-bold text-gray-900">{item.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Loan Type Detail Table */}
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden mb-6">
                <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gradient-to-r from-green-50 to-gray-50">
                  <div>
                    <h2 className="text-xs font-bold text-gray-900 uppercase tracking-wide">
                      Active Loan Portfolio — Type Breakdown
                    </h2>
                    <p className="text-[11px] text-gray-400 mt-0.5">All currently active loans</p>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-green-700 text-[10px] uppercase tracking-wider text-white">
                        <th className="px-5 py-3 font-bold">Loan Type</th>
                        <th className="px-5 py-3 font-bold text-right">Count</th>
                        <th className="px-5 py-3 font-bold text-right">Total Portfolio</th>
                        <th className="px-5 py-3 font-bold text-right">Avg. Loan Size</th>
                        <th className="px-5 py-3 font-bold text-right">Share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loanDist.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-5 py-8 text-center text-sm text-gray-400">No loan data available.</td>
                        </tr>
                      ) : (
                        loanDist.map((row, idx) => {
                          const total = loanDist.reduce((s, r) => s + r.count, 0);
                          const share = total ? ((row.count / total) * 100).toFixed(1) : "0.0";
                          const avg = row.count ? row.total_amount / row.count : 0;
                          return (
                            <tr key={idx} className="border-b border-gray-50 hover:bg-green-50/30 transition-colors">
                              <td className="px-5 py-3 text-sm">
                                <div className="flex items-center gap-2">
                                  <div
                                    className="w-2 h-2 rounded-full shrink-0"
                                    style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }}
                                  />
                                  <span className="font-semibold text-gray-800">{row.name}</span>
                                </div>
                              </td>
                              <td className="px-5 py-3 text-sm text-right font-bold text-gray-900">{row.count}</td>
                              <td className="px-5 py-3 text-sm text-right font-bold text-gray-900">{fmt(row.total_amount)}</td>
                              <td className="px-5 py-3 text-sm text-right text-gray-600">{fmt(avg)}</td>
                              <td className="px-5 py-3 text-sm text-right">
                                <span className="inline-block bg-green-50 text-green-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                  {share}%
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </>
          )}
        </main>
      </div>
    </div>
  );
};

export default Reports;
