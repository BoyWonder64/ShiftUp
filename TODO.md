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
here - this file is feature requests/backlog only. **All 6 tracked issues
are now resolved** (as of 2026-10-10) — moved to `VERIFY.md` for you to
confirm. See `ISSUES.md` if you want the full history.

## New feature requests (not started)

- ~~**Custom calendar entry types - let the user pick Shift, Appointment, or
  Custom (all features) when creating an entry.**~~ **Done, bundled with the
  calendar-split overhaul below - moved to `VERIFY.md`.** Built bigger than
  originally scoped: a real `EntryKind` enum (`SHIFT | APPOINTMENT | CUSTOM`,
  `prisma/schema.prisma`) now replaces the old clientId-based inference
  entirely, and instead of one fixed "Custom" option a tenant can create any
  number of independently-named `CustomCalendar`s (Settings > Calendars),
  each with its own show/hide field settings (client, job type, job
  estimate, color key, payment status) - not a single shared Custom form.
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
  entirely to a post-signup trip to Settings. **Decided 2026-10-09**: the
  step is skippable in favor of the 4 pre-seeded defaults. Role count is
  gated by plan, not a flat onboarding-only number: **Free tier is capped
  at 7 custom roles total, paid tiers are unlimited** - this cap applies to
  custom roles generally (not just ones created during onboarding), so
  enforcement belongs in whatever creates a `Role` row, same
  `src/lib/licensing/limits.ts` pattern as the existing staff/appointment
  caps - see `shiftup_pricing_decision` memory. Not yet implemented.
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
  **Decided 2026-10-09: a free-drag resize handle** (not preset sizes) -
  persistence (localStorage, per-browser) left as an implementation detail,
  not re-litigated.
- ~~Reusable shift-schedule templates, a new page for the staff manager.~~
  **Done 2026-10-02 — moved to `VERIFY.md`.**
- **Fix the schedule-templates builder UI - a visual week preview instead of a
  bare day-number input.** Raised 2026-10-09. Today in
  `ScheduleTemplatesView.tsx`, building a template's shifts means typing a raw
  "Day (0-`periodLengthDays - 1`)" number (`shiftDayOffset` state, the add-shift
  form around lines 470-480) with no indication of which weekday that maps to -
  doesn't read sensibly at a glance. Two related asks raised together:
  - **The day you're setting should read as a weekday, not just an integer
    offset** - e.g. label it "Day 0 (Mon)", "Day 1 (Tue)", ... for a 7-day
    template, since `dayOffset` is relative to whatever date the template gets
    applied from later (see the existing "relative to the period's start, not
    a real calendar date" note at line 438) - this is a display label over the
    existing offset, not a newly-stored day-of-week.
  - **A live visual week preview while building the template** - add a row
    rendered as a small calendar/week grid (one column per day) showing each
    shift in its day's column as it's added/removed, instead of (or in
    addition to) today's flat list of "Day N · time · staff" rows (the `<ul>`
    around lines 442-467). Should update immediately in the builder itself -
    distinct from the existing "Apply to a week" section's dry-run preview
    (lines 538-629), which only appears after a real `periodStart` date is
    picked for applying; this new preview is about visualizing the template's
    own shape while building it, before any real date is involved.
  Needs scoping before building: does the week-grid preview only make sense
  for `periodLengthDays === 7` (a literal calendar week), or does it need to
  generalize to longer periods (templates allow 1-90 days today via the
  existing min/max)? A grid stops reading as "a small calendar" much past two
  weeks, so this may need a different layout (or a scroll/paginated grid) for
  longer templates.
