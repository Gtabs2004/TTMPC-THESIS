import React, { useState, useEffect } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { UserAuth } from "../../contex/AuthContext";
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
  ChevronRight
} from 'lucide-react';

const Loan_Approval = () => {
  const { session, signOut } = UserAuth();
  const navigate = useNavigate();
  const [loans, setLoans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");
  
  const menuItems = [
    { name: "Dashboard", icon: LayoutDashboard },
    { name: "Loan Approvals", icon: Users },
    { name: "Manage Member", icon: Users },
  ];

  // Fetch data from Supabase on mount
  useEffect(() => {
    fetchLoans();
  }, []);

  const fetchLoans = async () => {
    try {
      setLoading(true);
      setFetchError("");
      
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
    } catch (err) {
      console.error("Error fetching loans:", err.message);
      setFetchError(err.message || "Unable to load loans.");
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async (e) => {
    e.preventDefault();
    try {
      await signOut();
      navigate("/");
    } catch (err) {
      console.error("Failed to sign out:", err);
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
      amount: loan.loan_amount ? `₱${Number(loan.loan_amount).toLocaleString()}` : "₱0",
      term: `${loan.term || 0} Months`,
      status: migsStatus,
      date: loan.application_date ? new Date(loan.application_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "N/A",
      actions: "Review"
    };
  });

  return (
    <div className="flex min-h-screen bg-gray-50">
      <aside className="bg-white w-64 p-4 flex flex-col border-r border-gray-200">
        <div className="flex flex-row items-start gap-2 mb-6">
          <img src="src/assets/img/ttmpc logo.png" alt="Logo" className="h-12 w-auto" />
          <div className="flex flex-col">
            <h1 className="text-xl font-bold text-[#389734]">TTMPC</h1>
            <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
              Manager Portal
            </p>
          </div>
        </div>

        <hr className="w-full border-gray-200 mb-6" />

        <nav className="flex flex-col gap-2 text-sm flex-grow">
          {(() => {
            const routeMap = {
              "Dashboard": "/manager-dashboard",
              "Loan Approvals": "/loan-approval",
              "Manage Member": "/manager-manage-member",
            };

            return menuItems.map((item) => {
              const Icon = item.icon;
              const to = routeMap[item.name] || `/${item.name.toLowerCase().replace(/\s+/g, '-')}`;

              return (
                <NavLink
                  key={item.name}
                  to={to}
                  className={({ isActive }) =>
                    `flex items-center gap-3 p-2 rounded-md transition-colors ${
                      isActive
                        ? 'bg-green-50 text-green-700 font-semibold'
                        : 'text-gray-700 hover:bg-green-50 hover:text-green-700'
                    }`
                  }
                >
                  <Icon size={20} />
                  <span>{item.name}</span>
                </NavLink>
              );
            });
          })()}
        </nav>

        <button
          onClick={handleSignOut}
          className="mt-auto w-full rounded p-2 text-xs bg-green-600 hover:bg-green-700 text-white font-bold transition-colors"
        >
          Sign out
        </button>
      </aside>

      <div className="flex-1 flex flex-col">
        <header className="bg-white h-16 shadow-sm flex items-center justify-end px-8 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400"/>
            <input 
              type="text" 
              className="bg-gray-50 w-52 h-10 rounded-lg border border-gray-200 pl-10 pr-4 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#2C7A3F]" 
              placeholder="Search..." 
            />
          </div>
          <button className="ml-6 relative p-1 rounded-full text-gray-500 hover:bg-gray-100 transition-colors">
            <Bell className="w-5 h-5"/>
            <span className="absolute top-1 right-1 block h-2 w-2 rounded-full bg-red-500 ring-2 ring-white"></span>
          </button>
          <div className="flex items-center ml-4 gap-2 border-l border-gray-200 pl-4">
            <img src="src/assets/img/bookkeeper-profile.png" alt="Profile" className="w-8 h-8 rounded-full bg-gray-200" />
            <p className="text-sm font-medium text-gray-700">Manager</p>
          </div>
        </header>

        <main className="p-8 flex-1">
          {/* Top Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            <div className="bg-white border border-gray-100 rounded-xl p-5 flex items-center gap-4 shadow-sm">
              <div className="w-12 h-12 rounded-lg bg-[#EAF5EC] flex items-center justify-center flex-shrink-0">
                <UserPlus className="text-[#2C7A3F] w-6 h-6" />
              </div>
              <div className="flex flex-col">
                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">New This Month</h3>
                <p className="text-2xl font-extrabold text-slate-800 mt-0.5">45</p>
              </div>
            </div>

            <div className="bg-white border border-gray-100 rounded-xl p-5 flex items-center gap-4 shadow-sm">
              <div className="w-12 h-12 rounded-lg bg-[#FFF4E5] flex items-center justify-center flex-shrink-0">
                <ClipboardList className="text-[#D97706] w-6 h-6" />
              </div>
              <div className="flex flex-col">
                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Avg Process Time</h3>
                <p className="text-2xl font-extrabold text-slate-800 mt-0.5">2.4 Days</p>
              </div>
            </div>

            <div className="bg-white border border-gray-100 rounded-xl p-5 flex items-center gap-4 shadow-sm">
              <div className="w-12 h-12 rounded-lg bg-[#EAF5EC] flex items-center justify-center flex-shrink-0">
                <BadgeCheck className="text-[#2C7A3F] w-6 h-6" />
              </div>
              <div className="flex flex-col">
                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Approval Rate</h3>
                <p className="text-2xl font-extrabold text-slate-800 mt-0.5">94.2%</p>
              </div>
            </div>

          </div>

          {/* Data Table Container */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#FAF9FB] border-b border-gray-200 text-[10px] uppercase tracking-wider text-[#2A2A48] font-extrabold">
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
                  ) : fetchError ? (
                    <tr>
                      <td colSpan="8" className="p-5 text-center text-red-600">Failed to load loans: {fetchError}</td>
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
                          <span className={`px-3 py-1.5 rounded-full text-xs font-bold ${getLoanTypeStyle(loan.type)}`}>
                            {loan.type}
                          </span>
                        </td>
                        <td className="p-5 text-sm font-bold text-gray-900">{loan.amount}</td>
                        <td className="p-5 text-sm text-gray-500">{loan.term}</td>
                        <td className="p-5 text-sm">
                          <span className={`px-3 py-1.5 rounded-full text-[11px] font-bold tracking-wider ${getMigsStyle(loan.status)}`}>
                            {loan.status}
                          </span>
                        </td>
                        <td className="p-5 text-sm text-gray-500">{loan.date}</td>
                        <td className="p-5 text-sm text-right pr-8">
                          <button 
                              onClick={() => navigate(`/loan-approval/${loan.id}?source=${loan.source}`)}
                              className="text-[#1D6021] font-bold hover:underline transition-all"
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