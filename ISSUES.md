# ShiftUp — Issues

Tracked bugs, data-model problems, and known gaps in what's already built.
Referenced from `TODO.md` (which is feature requests/backlog, not this).
Newest/highest-priority first within each section. **Anything marked
"Resolved" below has been pulled out into `VERIFY.md`** — a checklist for you
to confirm in the running app — rather than left here as resolved-but-
unconfirmed clutter.

## High priority

### 1. Service types are shared between Appointments and Shifts — need to be separated

**Status:** Resolved 2026-10-10 — moved to `VERIFY.md` for you to confirm in
the app. Full detail in `PROGRESS.md`/git history.

Today there's a single `ServiceType` table (`prisma/schema.prisma`), and both
`Appointment.serviceTypeId` and `ScheduleTemplateShift.serviceTypeId` point at
the same pool of records, managed from one place (`ServiceTypeManager.tsx` on
the Appointments settings page, `/admin/settings/appointments`) -
`ShiftFormSettings.tsx`'s "Manage job types" link sends shift-side users to
that same Appointments-page list (`#service-types` anchor).

A "job type" on a client-facing appointment (e.g. "Therapy session,"
"Plumbing call-out," with its own duration/price) and a "job type" on an
internal shift (no client, no price) are conceptually different things, but
right now they're forced into one shared list - creating a shift still pulls
from whatever an admin configured for appointments, and vice versa.

**Needs:** separate these so Appointments and Shifts each have (and manage)
their own independent set of job/service types, instead of one shared
`ServiceType` table referenced by both. **Decided 2026-10-09: two fully
separate tables** (e.g. `AppointmentServiceType`/`ShiftServiceType`), not
one shared table with a scope field - a bigger migration than the
`EventTagScope`-style approach, but a cleaner separation: no shared table
for two conceptually different things, and no scope-filter checks needed on
every read. Plus splitting `ServiceTypeManager.tsx` so each settings page
(Appointments vs. Shifts) owns and edits its own distinct list/component,
and `ShiftFormSettings.tsx`'s "Manage job types" link points at the new
shift-owned list instead of the Appointments page's. Every existing
reference to `ServiceType`/`serviceTypeId` (both API routes and
`SchedulingCalendar.tsx`) needs auditing and splitting along with the
migration - not just the settings UI.

### 2. Color tags live under Staff settings — need to be in Shifts/Appointments, separated from Staff

**Status:** Resolved 2026-10-02 — moved to `VERIFY.md` for you to confirm in
the app. Full detail in git history / `PROGRESS.md`.

### 3. No way to update a calendar event after it's created — e.g. logging a no-show

**Status:** Resolved 2026-10-09 — moved to `VERIFY.md` for you to confirm in
the app. Full detail in `PROGRESS.md`. (The optional free-text reason/note
alongside the status change was deliberately left out - still tracked under
the separate, more robust "Notes on an appointment" feature request in
`TODO.md`.)

### 4. Manager dashboard for no-show / shift reporting — needs its own new setting

**Status:** Resolved 2026-10-10 — moved to `VERIFY.md` for you to confirm in
the app. Full detail in `PROGRESS.md`/git history. (Original scoping below
kept for context.) Was blocked on issue #3 above - **no
longer blocked**, since #3 shipped 2026-10-09 and events can now actually
carry a logged `COMPLETED`/`NO_SHOW` outcome. Still not built.

Once events can carry a real status (no-show, completed, etc.), a Manager or
Admin needs somewhere to see the aggregate picture across staff/time - "how
many no-shows this week," "how many shifts were worked," and similar - not
just the existing per-event calendar view. This is a new surface; nothing
like it exists today (`/app/[tenantSlug]/dashboard` is a lighter-weight
landing page today - check what it already shows before assuming this bolts
onto it vs. needing its own page).

**Shape, per the user: similar to the existing Team Roster
(`/calendar/roster`, `RosterView.tsx`) but with filtering and drill-down.**
Roster today is day/week-granularity only, grouped by staff member, with no
filtering at all - it just renders every fetched appointment/shift in its
slot. This new view needs to go further: the manager should be able to
**filter by field** (status - no-show/completed/cancelled/booked -, staff
member, service type, date range, etc.) and then **drill down** from an
aggregate number into the actual underlying list of events behind it (e.g.
click "3 no-shows this week" and see which 3, for whom, when). So this isn't
just a new set of summary stat tiles - it's closer to a filterable table/list
view of events with counts derived from whatever filter is currently
applied, layered on top of (or alongside) the roster's existing grouped
layout.

