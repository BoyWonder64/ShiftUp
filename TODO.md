# ShiftUp — Deferred / open items

Things that have been raised but deliberately **not** built yet, kept here so
they don't get lost. Discuss/prioritize before picking any of these up.
Day-to-day build status (what's done, what's verified) lives in `PROGRESS.md` —
this file is just the backlog. For current API routes/data model/permissions,
see `ARCHITECTURE.md`.

## Bugs / UX fixes

- **Layout shift when opening "+ Add appointment"/"+ Schedule shift".**
  Reported 2026-10-01. First fix (`scrollbar-gutter: stable`) did **not**
  resolve it - user confirmed still happening. Re-diagnosed: the "Cancel"
  button was only mounted into the action-button row while `creating` was
  set, growing that row's width and reflowing the settings box next to it -
  correlates exactly with the reported trigger. **Second fix applied**:
  Cancel is now always rendered (`invisible` class toggle instead of
  conditional mount), so its appearance can never change the row's width.
  Left the scrollbar-gutter fix in place too. **Still needs your browser
  confirmation** - don't want to repeat declaring this fixed on code-reading
  confidence alone twice in a row.

## New feature requests (not started)

- **Custom roles — HIGH PRIORITY (flagged by user 2026-10-01).** Let a tenant
  define its own named roles instead of being limited to the 4 fixed
  configurable ones (Manager/Supervisor/Employee/Customer). This is a real
  data-model change, not a UI add-on: `UserRole` is a **Postgres enum**
  today (`ADMIN`/`MANAGER`/`SUPERVISOR`/`EMPLOYEE`/`CUSTOMER`/`SUPERADMIN`),
  hardcoded into `User.role`, the signed session cookie's payload type
  (`src/lib/auth/session.ts`), and every permission/visibility check
  (`RolePermission`/`RoleVisibility` are keyed by that same enum via
  `ConfigurableRole`). Supporting real custom roles means turning role into
  a proper per-tenant `Role` table (id, name, tenantId) that `User.role`
  references by FK instead of an enum value, and `RolePermission`/
  `RoleVisibility` keying off that `Role.id` instead of a fixed enum member.
  Needs decisions before building: can a custom role be deleted/renamed once
  users hold it (what happens to those users), is there still a fixed
  minimum role floor (e.g. must every tenant still have something under
  ADMIN), and whether the existing 4 defaults become just pre-seeded rows a
  tenant can edit/rename/delete like any other, or stay specially protected.
  Related to - but a different ask than - the already-open "Dev role" item
  below (a single new hardcoded platform-operator role) and the "Roster page
  access hardcoded" item (which this would also let a tenant fix themselves
  once roles aren't a fixed enum).
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
- **Reusable shift-schedule templates, a new page for the staff manager.**
  Raised 2026-10-01: build a schedule once (who works which hours on which
  day), then re-apply that same pattern to a different week instead of
  rebuilding it from scratch each time. A real new data model, not a reuse
  of `Appointment`:
  - **`ScheduleTemplate`** (tenantId, name, periodLengthDays) +
    **`ScheduleTemplateShift`** (templateId, staffId, dayOffset within the
    period, startTime/endTime, optional serviceTypeId) - a template shift is
    relative to the period, not tied to a real calendar date, so the same
    template can be applied starting from any week.
  - **The "setting that asks for the time length of this schedule"** -
    `periodLengthDays` above, read as a per-template field (set when
    creating that template, e.g. a 7-day vs. 14-day rotation), not a single
    tenant-wide default - worth confirming that reading is right before
    building.
  - **Applying a template to a week** generates real `Appointment` rows
    (shifts - `clientId` null) for the target period. Needs a decision on
    conflicts: what happens when a generated shift would double-book a staff
    member already scheduled that day (the `EXCLUDE` constraint will reject
    it) - block the whole apply, skip just the conflicting ones and report
    which failed, or show a conflict preview before confirming.
  - **New permission keys needed** (same granular VIEW/CREATE/EDIT/DELETE
    pattern as staff/services/clients/appointments in
    `src/lib/permissions/catalog.ts`), plus a separate "apply a template"
    permission distinct from "edit a template's definition" - applying
    actually creates real scheduled shifts, a bigger-stakes action than
    editing a draft pattern.
  - **Additional manager-useful features worth considering** (asked for by
    name, not yet decided): a preview/diff before applying showing exactly
    what would be created and flagging conflicts; cloning an existing
    template as a starting point for a new one; named templates so a manager
    can keep several patterns (e.g. "Summer schedule" vs. "Holiday
    schedule"); an "undo this apply" action to remove everything one
    apply-run generated, in case of a mistake; tracking which `Appointment`
    rows came from which template+apply-run to make that undo possible.
  
  Sizable enough to warrant its own page, data model, and permission work -
  treat as a dedicated effort, not a quick add onto `SchedulingCalendar.tsx`.
- **Two-factor authentication**, possibly via Google (Sign in with Google, or
  TOTP-style Google Authenticator support). Raised 2026-10-01. Needs a
  decision: OAuth-based "Sign in with Google" (adds a third-party auth
  dependency, no shared secret to store) vs. TOTP 2FA where Google
  Authenticator is just one compatible app among several (needs a stored
  per-user secret + backup codes) - these are different features with
  different scope, not two options for the same thing.
- **Dark mode.** Raised 2026-10-01. Note: an earlier auto (prefers-color-scheme)
  dark mode existed early on and was deliberately removed in favor of the
  current fixed light palette (dodger blue/Rockies purple on white) - see
  PROGRESS.md's "Branding" entry. Re-adding this for real needs a toggle
  (not just OS-detected auto-dark) and a parallel dark token set for every
  `--color-primary-*`/`--color-shift-*` value plus `--background`/
  `--foreground`, not just inverting backgrounds - a real design pass, not a
  quick CSS flip.
- **Settings: a "Company name" card with a font dropdown.** Refined
  2026-10-01 from the earlier vague "custom font" ask into something more
  concrete: a Settings section where the admin can (a) edit the business's
  display name - there's currently no way to rename it after signup at all,
  `Tenant.name` is set once at signup and nothing in Settings can change it
  - and (b) pick a font for how that name renders (e.g. in `AppHeader`, the
  Dashboard heading) from a curated dropdown of preset options, not a raw
  font-file upload. Needs a decision on scope: just the business-name text,
  or (as the original ask also mentioned) customizable fonts for the overall
  page too - the latter is the much bigger version, see the font-scoping
  back-and-forth already done this session for how fiddly getting one font
  choice right was.
- ~~Give the app's font more of a "racing" feel - thicker overall.~~ **Done**
  2026-10-01 - Orbitron on headings and the nav brand, body text left alone,
  colors unchanged (see PROGRESS.md). User reviewed live: liked it overall
  but not on the calendar toolbar's month/year heading specifically - that
  one spot was reverted to the plain body font (no display face at all, not
  a third font) per "basic professional" feedback.
- **Dev role** Add a dev role that is only for me with an account that I setup. It
  allows me to review all accounts and determine if their is an issue that needs 
  to be resolved. It has an account dashboard, displays billing, and allows
  me to setup discount codes
- **Time estimates in minutes or hours, interchangeably.** Job time estimates
  are currently a single "minutes" field - let the user enter/view in either
  unit.
- **Staff profile pictures.** The company-logo half of this is done (admin
  can upload/replace/remove one from User manager, shown in `AppHeader` next
  to the business name - see PROGRESS.md). Individual staff profile pictures
  are still unbuilt.
- **Anonymized shareable calendar links.** Reaffirmed 2026-10-01 with the
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
- **Overlapping-PTO alert for managers.** Detect when two or more staff have
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
  this wasn't specified and changes the implementation.
- **Let users customize their brand colors from the admin window.** Still
  open and distinct from the calendar color-key personalization below - this
  one is the app's own UI chrome palette (dodger-blue/Rockies-purple,
  `--color-primary-*`/`--color-shift-*` in `src/app/globals.css`, used for
  buttons/nav/branding throughout), not the calendar's event colors. Would
  need a per-tenant color setting, a color-picker UI, and the app reading
  that value at render time instead of the fixed CSS custom properties - a
  real feature, not a quick tweak, since nearly every page references these
  tokens.
