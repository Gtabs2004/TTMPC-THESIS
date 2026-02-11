import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UserAuth } from '../contex/AuthContext';
import { UserCheck, UserPlus } from 'lucide-react';

const Loan_Kiosk = () => {
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
        <navbar className="w-full bg-[#E9F7DE] h-20 shadow-lg flex text-col">
            <div className="flex flex-row items-start gap-2">
            <img src="src/assets/img/ttmpc logo.png" alt="Logo" className="h-12 w-auto ml-5 mt-4"/>
            <div className="flex flex-col">
            <h1 className="text-sm font-bold text-[#66B538] mt-6">Tubungan Teacher's Multi‑Purpose Cooperative</h1>
            <p className="text-[#A0D284] text-xs">Loan Application Kiosk</p>
            </div>
            </div>
    </navbar>
    <main className="flex justify-center items-center flex-col">
        <img src="src/assets/img/ttmpc logo.png" className="w-auto h-40 mt-16"/>
        <h1 className="text-lg font-semibold  ml-4">Loan Application Kiosk</h1>
        <p className="mt-8 text-gray-600 text-xs">Please select your applicant type to continue.</p>
        <div className="flex flex-row gap-10 mt-10">
            <button className="bg-white h-50 w-50 rounded-2xl font-bold flex text-center 
            items-center justify-center flex-col cursor-pointer">
                <UserCheck className="w-12 h-12 text-[#66B538] mb-4" />
                <h1>Member</h1>
            </button>
            <button className="bg-white h-50 w-50 rounded-2xl font-bold flex text-center 
            items-center justify-center flex-col cursor-pointer">
                <UserPlus className="w-12 h-12 text-[#66B538] mb-4" />
                <h1>Non-Member</h1>
            </button>
        </div>
    </main>
    </div>
 
  )
}

export default Loan_Kiosk;