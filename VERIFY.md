# ShiftUp — Needs Your Verification

Items below are code-complete — fixed or built, per the dev write-ups in
`PROGRESS.md`/git history — but not yet confirmed by you clicking through the
actual running app. Pulled out of `ISSUES.md`/`TODO.md` so those two stay
pure backlog (open bugs, open feature requests) instead of accumulating
"done but unconfirmed" clutter.

**How to use this file**: try each item in the app, then delete its entry
(or tell me to and I will). If something's actually broken, it goes back
into `ISSUES.md` as a real bug instead. Full technical detail for anything
below — what changed, why, verification already done by curl/test suite —
lives in `PROGRESS.md` (search by the bold title) or `git log`; this file
deliberately leaves that out so it stays skimmable.

## New features

- **Calendars fully split into separate pages, plus any number of named
  custom calendars (TODO.md's "Custom calendar entry types" and "Fully
  separate the Shifts and Appointments calendars").** Built in the big
  2026-10-20 overhaul commit, browser-verified this session (fresh signup,
  upgraded to a paid plan, clicked through everything - screenshots taken,
  no console errors, Settings > Calendars/Dashboard pages loaded clean).
  Check on your own account: Settings > Calendars - toggle "Appointments
  calendar"/"Shifts calendar" off and confirm the Calendar nav dropdown
  loses that item; add a custom calendar (e.g. "Site Visits"), confirm it
  shows up as its own item in the Calendar dropdown with its own page
  (`/calendar/custom/<id>`) and its own grid/toolbar, independent of
  Appointments/Shifts. Toggle its field checkboxes (client, job type, job
  estimate, color key, payment status) and confirm the create/detail panel
  on that calendar's own entries actually reflects them. Confirm
  `/calendar/all` shows every kind combined, and that a bookmarked old
  `/calendar` link redirects sensibly. Confirm a FREE-plan tenant can't
  create a custom calendar (should hit the upgrade message). **One real
  environment gotcha hit while verifying, not an app bug**: right after this
  commit, every Settings page 404'd (even `/admin/settings/account`, which
  requires nothing) until the stale Turbopack `.next` build cache was
  cleared and the dev server restarted - if you see Settings 404ing for no
  reason, that's almost certainly this, not a regression; delete `.next` and
  restart `npm run dev`.
- **Fully customizable Dashboard stat tiles, replacing the old two hardcoded
  ones.** Built same overhaul commit, browser-verified this session
  (created a third tile, confirmed it appeared on the real Dashboard with a
  real computed value). Settings > Dashboard now lets you rename, delete, or
  add as many counting tiles as you want (Appointment/Shift/Staff count,
  filterable by kind/date-range/status), replacing the old fixed "Staff"/
  "Upcoming appointments" pair - those two still exist but are now just the
  seeded starting tiles, editable/deletable like any other. Check: Settings
  > Dashboard, add a new tile with a filter combination you care about,
  confirm it shows up on the real Dashboard page with a sensible count;
  rename/delete an existing tile and confirm the Dashboard updates to match.
- **Manager shift/no-show reports dashboard (ISSUES.md #4).** Built
  2026-10-09/10. New "Reports" page (linked from `AppHeader`'s nav for
  anyone with the new `VIEW_SHIFT_REPORTS` permission - defaults to
  Manager/Supervisor, ADMIN always). Shows aggregate tiles (no-show count,
  completed count, cancelled count, booked count, completion rate, total
  hours worked) over a date range defaulting to "this week," with
  status/staff/service-type filters (AND, narrowing) and a per-staff
  breakdown. Clicking a tile or a row opens the real appointment detail
  panel for drill-down. End-to-end check: as a role holding
  `VIEW_SHIFT_REPORTS`, open Reports, confirm the tiles match what's
  actually on the calendar for "this week," narrow by staff/status/service
  type and confirm the tiles recompute, click a tile and confirm it opens a
  filtered list of the underlying events, click a row and confirm the real
  detail panel opens. Confirm a role *without* `VIEW_SHIFT_REPORTS` doesn't
  see "Reports" in the nav and gets redirected if it hits the URL directly.
  **Added 2026-10-10, same session:** a "Kind" filter (Both/Appointments/
  Shifts) - raised directly after the first build landed, since Reports (and
  Roster, see below) still mixed both kinds with no way to split them apart
  the way the main calendar's own Appointments/Shifts/Both switcher already
  can. Check: switching Kind to "Appointments" or "Shifts" narrows every
  tile, the per-staff breakdown, and the drill-down list to just that kind;
  "Both" shows everything again.
- **Team Roster can now split Appointments/Shifts too.** Raised same session
  as the Reports "Kind" filter above, same reasoning - `RosterView.tsx`
  gained the identical Both/Appointments/Shifts pill switcher next to the
  Day/Week toggle, client-side only (no new fetch), filtering each staff
  member's chip row. Check: `/calendar/roster`, switch the new switcher and
  confirm each person's row only shows the selected kind (and their
  appointment/shift counts update to match).
