# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

EventHub is a full-stack event ticket booking platform built for QA/test-automation training. Users sign up, browse events, book tickets, and manage bookings. Each user operates in an isolated sandbox (own events/bookings; static seeded events are shared read-only).

Domain knowledge (business rules, API reference, data models, UI selectors, user flows) lives in the `eventhub-domain` skill (`.claude/skills/eventhub-domain/`) — load it rather than re-deriving business rules from code. Playwright conventions live in the `playwright-best-practices` skill.

## Commands

```bash
npm run setup        # Install deps in both backend/ and frontend/
npm run dev           # Start backend (3001) + frontend (3000) concurrently
npm run seed           # Seed 10 static events (backend/prisma/seed.js)
npm run db:push        # Push Prisma schema to DB, no migration files (non-interactive)
npm run migrate         # prisma migrate dev (interactive, creates migration files)
npm run build            # Build the Next.js frontend
npm run lint               # next lint (frontend)

npm run test           # Run all Playwright tests
npm run test:ui         # Playwright UI mode
npm run test:report      # Open last HTML report
npx playwright test tests/<file>.spec.js --reporter=line   # Run a single test file
```

Backend-only commands run from `backend/`: `npm run dev` (nodemon), `npx prisma studio`, `npx prisma generate`, `npx prisma format`.

## Architecture

Layered backend, standard Next.js App Router frontend:

```
backend/
  app.js / server.js          Express app wiring / HTTP server + graceful shutdown
  src/routes/       -> src/controllers/ -> src/services/ -> src/repositories/ -> Prisma
  src/middleware/    authMiddleware (JWT Bearer), errorHandler (maps domain errors -> HTTP), requestLogger
  src/validators/    express-validator chains per resource
  src/utils/errors.js  NotFoundError, InsufficientSeatsError, ValidationError, etc.
  prisma/schema.prisma  User / Event / Booking models

frontend/
  app/                Next.js 14 App Router pages (login, register, events, bookings, admin)
  components/ui/      Reusable primitives (Button, Modal, Toast, Pagination, ...)
  lib/api/            Axios client + per-resource API modules
  lib/hooks/          React Query hooks (useAuth, useEvents, useBookings, ...)
```

Routes are a thin HTTP layer; all validation and business logic sit in `services/`; `repositories/` are pure Prisma data access with no business logic. Follow this layering when adding backend features — don't put query logic in controllers or business rules in repositories.

Auth is JWT (7-day expiry, `Authorization: Bearer <token>`), password hashing via bcryptjs. `authMiddleware` populates `req.user` from the token.

## Testing setup — important gotcha

`playwright.config.ts` points `baseURL` at the **live deployed site** (`https://eventhub.rahulshettyacademy.com`), not localhost, and `.github/workflows/playwright.yml` runs the suite against that same live URL on every push to `main`. `fullyParallel` is disabled and there's a single chromium project. Don't assume tests need a local `npm run dev` server running — they hit production by default unless you deliberately override `baseURL`.

Test users (already provisioned on the live site): `rahulshetty1@gmail.com` / `Magiclife1!` (primary), `rahulshetty1@yahoo.com` / `Magiclife1!` (cross-user tests).

All tests currently live in `tests/booking-management.spec.js`; new specs should follow the `tests/<feature-name>.spec.js` naming convention. Locator priority: `data-testid` > role > label/placeholder > id > CSS class — full guidance in the `playwright-best-practices` skill.

## CI

- `ci.yml` runs on every PR to `main` (and is reused by `deploy.yml` as a pre-deploy gate): backend syntax + Prisma validate/format/generate checks, an SSH-based Prisma schema-drift check against the production DB, and frontend typecheck + build. No database is spun up in CI — Prisma steps use a placeholder `DATABASE_URL`.
- `playwright.yml` runs the full E2E suite against the live production site on push to `main` and uploads the HTML report as a 30-day artifact.
- Prisma schema must be pre-formatted (`npx prisma format`) before committing — CI fails on unformatted `schema.prisma`.
