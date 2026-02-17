import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UserAuth } from '../contex/AuthContext';
import { Mail, Lock, AlertCircle, CheckCircle } from 'lucide-react';

const Verification = () => {
  const { session, signOut } = UserAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [emailError, setEmailError] = useState("");

  const validateEmail = (value) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (value && !emailRegex.test(value)) {
      setEmailError("Please enter a valid email address");
    } else {
      setEmailError("");
    }
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    setError("");

    if (!email.trim()) {
      setError("Please enter your email address");
      return;
    }
    if (emailError) {
      setError("Please enter a valid email address");
      return;
    }
    if (pin.length < 4) {
      setError("Please enter your complete 4-digit PIN");
      return;
    }

    setIsLoading(true);
    try {
      console.log("Verifying:", { email, pin });
    } catch (err) {
      setError("Verification failed. Please check your credentials and try again.");
      console.error("Verification error:", err);
    } finally {
      setIsLoading(false);
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
            <img src="src/assets/img/ttmpc logo.png" className="w-auto h-24 mx-auto mb-4"/>
            <h2 className="text-3xl font-bold text-gray-900 mb-2">Account Verification</h2>
            <p className="text-gray-600 text-sm leading-relaxed">Verify your identity to access your account and loan services</p>
          </div>

          <div className="bg-white rounded-xl shadow-md border border-gray-200 p-8">
            <form className="space-y-5">
              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-900 mb-2">
                  <Mail className="w-4 h-4 text-gray-500" />
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    validateEmail(e.target.value);
                  }}
                  onBlur={() => validateEmail(email)}
                  placeholder="john.doe@example.com"
                  className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 transition duration-200 text-sm ${
                    emailError 
                      ? 'border-red-300 focus:ring-red-200 focus:border-red-400' 
                      : 'border-gray-300 focus:ring-[#66B538] focus:ring-opacity-20 focus:border-[#66B538]'
                  }`}
                />
                {emailError && (
                  <p className="text-red-600 text-xs mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {emailError}
                  </p>
                )}
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-900 mb-2">
                  <Lock className="w-4 h-4 text-gray-500" />
                  PIN (4 Digits)
                </label>
                <input
                  type="password"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
                  placeholder="••••"
                  maxLength="4"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#66B538] focus:ring-opacity-20 
                  focus:border-[#66B538] transition duration-200 font-mono text-2xl tracking-widest text-center"
                />
                <p className="text-gray-500 text-xs mt-1">Your PIN is required for security verification</p>
              </div>  

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex gap-3">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <p className="text-red-700 text-sm font-medium">{error}</p>
                </div>
              )}

              <Link to="/loan_kiosk" className="w-full py-3 rounded-lg font-semibold transition duration-200 text-white mt-6 bg-[#66B538] 
              hover:bg-[#4a932e] active:bg-[#3a6b23] flex items-center justify-center gap-2">
                Verify Account
              </Link>
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