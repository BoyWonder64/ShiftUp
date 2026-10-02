# ShiftUp — Issues

Tracked bugs, data-model problems, and known gaps in what's already built.
Referenced from `TODO.md` (which is feature requests/backlog, not this).
Newest/highest-priority first within each section.

## High priority

### 1. Service types are shared between Appointments and Shifts — need to be separated

**Status:** Open, raised 2026-10-02.

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
`ServiceType` table referenced by both. Likely means either two separate
tables, or one table with a hard scope field (mirroring `EventTagScope`,
see issue #2) enforced everywhere it's read/written - plus splitting
`ServiceTypeManager.tsx` so each settings page (Appointments vs. Shifts) only
shows/edits its own list, and `ShiftFormSettings.tsx`'s "Manage job types"
link points at a shift-owned list instead of the Appointments page's.

### 2. Color tags live under Staff settings — need to be in Shifts/Appointments, separated from Staff

**Status:** Open, raised 2026-10-02.

Uncommitted work-in-progress moved `EventColorSettings.tsx` from the Calendar
settings page to the Staff settings page
(`src/app/(admin)/app/[tenantSlug]/admin/settings/staff/EventColorSettings.tsx`,
new/untracked; the old `calendar/EventColorSettings.tsx` was deleted), on the
reasoning - stated in that file's own top comment - that "color keys/tags are
a staff-scheduling concern."

That's the wrong home. A color tag (`EventTag`, with its
`appliesTo: SHIFT | APPOINTMENT | BOTH` scope) colors an individual
*appointment or shift* on the calendar - it has nothing to do with a staff
member or the Staff settings page (which manages staff profiles/invites).
Bundling it there conflates two unrelated settings surfaces.

**Needs:** move `EventColorSettings` out of Staff settings and into
Shifts/Appointments settings instead - and keep it properly separated once
it's there: don't just drop one shared, undifferentiated list onto a single
page. The `SHIFT`-only, `APPOINTMENT`-only, and `BOTH` tags should be
presented/managed in a way that reflects that Shifts and Appointments are two
distinct surfaces that happen to share the same underlying color-tag
mechanism, not one combined list that doesn't distinguish them.

### 3. No way to update a calendar event after it's created — e.g. logging a no-show

**Status:** Open, raised 2026-10-02.

Once an `Appointment`/shift is created, there's no way to update what
actually happened on it afterward, beyond cancelling it. `AppointmentStatus`
(`prisma/schema.prisma`) already has `PENDING_PAYMENT | BOOKED | COMPLETED |
CANCELLED | NO_SHOW` as real enum values, but `PATCH /api/appointments/[id]`'s
own validation schema only accepts `status: z.enum(["CANCELLED"])`
(`src/app/api/appointments/[id]/route.ts`) - there's no path, API or UI, to
ever mark an event `COMPLETED` or `NO_SHOW`, even though the data model was
already built to support it. A client/staff no-show (or any job that needs a
record of what actually happened, not just what was scheduled) currently has
nowhere to be logged on the event itself.

**Needs:** extend the PATCH route to accept the other status values (with
whatever permission gating makes sense - likely distinct from whatever gates
the existing cancel action), and add a real control on the appointment/shift
detail panel in `SchedulingCalendar.tsx` to set it (today that panel only has
the Cancel button). Probably also wants an optional free-text reason/note
alongside the status change ("why was this a no-show") - overlaps with the
separately-tracked "Notes on an appointment" feature request in `TODO.md`,
though a single reason field here could ship ahead of that fuller multi-note
system.

### 4. Manager dashboard for no-show / shift reporting — needs its own new setting

**Status:** Open, raised 2026-10-02. Depends on issue #3 above - there's
nothing real to report on until events can actually carry a logged outcome.

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
  actual hours. (This blocks the booking-widget feature in TODO.md too.)
- **No dedicated client manager.** Clients can now be searched/added inline
  from the appointment form (name/email/phone/address, with confirm-address),
  but there's still no standalone admin page to browse, edit, or delete an
  existing client (`EDIT_CLIENTS`/`DELETE_CLIENTS` permissions already exist
  in the catalog, just nothing in the UI calls them yet) - e.g. fixing a typo
  in a client's phone number currently has no path except direct DB access.
