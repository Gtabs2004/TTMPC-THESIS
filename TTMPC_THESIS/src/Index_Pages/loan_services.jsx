import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UserAuth } from '../contex/AuthContext';
import { Library, AlertCircle, Gift, LogOut } from 'lucide-react';

const Loan_Services = () => {
  const { session, signOut } = UserAuth();
  const navigate = useNavigate();

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
    <div className="flex flex-col min-h-screen bg-gray-100">

      <header className="w-full bg-[#E9F7DE] h-16 md:h-20 shadow-sm border-b border-[#D5EDB9] flex justify-between items-center px-4 md:px-6">
        <div className="flex flex-row items-center gap-3">
          <img src="/img/ttmpc logo.png" alt="Logo" className="h-10 md:h-12 w-auto" />
          <div className="flex flex-col">
            <h1 className="text-xs md:text-sm font-bold text-[#66B538] leading-tight">
              Tubungan Teacher's Multi‑Purpose Cooperative
            </h1>
            <p className="text-[#A0D284] text-xs">Loan Application Kiosk</p>
          </div>
        </div>
      </header>

      <main className="flex justify-center items-center flex-col flex-grow py-10 px-4 text-center">
        <img src="/img/ttmpc logo.png" className="w-auto h-24 md:h-32 mb-4" alt="Kiosk Logo" />
        <h1 className="text-xs md:text-sm font-semibold text-slate-500 uppercase tracking-widest">
          Loan Application Kiosk
        </h1>
        <p className="mt-2 text-xl md:text-2xl font-bold text-slate-800">Available Loan Services</p>
        <p className="mt-2 text-slate-500 text-sm font-medium mb-8">
          Choose a loan type to continue your application.
        </p>

        <div className="flex flex-col sm:flex-row gap-6 mt-4 w-full max-w-2xl justify-center items-center">
          <Link
            to="/Consolidated_Loan"
            className="bg-white h-48 w-full sm:w-48 md:h-56 md:w-56 rounded-2xl flex flex-col items-center justify-center cursor-pointer shadow-sm border border-slate-100 hover:shadow-lg hover:border-[#A0D284] transition-all group"
          >
            <div className="bg-blue-50 p-5 rounded-full mb-4 group-hover:scale-110 transition-transform duration-300">
              <Library size={40} className="text-blue-600" strokeWidth={2} />
            </div>
            <h1 className="font-bold text-slate-800 text-base md:text-lg">Consolidated Loan</h1>
          </Link>

          <Link
            to="/Emergency_Loan"
            className="bg-white h-48 w-full sm:w-48 md:h-56 md:w-56 rounded-2xl flex flex-col items-center justify-center cursor-pointer shadow-sm border border-slate-100 hover:shadow-lg hover:border-[#A0D284] transition-all group"
          >
            <div className="bg-red-50 p-5 rounded-full mb-4 group-hover:scale-110 transition-transform duration-300">
              <AlertCircle size={40} className="text-red-600" strokeWidth={2} />
            </div>
            <h1 className="font-bold text-slate-800 text-base md:text-lg">Emergency Loan</h1>
          </Link>

          <Link
            to="/Bonus_Loan"
            className="bg-white h-48 w-full sm:w-48 md:h-56 md:w-56 rounded-2xl flex flex-col items-center justify-center cursor-pointer shadow-sm border border-slate-100 hover:shadow-lg hover:border-[#A0D284] transition-all group"
          >
            <div className="bg-[#F0FDF4] p-5 rounded-full mb-4 group-hover:scale-110 transition-transform duration-300">
              <Gift size={40} className="text-green-600" strokeWidth={2} />
            </div>
            <h1 className="font-bold text-slate-800 text-base md:text-lg">Bonus Loan</h1>
          </Link>
        </div>
      </main>
    </div>
  );
};

export default Loan_Services;
