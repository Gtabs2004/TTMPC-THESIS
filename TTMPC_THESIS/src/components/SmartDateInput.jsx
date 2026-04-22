import React, { useEffect, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { format, isValid, parse, parseISO } from 'date-fns';

const DIGIT_LIMIT_DOB = 8;

const toMaskedDob = (value) => {
  const digits = String(value || '').replace(/\D/g, '').slice(0, DIGIT_LIMIT_DOB);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
};

const toIsoFromMaskedDob = (value) => {
  const text = String(value || '').trim();
  if (!text || text.length !== 10) return '';

  const parsed = parse(text, 'MM/dd/yyyy', new Date());
  if (!isValid(parsed)) return '';

  // Strictly confirm parsed date matches user input to avoid overflow parsing.
  if (format(parsed, 'MM/dd/yyyy') !== text) return '';

  return format(parsed, 'yyyy-MM-dd');
};

const toMaskedFromIso = (isoValue) => {
  if (!isoValue) return '';
  try {
    const parsed = parseISO(String(isoValue));
    if (!isValid(parsed)) return '';
    return format(parsed, 'MM/dd/yyyy');
  } catch {
    return '';
  }
};

function SmartDateInput({
  mode = 'dob',
  value = '',
  onChange,
  name,
  id,
  required = false,
  disabled = false,
  placeholder,
  label,
  error,
  className = '',
}) {
  const isDobMode = mode === 'dob';
  const [displayValue, setDisplayValue] = useState('');

  useEffect(() => {
    if (!isDobMode) return;
    setDisplayValue(toMaskedFromIso(value));
  }, [value, isDobMode]);

  const emitIsoChange = (isoValue) => {
    if (typeof onChange === 'function') {
      onChange(isoValue);
    }
  };

  const handleDobInputChange = (event) => {
    const masked = toMaskedDob(event.target.value);
    setDisplayValue(masked);

    const iso = toIsoFromMaskedDob(masked);
    emitIsoChange(iso);
  };

  const handleDobBlur = () => {
    const iso = toIsoFromMaskedDob(displayValue);
    if (!iso) return;

    const normalized = toMaskedFromIso(iso);
    setDisplayValue(normalized);
    emitIsoChange(iso);
  };

  const finalId = id || name;

  if (!isDobMode) {
    return null;
  }

  return (
    <div className={`w-full ${className}`.trim()}>
      {label ? (
        <label htmlFor={finalId} className="mb-1 block text-xs font-semibold text-gray-600">
          {label}
          {required ? <span className="text-red-500"> *</span> : null}
        </label>
      ) : null}

      <div className="group relative">
        <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 transition-colors group-focus-within:text-green-600" />
        <input
          id={finalId}
          name={name}
          type="text"
          value={displayValue}
          onChange={handleDobInputChange}
          onBlur={handleDobBlur}
          placeholder={placeholder || 'MM/DD/YYYY'}
          inputMode="numeric"
          autoComplete="bday"
          maxLength={10}
          required={required}
          disabled={disabled}
          aria-invalid={Boolean(error)}
          className={`w-full rounded-md border p-2.5 pl-9 text-sm outline-none transition ${
            error
              ? 'border-red-400 focus:ring-1 focus:ring-red-400'
              : 'border-gray-300 focus:ring-1 focus:ring-green-500'
          } ${disabled ? 'cursor-not-allowed bg-gray-100 text-gray-500' : 'bg-white text-gray-900'}`}
        />
      </div>

      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}

export default SmartDateInput;
