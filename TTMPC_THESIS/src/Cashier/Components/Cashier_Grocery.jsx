import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, NavLink, Link } from "react-router-dom";
import { StatCard, StatCardRow } from "../../components/StatCard";
import { TableToolbar } from "../../components/TableToolbar";
import StaffSidebar from "../../components/StaffSidebar";
import { cashierNav } from "../../components/StaffSidebar/configs/cashier";
import { UserAuth } from "../../contex/AuthContext";
import { supabase } from "../../supabaseClient";
import StaffTopbar from "../../components/StaffTopbar";
import LoanNotificationBell from "../../components/LoanNotificationBell";
import Breadcrumb from "../../components/Breadcrumb";
import TableStateRow from "../../components/TableStateRow";
import { 
  LayoutDashboard,
  Search,
  Bell,
  Banknote,
  ChevronDown,
  ChevronRight,
  ShoppingCart,
  CheckCircle2,
  AlertCircle,
  Wifi,
  RefreshCw,
  BookOpen,
  Calendar,
  Download,
  ChevronLeft,
  UserPlus,
  ArrowUpRight,
  Users,
  Send,
  PiggyBank,
  ArrowDownLeft,
  History,
} from 'lucide-react';

// --- MOCK DATA FOR THE TABLE ---
const MOCK_TRANSACTIONS = [
  { id: 'GR-TTMPC-00001', memberId: 'TTMPCM-001', posId: 'POS - 001', date: 'Feb. 10, 2026 - 10:30 AM', amount: 'P1,100.00', txStatus: 'Completed', payment: 'Paid', balance: 'P0.00' },
  { id: 'GR-TTMPC-00002', memberId: 'TTMPCM-002', posId: 'POS - 001', date: 'Feb. 10, 2026 - 10:45 AM', amount: 'P3,500.00', txStatus: 'Completed', payment: 'Paid', balance: 'P0.00' },
  { id: 'GR-TTMPC-00003', memberId: 'TTMPCM-014', posId: 'POS - 001', date: 'Feb. 10, 2026 - 10:50 AM', amount: 'P1,350.00', txStatus: 'Completed', payment: 'Paid', balance: 'P0.00' },
  { id: 'GR-TTMPC-00004', memberId: 'TTMPCM-124', posId: 'POS - 001', date: 'Feb. 10, 2026 - 10:55 AM', amount: 'P400.00', txStatus: 'Completed', payment: 'Paid', balance: 'P0.00' },
  { id: 'GR-TTMPC-00005', memberId: 'TTMPCM-128', posId: 'POS - 001', date: 'Feb. 10, 2026 - 12:50 PM', amount: 'P2,500.00', txStatus: 'Pending', payment: 'On Credit', balance: 'P2,500.00' },
  { id: 'GR-TTMPC-00006', memberId: 'TTMPCM-063', posId: 'POS - 001', date: 'Feb. 10, 2026 - 1:15 PM', amount: 'P1,100.00', txStatus: 'Completed', payment: 'Paid', balance: 'P0.00' },
  { id: 'GR-TTMPC-00007', memberId: 'TTMPCM-046', posId: 'POS - 001', date: 'Feb. 10, 2026 - 1:40 PM', amount: 'P750.00', txStatus: 'Completed', payment: 'Paid', balance: 'P0.00' },
  { id: 'GR-TTMPC-00008', memberId: 'TTMPCM-202', posId: 'POS - 001', date: 'Feb. 10, 2026 - 2:25 PM', amount: 'P650.00', txStatus: 'Completed', payment: 'Paid', balance: 'P0.00' },
  { id: 'GR-TTMPC-00009', memberId: 'TTMPCM-182', posId: 'POS - 001', date: 'Feb. 10, 2026 - 2:38 PM', amount: 'P800.00', txStatus: 'Pending', payment: 'On Credit', balance: 'P800.00' },
];

