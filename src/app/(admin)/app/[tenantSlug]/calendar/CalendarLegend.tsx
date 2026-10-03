import type { ComputedHoliday } from "@/lib/holidays/federal";

export interface BlockedSpan {
  title: string;
  start: Date;
  end: Date;
}

export function CalendarLegend({
  legendItems,
  holidaysInView,
  blockedInView,
}: {
  legendItems: Array<{ key: string; label: string; color: string }>;
  holidaysInView: ComputedHoliday[];
  blockedInView: BlockedSpan[];
}) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-gray-100 bg-gray-50 px-4 py-2.5">
        {legendItems.map((item) => (
          <div key={item.key} className="flex items-center gap-1.5 text-xs text-gray-600">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
            {item.label}
          </div>
        ))}
      </div>

      {holidaysInView.length > 0 && (
        <p className="text-xs text-gray-500">
          <span className="font-medium text-gray-600">Holidays in view:</span>{" "}
          {holidaysInView.map((h, i) => (
            <span key={`${h.name}-${h.date.toISOString()}`}>
              {i > 0 && ", "}
              {h.name} ({h.date.toLocaleDateString("en-US", { month: "short", day: "numeric" })})
            </span>
          ))}
        </p>
      )}

      {blockedInView.length > 0 && (
        <p className="text-xs text-gray-500">
          <span className="font-medium text-gray-600">Blocked in view:</span>{" "}
          {blockedInView.map((b, i) => (
            <span key={`${b.title}-${b.start.toISOString()}`}>
              {i > 0 && ", "}
              {b.title} ({b.start.toLocaleDateString("en-US", { month: "short", day: "numeric" })})
            </span>
          ))}
        </p>
      )}
    </>
  );
}
