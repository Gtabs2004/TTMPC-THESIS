import React, { useEffect, useState } from 'react';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';

const Toast = ({ message, type = 'info', duration = 4000, onClose = () => {} }) => {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onClose, 300); // Match animation duration
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const getStyles = () => {
    switch (type) {
      case 'success':
        return {
          bg: 'bg-green-50',
          border: 'border-green-200',
          text: 'text-green-800',
          icon: 'text-green-600',
          Icon: CheckCircle,
        };
      case 'error':
        return {
          bg: 'bg-red-50',
          border: 'border-red-200',
          text: 'text-red-800',
          icon: 'text-red-600',
          Icon: AlertCircle,
        };
      case 'warning':
        return {
          bg: 'bg-amber-50',
          border: 'border-amber-200',
          text: 'text-amber-800',
          icon: 'text-amber-600',
          Icon: AlertTriangle,
        };
      case 'info':
      default:
        return {
          bg: 'bg-blue-50',
          border: 'border-blue-200',
          text: 'text-blue-800',
          icon: 'text-blue-600',
          Icon: Info,
        };
    }
  };

  const styles = getStyles();
  const Icon = styles.Icon;

  return (
    <div
      className={`toast-notification ${isVisible ? 'toast-enter' : 'toast-exit'} ${styles.bg} ${styles.border} border rounded-lg p-4 mb-3 shadow-lg flex items-start gap-3`}
    >
      <Icon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${styles.icon}`} />
      <p className={`text-sm font-medium flex-1 ${styles.text}`}>{message}</p>
      <button
        onClick={() => setIsVisible(false)}
        className={`flex-shrink-0 ${styles.text} hover:opacity-70 transition-opacity`}
      >
        <X className="w-5 h-5" />
      </button>
    </div>
  );
};

export default Toast;
