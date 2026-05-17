import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { UserAuth } from "../../contex/AuthContext";
import { PortalSidebarIdentity, PortalTopbarIdentity } from "../../components/PortalIdentity";
import {
  LayoutDashboard,
  Users,
  FileText,
  CreditCard,
  Calculator,
  Activity,
  BarChart3,
  History,
  Bell,
  ChevronLeft,
  Edit2,
  Download,
} from "lucide-react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

const MIGSDetails = () => {
  const { session, signOut } = UserAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const memberId = searchParams.get("member_id");

  const [memberData, setMemberData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const menuItems = [
    { name: "Dashboard", icon: LayoutDashboard },
    { name: "Manage Member", icon: Users },
    { name: "Loan Approval", icon: FileText },
    { name: "Manage Loans", icon: CreditCard },
    { name: "Payments", icon: CreditCard },
    { name: "Savings Withdrawals", icon: CreditCard },
    { name: "Accounting", icon: Calculator },
    { name: "MIGS Scoring", icon: Activity },
    { name: "Reports", icon: BarChart3 },
    { name: "Audit Trail", icon: History },
  ];

  const routeMap = {
    Dashboard: "/dashboard",
    "Manage Member": "/manage-member",
    "Loan Approval": "/bookkeeper-loan-approval",
    "Manage Loans": "/manage-loans",
    Payments: "/payments",
    "Savings Withdrawals": "/bookkeeper-savings-transactions",
    Accounting: "/accounting",
    "MIGS Scoring": "/migs",
    Reports: "/reports",
    "Audit Trail": "/audit-trail",
  };

  // Mock data - replace with API call
  const mockMemberData = {
    "TTMPC-2024-051": {
      full_name: "Adelaida Soriano",
      member_id: "TTMPC-2024-051",
      year: 2026,
      migs_score: 93,
      migs_status: "MIGS Qualified",
      scoring_breakdown: [
        { criterion: "Capital Build-Up", value: 9800, score: 17, max_score: 20, progress: 85 },
        { criterion: "Loan Availed", value: 98000, score: 16, max_score: 20, progress: 80 },
        { criterion: "Savings / Time Deposit", value: 52000, score: 15, max_score: 15, progress: 100 },
        { criterion: "Payment Record", value: 0, score: 20, max_score: 20, progress: 100 },
        { criterion: "Groceries Availed", value: 48000, score: 10, max_score: 10, progress: 100 },
        { criterion: "Loans from Other PLIs", value: "None", score: 10, max_score: 10, progress: 100 },
        { criterion: "Assembly Attendance", value: "Present", score: 5, max_score: 5, progress: 100 },
      ],
    },
  };

  useEffect(() => {
    const loadMemberData = async () => {
      setLoading(true);
      try {
        // Simulate API call
        setTimeout(() => {
          if (memberId && mockMemberData[memberId]) {
            setMemberData(mockMemberData[memberId]);
          } else {
            setError("Member data not found");
          }
          setLoading(false);
        }, 500);
      } catch (err) {
        setError("Failed to load member data");
        setLoading(false);
      }
    };

    if (memberId) {
      loadMemberData();
    }
  }, [memberId]);

  const handleSignOut = async (e) => {
    e.preventDefault();
    try {
      await signOut();
      navigate("/");
    } catch (err) {
      console.error("Failed to sign out:", err);
    }
  };

  const handleRecalculate = () => {
    console.log("Recalculating MIGS score for:", memberId);
    // Add recalculation logic here
  };

  const handleSaveDraft = () => {
    console.log("Saving draft for:", memberId);
    // Add save draft logic here
  };

  const handleFinalizeScore = () => {
    console.log("Finalizing score for:", memberId);
    // Add finalize logic here
  };

  return (
    <div className="flex min-h-screen bg-gray-100">
      <aside className="bg-white w-64 p-4 flex flex-col border-r border-gray-200">
        <div className="flex flex-row items-start gap-2 mb-6">
          <img src="/img/ttmpc logo.png" alt="Logo" className="h-12 w-auto" />
          <div className="flex flex-col">
            <h1 className="text-xl font-bold text-[#389734]">TTMPC</h1>
            <PortalSidebarIdentity className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold" fallbackPortal="Bookkeeper Portal" fallbackRole="Bookkeeper" />
          </div>
        </div>

        <hr className="w-full border-gray-200 mb-6" />

        <nav className="flex flex-col gap-2 text-sm flex-grow">
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.name}
                onClick={() => navigate(routeMap[item.name])}
                className={`flex items-center gap-3 p-2 rounded-md transition-colors text-left w-full ${
                  item.name === "MIGS Scoring"
                    ? "bg-green-50 text-green-700 font-semibold"
                    : "text-gray-700 hover:bg-green-50 hover:text-green-700"
                }`}
              >
                <Icon size={20} />
                <span>{item.name}</span>
              </button>
            );
          })}
        </nav>

        <button onClick={handleSignOut} className="mt-auto w-full rounded p-2 text-xs bg-green-600 hover:bg-green-700 text-white font-bold transition-colors">
          Sign out
        </button>
      </aside>

      <div className="flex-1 flex flex-col">
        <header className="bg-white h-16 shadow-sm flex items-center justify-between px-8 border-b border-gray-100">
          <button onClick={() => navigate("/migs")} className="flex items-center gap-2 text-gray-700 hover:text-gray-900 transition-colors">
            <ChevronLeft className="w-5 h-5" />
            <span className="font-medium">Back to MIGS Scoring</span>
          </button>
          <div className="flex items-center gap-4">
            <button className="relative p-1 rounded-full text-gray-500 hover:bg-gray-100 transition-colors">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1 right-1 block h-2 w-2 rounded-full bg-red-500 ring-2 ring-white"></span>
            </button>
            <div className="flex items-center gap-2 border-l border-gray-200 pl-4">
              <img src="/img/bookkeeper-profile.png" alt="Profile" className="w-8 h-8 rounded-full bg-gray-200" />
              <PortalTopbarIdentity className="text-sm font-medium text-gray-700" fallbackRole="Bookkeeper" />
            </div>
          </div>
        </header>

        <main className="p-8 flex-1 overflow-y-auto">
          {loading ? (
            <p className="text-center text-blue-700">Loading member data...</p>
          ) : error ? (
            <p className="text-center text-red-600">{error}</p>
          ) : memberData ? (
            <div className="max-w-5xl">
              {/* Member Header */}
              <div className="bg-white rounded-xl p-6 mb-6 border border-gray-200">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                      <span className="text-lg font-bold text-green-700">
                        {memberData.full_name.charAt(0)}
                      </span>
                    </div>
                    <div>
                      <h1 className="text-2xl font-bold text-gray-900">{memberData.full_name}</h1>
                      <p className="text-gray-600">
                        # {memberData.member_id} <span className="text-gray-400 ml-4"> {memberData.year}</span>
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full font-semibold text-sm ${
                      memberData.migs_status === "MIGS Qualified"
                        ? "bg-green-100 text-green-700"
                        : "bg-red-100 text-red-700"
                    }`}>
                      <span>✓</span>
                      {memberData.migs_status}
                    </div>
                  </div>
                </div>
              </div>

              {/* Scoring Breakdown */}
              <div className="grid grid-cols-3 gap-6 mb-6">
                {/* Left: Scoring Breakdown Table */}
                <div className="col-span-2">
                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="p-6 border-b border-gray-200">
                      <div className="flex items-center gap-2 mb-2">
                        
                        <h2 className="text-xl font-bold text-gray-900">Scoring Breakdown</h2>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-200">
                          <tr>
                            <th className="px-6 py-3 text-left font-semibold text-gray-700">Criterion</th>
                            <th className="px-6 py-3 text-left font-semibold text-gray-700">Value</th>
                            <th className="px-6 py-3 text-center font-semibold text-gray-700">Score</th>
                            <th className="px-6 py-3 text-center font-semibold text-gray-700">Progress</th>
                            <th className="px-6 py-3 text-center font-semibold text-gray-700"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {memberData.scoring_breakdown.map((item, index) => (
                            <tr key={index} className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
                              <td className="px-6 py-4 font-medium text-gray-800">{item.criterion}</td>
                              <td className="px-6 py-4 text-gray-700">
                                {typeof item.value === "number"
                                  ? `₱${item.value.toLocaleString()}`
                                  : item.value}
                              </td>
                              <td className="px-6 py-4 text-center">
                                <span className="font-bold text-gray-800">
                                  {item.score} <span className="text-gray-400">/ {item.max_score}</span>
                                </span>
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 bg-gray-200 rounded-full h-2">
                                    <div
                                      className="bg-green-600 h-2 rounded-full transition-all"
                                      style={{ width: `${item.progress}%` }}
                                    ></div>
                                  </div>
                                  <span className="text-xs font-semibold text-gray-600 w-8 text-right">
                                    {item.progress}%
                                  </span>
                                </div>
                              </td>
                              <td className="px-6 py-4 text-center">
                                <button className="p-1.5 rounded-lg hover:bg-gray-200 transition-colors">
                                  <Edit2 className="w-4 h-4 text-gray-600" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* Right: Total Score Card */}
                <div className="col-span-1">
                  <div className="bg-white rounded-xl border border-gray-200 p-6">
                    <div className="flex items-center gap-2 mb-4">
                      
                      <h3 className="font-bold text-gray-900">Total Score</h3>
                    </div>

                    <div className="text-center mb-6">
                      <div className="inline-flex items-center justify-center">
                        <span className="text-5xl font-bold text-green-700">{memberData.migs_score}</span>
                        <div className="ml-2 flex flex-col">
                          <span className="text-gray-400">/</span>
                          <span className="text-gray-500 text-lg">100</span>
                        </div>
                      </div>
                    </div>

                    <div className="bg-gray-50 rounded-lg p-4 mb-6">
                      <div className="w-full bg-gray-200 rounded-full h-3 mb-2">
                        <div
                          className="bg-green-600 h-3 rounded-full transition-all"
                          style={{ width: `${memberData.migs_score}%` }}
                        ></div>
                      </div>
                      <p className="text-xs text-gray-600 text-center font-medium">
                        {memberData.migs_score}% Complete
                      </p>
                    </div>

                    <div className="text-center mb-6">
                      <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm ${
                        memberData.migs_status === "MIGS Qualified"
                          ? "bg-green-50 text-green-700 border border-green-200"
                          : "bg-red-50 text-red-700 border border-red-200"
                      }`}>
                        <span>✓</span>
                        Classification
                      </div>
                      <p className="text-xs text-gray-500 mt-2 font-medium">
                        {memberData.migs_status === "MIGS Qualified"
                          ? "Member qualifies for MIGS"
                          : "Member does not qualify"}
                      </p>
                    </div>

                    <hr className="my-6" />

                    <div>
                      <h4 className="font-bold text-gray-900 mb-3 text-sm">Actions</h4>
                      <div className="space-y-2">
                        <button
                          onClick={handleRecalculate}
                          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-gray-300 bg-white text-gray-700 font-semibold hover:bg-gray-50 transition-colors text-sm"
                        >
                          
                          Recalculate
                        </button>
                        <button
                          onClick={handleSaveDraft}
                          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-gray-300 bg-white text-gray-700 font-semibold hover:bg-gray-50 transition-colors text-sm"
                        >
                          <Download className="w-4 h-4" />
                          Save Draft
                        </button>
                        <button
                          onClick={handleFinalizeScore}
                          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-green-600 text-white font-semibold hover:bg-green-700 transition-colors text-sm"
                        >
                          <span>✓</span>
                          Finalize Score
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </main>
      </div>
    </div>
  );
};

export default MIGSDetails;
