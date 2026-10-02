"use client";

import { useEffect, useRef, useState } from "react";
import { type ToolbarProps, type View } from "react-big-calendar";
import type { CalendarEvent } from "./SchedulingCalendar";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Custom toolbar replacing react-big-calendar's default one, so the current
 * month/year label can be clicked to jump straight to an arbitrary month and
 * year instead of only stepping one view at a time via Back/Next. Calling
 * onNavigate("DATE", target) here goes through the same chain as the
 * library's own Back/Next/Today buttons, which bubbles up to the controlled
 * currentDate/currentView state in SchedulingCalendar.
 */
export function CalendarToolbar({
  date,
  view,
  views,
  label,
  onNavigate,
  onView,
}: ToolbarProps<CalendarEvent, object>) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMonth, setPickerMonth] = useState(date.getMonth());
  const [pickerYear, setPickerYear] = useState(date.getFullYear());
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pickerOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [pickerOpen]);

  function openPicker() {
    setPickerMonth(date.getMonth());
    setPickerYear(date.getFullYear());
    setPickerOpen(true);
  }

  function goToPicked() {
    onNavigate("DATE", new Date(pickerYear, pickerMonth, 1));
    setPickerOpen(false);
  }

  const viewList = Array.isArray(views) ? views : (Object.keys(views) as View[]);

  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <div className="inline-flex gap-1 rounded-full bg-gray-100 p-1">
        <button
          type="button"
          onClick={() => onNavigate("TODAY")}
          className="rounded-full px-4 py-1.5 text-xs font-bold tracking-wide text-gray-600 uppercase transition-all duration-150 hover:bg-white hover:text-primary-600 hover:shadow-sm"
        >
          Today
        </button>
        <button
          type="button"
          onClick={() => onNavigate("PREV")}
          className="rounded-full px-4 py-1.5 text-xs font-bold tracking-wide text-gray-600 uppercase transition-all duration-150 hover:bg-white hover:text-primary-600 hover:shadow-sm"
        >
          Back
        </button>
        <button
          type="button"
          onClick={() => onNavigate("NEXT")}
          className="rounded-full px-4 py-1.5 text-xs font-bold tracking-wide text-gray-600 uppercase transition-all duration-150 hover:bg-white hover:text-primary-600 hover:shadow-sm"
        >
          Next
        </button>
      </div>

      <div className="relative inline-block">
        <button
          type="button"
          onClick={openPicker}
          className="cursor-pointer rounded-full px-3 py-1 text-lg font-bold tracking-wide text-gray-900 uppercase transition-colors duration-150 hover:text-primary-600"
          title="Click to jump to a specific month and year"
        >
          {label}
        </button>
        {pickerOpen && (
          <div
            ref={popoverRef}
            className="absolute top-full left-1/2 z-20 mt-1 flex -translate-x-1/2 flex-col gap-2 rounded-lg border border-gray-200 bg-white p-3 shadow-lg"
          >
            <div className="flex gap-2">
              <select
                value={pickerMonth}
                onChange={(e) => setPickerMonth(Number(e.target.value))}
                className="rounded-md border border-gray-300 px-2 py-1 text-sm font-normal normal-case"
              >
                {MONTH_NAMES.map((m, i) => (
                  <option key={m} value={i}>
                    {m}
                  </option>
                ))}
              </select>
              <input
                type="number"
                value={pickerYear}
                onChange={(e) => setPickerYear(Number(e.target.value))}
                className="w-20 rounded-md border border-gray-300 px-2 py-1 text-sm font-normal"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                className="rounded-md px-2 py-1 text-xs font-normal normal-case text-gray-500 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={goToPicked}
                className="rounded-md bg-primary-500 px-2 py-1 text-xs font-normal normal-case text-white hover:bg-primary-600"
              >
                Go
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="inline-flex gap-1 rounded-full bg-gray-100 p-1">
        {viewList.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onView(v)}
            className={`rounded-full px-4 py-1.5 text-xs font-bold tracking-wide uppercase transition-all duration-150 ${
              v === view
                ? "bg-primary-500 text-white shadow-sm"
                : "text-gray-600 hover:bg-white hover:text-primary-600 hover:shadow-sm"
            }`}
          >
            {v}
          </button>
        ))}
      </div>
    </div>
  );
}
