export const EVENT_COLOR_KEYS = ["appointment", "shift", "completed", "noShow", "cancelled"] as const;
export type EventColorKey = (typeof EVENT_COLOR_KEYS)[number];

export const EVENT_COLOR_LABELS: Record<EventColorKey, string> = {
  appointment: "Appointment",
  shift: "Shift",
  completed: "Completed",
  noShow: "No-show",
  cancelled: "Cancelled",
};

/** The original hardcoded palette - still the default for any tenant that hasn't overridden a given key. */
export const DEFAULT_EVENT_COLORS: Record<EventColorKey, string> = {
  appointment: "#1e90ff", // dodger blue (--color-primary-500)
  shift: "#333366", // Rockies purple (--color-shift-500)
  completed: "#9ca3af",
  noShow: "#f59e0b",
  cancelled: "#e5e7eb",
};

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

/**
 * Merges a tenant's `eventColors` JSON column (sparse - only overridden keys
 * present) over the hardcoded defaults. Defensive against malformed/stale
 * stored JSON (wrong shape, bad hex, keys that no longer exist) so a
 * corrupted override can never crash rendering - it just falls back to the
 * default for that one key.
 */
export function resolveEventColors(overrides: unknown): Record<EventColorKey, string> {
  const resolved = { ...DEFAULT_EVENT_COLORS };
  if (!overrides || typeof overrides !== "object") return resolved;
  for (const key of EVENT_COLOR_KEYS) {
    const value = (overrides as Record<string, unknown>)[key];
    if (typeof value === "string" && HEX_COLOR_PATTERN.test(value)) {
      resolved[key] = value;
    }
  }
  return resolved;
}

export function isValidHexColor(value: string): boolean {
  return HEX_COLOR_PATTERN.test(value);
}

/** Type guard for the "Color key" picker's built-in options (Appointment/Shift/Completed/No-show/Cancelled), as opposed to a custom EventTag id. */
export function isEventColorKey(value: string): value is EventColorKey {
  return (EVENT_COLOR_KEYS as readonly string[]).includes(value);
}

export interface ColorTriple {
  bg: string;
  border: string;
  text: string;
}

function clamp255(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

/** Darkens (negative percent) or lightens (positive) a #rrggbb hex color by the given percent of the 0-255 range per channel. */
function shadeHex(hex: string, percent: number): string {
  const n = parseInt(hex.slice(1), 16);
  const amount = Math.round(2.55 * percent);
  const r = clamp255(((n >> 16) & 0xff) + amount);
  const g = clamp255(((n >> 8) & 0xff) + amount);
  const b = clamp255((n & 0xff) + amount);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

/** Standard YIQ perceived-brightness check - picks white or near-black text for readable contrast against an arbitrary background color. */
function readableTextColor(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 150 ? "#111827" : "#ffffff";
}

/** Derives the {bg, border, text} triple the rest of the app renders from a single admin/user-picked hex color - a border ~15% darker than the fill, and white/dark text chosen for contrast against it. */
export function colorTripleFromHex(hex: string): ColorTriple {
  return { bg: hex, border: shadeHex(hex, -15), text: readableTextColor(hex) };
}

export function buildColorTriples(colors: Record<EventColorKey, string>): Record<EventColorKey, ColorTriple> {
  return {
    appointment: colorTripleFromHex(colors.appointment),
    shift: colorTripleFromHex(colors.shift),
    completed: colorTripleFromHex(colors.completed),
    noShow: colorTripleFromHex(colors.noShow),
    cancelled: colorTripleFromHex(colors.cancelled),
  };
}

/**
 * Which color triple an appointment/shift renders in, shared by the main
 * calendar (SchedulingCalendar.tsx) and the roster drill-down (RosterView.tsx)
 * so the two never disagree on an event's color. The "Color key" picker lets
 * an entry use either a custom tag color or one of the 5 built-in keys
 * directly (colorKey) - both override the appointment/shift default, but a
 * terminal status (cancelled/no-show/completed) always wins over either, same
 * as it always has for a custom tag.
 */
export function resolveEventColor(
  event: { status: string; isShift: boolean; tagColor?: string | null; colorKey?: string | null },
  colors: Record<EventColorKey, ColorTriple>
): ColorTriple {
  if (event.status === "CANCELLED") return colors.cancelled;
  if (event.status === "NO_SHOW") return colors.noShow;
  if (event.status === "COMPLETED") return colors.completed;
  if (event.tagColor) return colorTripleFromHex(event.tagColor);
  if (event.colorKey && isEventColorKey(event.colorKey)) return colors[event.colorKey];
  return event.isShift ? colors.shift : colors.appointment;
}
