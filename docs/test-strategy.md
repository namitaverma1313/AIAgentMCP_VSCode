# Test Strategy — Booking Management

Input: `docs/test-scenarios.md` (65 scenarios, TC-001–TC-510). Consumed by `/generate-tests`.

## Tooling gap (read this before generating tests)

The repo has **only Playwright** installed (root `package.json`: `@playwright/test`, `concurrently`). No Jest, Vitest, or React Testing Library exists in `frontend/package.json` or `backend/package.json`, and no `*.test.js` convention exists anywhere in the tree.

Practical consequence for `/generate-tests`:
- **E2E** tests can be written today (existing pattern in `tests/booking-management.spec.js`).
- **API** tests can be written today using Playwright's `request` fixture (`APIRequestContext`) against the backend REST endpoints — no new tooling required. This is the layer most of the scenarios below should land on, and it's currently at zero tests.
- **Unit** and **Component** tests are not executable as-is. Standing them up requires adding Jest (or Vitest) + `ts-jest`/`babel-jest`, and `@testing-library/react` for component tests, plus wiring a script in `frontend/package.json`. Until that lands, scenarios assigned to Unit/Component below are the *target* layer; treat them as backlog for the harness, not as work `/generate-tests` can emit immediately. Flag this explicitly rather than silently writing them as E2E, which would defeat the purpose of the assignment.
- One specific blocker for Unit testing the frontend: the client-side `validate()` function in `frontend/app/events/[id]/page.tsx:88-95` is an inline closure inside `BookingForm`, not an exported pure function. It can't be unit tested without extracting it first. Recommend the extraction as a prerequisite to unlock TC-308–TC-311 as true unit tests instead of Component tests.

## Distribution

| Layer | Count | Focus | Est. time (per test / total) |
|---|---|---|---|
| Unit | 3 | Pure functions: booking-ref generation, JWT verification logic | ~2 min / ~6 min |
| Component | 27 | Form validation, refund-eligibility state machine, loading/empty/error states, stepper bounds, cancel dialogs | ~5 min / ~135 min |
| API | 31 | Business rules, validation contracts, security/ownership checks, pagination, error codes | ~5 min / ~155 min |
| E2E | 4 | Critical full-stack journeys against the live site | ~12 min / ~48 min |
| **Total** | **65** | | **~344 min (~5.7 hrs)** |

Shape: wide at Component/API, narrow at E2E — inverted from the current suite, which has 6 E2E tests and 0 API/Component/Unit tests (see Anti-Patterns below).

## Critical rules tested at multiple layers (defense-in-depth)

| Rule | Layers | Why both |
|---|---|---|
| Cross-user booking access denied | API (TC-200) + E2E (TC-200) | API proves the 403 contract (`bookingService.getBookingById`, `backend/src/services/bookingService.js:54-59`); E2E proves the real two-session, real-JWT flow renders "Access Denied" in the actual UI — a security boundary is worth the redundant coverage. |
| Booking reference format (`[TITLE_FIRST_CHAR]-[6_ALNUM]`) | Unit (TC-003, TC-109) + one incidental E2E assertion inside TC-001 | Unit isolates `randomRef`/`generateUniqueRef` (`backend/src/services/bookingService.js:11-32`) with zero I/O; TC-001's E2E happy path already surfaces a real `bookingRef` on the confirmation card, so asserting the pattern there is free — no need for a *dedicated* E2E test (see Anti-Patterns: this is what the existing suite gets wrong). |
| Insufficient-seats rejection | API (TC-300, TC-319, TC-400) + Component (TC-301, TC-402 UI cap) | API proves the server won't oversell; Component proves the UI prevents the user from even attempting it (disabled "Sold Out" button, stepper capped at `availableSeats`). Both matter because the UI cap is advisory — the API is the actual enforcement point (see TC-404 concurrency gap below). |
| Client vs. server validation parity | Component (TC-308–311) + API (TC-308–313, TC-312) | The client's phone check (`events/[id]/page.tsx:92`, digit-count only) is weaker than the server's regex (`bookingValidator.js:36`, char-class check). TC-312 is **API-only by necessity** — it tests a gap the client can't catch. |

## Layer assignments

### Unit (3)

