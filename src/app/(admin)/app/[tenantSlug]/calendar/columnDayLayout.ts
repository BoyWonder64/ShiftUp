import type { DayLayoutFunction } from "react-big-calendar";

// Horizontal gap left between neighbouring events, in px (globals.css's
// 1.5px side margin on `.rbc-day-slot .rbc-event` centres the event in it).
const GAP_PX = 3;

interface Item<T> {
  event: T;
  startMs: number;
  endMs: number;
  top: number;
  height: number;
  col: number;
}

/**
 * Week/Day layout: every event gets its own lane and nothing is ever drawn
 * on top of anything else.
 *
 * Events that overlap in time (directly or through a chain of others) form
 * a cluster; the cluster is as many lanes wide as its busiest moment, and
 * each event takes the first lane free at its start. An event then widens to
 * the right across any lanes nothing else is using during its span, so a
 * lone early-morning shift isn't left as a sliver just because the afternoon
 * is busy.
 *
 * Lanes only stay legible because SchedulingCalendar caps how many can occur
 * (condenseEvents.ts turns the excess into grouped / "+N more" blocks before
 * events get here) and because event content adapts to its lane's width
 * (the container queries in globals.css).
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
    for (const item of cluster) {
      let span = 1;
      while (
        item.col + span < cols &&
        !cluster.some((o) => o.col === item.col + span && o.startMs < item.endMs && item.startMs < o.endMs)
      ) {
        span++;
      }
      styled.push({
        event: item.event,
        style: {
          top: item.top,
          height: item.height,
          width: `calc(${(span / cols) * 100}% - ${GAP_PX}px)`,
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
