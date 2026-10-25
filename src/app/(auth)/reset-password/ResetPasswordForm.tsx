"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export function ResetPasswordForm({ token }: { token: string | null }) {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/password-reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      setDone(true);
      setTimeout(() => router.push("/login"), 2500);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <div className="flex w-full flex-col gap-4 rounded-xl border border-gray-200 bg-white p-8 shadow-md">
        <h1 className="text-xl font-semibold tracking-tight">Reset your password</h1>
        <p className="text-sm text-red-600">
          This link is missing its reset token. Request a new one from the{" "}
          <Link href="/forgot-password" className="font-medium text-primary-600 hover:underline">
            forgot password
          </Link>{" "}
          page.
        </p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex w-full flex-col gap-4 rounded-xl border border-gray-200 bg-white p-8 shadow-md">
        <h1 className="text-xl font-semibold tracking-tight">Password updated</h1>
        <p className="text-sm text-gray-600">
          Your password has been reset, and you&apos;ve been signed out everywhere else. Redirecting to log in...
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full flex-col gap-4 rounded-xl border border-gray-200 bg-white p-8 shadow-md"
    >
      <h1 className="text-xl font-semibold tracking-tight">Choose a new password</h1>

      <label className="flex flex-col gap-1 text-sm">
        New password
        <input
          type="password"
          className="rounded-lg border border-gray-300 px-3 py-2 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
          minLength={8}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Confirm new password
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

      <button
        type="submit"
        disabled={submitting}
        className="mt-2 rounded-lg bg-linear-to-r from-primary-500 to-primary-550 px-4 py-2.5 font-medium text-white shadow-sm transition-all hover:shadow-md disabled:opacity-50"
      >
        {submitting ? "Saving..." : "Reset password"}
      </button>
    </form>
  );
}
