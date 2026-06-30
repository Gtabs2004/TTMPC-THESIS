import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Mail, ShieldCheck } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { useNotification } from "../../contex/NotificationContext";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export default function ChangeEmail() {
  const navigate = useNavigate();
  const { addNotification } = useNotification();

  const [loadingStatus, setLoadingStatus] = useState(true);
  const [currentEmail, setCurrentEmail] = useState("");
  const [isInitial, setIsInitial] = useState(false); // is_email_dummy
  const [step, setStep] = useState(1);
  const [newEmail, setNewEmail] = useState("");
  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          navigate("/login", { replace: true });
          return;
        }
        const res = await fetch(`${API_BASE}/api/account/security-status`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const body = await res.json();
        if (res.ok) {
          setCurrentEmail(body.email || "");
          setIsInitial(!!body.is_email_dummy);
        }
      } catch {
        // best-effort; user will see errors on submit
      } finally {
        setLoadingStatus(false);
      }
    })();
  }, [navigate]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const authHeaders = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Your session has expired. Please sign in again.");
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    };
  };

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
      addNotification(`Verification code sent to ${email}.`, "success");
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const confirmOtp = async (e) => {
    e?.preventDefault?.();
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

      addNotification("Email updated successfully.", "success");
      // Refresh the local session so future requests carry the new email claim.
      try { await supabase.auth.refreshSession(); } catch { /* non-fatal */ }

      // First-login flow → go to password change next if still temporary.
      // Steady-state → back to profile.
      const { data: { session } } = await supabase.auth.getSession();
      let nextRoute = "/members-profile";
      if (session?.access_token) {
        try {
          const r = await fetch(`${API_BASE}/api/account/security-status`, {
            headers: { Authorization: `Bearer ${session.access_token}` },
          });
          const s = await r.json();
          if (s.is_temporary) nextRoute = "/members-profile?forcePassword=1";
        } catch { /* best-effort */ }
      }
      navigate(nextRoute, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingStatus) {
    return <div className="p-8 text-gray-500">Loading…</div>;
  }

  return (
    <div className="p-6 sm:p-8 max-w-2xl mx-auto">
      {!isInitial && (
        <button
          onClick={() => navigate("/members-profile")}
          className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="w-4 h-4" /> Back to profile
        </button>
      )}

      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 sm:p-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-full bg-[#1D6021]/10 flex items-center justify-center">
            <Mail className="w-5 h-5 text-[#1D6021]" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">Change Email</h1>
            <p className="text-xs text-gray-500">
              {isInitial
                ? "Your account email is a placeholder. Set your real email to continue."
                : "Update the email address linked to your TTMPC account."}
            </p>
          </div>
        </div>

        {/* Stepper */}
        <div className="flex items-center gap-2 my-6 text-xs">
          <div className={`flex-1 h-1 rounded-full ${step >= 1 ? "bg-[#1D6021]" : "bg-gray-200"}`} />
          <div className={`flex-1 h-1 rounded-full ${step >= 2 ? "bg-[#1D6021]" : "bg-gray-200"}`} />
        </div>

        {step === 1 && (
          <form onSubmit={requestOtp} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Current email</label>
              <input
                type="email"
                value={currentEmail}
                disabled
                className="w-full border border-gray-200 bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-500"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">New email</label>
              <input
                type="email"
                value={newEmail}
                onChange={(e) => { setNewEmail(e.target.value); setError(""); }}
                placeholder="you@example.com"
                autoComplete="email"
                required
                disabled={submitting}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D6021]"
              />
              <p className="text-xs text-gray-500 mt-1">
                We'll send a 6-digit code to this address to verify you own it.
              </p>
            </div>

            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-[#1D6021] text-white font-bold rounded-lg px-4 py-2.5 text-sm hover:bg-[#154718] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? "Sending code…" : "Send verification code"}
            </button>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={confirmOtp} className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-gray-600 bg-blue-50 border border-blue-100 rounded-lg p-3">
              <ShieldCheck className="w-4 h-4 text-blue-600 flex-shrink-0" />
              <span>
                Code sent to <strong>{newEmail.trim().toLowerCase()}</strong>. Check your inbox (and spam).
              </span>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">6-digit code</label>
              <input
                type="text"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                value={code}
                onChange={(e) => { setCode(e.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }}
                required
                disabled={submitting}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-lg tracking-[0.5em] text-center font-bold focus:outline-none focus:ring-2 focus:ring-[#1D6021]"
              />
            </div>

            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 bg-[#1D6021] text-white font-bold rounded-lg px-4 py-2.5 text-sm hover:bg-[#154718] disabled:opacity-60 transition-colors"
              >
                {submitting ? "Verifying…" : "Verify & update email"}
              </button>
              <button
                type="button"
                onClick={requestOtp}
                disabled={cooldown > 0 || submitting}
                className="flex-1 border border-gray-300 text-gray-700 font-semibold rounded-lg px-4 py-2.5 text-sm hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
              </button>
            </div>

            <button
              type="button"
              onClick={() => { setStep(1); setCode(""); setError(""); }}
              className="text-xs text-gray-500 hover:text-gray-700 underline"
            >
              Use a different email
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
