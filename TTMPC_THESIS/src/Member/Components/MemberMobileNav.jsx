import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  FileText,
  Activity,
  Receipt,
  History,
  Users,
} from 'lucide-react';
import { useTheme } from '../../contex/ThemeContext';

const NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, to: '/member-dashboard' },
  { key: 'apply',     label: 'Apply',     icon: FileText,       to: '/member-apply-loans' },
  { key: 'loans',     label: 'Loans',     icon: Activity,        to: '/member-loans' },
  { key: 'statement', label: 'Statement', icon: Receipt,         to: '/member-statement-of-account' },
  { key: 'lifecycle', label: 'Lifecycle', icon: History,         to: '/member-lifecycle' },
  { key: 'profile',   label: 'Profile',   icon: Users,           to: '/members-profile' },
];

// One easing for the whole system — a long, gentle glide with no bounce-back,
// so the indicator, the glow, and the color crossfade all read as one motion.
const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';
const GLIDE_MS = 480;

const MemberMobileNav = () => {
  const [tappedKey, setTappedKey] = useState(null);
  const { isDark } = useTheme();
  const { pathname } = useLocation();
  const containerRef = useRef(null);
  const indicatorRef = useRef(null);
  const iconRefs = useRef({});
  const hasPlacedRef = useRef(false);

  const glow = isDark ? 'rgba(74, 222, 128, 0.65)' : 'rgba(29, 96, 33, 0.5)';
  const indicatorColor = isDark ? 'var(--color-member-green-dark)' : 'var(--color-member-green)';

  // Index of the item matching the current route, or -1 when the visitor is
  // somewhere the bottom nav doesn't track (e.g. Savings) — the line fades
  // out instead of falsely resting on Dashboard.
  const activeIndex = NAV_ITEMS.findIndex((item) => pathname.startsWith(item.to));
  const activeKey = activeIndex === -1 ? null : NAV_ITEMS[activeIndex].key;

  // Measures the real rendered position of the active icon — not a guessed
  // column fraction — so the line locks to the icon regardless of how wide
  // its neighbors' labels are ("Statement" vs "Apply"). Mutates the DOM node
  // directly (no setState) so the CSS `transition` on it does the animating;
  // this is purely a visual sync, not React-owned state.
  const measure = useCallback(() => {
    const container = containerRef.current;
    const bar = indicatorRef.current;
    const iconEl = activeKey ? iconRefs.current[activeKey] : null;
    if (!container || !bar) return;

    // This component remounts fresh on every page navigation (each page
    // renders its own <MemberMobileNav />), so the very first placement on
    // mount isn't a real "move" — without this, the browser still treats
    // the initial JSX value and this override as two separate style commits
    // and animates between them, replaying a slide-in from the edge on
    // every navigation. Snap instantly the first time; glide on every
    // change after that.
    if (!hasPlacedRef.current) {
      bar.style.transition = 'none';
    }

    if (!iconEl) {
      bar.style.opacity = '0';
    } else {
      const containerRect = container.getBoundingClientRect();
      const iconRect = iconEl.getBoundingClientRect();
      const center = iconRect.left - containerRect.left + iconRect.width / 2;
      bar.style.left = `${center}px`;
      bar.style.opacity = '1';
    }

    if (!hasPlacedRef.current) {
      // Force layout so the transition:none above actually takes effect
      // before it's restored, instead of batching with the next frame.
      void bar.offsetWidth;
      bar.style.transition = `left ${GLIDE_MS}ms ${EASE}, opacity 220ms ${EASE}`;
      hasPlacedRef.current = true;
    }
  }, [activeKey]);

  useLayoutEffect(() => {
    measure();
  }, [measure]);

  useEffect(() => {
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  const handleTap = useCallback((key) => {
    setTappedKey(key);
    // After the pop peaks, clear so the icon settles into its final active/inactive scale
    setTimeout(() => setTappedKey(null), 260);
  }, []);

  return (
    <nav className="fixed bottom-0 left-0 right-0 lg:hidden bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 px-2 py-2">
      <div className="max-w-lg mx-auto">
        <div ref={containerRef} className="relative flex items-center justify-around gap-1">
          {/* Sliding indicator line — rests on the top border, glides to sit exactly over the active icon */}
          <div
            ref={indicatorRef}
            aria-hidden="true"
            className="absolute h-[3px] w-7 rounded-full motion-reduce:!transition-none"
            style={{
              top: '-9px',
              left: 0,
              transform: 'translateX(-50%)',
              background: indicatorColor,
              boxShadow: `0 0 6px ${glow}`,
              opacity: 0,
              willChange: 'left',
              transition: `left ${GLIDE_MS}ms ${EASE}, opacity 220ms ${EASE}`,
            }}
          />

          {NAV_ITEMS.map((item) => {
            const { key, label, to } = item;
            const Icon = item.icon;
            return (
              <NavLink
                key={key}
                to={to}
                onClick={() => handleTap(key)}
                className={({ isActive }) =>
                  `flex flex-col items-center justify-center px-2.5 py-2 transition-colors duration-300 ${
                    isActive
                      ? 'text-member-green dark:text-green-400'
                      : 'text-gray-600 hover:text-member-green dark:text-gray-400 dark:hover:text-green-400'
                  }`
                }
                style={{ transitionTimingFunction: EASE }}
              >
                {({ isActive }) => (
                  <>
                    <span
                      ref={(el) => { iconRefs.current[key] = el; }}
                      className="inline-flex"
                    >
                      <Icon
                        size={20}
                        strokeWidth={isActive ? 2.5 : 2}
                        className="motion-reduce:!transition-none"
                        style={{
                          marginBottom: '0.25rem',
                          transition: `transform 320ms ${EASE}, filter 320ms ${EASE}`,
                          transform:
                            tappedKey === key
                              ? 'scale(1.22)'
                              : isActive
                              ? 'scale(1.12)'
                              : 'scale(1)',
                          filter: isActive ? `drop-shadow(0 0 7px ${glow})` : 'none',
                        }}
                      />
                    </span>
                    <span
                      className="text-[10px] font-semibold motion-reduce:!transition-none"
                      style={{
                        transition: `text-shadow 320ms ${EASE}`,
                        textShadow: isActive ? `0 0 8px ${glow}` : 'none',
                      }}
                    >
                      {label}
                    </span>
                  </>
                )}
              </NavLink>
            );
          })}
        </div>
      </div>
    </nav>
  );
};

export default MemberMobileNav;
