import React, { useState } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import StaffSidebar from "../../components/StaffSidebar";
import { cashierNav } from "../../components/StaffSidebar/configs/cashier";
import { UserAuth } from "../../contex/AuthContext";
import { useNotification } from "../../contex/NotificationContext";
import { PortalTopbarIdentity } from "../../components/PortalIdentity";
import LoanNotificationBell from "../../components/LoanNotificationBell";
import { 
  LayoutDashboard, 
  Search,
  Bell,
  Banknote,
  ChevronDown,
  ChevronRight,
  UserPlus,
  LogOut,
  ArrowUpRight,
  Users,
  Send,
  PiggyBank,
  ShoppingCart,
  ArrowDownLeft,
  History,
} from 'lucide-react';

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

const Cashier_Withdrawals = () => {
    const navigate = useNavigate();
  const { addNotification } = useNotification();
  const [rows, setRows] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [fetchError, setFetchError] = React.useState(null);
  const [searchTerm, setSearchTerm] = React.useState("");
   


  React.useEffect(() => {
    const fetchRows = async () => {
      try {
        setLoading(true);
        setFetchError(null);

        const response = await fetch(`${API_BASE_URL}/api/cashier/withdrawals/transactions`);
        const result = await response.json();
        if (!response.ok || !result?.success) {
          throw new Error(result?.detail || "Failed to load withdrawal transactions.");
        }

        setRows(Array.isArray(result.data) ? result.data : []);
      } catch (error) {
        setFetchError(error?.message || "Unable to fetch withdrawal transactions.");
        setRows([]);
      } finally {
        setLoading(false);
      }
    };

    fetchRows();
  }, []);

  const filteredRows = rows.filter((row) => {
    const text = searchTerm.trim().toLowerCase();
    if (!text) return true;
    return (
      String(row.transaction_id || "").toLowerCase().includes(text)
      || String(row.member_name || "").toLowerCase().includes(text)
      || String(row.savings_id || "").toLowerCase().includes(text)
    );
  });

  const getStatusStyle = (status) => {
    switch(status) {
      case 'VALIDATED': return 'bg-green-100 text-green-700 font-bold rounded-lg p-8 ';
      default: return 'bg-gray-100 text-gray-700 font-bold';
    }
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* 1. THE SIDEBAR */}
      <StaffSidebar portal="Cashier" items={cashierNav} />
      {/* 2. THE MAIN AREA */}
      <div className="flex-1 flex flex-col h-screen overflow-y-auto">
        <header className="bg-white h-16 border-b border-gray-100 flex items-center justify-between px-8 shrink-0 ">
          
          
          
      
          {/* Right Side: Grouped Utilities */}
          <div className="flex items-center space-x-4 ml-auto">
            
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search..."
                className="bg-gray-50 w-60 h-10 rounded-lg border border-gray-200 px-4 pl-9 py-1 focus:outline-none focus:ring-2 focus:ring-[#00A859] focus:border-transparent transition-all placeholder-gray-400 text-sm"
              />
            </div>
      
            {/* Notifications */}
            <LoanNotificationBell role="cashier" />
      
            {/* Profile Divider (Optional but adds a premium touch) */}
            <span className="h-6 w-px bg-gray-200"></span>
      
            {/* User Identity Group */}
            <div className="flex items-center space-x-3">
              <img
                src="/img/bookkeeper-profile.png"
                alt="Profile"
                className="w-9 h-9 rounded-full object-cover border border-gray-100 bg-gray-50"
              />
              <PortalTopbarIdentity className="text-sm font-semibold text-green-600" fallbackRole="Cashier" />
            </div>
      
          </div>
        </header>

        {/* 3. PAGE CONTENT */}
        <main className="p-8 overflow-auto">
          <h1 className="text-2xl font-bold text-[#1F3E35] mb-6">Withdrawals</h1>

          {/* Main Card Container */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden p-6">
            
            {/* Header Section */}
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-bold text-[#1F3E35]">Posted Withdrawal Transactions</h2>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-gray-400 uppercase">Bookkeeper approved transactions</span>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              </div>
            </div>

            {fetchError ? (
              <div className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{fetchError}</div>
            ) : null}

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-green-700 text-[10px] uppercase tracking-wider text-white font-extrabold">
                    <th className="p-5 font-bold">Transaction ID</th>
                    <th className="p-5 font-bold">Member Name</th>
                    <th className="p-5 font-bold">Savings ID</th>
                    <th className="p-5 font-bold text-right">Amount</th>
                    <th className="p-5 font-bold">Date Posted</th>
                    <th className="p-5 font-bold text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan="6" className="p-5 text-sm text-center text-gray-500">Loading withdrawal transactions...</td>
                    </tr>
                  ) : filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="p-5 text-sm text-center text-gray-500">No posted withdrawals found.</td>
                    </tr>
                  ) : (
                    filteredRows.map((row) => (
                    <tr key={row.transaction_id} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                      <td className="p-5">
                        <span className="font-mono text-sm text-gray-800">{row.transaction_id}</span>
                      </td>

                      <td className="p-5">
                        <div>
                          <p className="font-medium text-gray-900">{row.member_name}</p>
                          <p className="text-xs text-gray-500">{row.membership_number_id || "N/A"}</p>
                        </div>
                      </td>

                      <td className="p-5">
                        <span className="font-mono text-sm text-gray-800">{row.savings_id}</span>
                      </td>

                      <td className="p-5 text-right">
                        <span className="font-semibold text-gray-900">{formatCurrency(row.amount)}</span>
                      </td>

                      <td className="p-5">
                        <span className="text-sm text-gray-600">{formatDate(row.date_posted)}</span>
                      </td>

                      <td className="p-5 text-center">
                        <span className={`badge-animated px-3 py-1.5 rounded-full text-xs font-semibold border ${getStatusStyle(row.status)}`}>
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  ))) }
                </tbody>
              </table>
            </div>

          </div>
        </main>
      </div>
    </div>
  );
};

export default Cashier_Withdrawals;



