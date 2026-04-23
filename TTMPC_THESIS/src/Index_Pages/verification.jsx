import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient'; 
import { UserAuth } from '../contex/AuthContext'; // Import your central auth context
import { User, Lock, AlertCircle } from 'lucide-react'; // Changed Mail to User

const Verification = () => {
  const navigate = useNavigate();
  const { signInWithIdentifier } = UserAuth(); // Use the hybrid login logic we built

  const [membershipId, setMembershipId] = useState(""); // Changed from email
  const [password, setPassword] = useState("");
  
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // --- STEP 1: VERIFY BY MEMBERSHIP ID ---
  const handleVerifyClick = async (e) => {
    e.preventDefault();
    setError("");

    if (!membershipId.trim() || !password.trim()) {
      setError("Please enter your membership ID and password");
      return;
    }

    setIsLoading(true);
    try {
      const cleanId = membershipId.trim();

      // This uses our "Silent Lookup" logic to handle both Officers and Members
      const result = await signInWithIdentifier(cleanId, password);

      if (result.success) {
        // Success! Redirect to the kiosk services
        navigate('/member_services');
      } else {
        // Show specific error from auth logic
        setError(result.error || "Verification failed. Please try again.");
      }
    } catch (err) {
      setError("Verification failed. Please check your connection.");
      console.error("Verification error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  return(
    <div className="flex flex-col min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <header className="w-full bg-[#E9F7DE] h-20 shadow-lg flex text-col px-6">
        <div className="flex flex-row items-center gap-4">
          <img src="src/assets/img/ttmpc logo.png" alt="Logo" className="h-12 w-auto" />
          <div className="flex flex-col">
            <h1 className="text-sm font-bold text-[#66B538]">Tubungan Teacher's Multi‑Purpose Cooperative</h1>
            <p className="text-[#A0D284] text-xs">Loan Application Kiosk</p>
          </div>
        </div>
      </header>

      <main className="flex justify-center items-center flex-col flex-1 py-8 px-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <img src="src/assets/img/ttmpc logo.png" className="w-auto h-24 mx-auto mb-4" alt="TTMPC Logo"/>
            <h2 className="text-3xl font-bold text-gray-900 mb-2">Account Verification</h2>
            <p className="text-gray-600 text-sm leading-relaxed">Verify your identity to access your account and loan services</p>
          </div>

          <div className="bg-white rounded-xl shadow-md border border-gray-200 p-8">
            <form className="space-y-5" onSubmit={handleVerifyClick}>
              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-900 mb-2">
                  <User className="w-4 h-4 text-gray-500" />
                  Membership ID
                </label>
                <input
                  type="text"
                  value={membershipId}
                  onChange={(e) => setMembershipId(e.target.value)}
                  placeholder="e.g., TTMPC-001"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#66B538] focus:ring-opacity-20 focus:border-[#66B538] transition duration-200 text-sm"
                />
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-900 mb-2">
                  <Lock className="w-4 h-4 text-gray-500" />
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#66B538] focus:ring-opacity-20 
                  focus:border-[#66B538] transition duration-200"
                />
                <p className="text-gray-500 text-xs mt-1">Your password is required for account verification</p>
              </div>  

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex gap-3">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <p className="text-red-700 text-sm font-medium">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 rounded-lg font-semibold transition duration-200 text-white mt-6 bg-[#66B538] 
                hover:bg-[#4a932e] active:bg-[#3a6b23] flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isLoading ? "Verifying..." : "Verify Account"}
              </button>

            </form>

            <div className="mt-6 pt-6 border-t border-gray-200">
              <p className="text-center text-gray-600 text-sm">
                Trouble signing in?{' '}
                <Link to="/login" className="text-[#66B538] font-semibold hover:text-[#4a932e] transition">
                  Back to Login
                </Link>
              </p>
            </div>
          </div>

          <div className="text-center mt-6">
            <p className="text-gray-500 text-xs">Secure verification • Your data is encrypted and protected</p>
          </div>
        </div>
      </main>
    </div>
  )
}
export default Verification;