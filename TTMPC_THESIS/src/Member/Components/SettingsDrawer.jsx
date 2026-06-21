import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Moon, Sun, Bell, Lock } from 'lucide-react';
import { useTheme } from '../../contex/ThemeContext';

const Toggle = ({ enabled, onToggle }) => (
  <button
    onClick={onToggle}
    aria-pressed={enabled}
    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
      enabled ? 'bg-[#1D6021]' : 'bg-gray-300 dark:bg-gray-600'
    }`}
  >
    <span
      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
        enabled ? 'translate-x-6' : 'translate-x-1'
      }`}
    />
  </button>
);

const SettingsDrawer = ({ isOpen, onClose }) => {
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const [dueDateReminders, setDueDateReminders] = useState(
    () => localStorage.getItem('notif_due_date') !== 'false'
  );
  const [loanStatusUpdates, setLoanStatusUpdates] = useState(
    () => localStorage.getItem('notif_loan_status') !== 'false'
  );

  const toggleDueDateReminders = () => {
    setDueDateReminders((prev) => {
      const next = !prev;
      localStorage.setItem('notif_due_date', String(next));
      return next;
    });
  };

  const toggleLoanStatusUpdates = () => {
    setLoanStatusUpdates((prev) => {
      const next = !prev;
      localStorage.setItem('notif_loan_status', String(next));
      return next;
    });
  };

  const handleChangePassword = () => {
    onClose();
    navigate('/members-profile');
  };

  return (
    <>
      {isOpen && (
        <button
          aria-label="Close settings"
          onClick={onClose}
          className="fixed inset-0 z-40 bg-black/30"
        />
      )}

      <div
        className={`fixed inset-y-0 right-0 z-50 w-80 bg-white dark:bg-gray-900 shadow-xl transform transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-base font-bold text-gray-800 dark:text-white">Settings</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-6">
          {/* Appearance */}
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-3">
              Appearance
            </p>
            <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
              <div className="flex items-center gap-3">
                {isDark ? (
                  <Moon className="w-4 h-4 text-indigo-400" />
                ) : (
                  <Sun className="w-4 h-4 text-yellow-500" />
                )}
                <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                  {isDark ? 'Dark Mode' : 'Light Mode'}
                </span>
              </div>
              <Toggle enabled={isDark} onToggle={toggleTheme} />
            </div>
          </div>

          {/* Notifications */}
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-3">
              Notifications
            </p>
            <div className="space-y-2">
              <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
                <div className="flex items-center gap-3">
                  <Bell className="w-4 h-4 text-[#1D6021]" />
                  <div>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Due Date Reminders</p>
                    <p className="text-[11px] text-gray-400 dark:text-gray-500">3 days before payment</p>
                  </div>
                </div>
                <Toggle enabled={dueDateReminders} onToggle={toggleDueDateReminders} />
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
                <div className="flex items-center gap-3">
                  <Bell className="w-4 h-4 text-[#1D6021]" />
                  <div>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Loan Status Updates</p>
                    <p className="text-[11px] text-gray-400 dark:text-gray-500">Approved, rejected, released</p>
                  </div>
                </div>
                <Toggle enabled={loanStatusUpdates} onToggle={toggleLoanStatusUpdates} />
              </div>
            </div>
          </div>

          {/* Account */}
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-3">
              Account
            </p>
            <button
              onClick={handleChangePassword}
              className="w-full flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left"
            >
              <Lock className="w-4 h-4 text-[#1D6021]" />
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Change Password</p>
                <p className="text-[11px] text-gray-400 dark:text-gray-500">Go to Member Profile</p>
              </div>
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default SettingsDrawer;
