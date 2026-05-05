import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { UserAuth } from "../../contex/AuthContext";
import { supabase } from "../../supabaseClient";
import { resolveMemberContextFromSessionUser } from "../../utils/sessionIdentity";
import { 
  LayoutDashboard, 
  Users, 
  CreditCard, 
  Activity, 
  Search,
  Bell,
  Menu,
  X,
  Pencil,
  Wallet,
  PiggyBank,
  Calendar,
  ArrowUpRight,
  CheckCircle2,
  History,
  User
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

const MemberDashboard = () => {
  const { session, signOut } = UserAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [memberLoans, setMemberLoans] = useState([]);
  const [recentTransactions, setRecentTransactions] = useState([]);
  const [totalSavings, setTotalSavings] = useState(0);
  const [nextDueDate, setNextDueDate] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [profileError, setProfileError] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarUploadError, setAvatarUploadError] = useState("");
  const [isTemporaryAccount, setIsTemporaryAccount] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const fileInputRef = useRef(null);

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

  const formatDateTime = (value) => {
    if (!value) return 'N/A';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'N/A';
    return date.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const resolveAvatarDisplayUrl = async (storedAvatarValue, userId) => {
    const rawValue = String(storedAvatarValue || '').trim();
    if (!rawValue || !userId) return '';

    const publicMarker = '/storage/v1/object/public/Supporting_Documents/';
    let objectPath = rawValue;

    if (rawValue.startsWith('http')) {
      const markerIndex = rawValue.indexOf(publicMarker);
      if (markerIndex === -1) {
        return rawValue;
      }
      objectPath = decodeURIComponent(rawValue.slice(markerIndex + publicMarker.length));
    }

    if (!objectPath.startsWith(`profiles/${userId}/`)) {
      return '';
    }

    const { data, error } = await supabase.storage
      .from('Supporting_Documents')
      .createSignedUrl(objectPath, 60 * 60 * 24 * 7);

    if (error) {
      return rawValue.startsWith('http') ? rawValue : '';
    }

    return data?.signedUrl || '';
  };

  useEffect(() => {
    let isMounted = true;

    const loadDashboardData = async () => {
      try {
        setLoadingProfile(true);
        setProfileError('');

        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;

        const sessionUser = authData?.user;
        if (!sessionUser?.id) throw new Error('Please sign in again to load your dashboard.');

        const { account, member: memberRow } = await resolveMemberContextFromSessionUser(sessionUser);
        const authEmail = sessionUser?.email || '';
        const memberId = account?.user_id || sessionUser.id;
        if (!memberId) throw new Error('Please sign in again to load your dashboard.');

        const temporaryFlag = Boolean(account?.is_temporary);

        const { data: profileRow, error: profileFetchError } = await supabase
          .from('profiles')
          .select('avatar_url')
          .eq('id', sessionUser.id)
          .maybeSingle();

        if (profileFetchError && profileFetchError.code !== 'PGRST116') {
          throw profileFetchError;
        }

        let latestApplication = null;
        if (account?.membership_id) {
          const { data, error } = await supabase
            .from('member_applications')
            .select('*')
            .eq('membership_id', account.membership_id)
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
          memberRow?.middle_name || latestApplication?.middle_name,
          memberRow?.surname || latestApplication?.surname || latestApplication?.last_name,
        ]
          .filter(Boolean)
          .join(' ')
          .trim() || 'Member';
        const shareCapital = Number(cbuRow?.starting_share_capital ?? 0);
        const membershipId = String(account?.membership_id || memberRow?.membership_number_id || '').trim();

        let savingsAccountTotal = 0;
        if (membershipId) {
          const { data: savingsRows } = await supabase
            .from('Savings_Transactions')
            .select('Balance, Savings_Amount, Amount')
            .eq('membership_number_id', membershipId);

          savingsAccountTotal = (savingsRows || []).reduce((sum, row) => {
            const amount = Number(row?.Balance ?? row?.Savings_Amount ?? row?.Amount ?? 0);
            return sum + (Number.isFinite(amount) ? amount : 0);
          }, 0);
        }

        const loanIds = normalizedLoans
          .map((loan) => String(loan.control_number || '').trim())
          .filter(Boolean);

        let derivedNextDueDate = null;
        if (loanIds.length) {
          const { data: scheduleRows } = await supabase
            .from('loan_schedules')
            .select('loan_id, due_date, schedule_status, expected_amount')
            .in('loan_id', loanIds)
            .order('due_date', { ascending: true });

          const nextSchedule = (scheduleRows || []).find((row) => {
            const status = String(row?.schedule_status || '').trim().toLowerCase();
            return !['paid', 'fully paid', 'completed'].includes(status);
          });
          derivedNextDueDate = nextSchedule?.due_date || null;
        }

        const transactionRows = [];
        if (shareCapital > 0) {
          transactionRows.push({
            id: 'share-capital',
            timestamp: cbuRow?.transaction_date || memberRow?.created_at || new Date().toISOString(),
            date: formatDate(cbuRow?.transaction_date || memberRow?.created_at),
            desc: 'Share Capital Contribution',
            category: 'EQUITY',
            type: 'equity',
            amount: `+${formatCurrency(shareCapital).replace('₱ ', '₱')}`,
            highlight: true,
          });
        }

        if (membershipId) {
          const { data: savingsQueueRows } = await supabase
            .from('savings_transaction_queue')
            .select('transaction_id, transaction_type, amount, requested_at, transaction_status')
            .eq('membership_number_id', membershipId)
            .order('requested_at', { ascending: false })
            .limit(6);

          (savingsQueueRows || []).forEach((row) => {
            const isWithdraw = String(row?.transaction_type || '').toLowerCase() === 'withdraw';
            const amount = Number(row?.amount || 0);
            transactionRows.push({
              id: row?.transaction_id || `savings-${Math.random()}`,
              timestamp: row?.requested_at,
              date: formatDate(row?.requested_at),
              desc: isWithdraw ? 'Savings Withdrawal' : 'Savings Deposit',
              category: 'SAVINGS',
              type: 'savings',
              amount: `${isWithdraw ? '-' : '+'}${formatCurrency(Math.abs(amount)).replace('₱ ', '₱')}`,
              highlight: !isWithdraw,
            });
          });
        }

        if (loanIds.length) {
          const { data: paymentRows } = await supabase
            .from('loan_payments')
            .select('id, payment_date, amount_paid, penalties, loan_id')
            .in('loan_id', loanIds)
            .order('payment_date', { ascending: false })
            .limit(6);

          (paymentRows || []).forEach((row) => {
            const paid = Number(row?.amount_paid || 0);
            const penalties = Number(row?.penalties || 0);
            const totalPaid = paid + penalties;
            transactionRows.push({
              id: row?.id || `loan-${Math.random()}`,
              timestamp: row?.payment_date,
              date: formatDate(row?.payment_date),
              desc: `Loan Repayment (${row?.loan_id || 'Loan'})`,
              category: 'LOAN',
              type: 'loan',
              amount: `-${formatCurrency(totalPaid).replace('₱ ', '₱')}`,
              highlight: false,
            });
          });
        }

        const latestTransactions = transactionRows
          .sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime())
          .slice(0, 6);

        const resolvedAvatarUrl = await resolveAvatarDisplayUrl(profileRow?.avatar_url, sessionUser.id);

        if (isMounted) {
          setProfile({
            fullName,
            membershipId: account?.membership_id || memberRow?.membership_number_id || 'N/A',
            joinDate: formatDate(memberRow?.date_of_membership || memberRow?.created_at || latestApplication?.created_at),
            memberType: 'Member',
            isActive: true,
            migsPercent: 95,
            shareCapital,
          });
          setIsTemporaryAccount(temporaryFlag);
          setMemberLoans(normalizedLoans);
          setTotalSavings(shareCapital + savingsAccountTotal);
          setNextDueDate(derivedNextDueDate);
          setRecentTransactions(latestTransactions);
          setAvatarUrl(resolvedAvatarUrl);
        }
      } catch (err) {
        if (isMounted) {
          setProfileError(err.message || 'Unable to load member dashboard data.');
          setRecentTransactions([]);
          setAvatarUrl('');
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

  const nextPaymentDate = nextDueDate ? formatDate(nextDueDate) : (activeLoans[0]?.application_date ? formatDate(activeLoans[0].application_date) : 'N/A');

  const handleOpenFilePicker = () => {
    if (uploadingAvatar) return;
    fileInputRef.current?.click();
  };

  const handleAvatarFileChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) return;

    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user?.id) {
      setAvatarUploadError('Please sign in again before uploading your photo.');
      return;
    }

    const userId = authData.user.id;
    setAvatarUploadError('');
    setUploadingAvatar(true);

    try {
      const extension = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const storagePath = `profiles/${userId}/avatar.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from('Supporting_Documents')
        .upload(storagePath, file, {
          cacheControl: '3600',
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { error: updateError } = await supabase
        .from('profiles')
        .upsert({ id: userId, avatar_url: storagePath }, { onConflict: 'id' });

      if (updateError) throw updateError;

      const { data: signedData, error: signedError } = await supabase.storage
        .from('Supporting_Documents')
        .createSignedUrl(storagePath, 60 * 60 * 24 * 7);

      if (signedError) throw signedError;

      setAvatarUrl(signedData?.signedUrl || '');
    } catch (err) {
      setAvatarUploadError(err?.message || 'Unable to upload profile photo.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const daysUntilNextDue = useMemo(() => {
    if (!nextDueDate) return null;
    const due = new Date(nextDueDate);
    if (Number.isNaN(due.getTime())) return null;
    const now = new Date();
    const diffMs = due.getTime() - now.getTime();
    return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  }, [nextDueDate]);

  const recentActivities = useMemo(
    () => recentTransactions.slice(0, 3).map((tx) => ({
      id: tx.id,
      title: tx.desc,
      subtitle: `${tx.amount} • ${formatDateTime(tx.timestamp)}`,
      type: tx.type,
    })),
    [recentTransactions]
  );

  return (
  <div className="relative flex h-screen overflow-hidden bg-[#F8F9FA]">
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
      <div className="flex-1 flex flex-col overflow-hidden lg:pl-0">
        {/* Header */}
        <header className="bg-white h-16 shadow-sm flex items-center justify-between px-4 sm:px-6 lg:px-8 z-10">
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              aria-label="Open sidebar"
              onClick={() => setIsSidebarOpen(true)}
              className="rounded-md p-2 text-gray-600 hover:bg-gray-100 lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="text-base sm:text-lg font-extrabold text-[#1a4a2f] lg:hidden">Dashboard</h1>
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
              {avatarUrl ? (
                <img src={avatarUrl} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gray-100 text-gray-500">
                  <User className="w-4 h-4" />
                </div>
              )}
            </div>
            <p className="hidden sm:block text-sm font-bold text-gray-700">{profile?.fullName || 'Member'}</p>
          </div>
          </div>
        </header>
   
        {/* Scrollable Main */}
        <main className="p-4 sm:p-6 lg:p-8 overflow-y-auto pb-28 lg:pb-0">
          <h1 className="hidden lg:block font-extrabold text-[#1a4a2f] text-2xl mb-6">Dashboard</h1>

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
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 mb-6">
            
            {/* Profile Card */}
            <div className="bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-gray-100 lg:col-span-2 flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-6 relative">
              <div className="relative">
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full border-4 border-[#EAF1EB] overflow-hidden bg-gray-100">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt={profile?.fullName || 'Member profile'} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-500">
                      <User className="w-10 h-10" />
                    </div>
                  )}
                </div>
                <div className="absolute bottom-1 right-1 w-4 h-4 bg-green-500 border-2 border-white rounded-full"></div>
              </div>
              
              <div className="flex-1 text-center sm:text-left">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                  <div className="flex items-center justify-center sm:justify-start gap-3">
                    <h2 className="text-lg sm:text-xl font-bold text-gray-900">{profile?.fullName || 'Loading...'}</h2>
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

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={handleOpenFilePicker}
                    disabled={uploadingAvatar}
                    className="flex items-center justify-center gap-2 border border-[#1D6021] text-[#1D6021] hover:bg-[#EAF1EB] transition-colors font-bold rounded-lg px-4 py-2 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {uploadingAvatar ? (
                      <>
                        <span className="inline-block h-4 w-4 rounded-full border-2 border-[#1D6021] border-t-transparent animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      'Change Photo'
                    )}
                  </button>
                  <button onClick={() => navigate('/members-profile')} className="flex items-center justify-center gap-2 border border-[#1D6021] text-[#1D6021] hover:bg-[#EAF1EB] transition-colors font-bold rounded-lg px-4 py-2 text-sm">
                  <Pencil className="w-4 h-4" /> Edit Profile
                  </button>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarFileChange}
                />
                {avatarUploadError ? (
                  <p className="text-xs text-red-600 font-semibold mt-3">{avatarUploadError}</p>
                ) : null}
              </div>
            </div>

            {/* Status Circles Card */}
            <div className="bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-center gap-4 sm:gap-8">
              <div className="flex flex-col items-center">
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full border-8 border-[#1D6021] flex items-center justify-center mb-3">
                  <span className="font-extrabold text-gray-900 text-lg">100%</span>
                </div>
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider text-center">Profile<br/>Updated</p>
              </div>
              <div className="flex flex-col items-center">
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full border-8 border-[#1D6021] flex items-center justify-center mb-3">
                  <span className="font-extrabold text-gray-900 text-lg">{profile?.migsPercent ?? 0}%</span>
                </div>
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider text-center">MIGS<br/>Standing</p>
              </div>
            </div>

          </div>

          {/* Balances Section */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-6 mb-8">
            {/* Share Capital */}
            <div className="bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col">
              <div className="w-8 h-8 rounded-lg bg-[#EAF1EB] flex items-center justify-center mb-4">
                <Wallet className="w-4 h-4 text-[#1D6021]" />
              </div>
              <p className="text-xs font-bold text-gray-500 mb-1">Share Capital</p>
              <h3 className="text-xl sm:text-2xl font-black text-gray-900 mb-2">{formatCurrency(profile?.shareCapital || 0)}</h3>
              <p className="text-[10px] font-bold text-green-600 flex items-center mt-auto">
                <ArrowUpRight className="w-3 h-3 mr-0.5" /> +5.2% from last month
              </p>
            </div>

            {/* Total Savings */}
            <div className="bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col">
              <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center mb-4">
                <PiggyBank className="w-4 h-4 text-blue-600" />
              </div>
              <p className="text-xs font-bold text-gray-500 mb-1">Total Savings</p>
              <h3 className="text-xl sm:text-2xl font-black text-gray-900 mb-2">{formatCurrency(totalSavings)}</h3>
              <p className="text-[10px] font-semibold text-gray-500 flex items-center mt-auto">
                Based on share capital and savings account balances
              </p>
            </div>

            {/* Active Loan Balance */}
            <div className="bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col">
              <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center mb-4">
                <CreditCard className="w-4 h-4 text-red-500" />
              </div>
              <p className="text-xs font-bold text-gray-500 mb-1">Active Loan Balance</p>
              <h3 className="text-xl sm:text-2xl font-black text-gray-900 mb-2">{formatCurrency(activeLoanBalance)}</h3>
              <p className="text-[10px] font-semibold text-gray-400 mt-auto">
                {activeLoans.length ? `${activeLoans.length} active loan(s)` : 'No active loans'}
              </p>
            </div>

            {/* Next Payment (Green Card) */}
            <div className="bg-[#2C7A3F] p-5 sm:p-6 rounded-2xl shadow-sm flex flex-col text-white relative overflow-hidden">
              <div className="absolute top-6 right-6 bg-white/20 px-2 py-1 rounded text-[9px] font-bold tracking-wider uppercase">
                {daysUntilNextDue === null ? 'No due date' : `Due in ${daysUntilNextDue} day${daysUntilNextDue === 1 ? '' : 's'}`}
              </div>
              <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center mb-4 backdrop-blur-sm">
                <Calendar className="w-4 h-4 text-white" />
              </div>
              <p className="text-xs font-semibold text-green-100 mb-1">Next Payment</p>
              <h3 className="text-xl sm:text-2xl font-black mb-2">{formatCurrency(nextPaymentAmount)}</h3>
              <p className="text-[10px] font-medium text-green-100 mt-auto">
                Due on: {nextPaymentDate}
              </p>
            </div>
          </div>

          {/* Bottom Section: Transactions & Activity */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
            
            {/* Recent Transactions Table */}
            <div className="lg:col-span-2">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-900 flex items-center">
                  <History className="w-5 h-5 mr-2 text-[#1D6021]" /> Recent Transactions
                </h3>
                <button className="text-sm font-bold text-[#1D6021] hover:underline">View All</button>
              </div>
              
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left border-collapse">
                  <thead>
                    <tr className="border-b border-gray-100 text-[10px] uppercase tracking-wider text-gray-400 font-bold">
                      <th className="p-5">Date</th>
                      <th className="p-5">Description</th>
                      <th className="p-5">Category</th>
                      <th className="p-5 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentTransactions.length ? recentTransactions.map((tx) => (
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
                    )) : (
                      <tr>
                        <td colSpan={4} className="p-6 text-sm text-gray-500 text-center">No transactions yet.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
                </div>
              </div>
            </div>

            {/* Recent Activity Timeline */}
            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-4 invisible lg:visible">Activity</h3> {/* Invisible spacer for alignment */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 sm:p-6 h-auto lg:h-[calc(100%-2.5rem)] flex flex-col">
                <h4 className="font-bold text-gray-900 mb-6">Recent Activity</h4>
                
                <div className="space-y-6 flex-1">
                  {recentActivities.length ? recentActivities.map((activity) => (
                    <div key={activity.id} className="flex items-start gap-4">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${activity.type === 'loan' ? 'bg-blue-50' : activity.type === 'savings' ? 'bg-green-50' : 'bg-orange-50'}`}>
                        {activity.type === 'loan' ? (
                          <CheckCircle2 className="w-4 h-4 text-blue-600" />
                        ) : (
                          <ArrowUpRight className={`w-4 h-4 ${activity.type === 'savings' ? 'text-green-600' : 'text-orange-600'}`} />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-gray-900">{activity.title}</p>
                        <p className="text-xs text-gray-500 font-medium mt-0.5">{activity.subtitle}</p>
                      </div>
                    </div>
                  )) : (
                    <p className="text-sm text-gray-500">No recent activity yet.</p>
                  )}
                </div>

                <button className="w-full mt-6 bg-[#F8F9FA] hover:bg-gray-100 text-gray-700 font-bold text-sm py-2.5 rounded-lg transition-colors">
                  View Transaction History
                </button>
              </div>
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

export default MemberDashboard;