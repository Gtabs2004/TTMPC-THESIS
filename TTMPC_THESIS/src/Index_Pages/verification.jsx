import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UserAuth } from '../contex/AuthContext';
import { Hash, Key, Delete, ChevronLeft, Check } from 'lucide-react';

const Verification = () => {
  const { session, signOut } = UserAuth();
  const navigate = useNavigate();

  const [accountNum, setaccountNum] = useState("");
  const [pin, setPin] = useState("");

  const [activeField, setActiveField] = useState("account");

  const handleNumberClick = (num) => {
    if (activeField === "account") {
      if(accountNum.length < 12) setaccountNum(prev => prev + num);
    } else{
      if(pin.length < 6) setPin(prev => prev + num);
    }
  };

  const handleBackspace = () => {
    if (activeField === "account") {
      setaccountNum(prev => prev.slice(0, -1));
    } else{
      setPin(prev => prev.slice(0, -1));
    }
  };

  const handleClear = () => {
    if (activeField === "account") {
      setaccountNum("");
    } else {
      setPin("");
    }
  };

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
        <img src="src/assets/img/ttmpc logo.png" className="w-auto h-40 mt-8"/>
         <h1 className="text-lg font-semibold  ml-4">Member Verification</h1>
        <p className="ml-3 text-gray-600 text-xs">Enter your account details below.</p>

        <div className="flex flex-col md:flex-row gap-12 w-full max-w-4xl justify-center items-start mt-8">
          <div className="flex flex-col gap-6 w-full md:w-1/2 max-w-sm">
          <div 
            onClick={() => setActiveField('account')}
            className={`relative bg-white p-6 rounded-xl border-2 cursor-pointer transition-all duration-200
              ${activeField === 'account' ? 'border-[#66B538] ring-4 ring-[#E9F7DE]' : 'border-gray-200 hover:border-gray-300'}
              `}
            >
              <div className="flex items-center gap-2 mb-2">
                <Hash className="w-4 h-4 text-gray-500" />
                <span className="text-sm font-bold text-gray-700">Account Number</span>
              </div>
              {/* Display Value or Placeholder */}
              <div className="text-2xl font-mono tracking-widest text-gray-800 h-8">
                {accountNum ? accountNum : <span className="text-gray-300">_ _ _ _ _ _</span>}
              </div>
            </div>

            {/* PIN Box */}
            <div 
              onClick={() => setActiveField('pin')}
              className={`relative bg-white p-6 rounded-xl border-2 cursor-pointer transition-all duration-200
                ${activeField === 'pin' ? 'border-[#66B538] ring-4 ring-[#E9F7DE]' : 'border-gray-200 hover:border-gray-300'}
              `}
            >
              <div className="flex items-center gap-2 mb-2">
                <Key className="w-4 h-4 text-gray-500" />
                <span className="text-sm font-bold text-gray-700">PIN</span>
              </div>
              {/* Display Value (Masked) or Placeholder */}
              <div className="text-2xl font-mono tracking-widest text-gray-800 h-8">
                {pin ? pin.replace(/./g, '•') : <span className="text-gray-300">_ _ _ _</span>}
              </div>
            </div>

          </div>

          {/* RIGHT COLUMN: Keypad */}
          <div className="flex flex-col gap-6 w-full md:w-auto">
            {/* Number Grid */}
            <div className="grid grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                <button
                  key={num}
                  onClick={() => handleNumberClick(num.toString())}
                  className="w-20 h-16 bg-white border border-gray-200 rounded-xl text-2xl font-bold text-gray-700 shadow-sm hover:bg-gray-50 active:scale-95 transition-all"
                >
                  {num}
                </button>
              ))}
              
              {/* Bottom Row of Keypad */}
              <button 
                onClick={handleClear}
                className="w-20 h-16 bg-red-100 border border-red-200 rounded-xl text-sm font-bold text-red-600 shadow-sm hover:bg-red-200 active:scale-95 transition-all"
              >
                CLEAR
              </button>
              
              <button 
                onClick={() => handleNumberClick('0')}
                className="w-20 h-16 bg-white border border-gray-200 rounded-xl text-2xl font-bold text-gray-700 shadow-sm hover:bg-gray-50 active:scale-95 transition-all"
              >
                0
              </button>
              
              <button 
                onClick={handleBackspace}
                className="w-20 h-16 bg-gray-200 border border-gray-300 rounded-xl flex items-center justify-center text-gray-700 shadow-sm hover:bg-gray-300 active:scale-95 transition-all"
              >
                <Delete className="w-6 h-6" />
              </button>
            </div>

            
            <div className="flex gap-4 mt-2">
              <button 
                onClick={() => navigate(-1)}
                className="flex-1 py-3 bg-[#E9F7DE] text-[#66B538] font-bold rounded-xl hover:bg-[#d4edc1] transition-colors cursor-pointer"
              >
                Back
              </button>
              <Link to="/member_services" className="flex-1 text-center py-3 bg-[#66B538] text-white 
              font-bold rounded-xl shadow-lg hover:bg-[#559e2e] transition-colors cursor-pointer">
                Proceed
              </Link>
            </div>

          </div>
        </div>
    </main>

    </div>
  )
}
export default Verification;