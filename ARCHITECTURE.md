# ShiftUp — Architecture Map

A point-in-time map of what exists and where, for orienting fast in a new
session. Not a changelog (`PROGRESS.md`) and not a backlog (`TODO.md`) -
those are where background hides to keep this file short.

**This file only stays true if kept terse and if it points at code rather
than re-describing it.** `prisma/schema.prisma` (doc comments on every
model) and `src/lib/permissions/catalog.ts` (full permission-key list) are
the real source of truth - when this file and the code disagree, the code
wins. Re-grep rather than trust this blindly if something here looks off;
if something's genuinely stale, fix the line rather than leaving it.

## Stack

Next.js (App Router) + TypeScript, Prisma + Postgres, Tailwind v4. No
separate backend service - route handlers under `src/app/api/**/route.ts`
are the entire API, calling into `src/modules/*/service.ts` for business
logic. Local dev Postgres runs via `docker-compose.yml`.

## Core request-handling patterns

- **Auth**: custom scrypt password hashing + HMAC-signed session cookies
  (no external provider). `src/lib/auth/current-user.ts` -
  `getCurrentSession()`, `requireRole([...])`, `requireTenantSession()`
  (throws if not a real tenant user - excludes SUPERADMIN/logged-out).
- **Tenant isolation**: every tenant-scoped DB access goes through
  `src/lib/tenant-context.ts` - `runInTenantContext(tenantId, userId, role,
  fn)` wraps `fn` in a transaction that sets Postgres session vars
  (`app.tenant_id`, `app.is_superadmin`), which Row-Level Security policies
  on every tenant-scoped table enforce as a DB-level backstop independent of
  app code remembering to filter by `tenantId`. `runInSystemContext(fn)` is
  the superadmin/no-tenant escape hatch. The app connects as a **restricted,
  non-superuser** Postgres role (`shiftup_app` / `APP_DATABASE_URL`) -
  migrations run as the privileged `shiftup` role; RLS does nothing against
  a superuser connection, so this split is load-bearing, not cosmetic.
  Proven by an automated test: `src/lib/tenant-context.rls.test.ts`.