| TC | Title | Target source | Rationale |
|---|---|---|---|
| TC-003 | Booking ref first char matches event title | `backend/src/services/bookingService.js:11-18` (`randomRef`) | Pure string formatting, zero I/O. Mock nothing — call the function directly with a title, assert the prefix. |
| TC-109 | Booking ref collision retry / fallback format | `backend/src/services/bookingService.js:20-32` (`generateUniqueRef`) | Needs `bookingRepository.findByRef` mocked to force 10 collisions, then assert the `Date.now()`-based fallback format. No real DB needed — classic unit-with-mocked-dependency case. |
| TC-205 | Invalid/expired JWT rejected | `backend/src/middleware/authMiddleware.js` | Middleware is a pure `(req, res, next)` function around `jwt.verify` — testable by mocking `req.headers.authorization` and asserting the `res.status(401)` call, no server needed. |

### Component (27)

| TC | Title | Target source |
|---|---|---|
| TC-004 | View list of bookings (rendering) | `frontend/app/bookings/page.tsx` + `BookingCard.jsx`, mocked `useBookings` |
| TC-005 | Booking detail sections render | `frontend/app/bookings/[id]/page.tsx`, mocked `useBooking` |
| TC-009 | Cancel-all native confirm() decline → no-op | `frontend/app/bookings/page.tsx:27-36` |
| TC-010 | Refund eligibility — eligible (qty=1) | `RefundEligibility` component, `bookings/[id]/page.tsx:21-30` |
| TC-011 | Refund eligibility — ineligible (qty>1) | same |
| TC-208 | XSS payload in customerName renders as inert text | `BookingCard.jsx` / detail page, fed a crafted booking prop |
| TC-301 | Sold-out event disables Confirm Booking | `events/[id]/page.tsx:83,152-154` |
| TC-308 | Empty/whitespace customerName — client error | `events/[id]/page.tsx:90` (post-extraction, prefer Unit — see Tooling Gap) |
| TC-309 | 1-char customerName — client error | same |
| TC-310 | Malformed email — client error | `events/[id]/page.tsx:91` |
| TC-311 | Phone <10 digits — client error | `events/[id]/page.tsx:92` |
| TC-401 | Stepper allows up to 10 when seats ≥ 10 (UI half) | `events/[id]/page.tsx:81,127-131` |
| TC-402 | Stepper caps at availableSeats when <10 | same |
| TC-403 | Stepper can't go below 1 | `events/[id]/page.tsx:120-123` |
| TC-406 | Refund spinner visible ~4s | `bookings/[id]/page.tsx:26-28`, use fake timers, not real `waitForTimeout` |
| TC-407 | Refund check button unmounts after click (no double-trigger) | same |
| TC-500 | Bookings list loading skeletons | `bookings/page.tsx:66-70` |
| TC-501 | Bookings list error + Retry | `bookings/page.tsx:72-78`, mock failed fetch |
| TC-502 | Bookings list empty state | `bookings/page.tsx:80-92`, mock empty response |
| TC-503 | "Clearing…" label during clear-all | `bookings/page.tsx:27-36,55-61` |
| TC-504 | No sandbox banner on `/bookings` at any count | `bookings/page.tsx` (absence check) vs. `events/page.tsx:74-83` (presence check) |
| TC-505 | Cancel button hidden when status ≠ confirmed | `BookingCard.jsx:82-84`, `bookings/[id]/page.tsx:166-168` |
| TC-506 | Cancel dialog interpolates correct quantity/ref | `BookingCard.jsx:89`, `bookings/[id]/page.tsx:221` |
| TC-507 | Confirmation renders in-place (no navigation) | `events/[id]/page.tsx:77-79` |
| TC-508 | Confirm-booking button prevents double submit | `events/[id]/page.tsx:71,103-109,152`, mock delayed API response |
| TC-509 | Validation errors clear on valid resubmit | `events/[id]/page.tsx:99-101` |
| TC-510 | Error toast + dialog close on cancel failure | `BookingCard.jsx:35-38`, `bookings/[id]/page.tsx:107-110` |

### API (31)

