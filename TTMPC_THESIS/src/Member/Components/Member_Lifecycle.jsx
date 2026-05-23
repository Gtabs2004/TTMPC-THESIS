import React, { useEffect, useMemo, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { UserAuth } from "../../contex/AuthContext";
import { useNotification } from "../../contex/NotificationContext";
import { supabase } from "../../supabaseClient";
import { resolveMemberContextFromSessionUser } from "../../utils/sessionIdentity";
import { loadMemberAvatarSignedUrl } from "../../utils/memberAvatar";
import LoanNotificationBell from "../../components/LoanNotificationBell";
import {
  Activity,
  Bell,
  CalendarClock,
  CheckCircle2,
  Circle,
  CreditCard,
  History,
  LayoutDashboard,
  Menu,
  X,
  RefreshCw,
  Search,
  ShieldCheck,
  User,
  Users,
  Wallet,
  Receipt,
  ChevronDown,
  ChevronUp,
  FileText,
  ClipboardCheck,
  ThumbsUp,
  PackageCheck,
  Banknote,
  Repeat,
  Trophy,
} from "lucide-react";

// 7 member-facing stages, in order.
const LIFECYCLE_STAGES = [
  { id: 'submitted', label: 'Loan Submitted', icon: FileText, description: 'Your application has been received.' },
  { id: 'review', label: 'Under Review', icon: ClipboardCheck, description: 'Bookkeeper is reviewing your documents.' },
  { id: 'approved', label: 'Approved', icon: ThumbsUp, description: 'The Manager has approved your loan.' },
  { id: 'ready', label: 'Ready for Release', icon: PackageCheck, description: 'Awaiting cashier disbursement.' },
  { id: 'disbursed', label: 'Disbursed', icon: Banknote, description: 'Funds have been released to you.' },
  { id: 'ongoing', label: 'Ongoing Payments', icon: Repeat, description: 'You are actively paying this loan.' },
  { id: 'paid', label: 'Fully Paid', icon: Trophy, description: 'Congratulations — this loan is complete.' },
];

const STAGE_INDEX = LIFECYCLE_STAGES.reduce((acc, s, i) => ({ ...acc, [s.id]: i }), {});

const resolveStageIndex = (loan) => {
  const status = String(loan?.loan_status || loan?.application_status || '').trim().toLowerCase();
  if (status === 'fully paid') return STAGE_INDEX.paid;
  if (status === 'partially paid') return STAGE_INDEX.ongoing;
  if (status === 'released') return STAGE_INDEX.disbursed;
  if (status === 'to be disbursed' || status === 'ready for disbursement') return STAGE_INDEX.ready;
  if (status === 'approved') return STAGE_INDEX.approved;
  if (status === 'recommended for approval') return STAGE_INDEX.review;
  if (status === 'pending') return STAGE_INDEX.submitted;
  // Terminal negative states leave stage at the latest known step.
  if (status === 'rejected' || status === 'cancelled') return STAGE_INDEX.review;
  return STAGE_INDEX.submitted;
};

const memberStatusLabel = (loan) => {
  const status = String(loan?.loan_status || loan?.application_status || '').trim().toLowerCase();
  if (status === 'fully paid') return { text: 'Fully Paid', tone: 'success' };
  if (status === 'partially paid') return { text: 'Ongoing Payments', tone: 'info' };
  if (status === 'released') return { text: 'Disbursed', tone: 'info' };
  if (status === 'to be disbursed' || status === 'ready for disbursement') return { text: 'Ready for Release', tone: 'warn' };
  if (status === 'approved') return { text: 'Approved', tone: 'success' };
  if (status === 'recommended for approval') return { text: 'Under Review', tone: 'warn' };
  if (status === 'pending') return { text: 'Submitted', tone: 'warn' };
  if (status === 'rejected') return { text: 'Not Approved', tone: 'error' };
  if (status === 'cancelled') return { text: 'Cancelled', tone: 'neutral' };
  return { text: 'In Process', tone: 'neutral' };
};

const toneStyles = {
  success: 'bg-green-100 text-green-700 border-green-200',
  info: 'bg-blue-100 text-blue-700 border-blue-200',
  warn: 'bg-amber-100 text-amber-700 border-amber-200',
  error: 'bg-red-100 text-red-700 border-red-200',
  neutral: 'bg-gray-100 text-gray-700 border-gray-200',
};

const formatShortDate = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' });
};

