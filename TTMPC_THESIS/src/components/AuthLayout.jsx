import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, AlertCircle, Loader2, PiggyBank, HandCoins, Users, ShieldCheck } from 'lucide-react';

// Shared shell + form primitives for the Staff (login.jsx) and Member
// (memberlogin.jsx) sign-in pages. Presentation only — no auth logic here.
//
// Light-only on purpose: the sign-in pages do not use dark: variants, so the
// global .dark class (persisted by the Member theme toggle) never affects them.
//
// The button green is deliberately a shade darker than the brand #66B538:
// white text on #66B538 is ~2.6:1 (fails WCAG AA); on #3A7D1C it is ~5:1.
// #66B538 stays as the accent (focus rings, decorative elements, links' hover).

export function AuthError({ message, id = 'auth-error' }) {
  if (!message) return null;
  return (
    <div
      id={id}
      role="alert"
      className="auth-rise flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3"
    >
      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" aria-hidden="true" />
      <div>
        <p className="text-sm font-semibold text-red-800">Unable to sign in</p>
        <p className="mt-0.5 text-sm text-red-700">{message}</p>
      </div>
    </div>
  );
}

// Eases toward 90% while sign-in is pending. Mounted only while loading, so it
// restarts each attempt; the page navigates away on success.
function AuthProgress() {
  const [progress, setProgress] = useState(8);
  useEffect(() => {
    const id = setInterval(() => {
      setProgress((p) => (p >= 90 ? p : Math.min(90, p + (p < 40 ? 6 : p < 70 ? 3 : 1))));
    }, 220);
    return () => clearInterval(id);
  }, []);
  return (
    <div
      role="progressbar"
      aria-label="Signing in"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={progress}
      className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-gray-200"
    >
      <div
        className="h-full rounded-full bg-[#66B538] transition-all duration-200 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}

export function AuthSubmitButton({ loading, children, loadingText = 'Signing in...' }) {
  return (
    <div>
    <button
      type="submit"
      disabled={loading}
      aria-busy={loading}
      className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#3A7D1C] px-4 text-sm font-semibold text-white shadow-[0_6px_16px_-6px_rgba(58,125,28,0.55)] transition-[background-color,transform] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-[#2F6616] active:translate-y-px active:scale-[0.98] active:bg-[#265411] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#66B538] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-[#3A7D1C]/70"
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {loading ? loadingText : children}
    </button>
    {loading && <AuthProgress />}
    </div>
  );
}

const highlights = [
  { icon: Users, label: 'Membership' },
  { icon: HandCoins, label: 'Loans' },
  { icon: PiggyBank, label: 'Savings' },
];

function BrandPanel({ variant = 'default' }) {
  const isStaff = variant === 'staff';

  return (
    <aside className={`auth-slide relative hidden overflow-hidden md:flex md:flex-col md:items-center md:text-center ${isStaff ? 'justify-start bg-[#eaf6df] px-8 pt-12 lg:px-10 lg:pt-14' : 'justify-center bg-[#EAF6E1] md:p-10 lg:p-12'}`}>
      {isStaff ? (
        <>
          <img
            src="/assets/img/bg-login.webp"
            alt=""
            aria-hidden="true"
            className="auth-staff-art absolute inset-0 h-full w-full object-cover object-center"
          />
          <div className="relative z-10 flex flex-col items-center gap-3 pt-1">
            <img src="/img/ttmpc logo.png" alt="TTMPC Logo" className="h-24 w-auto drop-shadow-sm lg:h-28" />
            <p className="max-w-[18rem] text-sm font-semibold leading-snug text-[#1f7d26]">
              Tubungan Teachers Multi-Purpose Cooperative
            </p>
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.24em] text-[#238527]">
              Staff &amp; Member Portal
            </p>
          </div>
        </>
      ) : (
        <>
          {/* Decorative layer — purely visual, hidden from assistive tech */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            <div className="absolute -left-24 -top-24 h-80 w-80 rounded-full bg-[#66B538]/15 blur-3xl" />
            <div className="absolute -bottom-32 -right-20 h-96 w-96 rounded-full bg-[#66B538]/20 blur-3xl" />
            <svg className="absolute inset-0 h-full w-full text-[#3A7D1C]/[0.07]" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="auth-grid" width="48" height="48" patternUnits="userSpaceOnUse">
                  <circle cx="2" cy="2" r="1.5" fill="currentColor" />
                  <path d="M2 2 L50 50" stroke="currentColor" strokeWidth="0.6" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#auth-grid)" />
            </svg>
            <svg
              className="absolute -bottom-10 -right-10 w-[28rem] max-w-none text-[#66B538]/25"
              viewBox="0 0 400 400"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="200" cy="200" r="60" />
              <circle cx="200" cy="200" r="110" />
              <circle cx="200" cy="200" r="160" />
              <circle cx="200" cy="200" r="195" strokeDasharray="4 8" />
            </svg>
          </div>

          <div className="relative flex flex-col items-center gap-3">
            <img src="/img/ttmpc logo.png" alt="TTMPC Logo" className="h-28 w-auto drop-shadow-sm" />
            <p className="max-w-[18rem] text-sm font-semibold leading-snug text-[#1f7d26]">
              Tubungan Teachers Multi-Purpose Cooperative
            </p>
          </div>

          <div className="relative mt-10 max-w-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#238527]">
              Staff &amp; Member Portal
            </p>
          <h1 className="mt-4 text-4xl font-semibold leading-[1.08] tracking-tight text-gray-900 lg:text-[2.75rem]">
            Smarter.
            <br />
            <span className="text-[#3A7D1C]">Secure.</span>
            <br />
            Connected.
          </h1>
          <p className="mx-auto mt-5 max-w-[34ch] text-[15px] leading-relaxed text-gray-600">
            Manage your membership, loans, savings, and cooperative transactions in one secure platform.
          </p>
          <ul className="mt-8 flex items-center justify-center divide-x divide-[#66B538]/30 text-sm font-medium text-gray-700">
            {highlights.map((item) => (
              <li key={item.label} className="flex items-center gap-2 px-4 first:pl-0 last:pr-0">
                {React.createElement(item.icon, { className: 'h-4 w-4 text-[#3A7D1C]', 'aria-hidden': true })}
                {item.label}
              </li>
            ))}
          </ul>
          </div>
        </>
      )}

    
    </aside>
  );
}

// Phone/tablet version of the staff brand panel (the side panel is hidden below
// md): the illustration as a banner with the logo and name centred over it. A
// light veil in the panel colour keeps the text readable and lets the building
// show through. Tune the crop with objectPosition (higher = lower in the
// picture) and the banner height.
function MobileBanner() {
  return (
    <header className="relative h-40 overflow-hidden bg-[#eaf6df] sm:h-48 md:hidden">
      <img
        src="/assets/img/bg-login.webp"
        alt=""
        aria-hidden="true"
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover"
        style={{ objectPosition: '50% 85%' }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{ background: 'linear-gradient(to bottom, rgba(234,246,223,0.9) 0%, rgba(234,246,223,0.78) 50%, rgba(234,246,223,0.55) 100%)' }}
      />
      <div className="relative z-10 flex h-full flex-col items-center justify-center px-6 text-center">
        <img src="/img/ttmpc logo.png" alt="TTMPC Logo" className="h-12 w-auto drop-shadow-sm" />
        <p className="mt-2 text-sm font-semibold leading-snug text-[#1f7d26]">
          Tubungan Teachers Multi-Purpose Cooperative
        </p>
        <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#238527]">
          Smarter. Secure. Connected.
        </p>
      </div>
    </header>
  );
}

/**
 * @param {string} title     Heading above the form (default "Welcome back!")
 * @param {string} subtitle  Sub-line under the heading
 * @param {ReactNode} children  The <form>
 * @param {ReactNode} footer  Optional links below the card
 */
export default function AuthLayout({
  title = 'Welcome back!',
  subtitle = 'Sign in to access your TTMPC account.',
  children,
  footer,
  variant = 'default',
}) {
  return (
    <div className={`flex min-h-screen items-center justify-center bg-gradient-to-br from-[#CFE8C4] via-[#E4F2DC] to-[#F1F7EC] p-4 font-[Poppins,sans-serif] sm:p-8`}>
      <style>{`
        @keyframes authSlide { from { opacity: 0; transform: translateX(-16px); } to { opacity: 1; transform: none; } }
        @keyframes authRise  { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
        .auth-slide { animation: authSlide .45s cubic-bezier(0.16, 1, 0.3, 1) both; }
        .auth-rise  { animation: authRise .4s cubic-bezier(0.16, 1, 0.3, 1) both; }
        .auth-staff-art {
          image-rendering: auto;
        }
        .auth-rise-2 { animation: authRise .4s .08s cubic-bezier(0.16, 1, 0.3, 1) both; }
        /* Keep browser autofill from tinting the fields blue/yellow. */
        .auth-fields input:-webkit-autofill,
        .auth-fields input:-webkit-autofill:hover,
        .auth-fields input:-webkit-autofill:focus {
          -webkit-box-shadow: 0 0 0 1000px #fff inset;
          -webkit-text-fill-color: #111827;
          caret-color: #111827;
        }
        @media (prefers-reduced-motion: reduce) {
          .auth-slide, .auth-rise, .auth-rise-2 { animation: none; }
        }
      `}</style>

      <div className={`auth-rise grid w-full max-w-5xl overflow-hidden rounded-3xl bg-white shadow-[0_20px_60px_rgba(30,80,30,0.15)] md:min-h-[36rem] md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] ${variant === 'staff' ? 'md:max-w-[56rem] md:min-h-[37rem] md:grid-cols-[minmax(0,1fr)_minmax(0,1.12fr)]' : ''}`}>
        <BrandPanel variant={variant} />

        {/* Below md the brand panel is hidden: the staff/member pages get the
            illustration as a banner, other variants a compact logo block. */}
        {variant === 'staff' && <MobileBanner />}

        <main className="flex flex-col justify-center px-6 py-10 sm:px-12 md:py-12 lg:px-16">
          {variant !== 'staff' && (
            <div className="mb-6 flex flex-col items-center text-center md:hidden">
              <img src="/img/ttmpc logo.png" alt="TTMPC Logo" className="h-16 w-auto" />
              <p className="mt-3 text-sm font-semibold text-gray-800">
                Tubungan Teachers Multi-Purpose Cooperative
              </p>
              <p className="mt-0.5 text-xs text-gray-500">Smarter. Secure. Connected.</p>
            </div>
          )}

          <div className="auth-rise-2 auth-fields mx-auto w-full max-w-sm">
            <Link
              to="/"
              className="-ml-1 mb-6 inline-flex items-center gap-1.5 rounded-md px-1 py-1 text-sm font-medium text-gray-600 transition-colors hover:text-[#2F6616] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#66B538]"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back to home
            </Link>
            <h2 className="text-[1.75rem] font-semibold leading-tight tracking-tight text-gray-900">{title}</h2>
            <p className="mt-2 text-sm text-gray-600">{subtitle}</p>
            <div className="mt-8">{children}</div>
            {footer && <div className="mt-5 text-center text-sm text-gray-600">{footer}</div>}
          </div>
        </main>
      </div>
    </div>
  );
}
