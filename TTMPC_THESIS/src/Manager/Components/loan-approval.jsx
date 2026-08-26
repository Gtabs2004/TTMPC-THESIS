import React, { useState, useEffect } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { StatCard, StatCardRow } from "../../components/StatCard";
import StaffSidebar from "../../components/StaffSidebar";
import { managerNav } from "../../components/StaffSidebar/configs/manager";
import { UserAuth } from "../../contex/AuthContext";
import { useNotification } from "../../contex/NotificationContext";
import { PortalTopbarIdentity } from "../../components/PortalIdentity";
import LoanNotificationBell from "../../components/LoanNotificationBell";
import { supabase } from "../../supabaseClient"; // Make sure this path is correct
import {
  LayoutDashboard,
  Users,
  Search,
  Bell,
  UserPlus,
  ClipboardList,
  BadgeCheck,
  Banknote,
  ChevronLeft,
  ChevronRight,
  BarChart3,
  History,
  ClipboardCheck,
  Brain,
  Briefcase,
} from "lucide-react";

const Loan_Approval = () => {
    const navigate = useNavigate();
  const { addNotification } = useNotification();
  const [loans, setLoans] = useState([]);
  const [loading, setLoading] = useState(true);
  

  // Fetch data from Supabase on mount
  useEffect(() => {
    fetchLoans();
  }, []);

  const fetchLoans = async () => {
    try {
      setLoading(true);
      
      // Using Supabase relational queries to fetch joined data
      const { data: loansData, error: loansError } = await supabase
        .from("loans")
        .select(`
          control_number,
          loan_amount,
          term,
          loan_status,
          application_date,
          member:member_id (
            first_name, 
            last_name, 
            is_bona_fide
          ),
          loan_types:loan_type_id (
            name
          )
        `)
        .order("application_date", { ascending: false });

      if (loansError) throw loansError;

      const { data: koicaData, error: koicaError } = await supabase
        .from("koica_loans")
        .select(`
          control_number,
          loan_amount,
          term,
          loan_status,
          application_date,
          full_name,
          loan_type_code
        `)
        .order("application_date", { ascending: false });

      if (koicaError) throw koicaError;

      const mappedKoica = (koicaData || []).map((row) => ({
        ...row,
        source: "koica",
      }));

      const mappedLoans = (loansData || []).map((row) => ({
        ...row,
        source: "loans",
      }));

      const managerQueue = [...mappedLoans, ...mappedKoica]
        .filter((loan) => String(loan.loan_status || "").trim().toLowerCase() === "recommended for approval")
        .sort((a, b) => new Date(b.application_date || 0) - new Date(a.application_date || 0));

      setLoans(managerQueue);
      addNotification("Loan applications loaded successfully", "success");
    } catch (err) {
      addNotification(err.message || "Unable to load loans.", "error");
      console.error("Error fetching loans:", err.message);
    } finally {
      setLoading(false);
    }
  };


  // Helper functions for badge styling
  const getLoanTypeStyle = (type) => {
    switch(type) {
      case 'Bonus': return 'bg-blue-100 text-blue-700';
      case 'Emergency': return 'bg-red-100 text-red-700';
      case 'Consolidated': return 'bg-purple-100 text-purple-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const getMigsStyle = (status) => {
    return status === 'MIGS' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500';
  };

  const queueStats = (() => {
    const now = Date.now();
    const ageDays = loans
      .map((l) => {
        const t = new Date(l.application_date).getTime();
        return Number.isFinite(t) ? (now - t) / (1000 * 60 * 60 * 24) : null;
      })
      .filter((d) => d !== null && d >= 0);
    return {
      pendingCount: loans.length,
      avgDaysWaiting: ageDays.length ? ageDays.reduce((a, b) => a + b, 0) / ageDays.length : 0,
      oldestDays: ageDays.length ? Math.max(...ageDays) : 0,
    };
  })();

  // Map the relational database rows to the exact format your UI expects
  const displayLoans = loans.map((loan) => {
    const isKoica = loan.source === "koica";
    // Safely extract the joined data (fallback to 'Unknown' if a link is missing)
    const firstName = loan.member?.first_name || "";
    const lastName = loan.member?.last_name || "";
    const memberName = isKoica
      ? (loan.full_name || "Unknown Applicant")
      : (`${firstName} ${lastName}`.trim() || "Unknown Member");
    
    const loanTypeName = isKoica
      ? (loan.loan_type_code === "NONMEMBER_BONUS" ? "Nonmember Bonus Loan" : "ABFF Loan")
      : (loan.loan_types?.name || "N/A");
    
    // Assuming 'is_bona_fide' determines if they are a Member In Good Standing (MIGS)
    const migsStatus = isKoica ? "N/A" : (loan.member?.is_bona_fide ? "MIGS" : "NON-MIGS");

    return {
      id: loan.control_number,
      source: loan.source,
      name: memberName,
      type: loanTypeName,
      amount: loan.loan_amount ? `\u20B1${Number(loan.loan_amount).toLocaleString()}` : "\u20B10",
      term: `${loan.term || 0} Months`,
      status: migsStatus,
      date: loan.application_date ? new Date(loan.application_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "N/A",
      actions: "Review"
    };
  });

  return (
   <div className="flex min-h-screen bg-gray-50">
         {/* SIDEBAR (Kept from your original code) */}
         <StaffSidebar portal="Manager" items={managerNav} />
   
      <div className="flex-1 flex flex-col h-screen overflow-y-auto">
        <header className="bg-white h-16 shadow-sm flex items-center justify-end px-8 shrink-0">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400"/>
                    <input 
                      type="text" 
                      className="bg-gray-50 w-52 h-10 rounded-lg border border-gray-300 px-4 py-1 pl-9 focus:outline-none focus:ring-2 focus:ring-green-500" 
                      placeholder="Search..."
                    />
                  </div>
                  <LoanNotificationBell role="manager" />
                  <img src="/img/bookkeeper-profile.png" alt="Profile" className="ml-4 w-8 h-8 rounded-full bg-gray-200" />
                  <PortalTopbarIdentity className="text-sm font-medium text-gray-700" fallbackRole="Manager" />
                </header>
        

        <main className="p-8 flex-1">
          {/* TITLE */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Loan Approval</h1>
              <p className="text-sm text-gray-500 mt-0.5">
                Loans recommended by the Bookkeeper, awaiting your review and decision.
              </p>
            </div>
          </div>

          {/* Top Stats Cards */}
          <StatCardRow cols={3}>
            <StatCard label="Pending Review" value={queueStats.pendingCount} icon={UserPlus} iconColor="text-[#2C7A3F]" />
            <StatCard
              label="Avg Days Waiting"
              value={`${queueStats.avgDaysWaiting.toFixed(1)} ${queueStats.avgDaysWaiting === 1 ? "Day" : "Days"}`}
              icon={ClipboardList}
              iconColor="text-[#D97706]"
            />
            <StatCard
              label="Oldest In Queue"
              value={`${queueStats.oldestDays.toFixed(0)} ${queueStats.oldestDays === 1 ? "Day" : "Days"}`}
              icon={BadgeCheck}
              iconColor="text-[#2C7A3F]"
            />
          </StatCardRow>

          {/* Data Table Container */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-green-700 text-[10px] uppercase tracking-wider text-white font-extrabold">
                    <th className="p-5 font-bold">Loan ID</th>
                    <th className="p-5 font-bold">Member Name</th>
                    <th className="p-5 font-bold">Loan Type</th>
                    <th className="p-5 font-bold">Amount</th>
                    <th className="p-5 font-bold">Term</th>
                    <th className="p-5 font-bold">MIGS Status</th>
                    <th className="p-5 font-bold">Submission</th>
                    <th className="p-5 font-bold text-right pr-8">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan="8" className="p-5 text-center text-gray-500">Loading applications...</td>
                    </tr>
                  ) : displayLoans.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="p-5 text-center text-gray-500">No loans found.</td>
                    </tr>
                  ) : (
                    displayLoans.map((loan, idx) => (
                      <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                        <td className="p-5 text-sm text-gray-500 font-medium">{loan.id}</td>
                        <td className="p-5 text-sm font-bold text-gray-800">{loan.name}</td>
                        <td className="p-5 text-sm">
                          <span className={`badge-animated px-3 py-1.5 rounded-full text-xs font-bold ${getLoanTypeStyle(loan.type)}`}>
                            {loan.type}
                          </span>
                        </td>
                        <td className="p-5 text-sm font-bold text-gray-900">{loan.amount}</td>
                        <td className="p-5 text-sm text-gray-500">{loan.term}</td>
                        <td className="p-5 text-sm">
                          <span className={`badge-animated px-3 py-1.5 rounded-full text-[11px] font-bold tracking-wider ${getMigsStyle(loan.status)}`}>
                            {loan.status}
                          </span>
                        </td>
                        <td className="p-5 text-sm text-gray-500">{loan.date}</td>
                        <td className="p-5 text-sm text-right pr-8">
                          <button 
                              onClick={() => navigate(`/loan-approval/${loan.id}?source=${loan.source}`)}
                              className="text-member-green font-bold hover:underline transition-all"
                            >
                              {loan.actions}
                            </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-center p-6 gap-2 border-t border-gray-100">
              <button className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-300 bg-white text-gray-500 transition-colors hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed" disabled>
                <ChevronLeft className="w-4 h-4" />
              </button>

              {[1, 2, 3, 4, 5].map((page) => (
                <button
                  key={page}
                  className={`w-8 h-8 flex items-center justify-center rounded-full border text-xs font-semibold transition-colors ${
                    page === 1
                      ? "bg-[#16A34A] text-white border-[#16A34A]"
                      : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  {page}
                </button>
              ))}

              <button className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-300 bg-white text-gray-500 transition-colors hover:bg-gray-50">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
          
        </main>
      </div>
    </div>
  );
};

export default Loan_Approval;



