import React, { useEffect, useState } from "react";
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
  User,
  Briefcase,
  Contact2,
  ShieldCheck,
  Lock,
  ChevronRight,
  History
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

const MEMBER_NOTIF_SETTINGS_KEY = 'member_profile_notification_settings';

const Members_Profile = () => {
  const { session, signOut } = UserAuth();
  const navigate = useNavigate();

  // State for the security toggles
  const [smsNotif, setSmsNotif] = useState(true);
  const [emailNotif, setEmailNotif] = useState(true);
  const [profile, setProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [profileError, setProfileError] = useState('');
  const [isTemporaryAccount, setIsTemporaryAccount] = useState(false);
  const [accountTableName, setAccountTableName] = useState('member_account');
  const [resolvedMemberId, setResolvedMemberId] = useState('');
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [updatingPassword, setUpdatingPassword] = useState(false);
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

  // Custom Toggle Switch Component
  const ToggleSwitch = ({ isOn, onToggle }) => (
    <div 
      onClick={onToggle}
      className={`w-11 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors ${isOn ? 'bg-[#1D6021]' : 'bg-gray-300'}`}
    >
      <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${isOn ? 'translate-x-5' : 'translate-x-0'}`} />
    </div>
  );

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(MEMBER_NOTIF_SETTINGS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (typeof parsed?.smsNotif === 'boolean') setSmsNotif(parsed.smsNotif);
      if (typeof parsed?.emailNotif === 'boolean') setEmailNotif(parsed.emailNotif);
    } catch (_error) {
      // Ignore malformed local preference data.
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        MEMBER_NOTIF_SETTINGS_KEY,
        JSON.stringify({ smsNotif, emailNotif })
      );
    } catch (_error) {
      // Ignore persistence failures.
    }
  }, [smsNotif, emailNotif]);

  useEffect(() => {
    let isMounted = true;

    const formatDate = (value) => {
      if (!value) return 'N/A';
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return 'N/A';
      return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    };

    const fetchProfile = async () => {
      try {
        setLoadingProfile(true);
        setProfileError('');

        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        const sessionUser = authData?.user;
        if (!sessionUser?.id) throw new Error('Please sign in again to load your profile.');

        const { account, member: memberRow } = await resolveMemberContextFromSessionUser(sessionUser);
        const authEmail = sessionUser?.email || '';
        const memberId = account?.user_id || sessionUser.id;
        if (!memberId) throw new Error('Please sign in again to load your profile.');

        const temporaryFlag = Boolean(account?.is_temporary);
        const accountTable = account?.table || 'member_account';

        let appRow = null;
        if (account?.membership_id) {
          const { data, error } = await supabase
            .from('member_applications')
            .select('*')
            .eq('membership_id', account.membership_id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (!error && data) appRow = data;
        }

        if (!appRow && authEmail) {
          const { data, error } = await supabase
            .from('member_applications')
            .select('*')
            .ilike('email', authEmail)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (!error && data) appRow = data;
        }

        const fullName = [
          appRow?.first_name || memberRow?.first_name,
          appRow?.middle_name || memberRow?.middle_name,
          appRow?.surname || appRow?.last_name || memberRow?.surname,
        ]
          .filter(Boolean)
          .join(' ')
          .trim() || 'N/A';

        const mapped = {
          fullName,
          memberId: account?.membership_id || memberRow?.membership_number_id || 'N/A',
          dateOfBirth: formatDate(appRow?.date_of_birth || memberRow?.date_of_birth),
          gender: appRow?.gender || memberRow?.gender || 'N/A',
          civilStatus: appRow?.civil_status || memberRow?.civil_status || 'N/A',
          memberType: 'Member',
          joinedDate: formatDate(memberRow?.date_of_membership || memberRow?.created_at || appRow?.created_at),
          employer: appRow?.employer_name || 'N/A',
          position: appRow?.position || memberRow?.position || appRow?.occupation || memberRow?.occupation || 'N/A',
          salaryGrade: appRow?.salary_grade || 'N/A',
          mobile: appRow?.contact_number || memberRow?.contact_number || 'N/A',
          email: appRow?.email || memberRow?.email || authEmail || 'N/A',
          address: appRow?.permanent_address || memberRow?.permanent_address || 'N/A',
        };

        if (isMounted) {
          setProfile(mapped);
          setIsTemporaryAccount(temporaryFlag);
          setAccountTableName(accountTable);
          setResolvedMemberId(memberId);
        }
      } catch (err) {
        if (isMounted) setProfileError(err.message || 'Unable to load profile data.');
      } finally {
        if (isMounted) setLoadingProfile(false);
      }
    };

    fetchProfile();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleOpenChangePassword = () => {
    setPasswordError('');
    setPasswordSuccess('');
    setNewPassword('');
    setConfirmPassword('');
    setShowPasswordModal(true);
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();

    if (!newPassword || !confirmPassword) {
      setPasswordError('Please fill in all password fields.');
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('Password confirmation does not match.');
      return;
    }

    try {
      setUpdatingPassword(true);
      setPasswordError('');

      const { error: updateAuthError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateAuthError) throw updateAuthError;

      const { data: authData } = await supabase.auth.getUser();
      const memberId = resolvedMemberId || authData?.user?.id;
      if (memberId) {
        const { error: updateFlagError } = await supabase
          .from(accountTableName)
          .update({ is_temporary: false })
          .eq('user_id', memberId);

        if (!updateFlagError) {
          setIsTemporaryAccount(false);
        }
      }

      setPasswordSuccess('Password updated successfully.');
      setShowPasswordModal(false);
    } catch (err) {
      setPasswordError(err.message || 'Unable to update password.');
    } finally {
      setUpdatingPassword(false);
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
            <h1 className="text-base sm:text-lg font-extrabold text-[#1a4a2f] lg:hidden">Profile</h1>
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
            <p className="hidden sm:block text-sm font-bold text-gray-700">{profile?.fullName || 'Member'}</p>
          </div>
          </div>
        </header>
   
        {/* Scrollable Page Content */}
        <main className="p-4 sm:p-6 lg:p-8 overflow-y-auto pb-28 lg:pb-0">
          
          {/* Top Profile Header Card */}
          <div className="bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col sm:flex-row items-center justify-between mb-8 gap-4">
            <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6 text-center sm:text-left">
              <div className="w-20 h-20 rounded-full bg-[#EAF1EB] overflow-hidden border border-gray-200">
                <img src="src/assets/img/member-profile.png" alt={profile?.fullName || 'Member profile'} className="w-full h-full object-cover" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-black text-gray-900 mb-2">{profile?.fullName || 'Loading...'}</h1>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 text-sm">
                  <span className="bg-[#EAF1EB] text-[#1D6021] px-2.5 py-1 rounded text-[10px] font-extrabold tracking-widest uppercase">
                    {profile?.memberType || 'Member'}
                  </span>
                  <span className="text-gray-400 font-medium">Joined {profile?.joinedDate || 'N/A'}</span>
                </div>
              </div>
            </div>
            <button onClick={handleOpenChangePassword} className="mt-4 sm:mt-0 flex items-center justify-center gap-2 bg-[#1D6021] text-white hover:bg-[#154718] transition-colors font-bold rounded-lg px-6 py-2.5 text-sm">
              <Pencil className="w-4 h-4" /> {isTemporaryAccount ? 'Update Password' : 'Account Security'}
            </button>
          </div>

          {isTemporaryAccount ? (
            <div className="mb-6 p-4 rounded-xl border border-amber-200 bg-amber-50 text-sm text-amber-800 font-semibold flex items-center justify-between gap-3">
              <span>Your account is still using a temporary password. Update it now for security.</span>
              <button
                onClick={handleOpenChangePassword}
                className="px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-bold hover:bg-amber-700"
              >
                Change Password
              </button>
            </div>
          ) : null}

          {profileError ? (
            <div className="mb-6 p-4 rounded-xl border border-red-200 bg-red-50 text-sm text-red-700">
              {profileError}
            </div>
          ) : null}

          {passwordSuccess ? (
            <div className="mb-6 p-4 rounded-xl border border-green-200 bg-green-50 text-sm text-green-700">
              {passwordSuccess}
            </div>
          ) : null}

          {loadingProfile ? (
            <div className="mb-6 p-4 rounded-xl border border-gray-200 bg-white text-sm text-gray-600">
              Loading profile data...
            </div>
          ) : null}

          {/* Details Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
            
            {/* Personal Information */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col overflow-hidden">
              <div className="bg-[#FAF9FB] p-5 border-b border-gray-100 flex items-center gap-2 text-[#1D6021]">
                <User className="w-5 h-5" />
                <h2 className="font-bold text-gray-900">Personal Information</h2>
              </div>
              <div className="p-6 flex flex-col gap-5">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 text-sm border-b border-gray-50 pb-4">
                  <span className="text-gray-500 font-medium">Full Name</span>
                  <span className="font-bold text-gray-900">{profile?.fullName || 'N/A'}</span>
                </div>
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 text-sm border-b border-gray-50 pb-4">
                  <span className="text-gray-500 font-medium">Member ID</span>
                  <span className="font-bold text-gray-900">{profile?.memberId || 'N/A'}</span>
                </div>
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 text-sm border-b border-gray-50 pb-4">
                  <span className="text-gray-500 font-medium">Date of Birth</span>
                  <span className="font-bold text-gray-900">{profile?.dateOfBirth || 'N/A'}</span>
                </div>
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 text-sm border-b border-gray-50 pb-4">
                  <span className="text-gray-500 font-medium">Gender</span>
                  <span className="font-bold text-gray-900">{profile?.gender || 'N/A'}</span>
                </div>
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 text-sm">
                  <span className="text-gray-500 font-medium">Civil Status</span>
                  <span className="font-bold text-gray-900">{profile?.civilStatus || 'N/A'}</span>
                </div>
              </div>
            </div>

            {/* Employment Details */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col overflow-hidden">
              <div className="bg-[#FAF9FB] p-5 border-b border-gray-100 flex items-center gap-2 text-[#1D6021]">
                <Briefcase className="w-5 h-5" />
                <h2 className="font-bold text-gray-900">Employment Details</h2>
              </div>
              <div className="p-6 flex flex-col gap-5">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 text-sm border-b border-gray-50 pb-4">
                  <span className="text-gray-500 font-medium">Employer</span>
                  <span className="font-bold text-gray-900">{profile?.employer || 'N/A'}</span>
                </div>
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 text-sm border-b border-gray-50 pb-4">
                  <span className="text-gray-500 font-medium">Position</span>
                  <span className="font-bold text-gray-900">{profile?.position || 'N/A'}</span>
                </div>
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 text-sm">
                  <span className="text-gray-500 font-medium">Salary Grade</span>
                  <span className="font-bold text-gray-900">{profile?.salaryGrade || 'N/A'}</span>
                </div>
              </div>
            </div>

            {/* Contact Information */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col overflow-hidden">
              <div className="bg-[#FAF9FB] p-5 border-b border-gray-100 flex items-center gap-2 text-[#1D6021]">
                <Contact2 className="w-5 h-5" />
                <h2 className="font-bold text-gray-900">Contact Information</h2>
              </div>
              <div className="p-6 flex flex-col gap-6">
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Mobile Number</p>
                  <p className="font-bold text-gray-900 text-sm">{profile?.mobile || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Email Address</p>
                  <p className="font-bold text-gray-900 text-sm">{profile?.email || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Permanent Address</p>
                  <p className="font-bold text-gray-900 text-sm leading-relaxed">{profile?.address || 'N/A'}</p>
                </div>
              </div>
            </div>

            {/* Security */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col overflow-hidden">
              <div className="bg-[#FAF9FB] p-5 border-b border-gray-100 flex items-center gap-2 text-[#1D6021]">
                <ShieldCheck className="w-5 h-5" />
                <h2 className="font-bold text-gray-900">Security</h2>
              </div>
              <div className="p-6 flex flex-col gap-6">
                
                <button onClick={handleOpenChangePassword} className="w-full flex items-center justify-between p-4 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <Lock className="w-5 h-5 text-gray-400" />
                    <span className="font-bold text-gray-900 text-sm">Change Password</span>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                </button>

                <div className="flex items-center justify-between pt-2">
                  <div>
                    <h3 className="font-bold text-gray-900 text-sm">SMS Notifications</h3>
                    <p className="text-[11px] text-gray-400 font-medium">Receive alerts via phone</p>
                  </div>
                  <ToggleSwitch isOn={smsNotif} onToggle={() => setSmsNotif(!smsNotif)} />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-gray-900 text-sm">Email Notifications</h3>
                    <p className="text-[11px] text-gray-400 font-medium">Receive monthly statements</p>
                  </div>
                  <ToggleSwitch isOn={emailNotif} onToggle={() => setEmailNotif(!emailNotif)} />
                </div>

              </div>
            </div>

          </div>

        </main>

        {showPasswordModal ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
            <form onSubmit={handleChangePassword} className="w-full max-w-md bg-white rounded-xl shadow-xl border border-gray-200 p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Change Password</h3>

              <div className="mb-4">
                <label className="block text-sm font-semibold text-gray-700 mb-2">New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#1D6021] outline-none"
                  placeholder="Enter new password"
                />
              </div>

              <div className="mb-4">
                <label className="block text-sm font-semibold text-gray-700 mb-2">Confirm Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#1D6021] outline-none"
                  placeholder="Confirm new password"
                />
              </div>

              {passwordError ? (
                <p className="text-sm text-red-600 mb-4">{passwordError}</p>
              ) : null}

              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowPasswordModal(false)}
                  className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-semibold hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updatingPassword}
                  className="px-4 py-2 rounded-lg bg-[#1D6021] text-white text-sm font-semibold hover:bg-[#154718] disabled:opacity-50"
                >
                  {updatingPassword ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        ) : null}

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

export default Members_Profile;