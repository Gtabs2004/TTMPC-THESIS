import React, { useEffect, useMemo, useState, useRef } from "react";
import { useRealtimeVersion } from "../../hooks/useRealtimeRefetch";
import { StatCard, StatCardRow } from "../../components/StatCard";
import { TableToolbar } from "../../components/TableToolbar";
import StaffSidebar from "../../components/StaffSidebar";
import { bookkeeperNav } from "../../components/StaffSidebar/configs/bookkeeper";
import StaffTopbar from "../../components/StaffTopbar";
import LoanNotificationBell from "../../components/LoanNotificationBell";
import TableStateRow from "../../components/TableStateRow";
import Pagination from "../../components/Pagination";
import {
  downloadGroceryCsv,
  fetchGroceryTransactions,
  fetchMemberLookup,
  filterGroceryRows,
  toGroceryRow,
} from "../../utils/groceryTransactions";
import {
  LayoutDashboard,
  Users,
  FileText,
  CreditCard,
  Calculator,
  Activity,
  BarChart3,
  History,
  Search,
  Bell,
  ShoppingCart,
  CheckCircle2,
  AlertCircle,
  Wifi,
  RefreshCw,
  BookOpen,
  Download,
  Briefcase,
  Wallet,
  Coins,
  PiggyBank,
  ShieldAlert,
  Brain,
} from "lucide-react";

const PAGE_SIZE = 10;

