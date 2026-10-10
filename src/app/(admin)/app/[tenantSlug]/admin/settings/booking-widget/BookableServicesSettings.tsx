"use client";

import { useEffect, useState } from "react";

interface ServiceType {
  id: string;
  name: string;
  durationMinutes: number;
  isActive: boolean;
  isPubliclyBookable: boolean;
}

/** Which active service types show up as a choice on the public booking page - a subset of what Settings > Appointments' ServiceTypeManager manages, not a separate list of its own. */
export function BookableServicesSettings() {
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/service-types");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load");
        setServiceTypes(data.serviceTypes.filter((s: ServiceType) => s.isActive));
      } catch {
        setError("Couldn't load service types.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleToggle(s: ServiceType) {
    const next = !s.isPubliclyBookable;
    setServiceTypes((prev) => prev.map((t) => (t.id === s.id ? { ...t, isPubliclyBookable: next } : t)));
    setTogglingId(s.id);
    setError(null);
    try {
      const res = await fetch(`/api/service-types/${s.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPubliclyBookable: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
    } catch (err) {
      setServiceTypes((prev) => prev.map((t) => (t.id === s.id ? { ...t, isPubliclyBookable: s.isPubliclyBookable } : t)));
      setError(err instanceof Error ? err.message : "Couldn't update.");
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-medium">Bookable services</h2>
      <p className="mt-1 text-sm text-gray-500">
        Which active service types a visitor can choose on the public booking page. Add or edit service types
        themselves from Settings &gt; Appointments.
      </p>

      {loading ? (
        <p className="mt-4 text-sm text-gray-400">Loading...</p>
      ) : serviceTypes.length === 0 ? (
        <p className="mt-4 text-sm text-gray-400">No active service types yet - add one under Settings &gt; Appointments.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-1.5">
          {serviceTypes.map((s) => (
            <li key={s.id} className="flex items-center justify-between rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
              <span>
                <span className="font-medium text-gray-900">{s.name}</span>{" "}
                <span className="text-gray-500">— {s.durationMinutes} min</span>
              </span>
              <label className="flex items-center gap-1.5 text-xs text-gray-500">
                <input
                  type="checkbox"
                  checked={s.isPubliclyBookable}
                  disabled={togglingId === s.id}
                  onChange={() => void handleToggle(s)}
                  className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                Bookable online
              </label>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </section>
  );
}
