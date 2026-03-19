import React, { useEffect, useMemo, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { UserAuth } from "../../contex/AuthContext";
import { supabase } from "../../supabaseClient";
import {
  Activity,
  Bell,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  History,
  LayoutDashboard,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
  Wallet,
} from "lucide-react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

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

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastSynced, setLastSynced] = useState("");
  const [fetchStage, setFetchStage] = useState("");
  const [scheduleWarning, setScheduleWarning] = useState("");
  const [profile, setProfile] = useState(null);
  const [loans, setLoans] = useState([]);
  const [payments, setPayments] = useState([]);
  const [schedules, setSchedules] = useState([]);

  const menuItems = [
    { name: "Dashboard", icon: LayoutDashboard },
    { name: "Member Loans", icon: Activity },
    { name: "Loan Lifecycle", icon: History },
    { name: "Member Profile", icon: Users },
    { name: "Member Savings", icon: CreditCard },
  ];

  const routeMap = {
    Dashboard: "/member-dashboard",
    "Member Loans": "/member-loans",
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

      const memberId = authData?.user?.id;
      const authEmail = authData?.user?.email || "";
      if (!memberId) throw new Error("Please sign in again to load your loan lifecycle.");

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

      const normalizedLoans = backendLoans.map((loan) => ({
        loan_id: loan.loan_id,
        loan_type: loan.loan_type || "N/A",
        principal: Number(loan.principal || 0),
        monthly_amortization: Number(loan.monthly_amortization || 0),
        term: Number(loan.term || 0),
        loan_status: loan.loan_status || "N/A",
        application_status: loan.application_status || "N/A",
        approval_stage: mapApprovalStage(loan.loan_status || loan.application_status),
        application_date: loan.application_date,
        disbursal_date: loan.disbursal_date,
      }));
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
    <div className="flex min-h-screen bg-[#F8F9FA]">
      <aside className="bg-white w-64 p-4 flex flex-col border-r border-gray-200">
        <div className="flex flex-row items-start gap-2 mb-6">
          <img src="src/assets/img/ttmpc logo.png" alt="Logo" className="h-12 w-auto" />
          <div className="flex flex-col">
            <h1 className="text-xl font-bold text-[#389734]">TTMPC</h1>
            <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Members Portal</p>
          </div>
        </div>

        <hr className="w-full border-gray-100 mb-6" />

        <nav className="flex flex-col gap-2 text-sm flex-grow">
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

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white h-16 shadow-sm flex items-center justify-end px-8 z-10 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              className="bg-gray-50 w-64 h-10 rounded-full border border-gray-200 pl-10 pr-4 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D6021] focus:bg-white transition-all"
              placeholder="Search..."
              readOnly
            />
          </div>
          <button className="ml-6 relative p-2 rounded-full text-gray-500 hover:bg-gray-100 transition-colors">
            <Bell className="w-5 h-5" />
            <span className="absolute top-1.5 right-1.5 block h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" />
          </button>

          <div className="flex items-center ml-4 gap-3 border-l border-gray-200 pl-4 cursor-pointer">
            <div className="w-8 h-8 rounded-full bg-gray-200 overflow-hidden border border-gray-300">
              <img src="src/assets/img/member-profile.png" alt="Profile" className="w-full h-full object-cover" />
            </div>
            <p className="text-sm font-bold text-gray-700">Member</p>
          </div>
        </header>

        <main className="p-8 overflow-y-auto">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 gap-3">
            <div>
              <h1 className="font-extrabold text-[#1a4a2f] text-2xl">Loan Lifecycle View</h1>
              <p className="text-xs text-gray-500 mt-1">
                Real-time refresh every 7 seconds. Last synced: {formatDate(lastSynced)}
              </p>
              <p className="text-[11px] text-gray-500 mt-1">Fetch status: {fetchStage || "Idle"}</p>
            </div>
            <button
              type="button"
              onClick={loadLifecycleData}
              className="inline-flex items-center gap-2 rounded-lg bg-[#1D6021] px-4 py-2 text-sm font-bold text-white hover:bg-[#154718]"
            >
              <RefreshCw size={14} /> Refresh Now
            </button>
          </div>

          {error ? (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          ) : null}

          {loading ? (
            <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
              Syncing member loan lifecycle data...
            </div>
          ) : null}

          {scheduleWarning ? (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {scheduleWarning}
            </div>
          ) : null}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
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

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <div className="flex items-center gap-2 mb-4">
                <ShieldCheck className="w-5 h-5 text-[#1D6021]" />
                <h2 className="font-bold text-gray-900">Process Summary</h2>
              </div>
              <div className="space-y-3 text-sm">
                <p className="flex items-center justify-between"><span className="text-gray-600">Active Loans</span><span className="font-bold">{summary.active}</span></p>
                <p className="flex items-center justify-between"><span className="text-gray-600">Completed Loans</span><span className="font-bold">{summary.completed}</span></p>
                <p className="flex items-center justify-between"><span className="text-gray-600">Recorded Payments</span><span className="font-bold">{payments.length}</span></p>
                <p className="flex items-center justify-between"><span className="text-gray-600">Total Paid</span><span className="font-bold text-[#1D6021]">{formatCurrency(summary.totalPaid)}</span></p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-6 overflow-x-auto">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-[#1D6021]" />
              <h3 className="font-bold text-gray-900">Loan Lifecycle Timeline</h3>
            </div>
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 uppercase text-[11px] tracking-wider">
                <tr>
                  <th className="px-4 py-3 text-left">Loan ID</th>
                  <th className="px-4 py-3 text-left">Type</th>
                  <th className="px-4 py-3 text-left">Current Status</th>
                  <th className="px-4 py-3 text-left">Approval Stage</th>
                  <th className="px-4 py-3 text-left">Applied</th>
                  <th className="px-4 py-3 text-left">Disbursed</th>
                </tr>
              </thead>
              <tbody>
                {loans.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500">No loan lifecycle records found.</td>
                  </tr>
                ) : (
                  loans.map((loan) => (
                    <tr key={loan.loan_id} className="border-t border-gray-100">
                      <td className="px-4 py-3 font-semibold text-gray-800">{loan.loan_id}</td>
                      <td className="px-4 py-3 text-gray-700">{loan.loan_type}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusBadgeClass(loan.loan_status)}`}>
                          {loan.loan_status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{loan.approval_stage}</td>
                      <td className="px-4 py-3 text-gray-600">{formatDate(loan.application_date)}</td>
                      <td className="px-4 py-3 text-gray-600">{formatDate(loan.disbursal_date)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
              <Wallet className="w-4 h-4 text-[#1D6021]" />
              <h3 className="font-bold text-gray-900">Recorded Loan Payments (Real-Time)</h3>
            </div>
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 uppercase text-[11px] tracking-wider">
                <tr>
                  <th className="px-4 py-3 text-left">Date Paid</th>
                  <th className="px-4 py-3 text-left">Loan ID</th>
                  <th className="px-4 py-3 text-left">Reference</th>
                  <th className="px-4 py-3 text-left">Amount</th>
                  <th className="px-4 py-3 text-left">Penalty</th>
                  <th className="px-4 py-3 text-left">Remaining</th>
                  <th className="px-4 py-3 text-left">Validation Status</th>
                </tr>
              </thead>
              <tbody>
                {payments.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-500">No payment records available yet.</td>
                  </tr>
                ) : (
                  payments.map((row, idx) => (
                    <tr key={`${row.loan_id}-${row.payment_id}-${idx}`} className="border-t border-gray-100">
                      <td className="px-4 py-3 text-gray-600">{formatDate(row.payment_date)}</td>
                      <td className="px-4 py-3 text-gray-800 font-medium">{row.loan_id}</td>
                      <td className="px-4 py-3 text-gray-700">{row.reference_no}</td>
                      <td className="px-4 py-3 text-gray-700">{formatCurrency(row.amount_paid)}</td>
                      <td className="px-4 py-3 text-gray-700">{formatCurrency(row.penalties)}</td>
                      <td className="px-4 py-3 text-gray-700">{formatCurrency(row.remaining_after)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${statusBadgeClass(row.confirmation_status)}`}>
                          <CheckCircle2 size={12} /> {row.confirmation_status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto mt-6">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-[#1D6021]" />
              <h3 className="font-bold text-gray-900">Loan Schedule</h3>
            </div>
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 uppercase text-[11px] tracking-wider">
                <tr>
                  <th className="px-4 py-3 text-left">Loan ID</th>
                  <th className="px-4 py-3 text-left">Installment</th>
                  <th className="px-4 py-3 text-left">Due Date</th>
                  <th className="px-4 py-3 text-left">Expected Principal</th>
                  <th className="px-4 py-3 text-left">Expected Interest</th>
                  <th className="px-4 py-3 text-left">Expected Amount</th>
                  <th className="px-4 py-3 text-left">Schedule Status</th>
                </tr>
              </thead>
              <tbody>
                {schedules.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-500">No loan schedule records available.</td>
                  </tr>
                ) : (
                  schedules.map((row, idx) => (
                    <tr key={`${row.loan_id}-${row.installment_no}-${idx}`} className="border-t border-gray-100">
                      <td className="px-4 py-3 text-gray-800 font-medium">{row.loan_id}</td>
                      <td className="px-4 py-3 text-gray-700">#{row.installment_no || "-"}</td>
                      <td className="px-4 py-3 text-gray-600">{formatDate(row.due_date)}</td>
                      <td className="px-4 py-3 text-gray-700">{formatCurrency(row.expected_principal)}</td>
                      <td className="px-4 py-3 text-gray-700">{formatCurrency(row.expected_interest)}</td>
                      <td className="px-4 py-3 text-gray-700">{formatCurrency(row.expected_amount)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusBadgeClass(row.schedule_status)}`}>
                          {row.schedule_status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Member_Lifecycle;
