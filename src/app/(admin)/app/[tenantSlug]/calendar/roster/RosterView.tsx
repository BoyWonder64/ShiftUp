"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { startOfWeek, format } from "date-fns";
import { enUS } from "date-fns/locale";
import {
  appointmentTitle,
  fetchJson,
  isShift,
  type ApiAppointment,
  type StaffOption,
} from "../SchedulingCalendar";
import {
  buildColorTriples,
  resolveEventColor,
  resolveEventColors,
  type ColorTriple,
  type EventColorKey,
} from "@/lib/colors/eventColors";

type ViewGranularity = "day" | "week";

function rangeFor(date: Date, granularity: ViewGranularity): { start: Date; end: Date } {
  if (granularity === "day") {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end };
  }
  const start = startOfWeek(date, { locale: enUS });
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { start, end };
}

export function RosterView({ tenantSlug }: { tenantSlug: string }) {
  const [granularity, setGranularity] = useState<ViewGranularity>("week");
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [appointments, setAppointments] = useState<ApiAppointment[]>([]);
  // Tenant-personalized event colors - fetched here rather than imported from
  // SchedulingCalendar.tsx so this view renders the same colors without a
  // dependency on that component's internal state.
  const [colorTriples, setColorTriples] = useState<Record<EventColorKey, ColorTriple>>(() =>
    buildColorTriples(resolveEventColors(undefined))
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(() => rangeFor(anchorDate, granularity), [anchorDate, granularity]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [staffData, apptData, settingsData] = await Promise.all([
          fetchJson<{ staff: StaffOption[] }>("/api/staff"),
          fetchJson<{ appointments: ApiAppointment[] }>(
            `/api/appointments?start=${range.start.toISOString()}&end=${range.end.toISOString()}`
          ),
          fetchJson<{ settings: { eventColors: Record<EventColorKey, string> } }>("/api/tenant-settings"),
        ]);
        if (cancelled) return;
        setStaff(staffData.staff);
        setAppointments(apptData.appointments);
        setColorTriples(buildColorTriples(resolveEventColors(settingsData.settings.eventColors)));
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Couldn't load the roster.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [range.start, range.end]);

  const byStaff = useMemo(() => {
    const map = new Map<string, ApiAppointment[]>();
    for (const appt of appointments) {
      const list = map.get(appt.staffId) ?? [];
      list.push(appt);
      map.set(appt.staffId, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    }
    return map;
  }, [appointments]);

  function go(delta: number) {
    setAnchorDate((prev) => {
      const next = new Date(prev);
      next.setDate(next.getDate() + delta * (granularity === "day" ? 1 : 7));
      return next;
    });
  }

  const rangeLabel =
    granularity === "day"
      ? format(range.start, "EEEE, MMMM d, yyyy")
      : `${format(range.start, "MMM d")} – ${format(new Date(range.end.getTime() - 1), "MMM d, yyyy")}`;

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex gap-1 rounded-full bg-gray-100 p-1 text-sm">
          <button
            type="button"
            onClick={() => setAnchorDate(new Date())}
            className="rounded-full px-3 py-1.5 font-medium text-gray-600 transition-colors hover:text-primary-600"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => go(-1)}
            className="rounded-full px-3 py-1.5 font-medium text-gray-600 transition-colors hover:text-primary-600"
          >
            Back
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            className="rounded-full px-3 py-1.5 font-medium text-gray-600 transition-colors hover:text-primary-600"
          >
            Next
          </button>
        </div>

        <p className="text-lg font-medium text-gray-900">{rangeLabel}</p>

        <div className="inline-flex gap-1 rounded-full bg-gray-100 p-1 text-sm">
          {(["day", "week"] as const).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGranularity(g)}
              className={`rounded-full px-3 py-1.5 font-medium capitalize transition-all duration-150 ${
                granularity === g
                  ? "bg-white text-primary-700 shadow-sm"
                  : "text-gray-600 hover:text-primary-600"
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : staff.length === 0 ? (
        <p className="text-sm text-gray-400">No staff yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {staff.map((member) => {
            const items = byStaff.get(member.id) ?? [];
            const apptCount = items.filter((i) => !isShift(i)).length;
            const shiftCount = items.filter(isShift).length;
            return (
              <div key={member.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-baseline gap-2">
                    <h2 className="text-base font-medium text-gray-900">{member.displayName}</h2>
                    <span className="text-xs text-gray-400">
                      {apptCount} appointment{apptCount === 1 ? "" : "s"} · {shiftCount} shift
                      {shiftCount === 1 ? "" : "s"}
                    </span>
                  </div>
                  <Link
                    href={`/app/${tenantSlug}/calendar?staff=${member.id}`}
                    className="text-xs font-medium text-primary-700 hover:underline"
                  >
                    View full calendar →
                  </Link>
                </div>

                {items.length === 0 ? (
                  <p className="mt-2 text-sm text-gray-400">Nothing scheduled.</p>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {items.map((appt) => {
                      const c = resolveEventColor(
                        { status: appt.status, isShift: isShift(appt), tagColor: appt.tag?.color, colorKey: appt.colorKey },
                        colorTriples
                      );
                      const cancelled = appt.status === "CANCELLED";
                      const timeLabel =
                        granularity === "day"
                          ? `${format(new Date(appt.startTime), "h:mm a")} – ${format(new Date(appt.endTime), "h:mm a")}`
                          : format(new Date(appt.startTime), "EEE h:mm a");
                      return (
                        <span
                          key={appt.id}
                          title={appointmentTitle(appt)}
                          className="inline-flex max-w-[16rem] items-center gap-1.5 rounded-full px-2.5 py-1 text-xs"
                          style={{
                            backgroundColor: cancelled
                              ? colorTriples.cancelled.bg
                              : `color-mix(in srgb, ${c.bg} 15%, white)`,
                            color: cancelled ? colorTriples.cancelled.text : c.border,
                            textDecoration: cancelled ? "line-through" : undefined,
                          }}
                        >
                          <span className="shrink-0 font-medium">{timeLabel}</span>
                          <span className="truncate">{appointmentTitle(appt)}</span>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
