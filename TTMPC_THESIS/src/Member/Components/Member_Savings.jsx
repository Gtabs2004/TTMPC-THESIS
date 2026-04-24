import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { UserAuth } from "../../contex/AuthContext";
import { supabase } from "../../supabaseClient";
import { resolveMemberContextFromSessionUser } from "../../utils/sessionIdentity";
import { 
  LayoutDashboard, 
  Users, 
  CreditCard, 
  Activity, 
  History,
  Search,
  Bell,
  Menu,
  X,
  Wallet,
  CalendarDays,
  Banknote,
  Download,
  PlusCircle,
  TrendingUp,
  MinusCircle,
} from 'lucide-react';

const styles = `
  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @keyframes slideInLeft {
    from {
      opacity: 0;
      transform: translateX(-20px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  @keyframes spin-slow {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  .animate-fade-in-up {
    animation: fadeInUp 0.6s ease-out;
  }

  .animate-fade-in {
    animation: fadeIn 0.4s ease-out;
  }

  .animate-slide-in-left {
    animation: slideInLeft 0.5s ease-out;
  }

  .animate-spin-slow {
    animation: spin-slow 1.5s linear;
  }

  .transition-all-smooth {
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  tbody tr {
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  tbody tr:hover {
    transform: translateX(2px);
  }
`;