const Cashier_Grocery = () => {
    const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('All');
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("GROCERY_TRANSACTIONS")
        .select("*")
        .order("TransactionDate", { ascending: false })
        .limit(200);
      if (cancelled) return;
      if (!error) setTransactions(data || []);
      setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const rows = useMemo(() => transactions.map((t) => ({
    id: t.GroceryID,
    memberId: t.pos_member_ref || "—",
    posId: "POS - 001",
    date: t.TransactionDate ? new Date(t.TransactionDate).toLocaleString() : "",
    amount: `P${Number(t.GroceryAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
    txStatus: t.Status === "Completed" ? "Completed" : "Pending",
    payment: t.Status === "Completed" ? "Paid" : "On Credit",
    balance: `P${Number(t.balance_due || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
    rawStatus: t.Status,
  })), [transactions]);

  const filteredRows = useMemo(() => {
    if (activeTab === "Paid") return rows.filter((r) => r.rawStatus === "Completed");
    if (activeTab === "On Credit") return rows.filter((r) => r.rawStatus === "On Credit");
    return rows;
  }, [rows, activeTab]);

  const totals = useMemo(() => {
    const paid = rows.filter((r) => r.rawStatus === "Completed").length;
    const credit = rows.filter((r) => r.rawStatus === "On Credit").length;
    const sum = transactions.reduce((s, t) => s + Number(t.GroceryAmount || 0), 0);
    return { count: rows.length, paid, credit, sum };
  }, [rows, transactions]);
  


  // Helper component for the status badges
  const StatusBadge = ({ type, text }) => {
    const isSuccess = text === 'Completed' || text === 'Paid';
    return (
      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${
        isSuccess 
          ? 'bg-green-50 text-green-700 border-green-200' 
          : 'bg-orange-50 text-orange-700 border-orange-200'
      }`}>
        <span className={`w-1.5 h-1.5 rounded-full ${isSuccess ? 'bg-green-500' : 'bg-orange-500'}`}></span>
        {text}
      </span>
    );
  };

  return (
   <div className="flex min-h-screen bg-gray-50">
         
         {/* SIDEBAR */}
         {/* FIX 2: Ensure sidebar is h-full and can scroll internally if menus get too long */}
        <StaffSidebar portal="Cashier" items={cashierNav} />
      <div className="flex-1 min-w-0 flex flex-col h-screen overflow-y-auto">
        
        {/* Top Header */}
        <StaffTopbar portal="Cashier" notifications={<LoanNotificationBell role="cashier" />} sticky />

        {/* Page Content */}
        <main className="p-8 max-w-7xl mx-auto w-full">
          <Breadcrumb portal="Cashier" page="Grocery" />

          {/* Page Title & Actions */}


          {/* Summary Cards */}
          <StatCardRow cols={3}>
            <StatCard
              label="Total Transactions"
              value={
                <>
                  {totals.count}{" "}
                  <span className="text-sm font-normal text-gray-500">
                    ₱{totals.sum.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </>
              }
              icon={ShoppingCart}
              iconColor="text-green-600"
            />
            <StatCard label="Paid" value={totals.paid} icon={CheckCircle2} iconColor="text-green-600" />
            <StatCard label="On Credit" value={totals.credit} icon={AlertCircle} iconColor="text-orange-500" />
          </StatCardRow>

          {/* Main Data Table Area */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            
            <TableToolbar
              title="Grocery Transactions"
              subtitle={`Showing ${filteredRows.length} of ${rows.length} transactions`}
              tabs={[
                { value: "All", label: "All", count: totals.count },
                { value: "Paid", label: "Paid", count: totals.paid },
                { value: "On Credit", label: "On Credit", count: totals.credit },
              ]}
              activeTab={activeTab}
              onTabChange={setActiveTab}
            >
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by Grocery ID, Member ID, or POS ID..."
                  className="w-full bg-white h-8 rounded-lg border border-gray-200 pl-8 pr-3 text-[11px] font-semibold focus:outline-none focus:ring-2 focus:ring-[#2C7A3F]/40"
                />
              </div>

              <button className="flex items-center gap-1.5 h-8 px-2.5 bg-white border border-gray-200 rounded-lg text-[11px] font-semibold text-gray-700 hover:bg-gray-50">
                <Calendar className="w-3.5 h-3.5 text-gray-400" />
                April 2026
                <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
              </button>

              <button className="flex items-center gap-1.5 h-8 px-2.5 bg-white border border-gray-200 rounded-lg text-[11px] font-semibold text-gray-700 hover:bg-gray-50">
                <Download className="w-3.5 h-3.5 text-gray-400" />
                Export List
              </button>
            </TableToolbar>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-primary-deep text-[10px] uppercase tracking-wider text-white font-extrabold">
                    <th className="p-5 font-bold">Grocery ID</th>
                    <th className="p-5 font-bold">Member ID</th>
                    <th className="p-5 font-bold">POS ID</th>
                    <th className="p-5 font-bold">Transaction Date</th>
                    <th className="p-5 font-bold text-right">Amount</th>
                    <th className="p-5 font-bold text-center">TX Status</th>
                    <th className="p-5 font-bold text-center">Payment</th>
                    <th className="p-5 font-bold text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <TableStateRow colSpan={8} variant="loading" label="Loading..." />
                  ) : filteredRows.length === 0 ? (
                    <TableStateRow colSpan={8} variant="empty" icon={ShoppingCart} label="No transactions yet." />
                  ) : filteredRows.map((tx) => (
                    <tr key={tx.id} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                      <td className="p-5 font-medium text-gray-700">{tx.id}</td>
                      <td className="p-5 font-medium text-gray-700">{tx.memberId}</td>
                      <td className="p-5 text-gray-500">{tx.posId}</td>
                      <td className="p-5 text-gray-500">{tx.date}</td>
                      <td className="p-5 font-medium text-gray-900">{tx.amount}</td>
                      <td className="p-5">
                        <StatusBadge type="status" text={tx.txStatus} />
                      </td>
                      <td className="p-5">
                        <StatusBadge type="payment" text={tx.payment} />
                      </td>
                      <td className={`p-5 font-semibold ${tx.balance !== 'P0.00' ? 'text-red-500' : 'text-gray-900'}`}>
                        {tx.balance}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="p-5 border-t border-gray-200 flex justify-center items-center gap-2">
              <button className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-300 text-gray-500 hover:bg-gray-50">
                <ChevronLeft className="w-4 h-4" />
              </button>
              {[1, 2, 3, 4, 5].map((page) => (
                <button 
                  key={page} 
                  className={`w-8 h-8 flex items-center justify-center rounded-full text-sm font-medium ${
                    page === 1 
                      ? 'bg-green-600 text-white' 
                      : 'border border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {page}
                </button>
              ))}
              <button className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-300 text-gray-500 hover:bg-gray-50">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

          </div>
        </main>
      </div>
    </div>
  );
};

export default Cashier_Grocery;
