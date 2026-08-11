import React, { useState, useCallback } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Activity,
  Receipt,
  History,
  CreditCard,
  Users,
} from 'lucide-react';

const NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, to: '/member-dashboard' },
  { key: 'loans',     label: 'Loans',     icon: Activity,        to: '/member-loans' },
  { key: 'statement', label: 'Statement', icon: Receipt,         to: '/member-statement-of-account' },
  { key: 'lifecycle', label: 'Lifecycle', icon: History,         to: '/member-lifecycle' },
  { key: 'savings',   label: 'Savings',   icon: CreditCard,      to: '/member-savings' },
  { key: 'profile',   label: 'Profile',   icon: Users,           to: '/members-profile' },
];

const MemberMobileNav = () => {
  const [tappedKey, setTappedKey] = useState(null);

  const handleTap = useCallback((key) => {
    setTappedKey(key);
    // After the pop peaks, clear so the icon settles into its final active/inactive scale
    setTimeout(() => setTappedKey(null), 250);
  }, []);

  return (
    <nav className="fixed bottom-0 left-0 right-0 lg:hidden bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 px-2 py-2">
      <div className="max-w-lg mx-auto">
        <div className="flex items-center justify-around gap-1">
          {NAV_ITEMS.map(({ key, label, icon: Icon, to }) => (
            <NavLink
              key={key}
              to={to}
              onClick={() => handleTap(key)}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center px-2.5 py-2 rounded-full transition-colors duration-200 ease-out ${
                  isActive
                    ? 'bg-[#1D6021] text-white'
                    : 'text-gray-600 hover:text-[#1D6021] dark:text-gray-400 dark:hover:text-green-400'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    size={20}
                    strokeWidth={isActive ? 2.5 : 2}
                    style={{
                      marginBottom: '0.25rem',
                      transition: 'transform 200ms ease-out',
                      transform:
                        tappedKey === key
                          ? 'scale(1.25)'
                          : isActive
                          ? 'scale(1.12)'
                          : 'scale(1)',
                    }}
                  />
                  <span className="text-[10px] font-semibold">{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </div>
    </nav>
  );
};

export default MemberMobileNav;