const paymentStatusLabel = (status) => {
  const s = String(status || '').trim().toLowerCase();
  if (s === 'validated' || s === 'confirmed' || s === 'approved' || s === 'bookkeeper_confirmed') {
    return { text: 'Posted', tone: 'success' };
  }
  if (s === 'rejected') return { text: 'Rejected', tone: 'error' };
  return { text: 'Pending', tone: 'warn' };
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

const styles = `
  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @keyframes slideInLeft {
    from {
      opacity: 0;
      transform: translateX(-20px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  @keyframes spin-slow {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  .animate-fade-in-up {
    animation: fadeInUp 0.6s ease-out;
  }

  .animate-fade-in {
    animation: fadeIn 0.4s ease-out;
  }

  .animate-slide-in-left {
    animation: slideInLeft 0.5s ease-out;
  }

  .animate-spin-slow {
    animation: spin-slow 1.5s linear;
  }

  .transition-all-smooth {
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  tbody tr {
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  tbody tr:hover {
    transform: translateX(2px);
  }
`;

const formatCurrency = (value) =>
  `PHP ${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const formatDate = (value) => {
  if (!value) return "N/A";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "N/A";
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const statusBadgeClass = (status) => {
  const key = String(status || "").toLowerCase();
  if (["fully paid", "validated", "approved", "released"].includes(key)) {
    return "bg-green-100 text-green-700";
  }
  if (["partially paid", "ready for disbursement", "to be disbursed", "recommended for approval"].includes(key)) {
    return "bg-amber-100 text-amber-700";
  }
  if (["rejected", "cancelled"].includes(key)) {
    return "bg-red-100 text-red-700";
  }
  return "bg-gray-100 text-gray-700";
};

const mapApprovalStage = (status) => {
  const key = String(status || "").trim().toLowerCase();
  if (key === "pending") return "Submitted";
  if (key === "recommended for approval") return "Bookkeeper Reviewed";
  if (key === "approved") return "Manager Approved";
  if (key === "to be disbursed" || key === "ready for disbursement") return "Queued for Disbursement";
  if (key === "released") return "Disbursed";
  if (key === "partially paid") return "Repayment In Progress";
  if (key === "fully paid") return "Completed";
  if (key === "rejected") return "Rejected";
  if (key === "cancelled") return "Cancelled";
  return "In Process";
};

const Member_Lifecycle = () => {
  const { signOut } = UserAuth();
  const navigate = useNavigate();
  const { addNotification } = useNotification();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastSynced, setLastSynced] = useState("");
  const [fetchStage, setFetchStage] = useState("");
  const [scheduleWarning, setScheduleWarning] = useState("");
  const [profile, setProfile] = useState(null);
  const [loans, setLoans] = useState([]);
  const [payments, setPayments] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [memberLabel, setMemberLabel] = useState('Member');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [selectedLoanId, setSelectedLoanId] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);

  const menuItems = [
    { name: "Dashboard", icon: LayoutDashboard },
    { name: "Member Loans", icon: Activity },
    { name: "Statement of Account", icon: Receipt },
    { name: "Loan Lifecycle", icon: History },
    { name: "Member Profile", icon: Users },
    { name: "Member Savings", icon: CreditCard },
  ];

  const routeMap = {
    Dashboard: "/member-dashboard",
    "Member Loans": "/member-loans",
    "Statement of Account": "/member-statement-of-account",
    "Loan Lifecycle": "/member-lifecycle",
    "Member Profile": "/members-profile",
    "Member Savings": "/member-savings",
  };

  const loadLifecycleData = async () => {
    setLoading(true);
    setError("");
    setScheduleWarning("");
    setFetchStage("Initializing member fetch...");

    try {
      setFetchStage("Fetching authenticated member...");
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;

      const sessionUser = authData?.user;
      if (!sessionUser?.id) throw new Error("Please sign in again to load your loan lifecycle.");

      const { account, member: memberRow } = await resolveMemberContextFromSessionUser(sessionUser);
      const memberId = account?.user_id || sessionUser.id;
      const authEmail = sessionUser?.email || "";
      if (!memberId) throw new Error("Please sign in again to load your loan lifecycle.");
      const signedAvatarUrl = await loadMemberAvatarSignedUrl(supabase, sessionUser.id);

      setFetchStage("Loading lifecycle data from backend...");
      const lifecycleResponse = await fetch(`${API_BASE_URL}/api/member/lifecycle/${encodeURIComponent(memberId)}`, {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      const lifecyclePayload = await lifecycleResponse.json().catch(() => ({}));
      if (!lifecycleResponse.ok || !lifecyclePayload?.success) {
        throw new Error(lifecyclePayload?.detail || lifecyclePayload?.message || "Unable to load lifecycle data from backend.");
      }

      const lifecycleData = lifecyclePayload?.data || {};
      const profileRow = lifecycleData?.profile || {};
      const backendLoans = Array.isArray(lifecycleData?.loans) ? lifecycleData.loans : [];
      const backendPayments = Array.isArray(lifecycleData?.payments) ? lifecycleData.payments : [];

      setProfile({
        fullName: profileRow.full_name || "N/A",
        memberId: profileRow.member_id || "N/A",
        email: profileRow.email || authEmail || "N/A",
        mobile: profileRow.mobile || "N/A",
        civilStatus: profileRow.civil_status || "N/A",
        gender: profileRow.gender || "N/A",
        employer: profileRow.employer || "N/A",
        position: profileRow.position || "N/A",
        salaryGrade: profileRow.salary_grade || "N/A",
        address: profileRow.address || "N/A",
      });
      setMemberLabel(profileRow.full_name || 'Member');
      setAvatarUrl(signedAvatarUrl || '');

      const normalizedLoans = backendLoans.map((loan) => {
        const principal = Number(loan.principal || 0);
        const totalInterest = Number(loan.total_interest || 0);
        const totalPayable = Number(
          loan.total_payable || (principal + totalInterest)
        );
        const amountPaid = Number(loan.amount_paid || 0);
        const remaining = Number(
          loan.remaining_balance ?? Math.max(totalPayable - amountPaid, 0)
        );
        const progressPercent = totalPayable > 0
          ? Math.min(100, Math.round((amountPaid / totalPayable) * 100))
          : 0;
        return {
          loan_id: loan.loan_id,
          loan_type: loan.loan_type || "N/A",
          principal,
          total_interest: totalInterest,
          total_payable: totalPayable,
          amount_paid: amountPaid,
          remaining_balance: remaining,
          progress_percent: progressPercent,
          monthly_amortization: Number(loan.monthly_amortization || 0),
          term: Number(loan.term || 0),
          loan_status: loan.loan_status || "N/A",
          application_status: loan.application_status || "N/A",
          application_date: loan.application_date,
          disbursal_date: loan.disbursal_date,
          schedules: Array.isArray(loan.schedules) ? loan.schedules : [],
          next_due_schedule: loan.next_due_schedule || null,
        };
      });
      setLoans(normalizedLoans);

      const normalizedSchedules = backendLoans
        .map((loan) => {
          const nextDue = loan.next_due_schedule || null;
          if (!nextDue) return null;
          return {
            loan_id: loan.loan_id,
            installment_no: Number(nextDue.installment_no || 0),
            due_date: nextDue.due_date,
            expected_amount: Number(nextDue.expected_amount || 0),
            expected_principal: Number(nextDue.expected_principal || 0),
            expected_interest: Number(nextDue.expected_interest || 0),
            schedule_status: nextDue.schedule_status || "unpaid",
          };
        })
        .filter(Boolean);
      setSchedules(normalizedSchedules);

      if (normalizedLoans.length > 0 && normalizedSchedules.length === 0) {
        setScheduleWarning("No schedules were returned by backend for your current loans.");
      }

      const paymentRows = backendPayments.map((row) => ({
        loan_id: row.loan_id,
        payment_id: row.payment_id || "N/A",
        reference_no: row.reference_no || row.payment_id || "N/A",
        amount_paid: Number(row.amount_paid || 0),
        penalties: Number(row.penalties || 0),
        remaining_after: Number(row.remaining_after || 0),
        payment_date: row.payment_date,
        confirmation_status: row.confirmation_status || "pending_bookkeeper",
      }));
      paymentRows.sort((a, b) => new Date(b.payment_date || 0).getTime() - new Date(a.payment_date || 0).getTime());
      setPayments(paymentRows);
      setLastSynced(new Date().toISOString());
      setFetchStage(`Loaded ${normalizedLoans.length} loans, ${paymentRows.length} payments, ${normalizedSchedules.length} schedules.`);
    } catch (err) {
      setError(err?.message || "Unable to load member lifecycle data.");
      setLoans([]);
      setPayments([]);
      setSchedules([]);
      setMemberLabel('Member');
      setAvatarUrl('');
      setFetchStage("Fetch failed.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLifecycleData();

    const intervalId = window.setInterval(loadLifecycleData, 7000);
    return () => window.clearInterval(intervalId);
  }, []);

  const summary = useMemo(() => {
    const active = loans.filter((loan) => !["rejected", "cancelled", "fully paid"].includes(String(loan.loan_status || "").toLowerCase())).length;
    const completed = loans.filter((loan) => String(loan.loan_status || "").toLowerCase() === "fully paid").length;
    const totalPaid = payments.reduce((sum, row) => sum + Number(row.amount_paid || 0), 0);
    return { active, completed, totalPaid };
  }, [loans, payments]);

  // Auto-select the most relevant loan (first active, else first completed, else first row).
  useEffect(() => {
    if (loans.length === 0) {
      setSelectedLoanId('');
      return;
    }
    const stillExists = loans.some((l) => l.loan_id === selectedLoanId);
    if (selectedLoanId && stillExists) return;
    const firstActive = loans.find(
      (l) => !['fully paid', 'rejected', 'cancelled'].includes(String(l.loan_status || '').toLowerCase())
    );
    setSelectedLoanId((firstActive || loans[0]).loan_id);
  }, [loans, selectedLoanId]);

  const selectedLoan = useMemo(
    () => loans.find((l) => l.loan_id === selectedLoanId) || null,
    [loans, selectedLoanId]
  );

  const selectedStageIndex = useMemo(
    () => (selectedLoan ? resolveStageIndex(selectedLoan) : 0),
    [selectedLoan]
  );

  const selectedStatus = useMemo(
    () => (selectedLoan ? memberStatusLabel(selectedLoan) : null),
    [selectedLoan]
  );

  const recentPayments = useMemo(() => {
    if (!selectedLoan) return [];
    return payments
      .filter((p) => p.loan_id === selectedLoan.loan_id)
      .slice(0, 5);
  }, [payments, selectedLoan]);

  const handleSignOut = async (event) => {
    event.preventDefault();
    try {
      await signOut();
      navigate("/");
    } catch (err) {
      console.error("Failed to sign out:", err);
    }
  };

  return (
    <div className="relative flex min-h-screen bg-[#F8F9FA]">
      <style>{styles}</style>
      {isSidebarOpen ? (
        <button
          aria-label="Close sidebar overlay"
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 z-20 bg-black/30 lg:hidden"
        />
      ) : null}
      <aside
        className={`fixed inset-y-0 left-0 z-30 w-64 transform bg-white p-4 flex flex-col border-r border-gray-200 transition-transform duration-200 ease-out lg:static lg:translate-x-0 ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
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
            <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Members Portal</p>
          </div>
        </div>

        <hr className="w-full border-gray-100 mb-6" />

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
                      ? "bg-[#EAF1EB] text-[#1D6021] font-bold"
                      : "text-gray-600 hover:bg-gray-50 hover:text-[#1D6021] font-medium"
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

      <div className="flex-1 flex flex-col overflow-hidden lg:pl-0">
        <header className="bg-white h-16 shadow-sm flex items-center justify-between px-4 sm:px-6 lg:px-8 z-10 border-b border-gray-100">
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              aria-label="Open sidebar"
              onClick={() => setIsSidebarOpen(true)}
              className="rounded-md p-2 text-gray-600 hover:bg-gray-100 lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="text-base sm:text-lg font-extrabold text-[#1a4a2f] lg:hidden">Lifecycle</h1>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
          <div className="relative hidden md:block">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              className="bg-gray-50 w-64 h-10 rounded-full border border-gray-200 pl-10 pr-4 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D6021] focus:bg-white transition-all"
              placeholder="Search..."
              readOnly
            />
          </div>
          <LoanNotificationBell role="member" accentClass="bg-[#1D6021]" />

          <div className="flex items-center gap-2 sm:gap-3 border-l border-gray-200 pl-2 sm:pl-4 cursor-pointer">
            <div className="w-8 h-8 rounded-full bg-gray-200 overflow-hidden border border-gray-300">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gray-100 text-gray-500">
                  <User className="w-4 h-4" />
                </div>
              )}
            </div>
            <p className="hidden sm:block text-sm font-bold text-gray-700">{memberLabel}</p>
          </div>
          </div>
        </header>

        <main className="p-4 sm:p-6 lg:p-8 overflow-y-auto pb-28 lg:pb-0">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 gap-3">
            <div>
              <h1 className="hidden lg:block font-extrabold text-[#1a4a2f] text-2xl">My Loan Journey</h1>
              <h1 className="lg:hidden font-extrabold text-[#1a4a2f] text-xl">My Loan Journey</h1>
              <p className="text-xs text-gray-500 mt-1">
                Track your loan from application through completion.
              </p>
            </div>
            <div className="flex items-center gap-3">
              {loans.length > 1 ? (
                <select
                  value={selectedLoanId}
                  onChange={(e) => { setSelectedLoanId(e.target.value); setShowDetails(false); setShowSchedule(false); }}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#1D6021]/30"
                >
                  {loans.map((l) => (
                    <option key={l.loan_id} value={l.loan_id}>
                      {l.loan_type} • {l.loan_id}
                    </option>
                  ))}
                </select>
              ) : null}
              <button
                type="button"
                onClick={loadLifecycleData}
                className="inline-flex items-center gap-2 rounded-lg bg-[#1D6021] px-4 py-2 text-sm font-bold text-white hover:bg-[#154718] transition-all-smooth"
              >
                <RefreshCw size={14} className={loading ? 'animate-spin-slow' : ''} /> Refresh
              </button>
            </div>
          </div>

          {error ? (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 animate-fade-in-up">
              {error}
            </div>
          ) : null}

          {!selectedLoan && !loading ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
              <div className="mx-auto w-14 h-14 rounded-full bg-[#EAF1EB] flex items-center justify-center text-[#1D6021] mb-4">
                <Wallet className="w-7 h-7" />
              </div>
              <h3 className="font-extrabold text-gray-900 text-lg mb-1">No loans yet</h3>
              <p className="text-sm text-gray-500">Once you submit a loan application, your journey will appear here.</p>
            </div>
          ) : null}

          {selectedLoan ? (
            <>
              {/* Loan Summary Card */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 sm:p-6 mb-6 animate-fade-in-up">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-5">
                  <div>
                    <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1">{selectedLoan.loan_type}</p>
                    <h2 className="text-xl sm:text-2xl font-extrabold text-gray-900">{formatCurrency(selectedLoan.principal)}</h2>
                    <p className="text-xs text-gray-500 mt-0.5 font-mono">Loan ID: {selectedLoan.loan_id}</p>
                  </div>
                  {selectedStatus ? (
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold border ${toneStyles[selectedStatus.tone]}`}>
                      <CheckCircle2 className="w-3.5 h-3.5" /> {selectedStatus.text}
                    </span>
                  ) : null}
                </div>

                {/* Payment Progress */}
                <div className="mb-5">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-bold text-gray-600 uppercase tracking-wider">Payment Progress</p>
                    <p className="text-sm font-extrabold text-[#1D6021]">{selectedLoan.progress_percent}%</p>
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-[#1D6021] to-[#66B53B] transition-all duration-500"
                      style={{ width: `${selectedLoan.progress_percent}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-gray-500 mt-1.5 font-medium">
                    {formatCurrency(selectedLoan.amount_paid)} paid of {formatCurrency(selectedLoan.total_payable)} total
                  </p>
                </div>

                {/* Key numbers */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="rounded-xl border border-gray-100 bg-[#FAF9FB] p-3">
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Total Payable</p>
                    <p className="text-sm font-extrabold text-gray-900">{formatCurrency(selectedLoan.total_payable)}</p>
                  </div>
                  <div className="rounded-xl border border-gray-100 bg-[#FAF9FB] p-3">
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Remaining Balance</p>
                    <p className="text-sm font-extrabold text-[#1D6021]">{formatCurrency(selectedLoan.remaining_balance)}</p>
                  </div>
                  <div className="rounded-xl border border-gray-100 bg-[#FAF9FB] p-3">
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Next Due Date</p>
                    <p className="text-sm font-extrabold text-gray-900">{formatShortDate(selectedLoan.next_due_schedule?.due_date)}</p>
                  </div>
                  <div className="rounded-xl border border-gray-100 bg-[#FAF9FB] p-3">
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Monthly Amortization</p>
                    <p className="text-sm font-extrabold text-gray-900">{formatCurrency(selectedLoan.monthly_amortization)}</p>
                  </div>
                </div>
              </div>

              {/* Stepper Timeline */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 sm:p-6 mb-6 animate-fade-in-up">
                <div className="flex items-center gap-2 mb-5">
                  <CalendarClock className="w-5 h-5 text-[#1D6021]" />
                  <h3 className="font-extrabold text-gray-900">Loan Journey</h3>
                </div>

                {/* Desktop: horizontal stepper */}
                <div className="hidden md:block">
                  <div className="flex items-start justify-between gap-2">
                    {LIFECYCLE_STAGES.map((stage, idx) => {
                      const isComplete = idx < selectedStageIndex;
                      const isActive = idx === selectedStageIndex;
                      const StageIcon = stage.icon;
                      return (
                        <React.Fragment key={stage.id}>
                          <div className="flex flex-col items-center text-center min-w-0 flex-1">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                              isComplete
                                ? 'bg-[#1D6021] text-white'
                                : isActive
                                  ? 'bg-[#66B53B] text-white ring-4 ring-[#66B53B]/20'
                                  : 'bg-gray-100 text-gray-400'
                            }`}>
                              {isComplete ? <CheckCircle2 className="w-5 h-5" /> : <StageIcon className="w-4 h-4" />}
                            </div>
                            <p className={`mt-2 text-[11px] font-bold leading-tight ${isActive ? 'text-[#1D6021]' : isComplete ? 'text-gray-700' : 'text-gray-400'}`}>
                              {stage.label}
                            </p>
                          </div>
                          {idx < LIFECYCLE_STAGES.length - 1 ? (
                            <div className={`flex-1 h-0.5 mt-5 ${idx < selectedStageIndex ? 'bg-[#1D6021]' : 'bg-gray-200'}`} />
                          ) : null}
                        </React.Fragment>
                      );
                    })}
                  </div>
                  <p className="mt-5 text-sm text-gray-600 font-medium">
                    <span className="font-bold text-[#1D6021]">Current step:</span>{' '}
                    {LIFECYCLE_STAGES[selectedStageIndex]?.description}
                  </p>
                </div>

                {/* Mobile: vertical stepper */}
                <ol className="md:hidden space-y-3">
                  {LIFECYCLE_STAGES.map((stage, idx) => {
                    const isComplete = idx < selectedStageIndex;
                    const isActive = idx === selectedStageIndex;
                    const StageIcon = stage.icon;
                    return (
                      <li key={stage.id} className="flex items-start gap-3">
                        <div className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${
                          isComplete
                            ? 'bg-[#1D6021] text-white'
                            : isActive
                              ? 'bg-[#66B53B] text-white ring-4 ring-[#66B53B]/20'
                              : 'bg-gray-100 text-gray-400'
                        }`}>
                          {isComplete ? <CheckCircle2 className="w-4 h-4" /> : <StageIcon className="w-4 h-4" />}
                        </div>
                        <div className="pt-1">
                          <p className={`text-sm font-bold ${isActive ? 'text-[#1D6021]' : isComplete ? 'text-gray-800' : 'text-gray-400'}`}>
                            {stage.label}
                          </p>
                          {isActive ? (
                            <p className="text-xs text-gray-500 font-medium mt-0.5">{stage.description}</p>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>

              {/* Recent Payments (simplified) */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-6 animate-fade-in-up overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-[#1D6021]" />
                  <h3 className="font-extrabold text-gray-900">Recent Payments</h3>
                </div>
                {recentPayments.length === 0 ? (
                  <div className="p-8 text-center text-sm text-gray-500">
                    No payments recorded for this loan yet.
                  </div>
                ) : (
                  <ul className="divide-y divide-gray-100">
                    {recentPayments.map((row, idx) => {
                      const status = paymentStatusLabel(row.confirmation_status);
                      return (
                        <li key={`${row.payment_id}-${idx}`} className="px-5 py-3.5 flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-bold text-gray-900">{formatCurrency(row.amount_paid)}</p>
                            <p className="text-[11px] text-gray-500 font-medium">{formatShortDate(row.payment_date)}</p>
                          </div>
                          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider border ${toneStyles[status.tone]}`}>
                            {status.text}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {/* Expandable: Loan Details */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-4 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowDetails((v) => !v)}
                  className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-[#1D6021]" />
                    <span className="font-extrabold text-gray-900">View Loan Details</span>
                  </span>
                  {showDetails ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                </button>
                {showDetails ? (
                  <div className="px-5 py-4 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    <p><span className="text-gray-500 font-medium">Applied on:</span> <span className="font-bold text-gray-900">{formatShortDate(selectedLoan.application_date)}</span></p>
                    <p><span className="text-gray-500 font-medium">Disbursed on:</span> <span className="font-bold text-gray-900">{formatShortDate(selectedLoan.disbursal_date)}</span></p>
                    <p><span className="text-gray-500 font-medium">Term:</span> <span className="font-bold text-gray-900">{selectedLoan.term} months</span></p>
                    <p><span className="text-gray-500 font-medium">Total Interest:</span> <span className="font-bold text-gray-900">{formatCurrency(selectedLoan.total_interest)}</span></p>
                  </div>
                ) : null}
              </div>

              {/* Expandable: Full Schedule */}
              {selectedLoan.schedules && selectedLoan.schedules.length > 0 ? (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-6 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setShowSchedule((v) => !v)}
                    className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <CalendarClock className="w-4 h-4 text-[#1D6021]" />
                      <span className="font-extrabold text-gray-900">View Payment Schedule</span>
                    </span>
                    {showSchedule ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                  </button>
                  {showSchedule ? (
                    <div className="border-t border-gray-100">
                      <div className="px-5 py-3 bg-[#FAF9FB] grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                        <div>
                          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Monthly Amortization</p>
                          <p className="text-sm font-extrabold text-[#1D6021]">{formatCurrency(selectedLoan.monthly_amortization)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Term</p>
                          <p className="text-sm font-extrabold text-gray-900">{selectedLoan.term} months</p>
                        </div>
                        <div className="col-span-2 sm:col-span-1">
                          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Total Payable</p>
                          <p className="text-sm font-extrabold text-gray-900">{formatCurrency(selectedLoan.total_payable)}</p>
                        </div>
                      </div>
                      <ul className="divide-y divide-gray-100">
                        {selectedLoan.schedules.map((sched, idx) => {
                          const status = paymentStatusLabel(sched.schedule_status === 'Paid' ? 'validated' : sched.schedule_status);
                          // Per-installment amount = principal_component + interest_component.
                          // Falls back to expected_amount only if components are missing, and
                          // guards against legacy rows where expected_amount was stored as the
                          // running total (principal + total_interest) instead of per-period.
                          const componentSum = Number(sched.expected_principal || 0) + Number(sched.expected_interest || 0);
                          const rawExpected = Number(sched.expected_amount || 0);
                          const monthly = Number(selectedLoan.monthly_amortization || 0);
                          const sanityCap = monthly > 0 ? monthly * 1.5 : Infinity;
                          let perInstallment;
                          if (componentSum > 0 && componentSum <= sanityCap) {
                            perInstallment = componentSum;
                          } else if (rawExpected > 0 && rawExpected <= sanityCap) {
                            perInstallment = rawExpected;
                          } else {
                            perInstallment = monthly;
                          }
                          return (
                            <li key={`${sched.schedule_id || sched.installment_no}-${idx}`} className="px-5 py-3 flex items-center justify-between gap-3">
                              <div>
                                <p className="text-sm font-bold text-gray-900">Installment #{sched.installment_no}</p>
                                <p className="text-[11px] text-gray-500 font-medium">Due {formatShortDate(sched.due_date)}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-sm font-extrabold text-gray-900">{formatCurrency(perInstallment)}</p>
                                <span className={`inline-block mt-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider border ${toneStyles[status.tone]}`}>
                                  {sched.schedule_status === 'Paid' ? 'Paid' : 'Unpaid'}
                                </span>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : null}

          {/* Legacy detailed grid removed — clean member view replaces it above. */}
          <div className="hidden">
            <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-6 transition-all-smooth hover:shadow-lg">
              <div className="flex items-center gap-2 mb-4">
                <Users className="w-5 h-5 text-[#1D6021]" />
                <h2 className="font-bold text-gray-900">Complete Member Details</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <p><span className="font-semibold text-gray-600">Full Name:</span> <span className="text-gray-900">{profile?.fullName || "N/A"}</span></p>
                <p><span className="font-semibold text-gray-600">Member ID:</span> <span className="text-gray-900">{profile?.memberId || "N/A"}</span></p>
                <p><span className="font-semibold text-gray-600">Email:</span> <span className="text-gray-900">{profile?.email || "N/A"}</span></p>
                <p><span className="font-semibold text-gray-600">Mobile:</span> <span className="text-gray-900">{profile?.mobile || "N/A"}</span></p>
                <p><span className="font-semibold text-gray-600">Gender:</span> <span className="text-gray-900">{profile?.gender || "N/A"}</span></p>
                <p><span className="font-semibold text-gray-600">Civil Status:</span> <span className="text-gray-900">{profile?.civilStatus || "N/A"}</span></p>
                <p><span className="font-semibold text-gray-600">Employer:</span> <span className="text-gray-900">{profile?.employer || "N/A"}</span></p>
                <p><span className="font-semibold text-gray-600">Position:</span> <span className="text-gray-900">{profile?.position || "N/A"}</span></p>
                <p><span className="font-semibold text-gray-600">Salary Grade:</span> <span className="text-gray-900">{profile?.salaryGrade || "N/A"}</span></p>
                <p className="md:col-span-2"><span className="font-semibold text-gray-600">Address:</span> <span className="text-gray-900">{profile?.address || "N/A"}</span></p>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-6 transition-all-smooth hover:shadow-lg">
              <div className="flex items-center gap-2 mb-4">
                <ShieldCheck className="w-5 h-5 text-[#1D6021]" />
                <h2 className="font-bold text-gray-900">Process Summary</h2>
              </div>
              <div className="space-y-3 text-sm">
                <p className="flex items-center justify-between transition-all-smooth hover:translate-x-1"><span className="text-gray-600">Active Loans</span><span className="font-bold">{summary.active}</span></p>
                <p className="flex items-center justify-between transition-all-smooth hover:translate-x-1"><span className="text-gray-600">Completed Loans</span><span className="font-bold">{summary.completed}</span></p>
                <p className="flex items-center justify-between transition-all-smooth hover:translate-x-1"><span className="text-gray-600">Recorded Payments</span><span className="font-bold">{payments.length}</span></p>
                <p className="flex items-center justify-between transition-all-smooth hover:translate-x-1"><span className="text-gray-600">Total Paid</span><span className="font-bold text-[#1D6021]">{formatCurrency(summary.totalPaid)}</span></p>
              </div>
            </div>
          </div> 

        </main>

        {/* Bottom Navigation - Mobile Only */}
        <nav className="fixed bottom-0 left-0 right-0 lg:hidden bg-white border-t border-gray-200 px-2 py-2">
          <div className="max-w-lg mx-auto">
            <div className="flex items-center justify-around gap-1">
              {(() => {
                const routeMap = {
                  "Dashboard": "/member-dashboard",
                  "Member Loans": "/member-loans",
                  "Statement of Account": "/member-statement-of-account",
                  "Loan Lifecycle": "/member-lifecycle",
                  "Member Profile": "/members-profile",
                  "Member Savings": "/member-savings"
                };

                return menuItems.map((item) => {
                  const Icon = item.icon;
                  const to = routeMap[item.name] || `/${item.name.toLowerCase().replace(/\s+/g, '-')}`;

                  return (
                    <NavLink
                      key={item.name}
                      to={to}
                      className={({ isActive }) =>
                        `flex flex-col items-center justify-center px-2.5 py-2 rounded-full transition-all ${
                          isActive
                            ? 'bg-[#1D6021] text-white'
                            : 'text-gray-600 hover:text-[#1D6021]'
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
                });
              })()}
            </div>
          </div>
        </nav>
      </div>
    </div>
  );
};

export default Member_Lifecycle;
