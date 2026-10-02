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
  (20 keys, e.g. `VIEW_APPOINTMENTS`/`CREATE_STAFF`/`APPROVE_TIME_OFF`) and
  hardcoded per-role defaults. `RolePermission`/`RoleVisibility` tables let a
  tenant ADMIN override those defaults per role from the Settings page.
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
| `Tenant` | The business/org. Also holds tenant-wide settings: `requireClientForAppointments`, `enableMapsNavigation`, `logoDataUrl`, `eventColors`, `showFederalHolidays`. |
| `User` | Login-capable account. `tenantId` null only for SUPERADMIN. |
| `License` | Entitlement (tier + billing plan), one per tenant. |
| `StaffProfile` | A `User` who can be scheduled; has `WorkingHours` (modeled, **not yet enforced anywhere**). |
| `ServiceType` | A bookable service (duration, price). |
| `Client` | A customer/guest (name, email, phone, address). Guest-first, no login. |
| `Appointment` | One scheduled visit/shift. `clientId` null = shift, not appointment (this is the *only* distinction between the two in the data model - no `kind` column). Has `tagId` → `EventTag` for custom coloring. |
| `EventTag` | Tenant-defined custom color tag assignable to an `Appointment`. |
| `Holiday` | Tenant-added custom holiday (name, date, recurring). Federal holidays are **computed, never stored** - see `src/lib/holidays/federal.ts`. |
| `TimeOff` | Staff leave request + approval workflow. |
| `RolePermission` / `RoleVisibility` | Per-tenant overrides of the hardcoded permission/visibility defaults. |

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
| `scheduling` | Appointment CRUD, the double-booking `EXCLUDE`-constraint handling (`SchedulingConflictError`), coverage-finder (`findCoverageCandidates`). |
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
| `/api/tenant-settings` | GET, PUT | session (GET) / ADMIN (PUT) | `requireClientForAppointments`, `enableMapsNavigation`, `eventColors`, `showFederalHolidays` - one settings bucket, partial-update PUT. |
| `/api/staff` | GET, POST | `VIEW_STAFF` / `CREATE_STAFF` | List/add staff (never serialize `passwordHash` - see PROGRESS.md for the bug this caused once). |
| `/api/service-types` | GET, POST | `VIEW_SERVICES` / `CREATE_SERVICES` | |
| `/api/clients` | GET, POST | `VIEW_CLIENTS` / `CREATE_CLIENTS` | |
| `/api/appointments` | GET, POST | `VIEW_APPOINTMENTS` / `CREATE_APPOINTMENTS` | List in a date range; create (enforces free-plan cap). |
| `/api/appointments/[id]` | GET, PATCH | `VIEW_APPOINTMENTS` / varies by field (`EDIT_APPOINTMENTS`, `CANCEL_APPOINTMENTS`, `EDIT_JOB_ESTIMATES`) | One PATCH handles reschedule, cancel, reassign, estimates, location, tag. |
| `/api/appointments/[id]/coverage` | GET | `EDIT_APPOINTMENTS` | Who can cover this shift (see `findCoverageCandidates`). |
| `/api/time-off`, `/api/time-off/[id]` | GET/POST, PATCH | session / `APPROVE_TIME_OFF` | Request + approve/deny. |
| `/api/event-tags`, `/api/event-tags/[id]` | GET/POST, DELETE | session+`CREATE_APPOINTMENTS` / ADMIN | Custom color tags - **not yet consumed by the calendar UI**, see TODO.md. |
| `/api/holidays`, `/api/holidays/[id]` | GET/POST, DELETE | session / ADMIN | Custom holidays - **not yet consumed by the calendar UI**, see TODO.md. |
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
- `calendar/roster` — manager-facing per-employee drill-down (ADMIN/MANAGER/
  SUPERVISOR only, role-hardcoded not permission-key-gated - see TODO.md).
- `time-off` — request/approve UI.
- `billing` — plan display + pricing deck (`PricingDeck.tsx`).
- `admin/settings` — Settings, split across a landing page of links
  (`page.tsx`) plus one page per section under a shared `layout.tsx`
  (auth/tenant lookup + `AppHeader` + `SettingsNav` tabs, all ADMIN-only):
  `appointments` (`AppointmentFormSettings`, `ServiceTypeManager`), `shifts`
  (`ShiftFormSettings`), `calendar` (`EventColorSettings`/`EventTagManager`,
  `HolidaySettings`), `company-profile` (`LogoSettings`), `staff`
  (`StaffManager`), `permissions` (`RolesAndPermissionsEditor`, `RoleDetailPanel`),
  `account` (`ChangePasswordForm`). Was one long page at `admin/users`
  before 2026-10-02 - see PROGRESS.md.

## Where the narrative detail lives

- **`PROGRESS.md`** — chronological "what was built, why, and what's
  actually verified vs. just code-reviewed." Read it for history and
  verification confidence; don't use it to answer "what does route X do
  right now" - routes get touched across multiple entries over time, this
  file is the current-state answer to that question instead.
- **`TODO.md`** — the open backlog, organized by category.
