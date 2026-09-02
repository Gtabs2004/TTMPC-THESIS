import React, { useState } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { StatCard, StatCardRow } from "../../components/StatCard";
import StaffSidebar from "../../components/StaffSidebar";
import { bookkeeperNav } from "../../components/StaffSidebar/configs/bookkeeper";
import { UserAuth } from "../../contex/AuthContext";
import StaffTopbar from "../../components/StaffTopbar";
import LoanNotificationBell from "../../components/LoanNotificationBell";
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
  UserPlus,
  ClipboardList,
  Briefcase,
  Wallet,
  Coins,
  PiggyBank,
  ChevronDown,
  ChevronRight,
  ShieldAlert,
  Brain,
} from "lucide-react";


const LoanApplication = () => {
    const navigate = useNavigate();

  return (
    <div className="flex min-h-screen bg-gray-100">
      <StaffSidebar portal="Bookkeeper" items={bookkeeperNav} />

     
      <div className="flex-1 flex flex-col ">
        <StaffTopbar portal="Bookkeeper" notifications={<LoanNotificationBell role="bookkeeper" />} />

        
        <main className="p-8">
          <h1 className="font-bold text-2xl">Loan-Application</h1>

         <StatCardRow cols={4} className="mt-4">
            <StatCard label="Total Kiosk Today" value="24" icon={UserPlus} iconColor="text-[#2C7A3F]" />
            <StatCard label="Pending Review" value="8" icon={ClipboardList} iconColor="text-[#D97706]" />
            <StatCard label="Approved" value="12" icon={ClipboardList} iconColor="text-[#D97706]" />
            <StatCard label="AVG. Processing" value="1.4h" icon={ClipboardList} iconColor="text-[#D97706]" />
          </StatCardRow>

        
          <div className="bg-white w-full rounded-2xl m-auto mt-6 p-8 shadow-sm border border-gray-100 min-h-fit">
            <h2 className="text-lg font-bold text-gray-800 mb-6">All Applications</h2>
            <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-green-700 text-[10px] uppercase tracking-wider text-white font-extrabold">
                        <th className="p-5 font-bold">Application ID</th>
                        <th className="p-5 font-bold">Member Name</th>
                        <th className="p-5 font-bold">Loan Type</th>
                        <th className="p-5 font-bold">Amount</th>
                        <th className="p-5 font-bold">Term</th>
                        <th className="p-5 font-bold">MIGS Status</th>
                        <th className="p-5 font-bold">Submission</th>
                        <th className="p-5 font-bold">Status</th>
                      </tr>
                  </thead>
                  <tbody>
                    {[
                     { ID: "TTMPCL-001-123", name: "Gero Antoni Tabiolo", type: "Bonus Loan", amount: "\u20B150,000", term: "12 Months", status: "MIGS", purpose: "Home Improvement" },
                     { ID: "TTMPCL-002-123", name: "Erden Jhed Teope", type: "Emergency Loan", amount: "\u20B125,000", term: "12 Months", status: "Non-MIGS", purpose: "Medical Emergency" },
                     { ID: "TTMPCL-003-123", name: "Ashley Nicole Bulotaolo", type: "Consolidated Loan", amount: "\u20B1120,000", term: "24 Months", status: "Approved", purpose: "Debt Consolidation" },
                     { ID: "TTMPCL-004-123", name: "Romelyn Delos Reyes", type: "Bonus Loan", amount: "\u20B120,000", term: "6 Months", status: "Approved", purpose: "Education" },
                     { ID: "TTMPCL-005-123", name: "Nash Ervine Siaton", type: "Bonus Loan", amount: "\u20B130,000", term: "12 Months", status: "Pending", purpose: "Business Capital" }
                    ].map((loan, index) => (
                        <tr key={loan.ID} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                          <td className="p-5 text-sm font-semibold text-gray-800">{loan.ID}</td>
                          <td className="p-5 text-sm text-gray-800 font-medium">{loan.name}</td>
                          <td className="p-5 text-sm text-gray-600">{loan.type}</td>
                          <td className="p-5 text-sm text-gray-800 font-medium">{loan.amount}</td>
                          <td className="p-5 text-sm text-gray-600">{loan.date}</td>
                          <td className="p-5 text-sm text-gray-600">{loan.status}</td>
                          <td className="p-5 text-sm text-gray-600">{loan.purpose}</td>
                        </tr>
                      ))}
                    </tbody>
              </table>
          </div>
        </main>
      </div>
    </div>
  );
};

export default LoanApplication;



