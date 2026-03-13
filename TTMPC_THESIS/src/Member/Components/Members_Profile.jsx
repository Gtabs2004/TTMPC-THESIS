import React, { useState } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { UserAuth } from "../../contex/AuthContext";
import { 
  LayoutDashboard, 
  Users, 
  CreditCard, 
  Activity, 
  Search,
  Bell,
  Pencil,
  User,
  Briefcase,
  Contact2,
  ShieldCheck,
  Lock,
  ChevronRight
} from 'lucide-react';

const Members_Profile = () => {
  const { session, signOut } = UserAuth();
  const navigate = useNavigate();

  // State for the security toggles
  const [smsNotif, setSmsNotif] = useState(true);
  const [emailNotif, setEmailNotif] = useState(true);

  const menuItems = [
    { name: "Dashboard", icon: LayoutDashboard },
    { name: "Member Loans", icon: Activity },
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
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-white h-16 shadow-sm flex items-center justify-end px-8 z-10 border-b border-gray-100">
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
               <img src="src/assets/img/member-profile.png" alt="Member Profile" className="w-full h-full object-cover" />
            </div>
            <p className="text-sm font-bold text-gray-700">Member</p>
          </div>
        </header>
   
        {/* Scrollable Page Content */}
        <main className="p-8 overflow-y-auto">
          
          {/* Top Profile Header Card */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col sm:flex-row items-center justify-between mb-8">
            <div className="flex items-center gap-6">
              <div className="w-20 h-20 rounded-full bg-[#EAF1EB] overflow-hidden border border-gray-200">
                <img src="src/assets/img/member-profile.png" alt="Juan Dela Cruz" className="w-full h-full object-cover" />
              </div>
              <div>
                <h1 className="text-2xl font-black text-gray-900 mb-2">Juan Dela Cruz</h1>
                <div className="flex items-center gap-3 text-sm">
                  <span className="bg-[#EAF1EB] text-[#1D6021] px-2.5 py-1 rounded text-[10px] font-extrabold tracking-widest uppercase">
                    Regular Member
                  </span>
                  <span className="text-gray-400 font-medium">Joined Jan 2018</span>
                </div>
              </div>
            </div>
            <button className="mt-4 sm:mt-0 flex items-center justify-center gap-2 bg-[#1D6021] text-white hover:bg-[#154718] transition-colors font-bold rounded-lg px-6 py-2.5 text-sm">
              <Pencil className="w-4 h-4" /> Edit Profile
            </button>
          </div>

          {/* Details Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Personal Information */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col overflow-hidden">
              <div className="bg-[#FAF9FB] p-5 border-b border-gray-100 flex items-center gap-2 text-[#1D6021]">
                <User className="w-5 h-5" />
                <h2 className="font-bold text-gray-900">Personal Information</h2>
              </div>
              <div className="p-6 flex flex-col gap-5">
                <div className="flex justify-between items-center text-sm border-b border-gray-50 pb-4">
                  <span className="text-gray-500 font-medium">Full Name</span>
                  <span className="font-bold text-gray-900">Juan Dela Cruz</span>
                </div>
                <div className="flex justify-between items-center text-sm border-b border-gray-50 pb-4">
                  <span className="text-gray-500 font-medium">Member ID</span>
                  <span className="font-bold text-gray-900">8291</span>
                </div>
                <div className="flex justify-between items-center text-sm border-b border-gray-50 pb-4">
                  <span className="text-gray-500 font-medium">Date of Birth</span>
                  <span className="font-bold text-gray-900">October 12, 1985</span>
                </div>
                <div className="flex justify-between items-center text-sm border-b border-gray-50 pb-4">
                  <span className="text-gray-500 font-medium">Gender</span>
                  <span className="font-bold text-gray-900">Male</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-500 font-medium">Civil Status</span>
                  <span className="font-bold text-gray-900">Married</span>
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
                <div className="flex justify-between items-center text-sm border-b border-gray-50 pb-4">
                  <span className="text-gray-500 font-medium">Employer</span>
                  <span className="font-bold text-gray-900">Department of Education (DepEd)</span>
                </div>
                <div className="flex justify-between items-center text-sm border-b border-gray-50 pb-4">
                  <span className="text-gray-500 font-medium">Position</span>
                  <span className="font-bold text-gray-900">Teacher III</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-500 font-medium">Salary Grade</span>
                  <span className="font-bold text-gray-900">15</span>
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
                  <p className="font-bold text-gray-900 text-sm">+63 917 123 4567</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Email Address</p>
                  <p className="font-bold text-gray-900 text-sm">juan.delacruz@deped.gov.ph</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Permanent Address</p>
                  <p className="font-bold text-gray-900 text-sm leading-relaxed">123 Green Valley St., Phase 2, Quezon City, Philippines 1100</p>
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
                
                <button className="w-full flex items-center justify-between p-4 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
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
      </div>
    </div>
  );
};

export default Members_Profile;