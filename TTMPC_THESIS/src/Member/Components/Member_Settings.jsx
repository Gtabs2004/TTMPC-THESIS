import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Bell, ChevronRight, KeyRound, Mail, Moon, Sun } from "lucide-react";
import { useNotification } from "../../contex/NotificationContext";
import { useTheme } from "../../contex/ThemeContext";
import { authHeaders } from "../../utils/authHeaders";
import { apiErrorMessage } from "../../utils/apiError";
import ChangePasswordModal from "./ChangePasswordModal";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

// Must match NOTIFICATION_PREFERENCE_FIELDS in main.py.
const EMAIL_TOGGLES = [
  {
    key: "loan_review_emails",
    label: "Loan review updates",
    description: "When the Bookkeeper or Manager recommends, approves, returns or declines your loan application.",
  },
  {
    key: "loan_release_emails",
    label: "Loan release updates",
    description: "When your loan is ready to claim, released, or cancelled at release.",
  },
];

const SettingsRow = ({ icon, title, description, onClick }) => {
  const Icon = icon;
  return (
  <button
    type="button"
    onClick={onClick}
    className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
  >
    <div className="w-9 h-9 shrink-0 rounded-full bg-member-green/10 dark:bg-green-900/30 flex items-center justify-center">
      <Icon className="w-4 h-4 text-member-green dark:text-green-400" />
    </div>
    <div className="min-w-0 flex-1">
      <p className="text-sm font-bold text-gray-900 dark:text-white">{title}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400">{description}</p>
    </div>
    <ChevronRight className="w-4 h-4 shrink-0 text-gray-400" />
  </button>
  );
};

const Switch = ({ checked, disabled, onChange, labelledBy }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-labelledby={labelledBy}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
      checked ? "bg-member-green" : "bg-gray-300 dark:bg-gray-600"
    }`}
  >
    <span
      className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
        checked ? "translate-x-5" : "translate-x-0.5"
      }`}
    />
  </button>
);

export default function Member_Settings() {
  const navigate = useNavigate();
  const { addNotification } = useNotification();
  const { isDark, toggleTheme } = useTheme();
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [prefs, setPrefs] = useState(null);
  const [prefsError, setPrefsError] = useState("");
  const [savingKey, setSavingKey] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/member/notification-preferences`, {
          headers: { Accept: "application/json", ...(await authHeaders()) },
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || !body?.success) throw new Error(apiErrorMessage(body, "Could not load your notification settings."));
        if (!cancelled) setPrefs(body.data);
      } catch (err) {
        if (!cancelled) setPrefsError(err.message || "Could not load your notification settings.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Saved immediately; reverted if the server rejects it.
  const togglePreference = async (key, value) => {
    const previous = prefs;
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    setSavingKey(key);
    try {
      const res = await fetch(`${API_BASE}/api/member/notification-preferences`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Accept: "application/json", ...(await authHeaders()) },
        body: JSON.stringify(next),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.success) throw new Error(apiErrorMessage(body, "Could not save your notification settings."));
      setPrefs(body.data);
    } catch (err) {
      setPrefs(previous);
      addNotification(err.message || "Could not save your notification settings.", "error");
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <div className="animate-page-in p-6 sm:p-8 pb-28 lg:pb-8 max-w-2xl mx-auto">
      <button
        type="button"
        onClick={() => navigate("/members-profile")}
        className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> Back to profile
      </button>

      <h1 className="text-2xl font-extrabold text-[#1a4a2f] dark:text-green-400">Settings</h1>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 mb-6">Manage your sign-in, email and notifications.</p>

      <section className="mb-6">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">Account</h2>
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-sm overflow-hidden divide-y divide-gray-100 dark:divide-gray-800">
          <SettingsRow
            icon={KeyRound}
            title="Change Password"
            description="Update your password, or reset it with a code sent to your email."
            onClick={() => setShowPasswordModal(true)}
          />
          <SettingsRow
            icon={Mail}
            title="Change Email"
            description="Update the email address linked to your TTMPC account."
            onClick={() => navigate("/members-profile/change-email")}
          />
        </div>
      </section>

      <section className="mb-6">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">Appearance</h2>
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between gap-4 px-5 py-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 shrink-0 rounded-full bg-member-green/10 dark:bg-green-900/30 flex items-center justify-center">
                {isDark ? (
                  <Sun className="w-4 h-4 text-member-green dark:text-green-400" />
                ) : (
                  <Moon className="w-4 h-4 text-member-green dark:text-green-400" />
                )}
              </div>
              <div className="min-w-0">
                <p id="pref-dark-mode" className="text-sm font-bold text-gray-900 dark:text-white">Dark Mode</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Switch between light and dark appearance.</p>
              </div>
            </div>
            <Switch checked={isDark} onChange={toggleTheme} labelledBy="pref-dark-mode" />
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">Notifications</h2>
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 dark:border-gray-800">
            <div className="w-9 h-9 shrink-0 rounded-full bg-member-green/10 dark:bg-green-900/30 flex items-center justify-center">
              <Bell className="w-4 h-4 text-member-green dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900 dark:text-white">Email notifications</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Choose which loan updates are emailed to you.</p>
            </div>
          </div>

          {prefsError ? (
            <p role="alert" className="px-5 py-4 text-sm text-red-600 dark:text-red-400">{prefsError}</p>
          ) : !prefs ? (
            <p className="px-5 py-4 text-sm text-gray-500 dark:text-gray-400">Loading…</p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {EMAIL_TOGGLES.map((toggle) => (
                <li key={toggle.key} className="flex items-center justify-between gap-4 px-5 py-4">
                  <div className="min-w-0">
                    <p id={`pref-${toggle.key}`} className="text-sm font-semibold text-gray-800 dark:text-gray-200">{toggle.label}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{toggle.description}</p>
                  </div>
                  <Switch
                    checked={Boolean(prefs[toggle.key])}
                    disabled={savingKey !== null}
                    onChange={(value) => togglePreference(toggle.key, value)}
                    labelledBy={`pref-${toggle.key}`}
                  />
                </li>
              ))}
            </ul>
          )}

          <p className="px-5 py-3 bg-gray-50 dark:bg-gray-800/60 text-[11px] text-gray-500 dark:text-gray-400">
            Your in-app notification bell always stays on, and security codes (password or email changes) are always emailed.
          </p>
        </div>
      </section>

      <ChangePasswordModal
        open={showPasswordModal}
        onClose={() => setShowPasswordModal(false)}
        onChanged={() => {
          setShowPasswordModal(false);
          addNotification("Password updated successfully.", "success");
        }}
      />
    </div>
  );
}
