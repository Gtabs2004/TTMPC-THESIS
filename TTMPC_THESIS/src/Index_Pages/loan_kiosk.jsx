import React from 'react';
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

  const ApplicantCard = ({ to, Icon, label }) => (
    <Link
      to={to}
      className="bg-white h-48 w-48 rounded-2xl font-bold flex items-center justify-center flex-col cursor-pointer shadow-sm hover:shadow-md transition"
    >
      <Icon className="w-12 h-12 text-[#66B538] mb-4" />
      <h2 className="text-sm">{label}</h2>
    </Link>
  );
  return(
    <div className="flex flex-col min-h-screen bg-gray-100">
        <header className="w-full bg-[#E9F7DE] h-20 shadow-lg flex text-col">
            <div className="flex items-center w-full px-5">
              <div className="flex items-center gap-3">
                <img src="src/assets/img/ttmpc logo.png" alt="Logo" className="h-12 w-auto" />
                <div className="flex flex-col">
                  <h1 className="text-sm font-bold text-[#66B538]">Tubungan Teacher's Multi‑Purpose Cooperative</h1>
                  <p className="text-[#A0D284] text-xs">Loan Application Kiosk</p>
                </div>
              </div>
              <span className="text-xs text-gray-600 ml-auto">geronicole.delosreyes@gmail.com</span>
            </div>
    </header>
    <main className="flex justify-center items-center flex-col">
        <img src="src/assets/img/ttmpc logo.png" className="w-auto h-40 mt-16"/>
        <h1 className="text-lg font-semibold  ml-4">Loan Application Kiosk</h1>
        <p className="mt-8 text-gray-600 text-xs">Please select your applicant type to continue.</p>
        <div className="flex flex-row gap-10 mt-10">
          <ApplicantCard to="/verification" Icon={UserCheck} label="Member" />
          <ApplicantCard to="/non_member" Icon={UserPlus} label="Non-Member" />
        </div>
    </main>
    </div>
 
  )
}

export default Loan_Kiosk;