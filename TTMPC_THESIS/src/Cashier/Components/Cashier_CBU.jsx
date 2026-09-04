import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import StaffSidebar from "../../components/StaffSidebar";
import { cashierNav } from "../../components/StaffSidebar/configs/cashier";
import { UserAuth } from "../../contex/AuthContext";
import { useNotification } from "../../contex/NotificationContext";
import StaffTopbar from "../../components/StaffTopbar";
import LoanNotificationBell from "../../components/LoanNotificationBell";
import Breadcrumb from "../../components/Breadcrumb";
import InterestOnShareCapitalModal from "../../components/InterestOnShareCapitalModal";
import {
  LayoutDashboard,
  Banknote,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  UserSearch,
  ArrowRightCircle,
  Filter,
  Download,
  UserPlus,
  ArrowUpRight,
  Users,
  Send,
  PiggyBank,
  ShoppingCart,
  ArrowDownLeft,
  History,
  Calculator
} from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";
const PAGE_SIZE = 10;


const Cashier_CBU = () => {
    const navigate = useNavigate();
  const { addNotification } = useNotification();
  const [memberSearch, setMemberSearch] = useState("");
  const [members, setMembers] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [memberPage, setMemberPage] = useState(1);
  const [transactionPage, setTransactionPage] = useState(1);
  const [showInterestModal, setShowInterestModal] = useState(false);



  const getStatusStyle = (status) => {
    switch(status) {
      case 'VERIFIED': return 'bg-green-50 text-green-600';
      case 'PENDING': return 'bg-orange-50 text-orange-500';
      case 'FLAGGED': return 'bg-red-50 text-red-500';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  const formatCurrency = (value) =>
    `₱${Number(value || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const formatDate = (value) => {
    if (!value) return "-";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
  };

  const filteredMembers = useMemo(() => {
    const key = String(memberSearch || "").trim().toLowerCase();
    if (!key) return members;
    return members.filter((row) =>
      String(row.member_id || "").toLowerCase().includes(key) ||
      String(row.member_name || "").toLowerCase().includes(key)
    );
  }, [memberSearch, members]);

  const totalMemberPages = Math.max(1, Math.ceil(filteredMembers.length / PAGE_SIZE));
  const paginatedMembers = useMemo(() => {
    const start = (memberPage - 1) * PAGE_SIZE;
    return filteredMembers.slice(start, start + PAGE_SIZE);
  }, [filteredMembers, memberPage]);

  const totalTransactionPages = Math.max(1, Math.ceil(transactions.length / PAGE_SIZE));
  const paginatedTransactions = useMemo(() => {
    const start = (transactionPage - 1) * PAGE_SIZE;
    return transactions.slice(start, start + PAGE_SIZE);
  }, [transactions, transactionPage]);

  useEffect(() => {
    setMemberPage(1);
  }, [memberSearch, members]);

  useEffect(() => {
    setTransactionPage(1);
  }, [transactions]);

  useEffect(() => {
    if (memberPage > totalMemberPages) {
      setMemberPage(totalMemberPages);
    }
  }, [memberPage, totalMemberPages]);

  useEffect(() => {
    if (transactionPage > totalTransactionPages) {
      setTransactionPage(totalTransactionPages);
    }
  }, [transactionPage, totalTransactionPages]);

  async function fetchCbuData() {
    setLoading(true);
    setLoadError("");
    try {
      const [membersRes, txRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/cashier/cbu/members`, { method: "GET", headers: { Accept: "application/json" } }),
        fetch(`${API_BASE_URL}/api/cashier/cbu/transactions`, { method: "GET", headers: { Accept: "application/json" } }),
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
    } catch (err) {
      setLoadError(err?.message || "Unable to load CBU data.");
      setMembers([]);
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchCbuData();
  }, []);

  const proceedToDepositPage = (member) => {
    const memberRef = member?.member_uuid || member?.member_id;
    navigate(`/Cashier_CBU_Deposit/${encodeURIComponent(memberRef)}`);
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
          <Breadcrumb portal="Cashier" page="Capital Build-Up" />
          <h1 className="text-2xl font-bold text-[#1F3E35] mb-6">Capital Build-Up</h1>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-8">
            <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-bold text-[#1F3E35]">Member Accounts</h3>
                <span className="text-[10px] uppercase tracking-wider font-bold text-primary bg-green-50 px-2 py-1 rounded">
                  Live Data
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowInterestModal(true)}
                className="inline-flex items-center gap-2 rounded-lg bg-[#66B538] hover:bg-green-700 px-4 py-2 text-xs font-semibold text-white transition-colors"
              >
                <Calculator className="w-4 h-4" /> ISC Calculator
              </button>
            </div>

            {loading && (
              <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
                Loading members and CBU records...
              </div>
            )}

            {!!loadError && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {loadError}
              </div>
            )}

            <div className="relative mb-4 max-w-md">
              <UserSearch className="absolute left-3 top-3.5 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={memberSearch}
                onChange={(event) => setMemberSearch(event.target.value)}
                placeholder="Search by Member ID or Name"
                className="w-full rounded-lg border border-gray-300 bg-gray-50 h-11 pl-10 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-lg">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-green-700 text-[10px] uppercase tracking-wider text-white font-extrabold">
                    <th className="p-5 font-bold">Member ID</th>
                    <th className="p-5 font-bold">Member Name</th>
                    <th className="p-5 font-bold text-right">Current Balance</th>
                    <th className="p-5 font-bold text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMembers.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-5 text-sm text-center text-gray-500 font-medium">No member accounts matched your search.</td>
                    </tr>
                  )}
                  {paginatedMembers.map((member) => {
                    const currentBal = Number(member.current_balance || 0);
                    return (
                      <tr key={member.member_uuid || member.member_id} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                        <td className="p-5 text-sm font-mono text-gray-600">{member.member_id}</td>
                        <td className="p-5 text-sm font-semibold text-gray-900">{member.member_name}</td>
                        <td className="p-5 text-sm font-semibold text-gray-700 text-right">{formatCurrency(currentBal)}</td>
                        <td className="p-5 text-center">
                          <button
                            type="button"
                            onClick={() => proceedToDepositPage(member)}
                            className="btn-enhanced inline-flex items-center gap-2 rounded-lg bg-[#66B538] px-4 py-2 text-xs font-semibold text-white transition-colors cursor-pointer hover:bg-green-700"
                          >
                            <ArrowRightCircle className="w-4 h-4" /> Deposit
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="p-4 border-t border-gray-200 flex justify-between items-center bg-white">
              <p className="text-xs text-gray-500">
                Page {memberPage} of {totalMemberPages}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMemberPage((prev) => Math.max(prev - 1, 1))}
                  disabled={memberPage <= 1}
                  className="h-8 w-8 rounded border border-gray-300 text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 flex items-center justify-center"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setMemberPage((prev) => Math.min(prev + 1, totalMemberPages))}
                  disabled={memberPage >= totalMemberPages}
                  className="h-8 w-8 rounded border border-gray-300 text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 flex items-center justify-center"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
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

export default Cashier_CBU;



