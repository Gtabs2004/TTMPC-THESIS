import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UserAuth } from '../contex/AuthContext';

const Verification = () => {
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
         <h1 className="text-lg font-semibold  ml-4">Member Verification</h1>
        <p className="ml-3 text-gray-600 text-xs">Enter your account details below.</p>
    </main>

    </div>
  )
}
export default Verification;