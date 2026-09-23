import React, { useState } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import StaffSidebar from "../../components/StaffSidebar";
import { cashierNav } from "../../components/StaffSidebar/configs/cashier";
import { UserAuth } from "../../contex/AuthContext";
import { useNotification } from "../../contex/NotificationContext";
import StaffTopbar from "../../components/StaffTopbar";
import LoanNotificationBell from "../../components/LoanNotificationBell";
import Breadcrumb from "../../components/Breadcrumb";
import { TableToolbar } from "../../components/TableToolbar";
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
  Loader2,
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
        <StaffTopbar portal="Cashier" notifications={<LoanNotificationBell role="cashier" />} />

        {/* 3. PAGE CONTENT */}
        <main className="p-8 overflow-auto">
          <Breadcrumb portal="Cashier" page="Withdrawals" />
          <h1 className="text-2xl font-bold text-[#1F3E35] mb-6">Withdrawals</h1>

          {/* Main Card Container */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <TableToolbar
              title="Posted Withdrawal Transactions"
              subtitle={`Showing ${rows.length} transactions`}
            >
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-gray-400 uppercase">Bookkeeper approved transactions</span>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              </div>
            </TableToolbar>

            <div className="p-6 pt-4">
            {fetchError ? (
              <div className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{fetchError}</div>
            ) : null}

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-primary-deep text-[10px] uppercase tracking-wider text-white font-extrabold">
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
                      <td colSpan="6" className="p-10 text-center">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <Loader2 size={24} className="text-gray-300 animate-spin" />
                          <p className="text-sm text-gray-400">Loading...</p>
                        </div>
                      </td>
                    </tr>
                  ) : filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="p-10 text-center">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <Banknote size={32} className="text-gray-300" />
                          <p className="text-sm font-medium text-gray-500">No posted withdrawals found.</p>
                        </div>
                      </td>
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
          </div>
        </main>
      </div>
    </div>
  );
};

export default Cashier_Withdrawals;



