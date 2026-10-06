import React, { useEffect, useState } from "react";
import { UserAuth } from "../../contex/AuthContext";
import { supabase } from "../../supabaseClient";
import { invalidateSecurityStatus } from "../securityStatusCache";
import { router } from "../../Router";
import PasswordInput from "../../components/PasswordInput";
import PasswordRequirements from "../../components/PasswordRequirements";
import { getPasswordRequirementError } from "../../utils/passwordValidation";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

const inputClass =
  "w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg pl-3 pr-10 py-2 text-sm focus:ring-2 focus:ring-member-green outline-none";
const toggleClass = "text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300";

const passwordAuthHeaders = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Your session has expired. Please sign in again.");
  return { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` };
};

// Change password with the current one, or recover it with an emailed code.
// Mounted only while open, so every opening starts from a clean form.
function PasswordForm({ onClose, onChanged, mustChange }) {
  const { session } = UserAuth();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [otpCooldown, setOtpCooldown] = useState(0);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [step, setStep] = useState(1);
  const [error, setError] = useState("");
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (otpCooldown <= 0) return;
    const t = setTimeout(() => setOtpCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [otpCooldown]);

  const validateNewPassword = () => {
    if (!newPassword || !confirmPassword) return "Please fill in your new password.";
    const requirementError = getPasswordRequirementError(newPassword);
    if (requirementError) return requirementError;
    if (newPassword !== confirmPassword) return "Password confirmation does not match.";
    return "";
  };

  // Supabase revokes every session when the password changes, so the token in
  // sessionStorage is already dead. Mint a fresh session with the new password;
  // if that fails, send the member through a clean login instead.
  const reauthenticate = async () => {
    const email = session?.user?.email;
    if (!email) return true;
    const { error: reAuthError } = await supabase.auth.signInWithPassword({ email, password: newPassword });
    if (reAuthError) {
      await supabase.auth.signOut();
      router.navigate("/memberlogin");
      return false;
    }
    return true;
  };

  const finish = async () => {
    if (!(await reauthenticate())) return;
    // Let the onboarding guard re-read status instead of serving the cached
    // "still temporary" answer for up to a minute.
    invalidateSecurityStatus();
    onChanged?.();
  };

  const handleDirectChange = async (e) => {
    e.preventDefault();
    setError("");
    if (!currentPassword) {
      setError("Enter your current password.");
      return;
    }
    const validation = validateNewPassword();
    if (validation) {
      setError(validation);
      return;
    }
    if (newPassword === currentPassword) {
      setError("New password must differ from your current password.");
      return;
    }
    try {
      setUpdating(true);
      const res = await fetch(`${API_BASE}/api/account/password/change-direct`, {
        method: "POST",
        headers: await passwordAuthHeaders(),
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.detail || "Unable to update password.");
      await finish();
    } catch (err) {
      setError(err.message || "Unable to update password.");
    } finally {
      setUpdating(false);
    }
  };

  const handleRequestOtp = async (e) => {
    e?.preventDefault?.();
    setError("");
    try {
      setUpdating(true);
      const res = await fetch(`${API_BASE}/api/account/password/send-code`, {
        method: "POST",
        headers: await passwordAuthHeaders(),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.detail || "Failed to send verification code.");
      setStep(2);
      setOtpCooldown(60);
      setOtp("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err.message || "Unable to send code.");
    } finally {
      setUpdating(false);
    }
  };

  const handleConfirmOtp = async (e) => {
    e.preventDefault();
    setError("");
    if (!/^\d{6}$/.test(otp)) {
      setError("Enter the 6-digit code.");
      return;
    }
    const validation = validateNewPassword();
    if (validation) {
      setError(validation);
      return;
    }
    try {
      setUpdating(true);
      const res = await fetch(`${API_BASE}/api/account/password/verify-and-set`, {
        method: "POST",
        headers: await passwordAuthHeaders(),
        body: JSON.stringify({ code: otp, new_password: newPassword }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.detail || "Invalid code.");
      await finish();
    } catch (err) {
      setError(err.message || "Unable to update password.");
    } finally {
      setUpdating(false);
    }
  };

  const newPasswordFields = (
    <>
      <div className="mb-4">
        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">New Password</label>
        <PasswordInput
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          autoComplete="new-password"
          toggleClassName={toggleClass}
          className={inputClass}
          placeholder="At least 8 characters"
        />
        <PasswordRequirements password={newPassword} />
      </div>
      <div className="mb-4">
        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Confirm New Password</label>
        <PasswordInput
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
          toggleClassName={toggleClass}
          className={inputClass}
          placeholder="Repeat new password"
        />
      </div>
    </>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <form
        onSubmit={step === 2 ? handleConfirmOtp : (recoveryMode ? handleRequestOtp : handleDirectChange)}
        className="w-full max-w-md max-h-[90vh] overflow-y-auto bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 p-6"
      >
        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">
          {step === 2 ? "Verify Code & Set New Password" : (recoveryMode ? "Recover Password" : "Change Password")}
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          {step === 2
            ? "Enter the 6-digit code we emailed you, then choose a new password."
            : (recoveryMode
                ? "We'll email a 6-digit code to your address on file. You can set your new password after verifying the code."
                : "Enter your current password and choose a new one.")}
        </p>

        {step === 1 ? (
          <>
            {!recoveryMode && (
              <>
                <div className="mb-4">
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Current Password</label>
                  <PasswordInput
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    autoComplete="current-password"
                    toggleClassName={toggleClass}
                    className={inputClass}
                    placeholder="Enter your current password"
                  />
                  <button
                    type="button"
                    onClick={() => { setRecoveryMode(true); setCurrentPassword(""); setNewPassword(""); setConfirmPassword(""); setError(""); }}
                    className="mt-2 text-xs text-member-green dark:text-green-400 hover:underline"
                  >
                    Forgot your current password?
                  </button>
                </div>
                {newPasswordFields}
              </>
            )}
            {recoveryMode && (
              <div className="mb-4 text-xs text-blue-800 bg-blue-50 border border-blue-100 rounded-lg p-3">
                A verification code will be sent to your email on file.
                <button
                  type="button"
                  onClick={() => { setRecoveryMode(false); setError(""); }}
                  className="block mt-1 text-member-green dark:text-green-400 hover:underline"
                >
                  I remember my current password
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="mb-4">
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">6-digit Code</label>
              <input
                type="text"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-lg tracking-[0.5em] text-center font-bold focus:ring-2 focus:ring-member-green outline-none"
                placeholder="000000"
              />
              <button
                type="button"
                onClick={handleRequestOtp}
                disabled={otpCooldown > 0 || updating}
                className="mt-2 text-xs text-member-green dark:text-green-400 hover:underline disabled:text-gray-400 disabled:no-underline"
              >
                {otpCooldown > 0 ? `Resend code in ${otpCooldown}s` : "Resend code"}
              </button>
            </div>
            {newPasswordFields}
          </>
        )}

        {error ? <p className="text-sm text-red-600 mb-4">{error}</p> : null}

        <div className="flex items-center justify-end gap-3">
          {step === 2 ? (
            <button
              type="button"
              onClick={() => { setStep(1); setOtp(""); setError(""); }}
              className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-semibold hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Back
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              disabled={mustChange}
              className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
              title={mustChange ? "You must change your temporary password before continuing." : ""}
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={updating}
            className="px-4 py-2 rounded-lg bg-member-green text-white text-sm font-semibold hover:bg-[#154718] disabled:opacity-50"
          >
            {updating
              ? (step === 2 ? "Verifying…" : (recoveryMode ? "Sending code…" : "Updating…"))
              : (step === 2 ? "Verify & Update Password" : (recoveryMode ? "Send Code" : "Update Password"))}
          </button>
        </div>
      </form>
    </div>
  );
}

// mustChange: the account still has a temporary password, so it can't be dismissed.
export default function ChangePasswordModal({ open, ...rest }) {
  if (!open) return null;
  return <PasswordForm {...rest} />;
}
