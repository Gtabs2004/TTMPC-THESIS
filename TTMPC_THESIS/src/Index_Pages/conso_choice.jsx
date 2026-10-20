import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UserAuth } from '../contex/AuthContext';
import { Wallet, Landmark, ChevronRight, Lock } from 'lucide-react';
import { fetchLoanPrefill } from '../LOANFORMS/loanSubmission';

// The "> 500k" range opens only when 300% of the member's share capital
// exceeds ₱500,000 (same exclusive threshold as the BOD routing rule).
const OVER_500K_THRESHOLD = 500000;
const SHARE_CAPITAL_MULTIPLIER = 3;

const Conso_Choice = () => {
  const { session, signOut } = UserAuth();
  const navigate = useNavigate();
  const [upEligibility, setUpEligibility] = useState({ loading: true, eligible: false, reason: '' });

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const { profile } = await fetchLoanPrefill();
        if (!isMounted) return;
        const shareCapital = Number(profile?.share_capital || 0);
        const loanable = shareCapital * SHARE_CAPITAL_MULTIPLIER;
        const eligible = loanable > OVER_500K_THRESHOLD;
        const peso = (n) => n.toLocaleString('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 });
        setUpEligibility({
          loading: false,
          eligible,
          reason: eligible
            ? ''
            : `300% of your share capital (${peso(loanable)}) must be above ₱500,000`,
        });
      } catch {
        if (isMounted) setUpEligibility({ loading: false, eligible: false, reason: 'Unable to verify eligibility' });
      }
    })();
    return () => { isMounted = false; };
  }, []);

  const handleSignOut = async (e) => {
    e.preventDefault();
    try {
      await signOut();
      navigate("/");
    } catch (err) {
      console.error("Failed to sign out:", err);
    }
  };

  const cardBase =
    'group relative w-full sm:w-72 rounded-3xl flex flex-col items-center justify-center p-6 sm:p-8 border transition-all duration-200';

  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-b from-[#F4FAEE] to-[#F8FAFC]">

      <header className="w-full bg-[#E9F7DE] min-h-20 shadow-lg flex px-4 py-3 sm:px-6">
        <div className="flex w-full flex-col items-start justify-between gap-3 sm:flex-row sm:items-center sm:gap-4">
          <div className="flex min-w-0 flex-row items-center gap-3 sm:gap-4">
            <img src="/img/ttmpc logo.png" alt="Logo" className="h-12 w-auto" />
            <div className="min-w-0 flex flex-col">
              <h1 className="break-words text-xs font-bold text-primary-deep sm:text-sm">Tubungan Teacher's Multi‑Purpose Cooperative</h1>
              <p className="text-[#A0D284] text-xs">Loan Application Kiosk</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate('/member-apply-loans')}
            className="w-full rounded-lg bg-white px-4 py-2 text-xs font-bold text-member-green shadow-sm border border-[#D5EDB9] hover:bg-[#F4FBF0] sm:w-auto"
          >
            Back to Member Portal
          </button>
        </div>
      </header>

      <main className="flex flex-col items-center flex-grow py-6 px-4 text-center sm:py-10">

        <div className="mb-8 flex flex-col items-center">
          <img src="/img/ttmpc logo.png" className="w-auto h-20 md:h-24 mb-4 drop-shadow-sm" alt="Kiosk Logo" />
          <span className="text-[11px] font-bold text-[#66B538] bg-[#E9F7DE] px-3 py-1 rounded-full uppercase tracking-widest mb-3">
            Consolidated Loan Application
          </span>
          <h1 className="text-2xl md:text-4xl font-extrabold text-gray-900 tracking-tight">
            Preferred Loan Amount
          </h1>
          <p className="mt-3 text-gray-500 text-sm md:text-base font-medium max-w-md">
            Choose the loan range that fits your needs to get started with the right application.
          </p>
        </div>

        <div className="flex w-full max-w-2xl flex-col items-stretch justify-center gap-4 sm:flex-row sm:gap-6">

          <Link
            to="/Consolidated_Loan"
            className={`${cardBase} bg-white border-gray-200 shadow-sm hover:shadow-lg hover:-translate-y-1 hover:border-blue-300`}
          >
            <div className="bg-blue-50 p-5 rounded-2xl mb-5 group-hover:bg-blue-100 transition-colors">
              <Wallet size={40} className="text-blue-600" strokeWidth={2} />
            </div>
            <h3 className="font-extrabold text-gray-900 text-2xl md:text-3xl mb-1">≤ 500k</h3>
            <p className="text-xs text-gray-500 font-medium">Up to ₱500,000</p>
            <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-blue-600">
              Select <ChevronRight size={16} className="transition-transform group-hover:translate-x-1" />
            </span>
          </Link>

          {upEligibility.eligible ? (
            <Link
              to="/Consolidated_Up"
              className={`${cardBase} bg-white border-gray-200 shadow-sm hover:shadow-lg hover:-translate-y-1 hover:border-indigo-300`}
            >
              <div className="bg-indigo-50 p-5 rounded-2xl mb-5 group-hover:bg-indigo-100 transition-colors">
                <Landmark size={40} className="text-indigo-600" strokeWidth={2} />
              </div>
              <h3 className="font-extrabold text-gray-900 text-2xl md:text-3xl mb-1">&gt; 500k</h3>
              <p className="text-xs text-gray-500 font-medium">Above ₱500,000</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-indigo-600">
                Select <ChevronRight size={16} className="transition-transform group-hover:translate-x-1" />
              </span>
            </Link>
          ) : (
            <div
              aria-disabled="true"
              title={upEligibility.reason}
              className={`${cardBase} bg-gray-100 border-dashed border-gray-300 cursor-not-allowed`}
            >
              <div className="bg-gray-200 p-5 rounded-2xl mb-5 opacity-70">
                <Landmark size={40} className="text-gray-400" strokeWidth={2} />
              </div>
              <h3 className="font-extrabold text-gray-400 text-2xl md:text-3xl mb-1">&gt; 500k</h3>
              <p className="text-xs text-gray-400 font-medium">Above ₱500,000</p>
              <span className="mt-4 inline-flex items-start gap-1.5 text-xs font-semibold text-red-500 text-left">
                {upEligibility.loading ? (
                  'Checking eligibility…'
                ) : (
                  <>
                    <Lock size={14} className="mt-0.5 shrink-0" />
                    <span>Not eligible: {upEligibility.reason}</span>
                  </>
                )}
              </span>
            </div>
          )}

        </div>
      </main>
    </div>
  );
};

export default Conso_Choice;
