import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { UserAuth } from "../../contex/AuthContext";
import { supabase } from "../../supabaseClient";
import { 
  LayoutDashboard, 
  Users, 
  CreditCard, 
  Activity, 
  Search,
  Bell,
  Menu,
  X,
  Banknote,
  CalendarClock,
  FileText,
  Calculator,
  ArrowRight,
  Info,
  History
} from 'lucide-react';

const Member_Loans = () => {
  const { session, signOut } = UserAuth();
  const navigate = useNavigate();
  const [loans, setLoans] = useState([]);
  const [loadingLoans, setLoadingLoans] = useState(true);
  const [loanError, setLoanError] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const menuItems = [
    { name: "Dashboard", icon: LayoutDashboard },
    { name: "Member Loans", icon: Activity },
    { name: "Loan Lifecycle", icon: History },
    { name: "Member Profile", icon: Users },
    { name: "Member Savings", icon: CreditCard }
  ];

  const handleSignOut = async (e) => {
    e.preventDefault();
    try {
      await signOut();
      navigate("/");
    } catch (err) {
      console.error("Failed to sign out:", err);
    }
  };

  const formatCurrency = (value) => `₱${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const formatDate = (value) => {
    if (!value) return 'N/A';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return 'N/A';
    return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
  };
  const toStatus = (value) => {
    const raw = String(value || '').trim().toLowerCase();
    if (raw === 'pending') return 'Active';
    if (raw === 'to be disbursed') return 'Active';
    if (raw === 'approved') return 'Active';
    if (raw === 'released') return 'Active';
    if (raw === 'rejected') return 'Rejected';
    return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : 'Unknown';
  };

  useEffect(() => {
    let isMounted = true;

    const fetchMemberLoans = async () => {
      try {
        setLoadingLoans(true);
        setLoanError('');

        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;

        const memberId = authData?.user?.id;
        if (!memberId) throw new Error('Please sign in again to load your loans.');

        const { data, error } = await supabase
          .from('loans')
          .select(`
            control_number,
            loan_amount,
            principal_amount,
            interest_rate,
            total_interest,
            monthly_amortization,
            term,
            loan_status,
            application_date,
            loan_type:loan_type_id (
              name
            )
          `)
          .eq('member_id', memberId)
          .order('application_date', { ascending: false });

        if (error) throw error;

        const rows = (data || []).map((loan) => {
          const principal = Number(loan.principal_amount ?? loan.loan_amount ?? 0);
          const totalInterest = Number(loan.total_interest ?? 0);
          const totalPayable = principal + totalInterest;
          const monthly = Number(loan.monthly_amortization ?? 0);

          return {
            id: loan.control_number,
            type: loan.loan_type?.name || 'N/A',
            originalAmount: formatCurrency(principal),
            balance: formatCurrency(totalPayable),
            interestRate: loan.interest_rate !== null && loan.interest_rate !== undefined ? `${Number(loan.interest_rate)}%` : 'N/A',
            payment: monthly > 0 ? formatCurrency(monthly) : 'N/A',
            nextDue: formatDate(loan.application_date),
            status: toStatus(loan.loan_status),
            numericBalance: totalPayable,
            numericPayment: monthly,
          };
        });

        if (isMounted) {
          setLoans(rows);
        }
      } catch (err) {
        if (isMounted) {
          setLoanError(err.message || 'Unable to load loan records.');
        }
      } finally {
        if (isMounted) {
          setLoadingLoans(false);
        }
      }
    };

    fetchMemberLoans();
    return () => {
      isMounted = false;
    };
  }, []);

  const totalOutstanding = useMemo(
    () => loans.reduce((sum, loan) => sum + (loan.numericBalance || 0), 0),
    [loans]
  );

  const totalMonthly = useMemo(
    () => loans.reduce((sum, loan) => sum + (loan.numericPayment || 0), 0),
    [loans]
  );

  const latestLoan = loans[0] || null;

  const loanTypeBadges = useMemo(() => {
    const unique = [...new Set(loans.map((loan) => String(loan.type || '').trim()).filter(Boolean))];
    return unique.slice(0, 3);
  }, [loans]);

  return (
    <div className="relative flex min-h-screen bg-[#F8F9FA]">
      {isSidebarOpen ? (
        <button
          aria-label="Close sidebar overlay"
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 z-20 bg-black/30 lg:hidden"
        />
      ) : null}
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 w-64 transform bg-white p-4 flex flex-col border-r border-gray-200 transition-transform duration-200 ease-out lg:static lg:translate-x-0 ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <button
          aria-label="Close sidebar"
          onClick={() => setIsSidebarOpen(false)}
          className="absolute right-3 top-3 rounded-md p-1 text-gray-500 hover:bg-gray-100 lg:hidden"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="flex flex-row items-start gap-2 mb-6">
          <img src="src/assets/img/ttmpc logo.png" alt="Logo" className="h-12 w-auto" />
          <div className="flex flex-col">
            <h1 className="text-xl font-bold text-[#389734]">TTMPC</h1>
            <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
              Members Portal
            </p>
          </div>
        </div>
   
        <hr className="w-full border-gray-100 mb-6" />
   
        <nav className="flex grow flex-col gap-2 text-sm">
          {(() => {
            const routeMap = {
              "Dashboard": "/member-dashboard",
              "Member Loans": "/member-loans",
              "Loan Lifecycle": "/member-lifecycle",
              "Member Profile": "/members-profile",
              "Member Savings": "/member-savings"
            };
       
            return menuItems.map((item) => {
              const Icon = item.icon;
              const to = routeMap[item.name] || `/${item.name.toLowerCase().replace(/\s+/g, '-')}`;
       
              return (
                <NavLink
                  key={item.name}
                  to={to}
                  className={({ isActive }) =>
                    `flex items-center gap-3 p-2.5 rounded-lg transition-colors ${
                      isActive
                        ? 'bg-[#EAF1EB] text-[#1D6021] font-bold'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-[#1D6021] font-medium'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon size={18} strokeWidth={isActive ? 2.5 : 2} />
                      <span>{item.name}</span>
                    </>
                  )}
                </NavLink>
              );
            });
          })()}
        </nav>
   
        <button
          onClick={handleSignOut}
          className="mt-auto w-full rounded-lg p-2.5 text-sm bg-[#1D6021] hover:bg-[#154718] text-white font-bold transition-colors"
        >
          Sign out
        </button>
      </aside>
   
      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden lg:pl-0">
        {/* Header */}
        <header className="bg-white h-16 shadow-sm flex items-center justify-between px-4 sm:px-6 lg:px-8 z-10 border-b border-gray-100">
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              aria-label="Open sidebar"
              onClick={() => setIsSidebarOpen(true)}
              className="rounded-md p-2 text-gray-600 hover:bg-gray-100 lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="text-base sm:text-lg font-extrabold text-[#1a4a2f] lg:hidden">Loans</h1>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
          <div className="relative hidden md:block">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400"/>
            <input 
              type="text" 
              className="bg-gray-50 w-64 h-10 rounded-full border border-gray-200 pl-10 pr-4 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D6021] focus:bg-white transition-all"
              placeholder="Search..."
            />
          </div>
          <button className="relative p-2 rounded-full text-gray-500 hover:bg-gray-100 transition-colors">
            <Bell className="w-5 h-5"/>
            <span className="absolute top-1.5 right-1.5 block h-2 w-2 rounded-full bg-red-500 ring-2 ring-white"></span>
          </button>
          
          <div className="flex items-center gap-2 sm:gap-3 border-l border-gray-200 pl-2 sm:pl-4 cursor-pointer">
            <div className="w-8 h-8 rounded-full bg-gray-200 overflow-hidden border border-gray-300">
               <img src="src/assets/img/member-profile.png" alt="Member Profile" className="w-full h-full object-cover" />
            </div>
            <p className="hidden sm:block text-sm font-bold text-gray-700">Member</p>
          </div>
          </div>
        </header>
   
        {/* Scrollable Page Content */}
        <main className="p-4 sm:p-6 lg:p-8 overflow-y-auto">
          <h1 className="hidden lg:block font-extrabold text-[#1a4a2f] text-2xl mb-8">Loans</h1>

          <div className="mb-6 rounded-xl border border-green-200 bg-green-50 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-[#1D6021]">Need the full loan lifecycle?</p>
              <p className="text-xs text-gray-600">View approvals, status transitions, and real-time recorded payments in one screen.</p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/member-lifecycle')}
              className="inline-flex items-center gap-2 rounded-lg bg-[#1D6021] px-4 py-2 text-xs font-bold text-white hover:bg-[#154718]"
            >
              <History className="w-4 h-4" /> Open Lifecycle View
            </button>
          </div>
          
          {/* Top Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 mb-8">
            
            {/* Balance Card */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col relative overflow-hidden">
              <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center mb-4 border border-gray-200">
                <Banknote className="w-4 h-4 text-gray-600" />
              </div>
              <p className="text-xs font-bold text-gray-500 mb-1">Total Outstanding Balance</p>
              <h3 className="text-2xl sm:text-3xl font-black text-gray-900 mb-2">{formatCurrency(totalOutstanding)}</h3>
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mt-auto flex items-center">
                <CalendarClock className="w-3 h-3 mr-1" /> Last Updated: {latestLoan?.nextDue || 'N/A'}
              </p>
            </div>

            {/* Commitment Card */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col relative overflow-hidden">
               <div className="absolute top-6 right-6 bg-[#EAF1EB] text-[#1D6021] px-2 py-1 rounded text-[9px] font-extrabold tracking-wider uppercase">
                Auto-Debit Active
              </div>
              <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center mb-4 border border-gray-200">
                <CalendarClock className="w-4 h-4 text-[#1D6021]" />
              </div>
              <p className="text-xs font-bold text-gray-500 mb-1">Monthly Commitment</p>
              <h3 className="text-2xl sm:text-3xl font-black text-gray-900 mb-2">{formatCurrency(totalMonthly)}</h3>
              <p className="text-[10px] font-bold text-gray-600 mt-auto">
                Next Deduction: {latestLoan?.nextDue || 'N/A'}
              </p>
            </div>

            {/* Active Loans Card */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col relative overflow-hidden">
              <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center mb-4 border border-gray-200">
                <FileText className="w-4 h-4 text-gray-600" />
              </div>
              <p className="text-xs font-bold text-gray-500 mb-1">Active Loans</p>
              <h3 className="text-2xl sm:text-3xl font-black text-gray-900 mb-2">{loans.length}</h3>
              
              <div className="flex items-center gap-2 mt-auto">
                <div className="flex -space-x-1.5">
                  {loanTypeBadges.map((type, idx) => (
                    <div key={`${type}-${idx}`} className="w-5 h-5 rounded-full bg-blue-500 border border-white flex items-center justify-center text-[8px] text-white font-bold">
                      {type.slice(0, 2).toUpperCase()}
                    </div>
                  ))}
                </div>
                <p className="text-[10px] font-medium text-gray-400">{loanTypeBadges.join(', ') || 'No loans'}</p>
              </div>
            </div>

          </div>

          {/* Active Loans Summary Table */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-8 flex flex-col">
            <div className="p-6 flex items-center justify-between border-b border-gray-100">
               <h3 className="text-lg font-bold text-gray-900">Active Loans Summary</h3>
               <span className="bg-gray-100 text-gray-500 px-3 py-1 rounded text-[9px] font-extrabold tracking-widest uppercase">
                 Read-Only View
               </span>
            </div>
            
            <div className="overflow-x-auto">
            <table className="w-full min-w-220 text-left border-collapse">
              <thead>
                <tr className="bg-[#FAF9FB] border-b border-gray-100 text-[9px] uppercase tracking-wider text-gray-400 font-bold">
                  <th className="p-5 font-bold">Loan Type</th>
                  <th className="p-5 font-bold">Original Amount</th>
                  <th className="p-5 font-bold">Remaining Balance</th>
                  <th className="p-5 font-bold">Interest Rate</th>
                  <th className="p-5 font-bold">Monthly Payment</th>
                  <th className="p-5 font-bold">Next Due</th>
                  <th className="p-5 font-bold">Status</th>
                </tr>
              </thead>
              <tbody>
                {loadingLoans ? (
                  <tr>
                    <td colSpan="7" className="p-5 text-sm text-gray-500">Loading loans...</td>
                  </tr>
                ) : loanError ? (
                  <tr>
                    <td colSpan="7" className="p-5 text-sm text-red-600">{loanError}</td>
                  </tr>
                ) : loans.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="p-5 text-sm text-gray-500">No loan records found.</td>
                  </tr>
                ) : loans.map((loan, idx) => (
                  <tr key={idx} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors last:border-0">
                    <td className="p-5">
                      <p className="text-sm font-bold text-gray-900">{loan.type}</p>
                      <p className="text-[10px] text-gray-400 font-medium">ID: {loan.id}</p>
                    </td>
                    <td className="p-5 text-sm font-bold text-gray-600">{loan.originalAmount}</td>
                    <td className="p-5 text-sm font-black text-gray-900">{loan.balance}</td>
                    <td className="p-5 text-sm font-bold text-gray-700">{loan.interestRate}</td>
                    <td className="p-5 text-sm font-bold text-[#1D6021]">{loan.payment}</td>
                    <td className="p-5 text-sm font-medium text-gray-500">{loan.nextDue}</td>
                    <td className="p-5">
                      <span className={`px-2.5 py-1 rounded text-[10px] font-extrabold tracking-wider ${
                        loan.status === 'Active' ? 'bg-[#EAF1EB] text-[#1D6021]' : loan.status === 'Rejected' ? 'bg-red-100 text-red-700' : 'bg-[#FEF08A] text-[#854D0E]'
                      }`}>
                        {loan.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>

          {/* Bottom Grid: Breakdown & Eligibility */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
            
            {/* Recent Payment Breakdown */}
            <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 p-5 sm:p-8 flex flex-col">
              <div className="mb-6 pb-6 border-b border-gray-100">
                <h3 className="text-lg font-bold text-gray-900">Recent Payment Breakdown</h3>
                <p className="text-xs text-gray-400 font-medium mt-1">{latestLoan ? `${latestLoan.id} (${latestLoan.type})` : 'No loan selected'}</p>
              </div>

              <div className="space-y-6 flex-1">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-600 font-medium">Principal Amount</span>
                  <span className="font-bold text-gray-900">{latestLoan?.originalAmount || 'N/A'}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-600 font-medium">Interest</span>
                  <span className="font-bold text-gray-900">{latestLoan?.interestRate || 'N/A'}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-600 font-medium">Service Fee / Insurance</span>
                  <span className="font-bold text-gray-900">See loan computation summary</span>
                </div>
              </div>

              <div className="flex justify-between items-center mt-8 pt-6 border-t border-gray-100">
                <span className="font-bold text-gray-900">Total Monthly Payment</span>
                <span className="text-xl font-black text-[#1D6021]">{latestLoan?.payment || 'N/A'}</span>
              </div>

              <div className="mt-8 bg-[#F8F9FA] p-4 rounded-xl flex items-start gap-3 border border-gray-100">
                <Info className="w-4 h-4 text-[#1D6021] shrink-0 mt-0.5" />
                <p className="text-[11px] text-gray-500 font-medium leading-relaxed">
                  Repayments are automatically deducted from your DepEd payroll on the 15th of every month. For discrepancies, please visit the nearest TTMPC branch.
                </p>
              </div>
            </div>

            {/* Loan Eligibility Tool */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 sm:p-8 flex flex-col">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-lg bg-[#EAF1EB] flex items-center justify-center border border-green-100">
                  <Calculator className="w-4 h-4 text-[#1D6021]" />
                </div>
                <h3 className="text-lg font-bold text-gray-900">Loan Eligibility</h3>
              </div>
              
              <p className="text-sm text-gray-500 font-medium mb-8 leading-relaxed">
                Wondering if you qualify for a new loan? Use our calculator to check your borrowing capacity based on your current net take-home pay.
              </p>

              <div className="bg-[#FAF9FB] rounded-xl p-5 mb-8 border border-gray-100">
                <div className="flex justify-between items-start mb-4">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Quick<br/>Status</p>
                  <p className="text-[10px] font-extrabold text-[#1D6021] uppercase tracking-wider text-right">Ready To<br/>Calculate</p>
                </div>
                <p className="text-[10px] text-gray-400 font-medium italic">
                  Last payroll data synced:<br/>10/28/2023
                </p>
              </div>

              <button className="w-full bg-[#1D6021] hover:bg-[#154718] text-white font-bold text-sm py-3.5 rounded-xl transition-colors flex items-center justify-center gap-2 mb-4">
                <ArrowRight className="w-4 h-4" /> Open Loan Calculator
              </button>
              
              <p className="text-center text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-auto">
                Institutional Planning Tool
              </p>
            </div>

          </div>
          
        </main>
      </div>
    </div>
  );
};

export default Member_Loans;