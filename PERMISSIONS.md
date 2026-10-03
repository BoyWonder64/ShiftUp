# ShiftUp — Permissions

How access control actually works today, where it's enforced, and what's
worth improving. Companion to `ARCHITECTURE.md` (which has this in summary
form) - this file is the full writeup. When this file and the code disagree,
the code wins: `src/lib/permissions/catalog.ts`, `src/lib/permissions/service.ts`,
and `prisma/schema.prisma`'s doc comments are the real source of truth.

## The three-tier identity model

Every `User` has a `role: UserRole` of `SUPERADMIN | ADMIN | STAFF`
(`prisma/schema.prisma`). Only the third is configurable:

- **SUPERADMIN** — platform operator, not tied to any tenant (`tenantId` is
  null). Outside the permission system entirely; `runInSystemContext` is the
  escape hatch it uses instead of `runInTenantContext`.
- **ADMIN** — a tenant's owner/administrator. Hardcoded, not a row in any
  table. Unconditionally has every permission and can see every role, bypasses
  every rank/visibility check - enforced in code (`hasPermission`,
  `canViewRole`, and now the staff-management routes - see below), never in
  the database. There is no `isAdmin` column anywhere; the only signal is
  `User.role === "ADMIN"`. `User.isOwner` is a separate, cosmetic-only flag
  (the "Owner" badge on the account that originally signed up the tenant) -
  it is not checked by any authorization logic.
- **STAFF** — everyone else. A STAFF user's actual role is a tenant-defined
  `Role` row via `User.roleId` - fully custom per tenant (name, description,
  what it can do, who it can see), not picked from a fixed list. New roles
  start with **zero** grants (deny-by-default) until an admin explicitly
  turns some on.

Only ADMIN and SUPERADMIN exist as fixed concepts. A tenant can have as many
custom `Role`s as it wants, and can rename/delete/recreate them freely -
nothing else in the app hardcodes a role name (the "Manager/Supervisor/
Employee/Customer" starter roles are just a seed at signup, see below, not a
fixed enum).

## The permission-key catalog

`src/lib/permissions/catalog.ts` defines `PERMISSION_KEYS` - currently 34
keys, one **action** per key (`VIEW_STAFF`, `CREATE_STAFF`, `EDIT_STAFF`,
`DELETE_STAFF`, `VIEW_APPOINTMENTS`, `CANCEL_SHIFTS`, `APPROVE_TIME_OFF`,
etc.), never a combined "manage X" key. This is deliberate: a tenant can
grant "view clients" without "delete clients," and shifts/appointments are
two fully independent key pairs (`VIEW/CREATE/EDIT/CANCEL_SHIFTS` vs.
`..._APPOINTMENTS`) rather than one shared pair, since a role that should see
shifts but not client appointments (or vice versa) is a real, common case.

Two tables back actual grants, both per-tenant and keyed by the real `Role`
row (never by role *name*, so renaming a role never loses its permissions):

- **`RolePermission`** — `(roleId, permissionKey) → granted`. A missing row
  means **denied** - there is no hardcoded fallback matrix consulted at
  runtime (there used to be, back when roles were a fixed enum; a brand-new
  tenant-defined role has no inherent defaults).
- **`RoleVisibility`** — `(viewerRoleId, targetRoleId) → canView`, i.e. "can
  Role A see Role B's schedule/data." A role always implicitly sees its own
  data (never stored as a row).

### Starter seed, not a runtime fallback

`DEFAULT_STARTER_ROLE_PERMISSIONS`/`DEFAULT_STARTER_ROLE_VISIBILITY` in
`catalog.ts` are what `seedDefaultRolesForTenant` writes into
`RolePermission`/`RoleVisibility` **once, at signup**, for the four starter
roles (Manager/Supervisor/Employee/Customer). After that moment they're just
ordinary stored grants like any admin-created role's - nothing re-consults
the catalog's defaults later. An admin can change or delete every one of
them starting day one.

## Enforcement: `hasPermission`

`src/lib/permissions/service.ts`'s `hasPermission(tx, tenantId, role, roleId, key)`
is the single entry point almost every route calls:

```ts
if (role === "ADMIN" || role === "SUPERADMIN") return true;
return hasPermissionByRoleId(tx, tenantId, roleId, key); // looks up one RolePermission row
```

