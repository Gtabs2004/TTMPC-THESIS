import { useLayoutEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useTheme } from '../../contex/ThemeContext';
import MemberOnboardingGuard from './MemberOnboardingGuard';
import MemberMobileNav from './MemberMobileNav';

// Shared shell for every Member-portal route. Rendering MemberMobileNav here
// — once, alongside the routed page content — instead of inside each page
// keeps it mounted across navigation, so its sliding tab indicator has a
// continuous element to animate between instead of unmounting and
// re-mounting (and only ever snapping) on every route change.
//
// It also owns the dark-mode class: `dark` goes on <html> only while a Member
// page is mounted and is removed on the way out, so the preference never
// leaks into the staff portals (which have no dark styling).
const MemberLayout = () => {
  const { isDark } = useTheme();

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', Boolean(isDark));
    return () => root.classList.remove('dark');
  }, [isDark]);

  return (
    <MemberOnboardingGuard>
      <Outlet />
      <MemberMobileNav />
    </MemberOnboardingGuard>
  );
};

export default MemberLayout;
