import React, { useState, useCallback } from 'react';

export function useFormErrors() {
  const [errors, setErrors] = useState({});
  const [globalError, setGlobalError] = useState('');

  const setFieldError = useCallback((field, message) => {
    setErrors((prev) => ({ ...prev, [field]: message }));
  }, []);

  const clearFieldError = useCallback((field) => {
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  }, []);

  const clearAllErrors = useCallback(() => {
    setErrors({});
    setGlobalError('');
  }, []);

  const getInputClass = useCallback((field, baseClass = '') => {
    const errorClass = 'border-red-500 bg-red-50 focus:ring-1 focus:ring-red-500';
    const okClass = 'border-gray-300 focus:ring-1 focus:ring-green-500';
    return `${baseClass} ${errors[field] ? errorClass : okClass}`;
  }, [errors]);

  const renderError = useCallback((field) => (
    errors[field]
      ? React.createElement('p', { className: 'text-red-500 text-[10px] mt-1 font-semibold' }, errors[field])
      : null
  ), [errors]);

  const scrollToFirstError = useCallback((errorMap) => {
    const firstErrorKey = Object.keys(errorMap).find((key) => errorMap[key]);
    if (!firstErrorKey) return;
    setTimeout(() => {
      const errorElement = document.querySelector(`[name="${firstErrorKey}"]`);
      if (errorElement) {
        errorElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        errorElement.focus();
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }, 100);
  }, []);

  return {
    errors,
    setErrors,
    globalError,
    setGlobalError,
    setFieldError,
    clearFieldError,
    clearAllErrors,
    getInputClass,
    renderError,
    scrollToFirstError,
  };
}
