# ShiftUp

ShiftUp is a multi-tenant scheduling app for small businesses that need to
manage both **staff shifts** and **client appointments** on a shared
calendar — think a hair salon rostering stylists while also booking
customer appointments, or a field-service company scheduling crews and
jobs side by side.

Each business signs up as its own tenant with isolated data (enforced at
the database level via Postgres Row-Level Security, not just application
filtering). Within a tenant, an admin configures roles and permissions,
staff members, service types, and the calendar, while staff see only what
their role grants them.

## Core features

- **Shared scheduling calendar** — shifts (internal staff time) and
  appointments (client-facing bookings) live on one calendar, with
  independent create/view/edit/cancel permissions for each.
- **Role-based permissions** — a configurable permission matrix per
  tenant, not just a fixed set of roles.
- **Staff & client management** — staff profiles with working hours,
  guest-first client records (no login required for clients).
- **Time off** — request/approval workflow that feeds into shift coverage
  suggestions.
- **Schedule templates** — reusable weekly shift patterns that can be
  applied to any week (paid feature).
- **Holidays** — federal holidays computed automatically, plus
  tenant-defined custom holidays.
- **Billing** — Stripe-powered licensing with free, one-time, and
  subscription tiers gating features like schedule templates.
- **Multi-language support** — infrastructure for per-user language
  preference (English, Spanish, German, French), rolling out page by page.

## Tech stack

- [Next.js](https://nextjs.org) (App Router) + TypeScript
- [Prisma](https://www.prisma.io) + PostgreSQL (with Row-Level Security
  for tenant isolation)
- [Tailwind CSS](https://tailwindcss.com) v4
- [Stripe](https://stripe.com) for billing
- [next-intl](https://next-intl.dev) for i18n
- [Vitest](https://vitest.dev) for testing

For a deeper map of the codebase (auth, permissions, data model, API
routes, frontend structure), see [ARCHITECTURE.md](ARCHITECTURE.md).

## Getting started

### Prerequisites

- Node.js
- Docker (for local Postgres via `docker-compose.yml`)

### Setup

1. Start the local database:

   ```bash
   docker compose up -d
   ```

2. Copy the environment template and fill in secrets:

   ```bash
   cp .env.example .env
   ```

   See `.env.example` for details on each variable (database URLs, auth
   secret, Stripe test keys, etc).

3. Install dependencies and run migrations:

   ```bash
   npm install
   npx prisma migrate dev
   ```

4. Start the dev server:

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000) to see the app.

### Other useful commands

```bash
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit
npm test           # Vitest
```

## Project docs

- [ARCHITECTURE.md](ARCHITECTURE.md) — map of the stack, data model, API
  routes, and frontend structure.
- [TODO.md](TODO.md) — open backlog and feature requests.
- [ISSUES.md](ISSUES.md) — known bugs and gaps.
- [PROGRESS.md](PROGRESS.md) — chronological build log.
- [SECURITY.md](SECURITY.md) — security notes.

## Screenshots

<!-- Add screenshots of the app here, e.g.: -->
<!-- ![Dashboard](docs/screenshots/dashboard.png) -->
<!-- ![Scheduling Calendar](docs/screenshots/calendar.png) -->
