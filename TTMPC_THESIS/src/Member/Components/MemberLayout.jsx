import { Outlet } from 'react-router-dom';
import MemberOnboardingGuard from './MemberOnboardingGuard';
import MemberMobileNav from './MemberMobileNav';

// Shared shell for every Member-portal route. Rendering MemberMobileNav here
// — once, alongside the routed page content — instead of inside each page
// keeps it mounted across navigation, so its sliding tab indicator has a
// continuous element to animate between instead of unmounting and
// re-mounting (and only ever snapping) on every route change.
const MemberLayout = () => (
  <MemberOnboardingGuard>
    <Outlet />
    <MemberMobileNav />
  </MemberOnboardingGuard>
);

export default MemberLayout;
