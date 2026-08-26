import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, NavLink, Link } from "react-router-dom";
import StaffSidebar from "../../components/StaffSidebar";
import { cashierNav } from "../../components/StaffSidebar/configs/cashier";
import { UserAuth } from "../../contex/AuthContext";
import { supabase } from "../../supabaseClient";
import { PortalTopbarIdentity } from "../../components/PortalIdentity";
import LoanNotificationBell from "../../components/LoanNotificationBell";
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
      <div className="flex-1 flex flex-col h-screen overflow-y-auto">
        
        {/* Top Header */}
        <header className="sticky top-0 z-10 bg-white h-16 shadow-sm flex items-center justify-end px-8 shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <input 
              type="text" 
              placeholder="Search..."
              className="bg-gray-50 w-52 h-10 rounded-lg border border-gray-200 px-4 pl-9 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <LoanNotificationBell role="cashier" />
          <img src="/img/cashier-profile.png" alt="Profile" className="ml-4 w-8 h-8 rounded-full object-cover bg-gray-200" />
          <PortalTopbarIdentity className="font-medium text-sm text-gray-700 ml-2" fallbackRole="Cashier" />
        </header>

        {/* Page Content */}
        <main className="p-8 max-w-7xl mx-auto w-full">
          
          {/* Page Title & Actions */}
         

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {/* Total Transactions Card */}
            <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm flex items-center gap-4">
              <div className="bg-green-50 p-3 rounded-lg text-green-600">
                <ShoppingCart className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-bold text-gray-500 tracking-wider uppercase mb-1">Total Transactions</p>
                <div className="flex items-baseline gap-2">
                  <h2 className="text-2xl font-bold text-gray-900">{totals.count}</h2>
                  <span className="text-sm text-gray-500">P{totals.sum.toLocaleString(undefined,{minimumFractionDigits:2})}</span>
                </div>
              </div>
            </div>

            {/* Paid Card */}
            <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm flex items-center gap-4">
              <div className="bg-green-50 p-3 rounded-lg text-green-600">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-bold text-gray-500 tracking-wider uppercase mb-1">Paid</p>
                <h2 className="text-2xl font-bold text-gray-900">{totals.paid}</h2>
              </div>
            </div>

            {/* On Credit Card */}
            <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm flex items-center gap-4">
              <div className="bg-orange-50 p-3 rounded-lg text-orange-500">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-bold text-gray-500 tracking-wider uppercase mb-1">On Credit</p>
                <h2 className="text-2xl font-bold text-gray-900">{totals.credit}</h2>
              </div>
            </div>
          </div>

          {/* Main Data Table Area */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            
            {/* Tabs */}
            <div className="flex border-b border-gray-200 px-6">
              {[
                { label: 'All', count: totals.count, color: 'green' },
                { label: 'Paid', count: totals.paid, color: 'blue' },
                { label: 'On Credit', count: totals.credit, color: 'orange' }
              ].map((tab) => (
                <button
                  key={tab.label}
                  onClick={() => setActiveTab(tab.label)}
                  className={`flex items-center gap-2 px-4 py-4 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.label 
                      ? 'border-green-500 text-green-700' 
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {tab.label}
                  <span className={`px-2 py-0.5 rounded-full text-xs ${
                    tab.color === 'green' ? 'bg-green-100 text-green-700' :
                    tab.color === 'blue' ? 'bg-blue-100 text-blue-700' :
                    'bg-orange-100 text-orange-700'
                  }`}>
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>

            {/* Table Toolbar */}
            <div className="p-6 flex flex-col md:flex-row justify-between items-center gap-4 border-b border-gray-100">
              <h2 className="text-xl font-bold text-[#1a3b47]">Grocery Transactions</h2>
              
              <div className="flex flex-1 justify-end items-center gap-3 w-full md:w-auto">
                <div className="relative max-w-sm w-full">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400"/>
                  <input 
                    type="text" 
                    placeholder="Search by Grocery ID, Member ID, or POS ID..."
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
                
                <button className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  April 2026
                  <ChevronDown className="w-4 h-4 text-gray-400 ml-1" />
                </button>
                
                <button className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
                  <Download className="w-4 h-4 text-gray-400" />
                  Export List
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-green-700 text-[10px] uppercase tracking-wider text-white font-extrabold">
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
                    <tr><td colSpan={8} className="p-8 text-center text-gray-400 text-sm">Loading…</td></tr>
                  ) : filteredRows.length === 0 ? (
                    <tr><td colSpan={8} className="p-8 text-center text-gray-400 text-sm">No transactions yet.</td></tr>
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
