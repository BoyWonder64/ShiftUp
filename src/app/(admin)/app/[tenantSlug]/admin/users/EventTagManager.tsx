"use client";

import { useEffect, useState } from "react";

interface EventTag {
  id: string;
  name: string;
  color: string;
}

export function EventTagManager() {
  const [tags, setTags] = useState<EventTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#2563eb");
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/event-tags");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
      setTags(data.tags);
    } catch {
      setError("Couldn't load tags.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/event-tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), color }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create");
      setTags((prev) => [...prev, data.tag].sort((a, b) => a.name.localeCompare(b.name)));
      setName("");
      setColor("#2563eb");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create tag.");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/event-tags/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete");
      setTags((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete tag.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-medium">Custom color tags</h2>
      <p className="mt-1 text-sm text-gray-500">
        Extra, named colors anyone can assign to an individual appointment or
        shift when creating it - on top of the 5 built-in colors above. e.g.
        &quot;VIP&quot;, &quot;Consultation&quot;.
      </p>

      {loading ? (
        <p className="mt-4 text-sm text-gray-400">Loading...</p>
      ) : (
        <>
          {tags.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-2">
              {tags.map((tag) => (
                <li
                  key={tag.id}
                  className="flex items-center gap-2 rounded-full border border-gray-200 py-1 pr-2 pl-3 text-sm"
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tag.color }} />
                  {tag.name}
                  <button
                    type="button"
                    onClick={() => void handleDelete(tag.id)}
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

          <form onSubmit={handleCreate} className="mt-4 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm">
              New tag name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. VIP"
                maxLength={60}
                className="rounded-md border border-gray-300 px-2 py-1"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Color
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-9 w-14 cursor-pointer rounded-md border border-gray-300"
              />
            </label>
            <button
              type="submit"
              disabled={creating || !name.trim()}
              className="rounded-lg bg-primary-500 px-4 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-600 disabled:opacity-50"
            >
              {creating ? "Adding..." : "+ Add tag"}
            </button>
          </form>
        </>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </section>
  );
}
