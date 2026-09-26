import React, { memo, useEffect, useMemo, useState } from "react";
import { NavLink, useLocation, useNavigate, useParams } from "react-router-dom";
import StaffSidebar from "../../components/StaffSidebar";
import { bookkeeperNav } from "../../components/StaffSidebar/configs/bookkeeper";
import { managerNav } from "../../components/StaffSidebar/configs/manager";
import { UserAuth } from "../../contex/AuthContext";
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
  Bell,
  ArrowLeft,
  Wallet,
  Briefcase,
  Coins,
  PiggyBank,
  ChevronDown,
  ChevronRight,
  ShieldAlert,
  Brain,
  RefreshCw,
  X,
  Download,
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import logo from "../../assets/img/ttmpc logo.png";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";
import StaffTopbar from "../../components/StaffTopbar";
import LoanNotificationBell from "../../components/LoanNotificationBell";
import Breadcrumb from "../../components/Breadcrumb";
import TableActionButton from "../../components/TableActionButton";
import TableStateRow from "../../components/TableStateRow";
// Formatters are built once. `new Intl.NumberFormat(...)` per call is slow, and
// the ledger formats several currency cells per row on every render.
const CURRENCY_FORMAT = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
});
const formatCurrency = (value) => CURRENCY_FORMAT.format(Number(value || 0));

const DATE_FORMAT = new Intl.DateTimeFormat("en-PH", { year: "numeric", month: "short", day: "numeric" });
const formatDate = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : DATE_FORMAT.format(d);
};

const getStatusStyle = (status) => {
  const key = String(status || "").toLowerCase();
  if (key.includes("validated") || key.includes("fully")) return "bg-green-100 text-green-700";
  if (key.includes("partial")) return "bg-amber-100 text-amber-700";
  if (key.includes("rejected")) return "bg-red-100 text-red-700";
  if (key.includes("upcoming")) return "bg-blue-100 text-blue-700";
  return "bg-gray-100 text-gray-700";
};

// One ledger entry, with everything the table shows already formatted. Built
// once per history change (useMemo below) so rows render as plain text.
const toPaymentRow = (entry, index) => {
  const paid = Number(entry.payment_amount || entry.amount_paid || 0);
  const penalty = Number(entry.penalty || entry.penalties || 0);
  const status = entry.status || entry.confirmation_status || "";
  return {
    // index keeps keys unique even if two payments share a reference and date
    key: `${entry.reference_no || entry.payment_id || "entry"}-${entry.date_paid || ""}-${index}`,
    date: formatDate(entry.date_paid),
    reference: entry.reference_no || entry.payment_id || "—",
    paid,
    paidText: formatCurrency(paid),
    penalty,
    penaltyText: penalty > 0 ? formatCurrency(penalty) : "—",
    remainingText: formatCurrency(entry.remaining_after),
    status,
    statusStyle: getStatusStyle(status),
  };
};

// Stable empty array so the renewal memo below isn't recomputed every render.
const NO_RENEWALS = [];

// Column widths shared by the ledger header, body and footer so every row lines
// up. Numeric columns are right-aligned (headers included).
const PAYMENT_COLUMNS = ["15%", "23%", "17%", "13%", "20%", "12%"];
const RENEWAL_COLUMNS = ["21%", "16%", "9%", "16%", "16%", "11%", "11%"];