- **Service types split into separate Appointments/Shifts lists (ISSUES.md
  #1).** Built 2026-10-09/10. The old single "Service types" pool is now two
  independent tables - `AppointmentServiceType` (client-facing, has
  price/payment/public-booking toggles, managed from Settings > Appointments'
  `ServiceTypeManager`) and `ShiftServiceType` (internal, name + duration
  only, managed from Settings > Shifts' new `ShiftServiceTypeManager`, linked
  from `ShiftFormSettings`' "Manage job types"). End-to-end check: confirm
  Settings > Appointments only lists/creates appointment-style service types
  (with price/payment fields) and Settings > Shifts only lists/creates
  shift-style job types (name + duration only, no price) - each list should
  be independent, not shared. Create an appointment and confirm its job-type
  picker only offers appointment service types; create/drag a shift and
  confirm its job-type picker only offers shift service types. Build or apply
  a schedule template shift and confirm it still picks a shift service type
  correctly. Existing data should have carried over correctly during the
  migration - any service type that was ever used on a real (client-having)
  appointment should now appear under Appointments; any used on a shift or a
  schedule-template shift should appear under Shifts (a service type used as
  both historically will appear in both lists, which is expected, not a
  bug - see the migration's own comment in
  `prisma/migrations/20261010040000_split_service_types_and_payment_toggle/migration.sql`
  for the exact split rule). Also confirm the public booking widget below
  still lists/books correctly against `AppointmentServiceType` only.
- **Payment status is now editable, and toggleable (ISSUES.md #5).** Built
  2026-10-09/10. Two pieces: (1) Settings > Appointments gained a "Show
  payment status" checkbox (`Tenant.showPaymentStatus`, default on) -
  turning it off hides the Payment field from the appointment detail panel
  entirely (never shown for shifts regardless). (2) The detail panel's
  Payment field is now a real editable dropdown (Unpaid/Paid/Waived/
  Refunded), saved via `PATCH /api/appointments/[id]` (same `EDIT_APPOINTMENTS`
  gate as the rest of that edit form) - no longer permanently stuck at
  `UNPAID`. Check: open an appointment (not a shift), change Payment to
  "Paid," save, reopen it and confirm it stuck. Toggle "Show payment status"
  off and confirm the field disappears from both the create and detail
  panels; toggle back on and confirm it reappears with the value you set.
- **Public booking widget.** Built 2026-10-09. End-to-end check: as ADMIN on
  a non-FREE tenant, go to Settings > Booking Widget, check "Enable public
  booking", mark at least one active service type "Bookable online" (same
  page), and under "Staff working hours" give a staff member a window on
  today's day of week. Open the "Preview the booking page" link
  (`/book/<your-slug>`) in a private/incognito window (no login) - pick the
  service, pick "Any available" or that staff member, pick today's date,
  confirm a time slot shows inside your working-hours window, fill in a
  name, and submit. Confirm: the booking appears on the real calendar as a
  normal appointment (status Booked, source self-service isn't shown in the
  UI but should be visible via `GET /api/appointments/[id]` in devtools if
  you want to check), and a brand-new guest `Client` was created for it.
  Then confirm the negative cases: toggle "Enable public booking" back off
  and reload `/book/<slug>` - should show "This booking page isn't
  available" (not an error, not a hint that the business exists but is
  unavailable). Same check on a FREE-plan tenant with the toggle on anyway -
  still unavailable (paid-plan gate independent of the admin toggle). Try
  submitting the same exact time slot twice in two browser tabs - the second
  should get a "that time was just booked" message, not a double-booked
  calendar. Finally, copy the embed snippet from Settings and paste it into
  a plain static `.html` file opened locally (or any scratch page) - confirm
  the iframe loads and auto-sizes to fit its content as you step through it.
- **"Require a client on every appointment" toggle actually works
  end-to-end.** Flagged 2026-10-09 while reviewing the backlog (not a code
  change - this already existed). Check: Settings > "Appointment & shift
  form", toggle "Require a client on every appointment" off, then open the
  appointment create panel and confirm you can save without picking a
  client (label should read "Client (optional)"). Toggle it back on and
  confirm the client field becomes required again (can't save without
  one). Default for a new tenant should be **on** (required) - confirmed
  correct, not changing.
- **Mark an appointment/shift Completed or No-show.** Open an appointment or
  shift's detail panel: confirm "Mark completed" and "Mark no-show" buttons
  appear next to the existing Cancel button (as long as you hold
  `EDIT_SHIFTS`/`EDIT_APPOINTMENTS` and Settings > Calendar's "Allow editing
  booked events" is on), clicking one updates the status pill and the
  event's calendar color, and a "Revert to booked" button appears in their
  place once set. Confirm a cancelled event still only shows the Cancel
  button's own disabled state (no outcome buttons), and confirm a role
  without `EDIT_SHIFTS`/`EDIT_APPOINTMENTS` doesn't see these buttons at all
  (try `PATCH /api/appointments/[id]` with `{"status":"COMPLETED"}` directly
  via devtools too, confirm it 403s).
- **Color key picker offers built-in colors too.** Open an appointment or
  shift's detail panel (or the create panel): the "Color key" dropdown
  should now show a "Built-in" group (Appointment/Shift/Completed/No-show/
  Cancelled - whichever apply to that entry type) above the existing
  "Custom" group of your own tags. Pick a built-in one (e.g. "Completed" on
  a still-booked appointment) and confirm the event recolors on the
  calendar immediately, the picker reopens showing that same selection, and
  it reverts to its actual status color if you later cancel/complete/no-show
  it for real (status always wins). Confirm picking a custom tag after a
  built-in key clears the built-in selection, and vice versa.
- **Blocked time + holiday "Block" toggle.** Check Settings > Calendar:
  under "Holidays", check an enabled holiday's new "Block" checkbox and
  confirm the calendar's Month view tints that day grey (not the usual
  amber) and Week/Day view shows it as a full-day grey striped block that
  you can still click through to create an appointment/shift (visual only,
  not a hard limit). Same check for a custom holiday's "Block" checkbox.
  Then try the new "Blocked time" card below it: add a time range (e.g.
  12:00-1:00 PM today) with a label, confirm it shows as that exact striped
  range in Week/Day view with the label as its title, and confirm "Remove"
  deletes it. Confirm a role without `EDIT_CALENDAR_SETTINGS` can't see/save
  either card, same as the existing Holidays/Event colors cards.
- **Calendar hours — configurable visible time range.** Check: Settings >
  Calendar > "Calendar hours", set a start/end time narrower than the full
  day, save, then open the calendar's Week/Day view and confirm the grid
  only shows that range (no scrolling to see hours outside it). Also check
  the toolbar's AM/PM "Hours" toggle still jumps to the start/midpoint of
  your configured range, and "Reset to full day" restores the original
  behavior.
- **Calendar Settings permission + Calendar hours paid-gating.** Check, on a
  FREE-plan tenant: Settings > Calendar shows an upgrade card in place of
  "Calendar hours" (Holidays/Event colors still work normally); confirm
  trying to save hours anyway (e.g. via devtools) still 403s. On a paid
  tenant: grant a non-ADMIN role `EDIT_CALENDAR_SETTINGS` (Settings >
  Permissions), log in as that role, confirm Settings > Calendar is now
  reachable and all three cards (Holidays, Event colors, Calendar hours)
  actually save; confirm a role *without* it still can't reach the page.
  Confirm Settings > Staff's promote/demote buttons are still ADMIN-only
  regardless of any permission that role holds (unchanged, confirmed
  on purpose).
- **Staff role changes — promote, demote, and reassign are ADMIN-only.**
  Check: Settings > Staff. As ADMIN: add a new staff member, "Make admin" on
  a STAFF row, demote that same account back to STAFF via the role-picker +
  "Confirm" control, and reassign a STAFF member's role via the dropdown in
  the Role column. Confirm you can't demote/promote/reassign/remove
  yourself. As a STAFF user holding `VIEW_STAFF` (with or without
  `CREATE_STAFF`/`EDIT_STAFF`/`DELETE_STAFF` also granted - see
  `PERMISSIONS.md`'s "worth improving" #2): confirm Settings > Staff shows
  the directory read-only - no "Add staff" form, no role dropdown (just the
  role name as text), no "Remove" button; try `POST /api/staff`,
  `PATCH`/`DELETE /api/staff/[id]` directly via `curl`/devtools too and
  confirm all three 403 regardless of which of those three permissions that
  role holds.
- **Per-user calendar text size.** Check: Settings > Account, change the
  calendar event text size, open the calendar, confirm event text is
  visibly smaller/larger. Confirm it's per-user (a different logged-in user
  at the same tenant keeps their own separate size).

## Bug fixes (from ISSUES.md)

- **"Group by staff" Day view's time-of-day gutter no longer glitches/floats
  in front of events.** Check: switch the calendar to Day view with "Group
  by staff" on, scroll through a column with overlapping events, confirm the
  left-hand time gutter stays reliably on top instead of flickering behind
  an event.
- **"+ Add appointment"/"+ Schedule shift" buttons now match the toolbar's
  pill shape** (rounded-full, inside the white track, brand-colored fill) instead
  of standing out as mismatched rectangles. Check: open the calendar, look at
  the buttons next to Layout/Calendar type/Viewing/Time grid/Hours.
- **A selected slot now stays visibly highlighted while you still haven't
  picked Appointment vs. Shift.** Check: on a "Both" calendar, click/drag an
  empty slot and confirm a gray dashed placeholder stays put until you choose.
- **The Appointment-vs-Shift chooser now opens as a popup over the slot**
  instead of an inline bar at the bottom of the page. Check: same flow as
  above — the "Add as: Appointment / Shift" prompt should appear as a modal
  right over your selection, not scrolled below the calendar.
- **Calendar events no longer paint through the create/detail popup.** Check:
  open any create or detail panel over a busy part of the grid and confirm no
  event bleeds through the modal's backdrop.
- **Appointment events on the calendar now show the assigned staff member's
  name**, same as shifts already did. Check: look at any appointment event's
  label on the calendar grid (not just inside its detail panel).
- **"View only" is now a dropdown option under one "Calendar" nav item**
  instead of its own top-level link. Check: the main nav bar.
- **Layout-shift-on-open fix (second attempt) — not yet confirmed by you at
  all.** Reported 2026-10-01, first fix didn't work, second fix (always
  rendering the Cancel button, just toggling `invisible`) applied but never
  checked in a browser since. Check: open "+ Add appointment"/"+ Schedule
  shift" and watch whether anything else on the page shifts position.
