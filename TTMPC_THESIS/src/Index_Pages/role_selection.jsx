import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UserAuth } from '../contex/AuthContext';
import { User, Briefcase } from 'lucide-react';

const Role_Selection = () => {
  return (
     <div className="flex flex-col min-h-screen bg-gray-50">
      
      <header className="w-full bg-white h-20 shadow-sm flex items-center px-6 border-b border-gray-200">
        <div className="flex flex-row items-center gap-4">
          <img src="src/assets/img/ttmpc logo.png" alt="Logo" className="h-10 w-auto" />
          <div className="flex flex-col">
            <h1 className="text-sm md:text-base font-bold text-[#66B538]">
              Tubungan Teacher's Multi‑Purpose Cooperative
            </h1>
          </div>
        </div>
      </header>
      
      <main className="flex-1 flex flex-col justify-center items-center p-6">
        <div className="flex flex-col items-center max-w-2xl w-full -mt-10"> 
          
          <img src="src/assets/img/ttmpc logo.png" alt="Logo" className="h-28 w-auto mb-8 drop-shadow-md" />
          
          <h1 className="text-3xl md:text-4xl text-gray-800 font-extrabold mb-3 text-center tracking-tight">
            Select Your <span className="text-[#66B538]">Role</span>
          </h1>
          <p className="text-gray-500 text-base md:text-lg text-center mb-10">
            Please choose how you want to log in to the portal
          </p>

        
          <div className="flex flex-col sm:flex-row gap-6 md:gap-10 w-full justify-center">
            
        
            <Link to="/memberlogin" className="group bg-white h-56 w-full sm:w-56 rounded-3xl font-bold flex items-center justify-center flex-col cursor-pointer shadow-sm hover:shadow-xl hover:-translate-y-2 transition-all duration-300 border border-gray-100 hover:border-[#66B538]">
              <div className="bg-[#E9F7DE] p-5 rounded-full mb-5 group-hover:scale-110 transition-transform duration-300">
                <User className="w-10 h-10 text-[#66B538]" strokeWidth={2.5} />
              </div>
              <div className="text-gray-700 text-xl group-hover:text-[#66B538] transition-colors">
                Member
              </div>
            </Link>

           
            <Link to="/login" className="group bg-white h-56 w-full sm:w-56 rounded-3xl font-bold flex items-center justify-center flex-col cursor-pointer shadow-sm hover:shadow-xl hover:-translate-y-2 transition-all duration-300 border border-gray-100 hover:border-[#66B538]">
              <div className="bg-[#E9F7DE] p-5 rounded-full mb-5 group-hover:scale-110 transition-transform duration-300">
                <Briefcase className="w-10 h-10 text-[#66B538]" strokeWidth={2.5} />
              </div>
              <div className="text-gray-700 text-xl group-hover:text-[#66B538] transition-colors">
                Staff
              </div>
            </Link>

          </div>

        </div>
      </main>
      
    </div>
  );
}

export default Role_Selection;