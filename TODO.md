# ShiftUp — Deferred / open items

Things that have been raised but deliberately **not** built yet, kept here so
they don't get lost. Discuss/prioritize before picking any of these up.
Day-to-day build status (what's done, what's verified) lives in `PROGRESS.md` —
this file is just the backlog. For current API routes/data model/permissions,
see `ARCHITECTURE.md`. **Anything marked "Done"/"Resolved" below has been
pulled out into `VERIFY.md`** — a checklist for you to confirm in the running
app — rather than left here as done-but-unconfirmed clutter.

## Issues

Bugs, data-model problems, and known gaps now live in **`ISSUES.md`**, not
here - this file is feature requests/backlog only. **Still open, at the top
of that file (as of 2026-10-02):** service types wrongly shared between
Appointments and Shifts (#1); no way to update a calendar event after it's
created (e.g. log a no-show - `AppointmentStatus` already has
`NO_SHOW`/`COMPLETED` but nothing can set them, #3); the manager no-show/shift
reporting dashboard that depends on #3 (#4, design proposed but not built);
and appointment payment status having no way to actually update it (#5).
**Resolved** (#2, #6) — moved to `VERIFY.md` for you to confirm. See
`ISSUES.md` for full detail on the open ones.

## New feature requests (not started)

- **A language setting to swap languages - infrastructure done, most pages
  still untranslated.** Raised 2026-10-01, infra built 2026-10-02 - see
  PROGRESS.md's "Language setting" entry. Decisions resolved: English +
  Spanish/German/French, and **per-user** (not per-tenant - each person
  picks their own in `AppHeader`'s new language picker, visible to every
  role, not just ADMIN). Built on **next-intl**: `User.locale` enum column,
  cached on the session (re-issued immediately on change via
  `PATCH /api/me/locale`, no logout needed), resolved per-request with no
  URL-prefix routing since the language isn't part of the tenant's public
  URL shape. **Fully translated**: `AppHeader` nav, the `Dashboard` page.
  **Still hardcoded English, not yet migrated** - the bulk of the remaining
  work, listed explicitly so it doesn't get lost:
  - `SchedulingCalendar.tsx` - by far the biggest surface (create/edit
    panels, detail panel, legend, toolbar, every validation message).
  - Settings and every card on it (`AppointmentFormSettings`,
    `ShiftFormSettings`, `ServiceTypeManager`, `StaffManager`,
    `RolesAndPermissionsEditor`, `RoleDetailPanel`, `EventColorSettings`,
    `HolidaySettings`, `LogoSettings`).
  - Billing (`PricingDeck.tsx`, `src/lib/licensing/pricing.ts`'s
    `FEATURE_TIER_LABELS`), Time off, Roster.
  - Login/Signup pages - can't read a stored preference pre-authentication;
    `src/i18n/request.ts` falls back to English when there's no session,
    which is correct for now but means these stay English-only until a
    logged-out detection mechanism (e.g. browser `Accept-Language`) is
    separately decided and added.
  - The SUPERADMIN console (`/superadmin`) - internal dev tool, left
    English-only as a deliberate low-priority call, not an oversight.
  Pick off incrementally - the pattern (stable translation keys in
  `src/messages/*.json`, `getTranslations`/`useTranslations`) is now
  established from the Dashboard page, so each additional page is a smaller
  lift than the first one was.
- ~~Custom roles — let a tenant define its own named roles instead of being
  limited to the 4 fixed configurable ones.~~ **Done 2026-10-01 — moved to
  `VERIFY.md`.**
- **Onboarding: a step where the tenant creates its own roles and decides
  what each one can do.** Raised 2026-10-01. Now unblocked - the real
  `Role` table custom roles depended on is built (see above) - this is just
  the signup-time flow for it: instead of (or in addition to) landing on the
  4 pre-seeded defaults, walk a new tenant through naming the roles that
  actually exist in their business (e.g. "Officer"/"Dispatcher" for a police
  department, "Plumber"/"Apprentice" for a trades business) and setting up
  each one's permissions/visibility right there, rather than leaving that
  entirely to a post-signup trip to Settings. Needs its own design pass -
  how many roles is reasonable to ask for at signup, whether this step is
  skippable in favor of the existing defaults, etc.
- **Multi-business management as a paid feature** - one login manages more
  than one business. Raised 2026-10-01, explicitly flagged by the user as "a
  lot of overhaul" - confirmed true after scoping. **This is a different
  scale than anything else in this file** - it touches the auth/session
  model, not just a feature surface. Design decisions already made in
  discussion:
  - **Switcher UX, not a combined view** - like a Slack/GitHub org switcher,
    one business active at a time with a dropdown to switch. Chosen
    specifically because it stays close to the existing single-tenant-per-
    request architecture (RLS, permissions, nearly every query assume one
    active tenant) - a combined/unified cross-business view was rejected as
    much bigger for comparatively little value.
  - **Billing is account-level, not per-business** - paying upgrades every
    business the user owns together; no per-business plan mixing.
  - **Fully general membership** - the same login can simultaneously own
    Business A (as its Admin) and work at Business B as invited staff (e.g.
    Employee), granted by that other business's own admin. Not limited to
    "just the businesses this person personally created."
  
  What actually has to change, concretely (none of this started):
  1. Replace `User.tenantId`/`User.role` (a single column each today - one
     user, one tenant, one role, full stop) with a real `TenantMembership`
     join table (`userId`, `tenantId`, `role`), since a user's role must now
     vary per business. Needs a backfill migration for every existing user.
  2. The session cookie itself currently bakes in a single
     `{userId, tenantId, role}` (see `src/lib/auth/session.ts`) - switching
     businesses means re-issuing a session scoped to the newly-selected
     tenant, not a client-side-only toggle. New "switch active business" UI
     and flow.
  3. A new **account-level** (not tenant-level) paid entitlement - every
     Stripe/billing code path today (`src/lib/licensing/pricing.ts`,
     `POST /api/billing/checkout`, the webhook, `License`) is tenant-scoped.
     Needs a new concept of a user-level subscription that, when active,
     lets that user own/create more than one `Tenant`, and upgrades the
     tier/plan on all `Tenant`s they own together.
  4. A new "add another business" flow (distinct from `/signup`, which
     today always creates a brand-new tenant *and* a brand-new user) -
     creates a new `Tenant` + `License` under the *existing* logged-in
     user, gated on the account-level entitlement from #3.
  5. A new "invite an existing user as staff" flow for the general-
     membership piece - today `POST /api/staff` always creates a *new*
     `User` row; there's no path to grant an already-existing login a
     membership in a second tenant.
  6. Re-audit of every route that currently assumes `session.tenantId` is
     fixed and singular (effectively all of them).
  
  Treat as a dedicated planning/implementation effort on its own, not
  something to fold into a session of smaller UI/feature work.
- **A toggle to adjust the calendar's overall size.** Raised 2026-10-01 -
  let the user resize `SchedulingCalendar`'s grid (currently a fixed
  `height: 650` in `SchedulingCalendar.tsx`) rather than it being fixed.
  Needs a decision on the control (a few preset sizes vs. a free-drag
  resize handle) and whether the choice persists (localStorage, per-browser)
  or is just a one-off per session.
- ~~Reusable shift-schedule templates, a new page for the staff manager.~~
  **Done 2026-10-02 — moved to `VERIFY.md`.**
- **Two-factor authentication**, possibly via Google (Sign in with Google, or
  TOTP-style Google Authenticator support). Raised 2026-10-01. Needs a
  decision: OAuth-based "Sign in with Google" (adds a third-party auth
  dependency, no shared secret to store) vs. TOTP 2FA where Google
  Authenticator is just one compatible app among several (needs a stored
  per-user secret + backup codes) - these are different features with
  different scope, not two options for the same thing. **Decided
  2026-10-02: not a paid-gated feature, free plan included** - basic account
  security shouldn't be paywalled; see the rate-limiting item under Security
  below for the same reasoning.
- **Password reset workflow - half done.** Raised 2026-10-02. The
  change-your-own-password half is done - moved to `VERIFY.md`. **Still
  open**: there's still no way for a *locked-out*
  user (one who can't log in at all, so can't reach Settings) to reset their
  password. That needs: a "Forgot password?" link on the login page, a
  `POST /api/auth/password-reset/request` endpoint that generates a
  single-use, time-limited token (store a hash of the token, not the raw
  value, same care as `passwordHash` itself) tied to the user's email, and a
  `POST /api/auth/password-reset/confirm` endpoint that verifies the token
  (checking expiry and single-use), and updates `passwordHash`. **Real
  blocker, unchanged**: actually delivering the reset link needs an
  email-sending channel, and **there is no email infrastructure anywhere in
  this app yet** - same gap already flagged under the paid-email-reminders
  and overlapping-PTO-alert items below. A provider (e.g. Resend, Postmark,
  SES) needs to be picked before this can do more than generate a token
  nobody receives. **Secondary decision, still open**: whether a successful
  reset should invalidate the user's other active sessions - session tokens
  today are stateless, HMAC-signed, and have no server-side revocation list
  at all (`src/lib/auth/session.ts`), so "sign out everywhere" isn't possible
  for *any* flow yet, not just this one - worth deciding if that's in scope
  here or its own separate item.
- **Dark mode.** Raised 2026-10-01. Note: an earlier auto (prefers-color-scheme)
  dark mode existed early on and was deliberately removed in favor of the
  current fixed light palette (dodger blue/Rockies purple on white) - see
  PROGRESS.md's "Branding" entry. Re-adding this for real needs a toggle
  (not just OS-detected auto-dark) and a parallel dark token set for every
  `--color-primary-*`/`--color-shift-*` value plus `--background`/
  `--foreground`, not just inverting backgrounds - a real design pass, not a
  quick CSS flip. **Decided 2026-10-02: not a paid-gated feature** - a basic
  display preference, not a usage driver, free plan included.
- ~~Settings: a "Company name" card with a font dropdown.~~ **Font half done
  2026-10-02 — moved to `VERIFY.md`.** **Still open**: part (a) of the
  original ask, actually editing the business's display name - `Tenant.name`
  is still set
  once at signup with no rename path anywhere in Settings; the new font card
  only picks a font for whatever `Tenant.name` already is, it doesn't let
  you change the text itself.
- ~~Give the app's font more of a "racing" feel - thicker overall.~~ **Done
  2026-10-01 — moved to `VERIFY.md`.**
- ~~**Dev role** Add a dev role that is only for me with an account that I setup. It
  allows me to review all accounts and determine if their is an issue that needs
  to be resolved. It has an account dashboard, displays billing, and allows
  me to setup discount codes.~~ **Done 2026-10-02 — moved to `VERIFY.md`.**
  One thing still genuinely open: discount codes are record-keeping only so
  far, not yet wired into the actual Stripe checkout redemption flow.
- ~~Let Manager and Admin add job types (service types) from Settings.~~
  **Done 2026-10-02, including the Settings-access rework it surfaced —
  moved to `VERIFY.md`.** The still-missing inline "+ Add new service type"
  in the calendar's create panel (mentioned for context in the original ask,
  not listed under "Needs:") remains unbuilt.
- ~~Split the single "Appointment & shift form" Settings card into separate
  appointment-form and shift-form sections.~~ **Done 2026-10-01, placeholder
  filled 2026-10-02 — moved to `VERIFY.md`.**
- **Time estimates in minutes or hours, interchangeably.** Job time estimates
  are currently a single "minutes" field - let the user enter/view in either
  unit.
- **Staff profile pictures.** The company-logo half of this is done (admin
  can upload/replace/remove one from User manager, shown in `AppHeader` next
  to the business name - see PROGRESS.md). Individual staff profile pictures
  are still unbuilt.
- **Anonymized shareable calendar links.** **Decided 2026-10-02: paid
  feature** - an external-facing convenience, cheap to gate. Reaffirmed
  2026-10-01 with the
  same shape as originally raised - two distinct links (one for appointments,
  one for shifts), each shareable via a plain URL, different from the
  existing `/calendar/view` (which still shows full client/staff detail,
  just non-interactive). The viewer at that link sees **only busy/free gaps**
  - every event stripped of name, client, and any other identifying data,
  just blocked-vs-open time. Needs: a public, unauthenticated route (no
  tenant session - overlaps with the self-service-booking-widget item
  below, which also needs an unauthenticated availability view, so these two
  could likely share the same underlying "compute free/busy for a public
  link" logic), and a real shareable-link mechanism (a per-tenant token in
  the URL, not just the tenant slug, so it can be revoked/rotated
  independently of the tenant's own login).
- **Shareable calendar link.** Raised 2026-10-02. Flagging for scope
  clarification rather than assuming: there's already an **"Anonymized
  shareable calendar links"** entry above (busy/free only, identifying data
  stripped, paid feature) - unclear whether this new ask is the same request
  restated, or a plain (non-anonymized, full-detail) shareable link distinct
  from that one. Needs a decision on which before building; if it's the
  latter, also needs a decision on who could open it (anyone with the link,
  no login at all?) since that's a bigger exposure than the anonymized
  version.
- **Full-screen mode for the calendar.** Raised 2026-10-02. Let the user
  expand `SchedulingCalendar` to fill the whole viewport (hiding
  `AppHeader`/surrounding page chrome) rather than it always rendering inside
  the normal app layout. Related to, but distinct from, the existing "A
  configurable visible time range for the calendar grid" and "A toggle to
  adjust the calendar's overall size" items above - those are about the
  grid's own dimensions/time bounds, this is about the surrounding page
  layout. Needs a decision on the trigger (a button in the calendar's toolbar
  vs. a browser-fullscreen API call) and whether it persists across reloads.
- **Paid-only email reminders.** Email reminder/schedule-for-the-day
  notifications for appointments, gated to paying tenants.
- **Paid, Settings-toggleable "staff status" counts** - on-duty, on-call, and
  on-PTO staff counts (e.g. a Dashboard widget: "3 on duty · 1 on call · 2 on
  PTO"). Raised 2026-10-01. Notes on what already exists vs. what's missing:
  - **On PTO** is the easy part - `staffOnApprovedLeave()` in
    `src/modules/timeoff/service.ts` already computes exactly this (used
    today by the coverage finder), just needs to be surfaced as a count for
    "right now" instead of a given appointment's time range.
  - **On duty** needs a "who's currently within a shift" query - straightforward
    (`Appointment` rows with `clientId: null`, `startTime <= now <= endTime`)
    but not built anywhere yet.
  - **On call has no concept in the data model at all.** There's no
    "on-call" shift type, flag, or schedule distinct from a regular shift
    today - this needs real design work (a new `Appointment`/shift field? a
    separate on-call schedule entirely?) before it can be counted, not just
    a query against existing data like the other two.
  - Gating: paid-tier feature, but also admin-toggleable in Settings (so a
    paying tenant can still turn the widget off if they don't want it) -
    two separate gates, not one.
- **Overlapping-PTO alert for managers.** **Decided 2026-10-02: paid
  feature** - bundle into the same paid-notifications bucket as the
  email-reminders item above rather than building it free-standing. Detect
  when two or more staff have
  approved (or requested?) time off covering the same day, and notify the
  manager. Raised 2026-10-01. Needs decisions before building:
  - **When to check**: at request time (warn the approver before they
    approve a second overlapping request), after the fact as a standing
    alert/report, or both.
  - **How to notify** - there's no notification system of any kind yet (no
    in-app notification center, no email infrastructure - see the
    paid-email-reminders item above, which is also still unbuilt). This
    feature can't ship without picking at least one real delivery channel
    first; "notify the manager" isn't a small add-on to existing
    infrastructure, it depends on infrastructure that doesn't exist.
  - **Threshold** - is any overlap worth flagging, or only once overlapping
    PTO would leave the business short-staffed for that day/shift (which
    would mean cross-referencing against scheduled shifts, not just other
    PTO requests)?
- **Per-user timezone.** Let a user change their own timezone (today
  `Tenant.timezone` exists but there's no per-user override, and nothing in
  the UI reads either one for display purposes yet). Paired with an
  **admin-toggleable setting** enabling this tenant-wide: when on, a user can
  check a box ("I'm in a different timezone"), pick their own timezone, and
  a small box appears showing their local time, the difference from "your"
  current time, and a brief summary. Needs a decision before building: whose
  time is "yours" to diff against - the viewing admin's own timezone, the
  tenant's business timezone, or whoever's calendar is being looked at -
  this wasn't specified and changes the implementation. **Decided
  2026-10-02: not a paid-gated feature** - a basic usability preference, not
  a usage driver, free plan included.
- **Let users customize their brand colors from the admin window.**
  **Decided 2026-10-02: paid feature** - white-labeling the app's chrome is
  a classic Pro/Business-tier feature, no cost-driver reason either way.
  Still open and distinct from the calendar color-key personalization
  below - this
  one is the app's own UI chrome palette (dodger-blue/Rockies-purple,
  `--color-primary-*`/`--color-shift-*` in `src/app/globals.css`, used for
  buttons/nav/branding throughout), not the calendar's event colors. Would
  need a per-tenant color setting, a color-picker UI, and the app reading
  that value at render time instead of the fixed CSS custom properties - a
  real feature, not a quick tweak, since nearly every page references these
  tokens.
- **External website integration / public booking widget.** **Decided
  2026-10-02: paid feature** - the single biggest upsell lever in this file;
  competitors (Jobber, Housecall Pro) charge extra tiers for exactly this.
  Let a business
  embed or link to a public-facing calendar on their own website where
  clients can see free time slots and book themselves, without logging in.
  This is the "self-service booking portal" from the original architecture
  plan (Phase 2). Needs: a public, unauthenticated route (no tenant session)
  that reads real-time availability for a tenant, an actual
  availability-computation engine (not yet built - `WorkingHours` exists but
  nothing reads it, see `ISSUES.md`), a booking flow that writes into the same
  `Appointment`/`EXCLUDE` constraint as admin-created bookings, and probably
  an embeddable widget/iframe or a hosted public page
  (`shiftup.app/<slug>/book`, matching what the signup form's "account URL"
  helper text already promises). Real design work needed before building -
  this is a meaningfully sized feature, not a quick add.
  - **Reaffirmed 2026-10-02, same feature restated as "a customer portal
    where the customer can book their own event"** - flagging as the same
    request rather than a separate one, since the shape matches exactly.
    Came with an explicit admin-side requirement this time: managers/admins
    need a real way to **set which time slots are open to be booked at
    all** (the user's own example: don't want a customer able to book 1 AM)
    - not just staff availability/double-booking prevention, but the
    business's own bookable hours as a hard constraint on the public
    booking flow. This is exactly the `WorkingHours` gap already flagged in
    `ISSUES.md` ("isn't used anywhere yet - the model exists but nothing
    populates it or constrains bookable times to it"), plus it likely needs
    a real Settings UI for an admin to actually define/edit those hours
    (per day of week, since "no 1 AM" implies a daily open/close range, not
    just one tenant-wide flag) - none of which exists yet either. Confirms
    this piece isn't optional/deferrable within the booking-widget build -
    the public flow can't safely ship without it.
- **Notes on an appointment.** Raised 2026-10-02. Let staff/admins attach
  notes to an appointment (and presumably a shift too, same underlying
  `Appointment` row) - part of the original architecture plan but never
  built (see "Original roadmap phases not reached yet" below). Explicitly
  flagged as wanting this **robust**, not a single plain-text afterthought -
  needs a real design pass before building, including:
  - **Multiple notes per appointment, not one field** - a running log (who
    said what, when), not a single overwritable textarea.
  - **Author + timestamp per note**, so it's clear who added what and when -
    not anonymous/unattributed.
  - **Edit/delete semantics** - can a note be edited or removed after the
    fact, by whom (the author only? any admin?), and should an edit leave a
    trace (edit history) or just overwrite silently.
  - **Permissions** - likely new `VIEW_NOTES`/`CREATE_NOTES`/`EDIT_NOTES`/
    `DELETE_NOTES` keys (same granular per-resource pattern already used for
    staff/services/clients/appointments in `src/lib/permissions/catalog.ts`),
    not just "whoever can already edit the appointment."
  - **Visibility** - are all notes visible to every staff member who can see
    the appointment, or is there an "internal only" vs. client-facing
    distinction (relevant once the self-service booking portal/any
    client-facing surface exists)?
  - **Data model** - a new `AppointmentNote` table (`appointmentId`,
    `authorId`, `body`, `createdAt`, maybe `editedAt`) rather than cramming
    onto `Appointment` itself, to actually support the "multiple, attributed,
    timestamped" shape above.
  Needs these decisions made before implementation starts, not just a quick
  schema add.
- **README for GitHub.** Write/update a proper README and share it. (This one
  doesn't need live testing to do - worth picking off whenever.)
- **Consider SEO.** Raised 2026-10-02. No decisions made yet - needs a pass on
  the public-facing pages (`src/app/page.tsx`, `src/app/about/page.tsx`,
  login/signup) for things like meta tags/Open Graph data, semantic
  headings, sitemap.xml/robots.txt, and page load performance. Low priority
  marketing/discoverability item, not a functional gap.
- ~~Top-nav "Staff management" and "Appointment management" dropdown
  sections.~~ **Done 2026-10-01, revised twice since — moved to
  `VERIFY.md`.**
- ~~A per-role permission for the calendar's Appointments/Shifts/Both
  switcher.~~ **Done 2026-10-01 — moved to `VERIFY.md`.**

## Security

- ~~A detailed, honest explanation of this software's security posture~~
  **Done 2026-10-01 — moved to `VERIFY.md`.**
- **Advertise its safety** - now unblocked (`SECURITY.md` exists and is
  accurate) - turn the real parts of it into actual landing-page/marketing
  copy.
- **Rate limiting / lockout on auth routes** - new item surfaced by the
  review above. `/api/auth/login`, `/api/auth/signup`, and
  `/api/superadmin/bootstrap` currently accept unlimited attempts from any
  source - password hashing is sound, but nothing throttles brute-force
  volume against it. Needs a decision on mechanism (in-memory/per-instance
  vs. a shared store like Redis, which this stack doesn't have yet) and
  threshold before building. **Decided 2026-10-02: not a paid-gated
  feature** - baseline security, applies to every tenant regardless of plan;
  same reasoning as 2FA above.

## Confirm/decide

Two built-on-an-assumption items (role hierarchy ordering, PTO "hours worked"
definition) moved to `VERIFY.md` — they're not bugs, just need your yes/no.

- ~~Roster page access is hardcoded to ADMIN/MANAGER/SUPERVISOR, not run
  through the tenant's configurable permission matrix.~~ **Done 2026-10-01 —
  moved to `VERIFY.md`.**

## Still-open Phase 0 infra (independent of app features)

- CI workflow (`.github/workflows/ci.yml`) — lint/typecheck/test/build on push.
- Azure infra scaffold (Bicep: App Service, Postgres Flexible Server, Function
  App, Key Vault) — not started. Provisioning real Azure resources costs money
  and needs your subscription, so this should be a deliberate step, not silent.
- Deploy workflow to Azure App Service — same caveat.

## Original roadmap phases not reached yet

Per the architecture plan (now partly superseded by the pricing/role/permission
changes, but the shape still holds): client/appointment notes (fully unbuilt -
now tracked as its own detailed entry above, under "New feature requests"),
tenant holidays (built and wired into the calendar - see
PROGRESS.md). (Tenant→platform Stripe payments
are built - see PROGRESS.md; client-pays-business via Stripe Connect is the
one payments piece still unbuilt, noted above under checkout; email
reminders are now tracked above as a paid feature.)
