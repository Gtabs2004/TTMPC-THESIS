import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UserAuth } from '../contex/AuthContext';
// Swapped to Wallet and Clock for better context
import { Wallet, Clock, LogOut } from 'lucide-react';

const Savings_Services = () => {
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
        {/* Added the LogOut button and flex-between layout to the header */}
        <header className="w-full bg-[#E9F7DE] h-20 shadow-lg flex justify-between items-center px-6">
            <div className="flex flex-row items-center gap-3">
              <img src="src/assets/img/ttmpc logo.png" alt="Logo" className="h-12 w-auto" />
              <div className="flex flex-col">
                <h1 className="text-sm font-bold text-[#66B538]">Tubungan Teacher's Multi‑Purpose Cooperative</h1>
                <p className="text-[#A0D284] text-xs">Loan Application Kiosk</p>
              </div>
            </div>

            <button 
              onClick={handleSignOut} 
              className="flex items-center gap-2 text-gray-600 hover:text-red-600 font-bold transition-colors"
            >
              <span>Sign Out</span>
              <LogOut size={24} />
            </button>
        </header>

      <main className="flex justify-center items-center flex-col flex-grow">
        <img src="src/assets/img/ttmpc logo.png" className="w-auto h-40 mt-8" alt="Kiosk Logo"/>
        <h1 className="text-sm font-semibold ml-2">Loan Application Kiosk</h1>
        {/* Updated text to reflect Savings instead of Loans */}
        <p className="mt-4 text-lg font-bold">Available Savings Services</p>
        
        <div className="flex flex-row gap-10 mt-10">
            {/* Note: Check your "to" paths here! They currently say /Consolidated_Loan */}
            <Link to="/Consolidated_Loan" className="bg-white h-48 w-48 rounded-2xl font-bold flex text-center items-center justify-center flex-col cursor-pointer shadow-md hover:shadow-xl transition-shadow">
                <Wallet size={48} className="text-blue-600 mb-4" />
                <h1>Regular Savings</h1>
            </Link>
            
            {/* Note: Check your "to" paths here! They currently say /Emergency_Loan */}
            <Link to="/Emergency_Loan" className="bg-white h-48 w-48 rounded-2xl font-bold flex text-center items-center justify-center flex-col cursor-pointer shadow-md hover:shadow-xl transition-shadow">
                <Clock size={48} className="text-red-600 mb-4" />
                <h1>Time Deposit</h1>
            </Link>
        </div>
      </main>
    </div>
  )
} 

export default Savings_Services;