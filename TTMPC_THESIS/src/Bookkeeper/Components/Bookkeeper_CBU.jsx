import React, { useCallback, useEffect, useMemo, useState } from "react";
import { StatCard, StatCardRow } from "../../components/StatCard";
import StaffSidebar from "../../components/StaffSidebar";
import { bookkeeperNav } from "../../components/StaffSidebar/configs/bookkeeper";
import {
  AlertCircle,
  Banknote,
  Clock,
  RefreshCw,
  Search,
  Users,
  Wallet,
  Calculator
} from "lucide-react";

import { useNotification } from "../../contex/NotificationContext";
import StaffTopbar from "../../components/StaffTopbar";
import LoanNotificationBell from "../../components/LoanNotificationBell";
import Breadcrumb from "../../components/Breadcrumb";
import Pagination from "../../components/Pagination";
import InterestOnShareCapitalModal from "../../components/InterestOnShareCapitalModal";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";
const PAGE_SIZE = 5;

const formatCurrency = (value) =>
  `₱${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const formatDate = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "2-digit" });
};

const isSameMonth = (value, ref) => {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date.getFullYear() === ref.getFullYear() && date.getMonth() === ref.getMonth();
};

// Same two endpoints the Cashier CBU page uses. The backend talks to
// Supabase with the service-role key, so this read-only bookkeeper view does
// not depend on the `is_cbu_staff()` RLS policy (that only gates direct
// browser-side Supabase calls, which this page never makes).
const useCbuLedger = () => {
  const [members, setMembers] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState(null);

  const fetchCbu = useCallback(async () => {
    setStatus("loading");
    setError(null);
    try {
      const [membersRes, txRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/cashier/cbu/members`, { headers: { Accept: "application/json" } }),
        fetch(`${API_BASE_URL}/api/cashier/cbu/transactions`, { headers: { Accept: "application/json" } }),
      ]);

      const membersPayload = await membersRes.json().catch(() => ({}));
      const txPayload = await txRes.json().catch(() => ({}));

      if (!membersRes.ok || !membersPayload?.success) {
        throw new Error(membersPayload?.detail || "Failed to load CBU members.");
      }
      if (!txRes.ok || !txPayload?.success) {
        throw new Error(txPayload?.detail || "Failed to load CBU transactions.");
      }

      setMembers(Array.isArray(membersPayload.data) ? membersPayload.data : []);
      setTransactions(Array.isArray(txPayload.data) ? txPayload.data : []);
      setStatus("ready");
    } catch (err) {
      setError(err?.message || "Unable to load CBU data.");
      setMembers([]);
      setTransactions([]);
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    fetchCbu();
  }, [fetchCbu]);

  return { members, transactions, status, error, refresh: fetchCbu };
};

