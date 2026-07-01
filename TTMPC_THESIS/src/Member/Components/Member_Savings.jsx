import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { UserAuth } from "../../contex/AuthContext";
import { useNotification } from "../../contex/NotificationContext";
import { supabase } from "../../supabaseClient";
import { resolveMemberContextFromSessionUser } from "../../utils/sessionIdentity";
import { loadMemberAvatarSignedUrl } from "../../utils/memberAvatar";
import LoanNotificationBell from "../../components/LoanNotificationBell";
import { getOrFetch, peek } from "../memberDataCache";
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
  User,
  Receipt,
  Settings,
} from 'lucide-react';
import SettingsDrawer from './SettingsDrawer';

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
  const { addNotification } = useNotification();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [loadingSavings, setLoadingSavings] = useState(true);
  const [savingsError, setSavingsError] = useState('');
  const [regularSavings, setRegularSavings] = useState(0);
  const [timeDeposit, setTimeDeposit] = useState(0);
  const [ledgerData, setLedgerData] = useState([]);
  const [memberLabel, setMemberLabel] = useState('Member');
  const [avatarUrl, setAvatarUrl] = useState('');

  const menuItems = [
    { name: "Dashboard", icon: LayoutDashboard },
    { name: "Member Loans", icon: Activity },
    { name: "Statement of Account", icon: Receipt },
    { name: "Loan Lifecycle", icon: History },
    { name: "Member Savings", icon: CreditCard },
    { name: "Member Profile", icon: Users },
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

    const buildSavingsSnapshot = async () => {
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
        const signedAvatarUrl = await loadMemberAvatarSignedUrl(supabase, sessionUser.id);

        // 1. Find this member's savings account(s) in the new schema
        const { data: savingsAccountRows, error: savingsAccountError } = await supabase
          .from('savings_accounts')
          .select('account_number, balance, account_kind, status, account_name')
          .eq('member_id', memberId);

        if (savingsAccountError) throw savingsAccountError;

        const accountNumbers = (savingsAccountRows || []).map((r) => r.account_number);
        const totalRegular = (savingsAccountRows || []).reduce((sum, r) => sum + Number(r?.balance || 0), 0);

        // 2. Pull the ledger entries for those accounts
        let ledgerRows = [];
        if (accountNumbers.length > 0) {
          const { data: ledger, error: ledgerError } = await supabase
            .from('savings_ledger')
            .select('id, account_number, entry_type, amount, running_balance, reference, source, remarks, posted_at')
            .in('account_number', accountNumbers)
            .order('posted_at', { ascending: false });

          if (!ledgerError && Array.isArray(ledger)) {
            ledgerRows = ledger;
          }
        }

        // 3. CBU still relevant for new-system members (post go-live)
        const { data: cbuRows, error: cbuError } = await supabase
          .from('capital_build_up')
          .select('starting_share_capital, ending_share_capital, capital_added, transaction_date')
          .eq('member_id', memberId)
          .order('transaction_date', { ascending: false });

        if (cbuError) throw cbuError;
        const cbuRow = (cbuRows && cbuRows[0]) || null;

        // 4. Pending/in-flight transactions (queue) - still tracked by membership_id
        let queueRows = [];
        if (membershipId) {
          const { data: queueData, error: queueError } = await supabase
            .from('savings_transaction_queue')
            .select('transaction_id, transaction_type, amount, transaction_status, requested_at')
            .eq('membership_number_id', membershipId)
            .order('requested_at', { ascending: false });

          if (!queueError && Array.isArray(queueData)) {
            queueRows = queueData;
          }
        }

        // Build the unified ledger view: ledger rows (posted) + queue rows (pending)
        const mappedLedger = [
          ...ledgerRows.map((row) => {
            const isCredit = String(row?.entry_type || '').toLowerCase() === 'credit';
            const amount = Number(row?.amount || 0);
            const signed = isCredit ? amount : -amount;
            return {
              id: row.id,
              date: formatDate(row?.posted_at),
              type: row?.remarks || (isCredit ? 'Savings Deposit' : 'Savings Withdrawal'),
              typeIcon: isCredit ? 'plus' : 'minus',
              amount: `${signed >= 0 ? '+' : '-'}${formatCurrency(Math.abs(signed))}`,
              amountColor: signed >= 0 ? 'text-green-600' : 'text-red-500',
              balance: formatCurrency(Number(row?.running_balance || 0)),
              status: 'posted',
            };
          }),
          ...queueRows
            .filter((row) => String(row?.transaction_status || '').toLowerCase() !== 'validated')
            .map((row, index) => {
              const rawAmount = Number(row?.amount || 0);
              const isWithdraw = String(row?.transaction_type || '').toLowerCase() === 'withdraw';
              const signedAmount = isWithdraw ? -Math.abs(rawAmount) : Math.abs(rawAmount);
              return {
                id: row?.transaction_id || `txn-${index + 1}`,
                date: formatDate(row?.requested_at),
                type: `${isWithdraw ? 'Savings Withdrawal' : 'Savings Deposit'} (pending)`,
                typeIcon: isWithdraw ? 'minus' : 'plus',
                amount: `${signedAmount >= 0 ? '+' : '-'}${formatCurrency(Math.abs(signedAmount))}`,
                amountColor: 'text-gray-500',
                balance: '—',
                status: String(row?.transaction_status || 'pending_verification'),
              };
            }),
        ];

        if (mappedLedger.length === 0 && totalRegular > 0) {
          mappedLedger.push({
            id: 'opening-balance',
            date: formatDate(cbuRow?.transaction_date),
            type: 'Opening Balance',
            typeIcon: 'trend',
            amount: `+${formatCurrency(totalRegular)}`,
            amountColor: 'text-green-600',
            balance: formatCurrency(totalRegular),
            status: 'posted',
          });
        }

        return {
          memberLabel: fullName || 'Member',
          avatarUrl: signedAvatarUrl || '',
          regularSavings: totalRegular,
          timeDeposit: 0,
          ledgerData: mappedLedger,
          _sessionUserId: sessionUser.id,
        };
    };

    const applySavingsSnapshot = (snap) => {
      if (!snap) return;
      setMemberLabel(snap.memberLabel);
      setAvatarUrl(snap.avatarUrl);
      setRegularSavings(snap.regularSavings);
      setTimeDeposit(snap.timeDeposit);
      setLedgerData(snap.ledgerData);
    };

    (async () => {
      try {
        setSavingsError('');
        const { data: authData } = await supabase.auth.getUser();
        const cacheKey = `member-savings:${authData?.user?.id || 'anon'}`;
        const cached = peek(cacheKey);
        if (cached) {
          applySavingsSnapshot(cached);
          setLoadingSavings(false);
        } else {
          setLoadingSavings(true);
        }
        const snap = await getOrFetch(cacheKey, buildSavingsSnapshot, 60_000);
        if (isMounted) applySavingsSnapshot(snap);
      } catch (err) {
        if (isMounted) {
          setSavingsError(err?.message || 'Unable to load savings data.');
          setAvatarUrl('');
          setLedgerData([]);
          setRegularSavings(0);
          setTimeDeposit(0);
        }
      } finally {
        if (isMounted) setLoadingSavings(false);
      }
    })();
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
    <div className="relative flex min-h-screen bg-[#F8F9FA] dark:bg-gray-950">
      <style>{styles}</style>
      <SettingsDrawer isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      {isSidebarOpen ? (
        <button
          aria-label="Close sidebar overlay"
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 z-20 bg-black/30 lg:hidden"
        />
      ) : null}
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 w-64 transform bg-white dark:bg-gray-900 p-4 flex flex-col border-r border-gray-200 dark:border-gray-800 transition-transform duration-200 ease-out lg:fixed lg:translate-x-0 ${
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
          <img src="/img/ttmpc logo.png" alt="Logo" className="h-12 w-auto" />
          <div className="flex flex-col">
            <h1 className="text-xl font-bold text-[#389734]">TTMPC</h1>
            <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-bold">
              Members Portal
            </p>
          </div>
        </div>
   
        <hr className="w-full border-gray-100 dark:border-gray-800 mb-6" />
   
        <nav className="flex grow flex-col gap-2 text-sm">
          {(() => {
            const routeMap = {
              "Dashboard": "/member-dashboard",
              "Member Loans": "/member-loans",
              "Statement of Account": "/member-statement-of-account",
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
                        ? 'bg-[#EAF1EB] text-[#1D6021] font-bold dark:bg-green-900/30 dark:text-green-400'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-[#1D6021] font-medium dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-green-400'
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
      <div className="flex-1 flex flex-col overflow-hidden lg:ml-64">
        {/* Header */}
        <header className="bg-white dark:bg-gray-900 h-16 shadow-sm flex items-center justify-between px-4 sm:px-6 lg:px-8 z-10 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              aria-label="Open sidebar"
              onClick={() => setIsSidebarOpen(true)}
              className="rounded-md p-2 text-gray-600 hover:bg-gray-100 lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="text-base sm:text-lg font-extrabold text-[#1a4a2f] dark:text-green-400 lg:hidden">Savings</h1>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
          <div className="relative hidden md:block">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400"/>
            <input
              type="text"
              className="bg-gray-50 dark:bg-gray-800 w-64 h-10 rounded-full border border-gray-200 dark:border-gray-700 pl-10 pr-4 py-1 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#1D6021] focus:bg-white dark:focus:bg-gray-800 transition-all"
              placeholder="Search..."
            />
          </div>
          <LoanNotificationBell role="member" accentClass="bg-[#1D6021]" />

          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label="Open settings"
          >
            <Settings className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2 sm:gap-3 border-l border-gray-200 dark:border-gray-700 pl-2 sm:pl-4 cursor-pointer">
            <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden border border-gray-300 dark:border-gray-600">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                  <User className="w-4 h-4" />
                </div>
              )}
            </div>
            <p className="hidden sm:block text-sm font-bold text-gray-700 dark:text-gray-200">{memberLabel}</p>
          </div>
          </div>
        </header>
   
        {/* Scrollable Main */}
        <main className="p-4 sm:p-6 lg:p-8 overflow-y-auto pb-28 lg:pb-0">
          
          {/* Top Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 mb-8">
            {/* Regular Savings Card */}
            <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 flex flex-col">
              <div className="w-10 h-10 rounded-lg bg-[#EAF1EB] dark:bg-green-900/30 flex items-center justify-center mb-6">
                <Wallet className="w-5 h-5 text-[#1D6021] dark:text-green-400" />
              </div>
              <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1">Regular Savings</p>
              <h3 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white">{formatCurrency(regularSavings)}</h3>
            </div>

            {/* Time Deposit Card */}
            <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 flex flex-col">
              <div className="w-10 h-10 rounded-lg bg-[#EAF1EB] dark:bg-green-900/30 flex items-center justify-center mb-6">
                <CalendarDays className="w-5 h-5 text-[#1D6021] dark:text-green-400" />
              </div>
              <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1">Time Deposit</p>
              <h3 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white">{formatCurrency(timeDeposit)}</h3>
            </div>

            {/* Total Savings Card */}
            <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 flex flex-col">
              <div className="w-10 h-10 rounded-lg bg-[#1D6021] flex items-center justify-center mb-6">
                <Banknote className="w-5 h-5 text-white" />
              </div>
              <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1">Total Savings</p>
              <h3 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white">{formatCurrency(totalSavings)}</h3>
            </div>
          </div>

          {savingsError ? (
            <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {savingsError}
            </div>
          ) : null}

          {/* Savings Ledger Container */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden flex flex-col">

            {/* Ledger Header */}
            <div className="p-6 flex items-center justify-between border-b border-gray-100 dark:border-gray-800">
               <div>
                 <h3 className="text-xl font-bold text-gray-900 dark:text-white">Savings Ledger</h3>
                 <p className="text-xs text-gray-400 dark:text-gray-500 font-medium mt-1">Detailed history of all savings transactions</p>
               </div>
               <button className="flex items-center gap-2 bg-[#EAF1EB] dark:bg-green-900/30 text-[#1D6021] dark:text-green-400 hover:bg-[#d8e6da] dark:hover:bg-green-900/50 transition-colors px-4 py-2 rounded-lg text-xs font-bold">
                 <Download className="w-3.5 h-3.5" /> Export Statement
               </button>
            </div>
            
            {/* Ledger Table */}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left border-collapse">
                <thead>
                  <tr className="bg-green-700 text-[10px] uppercase tracking-wider text-white font-extrabold">
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
                    <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                      <td className="p-5 text-sm text-gray-500 dark:text-gray-400 font-medium whitespace-nowrap">{row.date}</td>
                      <td className="p-5 text-sm font-bold text-gray-700 dark:text-gray-200 flex items-center gap-3">
                        {renderTransactionIcon(row.typeIcon)}
                        {row.type}
                      </td>
                      <td className={`p-5 text-sm font-bold text-right whitespace-nowrap ${row.amountColor}`}>
                        {row.amount}
                      </td>
                      <td className="p-5 text-sm font-black text-gray-900 dark:text-white text-right pr-8 whitespace-nowrap">
                        {row.balance}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div className="p-5 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between text-xs font-medium text-gray-500 dark:text-gray-400">
              <span>Entries: {ledgerData.length}</span>
              <span>Regular + Time Deposit = {formatCurrency(totalSavings)}</span>
            </div>

          </div>
          
        </main>

        {/* Bottom Navigation - Mobile Only */}
        <nav className="fixed bottom-0 left-0 right-0 lg:hidden bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 px-2 py-2">
          <div className="max-w-lg mx-auto">
            <div className="flex items-center justify-around gap-1">
              {(() => {
                const routeMap = {
                  "Dashboard": "/member-dashboard",
                  "Member Loans": "/member-loans",
                  "Statement of Account": "/member-statement-of-account",
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
                            : 'text-gray-600 dark:text-gray-400 hover:text-[#1D6021] dark:hover:text-green-400'
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