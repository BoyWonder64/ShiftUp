/**
 * Keeps a crowded calendar readable by collapsing events into summary blocks
 * *before* they reach the grid, so the grid never has to split a day column
 * into more slivers than it has room for.
 *
 * Two kinds of block, both only ever created where the calendar is actually
 * crowded (a small team keeps seeing every entry individually):
 *
 * - "same": entries that are the same thing at the same time (15 people on
 *   the 9-5 shift) become one block - "Shift · 15 staff".
 * - "overflow": whatever still doesn't fit side by side after that is rolled
 *   into a "+N more" block in the last lane.
 *
 * Generic over the event shape (the caller supplies how to key and build a
 * group) so this stays a pure function, testable without the calendar.
 */
export type CondensedKind = "same" | "overflow";

interface Timed {
  start: Date;
  end: Date;
}

export interface CondenseOptions<T> {
  /**
   * "time" (Week/Day grid): `limit` is how many blocks may sit side by side
   * at any one moment. "day" (Month): `limit` is how many entries a day may
   * hold before identical ones are grouped - Month has its own "+N more", so
   * no overflow blocks are made there.
   */
  mode: "time" | "day";
  limit: number;
  /**
   * Identical entries start sharing a block once more than this many things
   * are happening at once. Defaults to `limit`; set it lower when lanes near
   * the limit are too narrow to show a name, so "4 on the same shift" reads
   * as one labelled block rather than four anonymous bars.
   */
  groupLimit?: number;
  /** Entries with the same key *and* the same start/end are interchangeable enough to share one block. */
  groupKey: (event: T) => string;
  makeGroup: (members: T[], kind: CondensedKind) => T;
}

interface Node<T> {
  s: number;
  e: number;
  members: T[];
  out: T;
  lane: number;
}

const MIN_SPAN_MS = 60_000;

export function condenseEvents<T extends Timed>(events: T[], options: CondenseOptions<T>): T[] {
  const { mode, groupKey, makeGroup } = options;
  const limit = Math.max(mode === "time" ? 2 : 1, Math.floor(options.limit));
  const groupLimit = Math.max(1, Math.min(limit, Math.floor(options.groupLimit ?? limit)));
  if (events.length <= groupLimit) return events;

  const S = events.map((ev) => ev.start.getTime());
  const E = events.map((ev, i) => Math.max(ev.end.getTime(), S[i] + MIN_SPAN_MS));

  // --- Where is it crowded? -------------------------------------------------
  let isCrowded: (index: number) => boolean;
  if (mode === "day") {
    const perDay = new Map<string, number>();
    const dayKeys = events.map((ev) => ev.start.toDateString());
    for (const key of dayKeys) perDay.set(key, (perDay.get(key) ?? 0) + 1);
    isCrowded = (i) => (perDay.get(dayKeys[i]) ?? 0) > groupLimit;
  } else {
    // Concurrency only ever rises at an event's start, so the busiest moment
    // within any span is found at one of the starts inside it.
    const order = events.map((_, i) => i).sort((a, b) => S[a] - S[b] || E[b] - E[a]);
    const starts = order.map((i) => S[i]);
    const ends = [...E].sort((a, b) => a - b);
    const posOf: number[] = [];
    order.forEach((i, k) => (posOf[i] = k));
    const concurrent: number[] = new Array(starts.length);
    let ended = 0;
    let started = 0;
    for (let k = 0; k < starts.length; k++) {
      while (started < starts.length && starts[started] <= starts[k]) started++;
      while (ended < ends.length && ends[ended] <= starts[k]) ended++;
      concurrent[k] = started - ended;
    }
    isCrowded = (i) => {
      for (let k = posOf[i]; k < starts.length && starts[k] < E[i]; k++) {
        if (concurrent[k] > groupLimit) return true;
      }
      return false;
    };
  }

  // --- Pass 1: identical entries share one block where it's crowded ---------
  const buckets = new Map<string, number[]>();
  events.forEach((ev, i) => {
    const key = `${S[i]}|${E[i]}|${groupKey(ev)}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(i);
    else buckets.set(key, [i]);
  });
  const nodes: Node<T>[] = [];
  for (const bucket of buckets.values()) {
    const first = bucket[0];
    if (bucket.length > 1 && isCrowded(first)) {
      const members = bucket.map((i) => events[i]);
      nodes.push({ s: S[first], e: E[first], members, out: makeGroup(members, "same"), lane: 0 });
    } else {
      for (const i of bucket) nodes.push({ s: S[i], e: E[i], members: [events[i]], out: events[i], lane: 0 });
    }
  }
  if (mode === "day") return nodes.map((n) => n.out);

  // --- Pass 2: cap how many blocks sit side by side --------------------------
  // First-fit over start-sorted intervals never uses more lanes than are
  // genuinely concurrent, so anything landing past the limit really is excess.
  nodes.sort((a, b) => a.s - b.s || b.e - a.e);
  const laneEnds: number[] = [];
  for (const node of nodes) {
    let lane = laneEnds.findIndex((end) => end <= node.s);
    if (lane < 0) lane = laneEnds.length;
    laneEnds[lane] = node.e;
    node.lane = lane;
  }
  const overflow = new Set(nodes.filter((n) => n.lane >= limit));
  if (overflow.size === 0) return nodes.map((n) => n.out);

  // The "+N more" block needs the last lane to itself wherever it appears, so
  // whatever was in that lane alongside it joins it.
  const lastLane = nodes.filter((n) => n.lane === limit - 1);
  for (let changed = true; changed; ) {
    changed = false;
    for (const candidate of lastLane) {
      if (overflow.has(candidate)) continue;
      for (const o of overflow) {
        if (o.s < candidate.e && candidate.s < o.e) {
          overflow.add(candidate);
          changed = true;
          break;
        }
      }
    }
  }

  const result: T[] = [];
  let run: Node<T>[] = [];
  let runEnd = 0;
  const flushRun = () => {
    if (run.length === 1) result.push(run[0].out);
    else if (run.length > 1) result.push(makeGroup(run.flatMap((n) => n.members), "overflow"));
    run = [];
  };
  for (const node of nodes) {
    if (!overflow.has(node)) {
      result.push(node.out);
      continue;
    }
    // One block per continuous stretch, and never one that runs on across
    // several days just because overnight entries chain them together.
    const continues =
      run.length > 0 && node.s < runEnd && new Date(node.s).toDateString() === new Date(run[0].s).toDateString();
    if (!continues) flushRun();
    run.push(node);
    runEnd = run.length === 1 ? node.e : Math.max(runEnd, node.e);
  }
  flushRun();
  return result;
}
