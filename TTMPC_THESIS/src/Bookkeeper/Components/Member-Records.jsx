import React, { useState } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import StaffSidebar from "../../components/StaffSidebar";
import { bookkeeperNav } from "../../components/StaffSidebar/configs/bookkeeper";
import { UserAuth } from "../../contex/AuthContext";
import { useNotification } from "../../contex/NotificationContext";
import StaffTopbar from "../../components/StaffTopbar";
import LoanNotificationBell from "../../components/LoanNotificationBell";
import Breadcrumb from "../../components/Breadcrumb";
import {
  LayoutDashboard,
  Users,
  FileText,
  CreditCard,
  Calculator,
  Activity,
  BarChart3,
  History,
  Search,
  Bell,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  PiggyBank,
  Eye,
  Briefcase,
  Wallet,
  Coins,
  ShieldAlert,
  Brain,
} from "lucide-react";


const Records = () => {
    const navigate = useNavigate();

  return (
    <div className="flex min-h-screen bg-gray-100">
      <StaffSidebar portal="Bookkeeper" items={bookkeeperNav} />

     
      <div className="flex-1 flex flex-col">
        <StaffTopbar portal="Bookkeeper" notifications={<LoanNotificationBell role="bookkeeper" />} />

        <main className="p-8">
          <Breadcrumb portal="Bookkeeper" page="Member Records" />
          <h1 className="font-bold text-2xl">Records</h1>
          <div className="bg-white w-full rounded-2xl m-auto mt-6 p-8 shadow-sm border border-gray-100 min-h-fit">
  
  <h2 className="text-lg font-bold text-gray-800 mb-6">All Members</h2>
  
  <table className="w-full text-left border-collapse text-sm mb-24">
    <thead>
      <tr className="bg-green-700 text-[10px] uppercase tracking-wider text-white font-extrabold">
        <th className="p-5 font-bold">Member Name</th>
        <th className="p-5 font-bold">Employer</th>
        <th className="p-5 font-bold">Share Capital</th>
        <th className="p-5 font-bold">MIGS Status</th>
        <th className="p-5 font-bold">Active Loans</th>
        <th className="p-5 font-bold">Actions</th>
      </tr>
    </thead>
    <tbody>
      {[
        { name: "Gero Antoni Tabiolo", employer: "DepEd", capital: "\u20B1450,000", status: "MIGS", loans: 2 },
        { name: "Erden Jhed Teope", employer: "DepEd", capital: "\u20B1320,000", status: "NON-MIGS", loans: 1 },
        { name: "Ashley Nicole Bulotaolo", employer: "DepEd", capital: "\u20B1580,000", status: "MIGS", loans: 3 },
        { name: "Romelyn Delos Reyes", employer: "DepEd", capital: "\u20B1280,000", status: "MIGS", loans: 2 },
        { name: "Nash Ervine Siaton", employer: "DepEd", capital: "\u20B1676,767", status: "NON-MIGS", loans: 0 },
        
      ].map((member, index) => (
        <tr key={index} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
          <td className="p-5 font-semibold text-[#1a4a2f]">{member.name}</td>
          <td className="p-5 text-gray-800 font-medium">{member.employer}</td>
          <td className="p-5 text-gray-800 font-medium">{member.capital}</td>
          <td className="p-5">
            <span className={`px-3 py-1 rounded-full text-xs font-semibold text-white ${
              member.status === "MIGS" ? "bg-[#1e9e4a]" : "bg-[#a5abb3]"
            }`}>
              {member.status}
            </span>
          </td>
          <td className="p-5 text-gray-800 font-medium">{member.loans}</td>
          <td className="p-5">
            <button onClick={() => navigate('/member_details')}
            className="text-[#1e9e4a] hover:text-green-800 transition-colors p-1">
              <Eye size={20} strokeWidth={2} />
            </button>
          </td>
        </tr>
      ))}
    </tbody>
  </table>
</div>
          <div className="flex justify-center items-center mt-8 gap-2">
            <button
              className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-300 bg-white text-gray-500 transition-colors hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {[1, 2, 3, 4, 5].map((page) => (
              <button
                key={page}
                className={`w-8 h-8 flex items-center justify-center rounded-full border text-xs font-semibold transition-colors ${
                  page === 1
                    ? "bg-[#16A34A] text-white border-[#16A34A]"
                    : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
                }`}
              >
                {page}
              </button>
            ))}

            <button className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-300 bg-white text-gray-500 transition-colors hover:bg-gray-50">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </main> 
      </div>
    </div>
  );
};

export default Records;