- **Sign in with Google (OAuth)** - raised 2026-10-01 as "two-factor
  authentication, possibly via Google," which was actually two different
  features (OAuth login vs. TOTP 2FA). **Decided 2026-10-09: build OAuth
  "Sign in with Google" as an added login method**, not TOTP - adds a
  third-party auth dependency (Google client ID/secret, consent screen) but
  no shared secret to store server-side. Needs: a new OAuth flow alongside
  the existing email/password login (presumably linking to an existing
  `User` by email, plus a decision on what happens when someone without a
  password-based account signs in this way for the first time), and
  whatever UI changes the login/signup pages need for a second login
  option. TOTP-style 2FA is not being built under this item - if that's
  still wanted later it's a separate, differently-scoped feature. **Still
  true from 2026-10-02: not a paid-gated feature, free plan included** -
  basic account security/login shouldn't be paywalled; see the
  rate-limiting item under Security below for the same reasoning.
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
  blocker, unchanged, explicitly revisited and still deferred 2026-10-09**:
  actually delivering the reset link needs an email-sending channel, and
  **there is no email infrastructure anywhere in this app yet** - same gap
  already flagged under the paid-email-reminders and overlapping-PTO-alert
  items below. No provider has been picked (asked directly 2026-10-09,
  answer was "decide later") - this, email reminders, and the PTO-overlap
  alert all stay blocked until one is. **Decided 2026-10-09**: a successful
  reset *should* invalidate the user's other active sessions ("sign out
  everywhere") - session tokens today are stateless, HMAC-signed, and have
  no server-side revocation list at all (`src/lib/auth/session.ts`), so this
  needs new revocation-list infrastructure (e.g. a `revokedAt`/session-id
  table checked on every request) as part of building this, not an
  afterthought - and that infrastructure is general enough it's worth
  building as its own reusable piece rather than single-purpose to password
  reset.
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
- **Update the main "ShiftUp" logo's font - current one doesn't work.**
  Raised 2026-10-09. The platform wordmark (`font-display` utility,
  `--font-display: var(--font-orbitron)` in `src/app/globals.css`, used on
  the "ShiftUp" text in `AppHeader.tsx` - this is the app's own brand mark,
  distinct from a tenant's uploaded company logo via Settings'
  `LogoSettings.tsx`) was set to Orbitron as part of the "racing feel" font
  pass above, but per the user it doesn't actually work visually. **Decided
  2026-10-09: move away from the racing theme toward a cleaner, more
  corporate wordmark** - prioritize legibility/professionalism over the
  motorsport feel the current font was chasing. Swapping `--font-orbitron`
  for a different Google/variable font import is a small change once an
  actual replacement typeface is picked; that specific pick is still open.
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
- **Fully customizable appointment/shift form, including step order.**
  Raised 2026-10-09. Today the create/edit panels in
  `SchedulingCalendar.tsx` have a fixed set of fields in a fixed order, with
  only binary show/hide toggles for a handful of them (`showJobType`,
  `showJobEstimate`, `showColorKey`, etc. in `AppointmentFormSettings.tsx`/
  `ShiftFormSettings.tsx`). This asks for more: an admin should be able to
  customize the form overall (not just which fields show, but how it's
  built) **and reorder its steps/fields**, not just toggle them on/off.
  **Decided 2026-10-09: scope is visibility + reorder of the existing fixed
  set of fields only - no genuinely new/custom fields for now.** That means
  no new `AppointmentCustomField`-style table; an ordered list of field keys
  can live on `Tenant` alongside the existing show/hide booleans. Still
  needs:
  - **Appointment vs. Shift forms** - presumably configured independently,
    same split as the existing `AppointmentFormSettings`/
    `ShiftFormSettings` cards.
  - **UI for the admin to actually reorder** - a drag-to-reorder list in
    Settings, most likely, mirroring the drag interactions already used
    elsewhere in the calendar (event drag/resize).
  - **Interacts with existing conditional fields** - e.g. the client picker
    (`requireClientForAppointments`), job estimate, color key - reordering
    needs to still respect fields that only make sense for one entry type
    (shift vs. appointment) or are conditionally shown already.
  Scope this before starting - "everything on the form customizable" is a
  significantly bigger lift than the show/hide toggles that exist today.
- ~~Client not required on an appointment, by default.~~ Raised 2026-10-09,
  **resolved same day by checking the code**: `Tenant.requireClientForAppointments`
  (`prisma/schema.prisma`) already exists as an admin toggle (Settings >
  "Appointment & shift form" > "Require a client on every appointment"),
  already defaults to `true`, and the user confirmed that's correct -
  **no change wanted**, just confirm the existing toggle actually works
  end-to-end. Moved to `VERIFY.md` as a check item instead of backlog.
