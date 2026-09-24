import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, LogOut, ShieldAlert } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { UserAuth } from "../../contex/AuthContext";
import PasswordInput from "../../components/PasswordInput";
import PasswordRequirements from "../../components/PasswordRequirements";
import { getPasswordRequirementError } from "../../utils/passwordValidation";
import {
  invalidateSecurityStatus,
  readCachedStatus,
  writeCachedStatus,
} from "../securityStatusCache";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Blocking account-setup gate for the Member dashboard.
 *
 * Every step is completed INSIDE this modal. It deliberately does not navigate
 * to the profile page: that page renders the portal sidebar (Loans, Statement,
 * Lifecycle...), so sending the member there to change their password would
 * hand them exactly the navigation this lock exists to withhold.
 *
 * Steps run in order -- real email, then real password, then the required
 * profile fields -- because the email is where the password OTP is sent.
 */
export default function AccountSetupGate() {
  const navigate = useNavigate();
  const { signOut } = UserAuth();
  const [status, setStatus] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  // The way out for a member who does not want to finish setup right now. The
  // overlay covers the sidebar (Sign out included), so without this the only
  // escape would be closing the tab -- and the session would still be live on
  // an account that is still on its temporary credentials.
  const handleSignOut = useCallback(async () => {
    invalidateSecurityStatus();
    try {
      await signOut();
    } catch {
      /* Clearing the local session below is what matters. */
    }
    navigate("/memberlogin", { replace: true });
  }, [signOut, navigate]);

  // `overrideToken` lets a step hand in a token it just minted (see the
  // password step's re-auth). getSession() can still report the previous
  // session immediately after sign-in, and that token is revoked the moment
  // the password changes.
  const load = useCallback(async (overrideToken) => {
    setError(false);
    try {
      // Guard the type: this is also used as an onClick handler, which would
      // otherwise pass a React event object in as the token.
      let token = typeof overrideToken === "string" ? overrideToken : undefined;
      if (!token) {
        const { data: { session } } = await supabase.auth.getSession();
        token = session?.access_token;
      }
      if (!token) {
        setLoaded(true);
        return;
      }

      const cached = readCachedStatus(token);
      if (cached) {
        setStatus(cached);
        setLoaded(true);
        return;
      }

      let res = await fetch(`${API_BASE}/api/account/security-status`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      // A 401 usually means the access token went stale (Supabase revokes
      // tokens when the account's credentials change). Try once with a fresh
      // one before declaring the account unverifiable.
      if (res.status === 401) {
        const { data: refreshed } = await supabase.auth.refreshSession();
        const newToken = refreshed?.session?.access_token;
        if (newToken) {
          res = await fetch(`${API_BASE}/api/account/security-status`, {
            headers: { Authorization: `Bearer ${newToken}` },
          });
          if (res.ok) {
            const retried = await res.json();
            writeCachedStatus(newToken, retried);
            setStatus(retried);
            return;
          }
        }
      }

      if (!res.ok) {
        // Fail CLOSED: a gate that cannot verify the account must block.
        setError(true);
        return;
      }
      const body = await res.json();
      writeCachedStatus(token, body);
      setStatus(body);
    } catch {
      setError(true);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const refresh = useCallback(async (overrideToken) => {
    invalidateSecurityStatus();
    await load(overrideToken);
  }, [load]);

  if (!loaded) return null;

  if (error) {
    return (
      <Shell
        title="Could not verify your account"
        subtitle="We could not confirm your account setup, so the portal is locked for now."
        tone="danger"
        onSignOut={handleSignOut}
      >
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Check your connection and try again.
        </p>
        <button
          type="button"
          onClick={() => load()}
          className="mt-4 rounded-lg bg-member-green px-6 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-[#154718]"
        >
          Try again
        </button>
      </Shell>
    );
  }

  if (!status) return null;

  const needsEmail = Boolean(status.is_email_dummy);
  const needsPassword = Boolean(status.is_temporary);
  if (!needsEmail && !needsPassword) return null;

  const steps = [
    { key: "email", label: "Email", done: !needsEmail },
    { key: "password", label: "Password", done: !needsPassword },
  ];

  return (
    <Shell
      title="Finish setting up your account"
      subtitle="For your security, complete these steps before using the member portal."
      onSignOut={handleSignOut}
      stepper={<Stepper steps={steps} />}
    >
      {needsEmail ? (
        <EmailStep currentEmail={status.email} onDone={refresh} />
      ) : (
        <PasswordStep currentEmail={status.email} onDone={refresh} />
      )}
    </Shell>
  );
}

/* ------------------------------------------------------------------ layout */

function Shell({ title, subtitle, tone = "warning", onSignOut, stepper, children }) {
  const toneClass =
    tone === "danger"
      ? "bg-red-50 text-red-600 ring-1 ring-red-200 dark:bg-red-900/30 dark:text-red-300 dark:ring-red-900"
      : "bg-amber-50 text-amber-600 ring-1 ring-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:ring-amber-900";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-gray-900/60 p-4 backdrop-blur-sm"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="account-setup-title"
    >
      <div className="my-auto w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-900">
        {/* Header — gray-50 with a hairline rule, per the modal spec. */}
        <div className="border-b border-gray-200 bg-gray-50 px-6 py-5 dark:border-gray-800 dark:bg-gray-900/40">
          <div className="flex items-start gap-3">
            <span className={`flex-none rounded-lg p-2 ${toneClass}`}>
              <ShieldAlert className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2
                id="account-setup-title"
                className="text-base font-bold leading-snug text-gray-900 dark:text-white"
              >
                {title}
              </h2>
              {subtitle ? (
                <p className="mt-0.5 text-xs leading-relaxed text-gray-600 dark:text-gray-400">
                  {subtitle}
                </p>
              ) : null}
            </div>
          </div>
          {stepper}
        </div>

        {/* Body */}
        <div className="px-6 py-5">{children}</div>

        {/* Footer — gray-50, hairline rule, the one way out of the gate. */}
        {onSignOut ? (
          <div className="flex flex-col items-center gap-1 border-t border-gray-200 bg-gray-50 px-6 py-3 text-center dark:border-gray-800 dark:bg-gray-900/40 sm:flex-row sm:justify-between sm:text-left">
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              Not ready? Sign out and finish later — the portal stays locked.
            </p>
            <button
              type="button"
              onClick={onSignOut}
              className="inline-flex flex-none items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-bold text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
            >
              <LogOut className="h-3.5 w-3.5" /> Sign out
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Connected 3-step progress rail: completed steps join to the next with a
 *  filled connector, so it reads as one sequence rather than three loose dots. */
function Stepper({ steps }) {
  return (
    <ol className="mt-4 flex items-center">
      {steps.map((step, index) => {
        const isCurrent = !step.done && steps.slice(0, index).every((s) => s.done);
        return (
          <li
            key={step.key}
            className={`flex items-center ${index < steps.length - 1 ? "flex-1" : ""}`}
          >
            <span
              className={`flex h-6 w-6 flex-none items-center justify-center rounded-full text-[11px] font-bold transition-colors ${
                step.done
                  ? "bg-member-green text-white"
                  : isCurrent
                    ? "bg-amber-500 text-white ring-4 ring-amber-500/20"
                    : "bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400"
              }`}
            >
              {step.done ? <Check className="h-3.5 w-3.5" /> : index + 1}
            </span>
            <span
              className={`ml-2 text-xs font-semibold ${
                step.done
                  ? "text-gray-400 dark:text-gray-500"
                  : isCurrent
                    ? "text-gray-900 dark:text-white"
                    : "text-gray-400 dark:text-gray-500"
              }`}
            >
              {step.label}
            </span>
            {index < steps.length - 1 ? (
              <span
                aria-hidden="true"
                className={`mx-3 h-px flex-1 ${
                  step.done ? "bg-member-green/40" : "bg-gray-200 dark:bg-gray-700"
                }`}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function Field({ label, children, hint }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold text-gray-700 dark:text-gray-300">
        {label}
      </span>
      {children}
      {hint ? (
        <span className="mt-1 block text-[11px] text-gray-500">{hint}</span>
      ) : null}
    </label>
  );
}

// Per DESIGN.md: gray-50 at rest, brightening to white on focus, hairline
// border, rounded-lg, 2px accent focus ring.
const inputClass =
  "w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-900 transition-colors placeholder:text-gray-400 focus:border-primary focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/50 dark:border-gray-700 dark:bg-gray-800 dark:text-white";

function ErrorText({ children }) {
  if (!children) return null;
  return (
    <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800 dark:border-red-900 dark:bg-red-900/30 dark:text-red-300">
      {children}
    </p>
  );
}

function SubmitButton({ busy, children }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="w-full rounded-lg bg-member-green px-6 py-2.5 text-sm font-bold text-white shadow-sm transition-all hover:bg-[#154718] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:min-w-[11rem]"
    >
      {busy ? "Working…" : children}
    </button>
  );
}

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session?.access_token || ""}`,
  };
}

/* ------------------------------------------------------------------- steps */

function EmailStep({ currentEmail, onDone }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const requestOtp = async (e) => {
    e.preventDefault();
    setErr("");
    if (!EMAIL_RE.test(email.trim())) {
      setErr("Enter a valid email address.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/account/email/request-otp`, {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({ new_email: email.trim().toLowerCase() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.detail || "Could not send the code.");
      setSent(true);
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  };

  const confirmOtp = async (e) => {
    e.preventDefault();
    setErr("");
    if (!/^\d{6}$/.test(code)) {
      setErr("Enter the 6-digit code.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/account/email/confirm`, {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({ code }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.detail || "Invalid code.");
      try { await supabase.auth.refreshSession(); } catch { /* non-fatal */ }
      await onDone();
    } catch (e2) {
      setErr(e2.message);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={sent ? confirmOtp : requestOtp}>
      <p className="text-sm font-bold text-gray-900 dark:text-white">
        Set your email address
      </p>
      <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
        Your account uses the system-generated address{" "}
        <span className="font-mono">{currentEmail}</span>. Add a real email so
        you can receive verification codes and notices.
      </p>

      {!sent ? (
        <>
          <div className="mt-4 sm:max-w-sm">
          <Field label="New email address">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              className={inputClass}
              autoComplete="email"
            />
          </Field>
          </div>
          <ErrorText>{err}</ErrorText>
          <div className="mt-4">
            <SubmitButton busy={busy}>Send verification code</SubmitButton>
          </div>
        </>
      ) : (
        <>
          <div className="mt-4 sm:max-w-xs">
          <Field
            label="6-digit code"
            hint={`Sent to ${email.trim().toLowerCase()}.`}
          >
            <input
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="123456"
              className={`${inputClass} tracking-[0.3em]`}
            />
          </Field>
          </div>
          <ErrorText>{err}</ErrorText>
          <div className="mt-4">
            <SubmitButton busy={busy}>Verify and save</SubmitButton>
          </div>
          <button
            type="button"
            onClick={() => { setSent(false); setCode(""); setErr(""); }}
            className="mt-2 w-full text-xs font-semibold text-gray-500 hover:text-gray-700"
          >
            Use a different email
          </button>
        </>
      )}
    </form>
  );
}

function PasswordStep({ currentEmail, onDone }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setErr("");

    const ruleError = getPasswordRequirementError(next);
    if (ruleError) { setErr(ruleError); return; }
    if (next !== confirm) { setErr("The new passwords do not match."); return; }
    if (next === current) {
      setErr("Your new password must differ from the temporary one.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/account/password/change-direct`, {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({ current_password: current, new_password: next }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.detail || "Unable to update password.");

      // Changing the password through Supabase's admin API revokes this
      // user's existing refresh tokens, so the access token sitting in the
      // browser is dead the moment the call succeeds. Without re-establishing
      // the session here, the very next security-status request 401s and the
      // gate reports "Could not verify your account" -- even though the change
      // worked (which is why it came right after a restart/re-login).
      //
      // refreshSession() cannot help: the refresh token is revoked too. Sign
      // in again with the password we just set.
      const { data: reauth, error: reauthError } = await supabase.auth.signInWithPassword({
        email: currentEmail,
        password: next,
      });
      if (reauthError || !reauth?.session?.access_token) {
        // The password DID change; only the in-memory session could not be
        // re-established. Rather than dead-ending on an error the member can do
        // nothing about, reload: that rebuilds every cache from the session
        // Supabase persisted, which is the new one. Same tab, and the client
        // uses sessionStorage with persistSession, so they stay signed in.
        //
        // This is the fallback, not the mechanism -- the token hand-off below
        // is the normal path and avoids the reload entirely.
        invalidateSecurityStatus();
        window.location.reload();
        return;
      }

      // Hand the freshly-minted token straight to the status refetch. Going
      // back through supabase.auth.getSession() is unreliable here: it reads
      // the persisted session, which can still be the pre-change one for a
      // moment after sign-in resolves, so the gate would re-check with the
      // revoked token and 401 again -- the exact failure this is fixing.
      await onDone(reauth.session.access_token);
    } catch (e2) {
      setErr(e2.message);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <p className="text-sm font-bold text-gray-900 dark:text-white">
        Change your password
      </p>
      <p className="mt-1 text-xs leading-relaxed text-gray-600 dark:text-gray-400">
        Your account is still on the temporary password issued by the
        cooperative. Choose one only you know.
      </p>

      <div className="mt-4 space-y-3">
        <Field label="Temporary password">
          <PasswordInput
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            placeholder="Enter your current password"
            className={inputClass}
            autoComplete="current-password"
          />
        </Field>

        {/* New + Confirm sit side by side: they are a pair, same length, and
            pairing them keeps the requirements list directly under the field
            it describes instead of stranded in a half-empty column. */}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="New password">
            <PasswordInput
              value={next}
              onChange={(e) => setNext(e.target.value)}
              placeholder="At least 8 characters"
              className={inputClass}
              autoComplete="new-password"
            />
          </Field>
          <Field label="Confirm new password">
            <PasswordInput
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Repeat new password"
              className={inputClass}
              autoComplete="new-password"
            />
          </Field>
        </div>

        <PasswordRequirements password={next} />
      </div>

      <ErrorText>{err}</ErrorText>
      <div className="mt-5">
        <SubmitButton busy={busy}>Update password</SubmitButton>
      </div>
    </form>
  );
}