| TC | Title | Endpoint / source |
|---|---|---|
| TC-002 | Book multiple tickets, totalPrice = price × qty | `POST /api/bookings`, `bookingService.js:99` |
| TC-012 | Lookup booking by ref | `GET /api/bookings/ref/:ref` |
| TC-013 | Filter bookings by eventId/status | `GET /api/bookings` |
| TC-100 | 9th booking succeeds, no pruning | `bookingService.js:70-79` (`MAX_USER_BOOKINGS = 9`) |
| TC-101 | 10th booking prunes oldest (different event) | `bookingService.js:69-79`, `findOldestUserBookingExcludingEvent` |
| TC-102 | Same-event FIFO fallback burns seats via `decrementSeats` | `bookingService.js:71-97` — **flagged as a likely real bug**, test both the deletion and the permanent seat loss |
| TC-103 | Seat check ordering after prune | `bookingService.js:70-92` |
| TC-104 | 7th custom event prunes oldest event | `eventService.js` equivalent (event limit) |
| TC-105 | Cascade delete removes bookings of pruned event | Prisma `onDelete: Cascade` on `Event.bookings` |
| TC-106 | Per-user seat isolation on dynamic events | `bookingRepository.js:78-90` (`getBookedQuantitiesForEvents`) |
| TC-107 | Same user, cumulative bookings on same dynamic event | same |
| TC-108 | Cancel restores seats on static event | `bookingService.js:126-136` vs. `cancelBooking` comment — verify actual behavior, candidate bug |
| TC-110 | totalPrice snapshot uses price at booking time, not current price | `bookingService.js:99` |
| TC-200 | Cannot view another user's booking by ID (403) | `GET /api/bookings/:id`, `bookingService.js:54-59` |
| TC-201 | Cannot view another user's booking by ref (403) | `GET /api/bookings/ref/:ref`, `bookingService.js:61-66` |
| TC-202 | Cannot cancel another user's booking | `DELETE /api/bookings/:id` — **verify actual status code**, `findById` scopes by `userId` so this likely 404s, not 403s (asymmetric with GET) |
| TC-203 | List always scoped to caller's userId | `bookingRepository.js:8-10` |
| TC-204 | No Bearer token → 401 | `authMiddleware.js:4-6` |
| TC-206 | Booking with a JWT for a deleted userId → FK error | `errorHandler.js` P2003 mapping |
| TC-207 | SQL-injection-style payloads handled safely | Prisma parameterization, any booking field |
| TC-209 | eventId tampering to reach an inaccessible dynamic event | `eventRepository.findById(eventId, userId)` |
| TC-210 | IDOR — sequential booking ID enumeration | `GET /api/bookings/:id` |
| TC-300 | Quantity exceeds available seats → 400 | `bookingService.js:86-92` |
| TC-302 | quantity = 0 → validation error | `bookingValidator.js:38-41` |
| TC-303 | quantity = 11 → validation error | same |
| TC-304 | Negative / non-integer quantity → validation error | same |
| TC-305 | Missing eventId → validation error | `bookingValidator.js:16-19` |
| TC-306 | Nonexistent eventId → 404 | `bookingService.js:82-83` |
| TC-307 | eventId non-numeric → validation error | `bookingValidator.js:18` |
| TC-312 | Phone with letters → 400 (server-only gap, see table above) | `bookingValidator.js:36` |
| TC-313 | All fields missing → aggregated `details[]` | `bookingValidator.js:3-13` |
| TC-314 | Cancel nonexistent booking → 404 | `bookingService.js:126-129` |
| TC-315 | Double-cancel same booking → second call 404 | same |
| TC-316 | Lookup by nonexistent ref → 404 | `bookingService.js:62-63` |
| TC-317 | Lookup by non-numeric ID → verify no 500 | `bookingRepository.js:34-39`, `Number("abc")` = `NaN` — candidate bug |
| TC-318 | Clear-all when zero bookings → safe no-op | `bookingService.js:121-124` |
| TC-319 | Insufficient-seats message has exact count | `bookingService.js:88-91` |
| TC-400 | Book the last available seat | seat math |
| TC-401 | Book qty=10 when seats allow (server half) | `bookingValidator.js:40` |
| TC-404 | Concurrent requests for the last seat — race condition | `bookingService.js:85-92` — read-then-write, **not wrapped in a transaction; likely overselling bug**, needs a dedicated concurrent-request test (fire 2 requests via `Promise.all`, assert exactly one succeeds) |
| TC-405 | 9-booking limit + qty=10 request combined | `bookingService.js:69-79` |
| TC-408 | Very long customerName — no max-length validation | `bookingValidator.js` (gap: no `.isLength({max})`) |
| TC-409 | Unicode/emoji in customerName | DB charset `utf8mb4` |
| TC-410 | Pagination — exactly one full page (10 bookings) | `bookingService.js:44-51` |
| TC-411 | Page number beyond totalPages → empty data, no error | `bookingRepository.js:8-24` |

