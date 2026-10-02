import Link from "next/link";

/**
 * Public-site header (home, login, signup, about) - visually matches
 * AppHeader (the authenticated app's nav bar) so the brand look is
 * consistent before and after signing in. Kept separate from AppHeader
 * since the two have unrelated nav items (marketing links vs. app pages)
 * and AppHeader needs client-side pathname/role logic this doesn't.
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-10 border-b border-primary-700/40 bg-primary-600/95 shadow-sm backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
        <Link href="/" className="flex items-center gap-2">
          <span className="font-display text-lg font-bold tracking-tight text-white">
            Shift<span className="text-primary-100">Up</span>
          </span>
        </Link>

        <nav className="flex items-center gap-1">
          <Link
            href="/#features"
            className="rounded-full px-3 py-1.5 text-sm font-medium text-primary-100 transition-colors hover:bg-white/10 hover:text-white"
          >
            Features
          </Link>
          <Link
            href="/#pricing"
            className="rounded-full px-3 py-1.5 text-sm font-medium text-primary-100 transition-colors hover:bg-white/10 hover:text-white"
          >
            Pricing
          </Link>
          <Link
            href="/about"
            className="rounded-full px-3 py-1.5 text-sm font-medium text-primary-100 transition-colors hover:bg-white/10 hover:text-white"
          >
            About
          </Link>
          <Link
            href="/login"
            className="rounded-full px-3 py-1.5 text-sm font-medium text-primary-100 transition-colors hover:bg-white/10 hover:text-white"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="ml-1 rounded-full bg-white px-3 py-1.5 text-sm font-medium text-primary-700 shadow-sm transition-colors hover:bg-primary-50"
          >
            Sign up
          </Link>
        </nav>
      </div>
    </header>
  );
}
