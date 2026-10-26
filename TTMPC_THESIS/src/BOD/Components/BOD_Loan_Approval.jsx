import React, { useEffect, useState } from "react";
import { useRealtimeRefetch } from "../../hooks/useRealtimeRefetch";
import { RT } from "../../lib/realtimeSync";
import { StatCard, StatCardRow } from "../../components/StatCard";
import { TableToolbar } from "../../components/TableToolbar";
import StaffSidebar from "../../components/StaffSidebar";
import { bodNav } from "../../components/StaffSidebar/configs/bod";
import { NavLink, useNavigate } from "react-router-dom";
import { UserAuth } from "../../contex/AuthContext";
import { useNotification } from "../../contex/NotificationContext";
import StaffTopbar from "../../components/StaffTopbar";
import { supabase } from "../../supabaseClient";
import TableActionButton from "../../components/TableActionButton";
import {
  LayoutDashboard,
  Users,
  CreditCard,
  CalendarCheck,
  CalendarDays,
  Archive,
  FileText,
  AlertTriangle,
  Search,
  ShieldCheck,
  UserPlus,
  ClipboardList,
  History,
} from "lucide-react";
import NotificationBell from "../../components/NotificationBell";
import TableStateRow from "../../components/TableStateRow";

const formatCurrency = (value) =>
  `₱${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatDate = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
};

// Same EXCLUSIVE rule as main.py's _BOD_LOAN_THRESHOLD: > ₱500,000 needs BOD.
const BOD_LOAN_THRESHOLD = 500000;
const AVG_WINDOW_MONTHS = 6;

const BOD_Loan_Approval = () => {
    const navigate = useNavigate();
  const { addNotification } = useNotification();
  const [loans, setLoans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [avgApplicationsPerMonth, setAvgApplicationsPerMonth] = useState(null);



  const load = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const { data, error } = await supabase
        .from("loans")
        .select(`
          control_number,
          loan_amount,
          term,
          loan_status,
          application_date,
          member:member_id (first_name, last_name, is_bona_fide),
          loan_types:loan_type_id (name)
        `)
        .eq("loan_status", "recommended for bod approval")
        .order("application_date", { ascending: false });
      if (error) throw error;
      const controlNumbers = (data || []).map((l) => l.control_number).filter(Boolean);
      const riskMap = {};
      if (controlNumbers.length > 0) {
        try {
          const { data: riskRows } = await supabase
            .from("risk_assessments")
            .select("loan_control_number, risk_probability, risk_class")
            .in("loan_control_number", controlNumbers);
          (riskRows || []).forEach((r) => {
            if (r.loan_control_number) {
              riskMap[String(r.loan_control_number).trim()] = r;
            }
          });
        } catch {
          // Keep resilient
        }
      }
      const mapped = (data || []).map((l) => ({
        ...l,
        risk_probability: riskMap[String(l.control_number).trim()]?.risk_probability,
        risk_class: riskMap[String(l.control_number).trim()]?.risk_class,
      }));
      setLoans(mapped);

      // Average high-value (BOD-level) Consolidated applications per month
      // over the last AVG_WINDOW_MONTHS months, current month included. Keyed
      // off application_date so it counts every application regardless of
      // where it is now in the lifecycle.
      const now = new Date();
      const windowStart = new Date(now.getFullYear(), now.getMonth() - (AVG_WINDOW_MONTHS - 1), 1)
        .toISOString().slice(0, 10);
      const { data: recentApps, error: appsError } = await supabase
        .from("loans")
        .select("loan_amount, principal_amount, application_date, loan_types:loan_type_id (name)")
        .gte("application_date", windowStart)
        .gt("loan_amount", BOD_LOAN_THRESHOLD)
        .limit(20000);
      if (appsError) throw appsError;
      const highValueCount = (recentApps || []).filter((l) =>
        String(l.loan_types?.name || "").toLowerCase().includes("consolidated")
      ).length;
      setAvgApplicationsPerMonth(highValueCount / AVG_WINDOW_MONTHS);
    } catch (err) {
      if (silent) return;
      addNotification(err?.message || "Failed to load BOD loan queue.", "error");
      setLoans([]);
    } finally {
      if (!silent) setLoading(false);
    }
  };
  useRealtimeRefetch(RT.LOANS, () => load({ silent: true }));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getRiskBadge = (prob) => {
    if (prob == null || prob === undefined) {
      return {
        label: "Unscored",
        chip: "bg-gray-100 text-gray-500 border border-gray-200",
      };
    }
    const p = Number(prob);
    if (p > 0.2171) {
      return {
        label: "High Risk",
        chip: "bg-red-50 text-red-700 border border-red-200",
      };
    }
    if (p >= 0.1036) {
      return {
        label: "Medium Risk",
        chip: "bg-amber-50 text-amber-700 border border-amber-200",
      };
    }
    return {
      label: "Low Risk",
      chip: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    };
  };

  const filtered = loans.filter((l) => {
    const key = search.trim().toLowerCase();
    if (!key) return true;
    const name = `${l.member?.first_name || ""} ${l.member?.last_name || ""}`.toLowerCase();
    return name.includes(key) || String(l.control_number || "").toLowerCase().includes(key);
  });


  return (
    <div className="flex min-h-screen bg-gray-50">
      <StaffSidebar portal="BOD" items={bodNav} />

      <div className="flex-1 min-w-0 flex flex-col">
        <StaffTopbar
          portal="BOD"
          notifications={<NotificationBell />}
          search={{ value: search, onChange: (e) => setSearch(e.target.value), placeholder: "Search..." }}
        />

        <main className="animate-page-in p-8 flex-1">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">Loan Approvals</h1>
          <StatCardRow cols={2}>
            <StatCard label="Pending Loan Applications" value={loans.length} icon={UserPlus} iconColor="text-[#2C7A3F]" />
            <StatCard
              label="Avg. Loan Applications / Month"
              value={avgApplicationsPerMonth == null ? "—" : avgApplicationsPerMonth.toFixed(1)}
              icon={ClipboardList}
              iconColor="text-[#D97706]"
              subtext={`Consolidated > ₱500K, last ${AVG_WINDOW_MONTHS} months`}
            />
          </StatCardRow>

          <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
            <TableToolbar
              title="High-Value Loan Queue"
              subtitle={`Showing ${filtered.length} of ${loans.length} loans awaiting BOD approval`}
            />
            <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-primary-deep text-[10px] uppercase tracking-wider text-white font-extrabold">
                  <th className="p-5 font-bold">Loan ID</th>
                  <th className="p-5 font-bold">Member Name</th>
                  <th className="p-5 font-bold">Loan Type</th>
                  <th className="p-5 font-bold">Amount</th>
                  <th className="p-5 font-bold">Term</th>
                  <th className="p-5 font-bold">Submitted</th>
                  <th className="p-5 font-bold">Credit Risk</th>
                  <th className="p-5 font-bold text-right pr-8">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <TableStateRow colSpan={8} variant="loading" label="Loading..." />
                ) : filtered.length === 0 ? (
                  <TableStateRow colSpan={8} variant="empty" icon={CreditCard} label="No high-value loans awaiting BOD approval." />
                ) : filtered.map((loan) => {
                  const memberName = `${loan.member?.first_name || ""} ${loan.member?.last_name || ""}`.trim() || "Unknown Member";
                  const risk = getRiskBadge(loan.risk_probability);
                  return (
                    <tr key={loan.control_number} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                      <td className="p-5 text-sm text-gray-500 font-medium">{loan.control_number}</td>
                      <td className="p-5 text-sm font-bold text-gray-800">{memberName}</td>
                      <td className="p-5 text-sm">
                        <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">
                          {loan.loan_types?.name || "Consolidated"}
                        </span>
                      </td>
                      <td className="p-5 text-sm font-bold text-gray-900">{formatCurrency(loan.loan_amount)}</td>
                      <td className="p-5 text-sm text-gray-500">{loan.term || 0} Months</td>
                      <td className="p-5 text-sm text-gray-500">{formatDate(loan.application_date)}</td>
                      <td className="p-5 text-sm">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${risk.chip}`}>
                          {risk.label}
                        </span>
                      </td>
                      <td className="p-5 text-sm text-right pr-8">
                        <TableActionButton
                          onClick={() => navigate(`/bod-loan-approval/${encodeURIComponent(loan.control_number)}`)}
                        >
                          Review
                        </TableActionButton>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default BOD_Loan_Approval;
