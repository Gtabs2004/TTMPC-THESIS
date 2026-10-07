// Shared class strings + error mapping for the sign-in pages (see AuthLayout.jsx).

export const authInputClass =
  'block w-full pl-10 pr-3 h-11 rounded-lg border border-gray-300 bg-white text-sm text-gray-900 ' +
  'placeholder-gray-500 transition-colors focus:outline-none focus:border-[#66B538] focus:ring-2 focus:ring-[#66B538]/40 ' +
  'disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed ' +
  'aria-[invalid=true]:border-red-500 aria-[invalid=true]:focus:ring-red-500/30';

export const authLabelClass = 'block text-sm font-semibold text-gray-700';

// Maps raw auth errors to calm, user-facing copy. Anything we don't recognise
// (including raw Supabase text) becomes the generic message instead of leaking.
export function friendlyAuthError(raw) {
  const msg = String(raw || '');
  if (/invalid login credentials|invalid email or password|invalid credentials/i.test(msg)) {
    return 'Please check your email and password and try again.';
  }
  if (/failed to fetch|network|timeout/i.test(msg)) {
    return 'We could not reach the server. Check your connection and try again.';
  }
  if (/too many|rate limit|over_request_rate/i.test(msg)) {
    return 'Too many attempts. Please wait a moment and try again.';
  }
  if (/banned|deactivated|suspended/i.test(msg)) {
    return 'This account is no longer active. Please contact the cooperative office.';
  }
  if (/unable to load account role|profile is missing/i.test(msg)) {
    return 'We could not load your account. Please contact the cooperative office.';
  }
  // Our own portal/role messages are already user-friendly.
  if (/^(This account is for|This role is not allowed|Selected role does not match)/.test(msg)) {
    return msg;
  }
  return 'Something went wrong while signing in. Please try again.';
}
