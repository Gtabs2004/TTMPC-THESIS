import React, { useEffect, useState } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { UserAuth } from "../../contex/AuthContext";
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
} from "lucide-react";
import LoanCalculatorModal from "./LoanCalculatorModal";

const selectorOptions = [
  {
    key: "consolidated",
    label: "Consolidated Loan",
    path: "/Consolidated_Loan",
    icon: Library,
    tone: "bg-blue-50 text-blue-600",
  },
  {
    key: "emergency",
    label: "Emergency Loan",
    path: "/Emergency_Loan",
    icon: AlertCircle,
    tone: "bg-red-50 text-red-600",
  },
  {
    key: "bonus",
    label: "Bonus Loan",
    path: "/Bonus_Loan",
    icon: Gift,
    tone: "bg-[#F0FDF4] text-green-600",
  },
];

const Member_ApplyLoans = () => {
  const { signOut } = UserAuth();
  const navigate = useNavigate();
  const [memberLabel, setMemberLabel] = useState("Member");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);

  const menuItems = [
    { name: "Dashboard", icon: LayoutDashboard },
    { name: "Member Loans", icon: Activity },
    { name: "Apply Loans", icon: Library },
    { name: "Statement of Account", icon: Receipt },
    { name: "Loan Lifecycle", icon: History },
    { name: "Member Profile", icon: Users },
    { name: "Member Savings", icon: CreditCard },
  ];

  useEffect(() => {
    let isMounted = true;

    const loadMemberIdentity = async () => {
      try {
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;

        const sessionUser = authData?.user;
        if (!sessionUser?.id) return;

        const { member: memberRow } = await resolveMemberContextFromSessionUser(sessionUser);
        const fullName = [memberRow?.first_name, memberRow?.middle_name, memberRow?.surname]
          .filter(Boolean)
          .join(" ")
          .trim();

        const signedAvatarUrl = await loadMemberAvatarSignedUrl(supabase, sessionUser.id);

        if (isMounted) {
          setMemberLabel(fullName || "Member");
          setAvatarUrl(signedAvatarUrl || "");
        }
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
    <div className="relative flex min-h-screen bg-[#F8F9FA]">
      {isSidebarOpen ? (
        <button
          aria-label="Close sidebar overlay"
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 z-20 bg-black/30 lg:hidden"
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-30 w-64 transform bg-white p-4 flex flex-col border-r border-gray-200 transition-transform duration-200 ease-out lg:static lg:translate-x-0 ${
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
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
            <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Members Portal</p>
          </div>
        </div>

        <hr className="w-full border-gray-100 mb-6" />

        <nav className="flex grow flex-col gap-2 text-sm">
          {(() => {
            const routeMap = {
              Dashboard: "/member-dashboard",
              "Member Loans": "/member-loans",
              "Apply Loans": "/member-apply-loans",
              "Statement of Account": "/member-statement-of-account",
              "Loan Lifecycle": "/member-lifecycle",
              "Member Profile": "/members-profile",
              "Member Savings": "/member-savings",
            };

            return menuItems.map((item) => {
              const Icon = item.icon;
              const to = routeMap[item.name] || `/${item.name.toLowerCase().replace(/\s+/g, "-")}`;

              return (
                <NavLink
                  key={item.name}
                  to={to}
                  className={({ isActive }) =>
                    `flex items-center gap-3 p-2.5 rounded-lg transition-colors ${
                      isActive
                        ? "bg-[#EAF1EB] text-[#1D6021] font-bold"
                        : "text-gray-600 hover:bg-gray-50 hover:text-[#1D6021] font-medium"
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

      <div className="flex-1 flex flex-col overflow-hidden lg:pl-0">
        <header className="bg-white h-16 shadow-sm flex items-center justify-between px-4 sm:px-6 lg:px-8 z-10 border-b border-gray-100">
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              aria-label="Open sidebar"
              onClick={() => setIsSidebarOpen(true)}
              className="rounded-md p-2 text-gray-600 hover:bg-gray-100 lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="text-base sm:text-lg font-extrabold text-[#1a4a2f] lg:hidden">Apply Loans</h1>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            <div className="relative hidden md:block">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <input
                type="text"
                className="bg-gray-50 w-64 h-10 rounded-full border border-gray-200 pl-10 pr-4 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D6021] focus:bg-white transition-all"
                placeholder="Search..."
              />
            </div>
            <LoanNotificationBell role="member" accentClass="bg-[#1D6021]" />

            <div className="flex items-center gap-2 sm:gap-3 border-l border-gray-200 pl-2 sm:pl-4 cursor-pointer">
              <div className="w-8 h-8 rounded-full bg-gray-200 overflow-hidden border border-gray-300">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Member Profile" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gray-100 text-gray-500">
                    <User className="w-4 h-4" />
                  </div>
                )}
              </div>
              <p className="hidden sm:block text-sm font-bold text-gray-700">{memberLabel}</p>
            </div>
          </div>
        </header>

        <main className="p-4 sm:p-6 lg:p-8 overflow-y-auto pb-28 lg:pb-0">
          <h1 className="hidden lg:block font-extrabold text-[#1a4a2f] text-2xl mb-8">Apply Loans</h1>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Choose Loan Type</h3>
                <p className="text-xs text-gray-500 mt-1">Select your loan type to continue with the standard loan form design.</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsCalculatorOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[#1D6021] px-3 py-1 text-[11px] font-bold text-[#1D6021] hover:bg-[#EAF1EB]"
                >
                  <Calculator className="w-3.5 h-3.5" /> Simulate before applying
                </button>
                <span className="rounded-full bg-[#EAF1EB] px-3 py-1 text-[10px] font-extrabold uppercase tracking-wide text-[#1D6021]">Standard Flow</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {selectorOptions.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => navigate(item.path)}
                    className="bg-white rounded-2xl flex flex-col items-center justify-center cursor-pointer shadow-sm border border-slate-100 hover:shadow-lg hover:border-[#A0D284] transition-all group p-6"
                  >
                    <div className={`${item.tone} p-4 rounded-full mb-3 group-hover:scale-110 transition-transform duration-300`}>
                      <Icon size={32} strokeWidth={2} />
                    </div>
                    <h1 className="font-bold text-slate-800 text-sm text-center">{item.label}</h1>
                  </button>
                );
              })}
            </div>
          </div>
        </main>

        <nav className="fixed bottom-0 left-0 right-0 lg:hidden bg-white border-t border-gray-200 px-2 py-2">
          <div className="max-w-lg mx-auto">
            <div className="flex items-center justify-around gap-1">
              {(() => {
                const routeMap = {
                  Dashboard: "/member-dashboard",
                  "Member Loans": "/member-loans",
                  "Apply Loans": "/member-apply-loans",
                  "Statement of Account": "/member-statement-of-account",
                  "Loan Lifecycle": "/member-lifecycle",
                  "Member Profile": "/members-profile",
                  "Member Savings": "/member-savings",
                };

                return menuItems.map((item) => {
                  const Icon = item.icon;
                  const to = routeMap[item.name] || `/${item.name.toLowerCase().replace(/\s+/g, "-")}`;

                  return (
                    <NavLink
                      key={item.name}
                      to={to}
                      className={({ isActive }) =>
                        `flex flex-col items-center justify-center px-2.5 py-2 rounded-full transition-all ${
                          isActive ? "bg-[#1D6021] text-white" : "text-gray-600 hover:text-[#1D6021]"
                        }`
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <Icon size={20} strokeWidth={isActive ? 2.5 : 2} className="mb-1" />
                          <span className="text-[10px] font-semibold">{item.name.split(" ")[0]}</span>
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

      <LoanCalculatorModal open={isCalculatorOpen} onClose={() => setIsCalculatorOpen(false)} />
    </div>
  );
};

export default Member_ApplyLoans;