(Table above intentionally lists 31 rows spanning both the original "Business Rule"/"Negative"/"Edge Case" categories — API is where backend-owned behavior belongs regardless of the scenario doc's category label.)

### E2E (4)

| TC | Title | Why it stays at E2E |
|---|---|---|
| TC-001 | Book a single ticket, full journey (browse → detail → form → confirm) | Canonical critical-path proof that frontend, backend, and DB agree end to end. Also carries the booking-ref-format assertion for free (see defense-in-depth table) — no separate E2E needed for TC-003. |
| TC-006 | Cancel a booking → toast → redirect → removed from list | Second canonical critical path; exercises the full cancel round-trip including UI confirmation dialog, not just the DELETE contract. |
| TC-008 | Clear all bookings → empty state | Destructive, irreversible, user-visible action; worth one real run against the live app rather than trusting a mocked Component test alone. |
| TC-200 | Cross-user "Access Denied" — real two-session flow | Security boundary; proves actual JWT-based enforcement across two real logins, not just the mocked/API 403 contract. |

All other "critical flow" scenarios (TC-002, TC-004, TC-005, TC-007) are **not** separately needed at E2E — they're sub-cases or rendering checks of the same journeys TC-001/TC-006 already exercise, and are cheaper to prove at Component/API (see rationale below).

## Decision rationale for contested assignments

- **TC-003 pushed from E2E/API → Unit.** This is the highest-value pushdown in the set. The original scenario doc suggested E2E/API, and the *existing* test suite (`tests/booking-management.spec.js`, `TC-102`) actually does test this via a full login → browse → book flow against production. But `randomRef` (`bookingService.js:11-18`) is a one-line string formatter with zero I/O — it doesn't need a browser, a server, or a database to verify. This is the textbook "pure logic tested at E2E" anti-pattern from the skill's own checklist.
- **TC-007 folded into TC-006, not a separate test.** TC-007 ("cancel from detail page redirects to list") and TC-006 ("cancel a booking") describe the same user action from two entry points (list card vs. detail page). One E2E test on the detail-page path is sufficient defense; the list-card cancel button is a Component-level rendering/wiring check (TC-505/TC-506), not a second full journey.
- **TC-002 pushed from Happy-Path/implicit-E2E → API only.** Booking N tickets and checking `totalPrice` is arithmetic (`price × quantity`) plus a round trip — there's no new UI behavior beyond TC-001 (same form, different stepper value). Testing it through a full browser session again buys nothing TC-001 didn't already prove about the journey; the API test isolates the actual thing being verified (server-side price calculation).
- **TC-102 (same-event FIFO fallback) kept at API, not pushed to Unit.** Unlike TC-003, this logic is inseparable from real DB state (`countUserBookings`, `findOldestUserBookingExcludingEvent`, `decrementSeats` all require Prisma). It's flagged as a probable bug (permanently burning seats on prune) and needs an integration-level test that can actually observe DB state before/after — mocking every collaborator would test the mocks, not the bug.
- **TC-200 kept at BOTH API and E2E** (see defense-in-depth table) rather than picking one, because it's the one security scenario where the UI-rendered "Access Denied" message and the raw 403 contract are both worth locking down independently — a regression could break either one without breaking the other (e.g., a frontend error-boundary swallowing the 403 and showing a generic error instead of "Access Denied").
- **TC-404 (race condition) kept at API despite needing non-trivial setup.** It doesn't fit neatly as a "simple" API test, but it's still fundamentally a backend-only concern (`bookingService.js:85-92` has no transaction wrapping the read-check-write sequence) — no UI involvement, so E2E would be pure overhead. Recommend implementing via two concurrent `request.post()` calls with `Promise.all`, not a browser.
- **TC-308–TC-311 (client-side validation) assigned to Component, flagged for Unit once `validate()` is extracted.** These currently can't be true unit tests because the function isn't exported (see Tooling Gap). Component is the honest layer for "as the code exists today"; extracting `validate()` is a cheap refactor that would drop these to Unit and further thin the pyramid.
- **TC-505 (cancel button hidden for non-confirmed bookings) kept even though it may be dead code.** Every booking created by the app starts and stays `status: "confirmed"` — there's no in-app flow that transitions status. It's included anyway as a defensive-UI guard test since the schema explicitly models a `cancelled`/other status and a future feature could rely on this guard already being correct.

## Anti-patterns found in existing tests (`tests/booking-management.spec.js`)

1. **Pure logic tested at E2E.** `TC-102` ("booking reference starts with first letter of event title") does a full login → clear bookings → browse → book → assert flow against the live production site solely to check a string-formatting rule. This is the textbook case the skill's checklist warns about — see rationale above. Fix: replace with a Unit test on `randomRef`, keep the assertion in TC-001's E2E as a bonus check instead of a dedicated test.
2. **Zero API-layer tests exist.** Every one of the 6 existing tests drives a full browser session against `https://eventhub.rahulshettyacademy.com`. None hit the REST API directly (no use of Playwright's `request` fixture). Every validation rule, error code, and business rule (FIFO pruning, seat math, cross-user 403s) is currently *unverified* — the app could regress any of `bookingValidator.js`, `bookingService.js`, or `bookingRepository.js` without a single test failing, since the UI's own client-side validation would silently prevent the invalid states from ever reaching the server in a browser-driven test.
3. **Zero Component/Unit tests exist**, and no tooling is installed to write them (see Tooling Gap). Every UI state — loading skeletons, empty states, error+retry, refund-eligibility spinner timing, stepper bounds — is currently unverified anywhere in the suite.
4. **Ice-cream-cone shape.** 6 E2E / 0 API / 0 Component / 0 Unit is the inverse of a healthy pyramid. All 6 existing tests also share ~80% identical setup (`login` → `clearBookings` → `bookEvent`) re-executed from scratch against a live remote server each time, which is slow (no `fullyParallel`, `retries: 0`) and fragile (shared mutable state on a real account — two tests running out of order could interfere via the 9-booking FIFO limit).
5. **Test IDs don't trace to any scenario doc.** The existing suite's `TC-001`…`TC-102`…`TC-006` numbering predates `docs/test-scenarios.md` and doesn't correspond to it at all (e.g., existing `TC-102` — booking ref format — is *new* `TC-003`; existing `TC-004` — clear all — is *new* `TC-008`). Traceability from test to documented scenario and business rule is currently broken. Recommend retagging test names with the current scenario IDs (e.g. `TC-001: ...`, `TC-006: ...`) when `/generate-tests` regenerates this file, so `grep TC-200 tests/*.spec.js docs/test-scenarios.md` actually finds both sides.
6. **Security scenarios are entirely untested.** None of TC-200–TC-210 (cross-user access, IDOR, injection, auth-token handling) exist in the current suite, despite being flagged P0/P1. This is the most important coverage gap to close first when `/generate-tests` runs.

## Recommended generation order for `/generate-tests`

1. **API layer first** (31 tests) — biggest coverage gap, no new tooling needed, directly exercises the business rules and security boundaries that are currently completely unverified.
2. **Security API subset as a priority slice within #1** — TC-200/201/202/203/204/206/209/210 close the P0 gap called out in anti-pattern #6.
3. **Unit layer** (3 tests) — small, fast, no tooling blockers for TC-003/TC-109/TC-205 (`authMiddleware` is plain Node, testable without a framework if needed).
4. **E2E cleanup** — replace existing `TC-102` (anti-pattern #1) and retag existing tests to current IDs (anti-pattern #5) before adding TC-008 and TC-200 as new E2E tests, landing on the 4-test critical set defined above.
5. **Component layer** — flag as blocked pending Jest + React Testing Library setup; surface this to the user rather than silently writing these as extra E2E tests.
