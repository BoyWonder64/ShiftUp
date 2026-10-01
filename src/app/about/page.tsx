import Link from "next/link";

// Placeholder - real "about" content is coming later. Kept as a real page
// (rather than a dead footer link) so "About" in the footer goes somewhere
// honest in the meantime.
export default function AboutPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <div className="flex max-w-md flex-col items-center gap-3 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">About ShiftUp</h1>
        <p className="text-gray-500">This page is coming soon.</p>
        <Link href="/" className="text-sm font-medium text-primary-600 hover:underline">
          ← Back home
        </Link>
      </div>
    </main>
  );
}