That's the whole algorithm. `canViewRole`/`canViewRoleById` follow the same
shape for the visibility matrix.

**Known gap:** `canViewRole()` exists, has a full admin UI
(`RoleDetailPanel`'s "Who {role} can see" section) and a full API
(`/api/admin/permissions`'s `visibilityUpdates`), but **nothing in the app
actually calls it to filter data yet** - see "Worth improving" below.

## Where this is enforced

- **API routes** (`src/app/api/**/route.ts`): the standard pattern is
  `requireTenantSession()` to get `{ role, roleId, tenantId }`, then inside
  `runInTenantContext`, `await hasPermission(tx, tenantId, role, roleId, "SOME_KEY")`
  and throw if false. A handful of routes (`/api/admin/permissions`,
  `/api/roles*`, staff promote/demote, company profile, billing) skip
  `hasPermission` entirely and call `requireRole(["ADMIN"])` directly, or
  check `session.role !== "ADMIN"` inline - see "The ADMIN-only boundary"
  below for exactly which ones and why.
- **Settings sub-nav** (`src/app/(admin)/app/[tenantSlug]/admin/settings/`):
  `sections.ts` declares one `requirement` per section - `"ALWAYS"` (every
  signed-in user, e.g. Account), `"ADMIN"` (hardcoded), or an existing
  `PermissionKey`. `access.ts`'s `getSettingsContext`/`requireSettingsSection`
  evaluates that requirement both to build the visible nav and, separately,
  server-side inside each section's own `page.tsx` - so hiding a link is
  never the only thing standing between a STAFF user and that page.
- **Frontend gating** (e.g. `StaffManager.tsx` checking `/api/me/permissions`
  for the caller's own role) is UX only, never the real boundary - the
  server-side check in the route is what actually matters. Every client
  component that filters options based on the caller's role/permissions says
  so in a comment next to the filter, specifically so nobody mistakes it for
  enforcement.

## The ADMIN-only boundary

Two separate things in this app are **hardcoded** to ADMIN, not delegable
through `RolePermission` no matter what a tenant grants a custom role:

### 1. Managing roles and permissions themselves

Creating/renaming/deleting a `Role` (`POST/PATCH/DELETE /api/roles*`) and
reading/editing the permission + visibility matrix
(`GET/PUT /api/admin/permissions`) all call `requireRole(["ADMIN"])`
directly - plain `UserRole` string comparison, never `hasPermission`. The
Permissions settings section (`sections.ts`) is likewise hardcoded
`"ADMIN"`. This is deliberate and explained inline at each call site:
granting a tenant-defined role the ability to edit this matrix would let
that role hand itself (or any other role) more access, so there is no
permission key that can turn it on. **This has always been true in this
codebase** - there is no gap here to close.

### 2. Reassigning a staff member's role, and acting on a staff account

**Changed 2026-10-03.** `PATCH /api/staff/[id]` (role reassignment),
`POST /api/staff` (creating staff, which also assigns a role), and
`DELETE /api/staff/[id]` used to layer a second check on top of
`EDIT_STAFF`/`CREATE_STAFF`/`DELETE_STAFF`: `Role.level`, an integer
seniority rank, with `canManageRoleAssignment`/`canActOnStaffMember`
(`src/lib/permissions/service.ts`) requiring the actor's own role to
strictly outrank the role being touched. The reasoning was sound (a
permission key like `EDIT_STAFF` says nothing about *which* role is being
handed out, so without some second check any role holding that one ordinary
permission could promote someone to the most-privileged custom role in the
tenant) - but the "Rank" number in the admin UI had no intuitive meaning to
a non-technical admin, and got in the way more than it protected anything.

It's been removed - `Role.level` is gone from the schema entirely
(migration `20261003172043_remove_role_level`), along with
`canManageRoleAssignment`/`canActOnStaffMember`. In its place, those three
routes now just check `session.role !== "ADMIN"` directly. **Practical
effect:** adding a staff account, reassigning anyone's role, and removing a
staff account are now ADMIN-only outright, same as promote/demote always
were. A STAFF role can still be granted `VIEW_STAFF` to see the staff
directory (read-only) on the Staff settings page, but the page's "Add
staff" form and the per-row role-reassign/"Remove" controls only render for
ADMIN now (`StaffManager.tsx`).

## Settings pages: who can reach what today

| Section | `sections.ts` requirement | Notes |
|---|---|---|
| Account | `ALWAYS` | Every signed-in user, never gated. |
| Staff | `VIEW_STAFF` | View-only for non-admins now - see above. |
| Appointments | `VIEW_SERVICES` | `ServiceTypeManager` is delegable; the form-toggle card only renders `if (isAdmin)`. |
| Shifts | `ADMIN` (hardcoded) | Not delegable at all, unlike Staff/Appointments/Calendar - see "Worth improving." |
| Calendar | `EDIT_CALENDAR_SETTINGS` | Added 2026-10-03 - the most recent example of promoting a section from hardcoded ADMIN to a real delegable permission key. |
| Company Profile | `ADMIN` (hardcoded) | Logo/branding. |
| Permissions | `ADMIN` (hardcoded) | See "The ADMIN-only boundary" above - deliberately never delegable. |

## Worth improving

Concrete, non-speculative gaps found while writing this up - none of these
are implemented, just flagged for a decision:

1. **The "who can see who" visibility matrix doesn't do anything yet.**
   `RoleVisibility`, `canViewRole`/`canViewRoleById`, the full
   `/api/admin/permissions` visibility payload, and the "Who {role} can
   see" checklist in `RoleDetailPanel` are all built and wired end-to-end -
   but no route or page actually calls `canViewRole` to filter what data a
   viewer sees. An admin can check/uncheck those boxes today and nothing
   changes. This is the most actively misleading part of the current admin
   experience, since the UI gives no indication it's inert. Worth either
   wiring it into the obvious place (`listAppointmentsInRange`'s visibility
   filtering in `src/modules/scheduling/service.ts`, which already does an
   all/own-scoped filter) or, short of that, noting on the page that it's
   not yet enforced.

2. **`CREATE_STAFF`/`EDIT_STAFF`/`DELETE_STAFF` are now inert for every
   non-admin role.** A direct consequence of today's change: those three
   permission checkboxes in the "Staff" row of the permission matrix
   (`RolesAndPermissionsEditor.tsx`) are still checked first in the
   corresponding routes, but every one of those routes *also* now requires
   `session.role === "ADMIN"` - so granting a custom role `CREATE_STAFF` (or
   `EDIT_STAFF`/`DELETE_STAFF`) has zero practical effect; only `VIEW_STAFF`
   still does anything for a STAFF role. Worth deciding deliberately rather
   than leaving as a trap for a future admin: either grey out/remove those
   three checkboxes now that they can't be turned on for anyone but ADMIN
   (who doesn't need them), or reintroduce a narrower, more legible
   delegation mechanism than rank ever was, if delegated staff management
   turns out to be wanted after all.

3. **Shifts settings is the one section still hardcoded ADMIN-only with no
   permission-key alternative.** Staff (`VIEW_STAFF`), Appointments
   (`VIEW_SERVICES`), and Calendar (`EDIT_CALENDAR_SETTINGS`) all have a
   real delegable key; Shifts does not, so there's no way for a tenant to
   let a non-admin role manage the shift-form toggles the way it already
   can for the equivalent appointment-form toggles. Inconsistent, not
   wrong - worth a decision whether that's intentional (shift-wide settings
   are considered more sensitive) or just hasn't been done yet.

4. **No audit trail for permission changes.** `RolePermission.updatedAt`
   tracks the last change per row, but there's no log of *who* changed a
   given role's grants, or a history of what a role used to be able to do.
   Low priority unless compliance/audit becomes a requirement, but worth
   knowing it doesn't exist.

5. **"ADMIN-only" is re-implemented at each call site, not centralized.**
   `requireRole(["ADMIN"])`, `role === "ADMIN"`, and
   `session.role !== "ADMIN"` all appear independently across
   `access.ts`, `/api/admin/permissions`, `/api/roles*`,
   `/api/tenant-settings`, and the three staff routes touched today. Not a
   bug - they all agree - but a shared helper (or at least a single
   documented idiom) would make it easier to audit that they still agree
   the next time one of these routes changes.
