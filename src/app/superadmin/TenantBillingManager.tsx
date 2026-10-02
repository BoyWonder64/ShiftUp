"use client";

import { useEffect, useState } from "react";
import { BILLING_PLAN_DESCRIPTIONS, BILLING_PLAN_LABELS } from "@/lib/licensing/pricing";

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

function Badge({
  tone,
  title,
  children,
}: {
  tone: "gray" | "green" | "red" | "amber";
  title?: string;
  children: React.ReactNode;
}) {
  const toneClasses = {
    gray: "bg-gray-100 text-gray-600",
    green: "bg-green-50 text-green-700",
    red: "bg-red-50 text-red-700",
    amber: "bg-amber-50 text-amber-700",
  }[tone];
  return (
    <span title={title} className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${toneClasses}`}>
      {children}
    </span>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
    >
      <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.24 4.5a.75.75 0 0 1-1.08 0l-4.24-4.5a.75.75 0 0 1 .02-1.06Z" clipRule="evenodd" />
    </svg>
  );
}

export function TenantBillingManager() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { billingPlan: BillingPlan; status: LicenseStatus }>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [togglingIncomeId, setTogglingIncomeId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [resetResult, setResetResult] = useState<{ tenantId: string; temporaryPassword: string } | null>(null);
  const [copied, setCopied] = useState(false);

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

  function toggleExpanded(tenantId: string) {
    setExpandedIds((prev) => ({ ...prev, [tenantId]: !prev[tenantId] }));
  }

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

  async function handleResetPassword(tenantId: string) {
    if (!window.confirm("Reset this tenant's admin password? They'll need the new one you're given to log in again.")) {
      return;
    }
    setResettingId(tenantId);
    setResetResult(null);
    setCopied(false);
    setError(null);
    try {
      const res = await fetch(`/api/superadmin/tenants/${tenantId}/reset-password`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to reset password");
      setResetResult({ tenantId, temporaryPassword: data.temporaryPassword });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't reset password - try again.");
    } finally {
      setResettingId(null);
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
        Every tenant on the platform. Click one to change its billing plan, license status, or
        account access. &quot;Account&quot; is separate from billing: disabling blocks every
        login for that tenant - note it only blocks new logins, so anyone already signed in stays
        signed in until their session expires. &quot;Exclude from income&quot; leaves a tenant out
        of the Income page&apos;s revenue totals - for your own test or comped demo accounts, even
        if they carry a paid plan.
      </p>

      {loading ? (
        <p className="mt-4 text-sm text-gray-400">Loading...</p>
      ) : tenants.length === 0 ? (
        <p className="mt-4 text-sm text-gray-400">No tenants yet.</p>
      ) : (
        <div className="mt-4 flex flex-col gap-2">
          {tenants.map((t) => {
            const draft = drafts[t.id];
            const dirty =
              draft && t.license && (draft.billingPlan !== t.license.billingPlan || draft.status !== t.license.status);
            const open = !!expandedIds[t.id];
            return (
              <div key={t.id} className="rounded-lg border border-gray-200">
                <button
                  type="button"
                  onClick={() => toggleExpanded(t.id)}
                  aria-expanded={open}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-gray-900">{t.name}</div>
                    <div className="text-xs text-gray-400">/{t.slug}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {t.license ? (
                      <>
                        <Badge tone="gray">{t.license.tier}</Badge>
                        <Badge tone="gray" title={BILLING_PLAN_DESCRIPTIONS[t.license.billingPlan]}>
                          {BILLING_PLAN_LABELS[t.license.billingPlan]}
                        </Badge>
                        <Badge tone={t.license.status === "ACTIVE" ? "green" : "amber"}>{t.license.status}</Badge>
                      </>
                    ) : (
                      <Badge tone="gray">No license</Badge>
                    )}
                    <Badge tone={t.disabled ? "red" : "green"}>{t.disabled ? "Disabled" : "Enabled"}</Badge>
                    {t.excludeFromIncome && <Badge tone="amber">Excluded from income</Badge>}
                    <Chevron open={open} />
                  </div>
                </button>

                {open && (
                  <div className="flex flex-col gap-4 border-t border-gray-100 px-4 py-4">
                    <div className="text-sm text-gray-500">
                      {t._count.staffProfiles} staff · {t._count.appointments} appointments ·{" "}
                      {t._count.users} user{t._count.users === 1 ? "" : "s"}
                    </div>

                    {draft ? (
                      <div className="flex flex-col gap-1.5">
                        <div className="flex flex-wrap items-end gap-3">
                          <label className="flex flex-col gap-1 text-sm text-gray-600">
                            Billing plan
                            <select
                              value={draft.billingPlan}
                              onChange={(e) => updateDraft(t.id, { billingPlan: e.target.value as BillingPlan })}
                              className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                            >
                              {BILLING_PLANS.map((p) => (
                                <option key={p} value={p}>
                                  {BILLING_PLAN_LABELS[p]}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="flex flex-col gap-1 text-sm text-gray-600">
                            License status
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
                          </label>
                          <button
                            type="button"
                            onClick={() => void handleSave(t.id)}
                            disabled={!dirty || savingId === t.id}
                            className="rounded-lg bg-primary-500 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-primary-600 disabled:opacity-40"
                          >
                            {savingId === t.id ? "Saving..." : savedId === t.id && !dirty ? "Saved" : "Save"}
                          </button>
                        </div>
                        <p className="text-xs text-gray-400">{BILLING_PLAN_DESCRIPTIONS[draft.billingPlan]}</p>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400">No license row.</p>
                    )}

                    <div className="flex flex-wrap items-center gap-4 border-t border-gray-100 pt-4">
                      <button
                        type="button"
                        onClick={() => void handleToggleDisabled(t.id, !t.disabled)}
                        disabled={togglingId === t.id}
                        className={`rounded-lg px-3 py-1.5 text-xs font-medium shadow-sm transition-colors disabled:opacity-40 ${
                          t.disabled
                            ? "bg-primary-500 text-white hover:bg-primary-600"
                            : "bg-red-50 text-red-700 hover:bg-red-100"
                        }`}
                      >
                        {togglingId === t.id ? "Saving..." : t.disabled ? "Enable account" : "Disable account"}
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleResetPassword(t.id)}
                        disabled={resettingId === t.id}
                        className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-200 disabled:opacity-40"
                      >
                        {resettingId === t.id ? "Resetting..." : "Reset admin password"}
                      </button>

                      <label className="flex items-center gap-1.5 text-sm text-gray-600">
                        <input
                          type="checkbox"
                          checked={t.excludeFromIncome}
                          disabled={togglingIncomeId === t.id}
                          onChange={(e) => void handleToggleExcludeFromIncome(t.id, e.target.checked)}
                          className="h-3.5 w-3.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        />
                        Exclude from income (test/demo)
                      </label>
                    </div>

                    {resetResult && resetResult.tenantId === t.id && (
                      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                        <span>
                          New temporary password: <span className="font-mono font-semibold">{resetResult.temporaryPassword}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            void navigator.clipboard.writeText(resetResult.temporaryPassword);
                            setCopied(true);
                          }}
                          className="rounded-md bg-white px-2 py-1 text-xs font-medium text-amber-800 shadow-sm ring-1 ring-amber-300 hover:bg-amber-100"
                        >
                          {copied ? "Copied" : "Copy"}
                        </button>
                        <span className="text-xs text-amber-700">
                          Shown once - relay it to the customer yourself, it isn&apos;t emailed or stored anywhere.
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </section>
  );
}
