import React, { useEffect, useState } from "react";
import { Mail, ShieldCheck } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { invalidateSecurityStatus } from "../securityStatusCache";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const authHeaders = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Your session has expired. Please sign in again.");
  return { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` };
};

// Change email via a 6-digit code sent to the new address. Mounted only
// while open, so every opening starts from a clean form and a freshly
// fetched current email -- same pattern as ChangePasswordModal.
//
// This used to be its own full page (ChangeEmail.jsx) at
// /members-profile/change-email, reached by navigating away from Settings.
// Its "Back to settings" button hardcoded that route, which broke the
// moment Settings itself became a drawer instead of a page -- the dead
// route fell through to the app's catch-all and bounced straight to the
// landing page. A modal has no route to go stale against, so that whole
// class of bug can't recur here. (There was briefly a worry that this page
// also handled the forced first-login "set a real email" step -- it
// doesn't; AccountSetupGate.jsx has its own separate, self-contained
// EmailStep for that, so dropping the old isInitial branch here is safe.)
function EmailForm({ onClose, onChanged }) {
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [currentEmail, setCurrentEmail] = useState("");
  const [step, setStep] = useState(1);
  const [newEmail, setNewEmail] = useState("");
  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/account/security-status`, {
          headers: await authHeaders(),
        });
        const body = await res.json();
        if (res.ok) setCurrentEmail(body.email || "");
      } catch {
        // best-effort; the member will see errors on submit instead
      } finally {
        setLoadingStatus(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const requestOtp = async (e) => {
    e?.preventDefault?.();
    setError("");
    const email = newEmail.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) { setError("Enter a valid email address."); return; }
    if (email === currentEmail.toLowerCase()) { setError("New email matches your current email."); return; }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/account/email/request-otp`, {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({ new_email: email }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.detail || "Failed to send code.");
      setStep(2);
      setCooldown(60);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const confirmOtp = async (e) => {
    e.preventDefault();
    setError("");
    if (!/^\d{6}$/.test(code)) { setError("Enter the 6-digit code."); return; }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/account/email/confirm`, {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({ code }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.detail || "Invalid code.");

      // Refresh the local session so future requests carry the new email claim.
      try { await supabase.auth.refreshSession(); } catch { /* non-fatal */ }
      // Drop the onboarding guard's cached status, or it keeps reporting the
      // old address for up to a minute.
      invalidateSecurityStatus();
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingStatus) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
        <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 p-6 text-sm text-gray-500 dark:text-gray-400">
          Loading…
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <form
        onSubmit={step === 2 ? confirmOtp : requestOtp}
        className="w-full max-w-md max-h-[90vh] overflow-y-auto bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 p-6"
      >
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 shrink-0 rounded-full bg-member-green/10 dark:bg-green-900/30 flex items-center justify-center">
            <Mail className="w-4 h-4 text-member-green dark:text-green-400" />
          </div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">
            {step === 2 ? "Verify Your New Email" : "Change Email"}
          </h3>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          {step === 2
            ? "Enter the 6-digit code we sent to your new address."
            : "Update the email address linked to your TTMPC account."}
        </p>

        {step === 1 ? (
          <>
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Current email</label>
              <input
                type="email"
                value={currentEmail}
                disabled
                className="w-full border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2 text-sm text-gray-500 dark:text-gray-400"
              />
            </div>
            <div className="mb-4 mt-4">
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">New email</label>
              <input
                type="email"
                value={newEmail}
                onChange={(e) => { setNewEmail(e.target.value); setError(""); }}
                placeholder="you@example.com"
                autoComplete="email"
                required
                disabled={submitting}
                className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-member-green"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                We'll send a 6-digit code to this address to verify you own it.
              </p>
            </div>
          </>
        ) : (
          <div className="mb-4">
            <div className="flex items-center gap-2 text-sm text-blue-700 dark:text-blue-200 bg-blue-50 dark:bg-blue-900/30 border border-blue-100 dark:border-blue-800 rounded-lg p-3 mb-4">
              <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
              <span>
                Code sent to <strong>{newEmail.trim().toLowerCase()}</strong>. Check your inbox (and spam).
              </span>
            </div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">6-digit code</label>
            <input
              type="text"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              value={code}
              onChange={(e) => { setCode(e.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }}
              required
              disabled={submitting}
              className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-lg tracking-[0.5em] text-center font-bold focus:outline-none focus:ring-2 focus:ring-member-green"
            />
            <button
              type="button"
              onClick={requestOtp}
              disabled={cooldown > 0 || submitting}
              className="mt-2 text-xs text-member-green dark:text-green-400 hover:underline disabled:text-gray-400 disabled:no-underline"
            >
              {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
            </button>
          </div>
        )}

        {error ? <p role="alert" className="text-sm text-red-600 dark:text-red-400 mb-4">{error}</p> : null}

        <div className="flex items-center justify-end gap-3">
          {step === 2 ? (
            <button
              type="button"
              onClick={() => { setStep(1); setCode(""); setError(""); }}
              className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-semibold hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Back
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-semibold hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 rounded-lg bg-member-green text-white text-sm font-semibold hover:bg-[#154718] disabled:opacity-50"
          >
            {submitting
              ? (step === 2 ? "Verifying…" : "Sending code…")
              : (step === 2 ? "Verify & Update Email" : "Send Verification Code")}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function ChangeEmailModal({ open, ...rest }) {
  if (!open) return null;
  return <EmailForm {...rest} />;
}
