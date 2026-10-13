import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';

// Neutral card; the only colour is a small status dot.
const DOT_COLORS = {
  success: 'bg-[#66B538]',
  error: 'bg-red-500',
  warning: 'bg-amber-500',
  info: 'bg-sky-500',
};

const Toast = ({ message, type = 'info', duration = 4000, onClose = () => {} }) => {
  const [isVisible, setIsVisible] = useState(true);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return undefined;
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onClose, 300); // Match animation duration
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose, paused]);

  return (
    <div
      role={type === 'error' ? 'alert' : 'status'}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className={`toast-notification ${isVisible ? 'toast-enter' : 'toast-exit'} mb-2 flex w-[min(92vw,22rem)] items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm dark:border-mdark-border dark:bg-mdark-elevated`}
    >
      <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${DOT_COLORS[type] || DOT_COLORS.info}`} />
      <p className="min-w-0 flex-1 break-words text-sm text-gray-800 dark:text-mdark-text">{message}</p>
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={() => { setIsVisible(false); setTimeout(onClose, 300); }}
        className="shrink-0 text-gray-400 transition-colors hover:text-gray-700 dark:text-mdark-text-muted dark:hover:text-mdark-text"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
};

export default Toast;