- **The per-role "X/Y granted" permission-count badge is gone.** Reported
  2026-10-09 as not useful summary information (the math never lined up with
  what the matrix UI actually shows/toggles - see ISSUES.md's original
  write-up). Removed entirely rather than fixed, per the user. Check:
  Settings → Permissions → each role in the left list shows just its name,
  no "X/Y granted" badge next to it.
- **Dashboard's "Upcoming appointments" stat no longer counts shifts (or
  custom-calendar entries).** `upcomingCount` (`dashboard/page.tsx`) now
  filters on `entryKind: "APPOINTMENT"` instead of counting every row in the
  shared `Appointment` table. Check: with shifts and/or custom entries
  scheduled for the near future, confirm the dashboard's "Upcoming
  appointments" tile only counts real client appointments, not those. (A
  separate "upcoming shifts" stat was floated in the original issue but not
  built - not decided as wanted yet.)

## Resolved issues (from ISSUES.md)

- **Issue #2 — color/event tags moved off Staff settings, onto Calendar
  settings, and split into Shifts/Appointments groups.** Check: Settings →
  Calendar has the "Color key" card; Settings → Staff no longer does; the
  "Your own" tag list shows separate Shifts/Appointments groupings.
- **Issue #6 — shift and appointment permissions are now independent
  (View/Create/Edit/Cancel/See-all × Shifts/Appointments).** Check: Settings
  → Permissions → pick a role → the Scheduling group now renders as a matrix;
  confirm you can toggle shift visibility off for a role while leaving
  appointment visibility on (or vice versa) and it actually takes effect on
  the calendar for a test user in that role.

