import React, { useEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  format,
  isValid,
  parse,
  parseISO,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  addMonths,
  subMonths,
  isSameDay,
} from 'date-fns';

const DIGIT_LIMIT_DOB = 8;
const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

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

const parseIsoToDate = (isoValue) => {
  if (!isoValue) return null;
  try {
    const parsed = parseISO(String(isoValue));
    return isValid(parsed) ? parsed : null;
  } catch {
    return null;
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
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => parseIsoToDate(value) || new Date());
  const containerRef = useRef(null);

  useEffect(() => {
    if (!isDobMode) return;
    setDisplayValue(toMaskedFromIso(value));
    const parsedDate = parseIsoToDate(value);
    if (parsedDate) setCalendarMonth(parsedDate);
  }, [value, isDobMode]);

  useEffect(() => {
    if (!isCalendarOpen) return;
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsCalendarOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isCalendarOpen]);

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

  const handleToggleCalendar = () => {
    if (disabled) return;
    setIsCalendarOpen((open) => !open);
  };

  const handleSelectDay = (day) => {
    const iso = format(day, 'yyyy-MM-dd');
    setDisplayValue(format(day, 'MM/dd/yyyy'));
    emitIsoChange(iso);
    setIsCalendarOpen(false);
  };

  const handleMonthSelect = (event) => {
    const monthIndex = Number(event.target.value);
    setCalendarMonth((current) => {
      const updated = new Date(current);
      updated.setMonth(monthIndex);
      return updated;
    });
  };

  const handleYearSelect = (event) => {
    const year = Number(event.target.value);
    setCalendarMonth((current) => {
      const updated = new Date(current);
      updated.setFullYear(year);
      return updated;
    });
  };

  const finalId = id || name;

  if (!isDobMode) {
    return null;
  }

  const selectedDate = parseIsoToDate(value);
  const currentYear = new Date().getFullYear();
  const yearOptions = [];
  for (let y = currentYear; y >= currentYear - 100; y -= 1) yearOptions.push(y);

  const monthStart = startOfMonth(calendarMonth);
  const monthEnd = endOfMonth(calendarMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const leadingBlanks = getDay(monthStart);

  return (
    <div className={`w-full ${className}`.trim()} ref={containerRef}>
      {label ? (
        <label htmlFor={finalId} className="mb-1 block text-xs font-semibold text-gray-600">
          {label}
          {required ? <span className="text-red-500"> *</span> : null}
        </label>
      ) : null}

      <div className="group relative">
        <button
          type="button"
          onClick={handleToggleCalendar}
          disabled={disabled}
          tabIndex={-1}
          aria-label="Open calendar"
          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 transition-colors group-focus-within:text-green-600 hover:text-green-600 disabled:cursor-not-allowed"
        >
          <CalendarDays className="h-4 w-4" />
        </button>
        <input
          id={finalId}
          name={name}
          type="text"
          value={displayValue}
          onChange={handleDobInputChange}
          onBlur={handleDobBlur}
          onFocus={() => !disabled && setIsCalendarOpen(true)}
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

        {isCalendarOpen && !disabled ? (
          <div className="absolute z-20 mt-1 w-72 rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
            <div className="mb-2 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setCalendarMonth((m) => subMonths(m, 1))}
                className="rounded p-1 text-gray-500 hover:bg-gray-100"
                aria-label="Previous month"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              <div className="flex gap-1">
                <select
                  value={calendarMonth.getMonth()}
                  onChange={handleMonthSelect}
                  className="rounded border border-gray-200 p-1 text-xs outline-none focus:ring-1 focus:ring-green-500"
                >
                  {MONTH_LABELS.map((m, i) => (
                    <option key={m} value={i}>{m}</option>
                  ))}
                </select>
                <select
                  value={calendarMonth.getFullYear()}
                  onChange={handleYearSelect}
                  className="rounded border border-gray-200 p-1 text-xs outline-none focus:ring-1 focus:ring-green-500"
                >
                  {yearOptions.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={() => setCalendarMonth((m) => addMonths(m, 1))}
                className="rounded p-1 text-gray-500 hover:bg-gray-100"
                aria-label="Next month"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-gray-400">
              {WEEKDAY_LABELS.map((w) => (
                <div key={w}>{w}</div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: leadingBlanks }).map((_, i) => (
                <div key={`blank-${i}`} />
              ))}
              {daysInMonth.map((day) => {
                const isSelected = selectedDate && isSameDay(day, selectedDate);
                return (
                  <button
                    key={day.toISOString()}
                    type="button"
                    onClick={() => handleSelectDay(day)}
                    className={`rounded-md p-1.5 text-xs transition-colors ${
                      isSelected
                        ? 'bg-green-500 text-white hover:bg-green-500'
                        : 'text-gray-700 hover:bg-green-100'
                    }`}
                  >
                    {format(day, 'd')}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}

export default SmartDateInput;
