import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { UserAuth } from "../../contex/AuthContext";
import { PortalSidebarIdentity, PortalTopbarIdentity } from "../../components/PortalIdentity";
import {
  LayoutDashboard,
  Users,
  FileText,
  CreditCard,
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

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("pending_verification");
  const [workingId, setWorkingId] = useState("");

  const menuItems = [
    { name: "Dashboard", icon: LayoutDashboard },
    { name: "Manage Member", icon: Users },
    { name: "Loan Approval", icon: FileText },
    { name: "Manage Loans", icon: CreditCard },
    { name: "Payments", icon: CreditCard },
    { name: "Accounting", icon: Calculator },
    { name: "MIGS Scoring", icon: Activity },
    { name: "Reports", icon: BarChart3 },
    { name: "Audit Trail", icon: History },
    { name: "Grocery", icon: CreditCard },
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
  };

  const filteredRows = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return rows
      .filter((row) => String(row.transaction_status || "").toLowerCase() === activeTab)
      .filter((row) => {
        if (!normalizedSearch) return true;
        return (
          String(row.transaction_id || "").toLowerCase().includes(normalizedSearch)
          || String(row.savings_id || "").toLowerCase().includes(normalizedSearch)
          || String(row.member_name || "").toLowerCase().includes(normalizedSearch)
        );
      });
  }, [rows, activeTab, searchTerm]);

  const tabCounts = useMemo(() => {
    const pending = rows.filter((row) => String(row.transaction_status || "").toLowerCase() === "pending_verification").length;
    const validated = rows.filter((row) => String(row.transaction_status || "").toLowerCase() === "validated").length;
    const rejected = rows.filter((row) => String(row.transaction_status || "").toLowerCase() === "rejected").length;

    return { pending, validated, rejected };
  }, [rows]);

  async function fetchRows() {
    setLoading(true);
    setFeedback("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/bookkeeper/savings-transactions`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.detail || "Failed to load savings transaction queue.");
      }
      setRows(Array.isArray(payload.data) ? payload.data : []);
    } catch (error) {
      setRows([]);
      setFeedback(error?.message || "Unable to load savings transaction queue.");
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
    setFeedback("");
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
      setFeedback(payload?.message || "Transaction confirmed and posted.");
      await fetchRows();
    } catch (error) {
      setFeedback(error?.message || "Unable to confirm transaction.");
    } finally {
      setWorkingId("");
    }
  };

  const rejectTransaction = async (transactionId) => {
    const reason = window.prompt("Reason for rejection:", "Rejected by Bookkeeper") || "Rejected by Bookkeeper";
    setWorkingId(transactionId);
    setFeedback("");
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
      setFeedback(payload?.message || "Transaction rejected.");
      await fetchRows();
    } catch (error) {
      setFeedback(error?.message || "Unable to reject transaction.");
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

        <main className="p-8">
          <div className="flex items-center justify-between mb-6">
            <h1 className="font-bold text-2xl text-gray-800">Savings Transaction Verification</h1>
            <button
              onClick={fetchRows}
              disabled={loading}
              className="px-4 py-2 rounded-lg bg-white border border-gray-300 text-gray-700 hover:bg-gray-100 text-sm font-semibold inline-flex items-center gap-2"
            >
              <RefreshCw size={15} />
              Refresh Queue
            </button>
          </div>

          {feedback ? (
            <div className="mb-4 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
              {feedback}
            </div>
          ) : null}

          <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4 flex flex-wrap gap-3 items-center">
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search by transaction ID, savings ID, or member name"
              className="w-full md:w-96 bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />

            <button
              onClick={() => setActiveTab("pending_verification")}
              className={`px-3 py-2 rounded-lg text-xs font-semibold ${activeTab === "pending_verification" ? "bg-amber-100 text-amber-800" : "bg-gray-100 text-gray-700"}`}
            >
              Pending ({tabCounts.pending})
            </button>
            <button
              onClick={() => setActiveTab("validated")}
              className={`px-3 py-2 rounded-lg text-xs font-semibold ${activeTab === "validated" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-700"}`}
            >
              Validated ({tabCounts.validated})
            </button>
            <button
              onClick={() => setActiveTab("rejected")}
              className={`px-3 py-2 rounded-lg text-xs font-semibold ${activeTab === "rejected" ? "bg-red-100 text-red-800" : "bg-gray-100 text-gray-700"}`}
            >
              Rejected ({tabCounts.rejected})
            </button>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr>
                    <th className="px-6 py-4 font-bold text-sm">Transaction ID</th>
                    <th className="px-6 py-4 font-bold text-sm">Member</th>
                    <th className="px-6 py-4 font-bold text-sm">Savings ID</th>
                    <th className="px-6 py-4 font-bold text-sm">Type</th>
                    <th className="px-6 py-4 font-bold text-sm">Amount</th>
                    <th className="px-6 py-4 font-bold text-sm">Requested At</th>
                    <th className="px-6 py-4 font-bold text-sm">Status</th>
                    <th className="px-6 py-4 font-bold text-sm text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan="8" className="px-6 py-8 text-center text-gray-500">Loading savings transactions...</td>
                    </tr>
                  ) : filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="px-6 py-8 text-center text-gray-500">No transactions found for this tab.</td>
                    </tr>
                  ) : (
                    filteredRows.map((row) => (
                      <tr key={row.transaction_id} className="border-b border-gray-100">
                        <td className="px-6 py-4 font-semibold text-gray-900">{row.transaction_id}</td>
                        <td className="px-6 py-4 text-gray-800">{row.member_name || "Unknown Member"}</td>
                        <td className="px-6 py-4 text-gray-800">{row.savings_id}</td>
                        <td className="px-6 py-4">
                          <span className="inline-flex px-3 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">
                            {row.account_type || row.transaction_type}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-bold text-gray-900">{formatCurrency(row.amount)}</td>
                        <td className="px-6 py-4 text-gray-600 text-sm">{formatDate(row.requested_at)}</td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold ${getStatusStyle(row.transaction_status)}`}>
                            {row.transaction_status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          {row.transaction_status === "pending_verification" ? (
                            <div className="inline-flex items-center gap-2">
                              <button
                                onClick={() => confirmPost(row.transaction_id)}
                                disabled={workingId === row.transaction_id}
                                className="px-3 py-1.5 rounded-md bg-green-600 hover:bg-green-700 text-white text-xs font-semibold inline-flex items-center gap-1"
                              >
                                <CheckCircle size={14} />
                                Confirm Post
                              </button>
                              <button
                                onClick={() => rejectTransaction(row.transaction_id)}
                                disabled={workingId === row.transaction_id}
                                className="px-3 py-1.5 rounded-md bg-red-600 hover:bg-red-700 text-white text-xs font-semibold inline-flex items-center gap-1"
                              >
                                <XCircle size={14} />
                                Reject
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-500">No actions</span>
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
