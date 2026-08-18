import React, { useEffect, useMemo, useState } from "react";
import { Link } from 'react-router-dom';
import { useNavigate, NavLink } from "react-router-dom";
import { UserAuth } from "../../contex/AuthContext";
import { useNotification } from "../../contex/NotificationContext";
import { supabase } from "../../supabaseClient";
import { resolveMemberContextFromSessionUser } from "../../utils/sessionIdentity";
import { useMigsLabel, getMigsBadgeClasses } from "../../hooks/useMigsLabel";
import LoanNotificationBell from "../../components/LoanNotificationBell";
import LoanCalculatorModal from "./LoanCalculatorModal";
import MemberDashboardLoading from "./MemberDashboardLoading";
import { getOrFetch, peek } from "../memberDataCache";
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
  History,
  User,
  Receipt,
  Calculator,
  FileText,
  Settings,
  Scroll
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

const MemberDashboard = () => {
  const { session, signOut } = UserAuth();
  const navigate = useNavigate();
  const { addNotification } = useNotification();
  const [profile, setProfile] = useState(null);
  const [migsMemberKey, setMigsMemberKey] = useState(null);
  const { data: migsLabel, status: migsLabelStatus } = useMigsLabel(migsMemberKey);
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);
  const [memberLoans, setMemberLoans] = useState([]);
  const [recentTransactions, setRecentTransactions] = useState([]);
  const [totalSavings, setTotalSavings] = useState(0);
  const [nextDueDate, setNextDueDate] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [profileError, setProfileError] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [isTemporaryAccount, setIsTemporaryAccount] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [memberLabel, setMemberLabel] = useState('Member');

  const menuItems = [
    { name: "Dashboard", label: "Dashboard", icon: LayoutDashboard },
    { name: "Apply for Loan", label: "Apply", icon: Scroll },
    { name: "Member Loans", label: "Loans", icon: Activity },
    { name: "Statement of Account", label: "Statement", icon: Receipt },
    { name: "Loan Lifecycle", label: "Lifecycle", icon: History },
    { name: "Member Profile", label: "Profile", icon: Users },
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

    const applySnapshot = (snap) => {
      if (!isMounted || !snap) return;
      setProfile(snap.profile);
      setMigsMemberKey(snap.migsMemberKey);
      setIsTemporaryAccount(snap.isTemporary);
      setMemberLoans(snap.normalizedLoans);
      setTotalSavings(snap.savingsAccountTotal);
      setNextDueDate(snap.derivedNextDueDate);
      setRecentTransactions(snap.latestTransactions);
      setAvatarUrl(snap.resolvedAvatarUrl);
    };

    // Try to load cached bundle from sessionStorage (pre-loaded by AuthContext on login)
    const loadCachedBundle = () => {
      try {
        const cached = sessionStorage.getItem('_member_login_bundle_cache');
        if (!cached) return null;
        
        const { bundle, sessionUserId, timestamp } = JSON.parse(cached);
        
        // Validate cache is fresh (5 minute TTL) and belongs to current user
        if (Date.now() - timestamp > 5 * 60 * 1000) {
          sessionStorage.removeItem('_member_login_bundle_cache');
          return null;
        }
        
        if (sessionUserId !== session?.user?.id) {
          sessionStorage.removeItem('_member_login_bundle_cache');
          return null;
        }
        
        return bundle;
      } catch (err) {
        console.warn('[Member_Dashboard] Cache parse error:', err?.message);
        return null;
      }
    };

    // Fast path: single RPC call replaces the ~9 per-query fetches below.
    // Returns null if the RPC hasn't been deployed yet or the account row
    // is missing, so the caller can fall through to the legacy path.
    const buildSnapshotFromRpc = async (sessionUser) => {
      const { data: bundle, error } = await supabase.rpc('get_member_login_bundle', {
        p_auth_user_id: sessionUser.id,
      });
      if (error) throw error;
      if (!bundle || bundle.error || !bundle.account) return null;

      const account = bundle.account;
      const memberRow = bundle.member || null;
      const authEmail = sessionUser?.email || '';
      const memberId = account?.user_id || sessionUser.id;
      const membershipId = String(account?.membership_id || memberRow?.membership_number_id || '').trim();
      const temporaryFlag = Boolean(account?.is_temporary);
      const latestApplication = bundle.application || null;

      const cbuRows = bundle.cbu || [];
      const cbuRow = cbuRows[0] || null;
      const shareCapitalBalance = cbuRow
        ? (cbuRow.ending_share_capital !== null && cbuRow.ending_share_capital !== undefined
            ? Number(cbuRow.ending_share_capital)
            : cbuRows.reduce((sum, row) => sum + Number(row?.capital_added || 0), 0))
        : 0;

      const normalizedLoans = (bundle.loans || []).map((loan) => {
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
      ].filter(Boolean).join(' ').trim() || 'Member';

      const shareCapital = Number.isFinite(shareCapitalBalance) ? shareCapitalBalance : 0;

      const savingsAccountTotal = (bundle.savings || []).reduce((sum, row) => {
        const amount = Number(row?.Balance ?? row?.Savings_Amount ?? row?.Amount ?? 0);
        return sum + (Number.isFinite(amount) ? amount : 0);
      }, 0);

      const nextSchedule = (bundle.upcoming_schedules || []).find((row) => {
        const statusText = String(row?.schedule_status || '').trim().toLowerCase();
        return !['paid', 'fully paid', 'completed'].includes(statusText);
      });
      const derivedNextDueDate = nextSchedule?.due_date || null;

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

      (bundle.pending_savings || []).forEach((row) => {
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

      (bundle.recent_payments || []).forEach((row) => {
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

      const latestTransactions = transactionRows
        .sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime())
        .slice(0, 6);

      const resolvedAvatarUrl = await resolveAvatarDisplayUrl(bundle.avatar_url, sessionUser.id);

      return {
        profile: {
          fullName,
          membershipId: account?.membership_id || memberRow?.membership_number_id || 'N/A',
          joinDate: formatDate(memberRow?.date_of_membership || memberRow?.created_at || latestApplication?.created_at),
          memberType: 'Member',
          isActive: true,
          shareCapital,
        },
        migsMemberKey: memberId || account?.membership_id || memberRow?.id || null,
        isTemporary: temporaryFlag,
        normalizedLoans,
        savingsAccountTotal,
        derivedNextDueDate,
        latestTransactions,
        resolvedAvatarUrl,
        _sessionUserId: sessionUser.id,
      };
    };

    const buildSnapshot = async () => {
        // Sequential — auth + context must resolve before per-member queries.
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;

        const sessionUser = authData?.user;
        if (!sessionUser?.id) throw new Error('Please sign in again to load your dashboard.');

        // FAST PATH — try the RPC bundle first (1 round-trip instead of ~9).
        // If it fails for any reason (RPC not deployed yet, network hiccup,
        // shape mismatch) we silently fall through to the legacy per-query
        // path below so the dashboard still loads.
        try {
          const rpcSnap = await buildSnapshotFromRpc(sessionUser);
          if (rpcSnap) return rpcSnap;
        } catch (rpcErr) {
          console.warn('[Member_Dashboard] RPC bundle failed, falling back to per-query path:', rpcErr?.message || rpcErr);
        }

        const { account, member: memberRow } = await resolveMemberContextFromSessionUser(sessionUser);
        const authEmail = sessionUser?.email || '';
        const memberId = account?.user_id || sessionUser.id;
        if (!memberId) throw new Error('Please sign in again to load your dashboard.');

        const temporaryFlag = Boolean(account?.is_temporary);
        const membershipId = String(account?.membership_id || memberRow?.membership_number_id || '').trim();

        // BATCH 1 — independent queries that don't need loanIds yet. Fan out in parallel.
        const [
          profileResult,
          applicationByIdResult,
          applicationByEmailResult,
          loansResult,
          cbuResult,
          savingsResult,
        ] = await Promise.all([
          supabase.from('profiles').select('avatar_url').eq('id', sessionUser.id).maybeSingle(),
          account?.membership_id
            ? supabase.from('member_applications').select('*').eq('membership_id', account.membership_id).order('created_at', { ascending: false }).limit(1).maybeSingle()
            : Promise.resolve({ data: null, error: null }),
          authEmail
            ? supabase.from('member_applications').select('*').ilike('email', authEmail).order('created_at', { ascending: false }).limit(1).maybeSingle()
            : Promise.resolve({ data: null, error: null }),
          supabase.from('loans').select('control_number, principal_amount, loan_amount, total_interest, monthly_amortization, loan_status, application_date, term').eq('member_id', memberId).order('application_date', { ascending: false }),
          supabase.from('capital_build_up').select('starting_share_capital, ending_share_capital, capital_added, transaction_date').eq('member_id', memberId).order('transaction_date', { ascending: false }),
          membershipId
            ? supabase.from('Savings_Transactions').select('Balance, Savings_Amount, Amount').eq('membership_number_id', membershipId)
            : Promise.resolve({ data: [], error: null }),
        ]);

        const { data: profileRow, error: profileFetchError } = profileResult;
        if (profileFetchError && profileFetchError.code !== 'PGRST116') throw profileFetchError;

        // Prefer membership_id match; fall back to email match.
        const latestApplication = applicationByIdResult?.data || applicationByEmailResult?.data || null;

        const { data: loansData, error: loansError } = loansResult;
        if (loansError) throw loansError;
        const { data: cbuRows, error: cbuError } = cbuResult;
        if (cbuError) throw cbuError;

        const cbuRow = (cbuRows && cbuRows[0]) || null;
        const shareCapitalBalance = cbuRow
          ? (cbuRow.ending_share_capital !== null && cbuRow.ending_share_capital !== undefined
              ? Number(cbuRow.ending_share_capital)
              : (cbuRows || []).reduce((sum, row) => sum + Number(row?.capital_added || 0), 0))
          : 0;

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
        const shareCapital = Number.isFinite(shareCapitalBalance) ? shareCapitalBalance : 0;

        const savingsAccountTotal = (savingsResult?.data || []).reduce((sum, row) => {
          const amount = Number(row?.Balance ?? row?.Savings_Amount ?? row?.Amount ?? 0);
          return sum + (Number.isFinite(amount) ? amount : 0);
        }, 0);

        const loanIds = normalizedLoans
          .map((loan) => String(loan.control_number || '').trim())
          .filter(Boolean);

        // BATCH 2 — queries that need loanIds and/or are recent-activity only.
        // Fan out the schedule, savings queue, payment, and avatar fetches together.
        const [
          schedulesResult,
          savingsQueueResult,
          paymentsResult,
          resolvedAvatarUrl,
        ] = await Promise.all([
          loanIds.length
            ? supabase.from('loan_schedules').select('loan_id, due_date, schedule_status, expected_amount').in('loan_id', loanIds).order('due_date', { ascending: true })
            : Promise.resolve({ data: [], error: null }),
          membershipId
            ? supabase.from('savings_transaction_queue').select('transaction_id, transaction_type, amount, requested_at, transaction_status').eq('membership_number_id', membershipId).order('requested_at', { ascending: false }).limit(6)
            : Promise.resolve({ data: [], error: null }),
          loanIds.length
            ? supabase.from('loan_payments').select('id, payment_date, amount_paid, penalties, loan_id').in('loan_id', loanIds).order('payment_date', { ascending: false }).limit(6)
            : Promise.resolve({ data: [], error: null }),
          resolveAvatarDisplayUrl(profileRow?.avatar_url, sessionUser.id),
        ]);

        const nextSchedule = (schedulesResult?.data || []).find((row) => {
          const statusText = String(row?.schedule_status || '').trim().toLowerCase();
          return !['paid', 'fully paid', 'completed'].includes(statusText);
        });
        const derivedNextDueDate = nextSchedule?.due_date || null;

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

        (savingsQueueResult?.data || []).forEach((row) => {
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

        (paymentsResult?.data || []).forEach((row) => {
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

        const latestTransactions = transactionRows
          .sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime())
          .slice(0, 6);

        return {
          profile: {
            fullName,
            membershipId: account?.membership_id || memberRow?.membership_number_id || 'N/A',
            joinDate: formatDate(memberRow?.date_of_membership || memberRow?.created_at || latestApplication?.created_at),
            memberType: 'Member',
            isActive: true,
            shareCapital,
          },
          // Endpoint accepts either UUID or membership_id.
          migsMemberKey: memberId || account?.membership_id || memberRow?.id || null,
          isTemporary: temporaryFlag,
          normalizedLoans,
          savingsAccountTotal,
          derivedNextDueDate,
          latestTransactions,
          resolvedAvatarUrl,
          _sessionUserId: sessionUser.id,
        };
    };

    const loadDashboardData = async () => {
      try {
        setProfileError('');
        const { data: authData } = await supabase.auth.getUser();
        const cacheKey = `member-dashboard:${authData?.user?.id || 'anon'}`;

        // FAST PATH 1 — Try sessionStorage cache (pre-loaded by AuthContext on login)
        const cachedBundle = loadCachedBundle();
        if (cachedBundle && isMounted) {
          try {
            // Process bundle synchronously using same logic as buildSnapshotFromRpc
            const account = cachedBundle.account;
            const memberRow = cachedBundle.member || null;
            const authEmail = authData?.user?.email || '';
            const memberId = account?.user_id || authData?.user?.id;
            const membershipId = String(account?.membership_id || memberRow?.membership_number_id || '').trim();
            const temporaryFlag = Boolean(account?.is_temporary);

            const cbuRows = cachedBundle.cbu || [];
            const cbuRow = cbuRows[0] || null;
            const shareCapitalBalance = cbuRow
              ? (cbuRow.ending_share_capital !== null && cbuRow.ending_share_capital !== undefined
                  ? Number(cbuRow.ending_share_capital)
                  : cbuRows.reduce((sum, row) => sum + Number(row?.capital_added || 0), 0))
              : 0;

            const normalizedLoans = (cachedBundle.loans || []).map((loan) => {
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
              memberRow?.first_name || cachedBundle.application?.first_name,
              memberRow?.middle_name || cachedBundle.application?.middle_name,
              memberRow?.surname || cachedBundle.application?.surname || cachedBundle.application?.last_name,
            ].filter(Boolean).join(' ').trim() || 'Member';

            const shareCapital = Number.isFinite(shareCapitalBalance) ? shareCapitalBalance : 0;
            const savingsAccountTotal = (cachedBundle.savings || []).reduce((sum, row) => {
              const amount = Number(row?.Balance ?? row?.Savings_Amount ?? row?.Amount ?? 0);
              return sum + (Number.isFinite(amount) ? amount : 0);
            }, 0);

            const nextSchedule = (cachedBundle.upcoming_schedules || []).find((row) => {
              const statusText = String(row?.schedule_status || '').trim().toLowerCase();
              return !['paid', 'fully paid', 'completed'].includes(statusText);
            });
            const derivedNextDueDate = nextSchedule?.due_date || null;

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

            (cachedBundle.pending_savings || []).forEach((row) => {
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

            (cachedBundle.recent_payments || []).forEach((row) => {
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

            const latestTransactions = transactionRows
              .sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime())
              .slice(0, 6);

            const resolvedAvatarUrl = await resolveAvatarDisplayUrl(cachedBundle.avatar_url, authData?.user?.id);

            const cachedSnapshot = {
              profile: {
                fullName,
                membershipId: account?.membership_id || memberRow?.membership_number_id || 'N/A',
                joinDate: formatDate(memberRow?.date_of_membership || memberRow?.created_at || cachedBundle.application?.created_at),
                memberType: 'Member',
                isActive: true,
                shareCapital,
              },
              migsMemberKey: memberId || account?.membership_id || memberRow?.id || null,
              isTemporary: temporaryFlag,
              normalizedLoans,
              savingsAccountTotal,
              derivedNextDueDate,
              latestTransactions,
              resolvedAvatarUrl,
              _sessionUserId: authData?.user?.id,
            };

            applySnapshot(cachedSnapshot);
            setLoadingProfile(false);
            console.log('[Member_Dashboard] Loaded from sessionStorage cache');
          } catch (cacheErr) {
            console.warn('[Member_Dashboard] Error processing cached bundle:', cacheErr?.message);
            // Fall through to normal loading if cache processing fails
          }
        }

        // If we already have a fresh snapshot, paint it instantly and skip the spinner.
        const cached = peek(cacheKey);
        if (cached) {
          applySnapshot(cached);
          setLoadingProfile(false);
        } else {
          setLoadingProfile(true);
        }

        const snap = await getOrFetch(cacheKey, buildSnapshot, 60_000);
        applySnapshot(snap);
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
      addNotification('Your password is still the default one. Please change it right away in Member Profile.', 'warning', 8000);
    }
  }, [isTemporaryAccount, addNotification]);

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

  const daysUntilNextDue = useMemo(() => {
    if (!nextDueDate) return null;
    const due = new Date(nextDueDate);
    if (Number.isNaN(due.getTime())) return null;
    const now = new Date();
    const diffMs = due.getTime() - now.getTime();
    return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  }, [nextDueDate]);

  // Show loading skeleton while dashboard data is loading
  if (loadingProfile) {
    return <MemberDashboardLoading />;
  }

  return (
  <div className="relative flex h-screen overflow-hidden bg-[#F8F9FA] dark:bg-gray-950">
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
   
        <nav className="flex flex-col gap-2 text-sm flex-grow">
          {(() => {
            const routeMap = {
              "Dashboard": "/member-dashboard",
              "Apply for Loan": "/member-apply-loans",
              " Loans": "/member-loans",
              "Statement of Account": "/member-statement-of-account",
              "Loan Lifecycle": "/member-lifecycle",
              " Profile": "/members-profile", 
              
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
              <header className="bg-white dark:bg-gray-900 h-16 shrink-0 shadow-sm flex items-center justify-between px-4 sm:px-6 lg:px-8 z-10 border-b border-gray-100 dark:border-gray-800">
                <div className="flex items-center gap-2 sm:gap-3">
                  <button
                    aria-label="Open sidebar"
                    onClick={() => setIsSidebarOpen(true)}
                    className="rounded-md p-2 text-gray-600 hover:bg-gray-100 lg:hidden"
                  >
                    <Menu className="h-5 w-5" />
                  </button>
                  <h1 className="text-base sm:text-lg font-extrabold text-[#1a4a2f] dark:text-green-400 lg:hidden">Dashboard</h1>
                </div>

                <div className="flex items-center gap-2 sm:gap-4">
                  
                  <LoanNotificationBell role="member" accentClass="bg-[#1D6021]" />
                  <button
                    onClick={() => setIsSettingsOpen(true)}
                    className="p-2 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    aria-label="Open settings"
                  >
                    <Settings className="w-5 h-5" />
                  </button>
                </div>
              </header>
         
        {/* Scrollable Main */}
        <main className="p-4 sm:p-6 lg:p-8 overflow-y-auto pb-28 lg:pb-0">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
            <h1 className="hidden lg:block font-extrabold text-[#1a4a2f] dark:text-green-400 text-2xl">Dashboard</h1>

            <div className="flex justify-center sm:justify-start gap-3">
              <button
                type="button"
                onClick={() => navigate('/member-apply-loans')}
                className="inline-flex items-center gap-2 rounded-lg bg-[#1D6021] hover:bg-[#154718] text-white text-xs font-bold px-4 py-2 shadow-sm cursor-pointer"
              >
                <FileText className="w-4 h-4" /> Apply for Loans
              </button>
              <button
                type="button"
                onClick={() => setIsCalculatorOpen(true)}
                className="inline-flex items-center gap-2 rounded-lg bg-[#1D6021] hover:bg-[#154718] text-white text-xs font-bold px-4 py-2 shadow-sm cursor-pointer"
              >
                <Calculator className="w-4 h-4" /> Loan Calculator
              </button>
            </div>
          </div>

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
            <div className="bg-white dark:bg-gray-900 p-4 sm:p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 lg:col-span-2 flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-6 relative">
              <div className="relative">
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full border-4 border-[#EAF1EB] overflow-hidden bg-gray-100 dark:bg-gray-700">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt={profile?.fullName || 'Member profile'} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-500 dark:text-gray-400">
                      <User className="w-10 h-10" />
                    </div>
                  )}
                </div>
                <div className="absolute bottom-1 right-1 w-4 h-4 bg-green-500 border-2 border-white rounded-full"></div>
              </div>
              
              <div className="flex-1 text-center sm:text-left">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                  <div className="flex items-center justify-center sm:justify-start gap-3">
                    <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">{profile?.fullName || 'Loading...'}</h2>
                    <span className={`${profile?.isActive ? 'bg-[#1D6021]' : 'bg-gray-500'} text-white px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase`}>
                      {profile?.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
                
                <div className="flex flex-col sm:flex-row sm:items-center justify-between text-sm text-gray-500 dark:text-gray-400 mb-6">
                  <div>
                    <p className="font-medium">Member ID: <span className="text-gray-900 dark:text-gray-200">{profile?.membershipId || 'N/A'}</span></p>
                    <p className="font-medium">Join Date: <span className="text-gray-900 dark:text-gray-200">{profile?.joinDate || 'N/A'}</span></p>
                  </div>
                  <div className="mt-2 sm:mt-0 font-medium">
                    Type: <span className="text-gray-900 dark:text-gray-200">{profile?.memberType || 'Member'}</span>
                  </div>
                </div>

                {profileError ? (
                  <p className="text-xs text-red-600 font-semibold mb-3">{profileError}</p>
                ) : null}

                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                  <button onClick={() => navigate('/members-profile')} className="flex items-center justify-center gap-2 border border-[#1D6021] text-[#1D6021] hover:bg-[#EAF1EB] dark:border-green-500 dark:text-green-400 dark:hover:bg-green-900/30 transition-colors font-bold rounded-lg px-4 py-2 text-sm">
                  <Pencil className="w-4 h-4" /> Edit Profile
                  </button>
                </div>
              </div>
            </div>

            {/* MIGS Progress Summary Card */}
            <div className="bg-white dark:bg-gray-900 p-5 sm:p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 flex flex-col justify-center w-full">
              {(() => {
                // Basic calculations
                const score = migsLabel?.score || 0;
                const label = migsLabel?.label;
                const isMigs = String(label || '').toLowerCase().startsWith('migs');
                const isUnscored = !label || label === 'Unscored';
                
                // Assuming 100 is the perfect score based on your breakdown table
                const maxScore = 100; 
                const percentage = isUnscored ? 0 : Math.min(100, Math.max(0, Math.round((score / maxScore) * 100)));

                // Dynamic styling based on status
                const barColor = isUnscored
                  ? 'bg-gray-300 dark:bg-gray-700'
                  : (isMigs ? 'bg-[#1D6021]' : 'bg-rose-500');

                const badgeClasses = isUnscored
                  ? 'bg-gray-100 text-gray-500 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700'
                  : (isMigs ? 'bg-green-50 text-[#1D6021] border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800' : 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-800');

                // Loading State
                if (migsLabelStatus === 'loading') {
                  return (
                    <div className="animate-pulse flex flex-col gap-4 w-full">
                      <div className="flex justify-between items-start w-full">
                        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-24 mb-2"></div>
                        <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-16"></div>
                      </div>
                      <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-20"></div>
                      <div className="h-2.5 bg-gray-200 dark:bg-gray-700 rounded-full w-full mt-2"></div>
                    </div>
                  );
                }

                return (
                  <>
                    {/* Top Section: Title, Score, and Badge */}
                    <div className="flex justify-between items-start mb-5">
                      <div>
                        <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                          MIGS Classification
                        </h3>
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-gray-900 dark:text-white leading-none">
                            {isUnscored ? '—' : score}
                          </span>
                          <span className="text-sm font-semibold text-gray-400 dark:text-gray-500">
                            / {maxScore}
                          </span>
                        </div>
                      </div>
                      
                      
                      {label && (
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border ${badgeClasses}`}>
                          {isUnscored && migsLabelStatus === 'unscored' ? 'Not Scored' : label}
                        </span>
                      )}
                    </div>

                    
                    <div className="mt-1">
                      <div className="flex justify-between items-center text-xs font-bold mb-2">
                        <span className="text-gray-500 dark:text-gray-400"> Progress</span>
                        <span className={isMigs ? "text-[#1D6021] dark:text-green-400" : (isUnscored ? "text-gray-400 dark:text-gray-500" : "text-rose-600 dark:text-rose-400")}>
                          {percentage}%
                        </span>
                      </div>
                      <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-2.5 overflow-hidden flex shadow-inner">
                        <div 
                          className={`h-full rounded-full transition-all duration-1000 ease-out ${barColor}`} 
                          style={{ width: `${percentage}%` }}
                        ></div>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>

          </div>

          {/* Balances Section */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-6 mb-8">
            {/* Share Capital */}
            <div className="bg-white dark:bg-gray-900 p-5 sm:p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 flex flex-col">
              <div className="w-8 h-8 rounded-lg bg-[#EAF1EB] dark:bg-green-900/30 flex items-center justify-center mb-4">
                <Wallet className="w-4 h-4 text-[#1D6021] dark:text-green-400" />
              </div>
              <p className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">Share Capital</p>
              <h3 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white mb-2">{formatCurrency(profile?.shareCapital || 0)}</h3>
              <p className="text-[10px] font-bold text-green-600 dark:text-green-400 flex items-center mt-auto">
                <ArrowUpRight className="w-3 h-3 mr-0.5" /> +5.2% from last month
              </p>
            </div>

            {/* Total Savings */}
            <div className="bg-white dark:bg-gray-900 p-5 sm:p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 flex flex-col">
              <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center mb-4">
                <PiggyBank className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              </div>
              <p className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">Total Savings</p>
              <h3 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white mb-2">{formatCurrency(totalSavings)}</h3>
              <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 flex items-center mt-auto">
                Based on savings account balances
              </p>
            </div>

            {/* Active Loan Balance */}
            <div className="bg-white dark:bg-gray-900 p-5 sm:p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 flex flex-col">
              <div className="w-8 h-8 rounded-lg bg-red-50 dark:bg-red-900/30 flex items-center justify-center mb-4">
                <CreditCard className="w-4 h-4 text-red-500 dark:text-red-400" />
              </div>
              <p className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">Active Loan Balance</p>
              <h3 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white mb-2">{formatCurrency(activeLoanBalance)}</h3>
              <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 mt-auto">
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

          {/* Bottom Section: Transactions */}
          <div>
            {/* Recent Transactions Table */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center">
                  <History className="w-5 h-5 mr-2 text-[#1D6021] dark:text-green-400" /> Recent Transactions
                </h3>
                <button className="text-sm font-bold text-[#1D6021] dark:text-green-400 hover:underline">View All</button>
              </div>
              
              <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
                <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left border-collapse">
                  <thead>
                    <tr className="bg-green-700 text-[10px] uppercase tracking-wider text-white font-extrabold">
                      <th className="p-5">Date</th>
                      <th className="p-5">Description</th>
                      <th className="p-5">Category</th>
                      <th className="p-5 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentTransactions.length ? recentTransactions.map((tx) => (
                      <tr key={tx.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors">
                        <td className="p-5 text-xs text-gray-500 dark:text-gray-400 font-medium">{tx.date}</td>
                        <td className="p-5 text-sm font-bold text-gray-800 dark:text-gray-200">{tx.desc}</td>
                        <td className="p-5">
                          <span className={`badge-animated px-2 py-1 rounded text-[9px] font-extrabold tracking-wider ${getCategoryStyle(tx.type)}`}>
                            {tx.category}
                          </span>
                        </td>
                        <td className={`p-5 text-sm font-bold text-right ${tx.highlight ? 'text-[#1D6021] dark:text-green-400' : 'text-gray-900 dark:text-white'}`}>
                          {tx.amount}
                        </td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={4} className="p-6 text-sm text-gray-500 dark:text-gray-400 text-center">No transactions yet.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
                </div>
              </div>
            </div>
          </div>

        </main>

      </div>

      <LoanCalculatorModal open={isCalculatorOpen} onClose={() => setIsCalculatorOpen(false)} />
    </div>
  );
};

export default MemberDashboard;