import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { UserAuth } from "../contex/AuthContext";
import { KeyRound } from "lucide-react";

function VerifyResetCode() {
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const { verifyPasswordResetOtp, sendPasswordResetOtp } = UserAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const stored = sessionStorage.getItem("reset_email");
    if (!stored) {
      navigate("/forgot-password");
      return;
    }
    setEmail(stored);
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await verifyPasswordResetOtp(email, code);
    if (result.success) {
      navigate("/reset-password");
    } else {
      setError(result.error || "Invalid or expired code.");
    }
    setLoading(false);
  };

  const handleResend = async () => {
    setError("");
    const result = await sendPasswordResetOtp(email);
    if (!result.success) {
      setError(result.error || "Could not resend code.");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md flex flex-col items-center">
        <img src="/img/ttmpc logo.png" alt="TTMPC Logo" className="mx-auto h-24 w-auto drop-shadow-sm mb-6" />
        <h2 className="text-center text-3xl font-extrabold text-gray-900 tracking-tight">Enter Verification Code</h2>
        <p className="mt-2 text-center text-sm text-gray-500">
          We sent a 6-digit code to <span className="font-medium">{email}</span>
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-10 px-6 shadow-lg sm:rounded-2xl sm:px-10 border border-gray-100">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="code" className="block text-sm font-semibold text-gray-700">
                Verification Code
              </label>
              <div className="mt-2 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <KeyRound className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="code"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="123456"
                  className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#66B538] focus:border-[#66B538] sm:text-lg tracking-widest text-center bg-gray-50 focus:bg-white text-gray-900 placeholder-gray-400"
                />
              </div>
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 p-4 border border-red-200">
                <h3 className="text-sm font-medium text-red-800">{error}</h3>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || code.length !== 6}
              className={`w-full flex justify-center py-2.5 px-4 rounded-lg shadow-sm text-sm font-bold text-white bg-[#66B538] hover:bg-green-700 transition-all ${
                loading || code.length !== 6 ? "opacity-70 cursor-not-allowed" : "hover:-translate-y-0.5 hover:shadow-md"
              }`}
            >
              {loading ? "Verifying..." : "Verify Code"}
            </button>

            <div className="text-center text-sm text-gray-500 space-x-2">
              <button type="button" onClick={handleResend} className="font-medium text-[#66B538] hover:text-green-700">
                Resend code
              </button>
              <span>·</span>
              <Link to="/forgot-password" className="font-medium text-[#66B538] hover:text-green-700">
                Change email
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default VerifyResetCode;
