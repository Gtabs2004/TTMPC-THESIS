import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UserAuth } from '../contex/AuthContext';
import { supabase } from '../supabaseClient'; // Make sure this path is correct
import { Mail, Lock, AlertCircle, CheckCircle } from 'lucide-react'; 

const Verification = () => {
  const { signOut } = UserAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  
  // States for the Change PIN Modal
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [showPinModal, setShowPinModal] = useState(false);

  const validateEmail = (value) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (value && !emailRegex.test(value)) {
      setEmailError("Please enter a valid email address");
    } else {
      setEmailError("");
    }
  };

  // --- STEP 1: VERIFY EMAIL & PIN ---
  const handleVerifyClick = async (e) => {
    e.preventDefault();
    setError("");

    if (!email.trim() || pin.length < 4) {
      setError("Please enter your email and complete 4-digit PIN");
      return;
    }

    setIsLoading(true);
    try {
      // Calls the Postgres function to check credentials and the 'is_temporary' flag
      const { data, error: rpcError } = await supabase.rpc('verify_kiosk_pin', {
        p_email: email,
        p_pin: pin
      });

      if (rpcError) throw rpcError;

      if (data && data.length > 0) {
        const { is_valid, needs_change } = data[0];

        if (is_valid) {
          if (needs_change) {
            // User is still using the default PIN (0000)
            setShowPinModal(true);
          } else {
            // PIN is already custom; proceed to services
            navigate('/member_services');
          }
        } else {
          setError("Invalid email or PIN. Please try again.");
        }
      }
    } catch (err) {
      setError("Verification failed. Please check your connection.");
      console.error("Verification error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // --- STEP 2: SAVE NEW PIN & UPDATE FLAG ---
  const handleSaveNewPin = async (e) => {
  e.preventDefault();
  setIsLoading(true);

  try {
    // FIX: Remove the getUser() call that causes the crash
    // We use the 'email' state variable that is already in your component
    const { error: updateError } = await supabase
      .from('kiosk_auth')
      .update({ 
        pin: newPin, 
        is_temporary: false // This will now actually change in the DB
      })
      .eq('email', email); // Filter by the email you just verified

    if (updateError) throw updateError;

    setShowPinModal(false);
    alert("PIN updated successfully!");
    navigate('/member_services'); 
  } catch (err) {
    // This alert will catch any database permission (RLS) errors
    alert("Update failed: " + err.message);
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
            <img src="src/assets/img/ttmpc logo.png" className="w-auto h-24 mx-auto mb-4" alt="TTMPC Logo"/>
            <h2 className="text-3xl font-bold text-gray-900 mb-2">Account Verification</h2>
            <p className="text-gray-600 text-sm leading-relaxed">Verify your identity to access your account and loan services</p>
          </div>

          <div className="bg-white rounded-xl shadow-md border border-gray-200 p-8">
            <form className="space-y-5" onSubmit={handleVerifyClick}>
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

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 rounded-lg font-semibold transition duration-200 text-white mt-6 bg-[#66B538] 
                hover:bg-[#4a932e] active:bg-[#3a6b23] flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isLoading ? "Verifying..." : "Verify Account"}
              </button>

              {showPinModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm transition-opacity">
                  <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm relative transform transition-all scale-100">
                    <button 
                      type="button"
                      onClick={() => setShowPinModal(false)} 
                      className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>

                    <div className="flex flex-col items-center gap-2 mb-6">
                      <div className="bg-[#E9F7DE] p-3 rounded-full">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-[#66B538]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                      </div>
                      <h3 className='text-xl font-bold text-gray-800'>Change PIN</h3>
                      <p className="text-xs text-gray-500 text-center px-4">Secure your account by updating your personal identification number.</p>
                    </div>

                    <div className="flex flex-col gap-4">
                      {/* Note: I removed Current PIN as we already verified it to open this modal */}
                      <div className="space-y-1">
                          <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide ml-1">New PIN</label>
                          <input 
                              type="password" 
                              placeholder="••••" 
                              value={newPin}
                              onChange={(e) => setNewPin(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
                              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#66B538] focus:ring-opacity-50 focus:border-[#66B538] transition duration-200 text-center tracking-widest text-lg" 
                          />
                      </div>

                      <div className="space-y-1">
                          <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide ml-1">Confirm New PIN</label>
                          <input 
                              type="password" 
                              placeholder="••••" 
                              value={confirmPin}
                              onChange={(e) => setConfirmPin(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
                              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#66B538] focus:ring-opacity-50 focus:border-[#66B538] transition duration-200 text-center tracking-widest text-lg" 
                          />
                      </div>

                      <div className="flex gap-3 mt-4">
                          <button 
                              type="button"
                              onClick={() => setShowPinModal(false)}
                              className="flex-1 py-2 rounded-lg font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition duration-200"
                          >
                              Cancel
                          </button>
                          <button 
                              type="button"
                              onClick={handleSaveNewPin}
                              disabled={isLoading}
                              className="flex-1 py-2 rounded-lg font-semibold text-white bg-[#66B538] hover:bg-[#559a2f] shadow-md transition duration-200 flex items-center justify-center gap-2" 
                          >
                              {isLoading ? "Saving..." : "Save"}
                          </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
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