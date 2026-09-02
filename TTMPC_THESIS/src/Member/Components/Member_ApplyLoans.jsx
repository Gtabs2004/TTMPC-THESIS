import React, { useEffect, useState } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { UserAuth } from "../../contex/AuthContext";
import { useTheme } from "../../contex/ThemeContext";
import { supabase } from "../../supabaseClient";
import { resolveMemberContextFromSessionUser } from "../../utils/sessionIdentity";
import { loadMemberAvatarSignedUrl } from "../../utils/memberAvatar";
import LoanNotificationBell from "../../components/LoanNotificationBell";
import {
  LayoutDashboard,
  Users,
  CreditCard,
  Activity,
  Search,
  Bell,
  Menu,
  X,
  History,
  User,
  Receipt,
  Library,
  AlertCircle,
  Gift,
  Calculator,
  Moon,
  Sun,
  Scroll
} from "lucide-react";
import LoanCalculatorModal from "./LoanCalculatorModal";
import { useLoanEligibility } from "../../hooks/useLoanEligibility";

const selectorOptions = [
  {
    key: "consolidated",
    label: "Consolidated Loan",
    path: "/conso_choice",
    icon: Library,
    tone: "bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
  },
  {
    key: "emergency",
    label: "Emergency Loan",
    path: "/Emergency_Loan",
    icon: AlertCircle,
    tone: "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400",
  },
  {
    key: "bonus",
    label: "Bonus Loan",
    path: "/Bonus_Loan",
    icon: Gift,
    tone: "bg-[#F0FDF4] text-green-600 dark:bg-green-900/30 dark:text-green-400",
  },
];

// Bonus loans may only be availed during Mid-year (May) and Year-end
// (November) bonus release windows. The FastAPI backend enforces the same
// rule as the source of truth.
const BONUS_APPLICATION_MONTHS = [5, 11];
const BONUS_WINDOW_MESSAGE =
  'Bonus loan applications are accepted only during Mid-year (May) and Year-end (November).';

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

  .animate-fade-in-up {
    animation: fadeInUp 0.6s ease-out;
  }

  .animate-fade-in {
    animation: fadeIn 0.4s ease-out;
  }

  .animate-slide-in-left {
    animation: slideInLeft 0.5s ease-out;
  }