## Completed features (from TODO.md)

- **Custom roles** — tenants can create/rename/describe/delete their own
  roles (with a reports-to hierarchy) instead of being stuck with 4 fixed
  ones. Check: Settings → Permissions, add a role, set its permissions, see
  it actually gate a calendar/staff page for a test user in it.
- **Onboarding/signup-time role setup is still NOT built** — only the
  Settings-page version above is done; skip this check, it's covered by the
  open TODO item instead.
- **Reusable shift-schedule templates** — build a repeating N-day shift
  pattern once, then preview/apply it to any target week (conflicts flagged,
  non-conflicting shifts created). Check: `/app/<tenant>/schedule-templates`
  — create a template, add a couple shifts, run a preview apply, confirm the
  conflict-flagging and the real apply both look right, try cloning a
  template too.
- **Change-your-own-password** — a logged-in user can change their password
  from Account settings (separate from the still-open "forgot password for a
  locked-out user" item). Check: Settings → Account → change password while
  logged in.
- **Company-name font picker** — admin can pick one of 8 curated fonts for
  the business name wherever it renders (separate from actually renaming the
  business, which is still open). Check: Settings → Company Profile, change
  the font, confirm it updates in the header and Dashboard heading.
- **App-wide "racing" font (Orbitron) on headings/nav brand.** Check: look at
  page headings and the nav wordmark; the calendar's own month/year heading
  was deliberately left in the plain body font — confirm that one spot still
  looks right too.
- **SUPERADMIN dev console** — `/superadmin`, tenant list with billing
  override and discount-code CRUD, plus an admin-password-reset action for a
  locked-out tenant. Check: log in as your SUPERADMIN account, browse the
  tenant list, try the billing-plan override on a test tenant, try the
  password-reset action and confirm the one-time plaintext password actually
  works to log in as that tenant's admin.
- **Service types manageable from Settings**, plus the Settings access
  rework that lets non-ADMIN roles reach whichever Settings sections their
  permissions cover (Account always open to everyone; Appointments/Staff
  gated on `VIEW_SERVICES`/`VIEW_STAFF`; everything else stays ADMIN-only).
  Check: as a non-admin role holding `VIEW_SERVICES`, confirm you can reach
  Settings → Appointments and manage service types there, and that other
  Settings sections correctly 404/hide for that role.
- **Appointment-form and shift-form settings split into two separate cards**,
  plus three real shift-form toggles (job type / job estimate / color key)
  and a "Manage job types" link. Check: Settings → Shifts.
- **Nav dropdown history settled**: Calendar/View only merged into one
  "Calendar" dropdown, Staff pages dropdown holds Roster/Time off, Settings
  and Billing are plain top-level links. Check: the main nav bar matches this.
- **`VIEW_CALENDAR_TOGGLE` permission** gates whether a role sees the
  calendar's Appointments/Shifts/Both switcher (on for Manager/Supervisor,
  off for Employee/Customer by default). Check: Settings → Permissions →
  Scheduling group has this toggle, and turning it off for a role actually
  hides the switcher for a test user in that role.
