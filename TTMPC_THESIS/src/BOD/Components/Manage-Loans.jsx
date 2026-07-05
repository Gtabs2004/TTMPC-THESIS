import React, { useEffect, useMemo, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { UserAuth } from "../../contex/AuthContext";
import { PortalSidebarIdentity, PortalTopbarIdentity } from "../../components/PortalIdentity";
import {
  LayoutDashboard,
  Users,
  CreditCard,
  CalendarCheck,
  CalendarDays,
  Archive,
  Search,
  Bell,
  BookOpen,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  FileText,
  ShieldCheck,
  AlertTriangle,
  History
} from "lucide-react";
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";
const MEMBER_TONE_POOL = [
  "text-blue-600 bg-blue-50",
  "text-green-600 bg-green-50",
  "text-amber-600 bg-amber-50",
  "text-teal-600 bg-teal-50",
  "text-purple-600 bg-purple-50",
  "text-gray-600 bg-gray-100",
];

const formatCurrency = (value) => {
  const amount = Number(value || 0);
  return `P${amount.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatDisplayDate = (value) => {
  if (!value) return "Pending";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Pending";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const getInitials = (name) => {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
};

const getWeekNumber = (inputDate) => {
  const date = new Date(Date.UTC(inputDate.getFullYear(), inputDate.getMonth(), inputDate.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
};

const resolveLoanStage = (loan) => {
  const repaymentStatus = String(loan.status || "").toLowerCase();
  if (repaymentStatus.includes("fully")) return "Paid";

  const sourceStatus = String(loan.source_loan_status || "").toLowerCase();
  if (sourceStatus.includes("released") || sourceStatus.includes("disbursed")) return "Disbursed";
  if (sourceStatus.includes("partially paid")) return "Disbursed";
  if (sourceStatus.includes("approved")) return "Approved";
  if (sourceStatus.includes("ready for disbursement") || sourceStatus.includes("to be disbursed")) return "Pending";

  return "Pending";
};

const buildLedgerGroups = (rows, filter) => {
  const groups = new Map();

  rows.forEach((loan, index) => {
    const dateValue = loan.application_date || loan.due_date;
    const parsedDate = dateValue ? new Date(dateValue) : null;
    const isValidDate = parsedDate && !Number.isNaN(parsedDate.getTime());

    let period = "Unknown Period";
    let sortKey = 0;

    if (isValidDate) {
      if (filter === "Weekly") {
        const week = getWeekNumber(parsedDate);
        const year = parsedDate.getFullYear();
        period = `Week ${week}, ${year}`;
        sortKey = year * 100 + week;
      } else if (filter === "Monthly") {
        period = parsedDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });
        sortKey = parsedDate.getFullYear() * 100 + parsedDate.getMonth();
      } else {
        period = String(parsedDate.getFullYear());
        sortKey = parsedDate.getFullYear();
      }
    }

    if (!groups.has(period)) {
      groups.set(period, {
        period,
        sortKey,
        totalApproved: 0,
        totalDisbursed: 0,
        totalPaid: 0,
        totalPending: 0,
        members: new Map(),
      });
    }

    const group = groups.get(period);
    const stage = resolveLoanStage(loan);
    const loanAmount = Number(loan.loan_amount || 0);
    const remainingBalance = Number(loan.remaining_balance || 0);
    const paidAmount = Math.max(loanAmount - remainingBalance, 0);
    const memberKey = String(loan.membership_id || loan.member_name || index);

    if (!group.members.has(memberKey)) {
      const memberName = loan.member_name || "Unknown Member";
      const initialIndex = group.members.size % MEMBER_TONE_POOL.length;
      group.members.set(memberKey, {
        id: `${memberKey}-${group.members.size}`,
        name: memberName,
        memberId: loan.membership_id || loan.member_type || "N/A",
        initial: getInitials(memberName),
        initialColor: MEMBER_TONE_POOL[initialIndex],
        loanText: "",
        approvedAmount: 0,
        disbursedAmount: 0,
        paidAmount: 0,
        pendingAmount: 0,
        totalAmount: 0,
        loans: [],
      });
    }

    const member = group.members.get(memberKey);
    member.totalAmount += loanAmount;

    if (paidAmount > 0) {
      group.totalPaid += paidAmount;
      member.paidAmount += paidAmount;
    }

    if (stage === "Paid") {
      group.totalDisbursed += loanAmount;
      member.disbursedAmount += loanAmount;
    } else if (stage === "Disbursed") {
      group.totalDisbursed += loanAmount;
      member.disbursedAmount += loanAmount;
    } else if (stage === "Approved") {
      group.totalApproved += loanAmount;
      member.approvedAmount += loanAmount;
    } else {
      group.totalPending += loanAmount;
      member.pendingAmount += loanAmount;
    }

    member.loans.push({
      loanId: loan.loan_id,
      loanType: loan.loan_type || "Loan",
      status: stage,
      disbursedDate: stage === "Pending" ? "Pending" : formatDisplayDate(loan.application_date),
      amount: formatCurrency(loanAmount),
      balance: formatCurrency(remainingBalance),
    });
  });

  return Array.from(groups.values())
    .sort((a, b) => b.sortKey - a.sortKey)
    .map((group) => {
      const members = Array.from(group.members.values()).map((member) => {
        const loanCount = member.loans.length;
        return {
          ...member,
          loanText: `${loanCount} loan${loanCount === 1 ? "" : "s"}`,
          approvedAmount: formatCurrency(member.approvedAmount),
          disbursedAmount: formatCurrency(member.disbursedAmount),
          paidAmount: formatCurrency(member.paidAmount),
          pendingAmount: formatCurrency(member.pendingAmount),
          totalAmount: formatCurrency(member.totalAmount),
        };
      });

      return {
        period: group.period,
        memberCount: members.length,
        totalApproved: formatCurrency(group.totalApproved),
        totalDisbursed: formatCurrency(group.totalDisbursed),
        totalPaid: formatCurrency(group.totalPaid),
        totalPending: formatCurrency(group.totalPending),
        members,
      };
    });
};

const formatStatusTone = (status) => {
  const value = String(status || "").toLowerCase();
  if (value.includes("paid")) return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (value.includes("disbursed")) return "bg-blue-50 text-blue-700 border-blue-200";
  if (value.includes("approved")) return "bg-green-50 text-green-700 border-green-200";
  if (value.includes("pending")) return "bg-orange-50 text-orange-700 border-orange-200";
  return "bg-gray-50 text-gray-600 border-gray-200";
};

const BOD_Manage_Loans = () => {
  const { signOut } = UserAuth();
  const navigate = useNavigate();
  const [activeFilter, setActiveFilter] = useState("Monthly");
  const [expandedPeriods, setExpandedPeriods] = useState([]);
  const [expandedMembers, setExpandedMembers] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loans, setLoans] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  const filteredLoans = useMemo(() => {
    const key = String(searchTerm || "").trim().toLowerCase();
    if (!key) return loans;
    return loans.filter((loan) =>
      String(loan.member_name || "").toLowerCase().includes(key) ||
      String(loan.loan_id || "").toLowerCase().includes(key) ||
      String(loan.loan_type || "").toLowerCase().includes(key) ||
      String(loan.source_loan_status || "").toLowerCase().includes(key)
    );
  }, [loans, searchTerm]);

  const groupedLedger = useMemo(() => buildLedgerGroups(filteredLoans, activeFilter), [filteredLoans, activeFilter]);

  const summaryTotals = useMemo(() => {
    const totals = { approved: 0, disbursed: 0, paid: 0, pending: 0, total: 0 };
    filteredLoans.forEach((loan) => {
      const stage = resolveLoanStage(loan);
      const amount = Number(loan.loan_amount || 0);
      const remainingBalance = Number(loan.remaining_balance || 0);
      const paidAmount = Math.max(amount - remainingBalance, 0);
      totals.total += amount;
      if (paidAmount > 0) totals.paid += paidAmount;
      if (stage === "Disbursed" || stage === "Paid") totals.disbursed += amount;
      else if (stage === "Approved") totals.approved += amount;
      else totals.pending += amount;
    });
    return totals;
  }, [filteredLoans]);

  useEffect(() => {
    if (groupedLedger.length > 0) {
      setExpandedPeriods([groupedLedger[0].period]);
      if (groupedLedger[0].members.length > 0) {
        setExpandedMembers([groupedLedger[0].members[0].id]);
      }
    }
  }, [groupedLedger]);

  const fetchManageLoans = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/bookkeeper/manage-loans`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.detail || payload?.message || "Failed to load manage loans data.");
      }
      const rows = Array.isArray(payload?.data?.rows) ? payload.data.rows : [];
      setLoans(rows);
    } catch (err) {
      setLoadError(err?.message || "Unable to load manage loans data.");
      setLoans([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchManageLoans();
  }, []);

  const menuItems = [
      {
        section: "BOD",
        items: [
          { name: "Dashboard", icon: LayoutDashboard },
          { name: "Member Approvals", icon: Users },
          { name: "Loan Approvals", icon: ShieldCheck },
          { name: "Manage Loans", icon: CreditCard },
          { name: "Manage Member", icon: Users },
          { name: "Audit Log", icon: History },
          { name: "Loan Policies", icon: FileText },
        ],
      },
      {
        section: "SECRETARY",
        items: [
          { name: "Training Attendance", icon: CalendarCheck },
          { name: "General Assembly", icon: CalendarDays },
          { name: "Membership Records", icon: Archive },
        ],
      },
    ];

  const routeMap = {
    "Dashboard": "/BOD-dashboard",
    "Member Approvals": "/member-approvals",
    "Loan Approvals": "/bod-loan-approvals",
    "Manage Loans": "/bod-manage-loans",
    "Manage Member": "/bod-manage-member",
    "Audit Log": "/bod-audit-log",
    "Loan Policies": "/bod-loan-policies",
    "Training Attendance": "/Secretary_Attendance",
    "General Assembly": "/Secretary_General_Assembly",
    "Membership Records": "/Secretary_Records",
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

  const togglePeriod = (period) => {
    setExpandedPeriods((prev) =>
      prev.includes(period) ? prev.filter((value) => value !== period) : [...prev, period]
    );
  };

  const toggleMember = (memberId) => {
    setExpandedMembers((prev) =>
      prev.includes(memberId) ? prev.filter((value) => value !== memberId) : [...prev, memberId]
    );
  };

  const currentLedgerData = groupedLedger;

  return (
    <div className="flex min-h-screen bg-gray-50">
      <aside className="fixed inset-y-0 left-0 bg-white w-64 p-4 flex flex-col border-r border-gray-200 z-30">
        <div className="flex flex-row items-start gap-2 mb-6">
          <img src="src/assets/img/ttmpc logo.png" alt="Logo" className="h-12 w-auto" />
          <div className="flex flex-col">
            <h1 className="text-xl font-bold text-[#389734]">TTMPC</h1>
            <PortalSidebarIdentity className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold" fallbackPortal="BOD Portal" fallbackRole="BOD" />
          </div>
        </div>

        <hr className="w-full border-gray-200 mb-6" />

        <nav className="flex flex-col gap-2 text-sm flex-grow">
          {menuItems.map((section) => (
            <div key={section.section} className="mb-4 flex flex-col gap-2">
              <p className="text-xs font-bold text-gray-400 px-2 uppercase tracking-wider">{section.section}</p>
              {section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.name}
                    to={routeMap[item.name]}
                    className={({ isActive }) =>
                      `flex items-center gap-3 p-2 rounded-md transition-colors ${
                        isActive
                          ? "bg-green-50 text-green-700 font-semibold"
                          : "text-gray-700 hover:bg-green-50 hover:text-green-700"
                      }`
                    }
                  >
                    <Icon size={20} />
                    <span>{item.name}</span>
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>

        <button
          onClick={handleSignOut}
          className="mt-auto w-full rounded p-2 text-xs bg-green-600 hover:bg-green-700 text-white font-bold transition-colors"
        >
          Sign out
        </button>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col ml-64">
        <header className="bg-white h-16 shadow-sm flex items-center justify-end px-8 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              className="bg-gray-50 w-60 h-10 rounded-lg border border-gray-200 pl-10 pr-4 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#2C7A3F]"
              placeholder="Search loans..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>
          <button className="ml-6 relative p-1 rounded-full text-gray-500 hover:bg-gray-100 transition-colors">
            <Bell className="w-5 h-5" />
            <span className="absolute top-1 right-1 block h-2 w-2 rounded-full bg-red-500 ring-2 ring-white"></span>
          </button>
          <div className="flex items-center ml-4 gap-2 border-l border-gray-200 pl-4">
            <img src="src/assets/img/bookkeeper-profile.png" alt="Profile" className="w-8 h-8 rounded-full bg-gray-200" />
            <PortalTopbarIdentity className="text-sm font-medium text-gray-700" fallbackRole="BOD" />
          </div>
        </header>

        <main className="p-8 max-w-[1200px] w-full mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <div className="flex items-center gap-3">
                
                <h1 className="font-bold text-2xl text-[#1a3b47]">Loan Ledger</h1>
              </div>
              <p className="text-sm text-gray-500 mt-1 ml-9">BOD view of approved, disbursed, paid, and pending loans</p>
            </div>
            <button
              onClick={fetchManageLoans}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 shadow-sm transition-colors"
              disabled={loading}
            >
              <RefreshCw className="w-4 h-4" />
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>

          {loadError ? (
            <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {loadError}
            </div>
          ) : null}

          {loading ? (
            <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
              Syncing loan ledger data...
            </div>
          ) : null}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm">
              <p className="text-xs font-bold text-gray-500 tracking-wider uppercase mb-2">Total Approved</p>
              <h2 className="text-2xl font-bold text-gray-900">{formatCurrency(summaryTotals.total)}</h2>
              <p className="text-xs text-gray-400">Based on current records</p>
            </div>
            <div className="bg-blue-50 rounded-xl p-5 border border-blue-100 shadow-sm">
              <p className="text-xs font-bold text-blue-700 tracking-wider uppercase mb-2">Disbursed</p>
              <h2 className="text-2xl font-bold text-blue-800">{formatCurrency(summaryTotals.disbursed + summaryTotals.paid)}</h2>
              <p className="text-xs text-blue-600">Released and active loans</p>
            </div>
            <div className="bg-emerald-50 rounded-xl p-5 border border-emerald-100 shadow-sm">
              <p className="text-xs font-bold text-emerald-700 tracking-wider uppercase mb-2">Paid</p>
              <h2 className="text-2xl font-bold text-emerald-800">{formatCurrency(summaryTotals.paid)}</h2>
              <p className="text-xs text-emerald-600">Fully settled loans</p>
            </div>
            <div className="bg-orange-50 rounded-xl p-5 border border-orange-100 shadow-sm">
              <p className="text-xs font-bold text-orange-700 tracking-wider uppercase mb-2">Pending</p>
              <h2 className="text-2xl font-bold text-orange-800">{formatCurrency(summaryTotals.pending)}</h2>
              <p className="text-xs text-orange-600">Awaiting release</p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
              <div>
                <h2 className="text-lg font-bold text-[#1a3b47]">Loan Ledger</h2>
                <p className="text-sm text-gray-500">Grouped by {activeFilter.toLowerCase()} — expand a member to view loan lines</p>
              </div>
              <div className="flex bg-gray-50 border border-gray-200 rounded-full p-1 w-fit">
                {["Weekly", "Monthly", "Yearly"].map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setActiveFilter(filter)}
                    className={`px-4 py-1.5 text-xs font-medium rounded-full transition-colors ${
                      activeFilter === filter ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    {filter}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-6">
              {currentLedgerData.length === 0 ? (
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
                  No loan ledger data available for the selected period.
                </div>
              ) : null}
              {currentLedgerData.map((group) => {
                const isExpanded = expandedPeriods.includes(group.period);
                return (
                  <div key={group.period} className="flex flex-col">
                    <div
                      className="flex flex-col lg:flex-row lg:items-center lg:justify-between py-2 cursor-pointer group gap-2"
                      onClick={() => togglePeriod(group.period)}
                    >
                      <div className="flex items-center gap-2">
                        {isExpanded ? (
                          <ChevronDown className="w-5 h-5 text-green-600" />
                        ) : (
                          <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-gray-600" />
                        )}
                        <h3 className="font-bold text-gray-900">{group.period}</h3>
                        <span className="text-sm text-gray-400">({group.memberCount} members)</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-4 text-sm">
                        <div className="flex items-center gap-1">
                          <span className="text-gray-500">Approved</span>
                          <span className="font-semibold text-green-700">{group.totalApproved}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-gray-500">Disbursed</span>
                          <span className="font-semibold text-blue-700">{group.totalDisbursed}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-gray-500">Paid</span>
                          <span className="font-semibold text-emerald-700">{group.totalPaid}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-gray-500">Pending</span>
                          <span className="font-semibold text-orange-600">{group.totalPending}</span>
                        </div>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="mt-4 space-y-3">
                        {group.members.map((member) => {
                          const isMemberExpanded = expandedMembers.includes(member.id);
                          return (
                            <div
                              key={member.id}
                              className={`border rounded-xl transition-all ${
                                isMemberExpanded ? "border-gray-200 shadow-sm" : "border-gray-100 hover:border-gray-200"
                              }`}
                            >
                              <div
                                className="flex flex-col lg:flex-row lg:items-center lg:justify-between p-4 cursor-pointer gap-4"
                                onClick={() => toggleMember(member.id)}
                              >
                                <div className="flex items-center gap-4">
                                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${member.initialColor}`}>
                                    {member.initial}
                                  </div>
                                  <div>
                                    <p className="font-bold text-sm text-gray-900">{member.name}</p>
                                    <p className="text-xs text-gray-400">{member.memberId} - {member.loanText}</p>
                                  </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-6">
                                  <div className="text-right">
                                    <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider mb-0.5">Approved</p>
                                    <p className="text-sm font-semibold text-green-700">{member.approvedAmount}</p>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider mb-0.5">Disbursed</p>
                                    <p className="text-sm font-semibold text-blue-700">{member.disbursedAmount}</p>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider mb-0.5">Paid</p>
                                    <p className="text-sm font-semibold text-emerald-700">{member.paidAmount}</p>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider mb-0.5">Pending</p>
                                    <p className="text-sm font-semibold text-orange-600">{member.pendingAmount}</p>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <span className="font-bold text-gray-900">{member.totalAmount}</span>
                                    {isMemberExpanded ? (
                                      <ChevronUp className="w-5 h-5 text-gray-400" />
                                    ) : (
                                      <ChevronRight className="w-5 h-5 text-gray-400" />
                                    )}
                                  </div>
                                </div>
                              </div>

                              {isMemberExpanded && member.loans?.length > 0 && (
                                <div className="border-t border-gray-100 bg-gray-50/70 p-4 rounded-b-xl">
                                  <div className="grid gap-3">
                                    {member.loans.map((loan) => (
                                      <div key={loan.loanId} className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 bg-white border border-gray-100 rounded-lg px-4 py-3">
                                        <div>
                                          <p className="text-xs text-gray-400 font-mono">{loan.loanId}</p>
                                          <p className="text-sm font-semibold text-gray-800">{loan.loanType}</p>
                                          <p className="text-xs text-gray-500">Disbursement: {loan.disbursedDate}</p>
                                        </div>
                                        <div className="flex items-center gap-3">
                                          <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold ${formatStatusTone(loan.status)}`}>
                                            {loan.status}
                                          </span>
                                          <div className="text-right">
                                            <p className="text-xs text-gray-400">Amount</p>
                                            <p className="text-sm font-semibold text-gray-900">{loan.amount}</p>
                                          </div>
                                          <div className="text-right">
                                            <p className="text-xs text-gray-400">Balance</p>
                                            <p className="text-sm font-semibold text-gray-900">{loan.balance}</p>
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default BOD_Manage_Loans;
