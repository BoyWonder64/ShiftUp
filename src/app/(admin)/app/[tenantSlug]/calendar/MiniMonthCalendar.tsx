"use client";

import { useState } from "react";
import {
  addDays,
  differenceInCalendarDays,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { enUS } from "date-fns/locale";

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

function buildMonthGrid(displayedMonth: Date): Date[] {
  const gridStart = startOfWeek(startOfMonth(displayedMonth), { locale: enUS });
  const gridEnd = endOfWeek(endOfMonth(displayedMonth), { locale: enUS });
  const dayCount = differenceInCalendarDays(gridEnd, gridStart) + 1;
  return Array.from({ length: dayCount }, (_, i) => addDays(gridStart, i));
}

/**
 * A Google-Calendar-style mini month view for quick orientation and
 * navigation, shown alongside the main grid. It mirrors the main calendar's
 * controlled currentDate/range state as plain props rather than owning any
 * of that state itself - clicking a day only ever moves currentDate (never
 * the active view), the same way the toolbar's own month/year jump popover
 * already behaves.
 */
export function MiniMonthCalendar({
  currentDate,
  range,
  onNavigateToDate,
}: {
  currentDate: Date;
  range: { start: Date; end: Date };
  onNavigateToDate: (date: Date) => void;
}) {
  // Independently navigable (prev/next-month arrows) without moving the main
  // grid - only resynced to currentDate's own month when that actually
  // changes (tracked via lastSyncedMonth), so paging this forward isn't
  // immediately clobbered by unrelated parent re-renders. Adjusted during
  // render rather than in an effect, per React's "adjusting state when a
  // prop changes" pattern - avoids the extra render an effect would cause.
  const [displayedMonth, setDisplayedMonth] = useState(() => startOfMonth(currentDate));
  const [lastSyncedMonth, setLastSyncedMonth] = useState(() => startOfMonth(currentDate));

  if (
    currentDate.getFullYear() !== lastSyncedMonth.getFullYear() ||
    currentDate.getMonth() !== lastSyncedMonth.getMonth()
  ) {
    const synced = startOfMonth(currentDate);
    setLastSyncedMonth(synced);
    setDisplayedMonth(synced);
  }

  const days = buildMonthGrid(displayedMonth);
  const isInVisibleRange = (day: Date) => day >= range.start && day < range.end;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setDisplayedMonth((m) => addDays(startOfMonth(m), -1))}
          className="rounded-md px-2 py-1 text-xs font-bold text-gray-500 hover:bg-gray-100 hover:text-primary-600"
          aria-label="Previous month"
        >
          ‹
        </button>
        <span className="text-xs font-bold tracking-wide text-gray-900 uppercase">
          {format(displayedMonth, "MMMM yyyy")}
        </span>
        <button
          type="button"
          onClick={() => setDisplayedMonth((m) => addDays(endOfMonth(m), 1))}
          className="rounded-md px-2 py-1 text-xs font-bold text-gray-500 hover:bg-gray-100 hover:text-primary-600"
          aria-label="Next month"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-y-1 text-center">
        {WEEKDAY_LABELS.map((label, i) => (
          <span key={i} className="text-[10px] font-medium text-gray-400">
            {label}
          </span>
        ))}
        {days.map((day) => {
          const inMonth = isSameMonth(day, displayedMonth);
          const today = isToday(day);
          const selected = isSameDay(day, currentDate);
          const inRange = isInVisibleRange(day);
          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => onNavigateToDate(day)}
              className={`mx-auto flex h-6 w-6 items-center justify-center rounded-full text-xs transition-colors duration-150 ${
                !inMonth
                  ? "text-gray-300 hover:bg-gray-100"
                  : selected
                    ? "bg-primary-500 font-bold text-white"
                    : today
                      ? "font-bold text-primary-600 ring-1 ring-primary-500"
                      : inRange
                        ? "bg-primary-50 text-gray-900 hover:bg-primary-100"
                        : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