- **`SECURITY.md` write-up** exists and is accurate (passwords, sessions,
  Stripe, RLS, what's *not* yet true). Check: skim `SECURITY.md` once for
  anything that reads wrong or needs updating.
- **Roster page now gated by the real `VIEW_ROSTER` permission** instead of a
  hardcoded ADMIN/MANAGER/SUPERVISOR check. Check: Settings → Permissions,
  confirm `VIEW_ROSTER` actually controls who can reach `/calendar/roster`.

## Built on an unconfirmed assumption — just need your yes/no

These aren't bugs, just decisions made during the build that were never
explicitly signed off on. If you're fine with them, they can be deleted from
here; if not, flag it and they become real TODO items.

- **Role hierarchy**: `MANAGER` outranks `SUPERVISOR` outranks `EMPLOYEE`/
  `CUSTOMER`, and job-estimate visibility defaults to `ADMIN`/`MANAGER` only
  (not `SUPERVISOR`). **Now load-bearing, not just cosmetic** - these are the
  seeded `Role.level` values a brand-new tenant starts with, which actually
  drive who can promote/demote/reassign whom (see PROGRESS.md's "Staff role
  changes" entry) - worth double-checking sooner rather than later. Check:
  Settings → Permissions → each starter role's rank field matches what you'd
  want enforced, and re-rank/edit if not (editable per-tenant, this is just
  the starting default).
- **PTO "hours worked" definition**: the calendar week containing the shift.
  Confirm that's the right definition (vs. e.g. a pay-period week, or a
  rolling 7 days).