- **Google Meet link integration for online appointments/shifts.** Raised
  2026-10-09. The "Online" vs. "In person" meeting-type toggle already
  exists (`Appointment.locationType`, `IN_PERSON | ONLINE`) on both the
  create and edit forms in `SchedulingCalendar.tsx`, with a free-text
  "Meeting link" field (`Appointment.location`) the user pastes any URL
  into - so "online vs. in person" itself is already built. What's
  actually new here is **generating a real Google Meet link
  automatically** instead of the admin/staff pasting one in by hand.
  **Decided 2026-10-09: the tenant's own connected Google account hosts
  every generated meeting**, not a per-staff-member connection - one
  business-level Google OAuth connection (likely Settings > Calendar or a
  new "Integrations" card), regardless of which staff member is assigned to
  the appointment. Still needs: the actual Google OAuth/Calendar API
  wiring (client ID/secret, token storage/refresh for that one connected
  account), a "generate Meet link" action on the create/edit form in place
  of (or alongside) the free-text field, and a fallback to the existing
  free-text field when no account is connected. Real design/integration
  work, not a form-field add.
- **Multiple tags per appointment/shift, with one marked dominant.** Raised
  2026-10-09. Today `Appointment.tagId` (`prisma/schema.prisma`) is a single
  optional FK to one `EventTag` - the "Color key" picker in
  `SchedulingCalendar.tsx` is single-select, and picking a custom tag vs. one
  of the 5 built-in `colorKey` values is already mutually exclusive (see the
  schema comment at line ~698). This asks for an entry to carry *several*
  tags at once, with the user choosing which one is dominant (i.e. which
  tag's color actually renders - `resolveEventColor` in
  `src/lib/colors/eventColors.ts` currently takes a single `tagColor`/
  `colorKey` and has no concept of picking among several). Needs:
  - A real many-to-many join table (e.g. `AppointmentTag`: `appointmentId`,
    `tagId`, plus a way to mark exactly one row dominant per appointment -
    either an `isDominant` boolean enforced app-side to be unique per
    appointment, or an explicit ordered position) replacing the single
    `tagId` column - a schema/migration change, not just a UI change.
  - UI rework of the "Color key" control from single-select to multi-select
    plus a dominant-picker (radio/star among the selected tags) in both the
    create and edit panels.
  - `resolveEventColor` needs to resolve from the dominant tag's color
    instead of a single `tagColor`, still losing to a terminal status
    (CANCELLED/NO_SHOW/COMPLETED) same as today.
  - Where else a single tag is assumed today (roster drill-down, any
    tag-based filtering) needs auditing once this becomes a list.
- **Schedule-template shift builder should reuse the real create-shift
  workflow, not a bare add-shift form.** Raised 2026-10-09. Today
  `TemplateDetail`'s add-shift form (`ScheduleTemplatesView.tsx`, the form
  around lines 469-535) only collects day offset, start/end time, staff, and
  job type - it has none of the other fields the real "New shift" panel in
  `SchedulingCalendar.tsx` collects (location type **online vs. in-person**
  plus the address/meeting-link text field, the tag/color-key picker, job
  estimate), and `ScheduleTemplateShift` (`prisma/schema.prisma`) has no
  columns for any of them - so a template-created shift always comes out
  `locationType: IN_PERSON` with no tag, regardless of what the real form
  would ask. Per the user: the template's shift-adding step should go
  through **the same workflow as creating a real shift** on the calendar,
  not a separately-scoped subset of fields - so this isn't just "add an
  online/in-person toggle," it's bringing the template add-shift form in
  line with whatever `SchedulingCalendar.tsx`'s create-shift panel asks for
  (including respecting the existing per-tenant `showJobType`/
  `showJobEstimate`/`showColorKey` toggles from `ShiftFormSettings.tsx`, same
  as the real form does). Needs:
  - `ScheduleTemplateShift` schema additions for whichever fields the real
    form has that the template doesn't yet (`locationType`, `location`,
    `tagId`/`colorKey`, estimate fields) - mirroring `Appointment`'s columns.
  - The add-shift form and shift list in `ScheduleTemplatesView.tsx`
    rewritten to match the real form's field set/behavior instead of staying
    a hand-maintained subset that drifts from it over time.
  - The apply logic (`src/modules/scheduling/templates.ts`, `applyTemplate`)
    updated to copy the new fields onto the real `Appointment` rows it
    creates, the same way it already copies `shiftServiceTypeId` today.
  - Interacts with the multiple-tags/dominant-tag item above if that ships
    first - the template form's tag picker should match whatever the real
    form's picker looks like by the time this is built.
