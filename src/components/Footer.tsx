import Link from "next/link";

/**
 * Site-wide compact footer (mounted once in the root layout) - deliberately
 * a single slim bar, not a marketing-site block, since it now also renders
 * under every authenticated app page (dashboard, calendar, settings, ...)
 * which already have their own AppHeader navigation.
 *
 * Deliberately no real Privacy Policy/Terms of Service link yet - that page
 * doesn't exist. See TODO.md's security-posture item for the write-up still
 * needed before this should change. "About" points to a real page that's
 * intentionally a placeholder - content coming later.
 */
export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-gray-200 bg-white">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-6 py-2.5 text-xs text-gray-500">
        <span>© {year} ShiftUp</span>
        <nav className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <Link href="/about" className="hover:text-primary-600">
            About
          </Link>
          <a href="mailto:maitland.andrus@gmail.com?subject=ShiftUp%20feedback" className="hover:text-primary-600">
            Feedback
          </a>
          <span className="text-gray-300">Privacy &amp; Terms - coming soon</span>
        </nav>
      </div>
    </footer>
  );
}
