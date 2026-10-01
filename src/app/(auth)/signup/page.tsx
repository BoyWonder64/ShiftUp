"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

type FeatureTier = "SHIFT_MANAGEMENT" | "APPOINTMENT_MANAGER" | "BOTH";

const FEATURE_TIER_OPTIONS: Array<{ value: FeatureTier; title: string; description: string }> = [
  {
    value: "SHIFT_MANAGEMENT",
    title: "Shift management",
    description: "Staff rosters, shifts, and time-off. Free to explore.",
  },
  {
    value: "APPOINTMENT_MANAGER",
    title: "Appointment manager",
    description: "Client bookings, notes, and payment collection. Free to explore.",
  },
  {
    value: "BOTH",
    title: "Both",
    description: "Everything, in one account. Free to explore.",
  },
];

export default function SignupPage() {
  const router = useRouter();
  const [businessName, setBusinessName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [featureTier, setFeatureTier] = useState<FeatureTier>("BOTH");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleBusinessNameChange(value: string) {
    setBusinessName(value);
    if (!slugEdited) setSlug(slugify(value));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    setSubmitting(true);
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessName, slug, timezone, email, username, password, featureTier }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      router.push(`/app/${data.tenantSlug}/dashboard`);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center bg-linear-to-b from-primary-50 via-white to-white p-8">
      <div className="flex w-full max-w-md flex-col items-center gap-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-linear-to-br from-primary-500 to-primary-700 text-sm font-bold text-white shadow-sm">
            S
          </span>
          <span className="text-xl font-semibold tracking-tight">
            Shift<span className="text-primary-500">Up</span>
          </span>
        </Link>

        <form
          onSubmit={handleSubmit}
          className="flex w-full flex-col gap-4 rounded-xl border border-gray-200 bg-white p-8 shadow-md"
        >
          <h1 className="text-xl font-semibold tracking-tight">Create your business account</h1>

          <div className="flex flex-col gap-2 text-sm">
            What do you want to explore? (free to start)
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {FEATURE_TIER_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setFeatureTier(option.value)}
                  className={`rounded-lg border px-3 py-2 text-left transition-all ${
                    featureTier === option.value
                      ? "border-primary-500 bg-primary-50 shadow-sm ring-1 ring-primary-500"
                      : "border-gray-200 hover:border-primary-300 hover:shadow-sm"
                  }`}
                >
                  <div className="font-medium">{option.title}</div>
                  <div className="text-xs text-gray-500">{option.description}</div>
                </button>
              ))}
            </div>
          </div>

          <label className="flex flex-col gap-1 text-sm">
            Business name
            <input
              className="rounded-lg border border-gray-300 px-3 py-2 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              value={businessName}
              onChange={(e) => handleBusinessNameChange(e.target.value)}
              required
              minLength={2}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Your account URL
            <div className="flex items-center gap-1 text-gray-500">
              <span className="whitespace-nowrap text-xs">shiftup.app/</span>
              <input
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-black focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                value={slug}
                onChange={(e) => {
                  setSlugEdited(true);
                  setSlug(slugify(e.target.value));
                }}
                required
                minLength={3}
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                title="Lowercase letters, numbers, and hyphens only"
              />
            </div>
            <span className="text-xs text-gray-500">
              This is where you and your team will log in. It&apos;ll also become
              your public booking page once online booking launches, so pick
              something clients would recognize.
            </span>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Email
            <input
              type="email"
              className="rounded-lg border border-gray-300 px-3 py-2 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Username
            <input
              className="rounded-lg border border-gray-300 px-3 py-2 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              minLength={3}
              maxLength={30}
              pattern="[a-z0-9]+([_-][a-z0-9]+)*"
              title="Lowercase letters, numbers, - and _ only"
            />
            <span className="text-xs text-gray-500">
              You can log in with either your username or email.
            </span>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Password
            <input
              type="password"
              className="rounded-lg border border-gray-300 px-3 py-2 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Confirm password
            <input
              type="password"
              className="rounded-lg border border-gray-300 px-3 py-2 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
            />
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <p className="text-xs text-gray-500">
            Creating an account makes you the <strong>admin</strong> for{" "}
            {businessName || "this business"} — you&apos;ll have full control and can
            add staff with more limited roles afterward.
          </p>

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 rounded-lg bg-linear-to-r from-primary-500 to-primary-550 px-4 py-2.5 font-medium text-white shadow-sm transition-all hover:shadow-md disabled:opacity-50"
          >
            {submitting ? "Creating account..." : "Create account"}
          </button>

          <p className="text-center text-sm text-gray-600">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-primary-600 hover:underline">
              Log in
            </Link>
          </p>
        </form>
      </div>
    </main>
  );
}
