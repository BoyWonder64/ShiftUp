import type { DayLayoutFunction } from "react-big-calendar";

// Horizontal gap left between events that sit side by side, in px
// (globals.css's 1.5px side margin on `.rbc-day-slot .rbc-event` centres the
// event in it).
const GAP_PX = 3;
// How far an event runs on underneath the later event to its right, as a
// fraction of one lane - Google Calendar's "overlaps, but only a little".
const SPILL = 0.7;
// A neighbour only counts as "later" (and so may cover part of this event)
// if it starts at least this long after it - enough for this event's first
// line to stay clear above it. Closer starts sit side by side instead.
const SPILL_AFTER_MS = 30 * 60_000;

interface Item<T> {
  event: T;
  startMs: number;
  endMs: number;
  top: number;
  height: number;
  col: number;
}

const overlaps = <T>(a: Item<T>, b: Item<T>) => a.startMs < b.endMs && b.startMs < a.endMs;

/**
 * Week/Day layout modeled on Google Calendar.
 *
 * Events that overlap in time (directly or through a chain of others) form
 * a cluster; the cluster is as many lanes wide as its busiest moment, and
 * each event takes the first lane free at its start. From there:
 *
 * - An event widens to the right across any lanes nothing else is using
 *   during its span, so a lone morning shift isn't a sliver just because the
 *   afternoon is busy.
 * - Events that start together sit cleanly side by side.
 * - When the event in the next lane starts later, this one runs on
 *   underneath it for most of a lane (SPILL) and the later one is drawn on
 *   top. The earlier event keeps its own lane - its left edge and its first
 *   lines - fully visible, and reads as wider than a strict column split
 *   would allow.
 *
 * "On top" is DOM order: events are returned left lane first and carry no
 * z-index of their own, so each lane paints over the one to its left.
 *
 * SchedulingCalendar caps how many lanes can occur (condenseEvents.ts turns
 * same-shift people into one block and any excess into "+N more" before
 * events get here), which is what Google itself lacks on a busy day.
 */
export function columnDayLayout<T extends object>({
  events,
  slotMetrics,
  accessors,
}: Parameters<DayLayoutFunction<T>>[0]): ReturnType<DayLayoutFunction<T>> {
  const items: Item<T>[] = events.map((event) => {
    const range = slotMetrics.getRange(accessors.start(event), accessors.end(event));
    return { event, startMs: +range.startDate, endMs: +range.endDate, top: range.top, height: range.height, col: 0 };
  });
  items.sort((a, b) => a.startMs - b.startMs || b.endMs - a.endMs);

  const styled: ReturnType<DayLayoutFunction<T>> = [];
  const placeCluster = (cluster: Item<T>[]) => {
    const laneEnds: number[] = [];
    for (const item of cluster) {
      let col = laneEnds.findIndex((end) => end <= item.startMs);
      if (col < 0) col = laneEnds.length;
      laneEnds[col] = item.endMs;
      item.col = col;
    }
    const cols = laneEnds.length;
    const neighboursIn = (item: Item<T>, col: number) => cluster.filter((o) => o.col === col && overlaps(o, item));

    for (const item of [...cluster].sort((a, b) => a.col - b.col || a.startMs - b.startMs)) {
      let span = 1;
      while (item.col + span < cols && neighboursIn(item, item.col + span).length === 0) span++;
      const next = item.col + span < cols ? neighboursIn(item, item.col + span) : [];
      const spills = next.length > 0 && next.every((o) => o.startMs >= item.startMs + SPILL_AFTER_MS);
      const lanes = span + (spills ? SPILL : 0);
      styled.push({
        event: item.event,
        style: {
          top: item.top,
          height: item.height,
          width: spills ? `${(lanes / cols) * 100}%` : `calc(${(lanes / cols) * 100}% - ${GAP_PX}px)`,
          xOffset: (item.col / cols) * 100,
        } as React.CSSProperties,
      });
    }
  };

  let cluster: Item<T>[] = [];
  let clusterEnd = 0;
  for (const item of items) {
    if (cluster.length > 0 && item.startMs >= clusterEnd) {
      placeCluster(cluster);
      cluster = [];
    }
    clusterEnd = cluster.length === 0 ? item.endMs : Math.max(clusterEnd, item.endMs);
    cluster.push(item);
  }
  if (cluster.length > 0) placeCluster(cluster);
  return styled;
}
