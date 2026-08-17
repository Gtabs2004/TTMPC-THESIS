import React, { useEffect, useState } from 'react';

function LoginLoadingOverlay({ show, message = 'Signing you in...' }) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!show) {
      setProgress(0);
      return;
    }
    setProgress(8);
    const id = setInterval(() => {
      setProgress((p) => {
        if (p >= 90) return p;
        const step = p < 40 ? 6 : p < 70 ? 3 : 1;
        return Math.min(90, p + step);
      });
    }, 220);
    return () => clearInterval(id);
  }, [show]);

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-white/90 backdrop-blur-sm"
      role="status"
      aria-live="polite"
    >
      <img
        src="/img/ttmpc logo.png"
        alt="TTMPC Logo"
        className="h-20 w-auto mb-6 animate-pulse drop-shadow-sm"
      />
      <p className="text-gray-800 font-semibold mb-4 text-sm sm:text-base">{message}</p>
      <div className="w-64 sm:w-80 h-2 bg-gray-200 rounded-full overflow-hidden shadow-inner">
        <div
          className="h-full bg-[#66B538] rounded-full transition-all duration-200 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="mt-3 text-xs text-gray-500">Please wait while we prepare your dashboard</p>
    </div>
  );
}

export default LoginLoadingOverlay;
