import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Moon, Sun, Bell, Lock, Smartphone, ChevronRight } from 'lucide-react';
import { useTheme } from '../../contex/ThemeContext';

// Upgraded Premium Toggle Component
const Toggle = ({ enabled, onToggle }) => (
  <button
    onClick={onToggle}
    aria-pressed={enabled}
    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-300 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D6021] focus-visible:ring-offset-2 ${
      enabled ? 'bg-[#1D6021]' : 'bg-gray-200 dark:bg-gray-700'
    }`}
  >
    <span
      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-300 ease-in-out ${
        enabled ? 'translate-x-5' : 'translate-x-0'
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

  // Close on Escape key press
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

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
      {/* Backdrop with frosted glass effect */}
      {isOpen && (
        <button
          aria-label="Close settings"
          onClick={onClose}
          className="fixed inset-0 z-40 bg-gray-900/40 backdrop-blur-sm transition-opacity cursor-default"
        />
      )}

      {/* Drawer Panel */}
      <div
        className={`fixed inset-y-0 right-0 z-50 w-full max-w-sm bg-[#F8F9FA] dark:bg-gray-950 shadow-2xl border-l border-gray-200 dark:border-gray-800 transform transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] flex flex-col ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 shrink-0">
          <div>
            <h2 className="text-xl font-extrabold text-gray-900 dark:text-white tracking-tight">Settings</h2>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mt-0.5">Preferences & Account</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          
          {/* Group 1: Appearance */}
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3 ml-1">
              Appearance
            </p>
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
              <div className="flex items-center justify-between p-4">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center flex-shrink-0 border border-indigo-100 dark:border-indigo-800/50">
                    {isDark ? (
                      <Moon className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    ) : (
                      <Sun className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-900 dark:text-white">Theme Mode</p>
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mt-0.5">
                      {isDark ? 'Dark mode activated' : 'Light mode activated'}
                    </p>
                  </div>
                </div>
                <Toggle enabled={isDark} onToggle={toggleTheme} />
              </div>
            </div>
          </div>

          {/* Group 2: Notifications */}
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3 ml-1">
              Notifications
            </p>
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm divide-y divide-gray-100 dark:divide-gray-800">
              
              <div className="flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-green-50 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0 border border-green-100 dark:border-green-800/50">
                    <Bell className="w-5 h-5 text-[#1D6021] dark:text-green-400" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-900 dark:text-white">Due Date Reminders</p>
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mt-0.5">Alert 3 days before</p>
                  </div>
                </div>
                <Toggle enabled={dueDateReminders} onToggle={toggleDueDateReminders} />
              </div>

              <div className="flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0 border border-blue-100 dark:border-blue-800/50">
                    <Smartphone className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-900 dark:text-white">Loan Status</p>
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mt-0.5">Approval & release alerts</p>
                  </div>
                </div>
                <Toggle enabled={loanStatusUpdates} onToggle={toggleLoanStatusUpdates} />
              </div>

            </div>
          </div>

          {/* Group 3: Account Security */}
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3 ml-1">
              Account Security
            </p>
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
              <button
                onClick={handleChangePassword}
                className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left group"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0 border border-amber-100 dark:border-amber-800/50">
                    <Lock className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-900 dark:text-white">Change Password</p>
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mt-0.5">Update credentials securely</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors" />
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shrink-0 text-center">
          <p className="text-xs font-bold text-gray-400 dark:text-gray-500">TTMPC Member Portal v2.0</p>
        </div>
      </div>
    </>
  );
};

export default SettingsDrawer;