- **Dashboard's "Upcoming appointments" stat should show a small list,
  linking each item to its spot on the calendar.** Raised 2026-10-09. Today
  `DashboardPage`'s `StatCard` (`src/app/(admin)/app/[tenantSlug]/dashboard/page.tsx`,
  lines 280-296, 302-314) just renders a bare count that links generically to
  `/app/${tenantSlug}/calendar` - no way to see *which* appointments make up
  that number without leaving the dashboard and finding them manually. Wants:
  under/alongside the count, a small list of the actual upcoming items (e.g.
  the next handful by `startTime`), each one a link that takes you straight
  to that specific appointment on the calendar - not just the calendar's
  landing view. **Needs new deep-link support that doesn't exist yet**:
  `/calendar/page.tsx` today only reads `staff`/`type` query params (filters),
  nothing that opens to a specific date or a specific event/appointment id -
  so this needs a new query param (e.g. `?eventId=`) that `SchedulingCalendar.tsx`
  reads on load to jump its view to that event's date and open its detail
  panel, which the calendar doesn't support from a URL today. Should pair
  with fixing the miscounting bug tracked in `ISSUES.md` (today's count
  silently includes shifts) so the list this shows matches whatever the
  fixed count actually represents.
- ~~**Fully separate the Shifts and Appointments calendars - today it's still
  one shared calendar.**~~ **Done - moved to `VERIFY.md`.** Built as real
  separate routes - `/calendar/appointments`, `/calendar/shifts`,
  `/calendar/custom/[calendarId]` (one per named `CustomCalendar`), and
  `/calendar/all` (everything combined) - each its own page/mount with
  independent view state, not a client-side filter over one shared
  component. The old `/calendar` route now just redirects to whichever of
  these a given viewer can reach (preferring "all"). Gated per-kind by a new
  `src/lib/permissions/calendarAccess.ts` (license tier + the new Settings >
  Calendars on/off toggles + the relevant `VIEW_*` permission), which also
  drives which items `AppHeader`'s Calendar dropdown shows. Roster and
  Reports were deliberately left as combined views, not split, per the
  original scoping question above.
- **A setting to base public-booking availability on actual scheduled
  shifts, not just the generic `WorkingHours` template.** Raised 2026-10-09.
  Today `listAvailableSlotsByStaff` (`src/modules/scheduling/availability.ts`,
  lines ~99-144) computes a staff member's publicly bookable windows purely
  from their recurring `WorkingHours` rows (a weekly day-of-week/start-end
  template, same one `WorkingHoursEditor.tsx` edits) - it fetches that staff
  member's real `Appointment` rows too (lines 105-113), but only to treat
  them as **busy blockers** (`blockedByAppointment`, line 136) subtracted
  from the `WorkingHours` windows, exactly like a client appointment would
  block another one. A scheduled **shift** (`clientId` null) gets the same
  treatment as a booked appointment there - it's never treated as the thing
  that *creates* availability, which is backwards from how a shift
  conceptually works (it's when that staff member is actually at work and
  bookable, not when they're busy). This asks for a per-tenant toggle so
  availability can instead be **derived from real scheduled shifts** - a
  client can only publicly book a time that falls inside a staff member's
  actual shift for that day, rather than their general recurring hours
  template. Needs:
  - The new mode needs its own slot-generation path alongside (not
    replacing) the existing `WorkingHours`-based one - admin picks which
    model a tenant uses, presumably in Settings > Booking Widget next to
    the other `publicBookingEnabled`-gated controls.
  - Resolving the double-duty conflict this creates: if a shift itself now
    *grants* availability, what still counts as "busy" within that shift
    window (e.g. another appointment already booked against the same staff
    member in that slot) needs to keep blocking, while the shift row itself
    stops being treated as a blocker the way it is today.
  - Interacts with `BlockedTime`/approved `TimeOff`/holidays - those should
    presumably still subtract from shift-derived availability the same way
    they already subtract from `WorkingHours`-derived availability today.
  - Interacts with the booking-widget's `collapseForDisplay` logic (the
    public availability GET route, per the doc comment on
    `listAvailableSlotsByStaff`) and the booking confirmation route, which
    both assume slots come from one availability model today.
