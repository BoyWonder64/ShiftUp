# ShiftUp — Deferred / open items

Things that have been raised but deliberately **not** built yet, kept here so
they don't get lost. Discuss/prioritize before picking any of these up.
Day-to-day build status (what's done, what's verified) lives in `PROGRESS.md` —
this file is just the backlog.

## New feature requests (not started)

- **PTO manager + shift-coverage finder.** When someone needs a shift covered,
  show who isn't already working that slot and could cover it, filterable by
  hours-already-worked so a manager can avoid pushing someone into overtime.
  Manager controls the eligible-coverage list. Needs design decisions before
  building: is there an approval workflow (employee requests PTO, who
  approves)? Does "hours worked" mean this week, this pay period, something
  configurable? Needs a `TimeOff`/PTO data model (request + approval status)
  and an hours-worked aggregate per staff member to filter coverage candidates.

## Confirm/decide

- **Role hierarchy ordering.** Built on the assumption `MANAGER` outranks
  `SUPERVISOR`, and that job-estimate visibility defaults to
  `ADMIN`/`MANAGER` only (not `SUPERVISOR`). Never explicitly confirmed — flagged
  twice, no correction given, so this is what's live. Worth a real look since
  it's now wired into the default permission matrix (`src/lib/permissions/catalog.ts`)
  and easy to get backwards.

## Known gaps in what's already built

- **Checkout flow built, not yet live-tested.** `License.billingPlan` supports
  `ONE_TIME` and `SUBSCRIPTION`, and real Stripe Checkout is wired up
  (`src/lib/licensing/pricing.ts`, `POST /api/billing/checkout`,
  `POST /api/billing/webhook`, `/app/[tenantSlug]/billing`) at the agreed
  prices: Free (1 staff, 10 appointments/month, enforced), one-time $199/module
  or $449 both, subscription $20/mo per module or $40/mo both. Billing now
  lets a tenant buy a different tier than whatever they're exploring for free
  (just shift management, just appointment manager, or both). PayPal is
  enabled for one-time purchases (Stripe-native, no separate integration).
  **Not yet tested end-to-end** — needs a real Stripe test-mode account
  (`STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` in `.env`), which only the
  user can provide. See PROGRESS.md for what's verified so far vs. not.
  - Verify PayPal works for `SUBSCRIPTION` mode too once there's a live
    account to test against — currently only enabled for `ONE_TIME`.
  - **Not built at all**: the separate client-pays-business flow (Stripe
    Connect, per-tenant accounts) — a different, larger piece tied to the
    self-service booking portal. **Venmo was considered and deliberately not
    built** — it needs its own Braintree/PayPal integration (separate from
    Stripe entirely), not worth the complexity for a B2B software purchase.
- **"Who can see who" isn't enforced yet.** `RoleVisibility` is modeled and
  editable from the User Manager page, and `canViewRole()` exists in
  `src/lib/permissions/service.ts`, but no route actually calls it. Right now
  anyone with `VIEW_APPOINTMENTS` sees every appointment tenant-wide,
  regardless of the visibility matrix. The User Manager page currently edits
  settings that don't change any real behavior yet.
- **No part of `SchedulingCalendar`'s client-fetched UI can be confirmed by curl.**
  Its permissions/staff/events all load via `useEffect` after hydration, so a
  server-rendered curl check always sees `permissions = null` and skips every
  block gated on it — the "+ Add appointment"/"+ Schedule shift" buttons, the
  staff filter, drag/resize, and the color-coded events (blue appointment /
  violet shift / gray completed / amber no-show / struck-through cancelled)
  are all correct by code review and their underlying API calls are genuinely
  tested, but none of their actual on-screen behavior has been clicked
  through in a real browser (none available in the dev environment). Worth a
  manual pass before calling this feature done.
- **`WorkingHours` isn't used anywhere yet.** The model exists but nothing
  populates it or constrains bookable times to it — the calendar only
  prevents literal double-booking, not booking outside a staff member's
  actual hours.
- **No client search/dedup.** Every typed client name on the create-appointment
  panel creates a new `Client` row; there's no lookup of existing clients.

## Still-open Phase 0 infra (independent of app features)

- CI workflow (`.github/workflows/ci.yml`) — lint/typecheck/test/build on push.
- Azure infra scaffold (Bicep: App Service, Postgres Flexible Server, Function
  App, Key Vault) — not started. Provisioning real Azure resources costs money
  and needs your subscription, so this should be a deliberate step, not silent.
- Deploy workflow to Azure App Service — same caveat.

## New feature requests (not started), continued

- **External website integration / public booking widget.** Let a business
  embed or link to a public-facing calendar on their own website where
  clients can see free time slots and book themselves, without logging in.
  This is the "self-service booking portal" from the original architecture
  plan (Phase 2), now stated more concretely. Needs: a public, unauthenticated
  route (no tenant session) that reads real-time availability for a tenant,
  an actual availability-computation engine (not yet built - `WorkingHours`
  exists but nothing reads it, see below), a booking flow that writes into the
  same `Appointment`/`EXCLUDE` constraint as admin-created bookings, and
  probably an embeddable widget/iframe or a hosted public page
  (`shiftup.app/<slug>/book`, matching what the signup form's "account URL"
  helper text already promises). Real design work needed before building -
  this is a meaningfully sized feature, not a quick add.

## Original roadmap phases not reached yet

Per the architecture plan (now partly superseded by the pricing/role/permission
changes, but the shape still holds): client/appointment notes, tenant holidays,
email notifications/reminders. (Tenant→platform Stripe payments are built -
see PROGRESS.md; client-pays-business via Stripe Connect is the one payments
piece still unbuilt, noted above under checkout.)
