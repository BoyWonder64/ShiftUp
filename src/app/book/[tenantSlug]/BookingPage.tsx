"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

interface ServiceTypeOption {
  id: string;
  name: string;
  durationMinutes: number;
  price: string | null;
}

interface StaffOption {
  id: string;
  displayName: string;
}

interface BookingInfo {
  tenant: { name: string; logoDataUrl: string | null };
  serviceTypes: ServiceTypeOption[];
  staff: StaffOption[];
}

interface Slot {
  start: string;
  end: string;
}

type Step = "service" | "staff" | "slot" | "details" | "confirmed";

function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

function maxBookableDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 60); // generous client-side cap - the server clips to the tenant's real publicBookingWindowDays regardless.
  return d.toISOString().slice(0, 10);
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data;
}

export function BookingPage({ tenantSlug }: { tenantSlug: string }) {
  const searchParams = useSearchParams();
  const embed = searchParams.get("embed") === "1";
  const containerRef = useRef<HTMLDivElement>(null);

  const [info, setInfo] = useState<BookingInfo | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [step, setStep] = useState<Step>("service");

  const [serviceTypeId, setServiceTypeId] = useState<string | null>(null);
  const [staffId, setStaffId] = useState<string | null>(null); // null = "any available"
  const [date, setDate] = useState(todayISODate());
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState(""); // honeypot - real visitors never see or fill this
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchJson<BookingInfo>(`/api/public/booking/${tenantSlug}/info`);
        setInfo(data);
      } catch {
        setNotFound(true);
      }
    })();
  }, [tenantSlug]);

  // Auto-size the parent iframe (see public/booking-widget.js) whenever embedded content height changes.
  useEffect(() => {
    if (!embed || !containerRef.current) return;
    const el = containerRef.current;
    const observer = new ResizeObserver(() => {
      window.parent.postMessage({ type: "shiftup-booking-resize", height: el.scrollHeight }, "*");
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [embed, step, slots]);

  const selectedService = useMemo(
    () => info?.serviceTypes.find((s) => s.id === serviceTypeId) ?? null,
    [info, serviceTypeId]
  );

  async function loadSlots() {
    if (!serviceTypeId) return;
    setLoadingSlots(true);
    setError(null);
    setSelectedSlot(null);
    try {
      const from = new Date(`${date}T00:00:00`).toISOString();
      const to = new Date(`${date}T00:00:00`);
      to.setDate(to.getDate() + 1);
      const query = new URLSearchParams({ serviceTypeId, from, to: to.toISOString() });
      if (staffId) query.set("staffId", staffId);
      const data = await fetchJson<{ slots: Slot[] }>(`/api/public/booking/${tenantSlug}/availability?${query}`);
      setSlots(data.slots);
    } catch {
      setError("Couldn't load availability.");
    } finally {
      setLoadingSlots(false);
    }
  }

  useEffect(() => {
    if (step === "slot") void loadSlots();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, date]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!serviceTypeId || !selectedSlot) return;
    setSubmitting(true);
    setError(null);
    try {
      await fetchJson(`/api/public/booking/${tenantSlug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceTypeId,
          staffId: staffId ?? undefined,
          startTime: selectedSlot.start,
          client: { name, email, phone },
          website,
        }),
      });
      setStep("confirmed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't complete booking.");
    } finally {
      setSubmitting(false);
    }
  }

  if (notFound) {
    return (
      <div ref={containerRef} className="p-6 text-center text-sm text-gray-500">
        This booking page isn&apos;t available.
      </div>
    );
  }

  if (!info) {
    return (
      <div ref={containerRef} className="p-6 text-center text-sm text-gray-400">
        Loading...
      </div>
    );
  }

  return (
    <div ref={containerRef} className="mx-auto flex max-w-md flex-col gap-4 p-4 sm:p-6">
      <div className="flex items-center gap-3">
        {info.tenant.logoDataUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={info.tenant.logoDataUrl} alt="" className="h-10 w-10 rounded object-contain" />
        )}
        <h1 className="text-lg font-semibold text-gray-900">{info.tenant.name}</h1>
      </div>

      {step === "service" && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-gray-700">Choose a service</h2>
          {info.serviceTypes.length === 0 ? (
            <p className="text-sm text-gray-400">No services are available to book online right now.</p>
          ) : (
            info.serviceTypes.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setServiceTypeId(s.id);
                  setStep("staff");
                }}
                className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-left text-sm hover:border-primary-400 hover:bg-primary-50"
              >
                <span className="font-medium text-gray-900">{s.name}</span>
                <span className="text-gray-500">
                  {s.durationMinutes} min{s.price && Number(s.price) > 0 ? ` · $${Number(s.price).toFixed(2)}` : ""}
                </span>
              </button>
            ))
          )}
        </section>
      )}

      {step === "staff" && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-gray-700">Choose a staff member</h2>
          <button
            type="button"
            onClick={() => {
              setStaffId(null);
              setStep("slot");
            }}
            className="rounded-lg border border-gray-200 px-3 py-2 text-left text-sm hover:border-primary-400 hover:bg-primary-50"
          >
            Any available
          </button>
          {info.staff.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                setStaffId(s.id);
                setStep("slot");
              }}
              className="rounded-lg border border-gray-200 px-3 py-2 text-left text-sm hover:border-primary-400 hover:bg-primary-50"
            >
              {s.displayName}
            </button>
          ))}
          <button type="button" onClick={() => setStep("service")} className="mt-1 text-xs text-gray-400 hover:text-gray-700">
            ← Back
          </button>
        </section>
      )}

      {step === "slot" && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-gray-700">Choose a time</h2>
          <input
            type="date"
            value={date}
            min={todayISODate()}
            max={maxBookableDate()}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-md border border-gray-300 px-2 py-1 text-sm"
          />
          {loadingSlots ? (
            <p className="text-sm text-gray-400">Loading...</p>
          ) : slots.length === 0 ? (
            <p className="text-sm text-gray-400">No open times this day - try another date.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {slots.map((slot) => (
                <button
                  key={slot.start}
                  type="button"
                  onClick={() => {
                    setSelectedSlot(slot);
                    setStep("details");
                  }}
                  className="rounded-md border border-gray-200 px-2 py-1.5 text-xs hover:border-primary-400 hover:bg-primary-50"
                >
                  {new Date(slot.start).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                </button>
              ))}
            </div>
          )}
          <button type="button" onClick={() => setStep("staff")} className="text-xs text-gray-400 hover:text-gray-700">
            ← Back
          </button>
        </section>
      )}

      {step === "details" && selectedSlot && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-gray-700">
            {selectedService?.name} —{" "}
            {new Date(selectedSlot.start).toLocaleString([], {
              weekday: "short",
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </h2>
          <label className="flex flex-col gap-1 text-sm">
            Name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={200}
              className="rounded-md border border-gray-300 px-2 py-1"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-md border border-gray-300 px-2 py-1"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Phone
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              maxLength={40}
              className="rounded-md border border-gray-300 px-2 py-1"
            />
          </label>
          {/* Honeypot - hidden from real visitors via CSS, not `type="hidden"` (bots often skip those specifically). */}
          <div aria-hidden="true" className="absolute -left-[9999px]">
            <label>
              Website
              <input
                tabIndex={-1}
                autoComplete="off"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
              />
            </label>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={submitting || !name.trim()}
            className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-600 disabled:opacity-50"
          >
            {submitting ? "Booking..." : "Confirm booking"}
          </button>
          <button type="button" onClick={() => setStep("slot")} className="text-xs text-gray-400 hover:text-gray-700">
            ← Back
          </button>
        </form>
      )}

      {step === "confirmed" && selectedSlot && (
        <section className="flex flex-col items-center gap-2 py-6 text-center">
          <p className="text-lg font-medium text-gray-900">You&apos;re booked!</p>
          <p className="text-sm text-gray-500">
            {selectedService?.name} on{" "}
            {new Date(selectedSlot.start).toLocaleString([], {
              weekday: "long",
              month: "long",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </p>
        </section>
      )}

      {embed && <style>{`footer { display: none !important; }`}</style>}
    </div>
  );
}