This also needs a **new permission/setting** controlling who can see it -
raised explicitly as its own setting, alongside the other Staff-settings
permissions, not folded into an existing one. Likely a new permission key in
`src/lib/permissions/catalog.ts` (same granular per-resource pattern as
`VIEW_ROSTER`/`VIEW_ALL_SHIFTS`/`VIEW_ALL_APPOINTMENTS`), defaulted to
Manager/Admin, not a hardcoded role check.

**Needs real design work before building**: what metrics/fields belong on it
(no-show count, completion rate, shift count/hours worked, a per-staff
breakdown?), what fields are filterable and whether multiple filters combine
(AND vs. OR), what time range it covers (today/week/month, user-selectable?),
what the drill-down actually shows (a reused appointment-detail panel? a
plain list?), and whether it's tenant-wide or scoped to whichever staff the
viewing Manager already has visibility into (ties into the existing
`VIEW_ALL_SHIFTS`/`VIEW_ALL_APPOINTMENTS` visibility model rather than a
separate access rule).

**Design proposed 2026-10-02, approved as-is 2026-10-09 - no longer blocked
(#3 shipped), ready to build:**
- **Metrics**: no-show count, completed count, cancelled count, scheduled/
  booked count, completion rate (%), and total hours worked (shifts) - all
  computed over whichever date range is selected, with an optional per-staff
  breakdown table underneath the aggregate tiles.
- **Filters**: status, staff member, service type, date range - combined
  with AND (narrowing), same mental model as the calendar's existing
  Staff/Everyone-just-mine filters, not OR.
- **Time range**: a date-range picker defaulting to "this week," rather than
  a fixed today/week/month toggle - matches how the calendar's own range
  already drives its fetching.
- **Drill-down**: clicking a stat tile's number opens a plain filtered list,
  reusing the existing appointment-detail panel for any single row clicked
  further, rather than a new bespoke table component.
- **Scope**: tenant-wide for whoever holds the new permission, *not* tied to
  `VIEW_ALL_SHIFTS`/`VIEW_ALL_APPOINTMENTS` - this is an explicitly
  manager-facing aggregate view, so a dedicated new key (e.g.
  `VIEW_SHIFT_REPORTS`, defaulted true for Manager/Supervisor only, same
  pattern as `VIEW_ROSTER`) is simpler and more legible than overloading the
  existing per-event visibility keys.

### 5. Appointment payment status is shown (e.g. "UNPAID") but there's no way to update it

**Status:** Resolved 2026-10-10 — moved to `VERIFY.md` for you to confirm in
the app. Full detail in `PROGRESS.md`/git history. Both pieces below are
done: the `showPaymentStatus` toggle (piece 1) and a real editable Payment
dropdown on the detail panel backed by `PATCH /api/appointments/[id]` (piece
2). (Original write-up kept below for context.) Related to issue #3 above (same shape of
problem - a status field the data model supports but nothing lets you change
after the fact) but a separate enum: this is `PaymentStatus`
(`UNPAID | PAID | WAIVED | REFUNDED`, `prisma/schema.prisma`), not
`AppointmentStatus`.

The appointment detail panel in `SchedulingCalendar.tsx` renders
`appointment.paymentStatus` as plain read-only text (`<dd>{appointment.paymentStatus}</dd>`,
line ~1527) - every appointment defaults to and stays `UNPAID` forever, since
nothing ever sets it to anything else. `PATCH /api/appointments/[id]`'s
validation schema (`src/app/api/appointments/[id]/route.ts`) doesn't accept
`paymentStatus` at all, so there's no path - UI or API - to ever mark one
`PAID`, `WAIVED`, or `REFUNDED`.

**Needs, per the user, two separate pieces:**
1. **A setting to make payment-status tracking toggleable per tenant** -
   same pattern as the other per-tenant display toggles already wired up in
   `AppointmentFormSettings.tsx`/`ShiftFormSettings.tsx` and the
   `tenant-settings` API/Tenant model (e.g. `showJobType`,
   `enableMapsNavigation`). Not every tenant bills per-appointment, so
   whether payment status shows at all should be an admin-configurable
   setting, not always-on.
2. **An actual way to update it** - extend the PATCH route's schema to
   accept `paymentStatus`, gate it behind whatever permission makes sense
   (likely the same `EDIT_APPOINTMENTS`, or a dedicated one if payment
   changes should be restricted more tightly), and add a real control on the
   appointment detail panel (a dropdown in place of the current plain-text
   `<dd>`) so staff/admins can actually mark something paid/waived/refunded
   instead of it being permanently stuck at `UNPAID`.

### 6. Appointment/shift permissions are combined — can't grant or revoke one without the other

