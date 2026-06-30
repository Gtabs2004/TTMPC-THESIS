  import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { UserAuth } from "../../contex/AuthContext";
import { useNotification } from "../../contex/NotificationContext";
import { PortalSidebarIdentity, PortalTopbarIdentity } from "../../components/PortalIdentity";
import {
  LayoutDashboard,
  Users,
  FileText,
  Calculator,
  Activity,
  BarChart3,
  History,
  Wallet,
  Search,
  Bell,
  CheckCircle,
  XCircle,
  RefreshCw,
  Briefcase,
  Coins,
  Printer,
  PiggyBank,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import logo from "../../assets/img/ttmpc logo.png";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

const formatCurrency = (value) => {
  const amount = Number(value || 0);
  return `\u20B1${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatDate = (value) => {
  if (!value) return "N/A";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "N/A";
  return parsed.toLocaleString("en-US");
};

const getStatusStyle = (status) => {
  const key = String(status || "").toLowerCase();
  if (key === "pending_verification") return "bg-amber-100 text-amber-800";
  if (key === "validated") return "bg-green-100 text-green-800";
  if (key === "rejected") return "bg-red-100 text-red-800";
  return "bg-gray-100 text-gray-700";
};

const BookkeeperSavingsTransactions = () => {
  const { signOut } = UserAuth();
  const navigate = useNavigate();
  const { addNotification } = useNotification();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("pending_verification");
  const [workingId, setWorkingId] = useState("");
  const [isSavingsOpen, setIsSavingsOpen] = useState(true);

  const menuItems = [
      { name: "Dashboard", icon: LayoutDashboard },
      { name: "Manage Member", icon: Users },
      { name: "Loan Approval", icon: FileText },
      { name: "Manage Loans", icon: Briefcase },
      { name: "Payments", icon: Wallet },
      {
        name: "Savings Accounts",
        icon: PiggyBank,
        isDropdown: true,
        subItems: [
          { name: "All Accounts", path: "/bookkeeper-savings-accounts" },
          { name: "Savings Withdrawals", path: "/bookkeeper-savings-transactions" },
        ],
      },
      { name: "Accounting", icon: Calculator },
      { name: "MIGS Scoring", icon: Activity },
      { name: "Reports", icon: BarChart3 },
      { name: "Audit Trail", icon: History },
      { name: "Grocery", icon: Coins },
      { name: "Legacy Member Validation", icon: Search },
    ];

  const routeMap = {
    Dashboard: "/dashboard",
    "Manage Member": "/manage-member",
    "Loan Approval": "/bookkeeper-loan-approval",
    "Manage Loans": "/manage-loans",
    Payments: "/payments",
    Accounting: "/accounting",
    "MIGS Scoring": "/migs",
    Reports: "/reports",
    "Audit Trail": "/audit-trail",
    Grocery: "/grocery",
    "Legacy Member Validation": "/legacy-member-validation",
  };

  const withdrawalRows = useMemo(
    () => rows.filter((row) => String(row.transaction_type || "").toLowerCase() === "withdraw"),
    [rows]
  );

  const filteredRows = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return withdrawalRows
      .filter((row) => String(row.transaction_status || "").toLowerCase() === activeTab)
      .filter((row) => {
        if (!normalizedSearch) return true;
        return (
          String(row.transaction_id || "").toLowerCase().includes(normalizedSearch)
          || String(row.savings_id || "").toLowerCase().includes(normalizedSearch)
          || String(row.member_name || "").toLowerCase().includes(normalizedSearch)
        );
      });
  }, [withdrawalRows, activeTab, searchTerm]);

  const tabCounts = useMemo(() => {
    const pending = withdrawalRows.filter((row) => String(row.transaction_status || "").toLowerCase() === "pending_verification").length;
    const validated = withdrawalRows.filter((row) => String(row.transaction_status || "").toLowerCase() === "validated").length;
    const rejected = withdrawalRows.filter((row) => String(row.transaction_status || "").toLowerCase() === "rejected").length;

    return { pending, validated, rejected };
  }, [withdrawalRows]);

  async function fetchRows() {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/bookkeeper/savings-transactions`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.detail || "Failed to load savings transaction queue.");
      }
      setRows(Array.isArray(payload.data) ? payload.data : []);
      addNotification("Savings transactions loaded successfully", "success");
    } catch (error) {
      setRows([]);
      addNotification(error?.message || "Unable to load savings transaction queue.", "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchRows();
  }, []);

  const handleSignOut = async (e) => {
    e.preventDefault();
    try {
      await signOut();
      navigate("/");
    } catch (err) {
      console.error("Failed to sign out:", err);
    }
  };

  const confirmPost = async (transactionId) => {
    setWorkingId(transactionId);
    try {
      const response = await fetch(`${API_BASE_URL}/api/bookkeeper/savings-transactions/${encodeURIComponent(transactionId)}/confirm`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ notes: "Confirmed by Bookkeeper" }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.detail || "Failed to confirm transaction.");
      }
      addNotification(payload?.message || "Transaction confirmed and posted.", "success");
      await fetchRows();
    } catch (error) {
      addNotification(error?.message || "Unable to confirm transaction.", "error");
    } finally {
      setWorkingId("");
    }
  };

  const rejectTransaction = async (transactionId) => {
    const reason = window.prompt("Reason for rejection:", "Rejected by Bookkeeper") || "Rejected by Bookkeeper";
    setWorkingId(transactionId);
    try {
      const response = await fetch(`${API_BASE_URL}/api/bookkeeper/savings-transactions/${encodeURIComponent(transactionId)}/reject`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ notes: reason }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.detail || "Failed to reject transaction.");
      }
      addNotification(payload?.message || "Transaction rejected.", "warning");
      await fetchRows();
    } catch (error) {
      addNotification(error?.message || "Unable to reject transaction.", "error");
    } finally {
      setWorkingId("");
    }
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      <aside className="bg-white w-64 p-4 flex flex-col border-r border-gray-200">
        <div className="flex flex-row items-start gap-2 mb-6">
          <img src={logo} alt="Logo" className="h-12 w-auto" />
          <div className="flex flex-col">
            <h1 className="text-xl font-bold text-[#389734]">TTMPC</h1>
            <PortalSidebarIdentity className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold" fallbackPortal="Bookkeeper Portal" fallbackRole="Bookkeeper" />
          </div>
        </div>

        <hr className="w-full border-gray-200 mb-6" />

        <nav className="flex flex-col gap-2 text-sm flex-grow">
          {menuItems.map((item) => {
            const Icon = item.icon;
            if (item.isDropdown) {
              return (
                <div key={item.name} className="flex flex-col">
                  <button
                    onClick={() => setIsSavingsOpen(!isSavingsOpen)}
                    className="flex items-center justify-between p-2 rounded-md text-gray-700 hover:bg-green-50 hover:text-green-700 transition-colors w-full"
                  >
                    <div className="flex items-center gap-3">
                      <Icon size={20} />
                      <span>{item.name}</span>
                    </div>
                    {isSavingsOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>
                  {isSavingsOpen && (
                    <div className="flex flex-col mt-1 space-y-1">
                      {item.subItems.map((subItem) => (
                        <NavLink
                          key={subItem.name}
                          to={subItem.path}
                          className={({ isActive }) =>
                            `block pl-11 pr-4 py-2 rounded-md transition-colors text-[13px] ${
                              isActive
                                ? "text-green-700 font-semibold"
                                : "text-gray-500 hover:text-green-700 hover:bg-green-50"
                            }`
                          }
                        >
                          {subItem.name}
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              );
            }
            const to = routeMap[item.name] || `/${item.name.toLowerCase().replace(/\s+/g, "-")}`;
            return (
              <NavLink
                key={item.name}
                to={to}
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
        </nav>

        <button
          onClick={handleSignOut}
          className="mt-auto w-full rounded p-2 text-xs bg-green-600 hover:bg-green-700 text-white font-bold transition-colors"
        >
          Sign out
        </button>
      </aside>

      <div className="flex-1 flex flex-col">
        <header className="bg-white h-16 shadow-sm flex items-center justify-end px-8">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              className="bg-gray-50 w-52 h-10 rounded-lg border border-gray-300 px-4 py-1 pl-9 focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="Search..."
            />
          </div>
          <button className="ml-6 relative p-1 rounded-full text-gray-500 hover:bg-gray-100 transition-colors">
            <Bell className="w-5 h-5" />
            <span className="absolute top-1 right-1 block h-2 w-2 rounded-full bg-red-500 ring-2 ring-white"></span>
          </button>
          <PortalTopbarIdentity className="ml-4 text-sm font-medium text-gray-700" fallbackRole="Bookkeeper" />
        </header>

        <main className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Savings Withdrawal Verification</h1>
              <p className="text-xs text-gray-500 mt-0.5">Review and confirm cashier-submitted withdrawals</p>
            </div>
            <button
              onClick={fetchRows}
              disabled={loading}
              className="px-3 py-1.5 rounded-md bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <RefreshCw size={13} />
              Refresh
            </button>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-3 mb-4 flex flex-wrap gap-2 items-center">
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search by transaction ID, savings ID, or member name"
              className="flex-1 min-w-[200px] md:max-w-md bg-gray-50 border border-gray-300 rounded-md px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-green-500"
            />

            <button
              onClick={() => setActiveTab("pending_verification")}
              className={`px-2.5 py-1.5 rounded-md text-[11px] font-semibold ${activeTab === "pending_verification" ? "bg-amber-100 text-amber-800" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
            >
              Pending ({tabCounts.pending})
            </button>
            <button
              onClick={() => setActiveTab("validated")}
              className={`px-2.5 py-1.5 rounded-md text-[11px] font-semibold ${activeTab === "validated" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
            >
              Validated ({tabCounts.validated})
            </button>
            <button
              onClick={() => setActiveTab("rejected")}
              className={`px-2.5 py-1.5 rounded-md text-[11px] font-semibold ${activeTab === "rejected" ? "bg-red-100 text-red-800" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
            >
              Rejected ({tabCounts.rejected})
            </button>
          </div>

          <div className="border border-gray-200 rounded-lg shadow-sm overflow-hidden bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-green-700 text-[10px] uppercase tracking-wider text-white font-extrabold">
                    <th className="p-5 font-bold">Transaction ID</th>
                    <th className="p-5 font-bold">Member</th>
                    <th className="p-5 font-bold">Savings ID</th>
                    <th className="p-5 font-bold">Type</th>
                    <th className="p-5 font-bold text-right">Amount</th>
                    <th className="p-5 font-bold">Requested</th>
                    <th className="p-5 font-bold">Status</th>
                    <th className="p-5 font-bold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan="8" className="p-5 text-sm text-center text-gray-500">Loading savings transactions...</td>
                    </tr>
                  ) : filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="p-5 text-sm text-center text-gray-500">No transactions found for this tab.</td>
                    </tr>
                  ) : (
                    filteredRows.map((row) => (
                      <tr key={row.transaction_id} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                        <td className="p-5 text-sm font-mono text-gray-900">{row.transaction_id}</td>
                        <td className="p-5 text-sm text-gray-800">{row.member_name || "Unknown Member"}</td>
                        <td className="p-5 text-sm font-mono text-gray-700">{row.savings_id}</td>
                        <td className="p-5 text-sm">
                          <span className="inline-flex px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-[10px] font-medium">
                            {row.account_type || row.transaction_type}
                          </span>
                        </td>
                        <td className="p-5 text-sm text-right font-semibold text-gray-900 tabular-nums">{formatCurrency(row.amount)}</td>
                        <td className="p-5 text-sm text-gray-600">{formatDate(row.requested_at)}</td>
                        <td className="p-5 text-sm">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${getStatusStyle(row.transaction_status)}`}>
                            {row.transaction_status}
                          </span>
                        </td>
                        <td className="p-5 text-sm text-right">
                          {row.transaction_status === "pending_verification" ? (
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                onClick={() => confirmPost(row.transaction_id)}
                                disabled={workingId === row.transaction_id}
                                className="px-2 py-1 rounded bg-green-600 hover:bg-green-700 text-white text-[11px] font-semibold inline-flex items-center gap-1 disabled:opacity-50"
                              >
                                <CheckCircle size={12} />
                                Confirm
                              </button>
                              <button
                                onClick={() => rejectTransaction(row.transaction_id)}
                                disabled={workingId === row.transaction_id}
                                className="px-2 py-1 rounded bg-red-600 hover:bg-red-700 text-white text-[11px] font-semibold inline-flex items-center gap-1 disabled:opacity-50"
                              >
                                <XCircle size={12} />
                                Reject
                              </button>
                            </div>
                          ) : (
                            // TODO: PRINT-RECEIPT-OVERLAY · withdrawal slip after bookkeeper validates
                            <button
                              onClick={() =>
                                addNotification(
                                  `Print withdrawal slip for ${row.transaction_id} — coming soon.`,
                                  "info"
                                )
                              }
                              className="px-2 py-1 rounded border border-dashed border-blue-400 bg-blue-50 hover:bg-blue-100 text-blue-700 text-[11px] font-semibold inline-flex items-center gap-1"
                              title="PRINT-RECEIPT-OVERLAY · Coming soon"
                            >
                              <Printer size={12} />
                              Print
                              <span className="ml-0.5 text-[8px] uppercase tracking-wider bg-blue-200 text-blue-800 px-1 rounded-full">
                                Soon
                              </span>
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default BookkeeperSavingsTransactions;
