# ShiftUp — Progress Notes

Handoff snapshot. Full original architecture lives in the plan doc:
`C:\Users\Maitland\.claude\plans\i-would-like-to-encapsulated-crayon.md` — that
doc describes the original single-tier pricing/3-role model and doesn't yet
reflect the pricing, role, and permission-model changes below. This file is
the current source of truth until that's reconciled.

**For "what does the backend look like right now" (API routes, data model,
permissions, RLS) start at `ARCHITECTURE.md` instead of reading this whole
file** — this one is chronological narrative, good for history and what's
actually verified, not a quick current-state reference.

## Environment state (as left)

- Docker Desktop installed and running; local Postgres container up and fully migrated (34 migrations applied as of 2026-10-03 - this count goes stale fast, re-check `ls prisma/migrations` rather than trust the number itself).
- Dev server runs via `npm run dev` on http://localhost:3000.
- **Windows-specific gotcha**: stopping the `npm run dev` background task doesn't always kill its child Next.js/Turbopack processes. If `prisma generate` or `prisma migrate` fails with `EPERM ... query_engine-windows.dll.node`, check `Get-Process node` and kill stray ones (excluding unrelated ones like Adobe's bundled node.exe) before retrying - don't just ask the user to do it, stop the process yourself and regenerate.
- **Docker Desktop needs relaunching after a machine restart/sleep** — `docker ps` fails with a named-pipe connection error until the app is reopened; give it ~20-30s to come up before retrying.
- **Don't assume anything about commit state from this note** — check `git status`/`git log` yourself at the start of every session; it's swung both ways before. As of this handoff (2026-10-20) the working tree is clean, `git log` shows 9 commits, and the latest (`05b6df5`, "Added overhaul changes. Need to continue.") bundles a large uncommitted overhaul from prior sessions - the calendar split, custom calendars, and dashboard metrics work described directly below. That commit's own message undersold it: everything in it was already code-complete, just never committed or doc'd - see the entry below for what verifying it this session actually found.

## Completed and verified this session

### Verified the 2026-10-20 "overhaul" commit end-to-end in the browser - all real, one environment gotcha

