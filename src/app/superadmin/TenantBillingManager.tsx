"use client";

import { useEffect, useState } from "react";

type BillingPlan = "FREE" | "ONE_TIME" | "SUBSCRIPTION";
type LicenseStatus = "ACTIVE" | "EXPIRED";

interface Tenant {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  disabled: boolean;
  excludeFromIncome: boolean;
  license: { tier: string; billingPlan: BillingPlan; status: LicenseStatus } | null;
  _count: { users: number; staffProfiles: number; appointments: number };
}

const BILLING_PLANS: BillingPlan[] = ["FREE", "ONE_TIME", "SUBSCRIPTION"];
const STATUSES: LicenseStatus[] = ["ACTIVE", "EXPIRED"];

export function TenantBillingManager() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { billingPlan: BillingPlan; status: LicenseStatus }>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [togglingIncomeId, setTogglingIncomeId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/superadmin/tenants");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load");
        if (!cancelled) {
          setTenants(data.tenants);
          const initialDrafts: typeof drafts = {};
          for (const t of data.tenants as Tenant[]) {
            if (t.license) {
              initialDrafts[t.id] = { billingPlan: t.license.billingPlan, status: t.license.status };
            }
          }
          setDrafts(initialDrafts);
        }
      } catch {
        if (!cancelled) setError("Couldn't load tenants.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function updateDraft(tenantId: string, patch: Partial<{ billingPlan: BillingPlan; status: LicenseStatus }>) {
    setDrafts((prev) => ({ ...prev, [tenantId]: { ...prev[tenantId], ...patch } }));
  }

  async function handleToggleDisabled(tenantId: string, disabled: boolean) {
    setTogglingId(tenantId);
    setError(null);
    try {
      const res = await fetch(`/api/superadmin/tenants/${tenantId}/disabled`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disabled }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setTenants((prev) => prev.map((t) => (t.id === tenantId ? { ...t, disabled } : t)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save - try again.");
    } finally {
      setTogglingId(null);
    }
  }

  async function handleToggleExcludeFromIncome(tenantId: string, excludeFromIncome: boolean) {
    setTogglingIncomeId(tenantId);
    setError(null);
    try {
      const res = await fetch(`/api/superadmin/tenants/${tenantId}/exclude-from-income`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ excludeFromIncome }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setTenants((prev) => prev.map((t) => (t.id === tenantId ? { ...t, excludeFromIncome } : t)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save - try again.");
    } finally {
      setTogglingIncomeId(null);
    }
  }

  async function handleSave(tenantId: string) {
    const draft = drafts[tenantId];
    if (!draft) return;
    setSavingId(tenantId);
    setSavedId(null);
    setError(null);
    try {
      const res = await fetch(`/api/superadmin/tenants/${tenantId}/license`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setTenants((prev) =>
        prev.map((t) => (t.id === tenantId ? { ...t, license: t.license ? { ...t.license, ...draft } : null } : t))
      );
      setSavedId(tenantId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save - try again.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-medium">Tenants</h2>
      <p className="mt-1 text-sm text-gray-500">
        Every tenant on the platform. Change a tenant&apos;s billing plan or license status
        directly - bypasses Stripe checkout entirely, for comping an account, testing paid
        features, or fixing a billing issue by hand. &quot;Account&quot; is separate from
        billing: disabling blocks every login for that tenant (e.g. for abuse or a support
        request) - note it only blocks new logins, so anyone already signed in stays signed in
        until their session expires on its own. Check &quot;test/demo account&quot; to leave a
        tenant&apos;s License out of the Income page&apos;s revenue totals entirely - for your
        own test accounts or comped demos, even if they carry a paid plan.
      </p>

      {loading ? (
        <p className="mt-4 text-sm text-gray-400">Loading...</p>
      ) : tenants.length === 0 ? (
        <p className="mt-4 text-sm text-gray-400">No tenants yet.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-180 text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs tracking-wide text-gray-400 uppercase">
                <th className="py-2 pr-3">Business</th>
                <th className="py-2 pr-3">Tier</th>
                <th className="py-2 pr-3">Staff / Appts</th>
                <th className="py-2 pr-3">Plan</th>
                <th className="py-2 pr-3">License status</th>
                <th className="py-2 pr-3"></th>
                <th className="py-2 pr-3">Account</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => {
                const draft = drafts[t.id];
                const dirty =
                  draft && t.license && (draft.billingPlan !== t.license.billingPlan || draft.status !== t.license.status);
                return (
                  <tr key={t.id} className="border-b border-gray-100 last:border-0">
                    <td className="py-2 pr-3">
                      <div className="font-medium text-gray-900">{t.name}</div>
                      <div className="text-xs text-gray-400">/{t.slug}</div>
                    </td>
                    <td className="py-2 pr-3 text-gray-600">{t.license?.tier ?? "—"}</td>
                    <td className="py-2 pr-3 text-gray-600">
                      {t._count.staffProfiles} / {t._count.appointments}
                    </td>
                    {draft ? (
                      <>
                        <td className="py-2 pr-3">
                          <select
                            value={draft.billingPlan}
                            onChange={(e) => updateDraft(t.id, { billingPlan: e.target.value as BillingPlan })}
                            className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                          >
                            {BILLING_PLANS.map((p) => (
                              <option key={p} value={p}>
                                {p}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 pr-3">
                          <select
                            value={draft.status}
                            onChange={(e) => updateDraft(t.id, { status: e.target.value as LicenseStatus })}
                            className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                          >
                            {STATUSES.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 pr-3">
                          <button
                            type="button"
                            onClick={() => void handleSave(t.id)}
                            disabled={!dirty || savingId === t.id}
                            className="rounded-lg bg-primary-500 px-3 py-1 text-xs font-medium text-white shadow-sm transition-colors hover:bg-primary-600 disabled:opacity-40"
                          >
                            {savingId === t.id ? "Saving..." : savedId === t.id && !dirty ? "Saved" : "Save"}
                          </button>
                        </td>
                      </>
                    ) : (
                      <td className="py-2 pr-3 text-gray-400" colSpan={3}>
                        No license row.
                      </td>
                    )}
                    <td className="py-2 pr-3">
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              t.disabled ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"
                            }`}
                          >
                            {t.disabled ? "Disabled" : "Enabled"}
                          </span>
                          <button
                            type="button"
                            onClick={() => void handleToggleDisabled(t.id, !t.disabled)}
                            disabled={togglingId === t.id}
                            className={`rounded-lg px-3 py-1 text-xs font-medium shadow-sm transition-colors disabled:opacity-40 ${
                              t.disabled
                                ? "bg-primary-500 text-white hover:bg-primary-600"
                                : "bg-red-50 text-red-700 hover:bg-red-100"
                            }`}
                          >
                            {togglingId === t.id ? "Saving..." : t.disabled ? "Enable" : "Disable"}
                          </button>
                        </div>
                        <label className="flex items-center gap-1.5 text-gray-600">
                          <input
                            type="checkbox"
                            checked={t.excludeFromIncome}
                            disabled={togglingIncomeId === t.id}
                            onChange={(e) => void handleToggleExcludeFromIncome(t.id, e.target.checked)}
                            className="h-3.5 w-3.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                          />
                          <span className="text-xs whitespace-nowrap">Exclude from income (test/demo)</span>
                        </label>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </section>
  );
}
