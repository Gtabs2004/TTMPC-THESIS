import React, { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { useRealtimeVersion } from "../../hooks/useRealtimeRefetch";
import { StatCard, StatCardRow } from "../../components/StatCard";
import { TableToolbar } from "../../components/TableToolbar";
import StaffSidebar from "../../components/StaffSidebar";
import { bookkeeperNav } from "../../components/StaffSidebar/configs/bookkeeper";
import { UserAuth } from "../../contex/AuthContext";
import { supabase } from "../../supabaseClient";

const peso = (n) => `P${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

const INITIAL_COLORS = [
  "text-teal-600 bg-teal-50",
  "text-green-600 bg-green-50",
  "text-blue-600 bg-blue-50",
  "text-gray-600 bg-gray-100",
  "text-purple-600 bg-purple-50",
  "text-orange-600 bg-orange-50",
];

const periodKey = (date, filter) => {
  const d = new Date(date);
  if (filter === "Daily") {
    return d.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  }
  if (filter === "Weekly") {
    const start = new Date(d);
    const day = start.getDay() || 7;
    start.setDate(start.getDate() - (day - 1));
    const year = start.getFullYear();
    const firstJan = new Date(year, 0, 1);
    const weekNum = Math.ceil((((start - firstJan) / 86400000) + firstJan.getDay() + 1) / 7);
    return `Week ${weekNum}, ${year}`;
  }
  if (filter === "Monthly") {
    return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }
  return String(d.getFullYear());
};
import StaffTopbar from "../../components/StaffTopbar";
import LoanNotificationBell from "../../components/LoanNotificationBell";
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
  ArrowLeft,
  BookOpen,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Briefcase,
  Wallet,
  Coins,
  PiggyBank,
  ShieldAlert,
  Brain,
} from "lucide-react";

const Grocery_Ledger = () => {
    const navigate = useNavigate();
  
  // State for toggles
  const [activeFilter, setActiveFilter] = useState("Daily");
  const [expandedDates, setExpandedDates] = useState([]);
  const [expandedMembers, setExpandedMembers] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [memberLookup, setMemberLookup] = useState({});
  const [loading, setLoading] = useState(true);
  const rtVersion = useRealtimeVersion(["GROCERY_TRANSACTIONS"]);
  const rtSeen = useRef(rtVersion);
  useEffect(() => {
    const silent = rtSeen.current !== rtVersion;
    rtSeen.current = rtVersion;
    let cancelled = false;
    const load = async () => {
      if (!silent) setLoading(true);
      const { data: txs } = await supabase
        .from("GROCERY_TRANSACTIONS")
        .select("*")
        .eq("Status", "Completed")
        .order("TransactionDate", { ascending: false })
        .limit(2000);
      const { data: members } = await supabase
        .from("member")
        .select("id, membership_id, first_name, last_name")
        .limit(2000);
      if (cancelled) return;
      const lookup = {};
      (members || []).forEach((m) => {
        lookup[m.id] = m;
        if (m.membership_id) lookup[m.membership_id] = m;
      });
      setMemberLookup(lookup);
      setTransactions(txs || []);
      if (!silent) setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, [rtVersion]);

  const currentLedgerData = useMemo(() => {
    const groups = new Map();
    for (const t of transactions) {
      const key = periodKey(t.TransactionDate, activeFilter);
      if (!groups.has(key)) groups.set(key, { date: key, members: new Map() });
      const g = groups.get(key);
      const memberKey = t.membership_number_id || t.pos_member_ref || "unknown";
      if (!g.members.has(memberKey)) {
        const m = memberLookup[t.membership_number_id] || memberLookup[t.pos_member_ref];
        const name = m ? `${m.first_name || ""} ${m.last_name || ""}`.trim() || m.membership_id : (t.pos_member_ref || "Unknown");
        g.members.set(memberKey, {
          id: `${key}-${memberKey}`,
          name,
          memberId: m?.membership_id || t.pos_member_ref || "—",
          initial: (name[0] || "?").toUpperCase(),
          initialColor: INITIAL_COLORS[Math.abs(memberKey.split("").reduce((s,c)=>s+c.charCodeAt(0),0)) % INITIAL_COLORS.length],
          cash: 0, count: 0,
          transactions: [],
        });
      }
      const mm = g.members.get(memberKey);
      const amt = Number(t.GroceryAmount || 0);
      mm.cash += amt;
      mm.count += 1;
      mm.transactions.push({
        posId: t.GroceryID,
        date: new Date(t.TransactionDate).toLocaleString(),
        type: "Cash",
        status: "Paid",
        amount: peso(amt),
      });
    }
    return Array.from(groups.values()).map((g) => {
      const members = Array.from(g.members.values()).map((m) => ({
        ...m,
        txnText: `${m.count} txn${m.count === 1 ? "" : "s"}`,
        cashAmount: peso(m.cash),
      }));
      const totalCash = members.reduce((s, m) => s + m.cash, 0);
      return {
        date: g.date,
        memberCount: members.length,
        totalCash: peso(totalCash),
        members,
      };
    });
  }, [transactions, memberLookup, activeFilter]);

  const summary = useMemo(() => {
    let cash = 0;
    for (const t of transactions) {
      const amt = Number(t.GroceryAmount || 0);
      cash += amt;
    }
    return { cash, total: transactions.length };
  }, [transactions]);

  useEffect(() => {
    if (currentLedgerData.length > 0) {
      setExpandedDates([currentLedgerData[0].date]);
      if (currentLedgerData[0].members.length > 0) {
        setExpandedMembers([currentLedgerData[0].members[0].id]);
      }
    }
  }, [activeFilter, transactions]);



  const toggleDate = (dateString) => {
    setExpandedDates(prev => 
      prev.includes(dateString) ? prev.filter(d => d !== dateString) : [...prev, dateString]
    );
  };

  const toggleMember = (memberId) => {
    setExpandedMembers(prev => 
      prev.includes(memberId) ? prev.filter(id => id !== memberId) : [...prev, memberId]
    );
  };

  return (
    <div className="flex min-h-screen bg-[#fafafa]">
      
      {/* --- SIDEBAR --- */}
      <StaffSidebar portal="Bookkeeper" items={bookkeeperNav} />

      {/* --- MAIN AREA --- */}
      <div className="flex-1 flex flex-col min-w-0">
        <StaffTopbar portal="Bookkeeper" notifications={<LoanNotificationBell role="bookkeeper" />} sticky />

        {/* Page Content */}
        <main className="animate-page-in p-8 max-w-[1200px] w-full mx-auto">
          
          {/* Top Navigation & Title */}
          <div className="flex justify-between items-start mb-8">
            <div className="flex items-start gap-6">
              <button 
                onClick={() => navigate('/grocery')} 
                className="flex items-center text-sm font-medium text-gray-500 hover:text-gray-800 transition-colors mt-1"
              >
                <ArrowLeft className="w-4 h-4 mr-1" />
                Back
              </button>
              
              <div>
                <div className="flex items-center gap-3">
                  <BookOpen className="w-6 h-6 text-green-700" />
                  <h1 className="font-bold text-2xl text-[#1a3b47]">Ledger</h1>
                </div>
                <p className="text-sm text-gray-500 mt-1 ml-9">{summary.total} total records - All periods</p>
              </div>
            </div>
            
            <button className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 shadow-sm transition-colors">
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
          </div>

          {/* Summary Cards */}
          <StatCardRow cols={2}>
            <StatCard label="Cash Sales" value={peso(summary.cash)} />
            <StatCard label="Cash Transactions" value={summary.total} />
          </StatCardRow>

          {/* Transaction Ledger List */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <TableToolbar
              title="Transaction Ledger"
              subtitle={`Grouped by ${activeFilter.toLowerCase()} — click a member to expand transactions`}
              tabs={['Daily', 'Weekly', 'Monthly', 'Yearly'].map((filter) => ({ value: filter, label: filter }))}
              activeTab={activeFilter}
              onTabChange={setActiveFilter}
            />

            {/* Render Groups based on Active Filter */}
            <div className="space-y-6 p-6">
              {loading ? (
                <div className="py-12 text-center text-gray-400 text-sm">Loading…</div>
              ) : currentLedgerData.length === 0 ? (
                <div className="py-12 text-center text-gray-400 text-sm">No grocery transactions yet.</div>
              ) : currentLedgerData.map((group, gIdx) => {
                const isGroupExpanded = expandedDates.includes(group.date);

                return (
                  <div key={gIdx} className="flex flex-col">
                    {/* Date Header Row */}
                    <div 
                      className="flex justify-between items-center py-2 cursor-pointer group"
                      onClick={() => toggleDate(group.date)}
                    >
                      <div className="flex items-center gap-2">
                        {isGroupExpanded ? (
                          <ChevronDown className="w-5 h-5 text-green-600" />
                        ) : (
                          <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-gray-600" />
                        )}
                        <h3 className="font-bold text-gray-900">{group.date}</h3>
                        <span className="text-sm text-gray-400">({group.memberCount} members)</span>
                      </div>
                      
                      <div className="flex items-center gap-2 text-sm">
                        <div className="flex items-center gap-1">
                          <span className="text-gray-500">Cash sales</span>
                          <span className="font-semibold text-green-700">{group.totalCash}</span>
                        </div>
                      </div>
                    </div>

                    {/* Group Items */}
                    {isGroupExpanded && (
                      <div className="mt-4 space-y-3">
                        {group.members.map((member) => {
                          const isMemberExpanded = expandedMembers.includes(member.id);

                          return (
                            <div 
                              key={member.id} 
                              className={`border rounded-xl transition-all ${
                                isMemberExpanded ? 'border-gray-200 shadow-sm' : 'border-gray-100 hover:border-gray-200'
                              }`}
                            >
                              {/* Member Row */}
                              <div 
                                className="flex items-center justify-between p-4 cursor-pointer"
                                onClick={() => toggleMember(member.id)}
                              >
                                <div className="flex items-center gap-4">
                                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${member.initialColor}`}>
                                    {member.initial}
                                  </div>
                                  <div>
                                    <p className="font-bold text-sm text-gray-900">{member.name}</p>
                                    <p className="text-xs text-gray-400">{member.memberId} - {member.txnText}</p>
                                  </div>
                                </div>

                                <div className="flex items-center gap-8">
                                  <div className="text-right hidden sm:block">
                                    <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider mb-0.5">Cash</p>
                                    <span className="text-sm font-semibold text-green-600">{member.cashAmount}</span>
                                  </div>
                                  
                                  {/* Total Amount */}
                                  <div className="flex items-center gap-4">
                                    <span className="font-bold text-gray-900">{member.totalAmount}</span>
                                    {isMemberExpanded ? (
                                      <ChevronUp className="w-5 h-5 text-gray-400" />
                                    ) : (
                                      <ChevronRight className="w-5 h-5 text-gray-400" />
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Expanded Transaction Details */}
                              {isMemberExpanded && member.transactions && (
                                <div className="border-t border-gray-100 bg-gray-50/50 p-4 rounded-b-xl flex justify-between items-center">
                                  <div className="flex items-center gap-4 text-xs">
                                    <span className="text-gray-400 font-mono">{member.transactions[0].posId}</span>
                                    <span className="text-gray-500">{member.transactions[0].date}</span>
                                    <span className="px-2 py-1 bg-white border border-gray-200 rounded text-gray-600 font-medium">
                                      {member.transactions[0].type}
                                    </span>
                                  </div>
                                  
                                  <div className="flex items-center gap-4">
                                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700">
                                      <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                                      Paid
                                    </span>
                                    <span className="text-sm font-bold text-gray-900">{member.transactions[0].amount}</span>
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

export default Grocery_Ledger;