Picked up where the prior session left off (`05b6df5`'s message was "Need to
continue" with no `PROGRESS.md`/`VERIFY.md` entries for any of it) - rather
than assume something was left broken, checked `tsc --noEmit` (clean),
`eslint .` (clean), and `vitest run` (112/112 passing once Docker/Postgres
were brought back up) first, then browser-verified the actual new surfaces
since none of that proves a UI actually renders.

- **What the commit turned out to contain**: the calendar-split work
  (`/calendar/appointments`, `/calendar/shifts`, `/calendar/custom/[id]`,
  `/calendar/all`, replacing the old single filtered `/calendar`), a new
  `CustomCalendar` model letting a tenant create any number of independently-
  configured named calendars (Settings > Calendars), and a new
  `DashboardMetric` model letting a tenant fully customize their Dashboard's
  stat tiles (Settings > Dashboard) instead of the old hardcoded "Staff"/
  "Upcoming appointments" pair. This resolves two previously-open `TODO.md`
  items ("Custom calendar entry types" and "Fully separate the Shifts and
  Appointments calendars") - both moved to `VERIFY.md`.
- **One real bug hunt that turned out to be an environment trap, not a code
  bug**: right after starting a fresh `npm run dev`, every single Settings
  page 404'd - including `/admin/settings/account`, which has no permission
  requirement at all (`"ALWAYS"`), which was the tell that this wasn't a
  real permission/tenant-lookup bug (that would've 404'd selectively, not
  uniformly). Root cause: a stale Turbopack `.next` build cache left over
  from before this commit. Deleting `.next` and restarting `npm run dev`
  fixed it completely - every Settings section and all four split calendar
  routes loaded clean afterward. Filed in `VERIFY.md` as a gotcha to
  recognize rather than re-debug if it recurs.
- **Verified live in the browser** (fresh signup through `/signup`, license
  upgraded to paid via direct DB update rather than touching any real
  tenant, using Playwright + Chromium installed on-demand per the estab-
  lished pattern): Settings > Calendars' Appointments/Shifts toggles and
  custom-calendar create/configure flow; a created custom calendar
  ("Site Visits") correctly appearing as its own item in `AppHeader`'s
  Calendar dropdown alongside Appointments/Shifts/All calendars/View only;
  `/calendar/appointments` and the custom calendar's own page both rendering
  a full real `SchedulingCalendar` grid independently; Settings > Dashboard's
  metric builder, including adding a third tile that then appeared on the
  real Dashboard page with a correctly computed count. No console errors in
  any of it (aside from one pre-existing, unrelated `/signup` page console
  warning about the username field's regex pattern under Chromium's `v`-flag
  validation - cosmetic, didn't block the form, not investigated further).
- **Docs were the only thing actually out of date** - the code itself had
  nothing left to build. `TODO.md`'s two relevant backlog items and this
  `PROGRESS.md`/`VERIFY.md` pair are now caught up to match reality.

### Four interrupted-session features reconciled: service type split, shift reports, payment status, and public booking widget finished - plus a stale local build-cache trap worth remembering

Picked up four features already mid-flight in the working tree from an
interrupted prior session (uncommitted, no PROGRESS.md entry yet, `ISSUES.md`
still showing three of them as "Open") rather than started fresh - asked the
user how to prioritize before touching anything, since the booking widget was
broken (missing files) and the ServiceType split looked like (but turned out
not to be) a much bigger, separate unfinished change. All of `ISSUES.md`'s 6
tracked issues are now resolved.

- **Shift/no-show reports dashboard (ISSUES.md #4)**: found **already fully
  implemented** to the exact spec signed off in `ISSUES.md` - new `Reports`
  page (`calendar/reports/`, `ReportsView.tsx`), `GET /api/reports/shifts`,
  `modules/reports/service.ts` (`listEventsForReport`), gated on the new
  `VIEW_SHIFT_REPORTS` permission key (defaults Manager/Supervisor, not tied
  to `VIEW_ALL_SHIFTS`/`VIEW_ALL_APPOINTMENTS` - deliberately always
  tenant-wide for whoever holds it, per the signed-off design). Aggregate
  tiles + status/staff/service-type filters + drill-down into the real
  appointment detail panel, exactly as scoped. Correctly built against the
  new split service-type model (`OR`s `appointmentServiceTypeId`/
  `shiftServiceTypeId`). Nothing left to build - just `ISSUES.md`/`VERIFY.md`
  hadn't caught up.

- **ServiceType split (ISSUES.md #1)**: found **already fully implemented**
  - schema split into `AppointmentServiceType`/`ShiftServiceType`, the
  migration (`20261010040000_split_service_types_and_payment_toggle`, hand-
  written with a real data-migration: a service type used by any real
  (client-having) appointment copies into `AppointmentServiceType`, one used
  by a shift or schedule-template-shift copies into `ShiftServiceType`, used
  by both copies into both under the same id, used by neither defaults to
  Appointments) already applied to the dev DB, and every consuming file
  (`scheduling/service.ts`, `templates.ts`, the API routes, `ServiceTypeManager.tsx` /
  new `ShiftServiceTypeManager.tsx`) already updated to match. Nothing left
  to build here - just the docs (`ISSUES.md` #1, this entry, `VERIFY.md`)
  hadn't caught up to reflect it as done.
- **Appointment payment status, both pieces (ISSUES.md #5)**: also found
  **already fully implemented**, not just the visibility half. New
  `Tenant.showPaymentStatus` (default on, same migration as the ServiceType
  split above) toggles whether the Payment field shows at all
  (`AppointmentFormSettings.tsx`). The field itself is no longer permanently
  stuck read-only at `UNPAID` - `SchedulingCalendar.tsx`'s detail-panel edit
  form has a real `editPaymentStatus` dropdown (Unpaid/Paid/Waived/Refunded),
  and `PATCH /api/appointments/[id]` accepts `paymentStatus` as one of the
  general booking-fields edits (same `EDIT_APPOINTMENTS` gate as price/
  client/service). Nothing left to build - same "docs hadn't caught up" gap
  as #1/#4 above.
- **Public booking widget - genuinely incomplete, now finished**: Settings >
  Booking Widget's `BookingWidgetSettings.tsx` imported `WorkingHoursEditor`
  and `EmbedSnippet` - neither existed anywhere, so the app didn't compile.
  Built both:
  - **`WorkingHoursEditor.tsx`**: per-staff weekly availability editor (staff
    picker + add/remove day-of-week time windows, same half-hour `<select>`
    convention as `CalendarHoursSettings.tsx`), backed by the already-existing
    `GET`/`PUT /api/staff/[id]/working-hours`.
  - **`EmbedSnippet.tsx`** + new **`public/booking-widget.js`**: a copy-paste
    `<script data-tenant="...">` snippet that injects a self-resizing iframe
    pointing at `/book/[tenantSlug]?embed=1`, resized via the
    `shiftup-booking-resize` `postMessage` `BookingPage.tsx` already posts
    (origin-and-source checked on receipt).
  - Also fixed two **pre-existing `react-hooks/set-state-in-effect` lint
    violations** in the already-written `BookingPage.tsx` (a direct
    `void loadSlots()` call in an effect, where `loadSlots` itself calls
    `setState` synchronously before its first `await`) - wrapped in the
    established IIFE pattern (see the react-hooks/set-state-in-effect note
    further down this file) rather than leaving it to fail lint.
- **A real environment trap, worth remembering for next session**: this
  project directory sits somewhere the filesystem can report a file as
  missing or stale-empty (confirmed via `ls`/`Read`/`Glob` *and* a real
  Prisma CLI P3015 error) when it's actually present with full content
  moments later - a cloud-sync placeholder/hydration delay, not a tool
  caching issue (ruled out since the Prisma CLI's own `fs` calls hit it too).
  This cost real time chasing phantom "25 tsc errors" that were actually
  stale reads of already-fixed files. **Fix that worked**: force-read every
  file's bytes recursively (`Get-ChildItem -Recurse -File | ForEach-Object
  { [IO.File]::ReadAllBytes($_.FullName) }`) across `src/`, `prisma/`,
  `public/`, and the root `*.md` docs specifically (missed them the first
  pass - they're not under any of those three directories) before trusting
  any "this is broken" conclusion. Combined with two separate *stale-cache*
  traps that compounded the confusion - a stale `tsconfig.tsbuildinfo` (delete
  it; `tsc --noEmit` can otherwise report clean on files it didn't really
  recheck) and stale Next.js 16 route/layout types after deleting `.next`
  (`npx next typegen` regenerates `LayoutProps`/etc. without a full build).
- **Verified**: `prisma generate` + `prisma migrate status` (DB confirmed
  already migrated via a direct query against `_prisma_migrations` and
  `information_schema.tables` - the split tables exist, `service_types` is
  gone), `tsc --noEmit` clean, `eslint .` clean across the **entire**
  project, full `vitest run` **89/89 passing** across all 13 test files.
  **Not yet confirmed in the browser** - added to `VERIFY.md` (both the
  ServiceType split and the booking widget).

### Roster and the new Reports dashboard can now split Appointments/Shifts apart

Raised directly right after the Reports dashboard write-up above landed:
"the calendar is still combined, we need to add the option to combine them,
or have them be on the same page." The main calendar's own Appointments/
Shifts/Both switcher (`SchedulingCalendar.tsx`) already does this; Roster and
the new Reports page didn't - both always mixed both kinds into one list
with no way to split them.

- **`ReportsView.tsx`**: new "Kind" filter (Both/Appointments/Shifts,
  client-side only - everything's already fetched per the date/staff/service
  filters) sitting alongside the existing Status/Staff/Service filters.
  `filteredEvents` (the kind-filtered set) now feeds the tiles, the per-staff
  breakdown, and the drill-down list - all three narrow together.
- **`RosterView.tsx`**: same Both/Appointments/Shifts pill switcher added
  next to the existing Day/Week toggle, filtering each staff member's chip
  row (and their appointment/shift counts) client-side.
- Verified: `tsc --noEmit` clean, `eslint` clean on both changed files.
  **Not yet confirmed in the browser** - added to `VERIFY.md`.

### Appointments/shifts can now be marked Completed/No-show (ISSUES.md #3)
`AppointmentStatus` already had `COMPLETED`/`NO_SHOW` as real enum values, but
nothing - API or UI - could ever set them; every event stayed `BOOKED` until
cancelled. `PATCH /api/appointments/[id]`'s schema (`src/app/api/appointments/[id]/route.ts`)
now accepts `status: "BOOKED" | "COMPLETED" | "CANCELLED" | "NO_SHOW"` (was
`"CANCELLED"` only) - `PENDING_PAYMENT` deliberately excluded, since that's an
initial-booking-only state, not something set after the fact.

- The existing `CANCELLED` branch (dedicated `CANCEL_SHIFTS`/
  `CANCEL_APPOINTMENTS` gate, calls `cancelAppointment`) is untouched.
  `COMPLETED`/`NO_SHOW`/reverting-to-`BOOKED` is a new `outcomeStatusRequested`
  branch that folds into the same general-edit path as every other field on
  this route - gated on `EDIT_SHIFTS`/`EDIT_APPOINTMENTS` (not a new
  permission key) and still subject to the existing Settings > Calendar
  "Allow editing booked events" tenant-wide switch, same as any other edit.
- **UI**: `AppointmentDetailPanel` (`SchedulingCalendar.tsx`) gained "Mark
  completed"/"Mark no-show" buttons next to the existing Cancel button
  (gated on `canEdit`, hidden once the event is `CANCELLED`), plus a "Revert
  to booked" button that appears once either outcome is set.
- Reason/note field deliberately **not** added here - overlaps with the
  separately-tracked, intentionally more robust "Notes on an appointment"
  feature request in `TODO.md`; this ships status-only.
- Verified: `tsc --noEmit` clean, `eslint` clean on both changed files.
  **Not visually confirmed in the browser this session** - same tooling gap
  as the entries below. Added to `VERIFY.md`.
- **Unblocks ISSUES.md #4** (manager no-show/shift reporting dashboard,
  design already signed off) - still not built, but no longer blocked on
  this.

### Color key picker now offers the 5 built-in colors, not just custom tags
Raised 2026-10-09: "right now only the custom keys are present in the drop down. We need to be able to use the rest as well" - the "Color key" control (appointment/shift detail panel + create panel) only ever listed custom `EventTag` rows; the 5 built-in keys from Settings > Event colors (Appointment/Shift/Completed/No-show/Cancelled) were only ever assigned automatically (status/isShift), never pickable by hand.

- **New `Appointment.colorKey`** (migration `add_appointment_color_key`, plain nullable `String`, validated against `EVENT_COLOR_KEYS` at the API layer rather than a DB enum) - mutually exclusive with `tagId` in the UI (selecting one clears the other; not enforced at the DB level, same as every other soft invariant in this app).
- **`resolveEventColor`** (`src/lib/colors/eventColors.ts`) gained a `colorKey` field on its input, in the same priority slot `tagColor` already held - loses to a terminal status (cancelled/no-show/completed) exactly like a custom tag always has, so this isn't new semantics, just a second source for the same override. New `isEventColorKey` type guard.
- **API**: `POST /api/appointments` and `PATCH /api/appointments/[id]` both take a new `colorKey` (nullable, `z.enum(EVENT_COLOR_KEYS)`); `createAppointment` (`src/modules/scheduling/service.ts`) passes it through.
- **UI**: the "Color key" `<select>` in both `AppointmentDetailPanel` and `CreateEntryPanel` (`SchedulingCalendar.tsx`) now lists two `<optgroup>`s - "Built-in" (filtered per entry: appointment-only/shift-only keys hidden on the other kind, completed/no-show/cancelled always shown) and "Custom" (the existing tags) - behind one combined value space (`colorValueFor`/`parseColorValue`, a `base:<key>` prefix for built-in options so it can't collide with a real tag id). `RosterView.tsx` updated to pass `colorKey` through too, so its chips agree with the main calendar.
- Verified: `tsc --noEmit` clean, `eslint` clean on all changed files, migration applied cleanly (one `_prisma_migrations` checksum-drift hiccup from the `BlockedTime` migration's hand-appended RLS block, fixed by updating the stored checksum to match the already-applied, already-correct file content - no data loss, no reset). **Not visually confirmed in the browser this session** - same tooling gap as the blocked-time entry above. Added to `VERIFY.md`.

### Removed `Role.level`/rank entirely - staff create/reassign/delete are now hardcoded ADMIN-only
Raised directly: "the Rank number doesn't make any sense, can we scrap that?" The "Rank" field added in the entry below (same session, a few hours earlier) turned out to have no intuitive meaning to a non-technical admin configuring roles, so rather than keep a confusing number around it's been removed outright, along with the authorization logic it backed.

- **Decision, asked directly before touching anything**: once Rank is gone, who can reassign a staff member's role or edit/delete a staff account? Answered "Admin only" - matching the "only admin controls this" direction raised earlier in the same session (see the now-superseded permissions-hierarchy discussion that was scoped but then called off with "never mind" / "its working as expected" before any code changed).
- **`Role.level` dropped from the schema** (migration `remove_role_level` - applied directly via `prisma db execute` + `migrate resolve --applied`, not `prisma migrate dev`, since that command wanted to reset the whole dev database over unrelated pre-existing drift on the in-flight `add_blocked_time` migration; the reset was declined as unnecessarily destructive for a single-column drop).
- **`getRoleLevel`/`canManageRoleAssignment`/`canActOnStaffMember` removed** (`src/lib/permissions/service.ts`) - the three routes that called them (`POST /api/staff`, `PATCH`/`DELETE /api/staff/[id]`) now just check `session.role !== "ADMIN"` directly instead. Net effect: `CREATE_STAFF`/`EDIT_STAFF`/`DELETE_STAFF` are still checked first but are now inert for any non-admin role, since the ADMIN check after them can never pass for STAFF - flagged as a "worth improving" item in the new `PERMISSIONS.md` rather than silently left as a trap.
- **`StaffManager.tsx`** - the rank-filtered dropdowns, the "you don't outrank this role" tooltip, and `myLevel` state are all gone. The whole "Add staff" form and the per-row role-reassign-dropdown/"Remove" button now only render for `isAdmin`; a non-admin with `VIEW_STAFF` sees a read-only staff directory instead of controls that would just 403 on submit.
- **Permissions settings UI** (`RolesAndPermissionsEditor.tsx`, `RoleDetailPanel.tsx`) - the "Rank" number input (create-role form and role-detail panel) removed, along with its explanatory hint text.
- **`seedDefaultRolesForTenant`** no longer seeds a Manager/Supervisor/Employee/Customer hierarchy of levels (30/20/10/10) - starter roles now have nothing to seed in that dimension at all.
- `/api/me/permissions` no longer returns `level`; `/api/roles*` no longer accept or return it.
- **New `PERMISSIONS.md`** - full writeup of the permissions model (the ADMIN/STAFF split, the permission-key catalog, visibility, where enforcement lives) plus a "worth improving" list, raised directly ("make an MD explaining permissions and see if theirs anything we can improve"). `ARCHITECTURE.md`'s permissions-related bullets/table rows updated to match (stale `Role.level` references removed), pointing at `PERMISSIONS.md` for the full version.
- Verified: `tsc --noEmit` clean, `eslint` clean on every changed file, `vitest run src/lib/permissions/service.test.ts` (11/11 passing after removing the rank-based test cases), full suite otherwise unaffected (the 16 pre-existing failures in `scheduling/service.test.ts`/`templates.test.ts` are the unrelated `appointments.color_key does not exist` drift from the in-flight blocked-time work, not this change). **Not yet confirmed in the browser** - added to `VERIFY.md`.

### Blocked time - business-wide "block out time" + a per-holiday "Block" toggle
Raised 2026-10-03: "we need a new feature to block out time. this will need to go hand in hand for certain holidays." Scoped via clarifying questions before building (per the standing "ask before building" preference): business-wide (not per-staff), purely visual (not a hard booking constraint), with holidays gaining an explicit per-holiday setting for whether blocking should apply.

- **New `BlockedTime` model** (migration `add_blocked_time`) - tenant-scoped, arbitrary `startTime`/`endTime` (not day-granular), optional `label`. RLS policy added by hand (same fail-closed tenant-isolation pattern as every other tenant-scoped table). Purely visual by design - no overlap check against `Appointment`, matching the "visual only" decision.
- **`Holiday.blocked`** (new column) and **`Tenant.blockedHolidayNames`** (new `String[]`, mirrors `enabledHolidayNames`'s shape) - the "pairs with holidays" half of the ask. A catalog holiday name in `blockedHolidayNames` with no matching entry in `enabledHolidayNames` has no effect - blocking only ever layers on top of a holiday that's actually shown.
- **API**: `GET`/`POST /api/blocked-time`, `DELETE /api/blocked-time/[id]` (new, same shape as the holidays routes). `POST /api/holidays` takes a new `blocked` flag; `PATCH /api/holidays/[id]` (new) lets an existing custom holiday's `blocked` flag be toggled after creation without delete+recreate. All gated on `EDIT_CALENDAR_SETTINGS`, same as the rest of the Holidays card.
- **Settings UI**: `HolidaySettings.tsx` gets a "Block" checkbox next to each catalog holiday (disabled until that holiday is enabled) and next to each custom holiday in the list, plus one on the create form. New `BlockedTimeSettings.tsx` card (Settings > Calendar) for arbitrary business-wide spans - label + start/end datetime, list + remove.
- **Calendar rendering** (`SchedulingCalendar.tsx`): blocked holidays and blocked-time entries render as react-big-calendar `backgroundEvents` in Week/Day view (a grey diagonal-stripe fill, `pointerEvents: none` so they never intercept a click meant for the real slot underneath) and as a grey day-cell tint in Month view (`dayPropGetter`, takes priority over the existing amber holiday tint when a day is both). `CalendarLegend` gained a "Blocked in view" line, same pattern as the existing "Holidays in view" one.
- Verified: `tsc --noEmit` clean, `eslint` clean on all new/changed files, migration applied + RLS policy confirmed, new API routes return 401 (not 500) unauthenticated confirming they load correctly. **Not visually confirmed in the browser this session** - no headless-browser tooling (`chromium-cli`, Playwright) is set up in this Windows environment and installing one wasn't attempted unprompted. Added to `VERIFY.md`.

### Calendar Settings opened up via a new permission; Calendar hours made a paid feature
Follow-up to the "Configurable visible time range" entry below, raised directly: "make sure everything that's been added has a toggled permission" + "make the set work hours feature a paid feature... listed as so."

- **New `EDIT_CALENDAR_SETTINGS` permission key** (`catalog.ts`) - gates the whole Settings > Calendar page (Holidays, Event colors, Calendar hours), which was previously hardcoded ADMIN-only (`sections.ts`'s `calendar` section now has `requirement: "EDIT_CALENDAR_SETTINGS"` instead of `"ADMIN"`). ADMIN still always passes (unconditional in `hasPermission`); default starter grant is Manager-only (Supervisor/Employee/Customer: false), matching how other settings-adjacent keys are seeded. Explicitly scoped to the *whole page* rather than one new key per card - the user picked this over two more surgical options (a separate page just for hours, or adding the key without actually opening anything up yet) when asked directly, since Holidays/Event colors don't carry any separable risk of their own.
  - **`PUT /api/tenant-settings`** no longer does one hardcoded `requireRole(["ADMIN"])` for every field - it now checks per-field-group inside the transaction: Appointments/Shifts form toggles (`requireClientForAppointments`, `enableMapsNavigation`, the three `show*OnShiftForm` flags, `allowOverlappingShifts`) stay ADMIN-only (their own settings pages are still ADMIN-only, unaffected by this change); `enabledHolidayNames`/`eventColors`/`calendarStartMinute`/`calendarEndMinute` now check `EDIT_CALENDAR_SETTINGS`.
  - **`POST /api/holidays`, `DELETE /api/holidays/[id]`** moved from hardcoded ADMIN to the same permission, so a role granted it can actually manage custom holidays end-to-end, not just toggle the federal-holiday checkboxes - half-wired UX (visible control that 403s on save) is exactly what the rest of this codebase avoids elsewhere (see `AppointmentFormSettings`' own ADMIN-only carve-out).
  - **Deliberately left alone**: `DELETE /api/event-tags/[id]` stays hardcoded ADMIN-only - unrelated pre-existing reasoning (deleting a shared tag affects other staff's past/future entries), not part of this page's three cards, not raised as part of this ask.
  - **Deliberately NOT changed**: promote-to-admin/demote-from-admin (previous entry below) stay hardcoded ADMIN-only, not given a toggleable permission - asked directly, and the answer was to keep the existing safer default rather than let a delegated role create new admins.
- **New `assertCalendarHoursEnabled`** (`src/lib/licensing/limits.ts`, mirrors `assertScheduleTemplatesEnabled` exactly) - FREE tenants get a `PlanLimitError` (surfaced as a 403) if they try to write `calendarStartMinute`/`calendarEndMinute`; ONE_TIME/SUBSCRIPTION can. Only covers the hours fields, not the rest of the Calendar page (Holidays/Event colors stay free).
- **`admin/settings/calendar/page.tsx`** now fetches the tenant's `License` server-side and renders `CalendarHoursSettings` only when `billingPlan` isn't `FREE`; a FREE tenant sees an upgrade card in its place (same "upsell in place of the real tool" pattern as the Schedule Templates page) - Holidays/Event colors render unconditionally either way.
- **Not yet confirmed in the browser** - added to `VERIFY.md`.

### Configurable visible time range for the calendar grid
Builds the `TODO.md` item raised 2026-10-02 ("a lot of the grid is dead AM/PM space nobody needs to scroll past").

- **New `Tenant.calendarStartMinute`/`calendarEndMinute`** (migration `add_calendar_visible_hours`) — minutes-from-midnight, `@default(0)`/`@default(1440)` (the full day, i.e. no visual change for any tenant that never touches this). Purely a *display* bound on `SchedulingCalendar`'s grid — distinct from `WorkingHours` (still unused anywhere, see `ISSUES.md`), which is about constraining *bookable* times per staff member, not what the grid shows by default. Decided one tenant-wide range (not per-day-of-week) and hidden-entirely-outside-the-range (via react-big-calendar's `min`/`max`, not collapsed/scrollable), per the two open questions the TODO item left — same "one tenant-wide default" pattern as every other Settings-level toggle.
- **`PUT /api/tenant-settings`** takes the pair together now (`calendarStartMinute`/`calendarEndMinute`, both 0-1440) with a schema-level refine requiring both fields when either is sent and `end > start`.
- **New `CalendarHoursSettings.tsx`** (Settings > Calendar, above Holidays) — two `<input type="time">` fields + Save, with a "Reset to full day" shortcut that only shows once the range has actually been narrowed.
- **`SchedulingCalendar.tsx`**: `gridMinTime`/`gridMaxTime` (previously hardcoded to the full 24 hours) now derive from the tenant's configured range via a shared `minutesToGridTime` helper (hour 24 doesn't exist on a `Date`, so a full-day end of 1440 maps to 23:59:59). The existing AM/PM scroll toggle's `initialScrollToTime` now targets the start of the configured range ("AM") or its midpoint ("PM") instead of fixed `0`/`12`; the imperative `scrollToAmPmHalf` needed no change since it already scrolls to 0%/50% of whatever height is currently rendered.
- **Not yet confirmed in the browser** — type-check and lint are clean and `/api/tenant-settings` round-trips without a server error, but this session has no browser-automation tool to click through the Settings form or the resulting calendar grid. Added to `VERIFY.md`.

### Staff role changes: promote to admin, demote back to staff, and reassign a STAFF member's role — all rank-gated
Raised directly ("once a role is set, we are unable to change the role") - StaffManager previously had no way to edit a staff member's role after creation at all, only add/remove. Landed as three separate pieces, not one generic "change role" endpoint, since promoting/demoting into `ADMIN` is a materially different kind of escalation than reassigning within the tenant's own custom `Role` table.

- **New `Role.level`** (migration `add_role_level`) - an integer seniority rank, deliberately separate from `RolePermission` (what a role can *do*) - this is about who outranks whom for the purpose of *handing out* a role. `seedDefaultRolesForTenant` now seeds the starter roles with a real hierarchy (Manager 30, Supervisor 20, Employee/Customer 10) instead of everyone at the same implicit rank. Editable per-role from Settings → Permissions → `RoleDetailPanel` alongside name/description/reports-to.
- **New `canManageRoleAssignment`/`canActOnStaffMember`** (`src/lib/permissions/service.ts`) - a permission key like `EDIT_STAFF`/`DELETE_STAFF` says nothing about *which* role is being handed out or acted on; without a rank check, any role holding that one ordinary permission could promote a peer to the tenant's most-privileged custom role, or delete an account that outranks them. Both require the actor's own role to strictly outrank the role(s) involved (current + new, for reassignment); both pass unconditionally for ADMIN/SUPERADMIN. A missing/foreign role compares as `-Infinity`, so a deleted or cross-tenant role can never be "outranked into."
- **`PATCH /api/staff/[id]`** reassigns a STAFF member's custom role - gated on `EDIT_STAFF` *and* `canManageRoleAssignment`; blocks self-reassignment and reassigning a non-STAFF (i.e. ADMIN) account.
- **New `POST /api/staff/[id]/promote`** (STAFF → ADMIN) and **`POST /api/staff/[id]/demote`** (ADMIN → STAFF, landing in a given `roleId`) - both hardcoded ADMIN-only rather than rank-gated, since ADMIN sits outside the `Role`/level system entirely and unconditionally has every permission - only an existing ADMIN can create another one. Demote blocks self-demote (the only thing actually preventing an admin from locking themselves out, since promote/demote never touch `User.isOwner`).
- **New `User.isOwner`** (migration `add_user_is_owner`) - marks the account that originally signed up the tenant. Not itself checked by any of the above - the owner is created with no `StaffProfile` and never assigned one, so they can never be a target `staffProfile.id` in the first place. Just a flag for e.g. an "Owner" badge.
- **`StaffManager.tsx`**: the Role column is a live dropdown for STAFF rows (options filtered client-side to roles below the viewer's own rank - the real enforcement is server-side, this just avoids offering a choice that'd be rejected), a "Make admin" button per STAFF row, and a role-picker + "Confirm" demote control per ADMIN row. `/api/me/permissions` now also returns the caller's own `level` for this filtering.
- **Not yet confirmed in the browser** - added to `VERIFY.md`.

### Per-user calendar event text size (Settings > Account)
- **New `User.calendarTextSize`** enum (`SMALL`/`MEDIUM`/`LARGE`/`XLARGE`, default `MEDIUM`) + **`GET`/`PATCH /api/me/calendar-text-size`** + **new `CalendarTextSizeForm.tsx`** - same per-user (not per-tenant), no-logout-needed pattern as the existing language picker. `src/lib/calendar/textSize.ts`'s `CALENDAR_TEXT_SIZE_REM` maps each size to a `--calendar-event-font-size` CSS variable, set on `SchedulingCalendar.tsx`'s wrapper and read by `.rbc-event` in `globals.css`. `MEDIUM` is deliberately smaller than the page's ambient text size (event boxes get crowded fast); `SMALL`/`LARGE`/`XLARGE` exist for anyone who wants it smaller still or bigger for readability.
- **Not yet confirmed in the browser** - added to `VERIFY.md`.

### Shift/appointment permissions split into independent pairs, plus a batch of calendar/nav UX fixes
Raised via an `ISSUES.md` review: picked quick UX fixes, issue #6 (combined
shift/appointment permissions), and a design-only pass on issue #4 (manager
no-show dashboard, still blocked on issue #3, not built).

- **Issue #6 — permission split**: `src/lib/permissions/catalog.ts`'s four
  combined keys (`VIEW/CREATE/EDIT/CANCEL_APPOINTMENTS`) are now eight -
  `VIEW_SHIFTS`/`VIEW_APPOINTMENTS`, `CREATE_SHIFTS`/`CREATE_APPOINTMENTS`,
  `EDIT_SHIFTS`/`EDIT_APPOINTMENTS`, `CANCEL_SHIFTS`/`CANCEL_APPOINTMENTS` -
  mirroring the existing `VIEW_ALL_SHIFTS`/`VIEW_ALL_APPOINTMENTS` split. No
  key was renamed - the old combined key just narrows to "appointments only"
  going forward, so existing appointment grants carry forward untouched.
  - **API routes** (`appointments/route.ts`, `appointments/[id]/route.ts`,
    `appointments/[id]/coverage/route.ts`, `event-tags/route.ts`) each now
    check the key matching whichever event type is actually in play - the
    PATCH and coverage routes fetch `clientId` first where they didn't
    already know the type; `event-tags` keys off the tag's own `appliesTo`.
  - **`modules/scheduling/service.ts`**: `AppointmentVisibility` gained
    `canViewShifts`/`canViewAppointments`, ANDed against the existing
    all/own `OR` filter in `listAppointmentsInRange` - a role lacking
    `VIEW_SHIFTS` entirely now sees zero shift rows, not even its own.
  - **`SchedulingCalendar.tsx`**: the three flat `canCreate`/`canEdit`/
    `canCancel` booleans became per-type pairs (`canCreateShift`/
    `canCreateAppointment`, etc.) plus `canEditEvent(appt)`/
    `canCancelEvent(appt)`/`canCreateForMode(mode)` helpers, used everywhere
    a specific event or create-mode is in play: the two create buttons
    (each gated on its own permission instead of one combined check), the
    grid's `selectable`/`draggableAccessor`/`resizableAccessor` (per-event
    for real events, per-`creating.mode` for the drag-draft), the "Add as:
    Appointment/Shift" picker (each button only shown if creatable), and the
    detail-panel props (`canCancel`/`canEdit`/`canFindCoverage`/`canCreateTag`
    now resolved per the specific selected event's type).
  - **Permissions settings UI**: `RolesAndPermissionsEditor.tsx`'s
    "Scheduling" group changed from a flat checkbox list to a small
    View/Create/Edit/Cancel/See-all × Shifts/Appointments matrix
    (`RoleDetailPanel.tsx` renders it as a table), so which toggle governs
    which event type is legible at a glance instead of two more
    same-looking rows dropped into a flat list.
  - **Data migration** `20261003000000_split_shift_appointment_permissions`
    backfills every existing role's new `_SHIFTS` grant from its old
    combined-key value (same precedent as the `enabled_holiday_names`
    backfill below) - applied against the local dev DB and verified with a
    direct query: 0 mismatches between each role's old `CREATE_APPOINTMENTS`
    value and its newly-backfilled `CREATE_SHIFTS` value, across all 96
    existing role rows. `prisma generate`'s post-migration step hit the
    documented Windows `EPERM` query-engine-DLL lock (the dev server was
    actively running, holding the file) - skipped killing it since this
    migration is pure data (no schema/model change), so the already-generated
    Prisma client needed no regeneration.
- **Quick UX fixes**, same session:
  - Appointment events on the calendar now show the assigned staff member's
    name (`toEvent()` in `SchedulingCalendar.tsx` appended it only in the
    shift branch before; now unconditional).
  - `AppHeader.tsx`'s separate `Calendar`/`View only` top-level links merged
    into one `Calendar` `NavDropdown` ("Full calendar"/"View only" as its two
    options) - new `fullCalendar` translation key added across all four
    locale files.
  - The "+ Add appointment"/"+ Schedule shift"/Cancel buttons moved into the
    same settings-panel container as the view toggles and switched from
    `rounded-lg` rectangles to the shared `rounded-full` pill shape, instead
    of sitting in their own visually disconnected bordered box.
- **Issue #4 — design-only**: proposed metrics/filters/time-range/drill-down/
  scope answers written into `ISSUES.md` for sign-off; no code changed, still
  blocked on issue #3 landing first.
- **Verified**: `tsc --noEmit`, `eslint` (all touched files), and the full
  `vitest` suite (19/19) all clean; migration applied and the backfill
  spot-checked directly against the dev DB. **Not browser-click-tested** -
  same standing caveat as the rest of this calendar's client-rendered UI; the
  per-type button gating and drag/resize behavior are correct by code review
  and the underlying API/DB behavior is real, but the on-screen interaction
  hasn't been clicked through in a real browser.

### Holidays reworked: per-holiday checkboxes (US + Europe) instead of one toggle per region, color key moved back to Calendar settings
Raised directly, in stages: first "add a major European holidays setting" (alongside the existing US federal one), then "list out each one and provide the date, allow a checkbox to allow/disallow each" plus a concern about the two sets double-counting a shared holiday if both were ever turned on - and separately, "move the color key setting to the Calendar settings, and allow for two different groupings to organize everything."

- **`src/lib/holidays/european.ts`** (new): major pan-European holidays computed the same way `federal.ts` computes the US 11 - Epiphany, Good Friday, Easter Sunday/Monday (real Easter-Sunday computation via the standard Gregorian/Meeus algorithm, not hardcoded), Labour Day, Assumption of Mary, All Saints' Day, St. Stephen's Day. Deliberately **excludes New Year's Day and Christmas Day** - both are observed in Europe too, but they're already in the US list under the identical name, so leaving them out of the European list means the two sets structurally can never collide on a name, with no merge-time dedup logic needed anywhere.
- **`src/lib/holidays/catalog.ts`** (new): the single source both the calendar and the Settings page read - `getHolidayCatalog(year)` returns every known holiday (US + EU) tagged by region and dated for that year, `getEnabledHolidaysInRange(enabledNames, start, end)` filters to whichever names a tenant has turned on across the given range. `catalog.test.ts` locks in the "no two holidays ever share a name" invariant across several years.
- **Replaced `Tenant.showFederalHolidays`/`showEuropeanHolidays` (two booleans) with `Tenant.enabledHolidayNames` (`String[]`, migration `20261002234500_replace_holiday_toggles_with_enabled_names`, hand-written since the destructive-column-drop warning requires interactive confirmation `prisma migrate dev` can't give in this environment)** - one checkbox per holiday instead of one per region. Migration backfills each existing tenant's array from their old boolean pair before dropping the columns, so no one's effective holiday set silently changed. Defaults to just the 11 US names for a new tenant, matching the old default.
- **`HolidaySettings.tsx`** rewritten: two columns ("United States" / "Europe"), each holiday shown as its own checkbox with that year's actual date next to it (e.g. "Memorial Day — May 25"), rather than one all-or-nothing toggle per region.
- **Color key card moved again**: back out of Staff settings and into Calendar settings (`EventColorSettings.tsx` now lives under `admin/settings/calendar/`) - a color is a calendar-display concern, not a staff-management one, and Calendar already owns other pure-display config (Holidays). Also addressed the "allow two different groupings" ask: the "Your own" tag list is no longer one flat list - it's split into a "Shifts" group and an "Appointments" group (a `BOTH`-scoped tag appears in both), so scope is visible by position instead of by reading a badge per tag. `sections.ts` descriptions updated to match (Calendar's now mentions the color key; Staff's no longer does). See `ISSUES.md` issue #2, marked resolved.
- **Verified**: `tsc --noEmit`, `eslint` (all touched files), and the full `vitest` suite (19/19, including the two new holiday test files) all clean; migration applied and client regenerated against the local dev DB (hit the usual Windows `EPERM` query-engine-DLL file lock twice - killed stray `node.exe` processes per the documented fix both times). **Not browser-click-tested** - the per-holiday checkboxes and the two-group color-key layout are correct by code review, not yet clicked through in a real browser.

### Shift calendar redo: configurable shift-overlap + a "Group by staff" Day view
Raised directly: shifts couldn't overlap, and the Week/Day grid got unreadable once 10+ shifts were on screen at once, with no easy way to see who's working alongside whom.

- **New Settings > Shifts > "Allow overlapping shifts" toggle** (`Tenant.allowOverlappingShifts`, default off, `prisma/migrations/20261002214329_add_allow_overlapping_shifts`). Only ever relaxes the rule for shifts (`clientId` null) — a real client-having appointment still can never double-book the same staff member, either way. The DB's `appointments_no_overlapping_staff_time` EXCLUDE constraint (Postgres can't key an EXCLUDE predicate off another table's row, so it can't read a per-tenant setting directly) is now scoped to `client_id IS NOT NULL` only; shift overlap is enforced in `src/modules/scheduling/service.ts` (`assertShiftOverlapAllowed`, called from `createAppointment`/`rescheduleAppointment`/`reassignAppointmentStaff`) instead, gated on the tenant setting. **Known, accepted gap**: that's a read-then-write check inside one transaction, not a DB-level guarantee — two concurrent requests creating overlapping shifts for the same staff member at the same instant could both slip through when overlap is disallowed. Flagged in code, not fixed — same tradeoff class as `assertCanAddAppointment`'s plan-limit check.
- **New "Group by staff" layout toggle** on the calendar (`SchedulingCalendar.tsx`) — splits Day view into one column per staff member (react-big-calendar's resource view: `resources`/`resourceIdAccessor`/`resourceTitleAccessor`/`resourceAccessor`) instead of cramming every shift into one narrow column. Deliberately Day-view-only — a resourced Week view would render staff × 7 day-columns (`TimeGrid`'s `renderResourcesFirst`), far too wide to be useful — so switching to Week/Month/Agenda turns it back off automatically. Clicking a slot inside a specific person's column now preselects that staff member on the create panel (`defaultStaffId`, threaded through `creating`/`pendingSlot`); dragging an existing shift into a *different* person's column reassigns it to them in the same PATCH as the reschedule.
- Also fixed in passing: the "+ Add appointment"/"+ Schedule shift" buttons now default the create panel to the currently-filtered staff member (`resourceStaff[0]`) instead of always the first staff member in the whole roster, regardless of the active Staff filter.
- **Verified**: `tsc --noEmit`, `eslint` (all touched files), and the full `vitest` suite (15/15) all clean; migration applied and regenerated against the local dev DB. **Not browser-click-tested** — same standing caveat as the rest of this calendar's client-rendered UI (see the note already in TODO.md's "Known gaps" section); the resource-column rendering, drag-to-reassign, and the new setting toggle are correct by code review and the underlying API/DB behavior is real, but the on-screen interaction hasn't been clicked through in a real browser.

### Custom color tags: scoped to shifts, appointments, or both
Raised directly ("separate the custom tags with Shifts and Appointments"): `EventTag` was tenant-wide with no distinction, so a shift-only tag (e.g. "Night crew") would also show up on the appointment form and vice versa.

- **New `EventTag.appliesTo`** (`EventTagScope` enum: `SHIFT`/`APPOINTMENT`/`BOTH`, default `BOTH` - `prisma/migrations/20261002212758_add_event_tag_scope`, additive, no backfill needed). `POST /api/event-tags` accepts an optional `appliesTo`, defaulting to `BOTH` for callers that don't specify one.
- **Calendar pickers now filter by the current mode** (`tagsForMode()` in `SchedulingCalendar.tsx`): `CreateEntryPanel`'s "Color key" dropdown only shows `SHIFT`/`BOTH` tags while scheduling a shift, `APPOINTMENT`/`BOTH` while scheduling an appointment; same filter applied to `AppointmentDetailPanel`'s dropdown (keyed off `isShift(appointment)`). A tag created inline from either panel is automatically scoped to whichever mode it was invented in (not left at `BOTH`) - consistent with the existing "lightweight label invented on the fly while scheduling" reasoning already on the create-tag route. The legend's tag entries are filtered the same way the 5 built-in status colors already were by `calendarType`.
- **Settings**: the "Color key" card's "Your own" tag creator gained an "Applies to" selector (Both/Shift only/Appointment only, defaults to Both since there's no mode context on a Settings page), and each existing tag shows a small scope badge next to its name when it isn't `BOTH`. Scope is set at creation time only - there's no edit/rename path for a tag yet (same pre-existing limitation as name/color).
- **Moved while here, per direct request**: the whole "Color key" card (`EventColorSettings.tsx`) relocated from the Calendar settings section to the Staff settings section - color keys/tags are a staff-scheduling concern. Still rendered only for `isAdmin` on the Staff page (its built-in-colors half is backed by the ADMIN-only `PUT /api/tenant-settings`), same "hide what would just 403" pattern as `AppointmentFormSettings` on the Appointments page. `sections.ts`'s Calendar/Staff descriptions updated to match; Calendar's section now only holds `HolidaySettings`.
- **Verified live** via curl against two fresh signups: created a `SHIFT`-scoped tag, an `APPOINTMENT`-scoped tag, and an unscoped one (confirmed it defaults to `BOTH`); confirmed an invalid `appliesTo` value 400s; confirmed `GET /api/event-tags` round-trips all three correctly. Confirmed `/admin/settings/staff` now renders the "Color key" card and `/admin/settings/calendar` no longer does. `tsc --noEmit`, `eslint` (all touched files), and the full `vitest` suite (15/15) all clean. **Not browser-click-tested** - the dropdown filtering itself (which tags appear in which mode's picker) is correct by code review, not yet clicked through in a real browser.

### Found already built in the working tree, undocumented — write-up below is from reading the diffs/new files directly, not a fresh build or a fresh verification pass
Every entry below this note and down to the next `###` boundary that doesn't repeat this caveat was discovered via `git status`/`git diff` at the start of a documentation pass, not built or tested live during that pass. Each entry restates "not independently re-verified live in this pass" rather than "verified live" for that reason — correct by reading the actual diff, not by curl/browser testing against a running server here. No Prisma migration is needed for any of them (confirmed empty `git diff --stat -- prisma/`, `schema.prisma` untouched), and no new permission keys were introduced — only pre-existing catalog keys (`VIEW_SERVICES`, `VIEW_STAFF`, `DELETE_STAFF`) got newly *consumed*.

### Public-facing marketing pages: new SiteHeader, dark app-header redesign, and a real pricing section on the homepage
- **New `SiteHeader.tsx`** — a plain server component (no client hooks) for the logged-out marketing pages (`/`, `/about`, `/login`, `/signup`), visually matching `AppHeader` but kept separate since the two have unrelated nav items (Features/Pricing/About/Log in/Sign up vs. the real app's tenant nav) and `AppHeader` needs client-side pathname/role logic this doesn't. All four public pages now render it and, in exchange, dropped their own previously-duplicated inline "ShiftUp" wordmark link.
- **`AppHeader` itself redesigned** to a solid dark bar (`bg-primary-600/95`, white/`primary-100` text) instead of the previous light `bg-primary-50` bar — the "S" logo badge square is gone, just the wordmark remains. New `maxWidthClassName` prop (default `max-w-6xl`) lets a page widen the header to match a wider body; `calendar/page.tsx` and `calendar/view/page.tsx` now pass `max-w-[1600px]` to make room for the new calendar sidebar (see the calendar entry below).
- **Homepage gained a real `#pricing` section** — three cards (Free/One-time/Subscription) pulling actual numbers from `src/lib/licensing/pricing.ts` (`ONE_TIME_PRICE_CENTS`, `SUBSCRIPTION_PRICE_CENTS_PER_MONTH`, `FREE_PLAN_LIMITS`) rather than hardcoded marketing copy — first time real prices have shown up anywhere public-facing. The existing "free to start" bullet also now states the actual numeric caps instead of generic "capped free plan" wording, so it tracks `FREE_PLAN_LIMITS` automatically if those change.

### Settings reopened beyond ADMIN-only, gated per-section by the existing permission matrix
Closes the gap TODO.md flagged under "Let Manager and Admin add job types" ("every settings page is still hard-gated to ADMIN only... a pre-existing gap in the whole Settings access model").
- **`admin/settings/access.ts`** (new, replaces the old `getAdminTenant.ts`) adds `getSettingsContext(tenantSlug)` — redirects to `/login` only for unauthenticated/SUPERADMIN sessions, then computes `visibleSections` by checking each `SettingsSection`'s new `requirement` field: `"ALWAYS"` (Account only — own login/password/language, never gated), `"ADMIN"` (Shifts/Calendar/Company Profile/Permissions — tenant-wide config with no existing delegation path), or a specific `PermissionKey` (Appointments → `VIEW_SERVICES`, Staff → `VIEW_STAFF` — both pre-existing keys, no catalog changes needed).
- **Enforced server-side, not just hidden in nav** — new `requireSettingsSection(tenantSlug, slug)` is called from each section's own `page.tsx` and 404s (not redirects — the visitor is a legitimate tenant member, just not for this section) if that section isn't in `visibleSections`, closing the "type the URL directly" bypass. `SettingsNav` now takes the filtered `sections` list as a prop instead of importing the static list directly.
- One real behavioral nuance inside the Appointments section: `ServiceTypeManager` shows for anyone holding `VIEW_SERVICES`, but `AppointmentFormSettings` (the tenant-wide form-toggle card) still only renders for `isAdmin`, because its backing route (`PUT /api/tenant-settings`) is still ADMIN-only — avoids showing a save control that would just 403 for a non-admin Staff-section holder.

### Account settings: language picker moved out of the header, into "My Account"
- The header's `LanguagePicker.tsx` dropdown is deleted outright; `AppHeader` now renders a plain "My account" link (new `account` i18n key) to the Account settings section instead.
- New `LanguageSettingsForm.tsx` is functionally identical to the old picker (same locale map, same `PATCH /api/me/locale`, same `router.refresh()` so the change takes effect without a logout) but rendered as a full settings card with a "Saved." confirmation message, above the existing `ChangePasswordForm` on the Account page. No new API route.
- **Trade-off worth flagging**: this is a net reduction in discoverability (always-visible header dropdown → one click into Settings) in exchange for consolidating account self-service in one place.

### Calendar: mini-month sidebar, agenda view, loading/retry states, and a real fix for "both" mode defaulting every new slot to an appointment
Mix of pure extraction and genuinely new behavior.
- **`CalendarToolbar`/`CalendarLegend` extracted** out of `SchedulingCalendar.tsx` into their own files, same behavior as before (no logic change) — just moved so `MiniMonthCalendar` (below) has somewhere to live alongside them.
- **New `MiniMonthCalendar.tsx`** — a Google-Calendar-style mini month grid in a new right-hand sidebar column (the calendar view is now `lg:flex-row`: main grid in a `flex-1` column, mini-month + legend stacked in a `lg:w-[280px]` sidebar). Clicking a day jumps the main calendar's `currentDate` there without changing the active view. This is what the widened `max-w-[1600px]` page layout (see the header-redesign entry above) makes room for.
- **New loading/error handling for the appointment fetch** — separate `appointmentsLoading`/`appointmentsError` state from the calendar's other generic `error` state (deliberately, so retry only targets this fetch): a skeleton pulse on first load, a centered "Couldn't load appointments. [Retry]" state if the first load fails, and a dismissible inline banner ("...Showing the last loaded data. [Retry]") if a later refetch fails but stale data is still on screen.
- **Agenda view added** to the view switcher (`["month","week","day"]` → `["month","week","day","agenda"]`).
- **Real bug fixed**: when `calendarType === "both"`, clicking/dragging an empty slot always created an **appointment** regardless of which calendar was actually being looked at — so drag-creating while viewing the shift calendar silently created an appointment instead. Now: `calendarType === "shift"` creates a shift, `"appointment"` creates an appointment, and only the genuinely ambiguous `"both"` case pops a small inline chooser ("Add as: Appointment / Shift / Cancel") via new `pendingSlot` state. A second click-drag while the chooser is open repositions the pending slot instead of stacking a second popup.
- **Doesn't fulfill TODO.md's existing "toggle to adjust the calendar's overall size" item** — that's about a resizable grid *height* (still a fixed value, still unbuilt); this is a layout/sidebar addition instead. Left that TODO item open, noted there.

### Staff removal: `DELETE /api/staff/[id]`
- New route, gated on the pre-existing `DELETE_STAFF` permission key (no catalog change). Validates the staff profile belongs to the caller's tenant (404 otherwise), blocks self-deletion (`400 CANNOT_DELETE_SELF`), and blocks deletion while the staff member has any appointments (`409 STAFF_HAS_APPOINTMENTS` — "reassign or cancel them first"), since `Appointment.staff` is `onDelete: Restrict`. Deletes the `User` row (not just `StaffProfile`), so working hours/time-off/template-shift rows for that person cascade away in the same transaction.
- `StaffManager.tsx` gained a "Remove" button per row (confirm dialog), wired to the new route, reloading the staff list on success.

### Superadmin console: tenant list reworked as an accordion, human-readable billing-plan labels, and a new admin-password-reset action (security-sensitive)
- **New `POST /api/superadmin/tenants/[id]/reset-password`** — gated on `requireRole(["SUPERADMIN"])` (confirmed the only gate; `/superadmin` itself is independently gated by its own layout, so this is two layers deep). Generates a random 12-char temp password, hashes it with the existing `hashPassword` helper (no new crypto), overwrites the tenant's **ADMIN** user's `passwordHash` (looked up by `role === "ADMIN"` within that tenant, via `runInSystemContext`), and returns the plaintext password **once** in the response — a code comment states it, correctly, as the only chance to relay it to the customer since nothing stores or logs it.
- **This is a manual stand-in for the still-missing self-service "forgot password" flow** (TODO.md's password-reset item — no email infrastructure exists anywhere in this app yet), not a replacement for it: it only covers "tenant admin is locked out and contacts support," not any user resetting their own password unassisted.
- **Flagging a real gap, not fixing it here**: this is the single most sensitive action a superadmin can take (full takeover of any tenant's admin login) and there is **no audit trail anywhere in the codebase** (`grep -ri audit` across `src/` returns nothing) — no record of which superadmin reset which tenant, or when, and no notification to the tenant that it happened. Reasonable for a small ops team today, but worth stating plainly rather than leaving implicit — added to SECURITY.md and TODO.md's Security section.
- **UI**: `TenantBillingManager.tsx` reworked from a flat table into a per-tenant accordion (click to expand), with a "Reset admin password" button (confirm dialog, then shows the plaintext password inline with a Copy button and a "shown once, never stored" caption), colored status badges in the collapsed row summary, and billing-plan labels now rendered via new `BILLING_PLAN_LABELS`/`BILLING_PLAN_DESCRIPTIONS` (`src/lib/licensing/pricing.ts`) instead of raw enum strings. `RevenueOverview.tsx`'s plan column got the same label fix.

### Dashboard plan badge: fixed raw enum string showing for one-time/subscription tenants
Small, real display bug. The dashboard's plan badge previously only had a translated label for `FREE` (`t("freePlan")`) — a `ONE_TIME` or `SUBSCRIPTION` tenant would have literally seen "ONE_TIME" or "SUBSCRIPTION" on their own dashboard. Now all three have real labels (`t("freePlan")`/`t("oneTimePlan")`/`t("subscriptionPlan")`, two new i18n keys added to all four locale files).

### Reusable shift-schedule templates (new page, paid feature)
TODO.md's long-standing "reusable shift-schedule templates" item - build a weekly/N-day shift pattern once, then apply it to any target week instead of rebuilding it from scratch. Built to the spec already written up in TODO.md, including its two previously-open decisions (conflict handling, paid-vs-free).

- **New models**: `ScheduleTemplate` (tenantId, name, `periodLengthDays`) and `ScheduleTemplateShift` (templateId, staffId, `dayOffset` 0-indexed within the period, `startMinute`/`endMinute` - same minutes-since-midnight convention `WorkingHours` already uses, optional serviceTypeId) - both RLS-enabled/forced with the same fail-closed tenant-isolation policy as every other tenant table (`prisma/migrations/20261002172016_add_schedule_templates`). A shift is relative to the period, not a real calendar date, so one template applies starting from any week.
- **Conflict handling: preview before applying**, chosen explicitly (over "skip and report" or "block the whole apply") when asked directly. `src/modules/scheduling/templates.ts`'s `planTemplateApply` is a pure dry-run - computes every shift's real start/end for the target period and flags any that would double-book a staff member (against an existing appointment, or against an earlier row in the same template) without writing anything. `applyTemplate` runs the same plan for real, creating a real `Appointment` (clientId null - these are shifts) for every non-conflicting item and skipping just the flagged ones, returning `{created, skipped}` - a conflict only costs that one shift, not the whole apply. `POST /api/schedule-templates/:id/apply` takes a `dryRun` boolean to pick between the two.
- **Five new permission keys** (`VIEW/CREATE/EDIT/DELETE_SCHEDULE_TEMPLATES` + a separate `APPLY_SCHEDULE_TEMPLATES`, per TODO.md's explicit call that applying is a bigger-stakes action than editing a draft) in `src/lib/permissions/catalog.ts`, with a new "Schedule templates" group in the Settings permission matrix. Starter defaults: Manager gets all five; Supervisor gets `VIEW`/`APPLY` (mirrors it already holding `CREATE_APPOINTMENTS`) but not `CREATE`/`EDIT`/`DELETE` - same split `VIEW_SERVICES`/`CREATE_SERVICES` already uses; Employee/Customer get none.
- **Decided paid feature, enforced not just hidden**: a new `assertScheduleTemplatesEnabled` in `src/lib/licensing/limits.ts` - unlike the existing staff/appointment usage caps, this is a whole-feature gate (`FREE` blocked entirely regardless of usage, `ONE_TIME`/`SUBSCRIPTION` unrestricted), called in every `/api/schedule-templates/**` route. The page itself (`/app/[tenantSlug]/schedule-templates`) shows an "Upgrade to use this" card instead of the tool when the tenant's `License.billingPlan` is `FREE`. **Flagging one judgment call**: the gate blocks *all* actions, including viewing or deleting a tenant's own already-existing templates after a hypothetical downgrade, not just creating new ones - simplest reading of "paid feature," written up in TODO.md in case that's not the intent once real downgrades are reachable (Stripe checkout isn't live yet, so today the only way to even reach a paid plan is the SUPERADMIN console's manual override).
- **UI**: new `ScheduleTemplatesView.tsx` (role-picker-style template list + detail panel, same layout convention as `RolesAndPermissionsEditor.tsx`) - add/edit/delete shifts, clone a template, and an "Apply to a week" section (date picker → Preview → a table of every planned shift with conflicts highlighted → Apply/Cancel). Linked from `AppHeader`'s "Staff pages" dropdown, gated on `VIEW_SCHEDULE_TEMPLATES` (computed per-page, same convention as `VIEW_ROSTER` - every page rendering `AppHeader` now also computes and passes this).
- **Verified live** via curl against two fresh signups: built a template with two shifts for one staff member; confirmed a dry-run preview computed the correct `startTime`/`endTime` for both with no conflicts; applied for real and confirmed two `Appointment` rows were created with `clientId: null`; re-applied the *same* template to the *same* week and confirmed both were correctly flagged and skipped as `CONFLICT` this time; cloned the template and confirmed the copy carried both shifts over; confirmed a day-offset outside the period's length and shrinking the period below an existing shift's offset both 400 with clear errors; confirmed an Employee (lacking `VIEW_SCHEDULE_TEMPLATES`) gets 403 on every route; confirmed a second, FREE-plan tenant's ADMIN gets 403 with the paid-feature message on every route including plain `GET`, and that the page renders the upgrade card instead of the tool. `tsc --noEmit`, `eslint`, the full `vitest` suite (15/15), and `next build` all clean. **Not browser-click-tested** - same standing caveat as the rest of this app's client-rendered UI; the shift-add form, preview table, and apply/confirm buttons are correct by code review and their underlying API calls are genuinely tested, but the on-screen interaction hasn't been clicked through in a real browser.

### Custom roles: fixed the "can't configure a new role's permissions" bug, redesigned the Permissions page around it
Raised directly: after the custom-roles system shipped (2026-10-01 entry below), a newly-created role couldn't have its permissions set. **Root cause found**: `RoleManager` (the role list/CRUD) and `PermissionMatrixEditor` (the checkbox grid) were two sibling client components, each independently fetching its own copy of the role list on mount (`/api/roles` vs. `/api/admin/permissions`) with no way to tell each other when it changed. Creating a role in `RoleManager` worked at the DB level, but `PermissionMatrixEditor` never re-fetched, so the new role's column never appeared in the matrix without a hard page reload - it looked broken even though the backend (`src/lib/permissions/service.ts`'s `getEffectivePermissionMatrix`/`getEffectiveVisibilityMatrix`, already fully role-id-generic, no hardcoded 4-role assumption) was correct.

- **Fixed by redesign, not a patch** - asked the user whether to keep the two-section layout (role list above a big permission matrix) and just wire the sync, or redo it; chose the redesign. `RoleManager.tsx` and `PermissionMatrixEditor.tsx` are gone, replaced by **`RolesAndPermissionsEditor.tsx`** (owns one shared fetch of roles + grants + visibility, the single source of truth both panes read from) and **`RoleDetailPanel.tsx`** (the right-hand panel for whichever role is selected).
- **New layout**: a role picker sidebar on the left (plus the "+ Add role" form, moved here from its own section) and a detail panel on the right showing, for just the selected role: its name/description/reports-to fields (same onBlur-save pattern as before), a grouped permission checklist (same `PERMISSION_GROUPS`/`PERMISSION_LABELS`, same keys - no catalog changes), and a "who this role can see" checklist (one row of the old visibility matrix, scoped to the selected role as viewer). Permission and visibility checkboxes now **autosave instantly per-click** (optimistic, revert-on-failure - same convention as `AppointmentFormSettings.tsx`'s toggles) instead of batching every role's changes behind one global "Save changes" button.
- **Creating a role now jumps straight to it** - `handleCreate` passes the newly-created role's id into the shared `reload()`, so you land directly on its (deny-everything-by-default) permission checklist instead of having to find it in a list afterward. This is the direct fix for the reported bug: there's now exactly one fetch of the role list, shared by the picker and the detail panel, so a create/rename/delete can never leave the permission UI looking at a stale role set.
- **Verified**: `tsc --noEmit`, `eslint`, and the full `vitest` suite (15/15) all clean. No API or schema changes - `src/app/api/roles/**`, `src/app/api/admin/permissions/route.ts`, and `src/lib/permissions/{catalog,service}.ts` are untouched, this was purely a frontend data-flow and layout fix. **Not yet clicked through in a real browser** - same standing caveat as the rest of this app's client-rendered UI; the state-sharing fix is correct by code review (one `reload()` call site refetches both the role list and the permission/visibility matrices together) but hasn't been watched end-to-end in an actual browser session.

### Shift/appointment visibility: own-only by default, VIEW_ALL_SHIFTS/VIEW_ALL_APPOINTMENTS to see everyone
Closes out TODO.md's long-standing "'Who can see who' isn't enforced yet" gap - but via a different, simpler mechanism than the one that item originally pointed at. Confirmed with the user up front: the existing `RoleVisibility`/`canViewRole()` role-to-role matrix (modeled since the custom-roles work, never wired to appointments) was a deliberate **not-chosen** option in favor of two plain per-role booleans, closer to "can this role see shifts/appointments outside its own" than a full role-pair matrix. `RoleVisibility`/`canViewRole()` remain exactly as unenforced as before this change - nothing here touches them.

- **Two new permission keys**, `VIEW_ALL_SHIFTS` and `VIEW_ALL_APPOINTMENTS` (`src/lib/permissions/catalog.ts`), same plain-string `RolePermission` pattern as every key since the granular-permissions rework - no migration needed. Independent per type (shift = `clientId: null`, appointment = `clientId` set, same convention as `isShift()` everywhere else) since a role might reasonably see all shifts but not all appointments, or vice versa. **Defaults** (confirmed with the user, a real behavior change for Employee/Customer): Manager/Supervisor get both `true` (they already had tenant-wide edit/cancel rights); Employee/Customer get both `false` - a real narrowing from before, where any `VIEW_APPOINTMENTS` holder saw every appointment tenant-wide regardless of role.
- **Enforced server-side**, not just hidden in the UI. `listAppointmentsInRange` (`src/modules/scheduling/service.ts`) takes an optional `AppointmentVisibility` (`{allShifts, allAppointments, ownStaffId}`) and builds a Prisma `OR` filter from it; `GET /api/appointments` (`src/app/api/appointments/route.ts`) computes it from the caller's effective permissions plus `getOwnStaffProfile()` (reused from `src/modules/timeoff/service.ts`) and passes it through - a role lacking both keys only ever gets rows where `staffId` is their own. Also closed the matching bypass on `GET /api/appointments/[id]` - fetching someone else's shift/appointment directly by id now 403s the same way the list endpoint would have excluded it.
- **A voluntary "Everyone / Just mine" toggle on the calendar can only narrow, never widen.** `GET /api/appointments?view=mine` lets a viewer who *does* hold `VIEW_ALL_SHIFTS`/`VIEW_ALL_APPOINTMENTS` deliberately collapse down to their own, same as the user's literal ask ("if they have access then they need to be able to see everyone's and then just see their own") - the query param is read server-side and can only subtract from what the permission already grants, never add to it, so a viewer without the permission sending `view=all` still gets scoped results. `SchedulingCalendar.tsx` renders this as a new "Viewing" pill (Everyone/Just mine) in the existing filters settings box, next to the Staff/Calendar-type/Time-grid controls - only shown when the viewer holds the relevant `VIEW_ALL_*` for whatever `calendarType` is currently selected (shift-only, appointment-only, or either for "Both").
- **Settings UI**: both new keys added to the Permissions matrix's existing "Scheduling" group (`PermissionMatrixEditor.tsx`), alongside `VIEW_APPOINTMENTS`/`CREATE_APPOINTMENTS`/etc.
- **Verified live** via curl against a fresh signup with two Employee-role staff (A, B) and one Manager: confirmed Employee A's `/api/me/permissions` defaults both new keys to `false`; confirmed A's appointment list initially contained only A's own shift; granted the Employee role `VIEW_ALL_APPOINTMENTS` only (not shifts) and confirmed A then saw B's real appointment but still not B's shift - the per-type split works; confirmed `?view=mine` collapsed A back to just their own row even after that grant; confirmed direct-id fetch of B's shift 403'd before the grant and B's appointment 200'd after it; confirmed Manager's permissions default both to `true` and their unscoped list returned all 3 test rows. `tsc --noEmit`, `eslint`, and the full `vitest` suite (15/15) all clean on every touched file.
- **New known gap surfaced, added to TODO.md**: `/calendar/roster` reads from this same now-scoped endpoint - a role holding `VIEW_ROSTER` without also holding `VIEW_ALL_SHIFTS`/`VIEW_ALL_APPOINTMENTS` would get a Roster page that only shows their own row. The two Manager/Supervisor defaults cover this out of the box; flagged rather than silently making one permission imply the other.

### Service types: optional price + active/inactive toggle
Raised directly (not pre-existing in TODO.md): the "Service types" Settings
card already existed (`ServiceTypeManager.tsx`, done 2026-10-02) but every
service type required a price and had no way to disable one without deleting
it. Framed explicitly around supporting **both blue-collar and police/public-
safety tenants** - police work often has no price at all, which is different
from being free.

- **`ServiceType.price` is now a real nullable column** (`prisma/migrations/
  20261002045148_service_type_optional_price_and_active`), not just a UI
  convention - `null` means "no price concept for this service type" (e.g. a
  police call-out), distinct from an explicit `$0` ("this is free"). Same
  nullable pattern `Appointment.priceCharged` already used, now applied
  consistently to `ServiceType.price` too.
- **New `ServiceType.isActive`** (default `true`). `GET /api/service-types`
  accepts `?activeOnly=true` - the calendar's create-appointment/shift panel
  now calls it with that flag so inactive service types drop out of new
  scheduling, while the Settings manager still fetches all of them (including
  inactive) so they can be toggled back on. Existing appointments keep their
  service type name/price regardless of its current active state - that data
  comes from the appointment's own stored relation, not the filtered list.
- `POST`/`PATCH /api/service-types` both accept a nullable `price` and the new
  `isActive` boolean; `ServiceTypeManager.tsx` got a per-row "Active" checkbox
  (instant-toggle, optimistic with revert-on-failure - same pattern as
  `AppointmentFormSettings.tsx`'s toggles) and the price input is now genuinely
  optional (blank input, not a `0` default) in both the add and edit forms.
- **Verified live** via curl against a fresh signup: created one service type
  with no price (`price: null` round-trips correctly) and one with a real
  price; toggled the priceless one inactive and confirmed `GET
  /api/service-types` still lists both while `?activeOnly=true` correctly
  drops the inactive one. `tsc --noEmit` and `eslint` both clean on every
  touched file. The per-row toggle UI and optional-price form inputs
  themselves are correct by code review - not yet clicked through in a real
  browser, same standing caveat as the rest of this app's client-rendered UI.

### Security posture review (passwords + overall)
Closed out the long-standing TODO.md item asking for "a detailed, honest
explanation of this software's security posture." Reviewed the actual code
(not assumptions) for `src/lib/auth/password.ts`, `src/lib/auth/session.ts`,
the login/signup/superadmin-bootstrap routes, `src/modules/identity/service.ts`,
and `.env.example`, then wrote it all up in a new **`SECURITY.md`** at the
repo root (same tier as `ARCHITECTURE.md`/`PROGRESS.md`/`TODO.md`).

- **Password storage confirmed sound**: scrypt (Node-native, no bcrypt
  dependency needed), a fresh random 16-byte salt per password, `timingSafeEqual`
  for verification (timing-attack resistant), passwords never logged, and
  login returns an identical error for "no such user" vs. "wrong password"
  (no enumeration via message or timing).
- **Sessions confirmed sound**: HMAC-SHA256 signed cookie (`AUTH_SECRET`,
  required - the app won't issue sessions without it), `httpOnly` +
  `sameSite: lax` + `secure`-in-production, 7-day expiry checked from the
  signed payload.
- **Real gap surfaced and added to TODO.md**: no rate limiting or lockout on
  `/api/auth/login`, `/api/auth/signup`, or `/api/superadmin/bootstrap` -
  confirmed by grepping `src/` for any rate-limit/lockout logic (none
  exists). The hashing/signing above is correctly built, but unlimited
  attempts are currently possible against it - flagged as the single
  highest-value next security item, not yet built (needs a decision on
  in-memory vs. shared-store throttling first).
- Also restated what was already known but not previously written down in
  one place: Stripe Checkout handles all card data (none touches this app),
  the non-superuser DB role fix is what makes RLS actually enforce (verified
  by `tenant-context.rls.test.ts`), and the honest list of what's *not* true
  yet (no CI, no external security audit, no penetration test).
- TODO.md's Security section updated: the write-up item marked done (links
  to `SECURITY.md`), its "advertise safety" follow-up noted as now
  unblocked, and the new rate-limiting gap added as its own item.

### Calendar link out of the nav dropdowns, plus a per-role permission for its Appointments/Shifts/Both switcher
- **Nav change**: `Calendar` (plain link to `/calendar`, no `?type=` pre-filter) and `View only` (`/calendar/view`) are now both plain top-level links in `AppHeader.tsx`, instead of being duplicated inside the "Appointment pages" and "Staff pages" dropdowns (which is how they landed in the earlier "nav bar split into Appointment/Staff dropdowns" entry below). The "Appointment pages" dropdown is gone entirely now that its only other item was `View only`, which moved up to top-level too. "Staff pages" dropdown is untouched (Roster/Time off).
- **New `VIEW_CALENDAR_TOGGLE` permission** (`src/lib/permissions/catalog.ts`, "Scheduling" group in the Settings permission matrix) — gates whether a role sees/can use the calendar's existing Appointments/Shifts/Both switcher (`SchedulingCalendar.tsx`, previously shown to anyone on a `BOTH`-tier license with no per-role control). Defaults: on for Manager/Supervisor, off for Employee/Customer. Without it, the calendar still *shows* "Both" by default (or whichever single type the license tier allows) — the permission only hides the switcher buttons, it's not a data-visibility gate (that's still `VIEW_APPOINTMENTS`). The always-permission-agnostic `/calendar/view` route deliberately keeps the switcher for everyone regardless of this permission (`canToggleCalendarType` defaults to `true` when not explicitly passed), matching that route's existing "ignores permissions entirely" design.
- No migration needed — `RolePermission.permissionKey` is a plain string column, not a Postgres enum, same as every permission key added since the custom-roles rework.
- **Verified**: `tsc --noEmit` and `eslint` both clean on every touched file. Not yet clicked through in a real browser — same standing caveat as the rest of this app's client-rendered UI.

### PTO manager + shift-coverage finder (the top TODO item, completed)
This was mid-build when the previous session ended (process died before the write-up), so it wasn't documented yet even though the code and a live multi-staff test had already fully passed. Verified again from scratch this session after a machine restart, including confirming the DB data survived.
- **Two open design questions from the TODO item, resolved with standard defaults** (not explicitly confirmed by the user, flag if wrong): approval workflow is self-service request (anyone with a `StaffProfile` can request time off for themselves, no permission gate) + `ADMIN`/`MANAGER`/`SUPERVISOR` approval (new `APPROVE_TIME_OFF` permission); "hours worked" = the FLSA-standard calendar week (Sun–Sat) containing the shift, not a configurable pay period.
- **New `TimeOff` model** (`prisma/migrations/..._add_time_off`): tenant + staff-scoped, `PENDING`/`APPROVED`/`DENIED` status, RLS-protected same as every other tenant table. New permission keys `VIEW_TIME_OFF` (see others' requests) and `APPROVE_TIME_OFF` (approve/deny) in `src/lib/permissions/catalog.ts`.
- **API**: `POST/GET /api/time-off` (self-service create; GET returns all-tenant if `VIEW_TIME_OFF`, else just your own), `PATCH /api/time-off/[id]` (approve/deny, gated).
- **Coverage finder**: `GET /api/appointments/[id]/coverage` (`findCoverageCandidates` in `src/modules/scheduling/service.ts`) returns staff who are NOT the current assignee, NOT already booked over that time, and NOT on approved leave — sorted by hours already scheduled that week (ascending), so the least-loaded/lowest-overtime-risk person surfaces first. `PATCH /api/appointments/[id]` now also accepts `staffId` to actually reassign, going through the same `EXCLUDE`-constraint-checked path as any other write.
- **UI**: `/app/[tenantSlug]/time-off` (request form + table; approve/deny buttons shown only to `APPROVE_TIME_OFF` holders), plus a "Find coverage" section in the calendar's appointment detail panel (gated on `EDIT_APPOINTMENTS`) showing candidates with their weekly hours and an "Assign" button per candidate.
- **Verified live with a real 4-staff scenario**: built a target shift for Staff A, gave Staff B 5 unrelated hours that week, put Staff C on **approved** time off overlapping the target window, and gave Staff D a conflicting overlapping shift. `GET .../coverage` correctly returned **only Staff B, with `hoursThisWeek: 5`** — A excluded as current assignee, C excluded via approved leave, D excluded via the overlap check. Reassigning to Staff B succeeded; reassigning to the busy Staff D correctly returned a 409 conflict. Confirmed this data was still intact in the database after a full machine/Docker restart.

### Pricing, roles, branding (earlier this session)
- **Feature tiers**: `License.tier` is `SHIFT_MANAGEMENT` / `APPOINTMENT_MANAGER` / `BOTH`. `src/lib/licensing/features.ts` turns a tier into `{shiftManagement, appointmentManager}` booleans — the one place route guards/nav should check. Verified live: signing up with one feature tier shows only that badge on the dashboard.
- **Role hierarchy**: `SUPERADMIN > ADMIN > MANAGER > SUPERVISOR > EMPLOYEE > CUSTOMER` (renamed from `ATTENDEE` to `CUSTOMER` mid-session - `prisma/migrations/..._rename_attendee_to_customer` is a plain `ALTER TYPE ... RENAME VALUE`, no data migration needed). `CUSTOMER` is reserved for a future logged-in client (not wired to anything yet — guest `Client` records are still separate).
- **Branding**: white + dodger blue (`#1E90FF`) via `--color-primary-*` in `src/app/globals.css`, used as Tailwind `primary-50/100/500/600/700`. Applied to all pages built so far. Old auto dark-mode was removed in favor of this fixed light palette.

### Billing plan: free tier + future one-time/subscription (new this session)
Pricing model changed from "always one-time, no free option" to: **FREE forever** (usage-capped, for exploring the product) with **ONE_TIME** or **SUBSCRIPTION** as future paid upgrades. This is a separate dimension from feature tier - a tenant's `License` now has both `tier` (which modules) and `billingPlan` (`FREE`/`ONE_TIME`/`SUBSCRIPTION`), independently.
- `prisma/migrations/..._add_billing_plan` added `billing_plan` to `licenses`, added `stripe_customer_id`/`stripe_subscription_id` (so Phase 3 payments won't need another enum-touching migration), and dropped `TRIAL` from `LicenseStatus` (FREE now fills that role permanently, not as a ticking clock) - existing rows were preserved, not truncated.
- Every signup currently gets `billingPlan: FREE` — there's no checkout UI yet (Phase 3), so `ONE_TIME`/`SUBSCRIPTION` exist in the schema but aren't reachable from any UI yet.
- **Real enforcement, not just a label**: `src/lib/licensing/limits.ts` caps the FREE plan at 1 staff profile and 20 appointments per rolling 30 days (placeholder numbers — no real pricing/cost data yet, easy to tune). Wired into `POST /api/staff` and `POST /api/appointments`. **Verified live**: creating a 2nd staff member on a FREE tenant is blocked with a clear "upgrade to add more" message; `ONE_TIME`/`SUBSCRIPTION` plans are uncapped.
- Signup form now asks "what do you want to explore? (free to start)" instead of implying a paid plan choice, and states explicitly that creating an account makes you the **admin** for that business.

### RLS bug fix (from the previous handoff)
- Root cause was a Postgres **superuser** role bypassing Row-Level Security regardless of `FORCE ROW LEVEL SECURITY`. Fixed with a separate restricted `shiftup_app` role (`prisma/migrations/..._add_restricted_app_role`), `APP_DATABASE_URL` env var, and `src/lib/prisma.ts` now connects as that role. All 4 tests in `src/lib/tenant-context.rls.test.ts` pass.

### Phase 1: core scheduling data model
New Prisma models (`prisma/migrations/..._add_phase1_scheduling_and_permissions`): `StaffProfile`, `WorkingHours`, `ServiceType`, `Client`, `Appointment` — all with RLS enabled/forced + fail-closed tenant-isolation policies, same pattern as Phase 0's tables.
- **Double-booking prevention**: a real Postgres `EXCLUDE` constraint (`appointments_no_overlapping_staff_time`, via `btree_gist`) blocks any overlapping time range for the same staff member, at the database level — **verified live**: creating a second appointment overlapping an existing one for the same staff returns 409, caught via `SchedulingConflictError` in `src/modules/scheduling/service.ts`.
- `Appointment.estimatedDurationMinutes` / `estimatedValue` are the blue-collar "how long will this job take / what will it make" fields, nullable, gated by permission (see below) rather than a hardcoded role check.

### Configurable permission system (replaces hardcoded role checks)
This was a mid-session request: **the tenant ADMIN should be able to configure what MANAGER/SUPERVISOR/EMPLOYEE/CUSTOMER can do and see**, not have it hardcoded.
- `RolePermission` and `RoleVisibility` tables store **per-tenant overrides**, layered on top of a hardcoded default matrix in `src/lib/permissions/catalog.ts` (`DEFAULT_ROLE_PERMISSIONS`, `DEFAULT_ROLE_VISIBILITY`). `src/lib/permissions/service.ts` (`hasPermission`, `canViewRole`, `getEffectivePermissionMatrix`, `getEffectiveVisibilityMatrix`) merges default + override. ADMIN/SUPERADMIN always pass every check unconditionally — never stored as overridable rows, so a MANAGER can never grant themselves more access even indirectly.
- **Broken down to one action per key** (a later request: "break down the permissions more, I see a lot are combined") — the original 4 combined `MANAGE_X` keys became 16 granular ones: `VIEW/CREATE/EDIT/DELETE_STAFF`, `VIEW/CREATE/EDIT/DELETE_SERVICES`, `VIEW/CREATE/EDIT/DELETE_CLIENTS`, `VIEW/CREATE/EDIT/CANCEL_APPOINTMENTS`, plus the existing `VIEW_JOB_ESTIMATES`/`EDIT_JOB_ESTIMATES` (18 keys total). E.g. a tenant can now grant "view clients" without "delete clients" — not possible when those were one `MANAGE_CLIENTS` key. Every API route that used a combined key was split to check the specific action (see `src/app/api/{staff,service-types,clients,appointments}/route.ts` and `appointments/[id]/route.ts`); the calendar UI now has separate `canCreate`/`canEdit`/`canCancel` instead of one `canManage`. **Verified live**: EMPLOYEE's default matrix confirmed to have all four `VIEW_*` keys true and everything else false.
- **"Who can see who"** (`RoleVisibility`) is modeled but **not yet enforced anywhere** — `canViewRole()` exists and is tested at the unit level implicitly via the matrix logic, but no API route currently calls it to actually filter data by who-can-see-whom. Right now every tenant user with `MANAGE_APPOINTMENTS` sees all appointments tenant-wide, not scoped to "only people I'm allowed to see." **This needs to be wired into the appointments list/detail routes before it's a real feature**, not just a settings page that saves values nobody reads yet.
- **Admin "User Manager" page** (`/app/[tenantSlug]/admin/users`, `src/app/.../admin/users/`): two editable grids (permissions-by-role, visibility-by-role-pair), backed by `GET/PUT /api/admin/permissions` (ADMIN-only). **Verified live end-to-end**: granted an EMPLOYEE test user `VIEW_JOB_ESTIMATES` via the API and confirmed job estimates immediately became visible to them on the next request — this is a real, working override, not just UI.
- `GET /api/me/permissions` gives any logged-in tenant user their own effective permissions (used by the calendar UI to decide what to show/allow).

### Scheduling calendar UI
- Library: **react-big-calendar** (fully MIT-licensed) + its drag-and-drop addon, **not FullCalendar** — FullCalendar's resource/timeline views require a commercial license, which conflicts with the "keep it affordable" goal. date-fns localizer (lighter than moment).
- `/app/[tenantSlug]/calendar` (`SchedulingCalendar.tsx`): week/day views, **drag-to-reschedule and resize-to-change-duration both wired to a real PATCH** that goes through the same exclusion-constraint-checked `rescheduleAppointment()` as any other reschedule — verified the underlying conflict path, not yet manually drag-tested in an actual browser (no browser available in this environment; only curl/API-level testing was done).
- **Click an appointment → side panel with client info + job details** (service, staff, status, payment status), with job estimate fields shown only if `VIEW_JOB_ESTIMATES`, editable only if `EDIT_JOB_ESTIMATES` — this directly implements the "select an hour, see client/job info" and "admin/manager-only job estimation" requirements.
- **Click an empty slot → create-appointment panel** prefilled with that time range; supports an optional free-text client name (creates a new `Client` record inline — no client search/dedup yet) or leaving it blank for internal/shift-only bookings (no paying client).
- Minimal supporting CRUD: `POST/GET /api/staff` (creates a new User + StaffProfile together — there's no separate "invite existing user" flow yet), `POST/GET /api/service-types`, `POST/GET /api/clients`.

### Phase 3 payments: tenant license upgrade (Stripe, platform's own account)
Built the **tenant → platform** payment flow (not the client-pays-business flow, which is separate and still not started — see TODO.md). Uses the price points decided earlier this session ($149–299/$399–499 one-time, $15–25/$35–45 per month subscription — see `src/lib/licensing/pricing.ts` for the exact midpoints chosen).
- `src/lib/stripe.ts`: lazily-constructed Stripe client (constructing it eagerly at module load broke `next build`, since Next evaluates route modules to collect their config even when the route is never called - caught by actually running the build, not just assuming it'd work).
- `POST /api/billing/checkout` (ADMIN-only, hardcoded - not part of the configurable permission system, since who can spend the business's money shouldn't be delegable to a MANAGER from the User Manager page): creates a Stripe Checkout Session using **inline `price_data`**, not pre-created Stripe Products/Prices - avoids needing any manual Stripe Dashboard setup beyond having an account.
- `POST /api/billing/webhook`: verifies the Stripe signature, handles `checkout.session.completed` (upgrades the License to ONE_TIME or SUBSCRIPTION + ACTIVE), `customer.subscription.updated`/`deleted` (keeps status/expiresAt in sync with Stripe's view of the subscription). Runs in system context (looked up by tenantId from Stripe metadata, not a logged-in session).
- `/app/[tenantSlug]/billing` admin page: shows current plan, and "Buy once" / "Subscribe" buttons when on FREE.
- **Verified so far**: billing page renders, checkout endpoint fails cleanly (clean JSON 500, not a crash) when `STRIPE_SECRET_KEY` isn't configured. **Not yet verified**: an actual successful checkout or webhook-triggered upgrade — that needs a real Stripe test-mode account, which only the user can provide (see TODO.md).

### Read-only calendar view + appointment location/meeting type
- **Dedicated read-only calendar**: `/app/[tenantSlug]/calendar/view` reuses `SchedulingCalendar` with a new `readOnly` prop that forces `canCreate`/`canEdit`/`canCancel`/`canEditEstimates` false **regardless of the viewer's actual permissions** (not just "happens to lack edit rights") - no create buttons, no drag/resize, no cancel, no estimate editing, plus a visible "View only" banner. Linked from the main `/calendar` page as "Open view-only link". This was a clarified request - the user picked "a separate, dedicated read-only view" over formalizing the existing permission-driven hiding or a new role, since existing behavior only hides controls for roles that happen to lack permission, not unconditionally.
- **Appointment location + in-person/online**: new `Appointment.locationType` (`IN_PERSON`/`ONLINE`, default `IN_PERSON`) and `Appointment.location` (free text - physical address or meeting link depending on type) via `prisma/migrations/..._add_appointment_location` (purely additive, no destructive enum changes needed this time). Settable on create (a toggle + a text field whose label/placeholder adapts - "Address" vs "Meeting link") and editable via `PATCH /api/appointments/[id]` (gated by `EDIT_APPOINTMENTS`, same as reschedule). Shown in the appointment detail panel. **Verified live**: created one ONLINE appointment with a meeting link and one IN_PERSON with an address, confirmed both round-trip correctly through `GET /api/appointments`.

### Staff management UI (User Manager page + inline from the calendar)
There was no UI to add staff at all before this - only the raw `POST /api/staff` endpoint, testable via curl. Now:
- `/app/[tenantSlug]/admin/users` has a new **Staff** section (`StaffManager.tsx`): a form (name/email/password/role) plus a live table of current staff, above the permission matrix.
- The calendar's create-appointment/shift panel can now add a brand-new staff member **inline** - the staff dropdown gets a "+ Add new staff member" option (gated on `CREATE_STAFF`, separately from `CREATE_APPOINTMENTS` - a SUPERVISOR who can create appointments but not staff won't see it), which reveals name/email/password/role fields. Submitting creates the staff member first via `POST /api/staff`, then uses the returned id for the appointment/shift - one combined action instead of two separate trips. The parent calendar's staff list is refreshed afterward so the new person shows up immediately without a page reload.
- Both paths go through the same `POST /api/staff` endpoint and therefore the same free-plan staff cap and permission checks already in place - **verified live**: a 2nd staff member on the free-tier test tenant is still correctly blocked with the same "upgrade to add more" message.
- Same client-rendering caveat as the rest of the calendar: the inline new-staff fields and the User Manager form are correct by code review and their underlying API calls are tested, but the actual on-screen form interactions haven't been clicked through in a browser.

### Calendar rebuilt: two entry-point buttons, color coding, and a real navigation bug fixed
Per request, added dedicated "**+ Add appointment**" and "**+ Schedule shift**" buttons above the calendar (gated on `CREATE_APPOINTMENTS`, same as before) - both open the same create panel but a shift skips the client field entirely (`clientId` stays null) while an appointment collects one. No new DB field needed; "shift vs appointment" is just `clientId == null`, matching how the architecture already described internal/shift-only scheduling. Also added: a start/end datetime-local picker in the create panel (previously only settable by dragging a slot), a staff filter dropdown (when >1 staff), a month view, and a color/legend system (blue = appointment, violet = shift, gray = completed, amber = no-show, struck-through gray = cancelled) applied to both calendar events and the detail panel's status pill.

**A user-reported navigation bug, first misdiagnosed, then actually fixed.** Day/Week/Month switching and Today/Back/Next didn't work - acting "hardcoded to this week." First pass (previous session) blamed a `dateFnsLocalizer` `startOfWeek` wrapper and "fixed" it - **that diagnosis was wrong**: reading `dateFnsLocalizer`'s actual source (`node_modules/react-big-calendar/lib/localizers/date-fns.js`) shows the `startOfWeek` function passed in is only ever called as `startOfWeek(new Date(), ...)` internally, for a locale-level "which weekday is first" constant - never with the currently-viewed date - so that fix changed nothing observable. The user correctly reported it was still broken.
**Actual fix**: the Calendar was in react-big-calendar's "uncontrolled" date/view mode (no `date`/`view`/`onNavigate`/`onView` props, just `defaultView`) - date/view state lived entirely inside the library's internal `uncontrollable`-wrapped state, which we had no visibility into or control over. Converted to fully **controlled** state: `currentDate`/`currentView` now live in `SchedulingCalendar`'s own `useState`, passed as `date`/`view`, updated via `onNavigate`/`onView` handlers we own. This removes any ambiguity about library-internal behavior - navigation now goes through code that's directly inspectable and debuggable.
**Confirmed fixed by the user in their browser on 2026-10-01** - Day/Week/Month switching and Today/Back/Next all work now. Closed out of TODO.md's bug list.

### Click-to-jump month/year picker, then a full toolbar redesign
Built on top of the controlled-state fix above: replaced react-big-calendar's default toolbar with a custom `CalendarToolbar` (`components={{ toolbar: CalendarToolbar }}`) that makes the month/year label clickable. Clicking it opens a small popover with a month `<select>` and a year `<input type="number">`; "Go" calls `onNavigate("DATE", new Date(year, month, 1))`, which goes through the same chain as the library's own nav buttons and lands on the controlled `currentDate` state. Closes on outside click or Cancel.

**Then redesigned further per request** ("too generic," "modern and fresh," bold "gothic" font): the toolbar now renders with its own full Tailwind styling instead of leaning on `react-big-calendar`'s generated `rbc-toolbar`/`rbc-btn-group`/`rbc-active` classes - Today/Back/Next and Month/Week/Day are each a segmented pill-button group (`rounded-full bg-gray-100 p-1`, active view = solid dodger-blue fill), and everything uses **Oswald** (`next/font/google`, bold 600/700 weights) - a geometric-sans ("Century Gothic"-style) face, not blackletter, since the ask was for "modern and fresh," which blackletter would contradict. Removed the now-dead `.rbc-toolbar` CSS rules from `globals.css` since nothing references those classes anymore.

**Color system changes**: added `--color-primary-400` (lighter dodger-blue tint) and a full parallel `--color-shift-*` scale (50/100/400/500/600/700) using **Colorado Rockies purple (#333366)** as the base - replacing the previous generic violet (`#7c3aed`) - per request and verified against multiple team-color reference sites before using it (not guessed). The two calendar action buttons ("+ Add appointment" / "+ Schedule shift") and the shift-mode create panel were all switched from Tailwind's built-in `violet-*` classes to the new `shift-*` tokens, and from a static left-right gradient to a **radial gradient that only appears on hover** (`hover:bg-[radial-gradient(circle_at_center,var(--color-X-500)_0%,var(--color-X-700)_100%)]`) - solid flat color at rest, a soft glow emanating from the center on hover. First pass made the hover effect (scale-up + strong color jump + colored shadow) too intense per user feedback; toned down to no scale transform and a narrower, same-starting-shade gradient so it reads as a gentle glow rather than a dramatic shift.

**Layout reorder**: the color-key legend and the create-appointment/shift panel both moved from below the calendar to above it - legend sits right under the staff-filter/action-buttons row, and the create panel (when open) renders between that row and the calendar grid, not at the bottom of the page.

Same caveat as the navigation fix above applies to all of this - correct by code review, build/lint/test clean, pages confirmed still rendering (200) after each change, but none of it has been clicked through in a real browser yet.

### Calendar-type switcher, gated by license tier
Both `/calendar` and `/calendar/view` now fetch the tenant's `License` server-side and pass `licenseTier` down to `SchedulingCalendar` (defaulting to `"BOTH"` if somehow no license row exists, matching the permissive default used elsewhere). `featuresForTier()` (already existed, previously only used for the dashboard badges) turns that into `{shiftManagement, appointmentManager}`.
- Tenants with **only one module** never see a switcher at all - "there's nothing to switch to, so it's just noise" - the calendar silently defaults to showing just that type (appointments-only or shifts-only), and the opposite type's create button ("+ Add appointment" / "+ Schedule shift") doesn't render either, consistent with not having bought that module. This is a real gating decision beyond what was literally asked ("gate the switcher") - extended the same gate to the create buttons too, since showing a button for a module the tenant hasn't licensed would be inconsistent/misleading. Flagging this as an interpretation, not a literal-only reading of the request.
- Tenants on **`BOTH`** get a three-way pill switcher (Appointments / Shifts / Both) next to the staff filter, defaulting to "Both". Switching filters the calendar's events client-side (no refetch - same data, just `isShift()`-based filtering) and also filters which legend entries show (no "Shift" dot when viewing appointments-only, etc).
- This only gates by **feature tier** (which modules), not billing plan (free/one-time/subscription) - free vs. paid only ever affected usage caps (`src/lib/licensing/limits.ts`), never which modules are visible, so there was nothing billing-plan-related to gate here despite the original TODO note mentioning "free/paid."
- **Verified live** (this one actually is curl-checkable, unlike most calendar UI): confirmed the server correctly resolves and serializes `licenseTier: "SHIFT_MANAGEMENT"` into the RSC payload for a shift-only tenant, and `licenseTier: "BOTH"` for a both-tier tenant - the server-side half of this feature is genuinely confirmed, not just code-reviewed. The client-side switching/filtering behavior itself still carries the usual not-yet-browser-tested caveat.

### App-wide Helvetica, delayed/animated create-panel entrance, calendar back on top
Three requests in one pass:

- **Helvetica.** Asked for on the Dashboard specifically, then broadened to "other places too." Rather than scoping a font class to one page, changed the global `body` rule in `globals.css` from `Arial, Helvetica, sans-serif` to `Helvetica, Arial, sans-serif` - Helvetica isn't distributable as a web font (no Google Fonts equivalent, unlike Oswald), so this is the standard approach: list it first and let Arial (metrically near-identical) carry systems that don't have real Helvetica installed. Cascades to every page automatically; the one deliberate exception is the calendar toolbar, which keeps its own Oswald font (`CalendarToolbar`) untouched - that was a separate, explicit earlier request ("gothic font," bold) and swapping it out wasn't part of this ask.
- **Slot selection now holds before the form appears.** Previously, selecting a slot on the calendar called `setCreating(...)` and the create panel rendered instantly - "too snappy." The draft ghost event on the grid still appears immediately (that's the part that should be instant - it's the visual confirmation of what you selected), but the panel itself is now wrapped in a `transition-all duration-500` container gated by a new `panelVisible` state that only flips true ~800ms after a creation starts (`creatingOpen` effect, keyed on whether `creating` is open/closed rather than the full object - drag-adjusting the draft's time range shouldn't re-trigger the hold every time). The panel fades and slides up into place instead of popping in. Hit a `react-hooks/set-state-in-effect` lint error restructuring this the first way (an early-return branch calling `setPanelVisible(false)` directly in the effect body); fixed by moving that reset into the effect's cleanup function instead, which runs when `creatingOpen` flips back to false.
- **Layout order revisited twice in the same session.** First pass moved the calendar grid itself above the controls row (reverting an earlier "buttons above calendar" change). Immediate follow-up correction: the buttons should stay above the calendar, but the create-panel "fillout" should be below it - a different split than either prior layout. Final order: staff-filter/switcher/granularity/create-buttons row → legend → calendar grid → the (now-animated) create panel → appointment detail panel. So the buttons/filters/legend sit above the calendar as before, but filling out a new entry now happens below the grid instead of squeezed between the buttons and the calendar.

**Verified live**: signed up a fresh tenant, confirmed both `/dashboard` and `/calendar` still render 200, and confirmed the dashboard's served HTML contains the updated `Helvetica,Arial,sans-serif` font stack. The panel's hold/fade timing and the reordered layout are correct by code review and build/lint/test/`tsc` clean, but not yet clicked through in a real browser - same standing caveat as the rest of this calendar's client-side UI.

### Company logo also shown on the Dashboard
Follow-up to the admin-only company logo feature: it previously only showed as a small 6x6 icon in `AppHeader`, present on every page but easy to miss. Added a larger (14x14, bordered, white-backed) rendering of the same `tenant.logoDataUrl` next to the business-name heading on the Dashboard page body itself - no new query needed, `dashboard/page.tsx` already fetches the full `Tenant` row. Renders conditionally (nothing shown when no logo is set, same as the header). **Verified live**: uploaded a real logo as ADMIN, confirmed the dashboard page's server-rendered HTML contains the logo's data URL in both places (header and the new dashboard-body placement).

### Scheduling conflict now a prominent banner, not a small error line
Small TODO item on `CreateEntryPanel`. A real double-booking (the Postgres `EXCLUDE` constraint rejecting an overlapping time for the same staff member - still the actual source of truth, unaffected by the earlier "allow deliberate overlap" selection work, which was about letting a *new selection* start on top of an existing event on the grid, not about weakening the DB constraint) used to just set the same small `error` string shown for every other validation failure, rendered as one red line near the submit button - easy to miss, especially once the panel has grown tall (new-client form open, estimates visible, etc).

- `fetchJson` now throws a new `ApiError` (message + HTTP `status`) instead of a plain `Error`, so callers can tell a real 409 conflict apart from any other failure without parsing message text. Exported alongside `fetchJson` for reuse.
- `CreateEntryPanel` tracks a separate `conflict` boolean (true only when the caught error is `ApiError` with `status === 409`) alongside the existing `error` string - a plain validation error ("Pick a staff member," "Address and confirm address don't match," etc.) still only gets the small inline line; a real conflict additionally renders a bordered red banner (icon, "Scheduling conflict" heading, the server's message, and a one-line suggestion to adjust the time or staff) at the **top** of the panel, right under its header - above the Start/End fields rather than below everything - and scrolls itself into view (`scrollIntoView`) in case the panel has grown past the viewport.

**Verified live**: created a real appointment, then attempted a second one with the identical staff member and time range against the actual DB constraint (not mocked) and confirmed the server returns `409` with `"That time overlaps another appointment for this staff member."` - the exact path this banner is built to catch. The banner's rendering, positioning, and scroll-into-view behavior are correct by code review and build/lint/test/`tsc` clean, but not yet clicked through in a real browser - same standing caveat as the rest of this calendar's client-side UI.

### "View only" link moved into the top nav bar
Small TODO item: `AppHeader` now has a "View only" link (→ `/calendar/view`) for every role, next to "Calendar" - previously this route was only reachable via a one-off "Open view-only link" text link on the `/calendar` page body itself, easy to miss and not available from anywhere else in the app. Removed that now-redundant body link from `calendar/page.tsx` rather than leaving both (and the now-unused `Link` import with it). **Verified live**: a fresh tenant's `/calendar` page no longer contains the old inline link text, the nav bar's "View only" link points at the right href, and `/calendar/view` itself still renders 200.

### Company logo, admin-only
Added `Tenant.logoDataUrl` (`prisma/migrations/20261001163430_add_tenant_logo`) - stored as a `data:image/...;base64,...` URL directly in Postgres rather than a file path, since there's no blob storage wired up anywhere in this stack and a small logo comfortably fits a `TEXT` column.

- **New admin-only route** `POST`/`DELETE /api/admin/logo` (`requireRole(["ADMIN"])`, same pattern as every other tenant-wide setting) - `POST` validates the payload is actually a `data:image/(png|jpeg|webp|svg+xml);base64,...` string under ~700KB (server-side, independent of whatever the client already checked) before writing it; `DELETE` clears it back to `null`.
- **New "Company logo" card** on the User manager page (`LogoSettings.tsx`) - file picker (hidden `<input type="file">` triggered by a styled button, accept limited to png/jpeg/webp/svg, client-side pre-check caps the file at 500KB before even reading it), converts the selected file to a data URL via `FileReader` and POSTs it, with a live preview, a "Replace logo" / "Remove" pair once one is set, and `router.refresh()` after either so the header picks up the change immediately rather than only on the next full navigation.
- **Shown in `AppHeader`** next to the business name (next to, not replacing, the ShiftUp platform mark - this is the tenant's own branding, not a reskin of the app's identity). Every one of the 7 pages that render `AppHeader` (dashboard, calendar, calendar/view, calendar/roster, time-off, billing, admin/users) already fetches the full `Tenant` row via `tx.tenant.findUnique` with no `select` clause, so adding the column made `logoDataUrl` available everywhere for free - the only change needed per page was passing `logoUrl={tenant.logoDataUrl}` through, no new queries.
- **Admin-only is enforced server-side**, not just by hiding the UI - the API route itself rejects non-admins regardless of what a client sends.

**Verified live** end-to-end via curl against a fresh signup: uploaded a real base64 PNG as ADMIN, confirmed the exact data URL appears in the server-rendered dashboard HTML (proving the server-side propagation through every page, not just the admin page); deleted it and confirmed the data URL disappears from that same render; confirmed an EMPLOYEE gets a 403 from both `POST` and `DELETE`; confirmed the server rejects a malformed string and a disallowed mime type (`text/html`) with 400s. The file-picker UI itself, the live preview, and the immediate header refresh are correct by code review and build/lint/test/`tsc` clean, but not yet clicked through in a real browser - same standing caveat as the rest of this app's client-side UI.

### Manager drill-down roster view
New route `/app/[tenantSlug]/calendar/roster` (`roster/page.tsx` + `RosterView.tsx`), linked from `AppHeader` as "Roster" for ADMIN/MANAGER/SUPERVISOR only (EMPLOYEE/CUSTOMER get redirected to `/calendar` server-side - see the TODO note on this being a hardcoded role check rather than running through the configurable permission matrix, since there's no existing permission key for it).

- **One row per employee**, each showing a count summary ("N appointments · M shifts") and a wrapped row of color-coded chips (reusing the exact same `COLORS`/`isShift` the main calendar uses - now exported from `SchedulingCalendar.tsx` for this) for everything that staff member has in the selected Day/Week range, sorted by start time. Cancelled items render struck-through in the cancelled color, same convention as the main calendar.
- **Day/Week toggle + Today/Back/Next**, independent of the main calendar's own controlled date/view state - this is a separate lightweight nav, not a reuse of `CalendarToolbar`.
- **Data**: a single `GET /api/appointments?start=&end=` call (the same tenant-wide, `VIEW_APPOINTMENTS`-gated endpoint the main calendar already uses) plus `GET /api/staff`, grouped client-side by `staffId` - no new API route needed for the listing itself.
- **"Drill down into that employee's full calendar"** (the literal ask, not just a filter): each row has a "View full calendar →" link to `/calendar?staff=<id>`. `SchedulingCalendar` gained an `initialStaffId` prop that seeds its existing `staffFilter` state, and `calendar/page.tsx` now reads a `?staff=` search param and passes it through - so the drill-down lands you in the real, full-featured calendar (drag/resize, create, detail panel, everything) already focused on that one person, rather than a second, more limited calendar being built from scratch.

**Verified live** end-to-end via curl against a fresh signup: ADMIN gets 200 on `/calendar/roster`; an EMPLOYEE staff account gets a 307 redirect to `/calendar` (confirmed by following it); created a real appointment for a staff member and confirmed `GET /api/appointments` returns it with the `staff` object the roster groups by; confirmed `/calendar?staff=<id>` still renders 200. The chip rendering, Day/Week toggle, and drill-down link itself are correct by code review and build/lint/test/`tsc` clean, but not yet clicked through in a real browser - same standing caveat as the rest of this calendar's client-rendered UI.

### Persistent, draggable slot selection + deliberate overlap + time-grid granularity
Three related requests on the create-slot flow in `SchedulingCalendar.tsx`:

- **Selection no longer disappears.** react-big-calendar's own click-drag "selection" highlight is only ever momentary - it vanishes the instant `onSelectSlot` fires. The pending create/shift entry is now rendered as a real, dashed "ghost" event on the grid (`DRAFT_EVENT_ID`/`DRAFT_RESOURCE`, appended to the events array only while `creating` is set) instead of relying on that highlight. It stays visible the whole time the create panel is open, and can be dragged or resized directly on the calendar like a normal event - `onEventDrop`/`onEventResize` special-case the draft id to update `creating.start`/`creating.end` locally instead of PATCHing the API. `draggableAccessor`/`resizableAccessor` allow this for the draft whenever `canCreate` is true, independent of `canEdit` (dragging a not-yet-created entry isn't "editing an appointment").
- **Start/end are a single source of truth.** `CreateEntryPanel` used to seed its own local `startTime`/`endTime` state once from a `slot` prop, so a later drag on the calendar couldn't reach it. Lifted that state up into the parent's `creating` object - the panel now takes `start`/`end`/`onRangeChange` props directly, so dragging the ghost event on the grid and editing the datetime-local inputs in the panel both read and write the same value and stay in sync either way ("easily adjustable" from either side).
- **Overlap is now possible on purpose.** `selectable={canCreate ? "ignoreEvents" : false}` (was a plain boolean) - this is react-big-calendar's own documented mechanism for letting a new slot selection be drawn starting on top of an existing event, rather than the existing event capturing the click/drag. A fresh click-drag while already creating repositions the same draft (same mode) instead of discarding it.
- **Time-grid granularity switcher** (separate request, same session): a pill control (1 hr / 30 min / 15 min) next to the staff filter sets `step`/`timeslots` on the calendar (`timeStep` state, `step={timeStep} timeslots={1}`) - changes the Week/Day view's left-hand time-gutter row size. No effect in Month view (no time gutter there).

All four `tsc --noEmit` / `npm run lint` / `npm test` / `npm run build` checks are clean. **Not yet browser-verified** - same standing caveat as the rest of the calendar's client-side interaction: this is correct by code review and by reading react-big-calendar's own `selectable`/`draggableAccessor`/`resizableAccessor`/`step`/`timeslots` type definitions and the drag-and-drop addon's source directly (not guessed), but dragging/resizing the draft event, the overlap behavior, and the granularity switch itself still need to be clicked through in a real browser.

A small follow-up in the same area: added a **"Close" button next to "+ Add appointment"/"+ Schedule shift"** (only rendered while `creating` is set) that calls `setCreating(null)` - so dismissing the create panel and getting back to a clear view of the calendar doesn't require scrolling down to the panel's own "Close" link. Same not-yet-browser-tested caveat.

### Admin-configurable appointment form, client autocomplete, and Google Maps navigation
Three related requests, all touching `CreateEntryPanel`/`AppointmentDetailPanel` in `SchedulingCalendar.tsx`:

- **Client requirement is now admin-configurable.** Added `Tenant.requireClientForAppointments` (`prisma/migrations/20261001161138_...`, default `true`) and a new `GET/PUT /api/tenant-settings` route - `GET` is readable by any signed-in tenant member (needed by whoever is actually filling out the form, not just the admin who set it), `PUT` is ADMIN-only, same reasoning as the permission matrix. A new "Appointment & shift form" card on the User Manager page (`AppointmentFormSettings.tsx`) toggles it. Appointments without a client were already technically possible before this (the old free-text client-name field was always optional) - what's new is this is now a deliberate, admin-visible setting instead of an accidental gap, and `CreateEntryPanel` actually blocks submission when the tenant requires a client and none is selected.
- **Client field replaced with a real search-and-select combobox.** The old single free-text "Client name" input (which silently created a brand-new `Client` row on every submit, with no lookup of existing ones - the TODO item "No client search/dedup" this closes out) is now a typeahead: typing filters the tenant's already-loaded client list client-side on every keystroke (same loaded-once-then-filter pattern as the staff/service-type dropdowns), a dropdown lists matches to click-select, and a "+ Add new client" row (gated on `CREATE_CLIENTS`, same as staff's inline add) opens an inline new-client form. Closes on outside click via the same ref+mousedown pattern as the toolbar's month/year popover.
- **New client fields: phone, address, email (name already existed).** Added `Client.address` (same migration as above). The inline new-client form collects name/email/phone/address, all but name optional.
- **Address confirmation.** A "Confirm address" field appears (progressive disclosure - only once an address has actually been typed) and must match the address field exactly before submit; mismatches get a red border and a blocking validation error, the same pattern as a confirm-password field elsewhere in the app.
- **"Open in Google Maps" on in-person appointments.** Added `Tenant.enableMapsNavigation` (same migration, default `true`), toggled from the same new User Manager card. When on, an in-person appointment's address in `AppointmentDetailPanel` gets an "Open in Google Maps" link (`https://www.google.com/maps/dir/?api=1&destination=<address>`, opens in a new tab) - never shown for online meetings (nothing to navigate to) or when the admin has turned it off.
- **Scoping note**: "appointment" vs. "shift" is purely a UI-layer distinction in this codebase (both are `Appointment` rows, differentiated only by whether `clientId` is set - see the schema comments) - there's no `kind` column to check server-side. `requireClientForAppointments` is therefore enforced in the form layer, where the mode concept actually exists, the same way estimate-visibility and location fields already are; it is not re-enforced in `POST /api/appointments` itself, consistent with how this boundary already works elsewhere in the app.

**Verified live** (server-side, via curl against a fresh signup): `GET /api/tenant-settings` returns the correct defaults (`true`/`true`); `PUT` with a single key does a genuine partial update, confirmed by re-fetching after two separate toggle calls; `POST /api/clients` persists `address` and returns it; `GET /api/clients` lists it back; `/calendar` and `/admin/users` both still render 200 for the test tenant. The client-side combobox interaction, the new-client form, the address-confirmation validation, and the Maps link itself are correct by code review and build/lint/test/`tsc` clean, but - same standing caveat as the rest of this calendar's client-rendered UI - not yet clicked through in a real browser.

### Calendar color key, custom color tags, and holidays — backend + admin UI built, calendar integration NOT done
Started from a bundled request ("personalize the color key," "add custom color events," "toggle federal holidays," "add custom holidays"). **Important**: this was interrupted mid-build by a context/session change before the last piece (actually wiring it into `SchedulingCalendar.tsx`) happened. Everything below exists and works; the calendar itself doesn't use any of it yet - see the "Not done" list at the bottom before assuming this feature is live.

**Schema** (`prisma/migrations/20261001170636_add_event_colors_tags_holidays`, RLS added by hand same as every other new tenant-scoped table):
- `Tenant.eventColors` (`Json?`) - sparse `{appointment, shift, completed, noShow, cancelled}` hex overrides layered on hardcoded defaults.
- `Tenant.showFederalHolidays` (`Boolean`, default `true`).
- New `EventTag` model (tenantId, name, color) - custom named color tags, e.g. "VIP".
- New `Holiday` model (tenantId, name, date, recurring) - tenant-added custom holidays; federal holidays are computed, never stored.
- `Appointment.tagId` (nullable FK to `EventTag`, `onDelete: SetNull`).

**Lib** (pure logic, unit-tested where it matters):
- `src/lib/colors/eventColors.ts` - `EVENT_COLOR_KEYS`/`DEFAULT_EVENT_COLORS`, `resolveEventColors()` (merges stored overrides over defaults, defensive against malformed JSON), `colorTripleFromHex()`/`buildColorTriples()` (derives `{bg, border, text}` from a single admin-picked hex - border ~15% darker, text white/near-black chosen by YIQ luminance for contrast).
- `src/lib/holidays/federal.ts` - `getFederalHolidays(year)` computes the actual 11 US federal holidays from their statutory rules (nth-weekday-of-month math, not a hardcoded date list, so they're correct every year). `federal.test.ts` hand-verifies every 2026 date against the real calendar - all pass.

**API**: `GET/PUT /api/tenant-settings` extended to carry `eventColors`/`showFederalHolidays` (PUT does a real merge for `eventColors` - sending one key doesn't clobber the others). `GET/POST /api/event-tags` + `DELETE /api/event-tags/[id]` (creation allowed for anyone with `CREATE_APPOINTMENTS`, like the inline client-add pattern; deletion is ADMIN-only). `GET/POST /api/holidays` + `DELETE /api/holidays/[id]` (ADMIN-only to mutate). `POST /api/appointments` and `PATCH /api/appointments/[id]` both accept `tagId` now; `listAppointmentsInRange`/`getAppointmentById` in `src/modules/scheduling/service.ts` include the `tag` relation.

**Admin UI** (all on the User Manager page): `EventColorSettings.tsx` (5 color pickers + reset-to-default), `EventTagManager.tsx` (list + add/delete custom tags), `HolidaySettings.tsx` (federal-holiday toggle + custom holiday list/add/delete). All follow the same load/save/error pattern as the existing settings cards.

**Verified so far**: `tsc`/lint/test/build all clean with this code in the tree (confirmed again after the session gap). The federal holiday date math is unit-tested and correct. The admin CRUD routes have NOT yet been curl-verified live (unlike most other backend work this session) - that's worth doing before trusting them further.

**Not done - this is the real next step**: `SchedulingCalendar.tsx` doesn't import or use anything above. Concretely still needed:
- Replace the hardcoded module-level `COLORS`/`LEGEND` with tenant-fetched, `buildColorTriples`-derived versions (and thread the result into `StatusPill`/`AppointmentDetailPanel`, which are separate components reading the old module constant directly - probably needs a `colors` prop).
- `RosterView.tsx` currently imports a static `COLORS` export from `SchedulingCalendar.tsx` - that export won't exist once colors become tenant-dynamic, so `RosterView` needs to fetch `/api/tenant-settings` and compute its own colors via the same shared `buildColorTriples` helper.
- Fetch `/api/event-tags` into the calendar; add a tag picker to `CreateEntryPanel` (with inline "+ add new tag," same UX as staff/client) and a way to view/change a tag in `AppointmentDetailPanel`; extend the legend to include custom tags.
- Fetch `/api/holidays`, merge with `getFederalHolidaysInRange()` for the visible range, and actually render them - a `dayPropGetter` tint on holiday cells plus a small "holidays in view" list is the planned approach (holiday *names* aren't easily labelable directly on react-big-calendar's grid without deeper custom date-cell components, which wasn't attempted).

### Racing-theme display font (headings, nav brand, calendar toolbar)
Per request ("racing theme, mostly the font, don't change colors"), picked the two-tier option: a bold display face on headings/nav/toolbar only, body text untouched. **Orbitron** (`next/font/google`, weights 500/700/900, `--font-orbitron` → `--font-display` theme token in `globals.css`) replaces the calendar toolbar's old dedicated Oswald instance (`CalendarToolbar` in `SchedulingCalendar.tsx` now just uses the shared `font-display` class, removing the separate Oswald import entirely) and is applied via one global `h1, h2, h3 { font-family: var(--font-display), ... }` rule in `globals.css` - since every page/card title in the app already uses semantic `<h1>`-`<h3>` tags, this covers page titles, section headers, and card titles everywhere without touching each page's JSX. Also applied directly to `AppHeader`'s "ShiftUp" nav wordmark (a `<span>`, not a heading tag, so it needed its own `font-display` class). Body copy, buttons, and form fields are untouched - still Helvetica/Arial. Colors unchanged, as requested.
**Verified**: `tsc`/lint/test/build all clean; confirmed live that the `orbitron` font variable loads on `<html>` and the compiled CSS contains both the `.font-display` utility and the `h1,h2,h3` rule.

**Follow-up same day**: user liked the overall look but not Orbitron on the calendar toolbar's month/year heading specifically - removed `font-display` from the `CalendarToolbar` wrapper entirely (it now just falls through to the default Helvetica/Arial body font, not a third font family) rather than picking another display face for that one spot, since "basic professional" was the explicit ask there. Orbitron stays everywhere else (other headings, nav brand). `tsc`/lint/test all reverified clean after the change.

**Second follow-up same day**: same ask extended to the "Calendar" and dashboard business-name `<h1>`s - rather than add a special-case exception to the global `h1,h2,h3` rule, added a parallel `--font-body` theme token (same Helvetica/Arial stack as `body`) and its `font-body` Tailwind utility, applied directly to those two `<h1>`s (a class selector reliably beats the `h1,h2,h3` element-selector rule regardless of source order). Every other heading (card titles, nav brand) keeps Orbitron.

**Third follow-up same day - scope narrowed to just the logo**: after seeing it live, decided Orbitron should stay *only* on the `AppHeader` nav wordmark ("ShiftUp") and nothing else - every other heading should match the calendar toolbar's plain font. Removed the global `h1,h2,h3 { font-family: var(--font-display) }` rule entirely (headings now just inherit the body's Helvetica/Arial naturally, same as before any of this font work started) and deleted the now-unnecessary `--font-body` token/utility and its two call sites (Calendar/Dashboard `<h1>`s), since reverting to the plain font is the default again, not an opt-out. `font-display` now has exactly one usage in the whole codebase - the `AppHeader` wordmark. `tsc`/lint/test/build all clean; confirmed in the compiled CSS that the `h1,h2,h3` rule is gone and `.font-display` survives only as a standalone utility.

### Dashboard: "Your access" card made more prominent, calendar view/time controls grouped into a settings box
Two small UI requests in the same pass:
- **Dashboard "Your access" card** - was a small muted gray label (`text-sm font-medium text-gray-500`) easy to miss sitting between the feature-tier badges and the stat cards. Bumped to a real `text-lg font-semibold` heading with a one-line subtitle ("What your role can see and do in this account.") and a light primary-tinted background/border (`border-primary-100 bg-primary-50/40`) instead of the plain white card used elsewhere on the page, so it visually stands out as the answer to "what can I do here" rather than blending in as just another card.
- **Calendar page's staff/view-type/time-grid controls** - previously three separate controls (a native `<select>` and two pill-button groups) floating loosely in the header row next to the create buttons. Wrapped them in one bordered `bg-gray-50` panel with a small uppercase micro-label per control ("Staff" / "Calendar" / "Time grid") so the cluster reads as one cohesive settings box; the pill groups' active state also switched from a plain white highlight to a filled `bg-primary-500` to read more like a real toggle. The create buttons stay outside this box, unchanged - that's an actions area, not a settings panel.

Both are pure Tailwind/markup changes, no new data or logic. `tsc`/lint/test/build all clean. Not yet browser-verified - same standing caveat as the rest of this app's client-rendered UI.

### AM/PM time-grid toggle, smooth scroll to the create panel, and a renamed/recolored Cancel button
Three small requests on `SchedulingCalendar.tsx`, same session as the font/settings-box work above:
- **AM/PM toggle**: a third pill control (next to the staff/calendar-type/time-grid-granularity ones, inside the same settings box) flips the Week/Day view's time gutter between showing 12am-12pm and 12pm-12am via react-big-calendar's `min`/`max` props (only the time-of-day portion of these Date objects is read - the date part is ignored and merged onto whichever day is actually rendered, so a fixed reference date works). No effect in Month view, same as the existing granularity control.
- **Smooth scroll to the create panel**: previously, selecting a slot or hitting "+ Add appointment"/"+ Schedule shift" would fade/slide the create panel in below the calendar grid, but on a tall page the user had to notice and scroll down manually. Added a ref on the panel's wrapper and a `scrollIntoView({ behavior: "smooth", block: "nearest" })` call that fires the moment the panel starts its existing fade/slide-in (`panelVisible` flips true) - so the selection, the panel's own entrance animation, and the page scroll all read as one continuous "slide over to the form" motion rather than an instant jump.
- **"Close" → "Cancel", styled Red Sox red (`#BD3039`)**: both places that dismiss an in-progress create/shift entry - the button next to "+ Add appointment"/"+ Schedule shift" and the small link inside the create panel's own header - renamed to "Cancel" and recolored. The *other* "Close" button (on `AppointmentDetailPanel`, closing the view of an already-existing appointment) was deliberately left alone - that's not canceling anything, so renaming it would be misleading.

`tsc`/lint/test/build all clean. Not yet browser-verified - same standing caveat as the rest of this calendar's client-rendered UI.

**Follow-up same day**: the dashboard's three feature-tier/billing-plan badges ("Shift management", "Appointment manager", "Free plan") were `rounded-full` pills styled almost identically to real buttons elsewhere in the app but did nothing when clicked - user flagged this as confusing. Moved them inside the "Your access" card as a labeled "Plan" row of plain bordered boxes (`rounded-lg border`, not `rounded-full`, no button-like gradient/hover) rather than turning them into actual buttons, since there's no obvious action a click on "Shift management" should take - they're status info, now presented as such. The access-summary list moved below a divider in the same card to make room. `tsc`/lint/test/build clean.

### Calendar now consumes tenant colors, tags, and holidays
Picked up the one item flagged as "almost certainly next" in the previous handoff - the backend/admin UI for event colors, custom tags, and holidays existed but `SchedulingCalendar.tsx` never read any of it. Wired up:
- **Tenant colors**: `SchedulingCalendar` and `RosterView` both fetch `/api/tenant-settings` and derive their event colors via the shared `buildColorTriples(resolveEventColors(...))` (each fetches its own settings independently per the plan in the previous handoff - no cross-component dependency). The old hardcoded module-level `COLORS` constant is gone; a new shared `resolveEventColor()` in `src/lib/colors/eventColors.ts` picks the right color for an event (terminal status > custom tag > appointment/shift default) and is used by both components plus the legend, `StatusPill`, and `eventPropGetter`.
- **Custom tags**: `SchedulingCalendar` fetches `/api/event-tags`. `CreateEntryPanel` gets a tag picker with an inline "+ Add new tag" (name + color, same UX pattern as the inline staff/client add), and `AppointmentDetailPanel` gets the same picker to view/change an existing appointment's tag (gated on `EDIT_APPOINTMENTS`, same permission the PATCH route already required for `tagId`). The legend now lists each tenant's custom tags alongside the 5 built-in colors.
- **Holidays**: added `getCustomHolidaysInRange()` to `src/lib/holidays/federal.ts` (handles `recurring` vs one-off per the Holiday model's semantics - a recurring holiday's stored year is ignored, a one-off only fires on its exact date), unit-tested alongside the existing federal-holiday tests. The calendar merges this with `getFederalHolidaysInRange()` (respecting the tenant's `showFederalHolidays` toggle), tints matching day cells via a new `dayPropGetter`, and lists "Holidays in view" as a small line under the legend.

**A real bug found and fixed along the way**: `PUT /api/tenant-settings`'s `eventColors` validation used `z.record(z.enum(EVENT_COLOR_KEYS), z.string())`, which in this project's Zod v4 requires **every** enum key to be present in the payload - but `EventColorSettings.tsx` (the admin color-picker UI) has always sent one key at a time (`{ eventColors: { appointment: "#..." } }`). This meant **every color save from the admin UI was silently failing with a 400** since that card was first built - confirmed live via curl (`{"error":"Invalid input"}`) before the fix. Switched to Zod v4's `z.partialRecord()`, which allows a sparse object, and reverified live: a single-key PUT now succeeds and correctly leaves the other four colors untouched (the existing merge-over-stored-overrides logic in the route was already correct, only the input validation was wrong).

**Verified live** via curl against a fresh signup: `PUT /api/tenant-settings` with a single-key `eventColors` payload now returns 200 with the merged settings (previously 400); `POST /api/event-tags` creates a tag and returns it; `POST /api/holidays` creates a one-off holiday and `GET /api/holidays` lists it back. `tsc --noEmit` / `npm run lint` / `npm test` (15 tests now, up from 7 - added `eventColors.test.ts` for the color-resolution precedence logic and extended `federal.test.ts` for `getCustomHolidaysInRange`) / `npm run build` all clean. **Not yet browser-verified**: the tag picker, the inline new-tag form, and the holiday day-cell tinting/list are correct by code review and build/lint/test/`tsc` clean, but not yet clicked through in a real browser - same standing caveat as the rest of this calendar's client-rendered UI.

### Billing redesigned as a pricing deck (Free / Lifetime / Subscription)
Replaced the two-button upgrade panel with a proper 3-card pricing deck (`src/app/(admin)/app/[tenantSlug]/billing/PricingDeck.tsx`, replacing the deleted `UpgradeButtons.tsx`) — Free, Lifetime (one-time), and Subscription side by side, each with its own price, feature bullets, and framing ("one-time · yours forever" vs "billed monthly · cancel anytime"). The tier picker (shift management / appointment manager / both) sits above the deck and drives both the prices shown and the feature bullets listed in each card (`FEATURES_BY_TIER`) — pick "Shift management" and all three cards list shift-specific bullets instead of generic ones. `COMMON_FEATURES` lists what's true regardless of tier (double-booking protection, configurable roles). All bullets describe real, already-built capabilities, not aspirational marketing claims (no "priority support" or similar - nothing like that exists yet). `formatCents()` also now drops `.00` for whole-dollar prices ($199 instead of $199.00). **Verified live**: all three cards render with correct labels, prices, and tier-specific feature text.

### Free tier cap lowered, billing tier selection, dashboard access summary
- Free plan appointment cap lowered from 20 to **10** per rolling 30 days (`src/lib/licensing/limits.ts`).
- **Billing now lets a tenant buy just shift management, just appointment manager, or both** — independent of whichever tier they're exploring for free. `POST /api/billing/checkout` now takes a `tier` param (not inferred from the existing License), and the webhook writes the *purchased* tier onto the License, not just billingPlan/status. The billing page's upgrade panel has its own tier picker (mirrors the signup page's) feeding into the existing buy/subscribe buttons, with per-tier pricing recomputed client-side as the selection changes.
- **Dashboard now explains what the signed-in user can actually do** — a "Your access" card computed from `hasPermission()` across all 18 permission keys, grouped into Staff/Services/Clients/Appointments/Job estimates, rendered as plain-language action lists (e.g. "Appointments: view, create, edit, cancel" or "Job estimates: no access"). ADMIN/SUPERADMIN just get "full access to everything" rather than an itemized (and always-true) list. **Verified live**: admin sees the full-access message; a plain EMPLOYEE sees "view" on most categories and "no access" on Job estimates, matching the default permission matrix exactly.
- Toned down the gradient on primary buttons (added a `--color-primary-550` token, roughly halfway between 500 and 600) after it read as too glossy — same gradient direction, tighter color range.

### UI polish pass
Every page had its own ad-hoc links and bare, unstyled layout - this pass added real visual hierarchy and a shared chrome:
- `src/components/AppHeader.tsx`: one shared branded header/nav (logo mark, active-link highlighting, sign-out) used across dashboard/calendar/admin/billing - replaces the duplicated inline `<nav>` each page had.
- Landing page got a real hero section + feature cards; signup/login got a centered card with shadow instead of a bare form; dashboard got gradient stat cards (staff count, upcoming appointment count, both live-queried) instead of plain text.
- `react-big-calendar`'s default look was themed in `globals.css` (toolbar buttons, today-highlight, event colors, slot-selection) to match the dodger-blue palette instead of clashing with it.
- Consistent language throughout: `rounded-xl`/`rounded-lg` instead of `rounded-md`, `shadow-sm`/`shadow-md` + `transition-all` on interactive surfaces, gradient (`bg-linear-to-r/br`) on primary actions.
- **Tailwind v4 note**: use `bg-linear-to-*`, not `bg-gradient-to-*` - the IDE's diagnostics flagged this as the non-canonical name mid-session; worth remembering for any new gradient classes.
- **Verified live**: all 7 pages (`/`, `/signup`, `/login`, dashboard, calendar, admin/users, billing) return 200 after the restyle, and the dashboard's stat cards confirmed rendering real queried values, not placeholders.

### PayPal support (Stripe-native, no separate integration)
User asked about PayPal/Venmo. PayPal is built into Stripe Checkout - added `allowed_payment_method_types: ["card", "paypal"]` to the one-time checkout path in `src/app/api/billing/checkout/route.ts` (a filter on Stripe's dynamically-eligible methods, not a force-enable - PayPal still needs turning on in the Stripe Dashboard's Payment Methods settings to actually appear). Left off the subscription path pending verification against a live account. **Venmo was explicitly not built** - it's a separate Braintree/PayPal integration with its own webhooks, a second payment stack for a consumer P2P method, not worth the complexity here; told the user this rather than building it.

### Small fixes along the way
- Signup now has a **confirm password** field (client-side match check before submitting).
- Fixed a hydration-mismatch console error caused by the Grammarly browser extension injecting `data-gr-ext-installed`/`data-new-gr-c-s-check-loaded` onto `<body>` — added `suppressHydrationWarning` to that one element in `src/app/layout.tsx` (the documented fix for this exact, extension-caused case; doesn't mask real mismatches in children).
- Relabeled the signup "Booking page URL" field to "Your account URL" with honest helper text — it currently only becomes the internal staff login URL (`/app/[slug]/...`); there's no public self-service booking page at that slug yet (that's Phase 2).

### A real security bug found and fixed this session
`GET /api/staff` originally did `include: { user: true }`, which serialized the staff member's **`passwordHash` straight into the JSON response**. Caught by actually reading the curl output rather than just checking status codes. Fixed to `select: { id, email, role }` only. **Worth specifically re-checking any future route that includes a `User` relation** — this class of bug (accidentally serializing the whole related record) is easy to reintroduce.

### Username login, job-estimate unit toggle, permission-matrix redesign, and a batch of UI polish
A long run of smaller requests in one session, grouped here rather than one entry each:

- **Login accepts username or email.** Added `User.username` (nullable at the DB level via a hand-written migration since existing dev rows have none - `String? @unique`, Postgres allows multiple NULLs under a plain unique index - but required going forward via Zod on every creation path). `isValidUsername`/`findUserByUsername`/`findUserByEmailOrUsername` in `src/modules/identity/service.ts`. Every account-creation surface now has a required Username field: signup, `StaffManager.tsx`, and the calendar's inline "+ Add new staff member" form. `POST /api/auth/login` now takes `identifier` instead of `email` and tries username first, then email. **Verified live**: signed up with a username, logged in via username, logged out, logged in again via email, and confirmed a duplicate-username signup correctly 409s.
- **Job estimate is now an opt-in toggle, duration enterable in minutes/hours/days.** Both `CreateEntryPanel` and `AppointmentDetailPanel`'s estimate fields are hidden behind an "Include a job estimate" checkbox instead of always showing (unchecking + saving clears a previously-set estimate). Duration is a value + unit selector (`DurationUnit` = minutes/hours/days) converted to/from the single stored `estimatedDurationMinutes` int via `minutesToDuration`/`durationToMinutes`/`formatDuration` in `SchedulingCalendar.tsx` - no schema change, `minutesToDuration` picks the "nicest" unit that round-trips exactly (e.g. 120 → "2 hours") when seeding the edit form or formatting the read-only display.
- **Permission matrix (`PermissionMatrixEditor.tsx`) redesigned.** "What each role can do" is now one single aligned table (was separately-sized per-group tables that didn't line up) with group-header divider rows (Scheduling, Job estimates, Clients, Staff, Services, Time off) - grouping is **display-only**, not a new permission split: appointments and shifts still share one set of keys (`VIEW/CREATE/EDIT/CANCEL_APPOINTMENTS`), since a shift is just an `Appointment` row with no client, not a separate real distinction in the data model. Explicitly chose not to build a real appointment/shift permission split (would need new catalog keys + route changes) after asking - visual grouping only was the requested scope. "Who can see whom" got a clearer two-part header, a plain-language example, and a shaded/explained self-visibility diagonal. Both sections (plus `StaffManager.tsx`'s "Staff" section, previously un-boxed) now use the same `rounded-xl border border-gray-200 bg-white p-5 shadow-sm` card as every other Settings card.
- **"User manager" renamed to "Settings"** throughout (nav label, page heading, doc comments, ARCHITECTURE.md) - same route (`/admin/users`), just the label.
- **Site-wide compact footer.** `src/components/Footer.tsx`, mounted once in the root layout (`src/app/layout.tsx`) so it's under every page, including the authenticated app pages - deliberately a single slim bar (copyright, About, Feedback, a "Privacy & Terms coming soon" note), not a marketing-site block, since a multi-column footer repeated under every dashboard/settings page would be redundant with `AppHeader`'s own nav. "Feedback" is a `mailto:` to the user's own address; "About" links to a real `/about` page that's an intentional placeholder (content to be written later) rather than a dead link.
- **Smaller UI fixes**: the "Add staff" button (`StaffManager.tsx`) now matches "+ Add appointment"'s exact look (solid `bg-primary-500` + radial-gradient hover glow, was a static linear-gradient pill); the Calendar page shows the tenant's logo next to its "Calendar" heading (same treatment as the Dashboard) and the heading row is now centered; `AppHeader`'s background is now opaque dodger-blue-tinted (`bg-primary-50`, no more `bg-white/90 backdrop-blur`), with active nav pills switched to white-on-blue for contrast against the new background; the Week/Day calendar view's top-left corner cell (the time-gutter header spacer) now has a bottom border matching the day-header row next to it, closing what read as a disconnected empty box in the top-left - a mismatch between `.rbc-time-header-gutter` (no border by default) and `.rbc-time-header-content` (does have one) in react-big-calendar's own CSS.
- **AM/PM time-grid toggle, smooth scroll to the create panel, Cancel button** - see the earlier "AM/PM time-grid toggle..." entry above the font-scoping entries for these three.

`tsc`/lint/test (15, including the RLS integration test re-verified against the live Postgres container)/build all clean after every step. Not yet browser-verified beyond the curl-level auth checks above - same standing caveat as the rest of this app's client-rendered UI.

### Calendar layout-shift bug fixed
Asked the user to pick between the two real (non-feature-gap) bugs in the backlog - the create-panel layout shift and the no-op visibility matrix - and they picked the layout shift. Applied `scrollbar-gutter: stable` to `html` in `globals.css` per the diagnosis already written up in TODO.md (the create panel pushes page height past the viewport, the resulting scrollbar narrows content width, that reflow reads as the calendar shifting left). Confirmed compiled into the CSS output (`html{scrollbar-gutter:stable}`). `lint`/`build` clean. Still needs the user's browser confirmation that the shift is actually resolved.

### Calendar page: business name in the heading, and the time-grid's blank corner put to use
Two small follow-ups:
- The Calendar page's heading row (logo + "Calendar") now also shows the tenant's business name, same color weight as the heading itself (first pass used a muted gray "· {name}" treatment - removed the separator and the gray per follow-up feedback, now just the name in regular dark text next to "Calendar").
- The Week/Day view's previously-blank top-left corner cell (`.rbc-time-header-gutter`) now shows the viewer's local timezone abbreviation (e.g. "EST") via react-big-calendar's `timeGutterHeader` component-override slot - genuinely useful rather than just visually patched, since every time on this calendar renders in the browser's local timezone and nothing else on the page said so. Computed client-side only, deferred into a `setTimeout` inside the effect (same pattern as the existing `panelVisible` effect) both to avoid a server/client hydration mismatch (the server's timezone won't match the viewer's) and to satisfy `react-hooks/set-state-in-effect`.

`tsc`/lint/test/build all clean. Not yet browser-verified.

### Calendar layout-shift bug, actually fixed this time, and the nav bar split into Appointment/Staff dropdowns
The `scrollbar-gutter: stable` fix from earlier didn't actually resolve the shift - user confirmed it was still happening. Re-diagnosed: the `+ Add appointment`/`+ Schedule shift` action row conditionally mounted a third "Cancel" button only while `creating` was set, growing that flex group's content width and reflowing the settings box sitting next to it in the same `justify-between` row - correlates exactly with "shifts when you add either one," unlike the scrollbar theory. **Real fix**: the Cancel button is now always rendered (space always reserved) and toggles with the `invisible` class instead of being conditionally mounted, so its appearance can never change the row's width. Left the scrollbar-gutter fix in place too (harmless, may still matter for the page-height case).

Then built the nav-bar reorganization from TODO.md's already-decided spec: `AppHeader` replaced its flat link list with two dropdown menus - "Appointment pages" (Calendar pre-filtered via `?type=appointment`, View only) and "Staff pages" (Calendar pre-filtered via `?type=shift`, Roster, Time off, Settings) - plus Dashboard, Billing, and Sign out staying as plain top-level items, Billing deliberately kept separate from both groups per the user's explicit call. `SchedulingCalendar` gained an `initialCalendarType` prop (same pattern as the existing `initialStaffId`) that seeds the appointment/shift filter from the `?type=` query param, falling back to the tier-based default if the tenant's license doesn't actually include that type.

**One deliberate deviation from the original spec, flagged rather than silently applied**: did *not* gate the two dropdowns by feature tier (e.g. hiding "Appointment pages" entirely for a shift-only tenant), even though TODO.md's "still open" question suggested it. Settings (tenant-wide config: event colors, holidays, appointment-form settings, permissions) lives inside the "Staff pages" group only because Settings had to go somewhere, not because it's staff-specific - gating that whole group by `features.shiftManagement` would have hidden Settings entirely from an appointment-only tenant, a real functional regression, not just a visual one. Dropdown visibility is therefore unconditional for now; only the two `?type=` links' *content* reflects what the tenant actually has.

**Verified live**: signed up a fresh tenant, confirmed the rendered dashboard HTML contains "Appointment pages", "Staff pages", and "Billing" as separate nav entries. `tsc`/lint/test/build all clean. Dropdown open/close, click-outside-to-close, and the active-highlight logic are correct by code review but not yet clicked through in a real browser.

**Same-day follow-up**: moved Settings back out of "Staff pages" into its own plain top-level nav link (same treatment as Billing) per a direct follow-up request - it's tenant-wide config, not staff-specific, so it didn't belong exclusively grouped with staff pages either.

### Role display names made tenant-customizable (not full custom roles - see TODO.md)
The user asked to start on "custom roles" (motivated by the product being used across very different industries - police departments, plumbing companies, etc. were named as examples), then redirected mid-conversation to a smaller version first: keep the existing 4 configurable role slots (Manager/Supervisor/Employee/Customer) exactly as they are, but let a tenant rename each one's *display label*. Built that:

- **Schema**: `Tenant.roleLabels Json?` (sparse `{role: "Custom Label"}` override), same pattern as `Tenant.eventColors`. Migration applied, Prisma client regenerated (hit the usual Windows `EPERM` file-lock on the query engine DLL - killed the stray dev-server `node` processes per the documented fix, regenerated, restarted).
- **Lib**: `DEFAULT_ROLE_LABELS`, `isValidRoleLabel`, `resolveRoleLabels()` added to `src/lib/permissions/catalog.ts` (same defensive-merge shape as `resolveEventColors`).
- **API**: `/api/tenant-settings` GET/PUT extended to carry `roleLabels`, partial-update (one role renamed at a time) merged over the existing overrides - same convention as `eventColors`.
- **New Settings card**: `RoleLabelSettings.tsx` - one text input per role, defaulting to the plain English name, saves on blur.
- **Every place that previously hardcoded a role's display name now resolves through the tenant's labels**: `PermissionMatrixEditor.tsx`'s role-column headers, `StaffManager.tsx`'s add-staff role dropdown and the staff table's Role column, `SchedulingCalendar.tsx`'s inline "+ Add new staff member" role dropdown, and the Dashboard's "Signed in as ..." text (resolved server-side there, since `Tenant.roleLabels` was already being fetched with no extra query needed - same free-column pattern as `logoDataUrl` before it).

**A real bug found and fixed in the same pass**: the PUT handler's merge logic only handled `eventColors` - `roleLabels` updates were written as a raw replacement of the whole column instead of merging onto existing overrides, so renaming a second role would have silently erased the first rename. Caught via live curl testing (renamed EMPLOYEE, the response came back with *only* `EMPLOYEE` in `roleLabels`, missing the other three defaults), fixed by applying the identical merge-then-write pattern already used for `eventColors`, and reconfirmed live that two sequential renames both stick.

**Then clarified further**: the user confirmed this relabeling feature is explicitly **not** what "custom roles" means to them - the real ask is creating and deleting roles from the ground up, not renaming the fixed 4. That full scope (a real per-tenant `Role` table, `User.role`/`RolePermission`/`RoleVisibility` migrated off the fixed enum, deletion with existing-holders blocked until reassigned, ADMIN staying fixed/hardcoded) is logged in TODO.md's "Custom roles" entry, explicitly marked as still fully open - the relabeling work shipped here doesn't reduce that scope at all.

`tsc`/lint/test (15)/build all clean throughout. Verified live via curl (signup, two sequential role renames, confirmed correct merge behavior after the fix). Not yet browser-verified.

### Full custom-roles system (replaces the fixed 4-role enum)
The user started this twice before landing on the real scope: first asked for custom roles outright, got redirected to a smaller rename-only stopgap (`Tenant.roleLabels`, see the "Role display names made tenant-customizable" entry above) when the full rebuild looked like it'd derail the session, then explicitly confirmed that stopgap wasn't enough - the real ask was creating and deleting roles from the ground up, not renaming Manager/Supervisor/Employee/Customer. Built the full version this session. Mid-build, the user corrected the scope once more: keep the 4 existing roles as real starting data (not wiped), add a `description` field, and add a reports-to hierarchy field (nullable, "None" when nothing is above) - purely organizational/informational, explicitly not used for permission inheritance.

**Schema**: `UserRole` enum shrunk from 6 values to `SUPERADMIN | ADMIN | STAFF` (Postgres enum value removal needs rename-recreate-remap, can't drop a value directly). New `Role` model (`id`, `tenantId`, `name`, `description`, nullable self-referential `reportsToId` → `Role.id` via relation `RoleHierarchy`, `onDelete: SetNull` so removing a role just clears anything reporting to it rather than cascading/blocking) - `@@unique([tenantId, name])`. `User.roleId` (nullable FK to `Role`, `onDelete: Restrict` - this is what actually enforces "can't delete a role while anyone holds it," at the DB level, not just in application code). `RolePermission`/`RoleVisibility` now key off `roleId`/`viewerRoleId`/`targetRoleId` instead of the old enum member. `Tenant.roleLabels` (the superseded rename-only stopgap) removed entirely, its existing override values migrated into real `Role.name` rows first so no tenant's custom renames were lost.

**Migration safety, done deliberately before the irreversible part**: removing the hardcoded-default permission fallback (`DEFAULT_ROLE_PERMISSIONS`/`DEFAULT_ROLE_VISIBILITY` in the old `src/lib/permissions/catalog.ts`) as part of this change would have silently stripped every existing tenant's *effective* permissions down to nothing the moment a tenant's actual DB rows didn't fully cover a role, since the new system has no default-matrix fallback at all - a missing row just denies. Before touching the schema: wrote a one-off script (deleted after use) that used the *old* code's `getEffectivePermissionMatrix`/`getEffectiveVisibilityMatrix` to materialize every tenant's current effective permissions as real stored rows, confirmed via psql (18 tenants, 1440 permission rows + 288 visibility rows), and took a full `pg_dump` backup before applying the migration. Post-migration psql checks confirmed: 72 roles (18 tenants × 4 starter roles), all `STAFF` users have a non-null `roleId`, all 1440 permission rows carried a non-null `role_id`, the enum shrink landed, `tenants.role_labels` is gone, and a tenant's earlier custom role renames survived into the new `Role.name` values correctly.

**Lib** (`src/lib/permissions/catalog.ts` and `service.ts`, both substantially rewritten): `DEFAULT_STARTER_ROLE_NAMES`/`DEFAULT_STARTER_ROLE_PERMISSIONS`/`DEFAULT_STARTER_ROLE_VISIBILITY` (by starter name, used only at signup-time seeding, not as a runtime fallback). New `VIEW_ROSTER` permission key. `hasPermissionByRoleId`/`hasPermission`/`canViewRoleById`/`canViewRole` all rewritten around `roleId` with no default-matrix merge - a missing row denies, full stop. New `seedDefaultRolesForTenant()` creates the 4 starter roles with their default hierarchy (Employee → Supervisor → Manager, Customer → none) and permission/visibility rows, called once at signup (`POST /api/auth/signup`).

**API**: new `GET/POST /api/roles` (list; create, ADMIN-only, validates name uniqueness and that `reportsToId` belongs to the tenant) and `GET/PATCH/DELETE /api/roles/[id]` (PATCH does partial rename/describe/re-parent with a `chainIncludes()` cycle check so a role can't end up reporting to itself through a chain; DELETE proactively checks `user.count({roleId})` and returns a friendly `ROLE_IN_USE` 409 before ever hitting the DB's FK `RESTRICT` backstop). `POST /api/staff` and `PATCH /api/admin/permissions` switched from an enum `role` field to a validated `roleId` (must belong to the tenant). `GET /api/staff` now includes `customRole: {id, name}`.

**UI**: `RoleLabelSettings.tsx` deleted, replaced by `RoleManager.tsx` - lists all tenant roles with inline-editable name/description (save on blur) and a reports-to `<select>`, a Remove button per role (surfaces the `ROLE_IN_USE` error inline if blocked), and an add-role form. `StaffManager.tsx`'s role picker and `SchedulingCalendar.tsx`'s inline "+ Add new staff member" role picker both now populate from `GET /api/roles` instead of a fixed option list. `PermissionMatrixEditor.tsx` reworked around dynamic roles (`Record<roleId, ...>` instead of `Record<enum, ...>`), plus a new "Roster" permission group for `VIEW_ROSTER`. `AppHeader` gained a `canViewRoster: boolean` prop (computed server-side per page via the new permission) replacing a hardcoded role-name check on the Roster nav link - all 7 pages that render `AppHeader` updated to compute and pass it. Dashboard's "Signed in as" label now resolves through `session.roleId → Role.name` instead of the old enum-label resolution.

**A TypeScript/lint pattern worth remembering for next time**: `react-hooks/set-state-in-effect` flags `useEffect(() => { void loadFn(); }, [])` whenever `loadFn` internally calls `setState`, but does *not* flag the IIFE-wrapped form `useEffect(() => { (async () => { await loadFn(); })(); }, [])` - had to convert both `RoleManager.tsx`'s and `StaffManager.tsx`'s initial-load effects to this form to clear lint, matching the convention already established elsewhere in this codebase.

`tsc --noEmit` / `npm run lint` / `npm test` (15/15, including the RLS integration test against the live container) / `npm run build` all clean after the full rewrite. **Verified via direct psql against the migrated data** (role counts, FK population, enum shrink, label-override carryover - see above) but **not yet re-verified live via curl against a running dev server** (fresh signup → 4 seeded roles with correct hierarchy/permissions, create/rename/delete a role via the API, assign a staff member to a custom role, confirm delete-while-in-use is blocked with the friendly error, confirm cycle prevention on reports-to) - that pass is still outstanding, next up.

### Color key and custom tags merged into one section
User said they were unclear how the color system worked, after asking for "custom color keys." Turned out the two existing Settings cards - "Color key" (5 fixed status colors, recolor-only) and "Custom color tags" (an open-ended named+colored list, already assignable per-event and already shown in the legend) - already did what "add custom color keys" was asking for, just split across two differently-named cards that didn't read as one system. Rather than building a new feature, merged the two into one: `EventColorSettings.tsx` now contains both the 5 built-in swatches ("Built in") and the custom add/delete list ("Your own") in a single "Color key" card with copy that explains the relationship - pick one of "your own" from the "Color key" field when scheduling an individual appointment/shift. `EventTagManager.tsx` deleted, `admin/users/page.tsx` updated to drop its now-separate render call. No schema or API changes - `EventTag` already supported everything needed.

Also renamed the calendar-side picker itself from "Tag" to "Color key" (`SchedulingCalendar.tsx`'s `CreateEntryPanel` and `AppointmentDetailPanel` - the field label, its "No tag"/"+ Add new tag" options, and the inline new-entry form's "Name" label) so the field a user actually interacts with while scheduling matches the Settings section name that configures it - this was likely the real source of the "unclear how it works" confusion, since the connection between a Settings card called "Custom color tags" and a calendar field called "Tag" wasn't obvious. Internal variable/type names (`TagOption`, `tagId`, `/api/event-tags`, `canCreateTag`) were left as-is - this was a user-facing copy and information-architecture fix, not a rename of the underlying `EventTag` model.

**Verified live**: `tsc`/lint/test (15)/build all clean. Confirmed via curl against the custom-roles test tenant from this session: the merged Settings page still renders 200 and its HTML contains the new single "Color key" heading, and `POST/GET /api/event-tags` still work unchanged (created a second color key, "VIP", and confirmed it lists back correctly). Not yet clicked through in a real browser - same standing caveat as the rest of this app's client-rendered UI.

### Appointment & shift form settings split into two cards
Small TODO item: the single "Appointment & shift form" Settings card (`AppointmentFormSettings.tsx`) had two toggles that only ever applied to appointments (`requireClientForAppointments`, `enableMapsNavigation`) - nothing shift-specific existed to put in a real second section. Went with the "at minimum" option TODO.md had already flagged: retitled the existing card "Appointment form" (same two toggles, no behavior change) and added a new placeholder "Shift form" card (`ShiftFormSettings.tsx`) explaining there's nothing shift-only to configure yet. Both render as separate cards on the User Manager page, same pattern as every other settings card there. `tsc`/lint clean. Not browser-verified - same standing caveat as the rest of this app's client-rendered UI.

### SUPERADMIN dev console (account dashboard, billing override, discount codes)
Built out the TODO.md "Dev role" item. The data model already had everything needed for this - `UserRole.SUPERADMIN` (platform operator, `tenantId` null) already existed and already bypassed the permission system everywhere, but there was no way to create one and no console for it (`src/app/app/page.tsx` literally said "No superadmin console yet" and bounced SUPERADMIN sessions to the marketing page). This session built the actual console:

- **Creating the account**: no public signup for this role, by design ("an account that I setup" in the original ask) - added `POST /api/superadmin/bootstrap`, gated by a `SUPERADMIN_SETUP_SECRET` env var (compared with `timingSafeEqual`, same convention as session-token verification) and self-disabling once any SUPERADMIN row exists, so it can't be used to mint a second one or by anyone who doesn't have the server's own secret. 404s (not 400) if the env var was never set, so its existence isn't even observable from outside. Added `SUPERADMIN_SETUP_SECRET` to `.env.example` and a real generated value to local `.env`.
- **Dashboard**: new `/superadmin` route (outside the tenant-scoped `(admin)/app/[tenantSlug]` tree entirely - its own minimal dark-themed header, no `AppHeader` since that's tenant-branded). Server-guarded (`redirect("/login")` unless `session.role === "SUPERADMIN"`), and `src/app/app/page.tsx` (the post-login resolver) now sends SUPERADMIN sessions here instead of to `/`.
- **Tenant list + billing override** (`TenantBillingManager.tsx`, `GET /api/superadmin/tenants`, `PATCH /api/superadmin/tenants/[id]/license`): every tenant on the platform with its feature tier, staff/appointment counts, and an inline billing-plan/status editor per row. This is the explicit "real write action on `License.billingPlan`/`status`, not just a read-only view" the TODO item called for - `setLicensePlan()` in `src/modules/licensing/service.ts` writes directly, bypassing Stripe checkout entirely, for comping an account, testing paid-tier features without a real charge, or fixing a billing issue by hand. Uses `runInSystemContext` (RLS-bypassing, already built for exactly this kind of cross-tenant platform operation) rather than any per-tenant context.
- **Discount codes** (`DiscountCodeManager.tsx`, `GET/POST /api/superadmin/discount-codes`, `PATCH/DELETE .../[id]`): new `DiscountCode` model (code, `PERCENT`/`FIXED_CENTS` type, value, active flag) - platform-level, not tenant-scoped, so no RLS policy, gated entirely at the API layer like the rest of this console. **Scoped deliberately narrow**: this is record-keeping/management only, **not yet wired into the actual Stripe checkout flow** - redeeming a code against a real purchase is still a manual step for now, flagged in the UI copy itself, consistent with how checkout overall is already marked "built but not live-tested" in TODO.md.

**Verified live via curl**: bootstrapped a real SUPERADMIN account, confirmed a second bootstrap attempt correctly 409s ("already exists"); `GET /api/superadmin/tenants` returns every tenant with license + counts; `PATCH .../license` successfully comped a real tenant from FREE to SUBSCRIPTION and persisted it; the same PATCH with no session cookie correctly 403s; `/app` redirects a SUPERADMIN session to `/superadmin` (307), which itself renders 200, while a logged-out request to `/superadmin` redirects to `/login`. **Discount codes could not be verified live this session** - the dev server's long-lived `globalForPrisma.prisma` singleton (`src/lib/prisma.ts`, deliberately cached across Fast Refresh to avoid exhausting DB connections in dev) was instantiated before the new `DiscountCode` model existed, so the running process's Prisma Client doesn't know about it until the dev server is actually restarted (not just hot-reloaded) - both `GET` and `POST /api/superadmin/discount-codes` 500 until that happens. This is a one-time dev-environment artifact of *this* schema change, not a bug in the code - restart `npm run dev` once and re-verify. `tsc --noEmit` / `npm run lint` / `npm test` (15/15) all clean regardless.

### Service types Settings card
TODO.md item: service types (the job types staff pick when scheduling) could only be created via the raw `POST /api/service-types` API - no Settings UI at all, unlike staff/clients/tags which all have an admin card. Added `ServiceTypeManager.tsx` to the User Manager page: list with inline edit (name, duration, price, requires-payment) and delete, plus an add form - same list/add/edit/delete pattern as `HolidaySettings.tsx`/`StaffManager.tsx`. New `src/app/api/service-types/[id]/route.ts` (`PATCH`/`DELETE`, gated by `EDIT_SERVICES`/`DELETE_SERVICES` via `hasPermission` - not a hardcoded role check, consistent with the existing `GET`/`POST`). Both use `updateMany`/`deleteMany` scoped to `{id, tenantId}` rather than a bare `update`/`delete`, so a ServiceType id from another tenant 404s instead of leaking existence - deletion needs no "still in use" guard since `Appointment.serviceTypeId` is `onDelete: SetNull`, unlike deleting a `Role`.

**Flagging rather than solving**: the TODO item asked for this to be "explicitly accessible to both ADMIN and whichever role(s) hold those permissions," but `/admin/users` itself is still hard-gated to ADMIN only at the page level (`page.tsx`'s own redirect, same as every other card on that page) - a non-admin role granted `CREATE_SERVICES` from the permission matrix still can't open Settings at all to use this card. That's a pre-existing gap in the whole Settings page's access model (true for `StaffManager`, `RoleManager`, every card there), not something this one item should fix as a side effect - left it as a known gap rather than quietly expanding scope into a Settings-page access redesign.

**Verified live via curl** against a fresh signup: `/admin/users` renders 200; `POST /api/service-types` creates a service type; `PATCH /api/service-types/[id]` edits it and the change round-trips on the next `GET`; `PATCH` on a nonexistent id correctly 404s; an unauthenticated `PATCH` correctly 401s; `DELETE` removes it and it's gone from the next `GET`. `tsc --noEmit` / `npm run lint` / `npm test` (15/15) all clean. The card's own on-screen interaction (add form, inline edit toggle) is correct by code review but not clicked through in a real browser - same standing caveat as the rest of this app's client-rendered UI.

### Language setting (i18n infrastructure + Dashboard/AppHeader translated)
TODO.md's "language setting" item, previously blocked on two decisions - resolved this session: **which languages** (English + Spanish/German/French, your call) and **per-user vs. per-tenant** (per-user - each person picks their own, not one tenant-wide default, your call). Used **next-intl** (the plugin Next.js's own docs recommend first for this), since there was no i18n infrastructure anywhere in the app before this.

- **Data model**: new `Locale` enum (`EN`/`ES`/`DE`/`FR`) and `User.locale` (`prisma/migrations/..._add_user_locale`, default `EN`) - per-user, not per-tenant, so two people at the same business can each run the app in a different language.
- **No URL-based routing** (`/es/...` prefixes) - deliberately skipped, since the language is a per-user preference, not part of a tenant's public URL shape, and adding a `[locale]` segment would mean restructuring the entire `app/(admin)/app/[tenantSlug]/...` tree. Locale is instead resolved per-request from the signed session cookie (`src/i18n/request.ts`), which already carries `tenantId`/`role`/`roleId` the same way.
- **Session carries locale now** (`SessionPayload.locale`, `src/lib/auth/session.ts`) - avoids a DB query on every single request just to pick a language. Tokens issued before this field existed default to `EN` rather than invalidating every pre-existing session. All three places that mint a session (`login`, `signup`, `superadmin/bootstrap` routes) now include it.
- **`PATCH /api/me/locale`**: the only way to change it - validates against the 4 supported codes, updates `User.locale`, and **re-issues the session cookie** with the new locale baked in so it takes effect on the very next request, no logout/login needed. Works for ADMIN/STAFF (via `runInTenantContext`) and SUPERADMIN (via `runInSystemContext`, since that role's row has `tenantId: null`) - deliberately not `requireTenantSession`, which excludes SUPERADMIN.
- **`LanguagePicker.tsx`**: a plain `<select>` in `AppHeader`, visible to every tenant role (not just ADMIN) - this is the real reason it isn't on the admin-only `/admin/users` Settings page the original ask mentioned: a per-user preference has to be reachable by non-admin STAFF too, and that page is hard-gated to ADMIN (same gap flagged in the service-types entry above). Calls the PATCH route then `router.refresh()` so server components re-render with the new locale immediately.
- **Translated so far**: `AppHeader` (every nav label) and the full `Dashboard` page (including the dynamically-built permission-based access summary - its category/action labels used to double as both an internal key *and* the English display text, which only worked because there was one language; now they're stable keys like `categories.staff`/`actions.view` looked up through the translation, not translated-by-coincidence). **Not translated yet** (still hardcoded English, by deliberate scope cut, not oversight): every other page - Calendar/`SchedulingCalendar.tsx` (the biggest surface by far), Settings and all its cards, Billing, Time off, Roster, Login/Signup, the SUPERADMIN console. Login/signup specifically can't use a stored preference at all pre-authentication - `i18n/request.ts` falls back to `"en"` when there's no session, which is correct for now but means those pages stay English-only until/unless a logged-out mechanism (e.g. browser `Accept-Language`) is added.
- `src/global.d.ts` types `useTranslations`/`getTranslations` against `en.json`'s actual shape (next-intl's documented pattern) so a typo or a key missing from one locale's JSON is a compile error, not a silent untranslated string at runtime.

**Verified live via curl** against a real tenant: confirmed `PATCH /api/me/locale` to `ES`/`DE`/`FR`/`EN` each actually changes `<html lang>` and the rendered AppHeader/Dashboard text on the very next request (no page reload or re-login needed) - e.g. "Signed in as" → "Conectado como" in Spanish, "Settings" → "Configuración", "Sign out" → "Cerrar sesión". Every other existing page (Calendar, Settings, Billing, Time off, Roster) still renders 200 with the new `NextIntlClientProvider` wrapping the root layout - the wrap itself doesn't break anything client-side-rendered elsewhere. `tsc --noEmit` / `npm run lint` / `npm test` (15/15) all clean. Not browser-click-tested (same standing caveat as the rest of this app's client UI) - the `<select>` itself hasn't been operated through an actual browser, only driven via the API it calls.

### Shift form field toggles + "Manage job types" link

Raised directly (not pre-existing in TODO.md): `ShiftFormSettings.tsx` was a
placeholder with nothing to configure (see the "Split the single
'Appointment & shift form' Settings card" entry above). It now has real
toggles.

- **Three new `Tenant` booleans**, all default `true` (today's existing
  behavior unchanged until an admin turns one off): `showJobTypeOnShiftForm`,
  `showJobEstimateOnShiftForm`, `showColorKeyOnShiftForm`
  (`prisma/migrations/20261002145550_add_shift_form_field_toggles`). Wired
  into `GET`/`PUT /api/tenant-settings` the same partial-update way as the
  existing toggles.
- **Only gates `mode === "shift"`** in `SchedulingCalendar.tsx` - the
  appointment form's "Service"/"Color key"/job-estimate fields are
  unaffected regardless of these settings. Applied in both the create panel
  (`CreateEntryPanel`) and the existing-shift detail panel
  (`AppointmentDetailPanel`, gated via `isShift(appointment)`), so turning a
  field off hides it consistently whether creating or viewing a shift.
- **Didn't duplicate the job-types list.** Job types are the existing
  `ServiceType` model/"Service types" Settings card (shared with
  appointments, full CRUD already built - see the "Let Manager and Admin add
  job types" TODO entry). Per the user's explicit choice when asked, left
  that card's naming/placement alone and instead added a "Manage job types"
  link inside the new Shift form card that jumps to `#service-types` (a new
  anchor `id` added to `ServiceTypeManager.tsx`'s section).

**Verified via curl** against a throwaway signup tenant (created and fully
deleted afterward - no leftover test data): `GET /api/tenant-settings`
returns all three new keys defaulting `true`; `PUT` with each
key individually (and two at once) persists correctly; the Settings page
HTML includes the new "Shift form" heading, the "Manage job types" link, and
`id="service-types"` on the target card. `tsc --noEmit` and `eslint` both
clean on every touched file. **Not browser-click-tested** - no headless
browser tooling (chromium-cli/Playwright) is installed in this Windows dev
environment, so the checkboxes' actual on-screen behavior (and the anchor
link's scroll-to) haven't been visually confirmed, only their rendering and
the API they call.

### Settings access model: open to every tenant member, gated per-section (fixes the long-flagged gap)

Raised directly: "Move My account to Settings, everyone should have access to Settings but not everyone has access to all Settings." This is the pre-existing gap flagged in both the "Service types Settings card" and "Language setting" entries above and in TODO.md - Settings was hard-gated to ADMIN only at a single chokepoint (`getAdminTenant.ts`), so a STAFF role granted a real permission (e.g. `VIEW_SERVICES`, `VIEW_STAFF`) still couldn't open Settings at all.

- **`getAdminTenant.ts` is gone**, replaced by `admin/settings/access.ts`: `getSettingsContext` (any signed-in tenant member, ADMIN or STAFF - redirects to `/login` only if there's no real tenant session at all) and `requireSettingsSection(tenantSlug, slug)`, which every section's own `page.tsx` now calls to 404 if that section isn't for them - the nav hiding a link was never real enforcement on its own.
- **`sections.ts` gained a `requirement` per section**: `"ALWAYS"` (Account), `"ADMIN"` (Shifts, Calendar, Company Profile, Permissions - every card in these is ADMIN-only at the API already, e.g. `/api/tenant-settings` PUT, `/api/roles`, `/api/admin/permissions`, so there's no existing permission to delegate them through), or an existing `PermissionKey` (Appointments → `VIEW_SERVICES`, Staff → `VIEW_STAFF` - both already fully delegable at the API level via `hasPermission`, just previously unreachable through Settings). No new permission keys were added - reused what `ServiceTypeManager`/`StaffManager` already check.
- **Permissions section is hardcoded `"ADMIN"` on purpose, not treated as a future delegable permission** - granting it away would let a role grant itself anything else.
- **Appointments is a split case**: `ServiceTypeManager` shows for anyone with `VIEW_SERVICES`, but `AppointmentFormSettings` (the tenant-wide toggle card) only renders when `isAdmin`, since its save would 403 otherwise - `requireSettingsSection` now returns `isAdmin` for exactly this kind of per-card split within an otherwise-open section.
- **"My account" folded into Settings**: the standalone `/app/[tenantSlug]/account` page (holding `LanguageSettingsForm`, itself a same-day earlier move of the language picker out of the header's `LanguagePicker.tsx` dropdown) is deleted; `LanguageSettingsForm` now renders alongside `ChangePasswordForm` on `/admin/settings/account`, whose `requirement` is `"ALWAYS"`. `AppHeader`'s separate "My account" link is gone; its "Settings" link is no longer ADMIN-only.
- Unused translation keys removed from all four locale files (`AppHeader.account`, `AccountPage.title`) now that nothing references them.

**Verified**: `tsc --noEmit`, `eslint`, and the full `vitest` suite (15/15) all clean. **Not browser-click-tested or curl-verified against a real STAFF session** - correct by code review (the permission checks reuse already-tested `hasPermission` call sites, and the gating logic is a straightforward per-section lookup) but the actual experience of signing in as a STAFF role with e.g. `VIEW_STAFF` granted and confirming Settings shows exactly Staff + Account, nothing else, hasn't been clicked through.

## Known gaps / not yet done

See `TODO.md` for the full backlog (new feature requests, known gaps, and the
rest of the original roadmap) — kept separate from this file so status and
backlog don't get tangled together.

## Picking this back up

Everything currently in the repo builds, lints, typechecks, and passes tests
as of this handoff (`npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run
build` all clean). Read this section before doing anything else in a new
session - in priority order:

1. **Nothing is committed.** See "Environment state" above - `git log` is 2
   commits deep and stops well before most of this file. Ask the user
   whether to commit before building further on top of this, since right
   now all of it only exists in the working tree.
2. **The calendar color-key/custom-tags/holidays feature is now fully wired
   up** (see the "Calendar now consumes tenant colors, tags, and holidays"
   entry below) - including a real bug fix (the admin color-picker UI's
   saves were silently failing with a 400 before this). Not yet
   browser-tested, same standing caveat as everything else client-side.
3. Everything else open is tracked in `TODO.md`, organized by category
   (bugs, new feature requests, security, things needing the user's
   decision, known gaps, infra). It was just reviewed and pruned against
   the actual code state as of this handoff, so it should be trustworthy -
   but re-verify anything load-bearing before acting on it, the same way
   this file asks you to for its own claims.
4. Near-zero of this session's client-side UI (drag/resize, hover states,
   the animated create-panel entrance, color pickers, etc.) has been
   clicked through in a real browser - only what's explicitly marked
   "Verified live" above was actually confirmed, and that's almost always
   the server/API half, not the on-screen behavior. Don't presume something
   works in-browser just because it's described in detail here.