const Bookkeeper_CBU = () => {
  const { addNotification } = useNotification();
  const { members, transactions, status, error, refresh } = useCbuLedger();

  const [memberSearch, setMemberSearch] = useState("");
  const [memberPage, setMemberPage] = useState(1);
  const [txPage, setTxPage] = useState(1);
  const [showInterestModal, setShowInterestModal] = useState(false);

  const totals = useMemo(() => {
    const now = new Date();
    const totalBalance = members.reduce((sum, m) => sum + Number(m.current_balance || 0), 0);
    const monthContributions = transactions
      .filter((t) => isSameMonth(t.transaction_date, now))
      .reduce((sum, t) => sum + Number(t.capital_added || 0), 0);
    return { totalBalance, monthContributions };
  }, [members, transactions]);

  const filteredMembers = useMemo(() => {
    const key = memberSearch.trim().toLowerCase();
    if (!key) return members;
    return members.filter(
      (row) =>
        String(row.member_id || "").toLowerCase().includes(key) ||
        String(row.member_name || "").toLowerCase().includes(key)
    );
  }, [memberSearch, members]);

  const totalMemberPages = Math.max(1, Math.ceil(filteredMembers.length / PAGE_SIZE));
  const paginatedMembers = useMemo(() => {
    const start = (memberPage - 1) * PAGE_SIZE;
    return filteredMembers.slice(start, start + PAGE_SIZE);
  }, [filteredMembers, memberPage]);

  const totalTxPages = Math.max(1, Math.ceil(transactions.length / PAGE_SIZE));
  const paginatedTx = useMemo(() => {
    const start = (txPage - 1) * PAGE_SIZE;
    return transactions.slice(start, start + PAGE_SIZE);
  }, [transactions, txPage]);

  useEffect(() => setMemberPage(1), [memberSearch, members]);
  useEffect(() => setTxPage(1), [transactions]);

  const handleRefresh = async () => {
    await refresh();
    addNotification("CBU ledger refreshed.", "success");
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      <StaffSidebar portal="Bookkeeper" items={bookkeeperNav} />

      <div className="flex-1 flex flex-col h-screen overflow-y-auto">
        <StaffTopbar portal="Bookkeeper" notifications={<LoanNotificationBell role="bookkeeper" />} />

        <main className="p-6">
          <div className="mb-6 ">
            <div className="flex items-center justify-between gap-4 mb-4">
              <div>
                <Breadcrumb portal="Bookkeeper" page="Capital Build-Up" />
                <h1 className="text-xl font-bold text-gray-900">Capital Build-Up</h1>
                <p className="text-xs text-gray-500 mt-0.5">
                  Read-only ledger of member CBU/share balances and contributions
                </p>
              </div>
              <button
                onClick={handleRefresh}
                className="px-3 py-1.5 rounded-md border border-gray-300 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50 inline-flex items-center gap-1.5"
              >
                <RefreshCw size={13} />
                Refresh
              </button>
            </div>

            <StatCardRow cols={3}>
              <StatCard
                label="Total CBU Balance"
                value={formatCurrency(totals.totalBalance)}
                icon={Wallet}
                iconColor="text-green-600"
                subtext={`Across ${members.length} member accounts`}
              />
              <StatCard
                label="Member Accounts"
                value={members.length}
                icon={Users}
                iconColor="text-emerald-600"
                subtext="With a recorded CBU balance"
              />
              <StatCard
                label="This Month's Contributions"
                value={formatCurrency(totals.monthContributions)}
                icon={Banknote}
                iconColor="text-amber-600"
                subtext="Capital added in the current month"
              />
            </StatCardRow>

            {status === "loading" && (
              <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700 flex items-center gap-2">
                <Clock size={13} />
                Loading CBU ledger...
              </div>
            )}

            {status === "error" && (
              <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 flex items-center gap-2">
                <AlertCircle size={13} />
                {error}
              </div>
            )}

          </div>

          {/* MEMBER BALANCES */}
          <div className="border border-gray-200 rounded-lg shadow-sm overflow-hidden bg-white mb-8">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
              <h3 className="text-sm font-bold text-gray-900">Member Accounts</h3>
              <div className="flex items-center gap-3">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    value={memberSearch}
                    onChange={(event) => setMemberSearch(event.target.value)}
                    placeholder="Search by Member ID or Name"
                    className="w-full bg-gray-50 border border-gray-300 rounded-md pl-9 pr-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-green-500"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => setShowInterestModal(true)}
                  className="inline-flex items-center gap-1.5 rounded-md bg-green-600 hover:bg-green-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors shrink-0"
                >
                  <Calculator className="w-3.5 h-3.5" />
                  ISC Calculator
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-green-700 text-[10px] uppercase tracking-wider text-white font-extrabold">
                    <th className="p-5 font-bold">Member ID</th>
                    <th className="p-5 font-bold">Member Name</th>
                    <th className="p-5 font-bold text-right">Current Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {status === "loading" ? (
                    <tr>
                      <td colSpan={3} className="p-5 text-center text-sm text-gray-500">
                        Loading members...
                      </td>
                    </tr>
                  ) : paginatedMembers.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="p-5 text-center text-sm text-gray-500 font-medium">
                        No member accounts matched your search.
                      </td>
                    </tr>
                  ) : (
                    paginatedMembers.map((member) => (
                      <tr
                        key={member.member_uuid || member.member_id}
                        className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors"
                      >
                        <td className="p-5 text-sm font-mono text-gray-600">{member.member_id}</td>
                        <td className="p-5 text-sm font-semibold text-gray-900">{member.member_name}</td>
                        <td className="p-5 text-sm font-semibold text-gray-700 text-right tabular-nums">
                          {formatCurrency(member.current_balance)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {filteredMembers.length > 0 && (
              <Pagination page={memberPage} totalPages={totalMemberPages} onChange={setMemberPage} />
            )}
          </div>

          {/* TRANSACTION LEDGER */}
          <div className="border border-gray-200 rounded-lg shadow-sm overflow-hidden bg-white">
            <div className="px-5 py-3 border-b border-gray-100">
              <h3 className="text-sm font-bold text-gray-900">Recent CBU Transactions</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-green-700 text-[10px] uppercase tracking-wider text-white font-extrabold">
                    <th className="p-5 font-bold">Reference</th>
                    <th className="p-5 font-bold">Member</th>
                    <th className="p-5 font-bold">Type</th>
                    <th className="p-5 font-bold text-right">Amount</th>
                    <th className="p-5 font-bold">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {status === "loading" ? (
                    <tr>
                      <td colSpan={5} className="p-5 text-center text-sm text-gray-500">
                        Loading transactions...
                      </td>
                    </tr>
                  ) : paginatedTx.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-5 text-center text-sm text-gray-500 font-medium">
                        No CBU transactions recorded yet.
                      </td>
                    </tr>
                  ) : (
                    paginatedTx.map((tx, idx) => (
                      <tr
                        key={tx.cbu_deposit_id || idx}
                        className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors"
                      >
                        <td className="p-5 text-sm font-mono text-gray-600">{tx.cbu_deposit_id}</td>
                        <td className="p-5 text-sm">
                          <p className="text-gray-900 font-medium">{tx.member_name}</p>
                          <p className="text-[10px] text-gray-500 mt-0.5">{tx.member_id}</p>
                        </td>
                        <td className="p-5 text-sm text-gray-600">{tx.deposit_account}</td>
                        <td className="p-5 text-sm font-semibold text-gray-700 text-right tabular-nums">
                          {formatCurrency(tx.capital_added)}
                        </td>
                        <td className="p-5 text-sm text-gray-600">{formatDate(tx.transaction_date)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {transactions.length > 0 && (
              <Pagination page={txPage} totalPages={totalTxPages} onChange={setTxPage} />
            )}
          </div>
        </main>
      </div>

      <InterestOnShareCapitalModal
        open={showInterestModal}
        onClose={() => setShowInterestModal(false)}
        members={members}
      />
    </div>
  );
};


export default Bookkeeper_CBU;