const PaymentRow = memo(function PaymentRow({ row }) {
  return (
    <tr className="border-b border-gray-100 transition-colors hover:bg-gray-50/60">
      <td className="px-4 py-3 whitespace-nowrap text-gray-700">{row.date}</td>
      <td className="px-4 py-3 truncate font-mono text-xs text-gray-700" title={row.reference}>{row.reference}</td>
      <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap font-medium text-gray-800">{row.paidText}</td>
      <td className={`px-4 py-3 text-right tabular-nums whitespace-nowrap ${row.penalty > 0 ? "font-medium text-red-600" : "text-gray-400"}`}>
        {row.penaltyText}
      </td>
      <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap text-gray-700">{row.remainingText}</td>
      <td className="px-4 py-3">
        {row.status ? (
          <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${row.statusStyle}`}>
            {row.status}
          </span>
        ) : (
          <span className="text-gray-400">—</span>
        )}
      </td>
    </tr>
  );
});

const LoanLedger = () => {
    const navigate = useNavigate();
  const location = useLocation();
  const { loanId } = useParams();
  // This page is shared by /bookkeeper-loan-ledger and /manager-loan-ledger.
  // Go by the URL, not router state, so a refresh or direct link still shows
  // the Manager portal chrome and stays read-only.
  const isManagerView =
    location.pathname.startsWith("/manager-loan-ledger") || location.state?.readOnly === true;
  const portal = isManagerView ? "Manager" : "Bookkeeper";
  const ledgerBasePath = isManagerView ? "/manager-loan-ledger" : "/bookkeeper-loan-ledger";
  const renewalHistory = location.state?.renewals || NO_RENEWALS;
  // True when this ledger was opened by clicking a renewal history row.
  // The successor's application_date is passed as closingDate so we can
  // show "Closing Date" instead of "Due Date".
  const isRenewed = !!location.state?.isRenewed;
  const closingDate = location.state?.closingDate || null;
  const [downloadingId, setDownloadingId] = useState(null);

  const handleDownloadSOA = async (loan, prefetchedHistory = null) => {
    const loanId = loan.loan_id;
    setDownloadingId(loanId);

    let paymentHistory = prefetchedHistory;
    if (!paymentHistory) {
      try {
        const res = await fetch(`${API_BASE_URL}/api/bookkeeper/loan-ledger/${encodeURIComponent(loanId)}`);
        const result = await res.json();
        paymentHistory = result?.data?.payment_history || [];
      } catch {
        paymentHistory = [];
      }
    }

    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const generatedOn = new Date().toLocaleString("en-US", {
      year: "numeric", month: "long", day: "2-digit", hour: "2-digit", minute: "2-digit",
    });

    // Header
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(29, 96, 33);
    doc.text("TTMPC - Statement of Account", 40, 50);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    doc.text(`Member Name: ${loan.member_name || "—"}`, 40, 72);
    doc.text(`Loan ID: ${loan.loan_id}`, 40, 88);
    doc.text(`Loan Type: ${loan.loan_type || "—"}`, 40, 104);
    const fmtHeader = (v) => "PHP " + new Intl.NumberFormat("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v || 0));
    doc.text(`Loan Amount: ${fmtHeader(loan.loan_amount)}`, 40, 120);
    doc.text(`Term: ${loan.term_months ?? "—"} months`, pageWidth / 2, 72);
    doc.text(`Interest Rate: ${loan.interest_rate ?? "—"}%`, pageWidth / 2, 88);
    doc.text(`Amortization: ${fmtHeader(loan.amortization)}`, pageWidth / 2, 104);
    doc.text(`Status: ${loan.status || "—"}`, pageWidth / 2, 120);
    doc.text(`Generated On: ${generatedOn}`, pageWidth - 40, 50, { align: "right" });

    doc.setDrawColor(220, 220, 220);
    doc.line(40, 132, pageWidth - 40, 132);

    const fmt = (v) => "PHP " + new Intl.NumberFormat("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v || 0));

    autoTable(doc, {
      startY: 145,
      head: [["Date", "Reference No.", "Payment Amount", "Penalty", "Remaining Balance", "Status"]],
      body: paymentHistory.map((e) => [
        e.date_paid ? new Date(e.date_paid).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" }) : "—",
        e.reference_no || e.payment_id || "—",
        fmt(e.payment_amount || e.amount_paid),
        fmt(e.penalty || e.penalties),
        fmt(e.remaining_after),
        e.status || e.confirmation_status || "—",
      ]),
      styles: { fontSize: 9, cellPadding: 6, valign: "middle" },
      headStyles: { fillColor: [29, 96, 33], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [250, 249, 251] },
      columnStyles: {
        2: { halign: "right" },
        3: { halign: "right" },
        4: { halign: "right" },
      },
      margin: { left: 40, right: 40 },
    });

    // Totals
    const totalPaid = paymentHistory.reduce((s, e) => s + Number(e.payment_amount || e.amount_paid || 0), 0);
    const totalPenalty = paymentHistory.reduce((s, e) => s + Number(e.penalty || e.penalties || 0), 0);
    const ruleY = doc.lastAutoTable.finalY + 18;
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.75);
    doc.line(40, ruleY, pageWidth - 40, ruleY);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(29, 96, 33);
    doc.text("TOTALS", 50, ruleY + 16);
    const totalsLines = [
      `Total Amount Paid: ${fmt(totalPaid)}`,
      `Total Penalty: ${fmt(totalPenalty)}`,
      `Remaining Balance: ${fmt(loan.remaining_balance)}`,
    ];
    totalsLines.forEach((line, i) => {
      doc.text(line, pageWidth - 50, ruleY + 16 + i * 16, { align: "right" });
    });

    const safeName = (loan.member_name || "member").replace(/[^a-z0-9]+/gi, "_");
    const safeLoan = (loan.loan_id || "loan").replace(/[^a-z0-9]+/gi, "_");
    doc.save(`SOA_${safeName}_${safeLoan}_${new Date().toISOString().slice(0, 10)}.pdf`);
    setDownloadingId(null);
  };

  const initialLoan = location.state?.loan || {
    loan_id: loanId,
    member_name: "",
    member_type: "",
    loan_type: "",
    loan_amount: 0,
    interest_rate: 0,
    term_months: 0,
    amortization: 0,
    remaining_balance: 0,
    due_date: "",
    status: "",
    payment_history: [],
  };

  const [selectedLoan, setSelectedLoan] = useState(initialLoan);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  // Restructure modal state
  const [showRestructure, setShowRestructure] = useState(false);
  const [newTerm, setNewTerm] = useState("");
  const [restructuring, setRestructuring] = useState(false);
  const [restructureError, setRestructureError] = useState("");
  const [restructureSubmitted, setRestructureSubmitted] = useState(false);

  // Manager-side: pending restructure request for this loan
  const [pendingRequest, setPendingRequest] = useState(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [reviewDone, setReviewDone] = useState("");

  useEffect(() => {
    if (!isManagerView || !loanId) return;
    fetch(`${API_BASE_URL}/api/manager/restructure-requests/${encodeURIComponent(loanId)}`)
      .then((r) => r.json())
      .then((res) => { if (res?.success) setPendingRequest(res.data || null); })
      .catch(() => {});
  }, [isManagerView, loanId]);

  const handleReview = async (action) => {
    if (!pendingRequest?.id) return;
    setReviewLoading(true);
    setReviewError("");
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/manager/restructure-requests/${pendingRequest.id}/review`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, reviewed_by: "Manager" }),
        }
      );
      const result = await response.json();
      if (!response.ok || !result?.success) throw new Error(result?.detail || "Action failed.");
      setReviewDone(action);
      setPendingRequest(null);
      if (action === "approved") {
        setSelectedLoan((prev) => ({
          ...prev,
          term_months: result.new_term_months,
          amortization: result.new_amortization,
        }));
      }
    } catch (err) {
      setReviewError(err.message || "Action failed.");
    } finally {
      setReviewLoading(false);
    }
  };

  const previewAmortization = (() => {
    const term = parseInt(newTerm, 10);
    if (!term || term <= 0 || !selectedLoan.loan_amount) return null;
    const principal = Number(selectedLoan.loan_amount);
    const rateRaw = Number(selectedLoan.interest_rate || 0);
    const monthlyRate = rateRaw / 100;
    const loanType = String(selectedLoan.loan_type || "").toLowerCase();
    if (loanType.includes("emergency")) {
      const principalComponent = principal / term;
      const endingBalance = principal - principalComponent;
      return principalComponent + endingBalance * monthlyRate;
    }
    return (principal * (1 + monthlyRate * term)) / term;
  })();

  const handleRestructure = async () => {
    const term = parseInt(newTerm, 10);
    if (!term || term <= 0) {
      setRestructureError("Enter a valid number of months.");
      return;
    }
    if (previewAmortization === null || previewAmortization <= 0) {
      setRestructureError("Unable to compute new amortization.");
      return;
    }
    setRestructuring(true);
    setRestructureError("");
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/bookkeeper/loan-ledger/${encodeURIComponent(loanId)}/restructure-request`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            new_term_months: term,
            new_amortization: previewAmortization,
            requested_by: "Bookkeeper",
          }),
        }
      );
      const result = await response.json();
      if (!response.ok || !result?.success) {
        throw new Error(result?.detail || "Failed to submit request.");
      }
      setRestructureSubmitted(true);
      setShowRestructure(false);
      setNewTerm("");
    } catch (err) {
      setRestructureError(err.message || "Failed to submit request.");
    } finally {
      setRestructuring(false);
    }
  };

  useEffect(() => {
    async function fetchLedger() {
      if (!loanId) return;

      setLoading(true);
      setLoadError("");
      try {
        const response = await fetch(`${API_BASE_URL}/api/bookkeeper/loan-ledger/${encodeURIComponent(loanId)}`);
        const result = await response.json();
        if (!response.ok || !result?.success) {
          throw new Error(result?.detail || "Failed to load loan ledger.");
        }
        setSelectedLoan(result.data);
      } catch (error) {
        setLoadError(error?.message || "Unable to load live ledger data.");
      } finally {
        setLoading(false);
      }
    }

    fetchLedger();
  }, [loanId]);

  const paymentRows = useMemo(
    () => (selectedLoan.payment_history || []).map(toPaymentRow),
    [selectedLoan.payment_history],
  );

  const paymentTotals = useMemo(
    () => paymentRows.reduce(
      (acc, row) => ({ paid: acc.paid + row.paid, penalty: acc.penalty + row.penalty }),
      { paid: 0, penalty: 0 },
    ),
    [paymentRows],
  );

  // Closing date = the date a renewed loan was superseded. Best signal is its
  // last payment (payments stop when it is renewed); fallback is the
  // successor's application date (works for system loans).
  const renewalRows = useMemo(
    () => renewalHistory.map((loan, idx) => {
      let lastPay = null;
      for (const p of loan.payment_history || []) {
        if (p.date_paid && (!lastPay || p.date_paid > lastPay)) lastPay = p.date_paid;
      }
      const successorApplied = idx === 0
        ? selectedLoan.application_date
        : renewalHistory[idx - 1]?.application_date;
      return { loan, closingDate: lastPay || successorApplied || null };
    }),
    [renewalHistory, selectedLoan.application_date],
  );


  return (
    <div className="flex min-h-screen bg-gray-50">
      <StaffSidebar portal={portal} items={isManagerView ? managerNav : bookkeeperNav} />
      <div className="flex-1 min-w-0 flex flex-col h-screen overflow-y-auto">
        <StaffTopbar portal={portal} notifications={<LoanNotificationBell role={portal.toLowerCase()} />} />

        <main className="p-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <Breadcrumb portal={portal} page="Loan Ledger" />
              <h1 className="font-bold text-2xl text-gray-800">Loan Ledger</h1>
              <p className="text-sm text-gray-500 mt-1">{selectedLoan.loan_id} • {selectedLoan.member_name}</p>
            </div>
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <ArrowLeft size={16} /> Back
            </button>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 mb-5 shadow-sm">
            {loading && (
              <div className="mb-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                Syncing ledger data from server...
              </div>
            )}

            {!!loadError && (
              <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {loadError}
              </div>
            )}

            {restructureSubmitted && (
              <div className="mb-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                Restructure request sent to Manager for approval. The loan will be updated once approved.
              </div>
            )}

            {/* Manager: pending restructure request notice + approve/reject */}
            {isManagerView && pendingRequest && !reviewDone && (
              <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-amber-800">Restructure Request — Pending Approval</p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      Bookkeeper requests changing term to{" "}
                      <span className="font-bold">{pendingRequest.new_term_months} months</span>
                      {" "}with new amortization of{" "}
                      <span className="font-bold">{formatCurrency(pendingRequest.new_amortization)}</span>.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {reviewError && <span className="text-xs text-red-600">{reviewError}</span>}
                    <button
                      type="button"
                      disabled={reviewLoading}
                      onClick={() => handleReview("rejected")}
                      className="px-3 py-1.5 rounded-lg border border-red-300 bg-white text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                    >
                      {reviewLoading ? "..." : "Reject"}
                    </button>
                    <button
                      type="button"
                      disabled={reviewLoading}
                      onClick={() => handleReview("approved")}
                      className="px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-semibold hover:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                    >
                      {reviewLoading ? "Saving..." : "Approve"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {isManagerView && reviewDone && (
              <div className={`mb-3 rounded-md border px-3 py-2 text-xs font-semibold ${reviewDone === "approved" ? "border-green-200 bg-green-50 text-green-700" : "border-red-200 bg-red-50 text-red-700"}`}>
                Restructure request {reviewDone === "approved" ? "approved — loan updated." : "rejected."}
              </div>
            )}

            <div className="flex items-center justify-between w-full mb-3">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-gray-700">Loan Summary</h2>
                {isRenewed
                  ? <span className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold bg-blue-100 text-blue-700">Renewed</span>
                  : renewalHistory.length > 0
                    ? <span className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold bg-green-100 text-green-700">Active Loan</span>
                    : null
                }
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={downloadingId === selectedLoan.loan_id}
                  onClick={() => handleDownloadSOA(selectedLoan, selectedLoan.payment_history)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-green-300 bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-800 hover:bg-green-100 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <Download size={13} />
                  {downloadingId === selectedLoan.loan_id ? "Generating..." : "Download SOA"}
                </button>
                {!isManagerView && !isRenewed && (
                  <button
                    type="button"
                    onClick={() => { setNewTerm(String(selectedLoan.term_months || "")); setRestructureError(""); setRestructureSubmitted(false); setShowRestructure(true); }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 transition-colors"
                  >
                    <RefreshCw size={13} /> Restructure Loan
                  </button>
                )}
              </div>
            </div>
                        
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-gray-700">
              <p><span className="font-semibold">Member Name:</span> {selectedLoan.member_name}</p>
              <p><span className="font-semibold">Member Type:</span> {selectedLoan.member_type}</p>
              <p><span className="font-semibold">Loan Type:</span> {selectedLoan.loan_type}</p>
              <p><span className="font-semibold">Loan Amount:</span> {formatCurrency(selectedLoan.loan_amount)}</p>
              <p><span className="font-semibold">Interest:</span> {selectedLoan.interest_rate}%</p>
              <p><span className="font-semibold">Term:</span> {selectedLoan.term_months} months</p>
              {!isRenewed && (
                <p><span className="font-semibold">Amortization:</span> {formatCurrency(selectedLoan.amortization)}</p>
              )}
              {!isRenewed && (
                <p><span className="font-semibold">Remaining Balance:</span> {formatCurrency(selectedLoan.remaining_balance)}</p>
              )}
              <p>
                <span className="font-semibold">{isRenewed ? "Closing Date:" : "Due Date:"}</span>{" "}
                {isRenewed
                  ? (closingDate ? new Date(closingDate).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" }) : "—")
                  : (selectedLoan.due_date || "—")
                }
              </p>
              <p>
                <span className="font-semibold">Status:</span>{" "}
                {isRenewed
                  ? <span className="inline-flex rounded-full px-3 py-1 text-xs font-semibold bg-blue-100 text-blue-700">Renewed</span>
                  : <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getStatusStyle(selectedLoan.status)}`}>{selectedLoan.status}</span>
                }
              </p>
            </div>
          </div>

          <div className="max-h-[36rem] overflow-auto rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full min-w-[46rem] table-fixed border-collapse text-left text-sm">
              <colgroup>
                {PAYMENT_COLUMNS.map((width, i) => <col key={i} style={{ width }} />)}
              </colgroup>
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-white font-extrabold">
                  {/* sticky per-cell: keeps the header visible while a long history scrolls */}
                  <th className="sticky top-0 z-10 bg-primary-deep px-4 py-3 align-bottom font-bold">Date</th>
                  <th className="sticky top-0 z-10 bg-primary-deep px-4 py-3 align-bottom font-bold">Reference No.</th>
                  <th className="sticky top-0 z-10 bg-primary-deep px-4 py-3 align-bottom text-right font-bold">Payment Amount</th>
                  <th className="sticky top-0 z-10 bg-primary-deep px-4 py-3 align-bottom text-right font-bold">Penalty</th>
                  <th className="sticky top-0 z-10 bg-primary-deep px-4 py-3 align-bottom text-right font-bold">Remaining After Payment</th>
                  <th className="sticky top-0 z-10 bg-primary-deep px-4 py-3 align-bottom font-bold">Status</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <TableStateRow colSpan={6} variant="loading" label="Loading..." />
                ) : paymentRows.length === 0 ? (
                  <TableStateRow
                    colSpan={6}
                    variant="empty"
                    icon={FileText}
                    label="No ledger entries yet."
                  />
                ) : null}

                {paymentRows.map((row) => (
                  <PaymentRow key={row.key} row={row} />
                ))}
              </tbody>
              {paymentRows.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-gray-200 bg-gray-50 text-sm font-bold text-gray-800">
                    <td colSpan={2} className="px-4 py-3 text-[10px] uppercase tracking-wider text-gray-500">
                      Totals ({paymentRows.length} {paymentRows.length === 1 ? "entry" : "entries"})
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">{formatCurrency(paymentTotals.paid)}</td>
                    <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">
                      {paymentTotals.penalty > 0 ? formatCurrency(paymentTotals.penalty) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">
                      {isRenewed ? "" : formatCurrency(selectedLoan.remaining_balance)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {renewalRows.length > 0 && (
            <div className="mt-5 rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                <h2 className="text-sm font-semibold text-gray-700">Renewal History ({renewalRows.length})</h2>
                <p className="text-xs text-gray-500 mt-0.5">Previous loans of the same type by this member, newest first</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[46rem] table-fixed border-collapse text-left text-sm">
                  <colgroup>
                    {RENEWAL_COLUMNS.map((width, i) => <col key={i} style={{ width }} />)}
                  </colgroup>
                  <thead>
                    <tr className="bg-primary-deep text-[10px] uppercase tracking-wider text-white font-extrabold">
                      <th className="px-4 py-3 align-bottom font-bold">Loan ID</th>
                      <th className="px-4 py-3 align-bottom text-right font-bold">Loan Amount</th>
                      <th className="px-4 py-3 align-bottom text-right font-bold">Term</th>
                      <th className="px-4 py-3 align-bottom text-right font-bold">Amortization</th>
                      <th className="px-4 py-3 align-bottom font-bold">Last Payment</th>
                      <th className="px-4 py-3 align-bottom font-bold">Status</th>
                      <th className="px-4 py-3 align-bottom font-bold">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {renewalRows.map(({ loan: r, closingDate: closingDateVal }) => (
                      <tr key={r.loan_id} className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50/60 transition-colors">
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            className="max-w-full truncate font-mono font-bold text-green-700 hover:underline"
                            title={r.loan_id}
                            onClick={() => navigate(`${ledgerBasePath}/${r.loan_id}`, { state: { loan: r, isRenewed: true, closingDate: closingDateVal, readOnly: isManagerView } })}
                          >
                            {r.loan_id}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap text-gray-700">{formatCurrency(r.loan_amount)}</td>
                        <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap text-gray-700">{r.term_months ?? "—"} mo</td>
                        <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap text-gray-700">{formatCurrency(r.amortization)}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-gray-600">{formatDate(closingDateVal)}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold bg-blue-100 text-blue-700">
                            Renewed
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <TableActionButton
                            icon={Download}
                            disabled={downloadingId === r.loan_id}
                            onClick={() => handleDownloadSOA(r)}
                          >
                            {downloadingId === r.loan_id ? "..." : "SOA"}
                          </TableActionButton>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
      </div>

      {showRestructure && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-gray-800">Restructure Loan Term</h3>
              <button type="button" onClick={() => setShowRestructure(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              Current term: <span className="font-semibold text-gray-700">{selectedLoan.term_months} months</span>
              {" · "}
              Current amortization: <span className="font-semibold text-gray-700">{formatCurrency(selectedLoan.amortization)}</span>
            </p>
            <label className="block text-sm font-medium text-gray-700 mb-1">New Term (months)</label>
            <input
              type="number"
              min="1"
              value={newTerm}
              onChange={(e) => setNewTerm(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 mb-3"
              placeholder="e.g. 24"
            />
            {previewAmortization !== null && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 mb-3">
                <p className="text-xs text-amber-700 font-medium">New monthly amortization</p>
                <p className="text-lg font-bold text-amber-900">{formatCurrency(previewAmortization)}</p>
              </div>
            )}
            {restructureError && (
              <p className="text-xs text-red-600 mb-3">{restructureError}</p>
            )}
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setShowRestructure(false)}
                className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRestructure}
                disabled={restructuring}
                className="px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {restructuring ? "Submitting..." : "Send to Manager"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LoanLedger;