**Status:** Resolved 2026-10-02 — moved to `VERIFY.md` for you to confirm in
the app. Full detail in git history / `PROGRESS.md`.

## Bugs / UX fixes

- ~~**The per-role "X/Y granted" permission-count badge doesn't make sense -
  remove it.**~~ **Resolved 2026-10-13 — moved to `VERIFY.md`.** Removed
  entirely (not fixed - the user confirmed the badge itself wasn't useful
  summary information, not just its math).
- ~~**Dashboard's "Upcoming appointments" stat counts shifts too, not just
  appointments.**~~ **Resolved 2026-10-13 — moved to `VERIFY.md`.** Now
  filters on `entryKind: "APPOINTMENT"` (the real source of truth post the
  calendar-split work, not the older `clientId`-based fix this entry
  originally proposed). The optional "separate upcoming shifts stat" idea
  from the original write-up was not built - still undecided, not re-raised
  here as a new ask.
- ~~**"Group by staff" Day view: the time-of-day column on the left
  visually glitches / floats in front of things it shouldn't.**~~
  **Resolved 2026-10-03 — moved to `VERIFY.md`.**

- ~~**"+ Add appointment"/"+ Schedule shift" buttons look out of place at the
  top of the calendar.**~~ **Resolved 2026-10-03 (take 3) — moved to
  `VERIFY.md`.**

- ~~**Selected calendar slot doesn't hold its position while booking an
  appointment vs. shift is still undecided.**~~ **Resolved 2026-10-03 —
  moved to `VERIFY.md`.**

- ~~**The Appointment-vs-Shift chooser is an inline bar at the bottom of the
  page, disconnected from the slot it's asking about.**~~ **Resolved
  2026-10-03 — moved to `VERIFY.md`.**

- ~~**Calendar events render on top of the create/detail popup instead of
  behind it ("events bleed through the form").**~~ **Resolved 2026-10-03 —
  moved to `VERIFY.md`.**

- **Layout shift when opening "+ Add appointment"/"+ Schedule shift".**
  Reported 2026-10-01. First fix (`scrollbar-gutter: stable`) did **not**
  resolve it - user confirmed still happening. Second fix applied (Cancel
  button always rendered via `invisible` toggle instead of conditional
  mount, so its appearance can't change the row's width) - **moved to
  `VERIFY.md` for your browser confirmation**, since it's an applied fix
  awaiting your check, not a closed bug yet. Will come back here if it's
  still happening.

- ~~**Calendar event boxes don't show enough info — appointment events don't
  show which staff member is assigned.**~~ **Resolved 2026-10-02 — moved to
  `VERIFY.md`.**

- ~~**"View only" shouldn't be its own top-level nav link - it only needs to
  be a dropdown option under Calendar.**~~ **Resolved 2026-10-02 — moved to
  `VERIFY.md`.**

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
  independent. **Sharper edge after issue #6's permission split**: the new
  `VIEW_SHIFTS`/`VIEW_APPOINTMENTS` keys are now a hard type-level gate in
  `listAppointmentsInRange` (ANDed, not just OR'd with the all/own scope) -
  a role holding `VIEW_ROSTER` but lacking `VIEW_SHIFTS` entirely would see
  zero shifts on the roster, not even its own, same "not fixed here
  deliberately" reasoning as above.
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
- **`SchedulingCalendar`'s client-fetched UI can't be confirmed by curl alone
  — but real browser verification is possible in this dev environment.**
  Its permissions/staff/events all load via `useEffect` after hydration, so a
  server-rendered curl check always sees `permissions = null` and skips every
  block gated on it. **Updated 2026-10-13**: a headless Chromium (via
  Playwright, installed on demand with `npm install --no-save playwright` +
  `npx playwright install chromium`) does work here and was used to click
  through the calendar-split/custom-calendars work end to end this session -
  screenshots, real clicks/fills, console-error checks, the works. Not a
  standing dependency (removed after each use), so still worth a manual pass
  with specific symptoms for anything that isn't already covered, but "no
  browser available" is no longer true.
- **`WorkingHours` isn't used anywhere yet.** The model exists but nothing
  populates it or constrains bookable times to it — the calendar only
  prevents literal double-booking, not booking outside a staff member's
  actual hours. (This blocks the booking-widget feature in TODO.md too.)
- **No dedicated client manager.** Clients can now be searched/added inline
  from the appointment form (name/email/phone/address, with confirm-address),
  but there's still no standalone admin page to browse, edit, or delete an
  existing client (`EDIT_CLIENTS`/`DELETE_CLIENTS` permissions already exist
  in the catalog, just nothing in the UI calls them yet) - e.g. fixing a typo
  in a client's phone number currently has no path except direct DB access.
