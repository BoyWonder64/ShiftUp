# ShiftUp — Security Posture

An honest, point-in-time account of what's actually true about this app's
security today, and what isn't yet. Written to be read by you (the owner)
and, where it's genuinely solid, usable as-is to answer a prospective user's
"is this safe to use?" — nothing here is marketing copy; anything not yet
true is stated as such rather than glossed over. Turning the real parts of
this into actual landing-page copy is a separate, later step (see TODO.md).

## What's true today

**Password storage** (`src/lib/auth/password.ts`)
- Hashed with **scrypt** (Node's built-in memory-hard KDF — no native
  dependency like bcrypt needs), a fresh random 16-byte salt per password,
  stored as `salt:hash`.
- Verified with `timingSafeEqual` — resistant to timing attacks on the
  comparison itself.
- Passwords are never logged; failures log generic messages only.
- Login gives the identical error for "no such user" and "wrong password" —
  doesn't leak which one via message or timing.
- Enforced 8–200 character minimum at signup/bootstrap (Zod), before hashing.

**Sessions** (`src/lib/auth/session.ts`)
- Stateless, **HMAC-SHA256 signed** cookie (`AUTH_SECRET`, required at
  startup — the app refuses to issue sessions without it configured).
  Signed, not encrypted: the payload (`userId`/`tenantId`/`role`) isn't
  secret, just tamper-proof — a forged or edited cookie fails signature
  verification.
- Cookie is `httpOnly` (not readable from JS → not stealable via XSS),
  `sameSite: lax`, and `secure` in production (HTTPS-only transmission),
  with a 7-day expiry baked into and checked from the signed payload itself.

**Tenant isolation**
- Every tenant-scoped table has **Postgres Row-Level Security**, enforced via
  session variables set inside `runInTenantContext()`
  (`src/lib/tenant-context.ts`) — a DB-level backstop independent of any
  single route remembering to filter by `tenantId`.
- The app connects as a **restricted, non-superuser** Postgres role
  (`shiftup_app`) — RLS does nothing against a superuser connection, so this
  was a real fix for a real bug, not a cosmetic one (see PROGRESS.md's "RLS
  bug fix" entry).
- Proven by an automated test (`src/lib/tenant-context.rls.test.ts`), not
  just asserted — 4 tests confirming cross-tenant reads/writes are actually
  rejected by the database.

**Payments**
- Stripe handles all card data via **Stripe Checkout** (hosted, PCI-compliant
  pages) — no card number, CVC, or raw payment detail ever reaches this
  app's servers or database at any point.
- The webhook handler verifies Stripe's signature before trusting any
  payload (`POST /api/billing/webhook`).

**Secrets**
- `AUTH_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and
  `SUPERADMIN_SETUP_SECRET` are all required env vars with no hardcoded
  fallback or default in code — `.env.example` ships with empty placeholders
  (the only non-empty values there are local Docker Postgres dev credentials,
  not real secrets). The superadmin bootstrap route 404s entirely if its
  secret isn't set, and self-disables permanently once one SUPERADMIN exists.

## What's not true yet — real gaps

- **No rate limiting or lockout on auth routes.** `/api/auth/login`,
  `/api/auth/signup`, and `/api/superadmin/bootstrap` accept unlimited
  attempts from any source today. The password hashing above is sound, but
  without throttling, an attacker can still brute-force a weak password via
  sheer volume. This is the single highest-value gap to close next.
- **No CI pipeline** (`.github/workflows/ci.yml` doesn't exist yet) — nothing
  automatically re-runs tests/lint/typecheck on push today; checks are run
  manually per session.
- **No third-party security audit or penetration test** has been performed.
  Everything above is correct by code review and automated test, not by
  outside verification.
- **No breached-password check or complexity requirement** beyond an 8-char
  minimum — acceptable under current NIST 800-63B guidance (length over
  forced complexity), but worth knowing it's a deliberate minimum, not a
  gap that was missed.
- **"Who can see who" (`RoleVisibility`) isn't enforced yet** — modeled and
  editable, but no route actually filters by it today (tracked in
  TODO.md/ARCHITECTURE.md). Not a password/auth issue, but relevant to "can
  one tenant user see data they shouldn't."

## Bottom line

Password storage, session signing, and tenant data isolation are all built
correctly and, for isolation, automated-test-verified — not just asserted.
The main open risk is the lack of throttling on the auth endpoints, which is
an operational gap (nothing is wired up) rather than a design flaw in how
credentials are handled.
