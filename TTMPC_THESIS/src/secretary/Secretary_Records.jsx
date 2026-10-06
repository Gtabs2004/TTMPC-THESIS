import React, { useEffect, useMemo, useState, useRef } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { useRealtimeVersion } from "../hooks/useRealtimeRefetch";
import { RT } from "../lib/realtimeSync";
import StaffSidebar from "../components/StaffSidebar";
import { secretaryNav } from "../components/StaffSidebar/configs/secretary";
import { UserAuth } from "../contex/AuthContext";
import { useNotification } from "../contex/NotificationContext";
import StaffTopbar from "../components/StaffTopbar";
import Pagination from "../components/Pagination";
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
  CalendarCheck,
  CalendarDays,
  Eye,
  UserPlus,
  Download,
  Archive,
  ShieldCheck,
} from 'lucide-react';
import logo from "../assets/img/ttmpc logo.png";
import NotificationBell from "../components/NotificationBell";
import { TableToolbar } from "../components/TableToolbar";
import TableActionButton from "../components/TableActionButton";
import TableStateRow from "../components/TableStateRow";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

// Termination is done by the BOD in Account Management; the Secretary only
// sees the result here (Status) and on the record details page.
const STATUS_STYLES = {
  active: { label: "Active", className: "bg-green-50 text-green-700" },
  terminated: { label: "Terminated", className: "bg-red-50 text-red-700" },
  exiting: { label: "Exiting", className: "bg-amber-50 text-amber-700" },
  closed: { label: "Closed", className: "bg-gray-100 text-gray-700" },
};

const StatusBadge = ({ status }) => {
  const style = STATUS_STYLES[String(status || "active").toLowerCase()] || STATUS_STYLES.active;
  return (
    <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${style.className}`}>
      {style.label}
    </span>
  );
};

const Secretary_Records = () => {
    const navigate = useNavigate();
  const { addNotification } = useNotification();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  const formatCurrency = (value) => `₱${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const formatDate = (value) => {
    if (!value) return "-";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleDateString("en-US", { year: "numeric", month: "2-digit", day: "2-digit" });
  };

  const rtVersion = useRealtimeVersion(RT.MEMBERS);
  const rtSeen = useRef(rtVersion);
  useEffect(() => {
    const silent = rtSeen.current !== rtVersion;
    rtSeen.current = rtVersion;
    async function loadRecords() {
      if (!silent) setLoading(true);
      try {
        const response = await fetch(`${API_BASE_URL}/api/secretary/membership-records`, {
          method: "GET",
          headers: { Accept: "application/json" },
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload?.success) {
          throw new Error(payload?.detail || payload?.message || "Failed to load membership records.");
        }

        setRecords(Array.isArray(payload.data) ? payload.data : []);
        addNotification("Membership records loaded successfully", "success");
      } catch (err) {
        if (silent) return;
        addNotification(err?.message || "Unable to load membership records.", "error");
        setRecords([]);
      } finally {
        if (!silent) setLoading(false);
      }
    }

    loadRecords();
  }, [addNotification, rtVersion]);

  const filteredRecords = useMemo(() => {
    const key = String(searchQuery || "").trim().toLowerCase();
    if (!key) return records;
    return records.filter((row) =>
      String(row.applicant_id || "").toLowerCase().includes(key) ||
      String(row.applicant_name || "").toLowerCase().includes(key)
    );
  }, [records, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / itemsPerPage));
  const paginatedRecords = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredRecords.slice(start, start + itemsPerPage);
  }, [filteredRecords, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, records]);

  return (
    <div className="flex min-h-screen bg-gray-100">
      <StaffSidebar portal="Secretary" items={secretaryNav} />

      <div className="flex-1 min-w-0 flex flex-col">
        <StaffTopbar
          portal="Secretary"
          notifications={<NotificationBell viewAllPath="/Secretary_Records" />}
          search={{ value: searchQuery, onChange: (e) => setSearchQuery(e.target.value), placeholder: "Search..." }}
        />

        <main className="animate-page-in p-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">Membership Records</h1>

          <div className="bg-white w-full rounded-2xl m-auto mt-6 shadow-sm border border-gray-100 min-h-fit overflow-hidden">
            <TableToolbar
              title="All Members"
              subtitle={`Showing ${paginatedRecords.length} of ${filteredRecords.length} members`}
            >
              <button className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-gray-200 text-[11px] font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
                <Download className="w-3.5 h-3.5" />
                Export List
              </button>
            </TableToolbar>
            <div className="overflow-x-auto p-8 pt-6">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-primary-deep text-[10px] uppercase tracking-wider text-white font-extrabold">
                  <th className="p-5 font-bold">Membership Id</th>
                  <th className="p-5 font-bold">Member Name</th>
                  <th className="p-5 font-bold">Date Joined</th>
                  <th className="p-5 font-bold">Shares</th>
                  <th className="p-5 font-bold">Paid Up Capital</th>
                  <th className="p-5 font-bold">Status</th>
                  <th className="p-5 font-bold">Action</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <TableStateRow colSpan={7} variant="loading" label="Loading..." />
                )}
                {paginatedRecords.length === 0 && !loading && (
                  <TableStateRow colSpan={7} variant="empty" icon={Users} label="No records found." />
                )}
                {paginatedRecords.map((member, index) => (
                  <tr key={`${member.member_uuid}-${index}`} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                    <td className="p-5 font-semibold text-[#1a4a2f]">{member.applicant_id}</td>
                    <td className="p-5 text-gray-800 font-medium">{member.applicant_name}</td>
                    <td className="p-5 text-gray-800 font-medium">{formatDate(member.date_joined)}</td>
                    <td className="p-5 text-gray-800 font-medium">{Number(member.shares || 0).toFixed(2)}</td>
                    <td className="p-5 text-gray-800 font-medium">{formatCurrency(member.paid_up_capital)}</td>
                    <td className="p-5">
                      <StatusBadge status={member.member_status} />
                    </td>
                    <td className="p-5">
                      <TableActionButton
                        icon={Eye}
                        onClick={() => navigate(`/secretary-record-details/${member.member_uuid}`)}
                      >
                        View
                      </TableActionButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
          <Pagination page={currentPage} totalPages={totalPages} onChange={setCurrentPage} />
        </main>
      </div>
    </div>
  );
};

export default Secretary_Records;