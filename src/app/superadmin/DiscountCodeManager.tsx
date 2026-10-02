"use client";

import { useEffect, useState } from "react";

type DiscountType = "PERCENT" | "FIXED_CENTS";

interface DiscountCode {
  id: string;
  code: string;
  type: DiscountType;
  value: number;
  active: boolean;
  createdAt: string;
}

function formatValue(code: DiscountCode): string {
  return code.type === "PERCENT" ? `${code.value}% off` : `$${(code.value / 100).toFixed(2)} off`;
}

export function DiscountCodeManager() {
  const [codes, setCodes] = useState<DiscountCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState("");
  const [type, setType] = useState<DiscountType>("PERCENT");
  const [value, setValue] = useState("");
  const [creating, setCreating] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/superadmin/discount-codes");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load");
        if (!cancelled) setCodes(data.codes);
      } catch {
        if (!cancelled) setError("Couldn't load discount codes.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const numericValue = Number(value);
    if (!code.trim() || !Number.isInteger(numericValue) || numericValue <= 0) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/superadmin/discount-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim(), type, value: numericValue }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create");
      setCodes((prev) => [data.code, ...prev]);
      setCode("");
      setValue("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create code.");
    } finally {
      setCreating(false);
    }
  }

  async function handleToggle(id: string, active: boolean) {
    setTogglingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/superadmin/discount-codes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update");
      setCodes((prev) => prev.map((c) => (c.id === id ? data.code : c)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't update code.");
    } finally {
      setTogglingId(null);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/superadmin/discount-codes/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete");
      setCodes((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't remove code.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-medium">Discount codes</h2>
      <p className="mt-1 text-sm text-gray-500">
        For quoting/tracking a negotiated discount by hand. Not yet wired into the Stripe checkout
        flow itself - redeeming one against a real purchase is still a manual step for now.
      </p>

      {loading ? (
        <p className="mt-4 text-sm text-gray-400">Loading...</p>
      ) : (
        <>
          {codes.length > 0 && (
            <ul className="mt-4 flex flex-col gap-1.5">
              {codes.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm"
                >
                  <span>
                    <span className="font-mono font-medium text-gray-900">{c.code}</span>{" "}
                    <span className="text-gray-500">— {formatValue(c)}</span>
                    {!c.active && <span className="ml-1.5 text-xs text-gray-400">(inactive)</span>}
                  </span>
                  <span className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => void handleToggle(c.id, !c.active)}
                      disabled={togglingId === c.id}
                      className="text-xs text-gray-400 hover:text-primary-600 disabled:opacity-50"
                    >
                      {c.active ? "Deactivate" : "Activate"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(c.id)}
                      disabled={deletingId === c.id}
                      className="text-xs text-gray-400 hover:text-red-600 disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={handleCreate} className="mt-4 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm">
              Code
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g. LAUNCH20"
                maxLength={40}
                className="rounded-md border border-gray-300 px-2 py-1 font-mono uppercase"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Type
              <select
                value={type}
                onChange={(e) => setType(e.target.value as DiscountType)}
                className="rounded-md border border-gray-300 px-2 py-1"
              >
                <option value="PERCENT">% off</option>
                <option value="FIXED_CENTS">$ off</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {type === "PERCENT" ? "Percent" : "Cents"}
              <input
                type="number"
                min={1}
                max={type === "PERCENT" ? 100 : undefined}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={type === "PERCENT" ? "20" : "2000"}
                className="w-28 rounded-md border border-gray-300 px-2 py-1"
              />
            </label>
            <button
              type="submit"
              disabled={creating || !code.trim() || !value}
              className="rounded-lg bg-primary-500 px-4 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-600 disabled:opacity-50"
            >
              {creating ? "Adding..." : "+ Add code"}
            </button>
          </form>
        </>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </section>
  );
}
