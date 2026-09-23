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
  subYears,
  isSameDay,
  isAfter,
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

// Latest birthdate that satisfies minAge (never later than today).
const computeMaxSelectableDate = (minAge) => (minAge ? subYears(new Date(), minAge) : new Date());

// Day 32 of April doesn't exist — clamp to whatever the target month's real
// last day is (e.g. carrying the 31st into February lands on the 28th/29th).
const clampDayToMonth = (year, monthIndex, day) => {
  const lastDayOfMonth = new Date(year, monthIndex + 1, 0).getDate();
  return Math.min(day, lastDayOfMonth);
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
  // Latest pickable birthdate is `today − minAge years` (e.g. minAge=18 means
  // no one under 18 can even click a day). A DOB is never pickable in the
  // future regardless of minAge. This only constrains the CALENDAR WIDGET —
  // it does not decide what error to show for a typed date; that stays with
  // the caller's own validation against the emitted ISO value, same as any
  // other field here.
  minAge,
}) {
  const isDobMode = mode === 'dob';
  const [displayValue, setDisplayValue] = useState('');
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(
    () => parseIsoToDate(value) || computeMaxSelectableDate(minAge)
  );
  const containerRef = useRef(null);

  useEffect(() => {
    if (!isDobMode) return;
    setDisplayValue(toMaskedFromIso(value));
    const parsedDate = parseIsoToDate(value);
    if (parsedDate) setCalendarMonth(parsedDate);
  }, [value, isDobMode]);

  // No stored value yet (a fresh field) — keep the calendar's open month
  // pinned to the newest pickable month whenever minAge changes, instead of
  // defaulting to "today" where nothing would be selectable.
  useEffect(() => {
    if (parseIsoToDate(value)) return;
    setCalendarMonth(computeMaxSelectableDate(minAge));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minAge]);

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

  const applyDate = (day, { closeCalendar = true } = {}) => {
    const iso = format(day, 'yyyy-MM-dd');
    setDisplayValue(format(day, 'MM/dd/yyyy'));
    emitIsoChange(iso);
    if (closeCalendar) setIsCalendarOpen(false);
  };

  const handleSelectDay = (day) => applyDate(day, { closeCalendar: true });

  // Month/Year dropdowns always navigate which month is being VIEWED, pinned
  // to day 1 — building the new date from the currently-displayed
  // day-of-month was a bug (Date.setMonth/setFullYear silently rolls over
  // into a different month when that day doesn't exist there, e.g. off the
  // 31st into a 30-day month).
  //
  // On top of navigating, when a date is ALREADY selected (editing an
  // existing value, not a blank field), changing just the year or month is
  // expected to update that field directly, carrying the same day forward —
  // otherwise picking "2002" while "03/04/2008" is showing visibly does
  // nothing to the field until a day is also clicked, which read as the
  // dropdown "not working". The day is clamped to the target month's real
  // length (Jan 31 → Feb 28/29, never Feb 31) and the carry is skipped
  // (falls back to pure navigation) if it would land on a disabled day.
  const handleMonthSelect = (event) => {
    const monthIndex = Number(event.target.value);
    const year = effectiveMonth.getFullYear();
    setCalendarMonth(new Date(year, monthIndex, 1));
    if (selectedDate) {
      const day = clampDayToMonth(year, monthIndex, selectedDate.getDate());
      const carried = new Date(year, monthIndex, day);
      if (!isDayDisabled(carried)) applyDate(carried, { closeCalendar: false });
    }
  };

  const handleYearSelect = (event) => {
    const year = Number(event.target.value);
    const monthIndex = effectiveMonth.getMonth();
    setCalendarMonth(new Date(year, monthIndex, 1));
    if (selectedDate) {
      const day = clampDayToMonth(year, monthIndex, selectedDate.getDate());
      const carried = new Date(year, monthIndex, day);
      if (!isDayDisabled(carried)) applyDate(carried, { closeCalendar: false });
    }
  };

  const finalId = id || name;

  if (!isDobMode) {
    return null;
  }

  const selectedDate = parseIsoToDate(value);
  const today = new Date();
  // The latest birthdate that still satisfies minAge — never later than today.
  const maxSelectableDate = minAge ? subYears(today, minAge) : today;
  const currentYear = today.getFullYear();
  const maxSelectableYear = maxSelectableDate.getFullYear();
  const yearOptions = [];
  for (let y = maxSelectableYear; y >= currentYear - 100; y -= 1) yearOptions.push(y);

  // What's actually rendered: `calendarMonth` clamped to the cutoff month, so
  // the month/year selects always show a value that's in their own option
  // list (an out-of-range calendarMonth can only happen transiently — see the
  // "no value yet" effect above for the steady-state fix).
  const effectiveMonth = isAfter(startOfMonth(calendarMonth), startOfMonth(maxSelectableDate))
    ? maxSelectableDate
    : calendarMonth;
  const monthStart = startOfMonth(effectiveMonth);
  const monthEnd = endOfMonth(effectiveMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const leadingBlanks = getDay(monthStart);
  const isDayDisabled = (day) => isAfter(day, maxSelectableDate);
  const isNextMonthDisabled = isAfter(startOfMonth(addMonths(effectiveMonth, 1)), maxSelectableDate);

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
                onClick={() => setCalendarMonth(subMonths(effectiveMonth, 1))}
                className="rounded p-1 text-gray-500 hover:bg-gray-100"
                aria-label="Previous month"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              <div className="flex gap-1">
                <select
                  value={effectiveMonth.getMonth()}
                  onChange={handleMonthSelect}
                  className="rounded border border-gray-200 p-1 text-xs outline-none focus:ring-1 focus:ring-green-500"
                >
                  {MONTH_LABELS.map((m, i) => {
                    // In the cutoff year, a later month has no pickable days at all.
                    const disabledMonth =
                      effectiveMonth.getFullYear() === maxSelectableYear && i > maxSelectableDate.getMonth();
                    return (
                      <option key={m} value={i} disabled={disabledMonth}>{m}</option>
                    );
                  })}
                </select>
                <select
                  value={effectiveMonth.getFullYear()}
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
                onClick={() => !isNextMonthDisabled && setCalendarMonth(addMonths(effectiveMonth, 1))}
                disabled={isNextMonthDisabled}
                className="rounded p-1 text-gray-500 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
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
                const disabledDay = isDayDisabled(day);
                return (
                  <button
                    key={day.toISOString()}
                    type="button"
                    onClick={() => !disabledDay && handleSelectDay(day)}
                    disabled={disabledDay}
                    title={disabledDay && minAge ? `Must be at least ${minAge} years old` : undefined}
                    className={`rounded-md p-1.5 text-xs transition-colors ${
                      disabledDay
                        ? 'cursor-not-allowed text-gray-300 hover:bg-transparent'
                        : isSelected
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