- **Time estimates in minutes or hours, interchangeably.** Job time estimates
  are currently a single "minutes" field - let the user enter/view in either
  unit.
- **Staff profile pictures.** The company-logo half of this is done (admin
  can upload/replace/remove one from User manager, shown in `AppHeader` next
  to the business name - see PROGRESS.md). Individual staff profile pictures
  are still unbuilt.
- **A color per staff member.** Raised 2026-10-03. Let each staff member have
  their own color (could be as simple as a default color assigned per
  `StaffProfile`, no per-event picking required) so their shifts/appointments
  are visually distinguishable on the calendar at a glance. Distinct from the
  existing `EventTag`/`Tenant.eventColors` system (`src/lib/colors/eventColors.ts`,
  `EventColorSettings.tsx`) - those are tenant-defined tags assignable per
  *event*, not a color tied to *who* the event belongs to. **Decided
  2026-10-09:** admin-assigned per staff member (not self-picked), and when
  both a staff color and an `EventTag`/color key are present on the same
  appointment, **the tag/color key wins** - same "low-priority fallback"
  slot that status color already takes priority over, so staff color only
  shows when nothing else overrides it. No new precedence rule needed
  beyond adding staff color as the new lowest-priority option in
  `resolveEventColor`.
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
  independently of the tenant's own login). ~~**Shareable calendar
  link**~~ (raised separately 2026-10-02, flagged for scope clarification)
  - **resolved 2026-10-09: same request, not a separate link** - this entry
  covers both.
