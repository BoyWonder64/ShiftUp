"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_EVENT_COLORS,
  EVENT_COLOR_KEYS,
  EVENT_COLOR_LABELS,
  type EventColorKey,
} from "@/lib/colors/eventColors";

type TagScope = "SHIFT" | "APPOINTMENT" | "BOTH";

interface EventTag {
  id: string;
  name: string;
  color: string;
  appliesTo: TagScope;
}

const SCOPE_LABELS: Record<TagScope, string> = {
  SHIFT: "Shift only",
  APPOINTMENT: "Appointment only",
  BOTH: "Both",
};

/**
 * One unified "Color key" settings card - previously two separate cards
 * (fixed 5-status colors, and a differently-named "Custom color tags" list)
 * that both did the same underlying thing (set a color an appointment/shift
 * renders in), which read as two unrelated features. Now one list: the 5
 * built-in entries up top (status-driven, can't be removed, just recolored),
 * your own below (add as many as you want, assign one to an individual
 * appointment/shift's "Color key" field when scheduling it - same field
 * that used to be labeled "Tag"). Lives on the Staff settings page (moved
 * from Calendar) since color keys/tags are a staff-scheduling concern.
 */
export function EventColorSettings() {
  const [colors, setColors] = useState<Record<EventColorKey, string> | null>(null);
  const [loadingColors, setLoadingColors] = useState(true);
  const [savingKey, setSavingKey] = useState<EventColorKey | null>(null);
  const [colorError, setColorError] = useState<string | null>(null);

  const [tags, setTags] = useState<EventTag[]>([]);
  const [loadingTags, setLoadingTags] = useState(true);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#2563eb");
  const [newScope, setNewScope] = useState<TagScope>("BOTH");
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [tagError, setTagError] = useState<string | null>(null);

  async function loadColors() {
    try {
      const res = await fetch("/api/tenant-settings");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
      setColors(data.settings.eventColors);
    } catch {
      setColorError("Couldn't load colors.");
    } finally {
      setLoadingColors(false);
    }
  }

  async function loadTags() {
    try {
      const res = await fetch("/api/event-tags");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
      setTags(data.tags);
    } catch {
      setTagError("Couldn't load your color keys.");
    } finally {
      setLoadingTags(false);
    }
  }

  useEffect(() => {
    (async () => {
      await Promise.all([loadColors(), loadTags()]);
    })();
  }, []);

  async function saveColor(key: EventColorKey, color: string) {
    setColors((prev) => (prev ? { ...prev, [key]: color } : prev));
    setSavingKey(key);
    setColorError(null);
    try {
      const res = await fetch("/api/tenant-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventColors: { [key]: color } }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setColors(data.settings.eventColors);
    } catch {
      setColorError("Couldn't save - try again.");
    } finally {
      setSavingKey(null);
    }
  }

  async function handleCreateTag(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setTagError(null);
    try {
      const res = await fetch("/api/event-tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), color: newColor, appliesTo: newScope }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create");
      setTags((prev) => [...prev, data.tag].sort((a, b) => a.name.localeCompare(b.name)));
      setNewName("");
      setNewColor("#2563eb");
      setNewScope("BOTH");
    } catch (err) {
      setTagError(err instanceof Error ? err.message : "Couldn't add that color key.");
    } finally {
      setCreating(false);
    }
  }

  async function handleDeleteTag(id: string) {
    setDeletingId(id);
    setTagError(null);
    try {
      const res = await fetch(`/api/event-tags/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete");
      setTags((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      setTagError(err instanceof Error ? err.message : "Couldn't remove that color key.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-medium">Color key</h2>
      <p className="mt-1 text-sm text-gray-500">
        Controls the colors on the calendar&apos;s legend and event pills. The
        5 built-in colors below apply automatically based on an
        appointment/shift&apos;s status. Add your own below that - anyone can
        then pick one from the &quot;Color key&quot; field when creating or
        editing an individual appointment or shift, to color-code it however
        you like (e.g. &quot;VIP&quot;, &quot;Consultation&quot;). Each one can
        be scoped to shifts only, appointments only, or both - a scoped tag
        only shows up on that picker.
      </p>

      <h3 className="mt-5 text-xs font-semibold tracking-wide text-gray-500 uppercase">Built in</h3>
      {loadingColors || !colors ? (
        <p className="mt-3 text-sm text-gray-400">Loading...</p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-4">
          {EVENT_COLOR_KEYS.map((key) => (
            <div key={key} className="flex flex-col items-center gap-1.5">
              <label className="text-xs font-medium text-gray-600">{EVENT_COLOR_LABELS[key]}</label>
              <input
                type="color"
                value={colors[key]}
                onChange={(e) => void saveColor(key, e.target.value)}
                disabled={savingKey === key}
                className="h-9 w-14 cursor-pointer rounded-md border border-gray-300 disabled:opacity-50"
              />
              {colors[key] !== DEFAULT_EVENT_COLORS[key] && (
                <button
                  type="button"
                  onClick={() => void saveColor(key, DEFAULT_EVENT_COLORS[key])}
                  className="text-[11px] text-gray-400 hover:text-primary-600 hover:underline"
                >
                  Reset
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {colorError && <p className="mt-2 text-sm text-red-600">{colorError}</p>}

      <h3 className="mt-6 text-xs font-semibold tracking-wide text-gray-500 uppercase">Your own</h3>
      {loadingTags ? (
        <p className="mt-3 text-sm text-gray-400">Loading...</p>
      ) : (
        <>
          {tags.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2">
              {tags.map((tag) => (
                <li
                  key={tag.id}
                  className="flex items-center gap-2 rounded-full border border-gray-200 py-1 pr-2 pl-3 text-sm"
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tag.color }} />
                  {tag.name}
                  {tag.appliesTo !== "BOTH" && (
                    <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                      {SCOPE_LABELS[tag.appliesTo]}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleDeleteTag(tag.id)}
                    disabled={deletingId === tag.id}
                    className="rounded-full px-1.5 text-xs text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                    title={`Remove "${tag.name}"`}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={handleCreateTag} className="mt-3 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm">
              New color key name
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. VIP"
                maxLength={60}
                className="rounded-md border border-gray-300 px-2 py-1"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Color
              <input
                type="color"
                value={newColor}
                onChange={(e) => setNewColor(e.target.value)}
                className="h-9 w-14 cursor-pointer rounded-md border border-gray-300"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Applies to
              <select
                value={newScope}
                onChange={(e) => setNewScope(e.target.value as TagScope)}
                className="rounded-md border border-gray-300 px-2 py-1.5"
              >
                <option value="BOTH">Both</option>
                <option value="SHIFT">Shift only</option>
                <option value="APPOINTMENT">Appointment only</option>
              </select>
            </label>
            <button
              type="submit"
              disabled={creating || !newName.trim()}
              className="rounded-lg bg-primary-500 px-4 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-600 disabled:opacity-50"
            >
              {creating ? "Adding..." : "+ Add color key"}
            </button>
          </form>
        </>
      )}
      {tagError && <p className="mt-2 text-sm text-red-600">{tagError}</p>}
    </section>
  );
}
