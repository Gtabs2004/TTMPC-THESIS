import React, { useEffect, useMemo, useRef } from 'react';

/*
  MonthDayPicker
  --------------
  A calendar popover for picking any day of ONE month (the month of `maxIso`,
  normally today's). Days after `maxIso` are greyed out and can't be chosen.
  Controlled: the parent owns `open`, shows it from a trigger button, and places
  it by wrapping the trigger in a `relative` element (the popover is absolute,
  just under that wrapper; align="right" lines its right edge up with the wrapper's).

    <div className="relative">
      <button data-calendar-trigger onClick={toggle}>Oct 23, 2026</button>
      <MonthDayPicker open={open} onClose={close} value={iso} onChange={pick} maxIso={todayIso} />
    </div>

  Dates are plain 'YYYY-MM-DD' strings, built from numbers, so there is no
  timezone drift. Give each trigger the data-calendar-trigger attribute so
  clicking it while the calendar is open toggles instead of closing and
  immediately re-opening.
*/

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const pad = (n) => String(n).padStart(2, '0');
const toIso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

export default function MonthDayPicker({ open, onClose, value, onChange, maxIso, align = 'left', className = '' }) {
  const panelRef = useRef(null);

  const { year, month, monthLabel, lastDay, firstWeekday } = useMemo(() => {
    const [y, m] = maxIso.split('-').map(Number);
    return {
      year: y,
      month: m,
      monthLabel: new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      lastDay: new Date(y, m, 0).getDate(),
      firstWeekday: new Date(y, m - 1, 1).getDay(),
    };
  }, [maxIso]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    const onPointer = (e) => {
      if (panelRef.current?.contains(e.target)) return;
      if (e.target.closest?.('[data-calendar-trigger]')) return;
      onClose();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
    };
  }, [open, onClose]);

  if (!open) return null;

  const cells = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: lastDay }, (_, i) => i + 1),
  ];

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label={`Choose a day in ${monthLabel}`}
      className={`absolute top-full z-30 mt-2 w-64 rounded-xl border border-gray-200 bg-white p-3 shadow-lg ${align === 'right' ? 'right-0' : 'left-0'} ${className}`}
    >
      <p className="mb-2 text-center text-sm font-bold text-gray-800">{monthLabel}</p>

      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((w) => (
          <span key={w} className="py-1 text-[10px] font-bold uppercase text-gray-400">{w}</span>
        ))}

        {cells.map((day, i) => {
          if (day === null) return <span key={`blank-${i}`} />;
          const iso = toIso(year, month, day);
          const disabled = iso > maxIso;
          const selected = iso === value;
          const isToday = iso === maxIso;
          return (
            <button
              key={iso}
              type="button"
              disabled={disabled}
              onClick={() => onChange(iso)}
              aria-label={new Date(year, month - 1, day).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
              aria-pressed={selected}
              className={`h-8 rounded-lg text-xs font-semibold transition-colors ${
                selected
                  ? 'bg-green-600 text-white shadow-sm'
                  : disabled
                    ? 'cursor-not-allowed text-gray-300'
                    : `text-gray-700 hover:bg-green-50 hover:text-green-700 ${isToday ? 'ring-1 ring-green-500' : ''}`
              }`}
            >
              {day}
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex items-center justify-between border-t border-gray-100 pt-2">
        <button
          type="button"
          onClick={() => onChange(maxIso)}
          className="text-xs font-bold text-green-700 hover:underline"
        >
          Today
        </button>
        <button type="button" onClick={onClose} className="text-xs font-semibold text-gray-500 hover:text-gray-700">
          Close
        </button>
      </div>
    </div>
  );
}
