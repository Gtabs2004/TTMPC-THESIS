import React from 'react';
import { CheckCircle2 } from 'lucide-react';

/*
  LoanSubmittedDialog
  -------------------
  Shown after a loan application is submitted. It has one way out, the
  dashboard button, so the form is never left on screen ready to be submitted
  a second time.

    <LoanSubmittedDialog
      open={submitted}
      message="Your Emergency loan application was submitted."
      onContinue={() => navigate('/member-dashboard')}
    />
*/
export default function LoanSubmittedDialog({
  open,
  title = 'Application submitted',
  message,
  buttonLabel = 'Go back to dashboard',
  onContinue,
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm dialog-enter">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="loan-submitted-title"
        aria-describedby="loan-submitted-message"
        className="dialog-card w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-2xl sm:p-8"
      >
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <CheckCircle2 className="h-9 w-9 text-green-600" aria-hidden="true" />
        </div>
        <h2 id="loan-submitted-title" className="mt-5 text-xl font-bold text-gray-900">
          {title}
        </h2>
        <p id="loan-submitted-message" className="mt-2 text-sm text-gray-600">
          {message}
        </p>
        <button
          type="button"
          autoFocus
          onClick={onContinue}
          className="mt-6 w-full rounded-lg bg-member-green px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-[#154718] focus:outline-none focus:ring-2 focus:ring-member-green/40"
        >
          {buttonLabel}
        </button>
      </div>
    </div>
  );
}
