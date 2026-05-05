import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UserAuth } from '../contex/AuthContext';
import { UserCheck, UserPlus, UserRound, LogOut } from 'lucide-react'; // Added LogOut

const Loan_Kiosk = () => {
  const { session, signOut } = UserAuth();
  const navigate = useNavigate();

 

  // Upgraded the ApplicantCard to match the new interactive card styles
  const ApplicantCard = ({ to, Icon, label, iconColor, bgClass }) => (
    <Link
      to={to}
      className="bg-white h-56 w-56 rounded-2xl flex flex-col items-center justify-center cursor-pointer shadow-sm border border-slate-100 hover:shadow-lg hover:border-[#A0D284] transition-all group"
    >
      <div className={`${bgClass} p-5 rounded-full mb-4 group-hover:scale-110 transition-transform duration-300`}>
        <Icon size={40} color={iconColor} strokeWidth={2} />
      </div>
      <h1 className="font-bold text-slate-800 text-lg">{label}</h1>
    </Link>
  );

  return(
    <div className="flex flex-col min-h-screen bg-gray-100">
        
        {/* Standardized Header */}
        <header className="w-full bg-[#E9F7DE] h-20 shadow-sm border-b border-[#D5EDB9] flex justify-between items-center px-6">
            <div className="flex flex-row items-center gap-3">
              <img src="src/assets/img/ttmpc logo.png" alt="Logo" className="h-12 w-auto" />
              <div className="flex flex-col">
                <h1 className="text-sm font-bold text-[#66B538]">Tubungan Teacher's Multi‑Purpose Cooperative</h1>
                <p className="text-[#A0D284] text-xs">Loan Application Kiosk</p>
              </div>
            </div>

           
        </header>

      <main className="flex justify-center items-center flex-col flex-grow py-10 px-4 text-center">
        <img src="src/assets/img/ttmpc logo.png" className="w-auto h-32 mb-4" alt="Kiosk Logo"/>
        <h1 className="text-sm font-semibold text-slate-500 uppercase tracking-widest">Loan Application Kiosk</h1>
        
        <p className="mt-2 text-2xl font-bold text-slate-800">Please select your applicant type</p>
        <p className="mt-2 text-slate-500 text-sm font-medium mb-10">Choose a category below to continue your application.</p>
        
        <div className="flex flex-col sm:flex-row gap-6 mt-4">
          <ApplicantCard 
            to="/verification" 
            Icon={UserCheck} 
            label="Member" 
            iconColor="#66B538" 
            bgClass="bg-[#F0FDF4]" 
          />
          <ApplicantCard 
            to="/non_member" 
            Icon={UserPlus} 
            label="Non-Member" 
            iconColor="#DC2626" 
            bgClass="bg-red-50" 
          />
          <ApplicantCard 
            to="/Koica_Forms" 
            Icon={UserRound} 
            label="ABFF" 
            iconColor="#2563EB" 
            bgClass="bg-blue-50" 
          />
        </div>
      </main>
    </div>
  )
}

export default Loan_Kiosk;