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
