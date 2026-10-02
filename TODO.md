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
  limited to the 4 fixed configurable ones.~~ **Done 2026-10-01** - see
  PROGRESS.md's "Full custom-roles system" entry. `User.role` is now a
  3-value enum (`SUPERADMIN`/`ADMIN`/`STAFF`) plus a real per-tenant `Role`
  table (name, description, nullable `reportsTo` hierarchy) that
  `RolePermission`/`RoleVisibility` key off of instead of a fixed enum.
  Roles can be created, renamed, described, given a reports-to, and deleted
  (blocked while anyone holds them) from Settings. The pre-existing 4
  defaults (Manager/Supervisor/Employee/Customer) were preserved as real,
  editable/deletable rows, not replaced. Supersedes the `Tenant.roleLabels`
  rename-only stopgap mentioned below, which has been removed.
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
  **Done 2026-10-02** - new `/app/[tenantSlug]/schedule-templates` page
  (`ScheduleTemplatesView.tsx`), linked from `AppHeader`'s "Staff pages"
  dropdown, gated on the new `VIEW_SCHEDULE_TEMPLATES` permission.
  - **Data model, as originally specced**: `ScheduleTemplate` (tenantId,
    name, `periodLengthDays`) + `ScheduleTemplateShift` (templateId,
    staffId, `dayOffset` 0-indexed within the period, `startMinute`/
    `endMinute` - same minutes-since-midnight convention as `WorkingHours`,
    optional serviceTypeId) - relative to the period, not a real calendar
    date, so the same template applies starting from any week.
    `periodLengthDays` confirmed as a per-template field, not a tenant-wide
    default - set once when creating a template (e.g. 7-day vs. 14-day
    rotation), enforced on shrink (`PATCH` rejects a smaller value than an
    existing shift's `dayOffset` needs).
  - **Conflict handling, decided 2026-10-02**: preview before applying - the
    admin picked this explicitly over "skip and report after" or "block the
    whole apply." `POST /api/schedule-templates/:id/apply` with
    `dryRun: true` computes exactly what would be created and flags any
    shift that would double-book a staff member (against an existing
    appointment, or against another row in the same template), without
    writing anything; the real apply (`dryRun: false`) then creates every
    non-conflicting shift and skips just the flagged ones, reported back as
    `{created, skipped}` - the admin sees the full picture before committing,
    and a conflict only costs that one shift, not the whole run.
  - **Permission keys**: `VIEW/CREATE/EDIT/DELETE_SCHEDULE_TEMPLATES` (same
    granular pattern as staff/services/clients/appointments) plus a separate
    `APPLY_SCHEDULE_TEMPLATES` - applying creates real scheduled shifts, a
    bigger-stakes action than editing a draft pattern, so a role can be
    allowed to apply existing templates without being able to redefine them.
    Starter defaults: Manager gets all five; Supervisor gets
    `VIEW`/`APPLY` (mirrors it already holding `CREATE_APPOINTMENTS` - same
    split as `VIEW_SERVICES` true / `CREATE_SERVICES` false) but not
    `CREATE`/`EDIT`/`DELETE`; Employee/Customer get none.
  - **Of the "additional features worth considering" list, built**: a
    preview/diff before applying (see conflict handling above) and cloning
    an existing template (`POST /api/schedule-templates/:id/clone` - copies
    name, period length, and every shift). **Not built**: an "undo this
    apply" action and tracking which `Appointment` rows came from which
    apply-run - both still require a real `ApplyRun`-style model, left for
    later if an actual mistaken-apply incident makes it worth the schema
    addition.
  - **Decided paid feature** (per the line above, confirmed before
    building): gated by a new `assertScheduleTemplatesEnabled` in
    `src/lib/licensing/limits.ts` - `FREE` plan blocked entirely (not a
    usage cap like the staff/appointment limits, a whole-feature gate),
    `ONE_TIME`/`SUBSCRIPTION` unrestricted. Enforced in every
    `/api/schedule-templates/**` route, not just hidden in the UI; the page
    itself shows an "Upgrade to use this" card in place of the tool for a
    `FREE` tenant. **Judgment call, flagging rather than silently deciding**:
    gated *all* actions including viewing/deleting a tenant's own
    already-existing templates after a hypothetical downgrade from paid back
    to `FREE`, not just creating new ones or applying - simplest reading of
    "paid feature," but means a downgraded tenant can't even clean up old
    templates without re-upgrading. Low-stakes today since Stripe checkout
    isn't live yet (every signup is `FREE`; the only way to reach a paid
    plan pre-checkout is the SUPERADMIN console's manual override), but
    worth revisiting once real downgrades can happen.
  - **Verified live** via curl against two fresh signups: created a template
    with two shifts for one staff member, confirmed `GET .../apply` with
    `dryRun: true` computed the right `startTime`/`endTime` for both and
    flagged neither as a conflict; applied for real and confirmed two
    `Appointment` rows were created with `clientId: null`; re-applied the
    *same* template to the *same* week and confirmed both were now correctly
    flagged and skipped as `CONFLICT`; cloned the template and confirmed the
    copy carried over both shifts; confirmed a day-offset outside the
    period's length 400s, and shrinking the period below an existing shift's
    offset 400s with `PERIOD_TOO_SHORT`; confirmed an Employee (lacking
    `VIEW_SCHEDULE_TEMPLATES`) gets 403 on every route; confirmed a second,
    separate `FREE`-plan tenant's ADMIN gets 403 with the paid-feature
    message on every route including plain `GET`, and that the page itself
    renders the upgrade card instead of the tool. `tsc --noEmit`, `eslint`,
    the full `vitest` suite (15/15), and `next build` all clean. **Not
    browser-click-tested** - same standing caveat as the rest of this app's
    client-rendered UI; the shift-add form, preview table, and apply/confirm
    buttons are correct by code review and their underlying API calls are
    genuinely tested, but the on-screen interaction hasn't been clicked
    through in a real browser.
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
- **Password reset workflow - half done.** Raised 2026-10-02. **Done
  2026-10-02**: a logged-in user can now change their own password -
  `PATCH /api/me/password` (verifies `currentPassword` via `verifyPassword`,
  then re-hashes) plus a new `ChangePasswordForm.tsx` card on the Account
  settings page (`/admin/settings/account`), works for ADMIN/STAFF/
  SUPERADMIN alike. **Still open**: there's still no way for a *locked-out*
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
  2026-10-02** - new `Tenant.companyNameFont` column, `src/lib/fonts/
  companyNameFonts.ts` (8 curated Google Fonts loaded via `next/font/google`
  in `layout.tsx`, not a raw font-file upload), `POST /api/admin/
  company-name-font` (ADMIN-only), and a new `CompanyNameFontSettings.tsx`
  card on the Company Profile settings page (`/admin/settings/
  company-profile`) - admin picks a font and it applies to the business name
  everywhere it renders (`AppHeader`, the Dashboard heading). The scope
  question is resolved as just the business-name text, not customizable
  fonts for the overall page too (the bigger version from the original ask)
  - deliberately not built. **Still open**: part (a) of the original ask,
  actually editing the business's display name - `Tenant.name` is still set
  once at signup with no rename path anywhere in Settings; the new font card
  only picks a font for whatever `Tenant.name` already is, it doesn't let
  you change the text itself.
- ~~Give the app's font more of a "racing" feel - thicker overall.~~ **Done**
  2026-10-01 - Orbitron on headings and the nav brand, body text left alone,
  colors unchanged (see PROGRESS.md). User reviewed live: liked it overall
  but not on the calendar toolbar's month/year heading specifically - that
  one spot was reverted to the plain body font (no display face at all, not
  a third font) per "basic professional" feedback.
- ~~**Dev role** Add a dev role that is only for me with an account that I setup. It
  allows me to review all accounts and determine if their is an issue that needs
  to be resolved. It has an account dashboard, displays billing, and allows
  me to setup discount codes.~~ **Done 2026-10-02** - see PROGRESS.md's
  "SUPERADMIN dev console" entry. `UserRole.SUPERADMIN` already existed in the
  data model but had no account-creation path or console; both are now built:
  `POST /api/superadmin/bootstrap` (secret-gated, self-disables after the
  first account) creates the account, and `/superadmin` is the dashboard -
  a platform-wide tenant list with counts, a direct `License.billingPlan`/
  `status` override per tenant (bypasses Stripe entirely, the explicit "real
  write action" ask), and discount-code CRUD. **One thing still open**:
  discount codes are record-keeping only so far, not yet wired into the
  actual Stripe checkout redemption flow - noted in the UI copy itself.
- ~~Let Manager and Admin add job types (service types) from Settings.~~
  **Done 2026-10-02** - see PROGRESS.md's "Service types Settings card"
  entry. New `ServiceTypeManager.tsx` card (list + add/edit/delete) and a new
  `src/app/api/service-types/[id]/route.ts` (PATCH/DELETE, gated by
  `EDIT_SERVICES`/`DELETE_SERVICES` - not a hardcoded role check, same as the
  existing GET/POST). **One caveat on the "accessible to whichever role(s)
  hold those permissions" part**: the card now lives on
  `/admin/settings/appointments` - the old single `/admin/users` page was
  split 2026-10-02 into a multi-page Settings nav (`SettingsNav.tsx`/
  `sections.ts`: Appointments/Shifts/Calendar/Company Profile/Staff/
  Permissions/Account, one page each), purely a navigation reorg, not a
  permissions change. Every settings page is still hard-gated to ADMIN only
  (now one shared check in `getAdminTenant.ts` instead of each page's own
  redirect) - same as every other card there (`StaffManager`,
  `RolesAndPermissionsEditor`, etc.). A non-admin role granted
  `CREATE_SERVICES` from the permission matrix still can't reach this page
  at all, which is a pre-existing gap in the whole Settings access model,
  not something specific to this one card - flagging it rather than
  silently redesigning Settings-page access as a side effect of a
  service-types request. The still-missing inline "+ Add new service type"
  in the calendar's create panel (mentioned for context in the original ask,
  not listed under "Needs:") also remains unbuilt.
  **Addendum 2026-10-02**: an explicit $0 price now displays the same as a
  blank/unset one (nothing shown) instead of printing "$0.00" - the two
  remain distinct values in the database (`price: null` vs `price: 0`,
  `ServiceTypeManager.tsx`'s own comment still explains why), this only
  changed how `$0` renders in the list.
- ~~Split the single "Appointment & shift form" Settings card into separate
  appointment-form and shift-form sections.~~ **Done 2026-10-01** - went with
  the "at minimum" option noted below, since no shift-specific settings exist
  yet to populate a real second section. `AppointmentFormSettings.tsx` is now
  titled "Appointment form" and its description/toggles are unchanged
  (`requireClientForAppointments`, `enableMapsNavigation`) - no behavior
  change, just relabeled as appointment-specific. New `ShiftFormSettings.tsx`
  is a second card titled "Shift form" with no settings yet, just a
  placeholder description explaining shifts have no client/location to
  configure - reserved for future shift-only settings. Both render as
  separate cards on the User Manager page (`page.tsx`), same pattern as every
  other settings card there. ~~Placeholder now filled~~ **Done 2026-10-02** -
  see PROGRESS.md's "Shift form field toggles" entry: three real toggles
  (job type / job estimate / color key) plus a "Manage job types" link to
  the Service types card below it.
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
  nothing reads it, see below), a booking flow that writes into the same
  `Appointment`/`EXCLUDE` constraint as admin-created bookings, and probably
  an embeddable widget/iframe or a hosted public page
  (`shiftup.app/<slug>/book`, matching what the signup form's "account URL"
  helper text already promises). Real design work needed before building -
  this is a meaningfully sized feature, not a quick add.
- **README for GitHub.** Write/update a proper README and share it. (This one
  doesn't need live testing to do - worth picking off whenever.)
- ~~Top-nav "Staff management" and "Appointment management" dropdown
  sections.~~ **Done 2026-10-01, later revised same day** - see PROGRESS.md's
  "Calendar layout-shift bug, actually fixed this time, and the nav bar split
  into Appointment/Staff dropdowns" entry for the original build. **Revised**:
  the "Appointment pages" dropdown was removed - `Calendar` (now a single
  plain link to `/calendar`, no `?type=` pre-filter) and `View only` are both
  plain top-level nav links instead of being duplicated inside the
  Appointment/Staff dropdowns. "Staff pages" dropdown keeps Roster/Time off.
  Settings and Billing stay as separate plain top-level links; Dashboard/Sign
  out stay general nav too.
- ~~A per-role permission for the calendar's Appointments/Shifts/Both
  switcher.~~ **Done 2026-10-01** - new `VIEW_CALENDAR_TOGGLE` permission key
  in `src/lib/permissions/catalog.ts` (default: on for Manager/Supervisor,
  off for Employee/Customer), editable per-role from the Settings permission
  matrix ("Scheduling" group). Without it, a role's calendar still defaults
  to "Both" (or whatever the license tier allows) - the permission only gates
  whether the switcher buttons themselves are shown, not what's visible. The
  always-permission-agnostic `/calendar/view` route is unaffected (switcher
  still shows there for everyone, same as before).

## Security

- ~~A detailed, honest explanation of this software's security posture~~
  **Done 2026-10-01** - see `SECURITY.md` (new file) and PROGRESS.md's
  "Security posture review" entry. Covers what's actually true today
  (RLS-enforced tenant isolation with the automated proof test, scrypt
  password hashing, HMAC-signed sessions, the non-superuser DB role fix,
  Stripe handling all card data) and what's not yet true (no CI, no security
  audit, no penetration test, no rate limiting/lockout on auth routes - the
  single highest-value gap identified).
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

- **Role hierarchy ordering.** Built on the assumption `MANAGER` outranks
  `SUPERVISOR`, and that job-estimate visibility defaults to
  `ADMIN`/`MANAGER` only (not `SUPERVISOR`). Never explicitly confirmed —
  flagged multiple times, no correction given, so this is what's live.
- **PTO approval workflow + "hours worked" definition** (self-service request
  + manager/admin approval; "hours worked" = the calendar week containing the
  shift) - built with standard defaults, not explicitly confirmed by you.
- ~~Roster page access is hardcoded to ADMIN/MANAGER/SUPERVISOR, not run
  through the tenant's configurable permission matrix.~~ **Done 2026-10-01**
  - resolved as a side effect of the custom-roles build: a real `VIEW_ROSTER`
  permission key now exists in the catalog and the Roster page gates on
  `hasPermission(..., "VIEW_ROSTER")` (ADMIN still always allowed) instead of
  a fixed role-name check - configurable per role like everything else now.

## Known gaps in what's already built

- **Roster could go blank for a role that holds `VIEW_ROSTER` without
  `VIEW_ALL_SHIFTS`/`VIEW_ALL_APPOINTMENTS`.** New interaction surfaced by the
  shift/appointment visibility work (PROGRESS.md, 2026-10-02): `/calendar/roster`
  (`RosterView.tsx`) is a manager-facing "see everyone's schedule, grouped by
  person" tool, gated on `VIEW_ROSTER`, but it fetches its data from the same
  `GET /api/appointments` the main calendar uses - which now scopes results to
  the caller's own shifts/appointments unless they separately hold
  `VIEW_ALL_SHIFTS`/`VIEW_ALL_APPOINTMENTS`. The two defaults (Manager/
  Supervisor get both `VIEW_ROSTER` and `VIEW_ALL_*`) keep this working out of
  the box, but an admin who grants `VIEW_ROSTER` to a role without also
  granting the `VIEW_ALL_*` pair would get a Roster page that only ever shows
  that one person's own row - defeating the page's purpose. Not fixed here
  deliberately - flagging rather than silently making `VIEW_ROSTER` imply full
  visibility, since that conflates two permissions that are meant to be
  independent.
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
- ~~"Who can see who" isn't enforced yet.~~ **Done 2026-10-02, via a different
  mechanism than the one this item originally pointed at** - see PROGRESS.md's
  "Shift/appointment visibility: own-only by default, VIEW_ALL_SHIFTS/
  VIEW_ALL_APPOINTMENTS to see everyone" entry. `RoleVisibility`/
  `canViewRole()` (the per-role-pair "which roles can see which other roles"
  matrix this item described) was a deliberate **not-chosen** option -
  confirmed with the user, who picked two simple per-role booleans
  (`VIEW_ALL_SHIFTS`, `VIEW_ALL_APPOINTMENTS`) instead, closer to "can see
  outside your own" than a full role-to-role matrix. **`RoleVisibility`/
  `canViewRole()` themselves remain exactly as unenforced as before** -
  nothing in this change wires them up, and nothing currently plans to; if
  that role-to-role granularity is wanted later it's still a separate,
  unstarted piece of work, not a leftover bug in what shipped here.
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
