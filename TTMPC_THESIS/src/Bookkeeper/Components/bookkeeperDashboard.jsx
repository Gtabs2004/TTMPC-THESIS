import React from "react";
import { useNavigate, Link } from "react-router-dom";
import { UserAuth } from "../../contex/AuthContext";

const Dashboard = () => {
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
    <div className="flex min-h-screen bg-gray-100">
      <aside className="bg-white w-64 p-4 flex flex-col border-r border-gray-200">
        <div className="flex flex-row items-start gap-2 mb-6">
          <img src="src/assets/img/ttmpc logo.png" alt="Logo" className="h-12 w-auto" />
          <div className="flex flex-col">
            <h1 className="text-xl font-bold text-[#389734]">TTMPC</h1>
            <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
              Bookkeeper Portal
            </p>
          </div>
        </div>

        <hr className="w-full border-gray-200 mb-6" />

        
        <nav className="flex flex-col gap-2 text-sm flex-grow">
          {[
            "Dashboard", "Member Records", "Loan Application", 
            "Payments", "Accounting", "MIGS Scoring", 
            "Reports", "Audit Trail"
          ].map((item) => (
            <Link
              key={item}
              to={`/${item.toLowerCase().replace(/\s+/g, '-')}`}
              className="text-gray-700 hover:bg-green-50 hover:text-green-700 p-2 rounded-md transition-colors"
            >
              {item}
            </Link>
          ))}
        </nav>

        {/* Sign Out Button - Pushed to the bottom */}
        <button
          onClick={handleSignOut}
          className="mt-auto w-full rounded p-2 text-xs bg-green-600 hover:bg-green-700 text-white font-bold transition-colors"
        >
          Sign out
        </button>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col">
        {/* Navbar */}
        <header className="bg-white h-16 shadow-sm flex items-center px-8">
           <h2 className="text-gray-800 font-medium">Welcome back, {session?.user?.email}</h2>
        </header>

        {/* Page Content */}
        <main className="p-8">
          {/* Your dashboard content (cards, tables, etc.) goes here */}
        </main>
      </div>
    </div>
  );
};

export default Dashboard;