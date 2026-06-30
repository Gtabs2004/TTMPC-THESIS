import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { UserAuth } from "../../contex/AuthContext";
import { useNotification } from "../../contex/NotificationContext";
import { supabase } from "../../supabaseClient";
import { resolveMemberContextFromSessionUser } from "../../utils/sessionIdentity";
import { loadMemberAvatarSignedUrl } from "../../utils/memberAvatar";
import LoanNotificationBell from "../../components/LoanNotificationBell";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  LayoutDashboard,
  Users,
  CreditCard,
  Activity,
  Search,
  Bell,
  Menu,
  X,
  History,
  User,
  Download,
  Receipt,
  ArrowLeft,
  ChevronRight,
  Banknote,
  Settings,
} from "lucide-react";
import SettingsDrawer from './SettingsDrawer';

const styles = `
  @keyframes fadeInUp { from { opacity: 0; transform: translateY(20px);} to { opacity: 1; transform: translateY(0);} }
  .animate-fade-in-up { animation: fadeInUp 0.6s ease-out; }
  tbody tr { transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
  tbody tr:hover { transform: translateX(2px); }
`;

const ALLOWED_TYPES = ["consolidated", "emergency", "bonus"];

const formatCurrency = (value) =>
  `₱${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatCurrencyPdf = (value) =>
  `PHP ${Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatDate = (value) => {
  if (!value) return "N/A";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "N/A";
  return d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
};

const classifyType = (name) => {
  const raw = String(name || "").toLowerCase();
  if (raw.includes("consolidated")) return "consolidated";
  if (raw.includes("emergency")) return "emergency";
  if (raw.includes("bonus")) return "bonus";
  return null;
};

const Member_StatementOfAccount = () => {
  const { signOut } = UserAuth();
  const navigate = useNavigate();
  const { addNotification } = useNotification();

  const [loans, setLoans] = useState([]);
  const [loadingLoans, setLoadingLoans] = useState(true);
  const [loanError, setLoanError] = useState("");

  const [selectedLoan, setSelectedLoan] = useState(null);
  const [rows, setRows] = useState([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [rowsError, setRowsError] = useState("");

  const [memberLabel, setMemberLabel] = useState("Member");
  const [accountNumber, setAccountNumber] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [memberId, setMemberId] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const menuItems = [
    { name: "Dashboard", icon: LayoutDashboard },
    { name: "Member Loans", icon: Activity },
    { name: "Statement of Account", icon: Receipt },
    { name: "Loan Lifecycle", icon: History },
    { name: "Member Savings", icon: CreditCard },
    { name: "Member Profile", icon: Users }
  ];

  const routeMap = {
    "Dashboard": "/member-dashboard",
    "Member Loans": "/member-loans",
    "Statement of Account": "/member-statement-of-account",
    "Loan Lifecycle": "/member-lifecycle",
    "Member Profile": "/members-profile",
    "Member Savings": "/member-savings",
  };

  const handleSignOut = async (e) => {
    e.preventDefault();
    try {
      await signOut();
      navigate("/");
    } catch (err) {
      console.error("Failed to sign out:", err);
    }
  };

  useEffect(() => {
    let isMounted = true;

    const fetchLoans = async () => {
      try {
        setLoadingLoans(true);
        setLoanError("");

        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        const sessionUser = authData?.user;
        if (!sessionUser?.id) throw new Error("Please sign in again to load your loans.");

        const { account, member: memberRow } = await resolveMemberContextFromSessionUser(sessionUser);
        const mId = account?.user_id || sessionUser.id;
        if (!mId) throw new Error("Please sign in again to load your loans.");

        const fullName = [memberRow?.first_name, memberRow?.middle_name, memberRow?.surname]
          .filter(Boolean)
          .join(" ")
          .trim();
        const signedAvatarUrl = await loadMemberAvatarSignedUrl(supabase, sessionUser.id);

        const { data, error: fetchError } = await supabase
          .from("loans")
          .select(`
            control_number,
            loan_amount,
            principal_amount,
            interest_rate,
            total_interest,
            monthly_amortization,
            term,
            loan_status,
            application_date,
            loan_type:loan_type_id ( name )
          `)
          .eq("member_id", mId)
          .order("application_date", { ascending: false });

        if (fetchError) throw fetchError;

        const filtered = (data || [])
          .map((loan) => {
            const typeName = loan.loan_type?.name || "";
            const kind = classifyType(typeName);
            return kind
              ? {
                  control_number: loan.control_number,
                  type: typeName,
                  kind,
                  principal: Number(loan.principal_amount ?? loan.loan_amount ?? 0),
                  totalInterest: Number(loan.total_interest ?? 0),
                  monthly: Number(loan.monthly_amortization ?? 0),
                  term: loan.term,
                  status: loan.loan_status,
                  applicationDate: loan.application_date,
                }
              : null;
          })
          .filter(Boolean);

        if (isMounted) {
          setLoans(filtered);
          setMemberLabel(fullName || "Member");
          setAccountNumber(memberRow?.membership_number_id || account?.user_id || "—");
          setAvatarUrl(signedAvatarUrl || "");
          setMemberId(mId);
        }
      } catch (err) {
        if (isMounted) setLoanError(err.message || "Unable to load loans.");
      } finally {
        if (isMounted) setLoadingLoans(false);
      }
    };

    fetchLoans();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedLoan || !memberId) {
      setRows([]);
      return;
    }
    let isMounted = true;

    const fetchRows = async () => {
      try {
        setLoadingRows(true);
        setRowsError("");
        const { data, error } = await supabase
          .from("member_statement_of_account")
          .select(
            "payment_id, control_number, payment_date, reference_id, principal_paid, interest_paid, deficiency, penalty, total_amount_paid, outstanding_balance"
          )
          .eq("member_id", memberId)
          .eq("control_number", selectedLoan.control_number)
          .order("payment_date", { ascending: true });

        if (error) throw error;
        if (isMounted) setRows(data || []);
      } catch (err) {
        if (isMounted) setRowsError(err.message || "Unable to load payment history.");
      } finally {
        if (isMounted) setLoadingRows(false);
      }
    };

    fetchRows();
    return () => {
      isMounted = false;
    };
  }, [selectedLoan, memberId]);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => ({
        principal: acc.principal + Number(r.principal_paid || 0),
        interest: acc.interest + Number(r.interest_paid || 0),
        deficiency: acc.deficiency + Number(r.deficiency || 0),
        penalty: acc.penalty + Number(r.penalty || 0),
        paid: acc.paid + Number(r.total_amount_paid || 0),
      }),
      { principal: 0, interest: 0, deficiency: 0, penalty: 0, paid: 0 }
    );
  }, [rows]);

  const handleDownloadPdf = () => {
    if (!selectedLoan) return;
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const generatedOn = new Date().toLocaleString("en-US", {
      year: "numeric",
      month: "long",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(29, 96, 33);
    doc.text("TTMPC - Statement of Account", 40, 50);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    doc.text(`Member Name: ${memberLabel}`, 40, 72);
    doc.text(`Account Number: ${accountNumber}`, 40, 88);
    doc.text(`Loan Type: ${selectedLoan.type}`, 40, 104);
    doc.text(`Loan Control No.: ${selectedLoan.control_number}`, 40, 120);
    doc.text(`Generated On: ${generatedOn}`, pageWidth - 40, 72, { align: "right" });

    doc.setDrawColor(220, 220, 220);
    doc.line(40, 132, pageWidth - 40, 132);

    autoTable(doc, {
      startY: 145,
      head: [[
        "Payment Date",
        "Reference ID",
        "Principal Paid",
        "Interest Paid",
        "Deficiency",
        "Penalty",
        "Total Amount Paid",
        "Outstanding Balance",
      ]],
      body: rows.map((r) => [
        formatDate(r.payment_date),
        r.reference_id || "-",
        formatCurrencyPdf(r.principal_paid),
        formatCurrencyPdf(r.interest_paid),
        formatCurrencyPdf(r.deficiency),
        formatCurrencyPdf(r.penalty),
        formatCurrencyPdf(r.total_amount_paid),
        formatCurrencyPdf(r.outstanding_balance),
      ]),
      styles: { fontSize: 9, cellPadding: 6, overflow: "linebreak", valign: "middle" },
      headStyles: { fillColor: [29, 96, 33], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [250, 249, 251] },
      columnStyles: {
        0: { cellWidth: 80 },
        1: { cellWidth: 110 },
        2: { halign: "right" },
        3: { halign: "right" },
        4: { halign: "right" },
        5: { halign: "right" },
        6: { halign: "right" },
        7: { halign: "right" },
      },
      margin: { left: 40, right: 40 },
    });

    // ===== TOTALS SECTION (rule + label + stacked figures on the right) =====
    const totalsGap = 22;                    // gap below table before the rule
    const sidePadding = 40;                  // page-edge padding (matches table margin)
    const totalsLabelX = 50;                 // x-position of "TOTALS" label
    const rightFigureRightPad = 50;          // distance from right edge to the right-aligned figures
    const totalsFontSize = 11;
    const lineSpacing = 16;                  // gap between stacked figures

    const ruleY = doc.lastAutoTable.finalY + totalsGap;
    const totalsY = ruleY + 18;              // first text line, below the rule

    // Latest outstanding balance comes from the most recent payment row
    const sortedRows = [...rows].sort((a, b) =>
      String(a.payment_date).localeCompare(String(b.payment_date))
    );
    const latestBalance = Number(sortedRows[sortedRows.length - 1]?.outstanding_balance || 0);

    // Horizontal rule above the totals
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.75);
    doc.line(sidePadding, ruleY, pageWidth - sidePadding, ruleY);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(totalsFontSize);
    doc.setTextColor(29, 96, 33);

    // Left label
    doc.text("TOTALS", totalsLabelX, totalsY);

    // Right-stacked figures (top -> bottom)
    const totalsLines = [
      `Total Principal: ${formatCurrencyPdf(totals.principal)}`,
      `Total Interest: ${formatCurrencyPdf(totals.interest)}`,
      `Total Penalty: ${formatCurrencyPdf(totals.penalty)}`,
      `Total Deficiency: ${formatCurrencyPdf(totals.deficiency)}`,
      `Total Amount Paid: ${formatCurrencyPdf(totals.paid)}`,
      `Outstanding Balance: ${formatCurrencyPdf(latestBalance)}`,
    ];
    totalsLines.forEach((line, i) => {
      doc.text(
        line,
        pageWidth - rightFigureRightPad,
        totalsY + i * lineSpacing,
        { align: "right" }
      );
    });

    const safeName = (memberLabel || "member").replace(/[^a-z0-9]+/gi, "_");
    const safeLoan = (selectedLoan.control_number || "loan").replace(/[^a-z0-9]+/gi, "_");
    doc.save(`SOA_${safeName}_${safeLoan}_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const kindStyles = {
    consolidated: { ring: "border-green-200", bg: "bg-green-50", text: "text-green-700", chip: "bg-green-100 text-green-700" },
    emergency: { ring: "border-red-200", bg: "bg-red-50", text: "text-red-700", chip: "bg-red-100 text-red-700" },
    bonus: { ring: "border-amber-200", bg: "bg-amber-50", text: "text-amber-700", chip: "bg-amber-100 text-amber-700" },
  };

  return (
    <div className="relative flex min-h-screen bg-[#F8F9FA] dark:bg-gray-950">
      <style>{styles}</style>
      <SettingsDrawer isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />

      {isSidebarOpen ? (
        <button
          aria-label="Close sidebar overlay"
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 z-20 bg-black/30 lg:hidden"
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-30 w-64 transform bg-white dark:bg-gray-900 p-4 flex flex-col border-r border-gray-200 dark:border-gray-800 transition-transform duration-200 ease-out lg:fixed lg:translate-x-0 ${
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <button
          aria-label="Close sidebar"
          onClick={() => setIsSidebarOpen(false)}
          className="absolute right-3 top-3 rounded-md p-1 text-gray-500 hover:bg-gray-100 lg:hidden"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="flex flex-row items-start gap-2 mb-6">
          <img src="/img/ttmpc logo.png" alt="Logo" className="h-12 w-auto" />
          <div className="flex flex-col">
            <h1 className="text-xl font-bold text-[#389734]">TTMPC</h1>
            <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-bold">Members Portal</p>
          </div>
        </div>

        <hr className="w-full border-gray-100 dark:border-gray-800 mb-6" />

        <nav className="flex grow flex-col gap-2 text-sm">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const to = routeMap[item.name];
            return (
              <NavLink
                key={item.name}
                to={to}
                className={({ isActive }) =>
                  `flex items-center gap-3 p-2.5 rounded-lg transition-colors ${
                    isActive
                      ? "bg-[#EAF1EB] text-[#1D6021] font-bold dark:bg-green-900/30 dark:text-green-400"
                      : "text-gray-600 hover:bg-gray-50 hover:text-[#1D6021] font-medium dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-green-400"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon size={18} strokeWidth={isActive ? 2.5 : 2} />
                    <span>{item.name}</span>
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>

        <button
          onClick={handleSignOut}
          className="mt-auto w-full rounded-lg p-2.5 text-sm bg-[#1D6021] hover:bg-[#154718] text-white font-bold transition-colors"
        >
          Sign out
        </button>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden lg:ml-64">
        <header className="bg-white dark:bg-gray-900 h-16 shadow-sm flex items-center justify-between px-4 sm:px-6 lg:px-8 z-10 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              aria-label="Open sidebar"
              onClick={() => setIsSidebarOpen(true)}
              className="rounded-md p-2 text-gray-600 hover:bg-gray-100 lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="text-base sm:text-lg font-extrabold text-[#1a4a2f] dark:text-green-400 lg:hidden">Statement of Account</h1>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            <div className="relative hidden md:block">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <input
                type="text"
                className="bg-gray-50 dark:bg-gray-800 w-64 h-10 rounded-full border border-gray-200 dark:border-gray-700 pl-10 pr-4 py-1 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#1D6021] focus:bg-white dark:focus:bg-gray-800 transition-all"
                placeholder="Search..."
              />
            </div>
            <LoanNotificationBell role="member" accentClass="bg-[#1D6021]" />
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              aria-label="Open settings"
            >
              <Settings className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 sm:gap-3 border-l border-gray-200 dark:border-gray-700 pl-2 sm:pl-4 cursor-pointer">
              <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden border border-gray-300 dark:border-gray-600">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Member Profile" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                    <User className="w-4 h-4" />
                  </div>
                )}
              </div>
              <p className="hidden sm:block text-sm font-bold text-gray-700 dark:text-gray-200">{memberLabel}</p>
            </div>
          </div>
        </header>

        <main className="p-4 sm:p-6 lg:p-8 overflow-y-auto pb-28 lg:pb-0 animate-fade-in-up">
          {!selectedLoan ? (
            <>
              <h1 className="hidden lg:block font-extrabold text-[#1a4a2f] dark:text-green-400 text-2xl mb-2">Statement of Account</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 font-medium mb-8">
                Select a loan to view its payment history and download the statement.
              </p>

              {loadingLoans ? (
                <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-8 text-sm text-gray-500 dark:text-gray-400">
                  Loading your loans…
                </div>
              ) : loanError ? (
                <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-8 text-sm text-red-600">
                  {loanError}
                </div>
              ) : loans.length === 0 ? (
                <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-8 text-sm text-gray-500 dark:text-gray-400">
                  No Consolidated, Emergency, or Bonus loans found on your account.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
                  {loans.map((loan) => {
                    const k = kindStyles[loan.kind];
                    return (
                      <button
                        key={loan.control_number}
                        type="button"
                        onClick={() => setSelectedLoan(loan)}
                        className={`text-left bg-white dark:bg-gray-900 rounded-2xl shadow-sm border ${k.ring} p-6 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 flex flex-col`}
                      >
                        <div className="flex items-start justify-between mb-4">
                          <div className={`w-10 h-10 rounded-lg ${k.bg} flex items-center justify-center`}>
                            <Banknote className={`w-5 h-5 ${k.text}`} />
                          </div>
                          <span className={`px-2.5 py-1 rounded text-[10px] font-extrabold tracking-wider uppercase ${k.chip}`}>
                            {loan.kind}
                          </span>
                        </div>

                        <p className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">{loan.type}</p>
                        <p className="text-[10px] font-mono text-gray-400 dark:text-gray-500 mb-4 break-all">{loan.control_number}</p>

                        <div className="flex justify-between text-sm mb-2">
                          <span className="text-gray-500 dark:text-gray-400 font-medium">Principal</span>
                          <span className="font-bold text-gray-900 dark:text-white">{formatCurrency(loan.principal)}</span>
                        </div>
                        <div className="flex justify-between text-sm mb-2">
                          <span className="text-gray-500 dark:text-gray-400 font-medium">Total Interest</span>
                          <span className="font-bold text-gray-900 dark:text-white">{formatCurrency(loan.totalInterest)}</span>
                        </div>
                        <div className="flex justify-between text-sm mb-4">
                          <span className="text-gray-500 dark:text-gray-400 font-medium">Monthly</span>
                          <span className="font-bold text-[#1D6021]">{formatCurrency(loan.monthly)}</span>
                        </div>

                        <div className="mt-auto pt-4 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
                          <span className="text-[10px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500">
                            Applied {formatDate(loan.applicationDate)}
                          </span>
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-[#1D6021]">
                            View Summary <ChevronRight className="w-4 h-4" />
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center justify-between mb-8">
                <div className=" gap-4">
                  <button
                    type="button"
                    onClick={() => setSelectedLoan(null)}
                    className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-xs font-bold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    <ArrowLeft className="w-4 h-4" /> Back to loans
                  </button>
                  <div>
                    <h1 className="font-extrabold text-[#1a4a2f] dark:text-green-400 text-xl sm:text-2xl mt-4">{selectedLoan.type}</h1>
                    <p className="text-[10px] font-mono text-gray-400">{selectedLoan.control_number}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  disabled={loadingRows || rows.length === 0}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#1D6021] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#154718] disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                >
                  <Download className="w-4 h-4" /> Download as PDF
                </button>
              </div>

              <div className="mb-6 rounded-xl border border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-900/20 p-4 grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div>
                  <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Member Name</p>
                  <p className="text-sm font-bold text-[#1D6021]">{memberLabel}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Account Number</p>
                  <p className="text-sm font-bold text-[#1D6021]">{accountNumber}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Loan Principal</p>
                  <p className="text-sm font-bold text-[#1D6021]">{formatCurrency(selectedLoan.principal)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Generated On</p>
                  <p className="text-sm font-bold text-[#1D6021]">
                    {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "2-digit" })}
                  </p>
                </div>
              </div>

              <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden mb-8 flex flex-col">
                <div className="p-6 flex items-center justify-between border-b border-gray-100 dark:border-gray-800">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">Payment History</h3>
                  <span className="bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 px-3 py-1 rounded text-[9px] font-extrabold tracking-widest uppercase">
                    {rows.length} {rows.length === 1 ? "Entry" : "Entries"}
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1100px] text-left border-collapse">
                    <thead>
                      <tr className="bg-green-700 text-[10px] uppercase tracking-wider text-white font-extrabold">
                        <th className="p-5 font-bold">Payment Date</th>
                        <th className="p-5 font-bold">Reference ID</th>
                        <th className="p-5 font-bold text-right">Principal Paid</th>
                        <th className="p-5 font-bold text-right">Interest Paid</th>
                        <th className="p-5 font-bold text-right">Deficiency</th>
                        <th className="p-5 font-bold text-right">Penalty</th>
                        <th className="p-5 font-bold text-right">Total Amount Paid</th>
                        <th className="p-5 font-bold text-right">Outstanding Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loadingRows ? (
                        <tr>
                          <td colSpan="8" className="p-5 text-sm text-gray-500 dark:text-gray-400">Loading payment history…</td>
                        </tr>
                      ) : rowsError ? (
                        <tr>
                          <td colSpan="8" className="p-5 text-sm text-red-600">{rowsError}</td>
                        </tr>
                      ) : rows.length === 0 ? (
                        <tr>
                          <td colSpan="8" className="p-5 text-sm text-gray-500 dark:text-gray-400">No validated payments found for this loan.</td>
                        </tr>
                      ) : (
                        rows.map((r) => (
                          <tr key={r.payment_id} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                            <td className="p-5 text-sm font-medium text-gray-700 dark:text-gray-200">{formatDate(r.payment_date)}</td>
                            <td className="p-5 text-xs font-mono text-gray-600 dark:text-gray-400 break-all">{r.reference_id || "—"}</td>
                            <td className="p-5 text-sm font-bold text-gray-700 dark:text-gray-200 text-right">{formatCurrency(r.principal_paid)}</td>
                            <td className="p-5 text-sm font-bold text-gray-700 dark:text-gray-200 text-right">{formatCurrency(r.interest_paid)}</td>
                            <td className="p-5 text-sm font-medium text-gray-600 dark:text-gray-400 text-right">{formatCurrency(r.deficiency)}</td>
                            <td className="p-5 text-sm font-medium text-red-400 text-right">{formatCurrency(r.penalty)}</td>
                            <td className="p-5 text-sm font-black text-[#1D6021] text-right">{formatCurrency(r.total_amount_paid)}</td>
                            <td className="p-5 text-sm font-bold text-gray-900 dark:text-white text-right">{formatCurrency(r.outstanding_balance)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    {!loadingRows && !rowsError && rows.length > 0 ? (
                      <tfoot>
                        <tr className="bg-[#EAF1EB] text-[#1D6021] dark:bg-green-900/30 dark:text-green-400">
                          <td className="p-5 text-xs font-extrabold uppercase tracking-wider" colSpan="2">Totals</td>
                          <td className="p-5 text-sm font-black text-right">{formatCurrency(totals.principal)}</td>
                          <td className="p-5 text-sm font-black text-right">{formatCurrency(totals.interest)}</td>
                          <td className="p-5 text-sm font-black text-right">{formatCurrency(totals.deficiency)}</td>
                          <td className="p-5 text-sm font-black text-right">{formatCurrency(totals.penalty)}</td>
                          <td className="p-5 text-sm font-black text-right">{formatCurrency(totals.paid)}</td>
                          <td className="p-5 text-sm font-black text-right">
                            {formatCurrency(
                              [...rows].sort((a, b) =>
                                String(a.payment_date).localeCompare(String(b.payment_date))
                              )[rows.length - 1]?.outstanding_balance || 0
                            )}
                          </td>
                        </tr>
                      </tfoot>
                    ) : null}
                  </table>
                </div>
              </div>
            </>
          )}
        </main>

        {/* Bottom Navigation - Mobile Only */}
        <nav className="fixed bottom-0 left-0 right-0 lg:hidden bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 px-2 py-2">
          <div className="max-w-lg mx-auto">
            <div className="flex items-center justify-around gap-1">
              {menuItems.map((item) => {
                const Icon = item.icon;
                const to = routeMap[item.name];
                return (
                  <NavLink
                    key={item.name}
                    to={to}
                    className={({ isActive }) =>
                      `flex flex-col items-center justify-center px-2.5 py-2 rounded-full transition-all ${
                        isActive
                          ? 'bg-[#1D6021] text-white'
                          : 'text-gray-600 hover:text-[#1D6021] dark:text-gray-400 dark:hover:text-green-400'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <Icon size={20} strokeWidth={isActive ? 2.5 : 2} className="mb-1" />
                        <span className="text-[10px] font-semibold">{item.name.split(' ')[0]}</span>
                      </>
                    )}
                  </NavLink>
                );
              })}
            </div>
          </div>
        </nav>
      </div>
    </div>
  );
};

export default Member_StatementOfAccount;
