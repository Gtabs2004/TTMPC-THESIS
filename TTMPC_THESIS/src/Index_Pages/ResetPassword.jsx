import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { UserAuth } from "../contex/AuthContext";
import { useNotification } from "../contex/NotificationContext";
import { Lock } from "lucide-react";
import PasswordInput from "../components/PasswordInput";
import PasswordRequirements from "../components/PasswordRequirements";
import { getPasswordRequirementError } from "../utils/passwordValidation";

function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const { updatePassword } = UserAuth();
  const navigate = useNavigate();
  const { addNotification } = useNotification();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const requirementError = getPasswordRequirementError(password);
    if (requirementError) {
      setError(requirementError);
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    const result = await updatePassword(password);
    setLoading(false);

    if (result.success) {
      sessionStorage.removeItem("reset_email");
      addNotification("Password updated. Please log in with your new password.", "success");
      navigate("/memberlogin");
    } else {
      setError(result.error || "Could not update password. Try requesting a new code.");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md flex flex-col items-center">
        <img src="/img/ttmpc logo.png" alt="TTMPC Logo" className="mx-auto h-24 w-auto drop-shadow-sm mb-6" />
        <h2 className="text-center text-3xl font-extrabold text-gray-900 tracking-tight">Set New Password</h2>
        <p className="mt-2 text-center text-sm text-gray-500">Choose a strong password you haven't used before.</p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-10 px-6 shadow-lg sm:rounded-2xl sm:px-10 border border-gray-100">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="password" className="block text-sm font-semibold text-gray-700">
                New Password
              </label>
              <PasswordInput
                id="password"
                required
                minLength={8}
                value={password}
                autoComplete="new-password"
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                leftIcon={Lock}
                wrapperClassName="mt-2"
                className="block w-full pl-10 pr-10 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#66B538] focus:border-[#66B538] sm:text-sm bg-gray-50 focus:bg-white text-gray-900 placeholder-gray-400"
              />
              <PasswordRequirements password={password} />
            </div>

            <div>
              <label htmlFor="confirm" className="block text-sm font-semibold text-gray-700">
                Confirm Password
              </label>
              <PasswordInput
                id="confirm"
                required
                minLength={8}
                value={confirm}
                autoComplete="new-password"
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
                leftIcon={Lock}
                wrapperClassName="mt-2"
                className="block w-full pl-10 pr-10 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#66B538] focus:border-[#66B538] sm:text-sm bg-gray-50 focus:bg-white text-gray-900 placeholder-gray-400"
              />
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 p-4 border border-red-200">
                <h3 className="text-sm font-medium text-red-800">{error}</h3>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className={`w-full flex justify-center py-2.5 px-4 rounded-lg shadow-sm text-sm font-bold text-white bg-[#66B538] hover:bg-green-700 transition-all ${
                loading ? "opacity-70 cursor-not-allowed" : "hover:-translate-y-0.5 hover:shadow-md"
              }`}
            >
              {loading ? "Updating..." : "Update Password"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default ResetPassword;