- **Permissions**: `src/lib/permissions/catalog.ts` defines `PERMISSION_KEYS`
  (28 keys, e.g. `VIEW_APPOINTMENTS`/`CREATE_STAFF`/`APPROVE_TIME_OFF`) and
  hardcoded per-role defaults. Shifts and appointments are gated by fully
  independent key pairs (`VIEW/CREATE/EDIT/CANCEL_SHIFTS` vs.
  `..._APPOINTMENTS`, ISSUES.md #6) - no single key covers both. `RolePermission`/
  `RoleVisibility` tables let a tenant ADMIN override those defaults per role
  from the Settings page.
  `src/lib/permissions/service.ts` - `hasPermission(tx, tenantId, role, key)`
  is what every route actually calls to gate an action; `canViewRole()`
  exists for the visibility matrix but **nothing calls it yet** (tracked in
  TODO.md). ADMIN always has every permission, not overridable, enforced in
  code not DB.
- **Licensing/feature gating**: `License.tier` (`SHIFT_MANAGEMENT` /
  `APPOINTMENT_MANAGER` / `BOTH`) and `License.billingPlan` (`FREE` /
  `ONE_TIME` / `SUBSCRIPTION`) are independent dimensions.
  `src/lib/licensing/features.ts` turns a tier into
  `{shiftManagement, appointmentManager}` booleans for UI gating.
  `src/lib/licensing/limits.ts` enforces the free-plan caps
  (`assertCanAddStaffProfile`/`assertCanAddAppointment`, throwing
  `PlanLimitError`). `src/lib/licensing/pricing.ts` holds the actual prices.

## Data model

Full detail (fields, relations, doc comments) lives in
`prisma/schema.prisma` - this is just the map of what exists:

| Model | What it is |
|---|---|
| `Tenant` | The business/org. Also holds tenant-wide settings: `requireClientForAppointments`, `enableMapsNavigation`, `logoDataUrl`, `eventColors`, `enabledHolidayNames`, `allowOverlappingShifts`. |
| `User` | Login-capable account. `tenantId` null only for SUPERADMIN. |
| `License` | Entitlement (tier + billing plan), one per tenant. |
| `StaffProfile` | A `User` who can be scheduled; has `WorkingHours` (modeled, **not yet enforced anywhere**). |
| `ServiceType` | A bookable service (duration, price). |
| `Client` | A customer/guest (name, email, phone, address). Guest-first, no login. |
| `Appointment` | One scheduled visit/shift. `clientId` null = shift, not appointment (this is the *only* distinction between the two in the data model - no `kind` column). Has `tagId` → `EventTag` for custom coloring. |
| `EventTag` | Tenant-defined custom color tag assignable to an `Appointment`. `appliesTo` (`SHIFT`/`APPOINTMENT`/`BOTH`, default `BOTH`) scopes which calendar picker it shows up on. |
| `Holiday` | Tenant-added custom holiday (name, date, recurring). Federal holidays are **computed, never stored** - see `src/lib/holidays/federal.ts`. |
| `TimeOff` | Staff leave request + approval workflow. |
| `RolePermission` / `RoleVisibility` | Per-tenant overrides of the hardcoded permission/visibility defaults. |
| `ScheduleTemplate` / `ScheduleTemplateShift` | Reusable shift pattern (paid feature - see `assertScheduleTemplatesEnabled`), applied to any week to generate real `Appointment` rows. Shift is relative to the period (`dayOffset`), not a calendar date. |

Every tenant-scoped table has an RLS policy (see migrations named
`*_enable_rls`/`*_add_restricted_app_role`, and the RLS block appended by
hand to every migration that adds a new tenant-scoped table since).

## Modules (`src/modules/*/service.ts`)

Business logic route handlers call into - route handlers themselves should
stay thin.

| Module | Owns |
|---|---|
| `tenancy` | Creating a `Tenant`. |
| `identity` | Creating/finding `User`s. |
| `licensing` | Creating a free `License` on signup. |
| `scheduling` | Appointment CRUD, the double-booking `EXCLUDE`-constraint handling (`SchedulingConflictError` - DB-enforced for appointments with a client; for clientless shifts the constraint no longer applies and overlap is instead checked in app code, gated on `Tenant.allowOverlappingShifts`), coverage-finder (`findCoverageCandidates`); `templates.ts` - schedule-template CRUD, apply-preview/apply (`planTemplateApply`/`applyTemplate`). |
| `timeoff` | Time-off request/approval, `staffOnApprovedLeave()` (feeds the coverage finder). |

## API routes (`src/app/api/**/route.ts`)

Auth column: **session** = any logged-in tenant user; a permission key =
gated by `hasPermission` on that key; **ADMIN** = `requireRole(["ADMIN"])`.

| Route | Methods | Auth | Purpose |
|---|---|---|---|
| `/api/auth/signup` | POST | — | Create tenant + admin user + free license. |
| `/api/auth/login`, `/api/auth/logout` | POST | — / session | Session cookie issue/clear. |
| `/api/me/permissions` | GET | session | Caller's own effective permission map - what the client UI gates on. |
| `/api/admin/permissions` | GET, PUT | ADMIN | Read/edit the tenant's permission + visibility matrix. |
| `/api/admin/logo` | POST, DELETE | ADMIN | Upload/remove the tenant logo (stored as a `data:` URL, no blob storage). |
| `/api/tenant-settings` | GET, PUT | session (GET) / ADMIN (PUT) | `requireClientForAppointments`, `enableMapsNavigation`, `eventColors`, `enabledHolidayNames`, `allowOverlappingShifts` - one settings bucket, partial-update PUT. |
| `/api/staff` | GET, POST | `VIEW_STAFF` / `CREATE_STAFF` | List/add staff (never serialize `passwordHash` - see PROGRESS.md for the bug this caused once). |
| `/api/service-types` | GET, POST | `VIEW_SERVICES` / `CREATE_SERVICES` | |
| `/api/clients` | GET, POST | `VIEW_CLIENTS` / `CREATE_CLIENTS` | |
| `/api/appointments` | GET, POST | `VIEW_SHIFTS`+`VIEW_APPOINTMENTS` / `CREATE_SHIFTS` or `CREATE_APPOINTMENTS` (by row type) | List in a date range (each row type gated independently, not just all/own-scoped); create (enforces free-plan cap). |
| `/api/appointments/[id]` | GET, PATCH | `VIEW_SHIFTS`/`VIEW_APPOINTMENTS` (by row type) / varies by field and row type (`EDIT_SHIFTS`/`EDIT_APPOINTMENTS`, `CANCEL_SHIFTS`/`CANCEL_APPOINTMENTS`, `EDIT_JOB_ESTIMATES`) | One PATCH handles reschedule, cancel, reassign, estimates, location, tag. |
| `/api/appointments/[id]/coverage` | GET | `EDIT_SHIFTS` or `EDIT_APPOINTMENTS` (by row type) | Who can cover this shift (see `findCoverageCandidates`). |
| `/api/time-off`, `/api/time-off/[id]` | GET/POST, PATCH | session / `APPROVE_TIME_OFF` | Request + approve/deny. |
| `/api/event-tags`, `/api/event-tags/[id]` | GET/POST, DELETE | session+`CREATE_SHIFTS`/`CREATE_APPOINTMENTS` (by the tag's own `appliesTo`) / ADMIN | Custom color tags - **not yet consumed by the calendar UI**, see TODO.md. |
| `/api/holidays`, `/api/holidays/[id]` | GET/POST, DELETE | session / ADMIN | Custom holidays - **not yet consumed by the calendar UI**, see TODO.md. |
| `/api/schedule-templates`, `/[id]`, `/[id]/clone` | GET/POST, GET/PATCH/DELETE, POST | `VIEW`/`CREATE`/`EDIT`/`DELETE_SCHEDULE_TEMPLATES` | Template CRUD + clone. Paid feature - every route also calls `assertScheduleTemplatesEnabled` (403s on `FREE`). |
| `/api/schedule-templates/[id]/shifts`, `/[shiftId]` | POST, PATCH/DELETE | `EDIT_SCHEDULE_TEMPLATES` | A template's shift rows. |
| `/api/schedule-templates/[id]/apply` | POST | `APPLY_SCHEDULE_TEMPLATES` | `{periodStart, dryRun}` - preview or real apply (see `planTemplateApply`/`applyTemplate`). |
| `/api/billing/checkout` | POST | ADMIN | Stripe Checkout session (one-time or subscription). |
| `/api/billing/webhook` | POST | Stripe signature | Confirms payment, updates `License`. |

## Frontend route map

`src/app/(admin)/app/[tenantSlug]/` - all server components fetching their
own data via `runInTenantContext`, rendering the shared `AppHeader`
(`src/components/AppHeader.tsx`):

- `dashboard` — access summary + stat cards.
- `calendar` — the main scheduling UI (`SchedulingCalendar.tsx`, by far the
  largest client component in the app).
- `calendar/view` — read-only variant (ignores the viewer's real permissions).
- `calendar/roster` — manager-facing per-employee drill-down, gated on
  `VIEW_ROSTER`. See ISSUES.md's "Known gaps" for an interaction a role
  holding `VIEW_ROSTER` without `VIEW_ALL_SHIFTS`/`VIEW_ALL_APPOINTMENTS`
  runs into.
- `time-off` — request/approve UI.
- `schedule-templates` — reusable shift-pattern builder + apply-to-a-week UI
  (`ScheduleTemplatesView.tsx`), gated on `VIEW_SCHEDULE_TEMPLATES` and a
  paid `License.billingPlan` (shows an upgrade card instead on `FREE`).
- `billing` — plan display + pricing deck (`PricingDeck.tsx`).
- `admin/settings` — Settings, split across a landing page of links
  (`page.tsx`) plus one page per section under a shared `layout.tsx`
  (auth/tenant lookup + `AppHeader` + `SettingsNav` tabs). Reachable by any
  signed-in tenant member (ADMIN or STAFF), not just ADMIN - which sections a
  given member sees is decided per-section by `sections.ts`' `requirement`
  (`"ALWAYS"`, `"ADMIN"`, or an existing `PermissionKey`) and enforced
  server-side by `access.ts`'s `getSettingsContext`/`requireSettingsSection`,
  not just hidden from the nav: `appointments` (`AppointmentFormSettings` -
  ADMIN-only card, `ServiceTypeManager` - gated on `VIEW_SERVICES`), `shifts`
  (`ShiftFormSettings` - ADMIN-only), `calendar`
  (`EventColorSettings`/`EventTagManager`, `HolidaySettings` - ADMIN-only),
  `company-profile` (`LogoSettings` - ADMIN-only), `staff` (`StaffManager` -
  gated on `VIEW_STAFF`), `permissions` (`RolesAndPermissionsEditor`,
  `RoleDetailPanel` - hardcoded ADMIN-only, never permission-delegable, since
  a role could otherwise grant itself more permissions), `account`
  (`ChangePasswordForm`, `LanguageSettingsForm` - every role, never gated).
  Was one long page at `admin/users` before 2026-10-02 - see PROGRESS.md.

## Where the narrative detail lives

- **`PROGRESS.md`** — chronological "what was built, why, and what's
  actually verified vs. just code-reviewed." Read it for history and
  verification confidence; don't use it to answer "what does route X do
  right now" - routes get touched across multiple entries over time, this
  file is the current-state answer to that question instead.
- **`TODO.md`** — the open backlog, organized by category.