- **Full-screen mode for the calendar.** Raised 2026-10-02. Let the user
  expand `SchedulingCalendar` to fill the whole viewport (hiding
  `AppHeader`/surrounding page chrome) rather than it always rendering inside
  the normal app layout. Related to, but distinct from, the existing "A
  configurable visible time range for the calendar grid" and "A toggle to
  adjust the calendar's overall size" items above - those are about the
  grid's own dimensions/time bounds, this is about the surrounding page
  layout. **Decided 2026-10-09: a button in the calendar's toolbar** (not
  the browser Fullscreen API) - a CSS-driven expand that hides page chrome,
  no browser-fullscreen listener/Esc handling needed.
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
  - **On call - redirected 2026-10-09, not a count/schedule concept
    anymore.** Original framing asked whether on-call needed a new
    `Appointment`/shift field or a separate schedule before it could be
    counted alongside on-duty/on-PTO. Per the user, that's not actually the
    shape wanted: instead, the existing **"Find coverage"** action on the
    appointment/shift detail panel (`findCoverage`/`coverageCandidates` in
    `SchedulingCalendar.tsx`, today opens a small inline list of available
    staff to assign) should open a real page listing on-call staff with
    their **name, phone, email, and other contact methods** - a contact
    directory for reaching someone, not a scheduled on-call shift type.
    This changes the shape of this sub-item from a Dashboard count tile to
    a lookup page reached from an existing action - still needs: deciding
    whether "on-call staff" is the same pool `findCoverage` already
    computes (available/not-overlapping) or a separately-designated list,
    and **a new `phone` field** - `User` has `email` but no phone number
    anywhere today (only `Client.phone` exists), so this needs its own
    schema addition plus somewhere for a staff member to actually enter it
    (Account settings, presumably) before a contact directory can show one.
  - Gating: paid-tier feature, but also admin-toggleable in Settings (so a
    paying tenant can still turn the widget off if they don't want it) -
    two separate gates, not one.
- **Overlapping-PTO alert for managers.** **Decided 2026-10-02: paid
  feature** - bundle into the same paid-notifications bucket as the
  email-reminders item above rather than building it free-standing. Detect
  when two or more staff have
  approved (or requested?) time off covering the same day, and notify the
  manager. Raised 2026-10-01. **Decided 2026-10-09: check at request time**
  - warn the approver before they approve a second overlapping request,
  rather than (or in addition to, if revisited later) a standing
  after-the-fact report. Still blocked, unchanged:
  - **How to notify** - there's no notification system of any kind yet (no
    in-app notification center, no email infrastructure - see the
    paid-email-reminders item above, which is also still unbuilt, and whose
    provider decision was explicitly deferred again 2026-10-09). This
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
  current time, and a brief summary. **Decided 2026-10-09: "yours" means
  the viewing admin/manager's own timezone** - whoever is looking at the
  schedule sees everyone else's time relative to their own, not a fixed
  tenant-wide reference point. **Decided 2026-10-02: not a paid-gated
  feature** - a basic usability preference, not a usage driver, free plan
  included.
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
- ~~**External website integration / public booking widget.**~~ **Done
  2026-10-09 — moved to `VERIFY.md`.** Built as an embeddable `<script>`
  snippet (`public/booking-widget.js`) injecting an iframe at
  `/book/<slug>?embed=1`, backed by a new availability engine
  (`src/modules/scheduling/availability.ts`) that finally reads `WorkingHours`
  (closing the `ISSUES.md` gap) alongside approved `TimeOff`, `BlockedTime`,
  and blocked holidays. New Settings > Booking Widget page covers the
  admin-side pieces this was reaffirmed to need: a per-staff weekly hours
  editor (`WorkingHoursEditor.tsx`, the "no 1 AM" bookable-hours control),
  which service types are publicly bookable, min-notice/booking-window
  bounds, and the embed snippet itself. Paid feature as decided
  (`assertBookingWidgetEnabled`), plus a second admin on/off toggle
  (`Tenant.publicBookingEnabled`) layered on top, same two-gate shape as
  schedule templates. New anonymous `runInPublicContext` tenant-context kind
  (RLS-scoped, no session) backs the three unauthenticated routes under
  `/api/public/booking/[tenantSlug]/`.
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
  - **Edit/delete semantics - decided 2026-10-09: author-only, with edit
    history.** Only the note's original author can edit or delete it (not
    "any admin"), and an edit leaves a trace (an `editedAt`, or a real
    history table if the trace itself needs to show prior text, not just
    that a change happened - worth deciding which of those two at
    implementation time) rather than silently overwriting.
  - **Permissions** - likely new `VIEW_NOTES`/`CREATE_NOTES`/`EDIT_NOTES`/
    `DELETE_NOTES` keys (same granular per-resource pattern already used for
    staff/services/clients/appointments in `src/lib/permissions/catalog.ts`),
    not just "whoever can already edit the appointment." (`EDIT_NOTES`/
    `DELETE_NOTES` only matter for staff with elevated permissions acting on
    someone else's note, since authorship itself already gates normal
    edit/delete per the decision above.)
  - **Visibility - decided 2026-10-09: a real internal/client-facing split,
    not "all notes visible to everyone who can see the appointment."**
    Internal staff (anyone who can already see the appointment) see every
    note on it; the client who booked the appointment sees only the notes
    on *their own* appointment, and presumably only ones marked
    client-facing rather than every internal note - needs a per-note
    `visibleToClient`-style flag, not just a page-level toggle. This
    explicitly depends on a client ever being able to log in and see their
    own appointments at all, which **doesn't exist yet** - no client
    login/portal surface anywhere in the app today (`Client` is
    guest-first, no session). This note feature can track the flag from
    day one, but the actual client-facing view can't ship until that
    broader client-access surface exists - likely the same underlying piece
    the self-service booking widget below would need anyway.
  - **Data model** - a new `AppointmentNote` table (`appointmentId`,
    `authorId`, `body`, `createdAt`, `editedAt`, `visibleToClient`) rather
    than cramming onto `Appointment` itself, to actually support the
    "multiple, attributed, timestamped, client-visibility-aware" shape
    above.
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
  volume against it. **Decided 2026-10-09: in-memory, per-instance** (not a
  shared Redis store) - no new infra dependency, acceptable since this app
  isn't running multiple instances today; revisit if that changes. Specific
  threshold (attempts per window) still needs picking at implementation
  time. **Decided 2026-10-02: not a paid-gated feature** - baseline
  security, applies to every tenant regardless of plan; same reasoning as
  the Google sign-in item above.

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
