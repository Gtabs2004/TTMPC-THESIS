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
  Pencil,
  Wallet,
  PiggyBank,
  Calendar,
  ArrowUpRight,
  CheckCircle2,
  LogIn,
  History
} from 'lucide-react';

const MemberDashboard = () => {
  const { session, signOut } = UserAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [memberLoans, setMemberLoans] = useState([]);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [profileError, setProfileError] = useState("");
  const [isTemporaryAccount, setIsTemporaryAccount] = useState(false);

  const menuItems = [
    { name: "Dashboard", icon: LayoutDashboard },
    { name: "Member Loans", icon: Activity },
    { name: "Loan Lifecycle", icon: History },
    { name: "Member Profile", icon: Users },
    { name: "Member Savings", icon: CreditCard },
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

  const recentTransactions = [
    { id: 1, date: "Oct 25, 2023", desc: "Share Capital Contribution", category: "EQUITY", type: "equity", amount: "₱2,000.00" },
    { id: 2, date: "Oct 15, 2023", desc: "Savings Deposit", category: "SAVINGS", type: "savings", amount: "₱5,000.00" },
    { id: 3, date: "Sep 30, 2023", desc: "Loan Repayment - Multi Purpose", category: "LOAN", type: "loan", amount: "₱3,500.00" },
    { id: 4, date: "Sep 15, 2023", desc: "Dividend Credit", category: "EARNING", type: "earning", amount: "+ ₱1,250.75", highlight: true },
    { id: 5, date: "Aug 30, 2023", desc: "Loan Interest Payment", category: "INTEREST", type: "interest", amount: "₱420.00" },
  ];

  const getCategoryStyle = (type) => {
    switch(type) {
      case 'equity': return 'bg-blue-50 text-blue-600';
      case 'savings': return 'bg-green-50 text-green-600';
      case 'loan': return 'bg-orange-50 text-orange-600';
      case 'earning': return 'bg-purple-50 text-purple-600';
      case 'interest': return 'bg-gray-100 text-gray-600';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  const formatCurrency = (value) => `₱ ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const formatDate = (value) => {
    if (!value) return 'N/A';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'N/A';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  useEffect(() => {
    let isMounted = true;

    const loadDashboardData = async () => {
      try {
        setLoadingProfile(true);
        setProfileError('');

        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;

        const memberId = authData?.user?.id;
        const authEmail = authData?.user?.email || '';
        if (!memberId) throw new Error('Please sign in again to load your dashboard.');

        let temporaryFlag = false;
        const accountQueries = ['member_account', 'member_accounts'];
        for (const tableName of accountQueries) {
          const { data: accountRow, error: accountError } = await supabase
            .from(tableName)
            .select('is_temporary')
            .eq('user_id', memberId)
            .limit(1)
            .maybeSingle();

          if (!accountError && accountRow) {
            temporaryFlag = Boolean(accountRow.is_temporary);
            break;
          }
        }

        const { data: memberRow, error: memberError } = await supabase
          .from('member')
          .select('*')
          .eq('id', memberId)
          .maybeSingle();

        if (memberError) throw memberError;

        let latestApplication = null;
        if (memberRow?.membership_id) {
          const { data, error } = await supabase
            .from('member_applications')
            .select('*')
            .eq('membership_id', memberRow.membership_id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (!error && data) latestApplication = data;
        }

        if (!latestApplication && authEmail) {
          const { data, error } = await supabase
            .from('member_applications')
            .select('*')
            .ilike('email', authEmail)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (!error && data) latestApplication = data;
        }

        const { data: loansData, error: loansError } = await supabase
          .from('loans')
          .select('control_number, principal_amount, loan_amount, total_interest, monthly_amortization, loan_status, application_date, term')
          .eq('member_id', memberId)
          .order('application_date', { ascending: false });

        if (loansError) throw loansError;

        const { data: cbuRow, error: cbuError } = await supabase
          .from('capital_build_up')
          .select('starting_share_capital, transaction_date')
          .eq('member_id', memberId)
          .order('transaction_date', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (cbuError) throw cbuError;

        const normalizedLoans = (loansData || []).map((loan) => {
          const principal = Number(loan.principal_amount ?? loan.loan_amount ?? 0);
          const totalInterest = Number(loan.total_interest ?? 0);
          const monthly = Number(loan.monthly_amortization ?? 0);
          return {
            ...loan,
            principal,
            totalInterest,
            totalPayable: principal + totalInterest,
            monthly,
          };
        });

        const fullName = [
          memberRow?.first_name || latestApplication?.first_name,
          latestApplication?.middle_name || memberRow?.middle_initial,
          memberRow?.last_name || latestApplication?.surname || latestApplication?.last_name,
        ]
          .filter(Boolean)
          .join(' ')
          .trim() || 'Member';
        const shareCapital = Number(cbuRow?.starting_share_capital ?? 0);

        if (isMounted) {
          setProfile({
            fullName,
            membershipId: memberRow?.membership_id || 'N/A',
            joinDate: formatDate(memberRow?.membership_date || memberRow?.created_at || latestApplication?.created_at),
            memberType: memberRow?.is_bona_fide ? 'Regular Member' : 'Member',
            isActive: memberRow?.is_bona_fide !== false,
            migsPercent: memberRow?.is_bona_fide ? 95 : 70,
            shareCapital,
          });
          setIsTemporaryAccount(temporaryFlag);
          setMemberLoans(normalizedLoans);
        }
      } catch (err) {
        if (isMounted) {
          setProfileError(err.message || 'Unable to load member dashboard data.');
        }
      } finally {
        if (isMounted) {
          setLoadingProfile(false);
        }
      }
    };

    loadDashboardData();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (isTemporaryAccount) {
      window.alert('Password is in default. Please change password right away in Member Profile.');
    }
  }, [isTemporaryAccount]);

  const activeLoans = useMemo(
    () => memberLoans.filter((loan) => !['rejected', 'cancelled'].includes(String(loan.loan_status || '').toLowerCase())),
    [memberLoans]
  );

  const activeLoanBalance = useMemo(
    () => activeLoans.reduce((sum, loan) => sum + (loan.totalPayable || 0), 0),
    [activeLoans]
  );

  const nextPaymentAmount = useMemo(
    () => activeLoans.reduce((sum, loan) => sum + (loan.monthly || 0), 0),
    [activeLoans]
  );

  const nextPaymentDate = activeLoans[0]?.application_date ? formatDate(activeLoans[0].application_date) : 'N/A';

  return (
   <div className="flex min-h-screen bg-[#F8F9FA]">
      {/* Sidebar */}
      <aside className="bg-white w-64 p-4 flex flex-col border-r border-gray-200">
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
   
        <nav className="flex flex-col gap-2 text-sm flex-grow">
          {(() => {
            const routeMap = {
              "Dashboard": "/member-dashboard",
              "Member Loans": "/member-loans",
              "Loan Lifecycle": "/member-lifecycle",
              "Member Profile": "/members-profile", // Note: removed the 's' here for consistency
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
                  {({ isActive }) => ( // Passing isActive down to the Icon strokeWidth
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
   
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-white h-16 shadow-sm flex items-center justify-end px-8 z-10">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400"/>
            <input 
              type="text" 
              className="bg-gray-50 w-64 h-10 rounded-full border border-gray-200 pl-10 pr-4 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D6021] focus:bg-white transition-all"
              placeholder="Search..."
            />
          </div>
          <button className="ml-6 relative p-2 rounded-full text-gray-500 hover:bg-gray-100 transition-colors">
            <Bell className="w-5 h-5"/>
            <span className="absolute top-1.5 right-1.5 block h-2 w-2 rounded-full bg-red-500 ring-2 ring-white"></span>
          </button>
          
          <div className="flex items-center ml-4 gap-3 border-l border-gray-200 pl-4 cursor-pointer">
            <div className="w-8 h-8 rounded-full bg-gray-200 overflow-hidden border border-gray-300">
               <img src="src/assets/img/member-profile.png" alt="Profile" className="w-full h-full object-cover" />
            </div>
            <p className="text-sm font-bold text-gray-700">Member</p>
          </div>
        </header>
   
        {/* Scrollable Main */}
        <main className="p-8 overflow-y-auto">
          <h1 className="font-extrabold text-[#1a4a2f] text-2xl mb-6">Dashboard</h1>

          {isTemporaryAccount ? (
            <div className="mb-6 p-4 rounded-xl border border-amber-200 bg-amber-50 text-sm text-amber-800 font-semibold flex items-center justify-between gap-3">
              <span>Your account is using a default password. Change it right away.</span>
              <button
                onClick={() => navigate('/members-profile')}
                className="px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-bold hover:bg-amber-700"
              >
                Change Password
              </button>
            </div>
          ) : null}

          {/* Top Section: Profile & Status */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            
            {/* Profile Card */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 lg:col-span-2 flex flex-col sm:flex-row items-center sm:items-start gap-6 relative">
              <div className="relative">
                <div className="w-24 h-24 rounded-full border-4 border-[#EAF1EB] overflow-hidden bg-gray-100">
                  <img src="src/assets/img/member-profile.png" alt="Juan Dela Cruz" className="w-full h-full object-cover" />
                </div>
                <div className="absolute bottom-1 right-1 w-4 h-4 bg-green-500 border-2 border-white rounded-full"></div>
              </div>
              
              <div className="flex-1 text-center sm:text-left">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                  <div className="flex items-center justify-center sm:justify-start gap-3">
                    <h2 className="text-xl font-bold text-gray-900">{profile?.fullName || 'Loading...'}</h2>
                    <span className={`${profile?.isActive ? 'bg-[#1D6021]' : 'bg-gray-500'} text-white px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase`}>
                      {profile?.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
                
                <div className="flex flex-col sm:flex-row sm:items-center justify-between text-sm text-gray-500 mb-6">
                  <div>
                    <p className="font-medium">Member ID: <span className="text-gray-900">{profile?.membershipId || 'N/A'}</span></p>
                    <p className="font-medium">Join Date: <span className="text-gray-900">{profile?.joinDate || 'N/A'}</span></p>
                  </div>
                  <div className="mt-2 sm:mt-0 font-medium">
                    Type: <span className="text-gray-900">{profile?.memberType || 'Member'}</span>
                  </div>
                </div>

                {profileError ? (
                  <p className="text-xs text-red-600 font-semibold mb-3">{profileError}</p>
                ) : null}

                <button className="flex items-center justify-center gap-2 border border-[#1D6021] text-[#1D6021] hover:bg-[#EAF1EB] transition-colors font-bold rounded-lg px-4 py-2 text-sm">
                  <Pencil className="w-4 h-4" /> Edit Profile
                </button>
              </div>
            </div>

            {/* Status Circles Card */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-center gap-8">
              <div className="flex flex-col items-center">
                <div className="w-20 h-20 rounded-full border-8 border-[#1D6021] flex items-center justify-center mb-3">
                  <span className="font-extrabold text-gray-900 text-lg">100%</span>
                </div>
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider text-center">Profile<br/>Updated</p>
              </div>
              <div className="flex flex-col items-center">
                <div className="w-20 h-20 rounded-full border-8 border-[#1D6021] flex items-center justify-center mb-3">
                  <span className="font-extrabold text-gray-900 text-lg">{profile?.migsPercent ?? 0}%</span>
                </div>
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider text-center">MIGS<br/>Standing</p>
              </div>
            </div>

          </div>

          {/* Balances Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {/* Share Capital */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col">
              <div className="w-8 h-8 rounded-lg bg-[#EAF1EB] flex items-center justify-center mb-4">
                <Wallet className="w-4 h-4 text-[#1D6021]" />
              </div>
              <p className="text-xs font-bold text-gray-500 mb-1">Share Capital</p>
                <h3 className="text-2xl font-black text-gray-900 mb-2">{formatCurrency(profile?.shareCapital || 0)}</h3>
              <p className="text-[10px] font-bold text-green-600 flex items-center mt-auto">
                <ArrowUpRight className="w-3 h-3 mr-0.5" /> +5.2% from last month
              </p>
            </div>

            {/* Total Savings */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col">
              <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center mb-4">
                <PiggyBank className="w-4 h-4 text-blue-600" />
              </div>
              <p className="text-xs font-bold text-gray-500 mb-1">Total Savings</p>
              <h3 className="text-2xl font-black text-gray-900 mb-2">₱ 67,676.76</h3>
              <p className="text-[10px] font-bold text-green-600 flex items-center mt-auto">
                <ArrowUpRight className="w-3 h-3 mr-0.5" /> +₱ 2,500.00 new deposit
              </p>
            </div>

            {/* Active Loan Balance */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col">
              <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center mb-4">
                <CreditCard className="w-4 h-4 text-red-500" />
              </div>
              <p className="text-xs font-bold text-gray-500 mb-1">Active Loan Balance</p>
              <h3 className="text-2xl font-black text-gray-900 mb-2">{formatCurrency(activeLoanBalance)}</h3>
              <p className="text-[10px] font-semibold text-gray-400 mt-auto">
                {activeLoans.length ? `${activeLoans.length} active loan(s)` : 'No active loans'}
              </p>
            </div>

            {/* Next Payment (Green Card) */}
            <div className="bg-[#2C7A3F] p-6 rounded-2xl shadow-sm flex flex-col text-white relative overflow-hidden">
              <div className="absolute top-6 right-6 bg-white/20 px-2 py-1 rounded text-[9px] font-bold tracking-wider uppercase">
                Due in 5 Days
              </div>
              <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center mb-4 backdrop-blur-sm">
                <Calendar className="w-4 h-4 text-white" />
              </div>
              <p className="text-xs font-semibold text-green-100 mb-1">Next Payment</p>
              <h3 className="text-2xl font-black mb-2">{formatCurrency(nextPaymentAmount)}</h3>
              <p className="text-[10px] font-medium text-green-100 mt-auto">
                Due on: {nextPaymentDate}
              </p>
            </div>
          </div>

          {/* Bottom Section: Transactions & Activity */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Recent Transactions Table */}
            <div className="lg:col-span-2">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-900 flex items-center">
                  <History className="w-5 h-5 mr-2 text-[#1D6021]" /> Recent Transactions
                </h3>
                <button className="text-sm font-bold text-[#1D6021] hover:underline">View All</button>
              </div>
              
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-gray-100 text-[10px] uppercase tracking-wider text-gray-400 font-bold">
                      <th className="p-5">Date</th>
                      <th className="p-5">Description</th>
                      <th className="p-5">Category</th>
                      <th className="p-5 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentTransactions.map((tx) => (
                      <tr key={tx.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors last:border-0">
                        <td className="p-5 text-xs text-gray-500 font-medium">{tx.date}</td>
                        <td className="p-5 text-sm font-bold text-gray-800">{tx.desc}</td>
                        <td className="p-5">
                          <span className={`px-2 py-1 rounded text-[9px] font-extrabold tracking-wider ${getCategoryStyle(tx.type)}`}>
                            {tx.category}
                          </span>
                        </td>
                        <td className={`p-5 text-sm font-bold text-right ${tx.highlight ? 'text-[#1D6021]' : 'text-gray-900'}`}>
                          {tx.amount}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Recent Activity Timeline */}
            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-4 invisible lg:visible">Activity</h3> {/* Invisible spacer for alignment */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 h-[calc(100%-2.5rem)] flex flex-col">
                <h4 className="font-bold text-gray-900 mb-6">Recent Activity</h4>
                
                <div className="space-y-6 flex-1">
                  {/* Activity Item 1 */}
                  <div className="flex items-start gap-4">
                    <div className="w-8 h-8 rounded-full bg-green-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <ArrowUpRight className="w-4 h-4 text-green-600" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-900">Savings Deposit</p>
                      <p className="text-xs text-gray-500 font-medium mt-0.5">₱ 2,000.00 • Yesterday</p>
                    </div>
                  </div>

                  {/* Activity Item 2 */}
                  <div className="flex items-start gap-4">
                    <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <CheckCircle2 className="w-4 h-4 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-900">Loan Repayment</p>
                      <p className="text-xs text-gray-500 font-medium mt-0.5">₱ 8,245.00 • Oct 15, 2023</p>
                    </div>
                  </div>

                  {/* Activity Item 3 */}
                  <div className="flex items-start gap-4">
                    <div className="w-8 h-8 rounded-full bg-orange-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <LogIn className="w-4 h-4 text-orange-600" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-900">Portal Login</p>
                      <p className="text-xs text-gray-500 font-medium mt-0.5">IP: 192.168.1.1 • Oct 14, 2023</p>
                    </div>
                  </div>
                </div>

                <button className="w-full mt-6 bg-[#F8F9FA] hover:bg-gray-100 text-gray-700 font-bold text-sm py-2.5 rounded-lg transition-colors">
                  View Transaction History
                </button>
              </div>
            </div>

          </div>

        </main>
      </div>
    </div>
  );
};

export default MemberDashboard;