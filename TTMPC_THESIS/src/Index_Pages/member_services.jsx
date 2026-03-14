import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UserAuth } from '../contex/AuthContext';
// Updated to better, more logical icons
import { PiggyBank, Landmark, Receipt, LogOut } from 'lucide-react';

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

  return (
    <div className="flex flex-col min-h-screen bg-gray-100">
      {/* Header updated to align items nicely and include the LogOut button */}
      <header className="w-full bg-[#E9F7DE] h-20 shadow-lg flex justify-between items-center px-6">
        <div className="flex flex-row items-center gap-3">
          <img src="src/assets/img/ttmpc logo.png" alt="Logo" className="h-12 w-auto" />
          <div className="flex flex-col">
            <h1 className="text-sm font-bold text-[#66B538]">Tubungan Teacher's Multi‑Purpose Cooperative</h1>
            <p className="text-[#A0D284] text-xs">Loan Application Kiosk</p>
          </div>
        </div>
        
        {/* Added the missing LogOut button here */}
        <button 
          onClick={handleSignOut} 
          className="flex items-center gap-2 text-gray-600 hover:text-red-600 font-bold transition-colors"
        >
          <span>Sign Out</span>
          <LogOut size={24} />
        </button>
      </header>

      <main className="flex justify-center items-center flex-col flex-grow">
        <img src="src/assets/img/ttmpc logo.png" className="w-auto h-40 mt-8" alt="Kiosk Logo" />
        <h1 className="text-sm font-semibold ml-2">Loan Application Kiosk</h1>
        <p className="mt-4 text-lg font-bold">Available Loan Services</p>
        
        <div className="flex flex-row gap-10 mt-10">
          {/* Changed h-50 w-50 to standard Tailwind sizes: h-48 w-48 */}
          <Link to="/savings_services" className="bg-white h-48 w-48 rounded-2xl font-bold flex text-center items-center justify-center flex-col cursor-pointer shadow-md hover:shadow-xl transition-shadow">
            <PiggyBank size={48} className="text-blue-600 mb-4" />
            <h1>Savings</h1>
          </Link>
          
          <Link to="/loan_services" className="bg-white h-48 w-48 rounded-2xl font-bold flex text-center items-center justify-center flex-col cursor-pointer shadow-md hover:shadow-xl transition-shadow">
            <Landmark size={48} className="text-red-600 mb-4" />
            <h1>Loans</h1>
          </Link>
          
          <Link to="/Bonus_Loan" className="bg-white h-48 w-48 rounded-2xl font-bold flex text-center items-center justify-center flex-col cursor-pointer shadow-md hover:shadow-xl transition-shadow">
            <Receipt size={48} className="text-green-600 mb-4" />
            <h1>Payments</h1>
          </Link>
        </div>
      </main>
    </div>
  );
}

export default Member_Services;