# ShiftUp — Progress Notes

Handoff snapshot. Full original architecture lives in the plan doc:
`C:\Users\Maitland\.claude\plans\i-would-like-to-encapsulated-crayon.md` — that
doc describes the original single-tier pricing/3-role model and doesn't yet
reflect the pricing, role, and permission-model changes below. This file is
the current source of truth until that's reconciled.

## Environment state (as left)

- Docker Desktop installed and running; local Postgres container up and fully migrated.
- Dev server runs via `npm run dev` on http://localhost:3000.
- **Windows-specific gotcha**: stopping the `npm run dev` background task doesn't always kill its child Next.js/Turbopack processes. If `prisma generate` or `prisma migrate` fails with `EPERM ... query_engine-windows.dll.node`, check `Get-Process node` and kill stray ones (excluding unrelated ones like Adobe's bundled node.exe) before retrying.
- Nothing has been committed to git yet, by design (only commit when explicitly asked).

## Completed and verified this session

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

**A real, user-reported bug found and fixed**: drag-and-drop wasn't holding its position and Day/Week/Month + Today/Back/Next navigation didn't work. Root cause: the `dateFnsLocalizer` setup had `startOfWeek: () => startOfWeek(new Date(), { locale: enUS })` - a wrapper that ignores whatever date the calendar asks about and always returns the start of *today's* real-world week. Since `dateFnsLocalizer` calls this internally for every week-boundary calculation, that one line broke navigation, view switching, and drag/drop positioning simultaneously - all of them depend on correct week-boundary math. Fixed by passing the plain imported `startOfWeek` function directly (the documented, canonical way to configure `dateFnsLocalizer`).

**Important caveat on what "verified" means here**: `SchedulingCalendar` is a client component whose permissions/staff/events all load via `useEffect` after hydration. A curl check of the server-rendered HTML always sees `permissions = null` at that point, so it can only ever confirm static, unconditional markup (e.g. the legend) - it cannot confirm the two new buttons, the staff filter, event colors, or drag/resize/navigation actually work on screen. Those are correct by code review and the localizer bug's root cause is well understood, but **only the user's own browser can confirm the fix actually resolved what they saw** - flagged this limitation explicitly rather than claiming a "verified live" I can't back up.

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

## Known gaps / not yet done

See `TODO.md` for the full backlog (new feature requests, known gaps, and the
rest of the original roadmap) — kept separate from this file so status and
backlog don't get tangled together.

## Picking this back up

Everything currently in the repo builds, lints, typechecks, and passes tests
as of this handoff. See `TODO.md` for what's next and still open.
