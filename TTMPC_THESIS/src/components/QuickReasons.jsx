import React from 'react';

/*
  QuickReasons
  ------------
  A row of one-click reasons shown above a required note box (reject, decline,
  return for revision). Clicking a chip fills the note; if the note already has
  text the reason is added on a new line, and picking the same reason twice does
  nothing. Presets live in utils/quickReasons.js.

    <QuickReasons reasons={QUICK_REASONS.loanReject} value={remarks} onChange={setRemarks} />
*/
export default function QuickReasons({ reasons, value, onChange, disabled = false, className = 'mb-2' }) {
  if (!reasons?.length) return null;

  const pick = (reason) => {
    const current = String(value || '').trim();
    if (!current) return onChange(reason);
    if (current.includes(reason)) return undefined;
    return onChange(`${current}\n${reason}`);
  };

  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`} role="group" aria-label="Quick reasons">
      {reasons.map((reason) => (
        <button
          key={reason}
          type="button"
          onClick={() => pick(reason)}
          disabled={disabled}
          className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-left text-[11px] font-medium text-gray-600 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {reason}
        </button>
      ))}
    </div>
  );
}
