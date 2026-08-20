import React, { useEffect } from 'react';
import { X, AlertTriangle } from 'lucide-react';

const TONE_STYLES = {
  default: {
    confirmClass: 'bg-member-green hover:bg-[#154718] text-white',
    iconClass: 'text-member-green',
  },
  destructive: {
    confirmClass: 'bg-[#DC2626] hover:bg-red-700 text-white',
    iconClass: 'text-red-600',
  },
  warning: {
    confirmClass: 'bg-[#F59E0B] hover:bg-amber-600 text-white',
    iconClass: 'text-amber-600',
  },
};

const ConfirmDialog = ({
  open,
  title,
  message,
  children,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  loadingLabel = 'Processing...',
  tone = 'default',
  loading = false,
  disableConfirm = false,
  errorMessage = '',
  onConfirm,
  onCancel,
}) => {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !loading) onCancel?.();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, loading, onCancel]);

  if (!open) return null;

  const styles = TONE_STYLES[tone] || TONE_STYLES.default;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm dialog-enter"
      onClick={() => !loading && onCancel?.()}
    >
      <div
        className="dialog-card bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-lg p-6 relative border border-transparent dark:border-gray-700"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => !loading && onCancel?.()}
          disabled={loading}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors disabled:opacity-40"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-start gap-3 mb-4 pr-6">
          {tone !== 'default' && (
            <AlertTriangle className={`w-5 h-5 mt-0.5 flex-shrink-0 ${styles.iconClass}`} />
          )}
          <h3 className="text-xl font-bold text-gray-900 dark:text-white">{title}</h3>
        </div>

        {message && <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">{message}</p>}

        {children && <div className="mb-6">{children}</div>}

        {errorMessage && (
          <div className="mb-4 text-sm text-red-600">{errorMessage}</div>
        )}

        <div className="flex justify-center gap-3 mt-2">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-6 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors w-1/2 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading || disableConfirm}
            className={`px-6 py-2.5 rounded-lg font-medium text-sm transition-colors w-1/2 disabled:opacity-50 ${styles.confirmClass}`}
          >
            {loading ? loadingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