`;

const menuItems = [
  { name: "Dashboard", label: "Dashboard", icon: LayoutDashboard },
  { name: "Apply for Loan", label: "Apply", icon: Scroll },
  { name: "Member Loans", label: "Loans", icon: Activity },
  { name: "Statement of Account", label: "Statement", icon: Receipt },
  { name: "Loan Lifecycle", label: "Lifecycle", icon: History },
  { name: "Member Profile", label: "Profile", icon: Users }
];

const Member_ApplyLoans = () => {
  const { signOut } = UserAuth();
  const navigate = useNavigate();
  const [memberLabel, setMemberLabel] = useState("Member");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);
  const { isDark, toggleTheme } = useTheme();
  const [memberId, setMemberId] = useState(null);
  const { data: eligibility, status: eligibilityStatus } = useLoanEligibility(memberId);
  const eligibilityReady = eligibilityStatus === "ready";
  const perType = eligibility?.per_type || {};

  // Per-type helpers. An active loan of one type does not block other types.
  const bucketFor = (key) => perType[key] || null;
  const currentMonth = new Date().getMonth() + 1;
  const bonusWindowOpen = BONUS_APPLICATION_MONTHS.includes(currentMonth);

  const isLocked = (key) => {
    if (key === 'bonus' && !bonusWindowOpen) return true;
    // While loading, lock all cards — safer than showing them as open
    if (!eligibilityReady) return true;
    const b = bucketFor(key);
    if (!b) return false;
    return !b.can_apply_new && !b.can_renew;
  };
  const anyRestriction = eligibilityReady && Object.values(perType).some(
    (b) => !b?.can_apply_new || !b?.can_renew,
  );
  const anyFullyBlocked = eligibilityReady && Object.values(perType).some(
    (b) => !b?.can_apply_new && !b?.can_renew,
  );

  useEffect(() => {
    let isMounted = true;

    const loadMemberIdentity = async () => {
      try {
        // Fast path: read from the login bundle cached by AuthContext at login.
        // This avoids all DB queries — memberId is available synchronously.
        const cached = sessionStorage.getItem("_member_login_bundle_cache");
        if (cached) {
          const { bundle, timestamp } = JSON.parse(cached);
          const isFresh = Date.now() - timestamp < 5 * 60 * 1000;
          if (isFresh && bundle?.member) {
            const m = bundle.member;
            const fullName = [m.first_name, m.middle_name, m.surname]
              .filter(Boolean).join(" ").trim();
            if (isMounted) {
              setMemberLabel(fullName || "Member");
              setMemberId(m.id || bundle.account?.user_id || null);
              if (bundle.avatar_url) setAvatarUrl(bundle.avatar_url);
            }
            return;
          }
        }

        // Slow path: cache miss — fall back to DB queries
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;

        const sessionUser = authData?.user;
        if (!sessionUser?.id) return;

        const { member: memberRow } = await resolveMemberContextFromSessionUser(sessionUser);
        const fullName = [memberRow?.first_name, memberRow?.middle_name, memberRow?.surname]
          .filter(Boolean)
          .join(" ")
          .trim();

        if (isMounted) {
          setMemberLabel(fullName || "Member");
          setMemberId(memberRow?.id || sessionUser.id || null);
        }

        const signedAvatarUrl = await loadMemberAvatarSignedUrl(supabase, sessionUser.id);
        if (isMounted) setAvatarUrl(signedAvatarUrl || "");
      } catch (_error) {
        if (isMounted) {
          setMemberLabel("Member");
          setAvatarUrl("");
        }
      }
    };

    loadMemberIdentity();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleSignOut = async (e) => {
    e.preventDefault();
    try {
      await signOut();
      navigate("/");
    } catch (err) {
      console.error("Failed to sign out:", err);
    }
  };

  return (
    <div className="relative flex h-screen overflow-hidden bg-[#F8F9FA] dark:bg-gray-950">
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
        className={`fixed inset-y-0 left-0 z-30 w-64 transform bg-white p-4 flex flex-col border-r border-gray-200 dark:bg-gray-900 dark:border-gray-800 transition-transform duration-200 ease-out lg:fixed lg:translate-x-0 ${
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
            <h1 className="text-xl font-bold text-primary">TTMPC</h1>
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
              "Apply for Loan": "/member-apply-loans",
              "Member Loans": "/member-loans",
              "Statement of Account": "/member-statement-of-account",
              "Loan Lifecycle": "/member-lifecycle",
           
              "Member Profile": "/members-profile", 
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
                        ? 'bg-[#EAF1EB] text-member-green font-bold dark:bg-green-900/30 dark:text-green-400'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-member-green font-medium dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-green-400'
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
          className="mt-auto w-full rounded-lg p-2.5 text-sm bg-member-green hover:bg-[#154718] text-white font-bold transition-colors"
        >
          Sign out
        </button>
      </aside>

   
      {/* Main Content */}
      <div className="min-w-0 flex-1 flex flex-col overflow-hidden lg:ml-64">
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
            <h1 className="text-base sm:text-lg font-extrabold text-[#1a4a2f] dark:text-green-400 lg:hidden">Apply for Loans</h1>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            
            <LoanNotificationBell role="member" accentClass="bg-member-green" />
            <button
              onClick={toggleTheme}
              className="p-2 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            >
              {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
          </div>
        </header>

        {/* Scrollable Page Content */}
        <main className="p-3 sm:p-6 lg:p-8 overflow-y-auto pb-28 lg:pb-0">
          <h1 className="hidden lg:block font-extrabold text-[#1a4a2f] dark:text-green-400 text-2xl mb-6 lg:mb-8">Apply for Loans</h1>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-6 dark:bg-gray-900 dark:border-gray-800">
            <div className="flex flex-col gap-3 mb-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Choose Loan Type</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Select your loan type to continue with the application form.</p>
              </div>
              <div className="w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setIsCalculatorOpen(true)}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-full border border-member-green px-3 py-2 text-[11px] font-bold text-member-green hover:bg-[#EAF1EB] dark:border-green-500 dark:text-green-400 dark:hover:bg-green-900/30 sm:w-auto sm:py-1"
                >
                  <Calculator className="w-3.5 h-3.5" /> Simulate Before Applying
                </button>
               
              </div>
            </div>

            {anyRestriction && (
              <div
                className={`mb-4 rounded-xl border p-3 sm:p-4 flex items-start gap-3 ${
                  anyFullyBlocked
                    ? "border-red-200 bg-red-50 text-red-800"
                    : "border-amber-200 bg-amber-50 text-amber-800"
                }`}
                role="alert"
              >
                <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
                <div className="min-w-0 text-sm">
                  <p className="font-bold">
                    {anyFullyBlocked
                      ? "Some loan types are locked because you have an active loan of that type."
                      : "Some loan types only allow Renewal right now."}
                  </p>
                  <ul className="mt-2 space-y-1 text-xs">
                    {Object.entries(perType).map(([key, bucket]) => {
                      if (!bucket) return null;
                      const locked = !bucket.can_apply_new && !bucket.can_renew;
                      const partial = !bucket.can_apply_new && bucket.can_renew;
                      if (!locked && !partial) return null;
                      return (
                        <li key={key}>
                          <span className="font-bold capitalize">{key}:</span>{" "}
                          <span>{bucket.reason}</span>
                        </li>
                      );
                    })}
                  </ul>
                  {eligibility?.simulation_active && (
                    <p className="mt-2 text-[10px] font-bold uppercase tracking-wider">Simulation Mode</p>
                  )}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
              {selectorOptions.map((item) => {
                const Icon = item.icon;
                const disabled = isLocked(item.key);
                const bucket = bucketFor(item.key);
                const bonusClosed = item.key === 'bonus' && !bonusWindowOpen;
                const disabledReason = bonusClosed
                  ? BONUS_WINDOW_MESSAGE
                  : (bucket?.reason || "This loan type is locked while you have an active one.");
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => {
                      if (disabled) return;
                      navigate(item.path);
                    }}
                    disabled={disabled}
                    aria-disabled={disabled}
                    title={disabled ? disabledReason : ""}
                    className={`min-h-36 bg-white rounded-2xl flex flex-col items-center justify-center shadow-sm border border-slate-100 transition-all group p-4 sm:p-6 dark:bg-gray-800 dark:border-gray-700 ${
                      disabled
                        ? "opacity-50 grayscale cursor-not-allowed"
                        : "cursor-pointer hover:shadow-lg hover:border-[#A0D284]"
                    }`}
                  >
                    <div className={`${item.tone} p-3 sm:p-4 rounded-full mb-2 sm:mb-3 ${disabled ? "" : "group-hover:scale-110"} transition-transform duration-300`}>
                      <Icon size={28} strokeWidth={2} className="sm:h-8 sm:w-8" />
                    </div>
                    <h1 className="font-bold text-slate-800 text-sm text-center dark:text-gray-200">{item.label}</h1>
                    {disabled && (
                      <span className="mt-2 text-[10px] font-bold uppercase tracking-wider text-red-600 dark:text-red-400">
                        {!eligibilityReady ? 'Checking...' : bonusClosed ? 'Window closed' : 'Locked'}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </main>

      </div>

      <LoanCalculatorModal open={isCalculatorOpen} onClose={() => setIsCalculatorOpen(false)} />
    </div>
  );
};

export default Member_ApplyLoans;
