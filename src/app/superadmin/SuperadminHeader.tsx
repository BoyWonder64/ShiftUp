"use client";

import { useRouter } from "next/navigation";

export function SuperadminHeader() {
  const router = useRouter();

  async function handleSignOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <header className="sticky top-0 z-10 border-b border-gray-800 bg-gray-900">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
        <span className="font-display text-lg font-bold tracking-tight text-white">
          Shift<span className="text-primary-400">Up</span>{" "}
          <span className="font-sans text-sm font-normal text-gray-400">dev console</span>
        </span>
        <button
          onClick={handleSignOut}
          className="rounded-full px-3 py-1.5 text-sm font-medium text-gray-300 hover:bg-white/10 hover:text-white"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
