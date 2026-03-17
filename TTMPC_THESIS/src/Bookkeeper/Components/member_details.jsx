import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Building2, MapPin, Award, Phone, Calendar } from 'lucide-react';

const Member_Details = () => {
  const navigate = useNavigate();

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      <button 
        onClick={() => navigate('/records')}
        className="flex items-center text-sm text-[#1a4a2f] font-semibold mb-4 hover:underline"
      >
        <ArrowLeft className="w-4 h-4 mr-2" /> Back to members
      </button>
      <h1 className="text-3xl font-bold text-[#1a4a2f] mb-8">Gero Antoni Tabiolo</h1>
      <div className="mb-8">
        <h2 className="text-lg font-bold text-gray-800 mb-4">Member Information</h2>
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 grid grid-cols-2 gap-y-6 gap-x-12">
          <div>
            <p className="flex items-center text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1"><Building2 className="w-3 h-3 mr-1" /> Employer</p>
            <p className="font-medium text-gray-800">Tubungan National High School</p>
          </div>
          <div>
            <p className="flex items-center text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1"><Phone className="w-3 h-3 mr-1" /> Contact Number</p>
            <p className="font-medium text-gray-800">0917 123 4567</p>
          </div>
          <div>
            <p className="flex items-center text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1"><MapPin className="w-3 h-3 mr-1" /> Address</p>
            <p className="font-medium text-gray-800">Igtuble, Tubungan</p>
          </div>
          <div>
            <p className="flex items-center text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1"><Calendar className="w-3 h-3 mr-1" /> Date Joined</p>
            <p className="font-medium text-gray-800">Tubungan National High School</p>
          </div>
          <div>
            <p className="flex items-center text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1"><Award className="w-3 h-3 mr-1" /> Classification</p>
            <p className="font-bold text-gray-800">MIGS</p>
          </div>
        </div>
      </div>

      <div className="mb-8">
        <h2 className="text-lg font-bold text-gray-800 mb-4">Share Capital Summary</h2>
        <div className="grid grid-cols-3 gap-6">
          <div className="bg-[#e8f7ed] rounded-xl p-6 shadow-sm border border-green-100">
            <p className="text-xs font-semibold text-[#1e9e4a] uppercase tracking-wider mb-2">Total Share Capital</p>
            <p className="text-2xl font-bold text-[#1a4a2f]">₱45,000.00</p>
          </div>
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Savings</p>
            <p className="text-2xl font-bold text-[#1a4a2f]">₱45,000.00</p>
          </div>
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Total Contributions</p>
            <p className="text-2xl font-bold text-[#1a4a2f]">12 Payments</p>
          </div>
        </div>
      </div>

      <div className="mb-8">
        <h2 className="text-lg font-bold text-gray-800 mb-4">Loan History</h2>
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-gray-400 text-xs uppercase tracking-wider">
                <th className="pb-3 font-semibold">Loan Type</th>
                <th className="pb-3 font-semibold">Loan Amount</th>
                <th className="pb-3 font-semibold">Remaining Balance</th>
                <th className="pb-3 font-semibold">Status</th>
                <th className="pb-3 font-semibold">Term</th>
                <th className="pb-3 font-semibold">Date Applied</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-50">
                <td className="py-4 font-medium text-gray-800">Bonus Loan</td>
                <td className="py-4 text-gray-600">₱40,000.00</td>
                <td className="py-4 text-gray-600">₱15,000.00</td>
                <td className="py-4"><span className="bg-blue-50 text-blue-600 px-3 py-1 rounded-full text-xs font-semibold">Active</span></td>
                <td className="py-4 text-gray-600">12 months</td>
                <td className="py-4 text-gray-600">06/15/2025</td>
              </tr>
              <tr className="border-b border-gray-50">
                <td className="py-4 font-medium text-gray-800">Emergency Loan</td>
                <td className="py-4 text-gray-600">₱20,000.00</td>
                <td className="py-4 text-gray-600">₱8,000.00</td>
                <td className="py-4"><span className="bg-blue-50 text-blue-600 px-3 py-1 rounded-full text-xs font-semibold">Active</span></td>
                <td className="py-4 text-gray-600">6 months</td>
                <td className="py-4 text-gray-600">09/10/2025</td>
              </tr>
              <tr>
                <td className="py-4 font-medium text-gray-800">Consolidated Loan</td>
                <td className="py-4 text-gray-600">₱60,000.00</td>
                <td className="py-4 text-gray-600">₱0.00</td>
                <td className="py-4"><span className="bg-green-50 text-green-600 px-3 py-1 rounded-full text-xs font-semibold">Paid</span></td>
                <td className="py-4 text-gray-600">24 months</td>
                <td className="py-4 text-gray-600">01/20/2023</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-bold text-gray-800 mb-4">Payment History</h2>
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-gray-400 text-xs uppercase tracking-wider">
                <th className="pb-3 font-semibold">Payment Date</th>
                <th className="pb-3 font-semibold">Loan Type</th>
                <th className="pb-3 font-semibold">Amount Paid</th>
                <th className="pb-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {[
                { date: "12/15/2025", type: "Bonus Loan", amount: "₱5,000.00" },
                { date: "11/15/2025", type: "Bonus Loan", amount: "₱5,000.00" },
                { date: "10/10/2025", type: "Emergency Loan", amount: "₱4,000.00" },
                { date: "09/10/2025", type: "Emergency Loan", amount: "₱4,000.00" },
              ].map((payment, index) => (
                <tr key={index} className="border-b border-gray-50 last:border-0">
                  <td className="py-4 font-medium text-gray-800">{payment.date}</td>
                  <td className="py-4 text-gray-600">{payment.type}</td>
                  <td className="py-4 text-gray-600 font-medium">{payment.amount}</td>
                  <td className="py-4"><span className="bg-[#e8f7ed] text-[#1e9e4a] px-3 py-1 rounded-full text-xs font-semibold">On-time</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}; 

export default Member_Details;