const Grocery = () => {
  const [activeTab, setActiveTab] = useState('All');
  const [transactions, setTransactions] = useState([]);
  const [memberLookup, setMemberLookup] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [month, setMonth] = useState("");
  const [pageState, setPage] = useState(1);
  const rtVersion = useRealtimeVersion(["GROCERY_TRANSACTIONS"]);
  const rtSeen = useRef(rtVersion);
  useEffect(() => {
    const silent = rtSeen.current !== rtVersion;
    rtSeen.current = rtVersion;
    let cancelled = false;
    const load = async () => {
      if (!silent) setLoading(true);
      try {
        const [data, lookup] = await Promise.all([
          fetchGroceryTransactions(),
          fetchMemberLookup(),
        ]);
        if (cancelled) return;
        setTransactions(data);
        setMemberLookup(lookup);
        setLoadError("");
      } catch (error) {
        if (cancelled) return;
        console.error("grocery transactions load failed", error);
        setLoadError(error?.message || "Unable to load grocery transactions.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [rtVersion]);

  const rows = useMemo(
    () => transactions.map((tx) => toGroceryRow(tx, memberLookup)),
    [transactions, memberLookup]
  );
  const filteredRows = useMemo(
    () => filterGroceryRows(rows, { activeTab, search: searchQuery, month }),
    [rows, activeTab, searchQuery, month]
  );
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  // Clamp so a shrinking list (realtime refetch) never strands us past the last page.
  const page = Math.min(pageState, totalPages);
  const paginatedRows = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [activeTab, searchQuery, month]);

  const totals = useMemo(() => {
    const paid = rows.filter((r) => r.rawStatus === "Completed").length;
    const credit = rows.filter((r) => r.rawStatus === "On Credit").length;
    const sum = rows.reduce((total, row) => total + row.amount, 0);
    return { count: rows.length, paid, credit, sum };
  }, [rows]);

  const hasFilters = searchQuery || month || activeTab !== "All";
  const clearFilters = () => {
    setSearchQuery("");
    setMonth("");
    setActiveTab("All");
  };
  


  // Helper component for the status badges
  const StatusBadge = ({ text }) => {
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
      
      {/* --- SIDEBAR --- */}
      <StaffSidebar portal="Bookkeeper" items={bookkeeperNav} />
      

      {/* --- MAIN CONTENT AREA --- */}
      
      <div className="flex-1 min-w-0 flex flex-col h-screen overflow-y-auto">
        
        {/* Top Header */}
        <StaffTopbar portal="Bookkeeper" notifications={<LoanNotificationBell role="bookkeeper" />} sticky />

        {/* Page Content */}
        <main className="animate-page-in p-8 max-w-7xl mx-auto w-full">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">Grocery</h1>

          {/* Summary Cards */}
          <StatCardRow cols={4}>
            <StatCard label="Total Transactions" value={totals.count} icon={ShoppingCart} iconColor="text-green-600" />
            <StatCard label="Total Amount" value={`₱${totals.sum.toLocaleString(undefined, { minimumFractionDigits: 2 })}`} icon={Coins} iconColor="text-green-600" />
            <StatCard label="Paid" value={totals.paid} icon={CheckCircle2} iconColor="text-green-600" />
            <StatCard label="On Credit" value={totals.credit} icon={AlertCircle} iconColor="text-orange-500" />
          </StatCardRow>

          {/* Main Data Table Area */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            
            <TableToolbar
              title="Grocery Transactions"
              subtitle={`Showing ${filteredRows.length ? (page - 1) * PAGE_SIZE + 1 : 0}-${Math.min(page * PAGE_SIZE, filteredRows.length)} of ${filteredRows.length} matching transactions`}
              tabs={[
                { value: "All", label: "All", count: totals.count },
                { value: "Paid", label: "Paid", count: totals.paid },
                { value: "On Credit", label: "On Credit", count: totals.credit },
              ]}
              activeTab={activeTab}
              onTabChange={(tab) => { setActiveTab(tab); setPage(1); }}
              rightClassName="flex-nowrap overflow-x-auto"
            >
              <div className="relative w-64 shrink-0">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  aria-label="Search grocery ID, member ID, or POS event ID"
                  placeholder="Search grocery, member, or POS event ID"
                  className="w-full bg-white h-8 rounded-lg border border-gray-200 pl-8 pr-3 text-[11px] font-semibold focus:outline-none focus:ring-2 focus:ring-[#2C7A3F]/40"
                />
              </div>

              <label className="flex shrink-0 items-center gap-2 text-[11px] font-semibold text-gray-600">
                <span>Month</span>
                <input
                  type="month"
                  value={month}
                  onChange={(event) => setMonth(event.target.value)}
                  aria-label="Filter by month"
                  className="h-8 rounded-lg border border-gray-200 bg-white px-2 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#2C7A3F]/40"
                />
              </label>

              <button
                type="button"
                onClick={() => downloadGroceryCsv(filteredRows)}
                disabled={loading || filteredRows.length === 0}
                className="flex shrink-0 items-center gap-1.5 h-8 px-2.5 bg-white border border-gray-200 rounded-lg text-[11px] font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5 text-gray-400" />
                Export List
              </button>
              {hasFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="h-8 shrink-0 px-2 text-[11px] font-semibold text-green-800 hover:underline"
                >
                  Clear filters
                </button>
              )}
            </TableToolbar>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-primary-deep text-[10px] uppercase tracking-wider text-white font-extrabold">
                    <th className="p-5 font-bold">Grocery ID</th>
                    <th className="p-5 font-bold">Member</th>
                    <th className="p-5 font-bold">POS Event ID</th>
                    <th className="p-5 font-bold">Transaction Date</th>
                    <th className="p-5 font-bold">Amount</th>
                    <th className="p-5 font-bold" title="Paid: the member settled this purchase at the till. On Credit: it was charged to the member's account and the Balance is still owed.">Payment</th>
                    <th className="p-5 font-bold">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <TableStateRow colSpan={7} variant="loading" label="Loading..." />
                  ) : loadError ? (
                    <TableStateRow colSpan={7} variant="empty" icon={AlertCircle} label="Could not load grocery transactions" sublabel={loadError} />
                  ) : filteredRows.length === 0 ? (
                    <TableStateRow
                      colSpan={7}
                      variant="empty"
                      icon={ShoppingCart}
                      label={rows.length ? "No transactions match these filters." : "No transactions yet."}
                    />
                  ) : paginatedRows.map((tx) => (
                    <tr key={tx.id} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                      <td className="p-5 text-sm font-medium text-gray-700">{tx.id}</td>
                      <td className="p-5 text-sm">
                        <div className="font-medium text-gray-900">{tx.memberName}</div>
                        <div className="text-xs text-gray-500">{tx.memberId}</div>
                      </td>
                      <td className="p-5 text-sm text-gray-500">{tx.posEventId}</td>
                      <td className="p-5 text-sm text-gray-500">{tx.dateLabel}</td>
                      <td className="p-5 text-sm font-medium text-gray-900">₱{tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className="p-5 text-sm">
                         <StatusBadge text={tx.payment} />
                      </td>
                      <td className={`p-5 text-sm font-semibold ${tx.balance > 0 ? 'text-red-500' : 'text-gray-900'}`}>
                        ₱{tx.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {!loading && (
              <Pagination page={page} totalPages={totalPages} onChange={setPage} />
            )}

          </div>
        </main>
      </div>
    </div>
  );
};

export default Grocery;