"use client";

import { useState } from "react";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/password-reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Something went wrong.");
        return;
      }
      // Same confirmation shown whether or not the email has an account -
      // the API never reveals that either way.
      setSubmitted(true);
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
          <div className="flex w-full flex-col gap-4 rounded-xl border border-gray-200 bg-white p-8 shadow-md">
            <h1 className="text-xl font-semibold tracking-tight">Reset your password</h1>

            {submitted ? (
              <>
                <p className="text-sm text-gray-600">
                  If an account exists for <span className="font-medium">{email}</span>, we&apos;ve sent a link to
                  reset your password. It expires in 30 minutes.
                </p>
                <Link href="/login" className="text-sm font-medium text-primary-600 hover:underline">
                  Back to log in
                </Link>
              </>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <p className="text-sm text-gray-600">
                  Enter the email on your account and we&apos;ll send you a link to reset your password.
                </p>

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

                {error && <p className="text-sm text-red-600">{error}</p>}

                <button
                  type="submit"
                  disabled={submitting}
                  className="mt-2 rounded-lg bg-linear-to-r from-primary-500 to-primary-550 px-4 py-2.5 font-medium text-white shadow-sm transition-all hover:shadow-md disabled:opacity-50"
                >
                  {submitting ? "Sending..." : "Send reset link"}
                </button>

                <p className="text-center text-sm text-gray-600">
                  <Link href="/login" className="font-medium text-primary-600 hover:underline">
                    Back to log in
                  </Link>
                </p>
              </form>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