- **External website integration / public booking widget.** Let a business
  embed or link to a public-facing calendar on their own website where
  clients can see free time slots and book themselves, without logging in.
  This is the "self-service booking portal" from the original architecture
  plan (Phase 2). Needs: a public, unauthenticated route (no tenant session)
  that reads real-time availability for a tenant, an actual
  availability-computation engine (not yet built - `WorkingHours` exists but
  nothing reads it, see below), a booking flow that writes into the same
  `Appointment`/`EXCLUDE` constraint as admin-created bookings, and probably
  an embeddable widget/iframe or a hosted public page
  (`shiftup.app/<slug>/book`, matching what the signup form's "account URL"
  helper text already promises). Real design work needed before building -
  this is a meaningfully sized feature, not a quick add.
- **README for GitHub.** Write/update a proper README and share it. (This one
  doesn't need live testing to do - worth picking off whenever.)
- ~~Top-nav "Staff management" and "Appointment management" dropdown
  sections.~~ **Done 2026-10-01** - see PROGRESS.md's "Calendar layout-shift
  bug, actually fixed this time, and the nav bar split into Appointment/Staff
  dropdowns" entry. Built as scoped: `AppHeader` now has "Appointment pages"
  (Calendar pre-filtered via `?type=appointment`, View only) and "Staff
  pages" (Calendar pre-filtered via `?type=shift`, Roster, Time off)
  dropdowns; Settings and Billing both stay as plain top-level nav links,
  separate from either group (Settings was moved back out of "Staff pages"
  same day, per request - it's tenant-wide config, not staff-specific);
  Dashboard/Sign out stay general nav too. The dropdowns are not gated by
  license tier - a shift-only tenant still sees the "Appointment pages"
  dropdown, same tradeoff noted when this was built.

## Security

- **A detailed, honest explanation of this software's security posture** -
  written for you to read, and separately something you could show
  prospective users to answer "is this safe to use?" Should cover what's
  actually true today: RLS-enforced tenant isolation (with the automated
  proof test), scrypt password hashing, HMAC-signed sessions, the
  non-superuser DB role fix, Stripe handling all card data (no card data
  touches this app), and - equally honestly - what's *not* yet true (no CI,
  no security audit, no penetration test, no rate limiting on auth routes
  yet). Don't write marketing copy here; write the real picture first.
- **Advertise its safety** - once the above is written and accurate, turn
  the real parts of it into actual landing-page/marketing copy.

## Confirm/decide

- **Role hierarchy ordering.** Built on the assumption `MANAGER` outranks
  `SUPERVISOR`, and that job-estimate visibility defaults to
  `ADMIN`/`MANAGER` only (not `SUPERVISOR`). Never explicitly confirmed —
  flagged multiple times, no correction given, so this is what's live.
- **PTO approval workflow + "hours worked" definition** (self-service request
  + manager/admin approval; "hours worked" = the calendar week containing the
  shift) - built with standard defaults, not explicitly confirmed by you.
- **Roster page access is hardcoded to ADMIN/MANAGER/SUPERVISOR**, not run
  through the tenant's configurable permission matrix like every other gate
  in the app (`VIEW_APPOINTMENTS` etc.) - "manager-facing" was explicit in
  the request, and there's no existing permission key for "see the team
  roster," so a role check was the fastest honest option rather than
  inventing a 19th permission key without being asked. Worth revisiting if
  you want this configurable per role like everything else.

## Known gaps in what's already built

- **Checkout flow built, not yet live-tested.** `License.billingPlan` supports
  `ONE_TIME` and `SUBSCRIPTION`, and real Stripe Checkout is wired up
  (`src/lib/licensing/pricing.ts`, `POST /api/billing/checkout`,
  `POST /api/billing/webhook`, `/app/[tenantSlug]/billing`) at the agreed
  prices: Free (1 staff, 10 appointments/month, enforced), one-time $199/module
  or $449 both, subscription $20/mo per module or $40/mo both. Billing lets a
  tenant buy a different tier than whatever they're exploring for free.
  PayPal is enabled for one-time purchases (Stripe-native, no separate
  integration). **Not yet tested end-to-end** — needs a real Stripe test-mode
  account (`STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` in `.env`), which
  only you can provide. See PROGRESS.md for what's verified so far vs. not.
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
  regardless of the visibility matrix.
- **No part of `SchedulingCalendar`'s client-fetched UI can be confirmed by curl.**
  Its permissions/staff/events all load via `useEffect` after hydration, so a
  server-rendered curl check always sees `permissions = null` and skips every
  block gated on it — the buttons, the staff filter, drag/resize, and the
  color-coded events are all correct by code review and their underlying API
  calls are genuinely tested, but none of their actual on-screen behavior has
  been clicked through in a real browser (none available in the dev
  environment). This is also why a future bug report in this area can't be
  diagnosed from this side alone - a manual pass with specific symptoms helps a lot.
- **`WorkingHours` isn't used anywhere yet.** The model exists but nothing
  populates it or constrains bookable times to it — the calendar only
  prevents literal double-booking, not booking outside a staff member's
  actual hours. (This blocks the booking-widget feature above too.)
- **No dedicated client manager.** Clients can now be searched/added inline
  from the appointment form (name/email/phone/address, with confirm-address),
  but there's still no standalone admin page to browse, edit, or delete an
  existing client (`EDIT_CLIENTS`/`DELETE_CLIENTS` permissions already exist
  in the catalog, just nothing in the UI calls them yet) - e.g. fixing a typo
  in a client's phone number currently has no path except direct DB access.
- ~~Calendar color key, custom color tags, and holidays: admin side is built,
  the calendar itself isn't wired up yet.~~ **Done** - see PROGRESS.md's
  "Calendar now consumes tenant colors, tags, and holidays" entry.

## Still-open Phase 0 infra (independent of app features)

- CI workflow (`.github/workflows/ci.yml`) — lint/typecheck/test/build on push.
- Azure infra scaffold (Bicep: App Service, Postgres Flexible Server, Function
  App, Key Vault) — not started. Provisioning real Azure resources costs money
  and needs your subscription, so this should be a deliberate step, not silent.
- Deploy workflow to Azure App Service — same caveat.

## Original roadmap phases not reached yet

Per the architecture plan (now partly superseded by the pricing/role/permission
changes, but the shape still holds): client/appointment notes (fully
unbuilt), tenant holidays (built and wired into the calendar - see
PROGRESS.md). (Tenant→platform Stripe payments
are built - see PROGRESS.md; client-pays-business via Stripe Connect is the
one payments piece still unbuilt, noted above under checkout; email
reminders are now tracked above as a paid feature.)
