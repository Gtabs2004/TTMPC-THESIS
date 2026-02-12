import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UserAuth } from '../contex/AuthContext';
import { Library, AlertCircle, Gift, LogOut } from 'lucide-react';

const Member_Services = () => {
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
  return(
    <div className="flex flex-col min-h-screen bg-gray-100">
        <header className="w-full bg-[#E9F7DE] h-20 shadow-lg flex text-col">
            <div className="flex flex-row items-start gap-2">
            <img src="src/assets/img/ttmpc logo.png" alt="Logo" className="h-12 w-auto ml-5 mt-4"/>
            <div className="flex flex-col">
            <h1 className="text-sm font-bold text-[#66B538] mt-6">Tubungan Teacher's Multi‑Purpose Cooperative</h1>
            <p className="text-[#A0D284] text-xs">Loan Application Kiosk</p>
            </div>
            </div>
    </header>
     <main className="flex justify-center items-center flex-col">
        <img src="src/assets/img/ttmpc logo.png" className="w-auto h-40 mt-16"/>
        <h1 className="text-sm font-semibold  ml-2">Loan Application Kiosk</h1>
        <p className="mt-4  text-lg font-bold ">Available Loan Services</p>
        <div className="flex flex-row gap-10 mt-10">
            <Link to="/Consolidated_Loan" className="bg-white h-50 w-50 rounded-2xl font-bold flex text-center 
            items-center justify-center flex-col cursor-pointer">
                <Library size={48} className="text-blue-600 mb-4" />
                <h1>Consolidated Loan</h1>
                </Link>
            <Link to="/Emergency_Loan" className="bg-white h-50 w-50 rounded-2xl font-bold flex text-center 
            items-center justify-center flex-col cursor-pointer">
                <AlertCircle size={48} className="text-red-600 mb-4" />
                <h1>Emergency Loan</h1>
            </Link>
            <Link to="/Bonus_Loan" className="bg-white h-50 w-50 rounded-2xl font-bold flex text-center 
            items-center justify-center flex-col cursor-pointer">
                <Gift size={48} className="text-green-600 mb-4" />
                <h1>Bonus Loan</h1>
                </Link>
        </div>
        </main>
        </div>
  )
} 

export default Member_Services;