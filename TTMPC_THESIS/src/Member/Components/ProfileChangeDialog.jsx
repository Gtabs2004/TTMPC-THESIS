import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, FileText, Paperclip, X } from 'lucide-react';
import { PAYSLIP_ACCEPT, PAYSLIP_MAX_BYTES } from '../../utils/profileChangeRequests';

/*
  ProfileChangeDialog
  -------------------
  Shown when a member saves profile edits. Every changed field is sent to the
  Bookkeeper for approval; nothing on the profile changes until it is approved.
  Net take-home pay also needs a payslip: choose a file, or take a photo with the
  phone camera (capture="environment" opens the camera on phones), plus the month
  the payslip covers.

  Mounted only while open (see the wrapper), so the attachment starts empty every
  time without reset logic.
*/

// The payslip must cover this month or one of the previous N months. Keep in
// step with PROFILE_CHANGE_PAYSLIP_MAX_AGE_MONTHS in main.py.
const PAYSLIP_MAX_AGE_MONTHS = 2;

const monthValue = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

const formatSize = (bytes) =>
  bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'application/pdf']);

function DialogBody({ changes, loading, errorMessage, onCancel, onConfirm }) {
  const needsPayslip = changes.some((c) => c.needsProof);
  const [file, setFile] = useState(null);
  const [payPeriod, setPayPeriod] = useState('');
  const [fileError, setFileError] = useState('');
  const chooseRef = useRef(null);
  const cameraRef = useRef(null);

  const { minMonth, maxMonth } = useMemo(() => {
    const now = new Date();
    return {
      maxMonth: monthValue(now),
      minMonth: monthValue(new Date(now.getFullYear(), now.getMonth() - PAYSLIP_MAX_AGE_MONTHS, 1)),
    };
  }, []);

  const handlePick = (event) => {
    const picked = event.target.files?.[0];
    event.target.value = '';
    if (!picked) return;
    // Phone cameras sometimes report an empty type; the server checks the real bytes.
    if (picked.type && !ALLOWED_TYPES.has(picked.type)) {
      setFile(null);
      setFileError('The payslip must be a PDF, PNG or JPG file.');
      return;
    }
    if (picked.size > PAYSLIP_MAX_BYTES) {
      setFile(null);
      setFileError(`That file is ${formatSize(picked.size)}. The limit is ${formatSize(PAYSLIP_MAX_BYTES)}.`);
      return;
    }
    setFileError('');
    setFile(picked);
  };

  const ready = !needsPayslip || (file && payPeriod);

  return (
    <div className="text-left space-y-4">
      <p className="text-sm text-gray-600 dark:text-gray-400">
        These changes go to the Bookkeeper for approval. Your profile keeps its current values until they are approved.
      </p>

      <ul className="divide-y divide-gray-100 dark:divide-gray-700 rounded-lg border border-gray-200 dark:border-gray-700 max-h-56 overflow-y-auto">
        {changes.map((c) => (
          <li key={c.key} className="px-3 py-2.5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">{c.label}</p>
            <p className="mt-0.5 text-sm text-gray-900 dark:text-gray-100 break-words">
              <span className="text-gray-400 line-through">{c.oldValue || 'Not provided'}</span>
              <span className="mx-1.5 text-gray-400">→</span>
              <span className="font-semibold">{c.newValue || 'Cleared'}</span>
            </p>
            {c.direct ? (
              <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">First-time entry, saved right away.</p>
            ) : null}
          </li>
        ))}
      </ul>

      {needsPayslip ? (
        <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3 space-y-3">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            Attach your payslip to change your net take-home pay
          </p>
          <p className="text-xs text-amber-800 dark:text-amber-300">
            The Bookkeeper compares the figure with your payslip. Use a recent one (PDF, PNG or JPG, up to{' '}
            {formatSize(PAYSLIP_MAX_BYTES)}). Only you and the Bookkeeper can see it.
          </p>

          <div className="flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={() => chooseRef.current?.click()}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
            >
              <Paperclip className="w-4 h-4" /> Choose file
            </button>
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
            >
              <Camera className="w-4 h-4" /> Take photo
            </button>
            <input ref={chooseRef} type="file" accept={PAYSLIP_ACCEPT} className="hidden" onChange={handlePick} />
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePick} />
          </div>

          {file ? (
            <div className="flex items-center justify-between gap-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm">
              <span className="inline-flex items-center gap-2 min-w-0">
                <FileText className="w-4 h-4 shrink-0 text-gray-500" />
                <span className="truncate text-gray-800 dark:text-gray-100">{file.name || 'Payslip photo'}</span>
                <span className="shrink-0 text-xs text-gray-500">{formatSize(file.size)}</span>
              </span>
              <button
                type="button"
                onClick={() => setFile(null)}
                disabled={loading}
                aria-label="Remove payslip"
                className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : null}
          {fileError ? <p className="text-xs font-semibold text-red-600">{fileError}</p> : null}

          <div>
            <label htmlFor="payslip-period" className="block text-[11px] font-bold uppercase tracking-wider text-amber-900 dark:text-amber-200 mb-1">
              Month the payslip covers
            </label>
            <input
              id="payslip-period"
              type="month"
              value={payPeriod}
              min={minMonth}
              max={maxMonth}
              onChange={(e) => setPayPeriod(e.target.value)}
              disabled={loading}
              className="w-full sm:w-48 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-member-green/30"
            />
          </div>
        </div>
      ) : null}

      {errorMessage ? <p role="alert" className="text-sm font-medium text-red-600">{errorMessage}</p> : null}

      <div className="flex justify-center gap-3 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="px-6 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors w-1/2 disabled:opacity-50"
        >
          Review again
        </button>
        <button
          type="button"
          onClick={() => onConfirm({ payslip: needsPayslip ? file : null, payPeriod: needsPayslip ? payPeriod : '' })}
          disabled={loading || !ready}
          className="px-6 py-2.5 rounded-lg font-medium text-sm transition-colors w-1/2 disabled:opacity-50 bg-member-green hover:bg-[#154718] text-white"
        >
          {loading ? 'Sending…' : 'Send for approval'}
        </button>
      </div>
    </div>
  );
}

export default function ProfileChangeDialog({ open, changes, loading, errorMessage, onCancel, onConfirm }) {
  return (
    <DialogShell open={open} loading={loading} onCancel={onCancel}>
      <DialogBody
        changes={changes}
        loading={loading}
        errorMessage={errorMessage}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />
    </DialogShell>
  );
}

// ConfirmDialog always renders its own Cancel/Confirm row; this form has its
// own actions, so it gets a plain overlay that matches ConfirmDialog's look.
// The body is only mounted while open, so the attachment starts empty each time.
function DialogShell({ open, loading, onCancel, children }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && !loading) onCancel?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, loading, onCancel]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center overflow-y-auto bg-black/40 backdrop-blur-sm p-4 dialog-enter"
      onClick={() => !loading && onCancel?.()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-change-title"
        className="dialog-card bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-lg p-6 relative border border-transparent dark:border-gray-700"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => !loading && onCancel?.()}
          disabled={loading}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors disabled:opacity-40"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>
        <h3 id="profile-change-title" className="text-xl font-bold text-gray-900 dark:text-white mb-4 pr-6">
          Send changes for approval?
        </h3>
        {children}
      </div>
    </div>
  );
}
