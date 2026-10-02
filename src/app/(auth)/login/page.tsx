"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      // Phase 0: role-based landing. Tenant slug isn't in the session payload,
      // so send admins/staff to a resolver route that looks it up server-side.
      router.push("/app");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <SiteHeader />
      <main className="flex flex-1 items-center justify-center bg-linear-to-b from-primary-50 via-white to-white p-8">
      <div className="flex w-full max-w-sm flex-col items-center gap-6">
        <form
          onSubmit={handleSubmit}
          className="flex w-full flex-col gap-4 rounded-xl border border-gray-200 bg-white p-8 shadow-md"
        >
          <h1 className="text-xl font-semibold tracking-tight">Log in</h1>

          <label className="flex flex-col gap-1 text-sm">
            Email or username
            <input
              className="rounded-lg border border-gray-300 px-3 py-2 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Password
            <input
              type="password"
              className="rounded-lg border border-gray-300 px-3 py-2 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 rounded-lg bg-linear-to-r from-primary-500 to-primary-550 px-4 py-2.5 font-medium text-white shadow-sm transition-all hover:shadow-md disabled:opacity-50"
          >
            {submitting ? "Logging in..." : "Log in"}
          </button>

          <p className="text-center text-sm text-gray-600">
            Need an account?{" "}
            <Link href="/signup" className="font-medium text-primary-600 hover:underline">
              Sign up
            </Link>
          </p>
        </form>
      </div>
      </main>
    </>
  );
}
