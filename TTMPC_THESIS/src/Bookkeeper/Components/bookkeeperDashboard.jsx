import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
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
      // Swallow sign-out errors for now; optionally surface to UI.
    }
  };
  console.log(session);
  return (
    <aside className="bg-white h-screen w-44  p-4">
      <div className="flex flex-row items-start gap-2">
        <img src="src/assets/img/ttmpc logo.png" className="h-12 w-auto"></img>
        <div className="flex flex-col">
          <h1 className="text-xl font-bold text-[#389734]">TTMPC</h1>
          <p className="text-[8px] text-gray-500">Bookkeeper Portal</p>
        </div>
      </div>
      <hr className="w-full border-gray-300 my-2"></hr>
      <nav className="flex flex-col gap-4 mt-4 ml-4 p-4">
        <a href="#" className="text-green-700 text-xs ">
          Dashboard
          </a>
         <a href="#" className="text-green-700 text-xs ">
          Member Records
          </a>
          <a href="#" className="text-green-700 text-xs">
          Loan Application
          </a> 
          <a href="#" className="text-green-700 text-xs">
          Payments
          </a>
          <a href="#" className="text-green-700 text-xs">
          Accounting
          </a>
          <a href="#" className="text-green-700 text-xs">
          MIGS Scoring
          </a>
          <a href="#" className="text-green-700 text-xs">
          Reports
          </a>
          <a href="#" className="text-green-700 text-xs">
          Audit Trail
          </a>
          </nav>
    </aside>
  );
};

export default Dashboard;