const formatCurrency = (value) => `₱${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const formatDate = (value) => {
  if (!value) return 'N/A';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'N/A';
  return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
};

const Member_Savings = () => {
  const { session, signOut } = UserAuth();
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [loadingSavings, setLoadingSavings] = useState(true);
  const [savingsError, setSavingsError] = useState('');
  const [regularSavings, setRegularSavings] = useState(0);
  const [timeDeposit, setTimeDeposit] = useState(0);
  const [ledgerData, setLedgerData] = useState([]);
  const [memberLabel, setMemberLabel] = useState('Member');

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

  useEffect(() => {
    let isMounted = true;

    const loadSavings = async () => {
      try {
        setLoadingSavings(true);
        setSavingsError('');

        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;

        const sessionUser = authData?.user;
        if (!sessionUser?.id) throw new Error('Please sign in again to load your savings.');

        const { account, member: memberRow } = await resolveMemberContextFromSessionUser(sessionUser);
        const memberId = account?.user_id || sessionUser.id;
        const membershipId = String(account?.membership_id || memberRow?.membership_number_id || '').trim();

        if (!memberId) throw new Error('Unable to resolve member account for savings.');

        const fullName = [memberRow?.first_name, memberRow?.middle_name, memberRow?.surname]
          .filter(Boolean)
          .join(' ')
          .trim();

        const { data: cbuRow, error: cbuError } = await supabase
          .from('capital_build_up')
          .select('starting_share_capital, transaction_date')
          .eq('member_id', memberId)
          .order('transaction_date', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (cbuError) throw cbuError;

        const openingRegularSavings = Number(cbuRow?.starting_share_capital || 0);

        let savingsAccounts = [];
        if (membershipId) {
          const { data: accountRows, error: accountError } = await supabase
            .from('Savings_Transactions')
            .select('Savings_ID, Account_Number, Balance, Savings_Amount, Amount, created_at, membership_number_id')
            .eq('membership_number_id', membershipId)
            .order('created_at', { ascending: false });

          if (!accountError && Array.isArray(accountRows)) {
            savingsAccounts = accountRows;
          }
        }

        const computedTimeDeposit = savingsAccounts.reduce((sum, row) => {
          const balance = Number(row?.Balance ?? row?.Savings_Amount ?? row?.Amount ?? 0);
          return sum + (Number.isFinite(balance) ? balance : 0);
        }, 0);

        let queueRows = [];
        if (membershipId) {
          const { data: queueData, error: queueError } = await supabase
            .from('savings_transaction_queue')
            .select('transaction_id, transaction_type, amount, transaction_status, requested_at')
            .eq('membership_number_id', membershipId)
            .order('requested_at', { ascending: true });

          if (!queueError && Array.isArray(queueData)) {
            queueRows = queueData;
          }
        }

        let runningBalance = openingRegularSavings;
        const mappedLedger = queueRows.map((row, index) => {
          const rawAmount = Number(row?.amount || 0);
          const isWithdraw = String(row?.transaction_type || '').toLowerCase() === 'withdraw';
          const signedAmount = isWithdraw ? -Math.abs(rawAmount) : Math.abs(rawAmount);
          runningBalance += signedAmount;

          return {
            id: row?.transaction_id || `txn-${index + 1}`,
            date: formatDate(row?.requested_at),
            type: isWithdraw ? 'Savings Withdrawal' : 'Savings Deposit',
            typeIcon: isWithdraw ? 'minus' : 'plus',
            amount: `${signedAmount >= 0 ? '+' : '-'}${formatCurrency(Math.abs(signedAmount))}`,
            amountColor: signedAmount >= 0 ? 'text-green-600' : 'text-red-500',
            balance: formatCurrency(runningBalance),
            status: String(row?.transaction_status || 'pending_verification'),
          };
        }).reverse();

        if (mappedLedger.length === 0) {
          mappedLedger.push({
            id: 'opening-balance',
            date: formatDate(cbuRow?.transaction_date),
            type: 'Opening Share Capital',
            typeIcon: 'trend',
            amount: `+${formatCurrency(openingRegularSavings)}`,
            amountColor: 'text-green-600',
            balance: formatCurrency(openingRegularSavings),
            status: 'posted',
          });
        }

        if (isMounted) {
          setMemberLabel(fullName || 'Member');
          setRegularSavings(openingRegularSavings);
          setTimeDeposit(computedTimeDeposit);
          setLedgerData(mappedLedger);
        }
      } catch (err) {
        if (isMounted) {
          setSavingsError(err?.message || 'Unable to load savings data.');
          setLedgerData([]);
          setRegularSavings(0);
          setTimeDeposit(0);
        }
      } finally {
        if (isMounted) {
          setLoadingSavings(false);
        }
      }
    };

    loadSavings();
    return () => {
      isMounted = false;
    };
  }, []);

  const totalSavings = useMemo(() => regularSavings + timeDeposit, [regularSavings, timeDeposit]);

  // Helper function to render the correct icon per transaction type
  const renderTransactionIcon = (type) => {
    switch(type) {
      case 'plus': return <PlusCircle className="w-4 h-4 text-green-600" />;
      case 'trend': return <TrendingUp className="w-4 h-4 text-green-600" />;
      case 'minus': return <MinusCircle className="w-4 h-4 text-red-500" />;
      default: return <PlusCircle className="w-4 h-4 text-gray-400" />;
    }
  };

  return (
    <div className="relative flex min-h-screen bg-[#F8F9FA]">
      <style>{styles}</style>
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
   
      {/* Main Content Area */}
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
            <h1 className="text-base sm:text-lg font-extrabold text-[#1a4a2f] lg:hidden">Savings</h1>
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
               <img src="src/assets/img/member-profile.png" alt="Profile" className="w-full h-full object-cover" />
            </div>
            <p className="hidden sm:block text-sm font-bold text-gray-700">{memberLabel}</p>
          </div>
          </div>
        </header>
   
        {/* Scrollable Main */}
        <main className="p-4 sm:p-6 lg:p-8 overflow-y-auto pb-28 lg:pb-0">
          
          {/* Top Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 mb-8">
            {/* Regular Savings Card */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col">
              <div className="w-10 h-10 rounded-lg bg-[#EAF1EB] flex items-center justify-center mb-6">
                <Wallet className="w-5 h-5 text-[#1D6021]" />
              </div>
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Regular Savings</p>
              <h3 className="text-2xl sm:text-3xl font-black text-gray-900">{formatCurrency(regularSavings)}</h3>
            </div>

            {/* Time Deposit Card */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col">
              <div className="w-10 h-10 rounded-lg bg-[#EAF1EB] flex items-center justify-center mb-6">
                <CalendarDays className="w-5 h-5 text-[#1D6021]" />
              </div>
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Time Deposit</p>
              <h3 className="text-2xl sm:text-3xl font-black text-gray-900">{formatCurrency(timeDeposit)}</h3>
            </div>

            {/* Total Savings Card */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col">
              <div className="w-10 h-10 rounded-lg bg-[#1D6021] flex items-center justify-center mb-6">
                <Banknote className="w-5 h-5 text-white" />
              </div>
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Total Savings</p>
              <h3 className="text-2xl sm:text-3xl font-black text-gray-900">{formatCurrency(totalSavings)}</h3>
            </div>
          </div>

          {savingsError ? (
            <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {savingsError}
            </div>
          ) : null}

          {/* Savings Ledger Container */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
            
            {/* Ledger Header */}
            <div className="p-6 flex items-center justify-between border-b border-gray-100">
               <div>
                 <h3 className="text-xl font-bold text-gray-900">Savings Ledger</h3>
                 <p className="text-xs text-gray-400 font-medium mt-1">Detailed history of all savings transactions</p>
               </div>
               <button className="flex items-center gap-2 bg-[#EAF1EB] text-[#1D6021] hover:bg-[#d8e6da] transition-colors px-4 py-2 rounded-lg text-xs font-bold">
                 <Download className="w-3.5 h-3.5" /> Export Statement
               </button>
            </div>
            
            {/* Ledger Table */}
            <div className="overflow-x-auto">
              <table className="w-full min-w-180 text-left border-collapse">
                <thead>
                  <tr className="bg-[#FAF9FB] border-b border-gray-100 text-[10px] uppercase tracking-wider text-gray-400 font-bold">
                    <th className="p-5 font-bold">Date</th>
                    <th className="p-5 font-bold">Transaction Type</th>
                    <th className="p-5 font-bold text-right">Amount</th>
                    <th className="p-5 font-bold text-right pr-8">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingSavings ? (
                    <tr>
                      <td colSpan={4} className="p-6 text-center text-sm text-gray-500">Loading savings ledger...</td>
                    </tr>
                  ) : ledgerData.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-6 text-center text-sm text-gray-500">No savings transactions yet.</td>
                    </tr>
                  ) : ledgerData.map((row) => (
                    <tr key={row.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors last:border-0">
                      <td className="p-5 text-sm text-gray-500 font-medium whitespace-nowrap">{row.date}</td>
                      <td className="p-5 text-sm font-bold text-gray-700 flex items-center gap-3">
                        {renderTransactionIcon(row.typeIcon)}
                        {row.type}
                      </td>
                      <td className={`p-5 text-sm font-bold text-right whitespace-nowrap ${row.amountColor}`}>
                        {row.amount}
                      </td>
                      <td className="p-5 text-sm font-black text-gray-900 text-right pr-8 whitespace-nowrap">
                        {row.balance}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div className="p-5 border-t border-gray-100 flex items-center justify-between text-xs font-medium text-gray-500">
              <span>Entries: {ledgerData.length}</span>
              <span>Regular + Time Deposit = {formatCurrency(totalSavings)}</span>
            </div>

          </div>
          
        </main>

        {/* Bottom Navigation - Mobile Only */}
        <nav className="fixed bottom-0 left-0 right-0 lg:hidden bg-white border-t border-gray-200 px-2 py-2">
          <div className="max-w-lg mx-auto">
            <div className="flex items-center justify-around gap-1">
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
                        `flex flex-col items-center justify-center px-2.5 py-2 rounded-full transition-all ${
                          isActive
                            ? 'bg-[#1D6021] text-white'
                            : 'text-gray-600 hover:text-[#1D6021]'
                        }`
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <Icon size={20} strokeWidth={isActive ? 2.5 : 2} className="mb-1" />
                          <span className="text-[10px] font-semibold">{item.name.split(' ')[0]}</span>
                        </>
                      )}
                    </NavLink>
                  );
                });
              })()}
            </div>
          </div>
        </nav>
      </div>
    </div>
  );
};

export default Member_Savings;