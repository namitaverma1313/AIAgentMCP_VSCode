# EventHub Test Scenarios — Booking Management

Scope: creating bookings, viewing/listing bookings, cancelling a single booking, clearing all bookings, refund-eligibility check, and all cross-cutting business rules, security, negative, edge-case, and UI-state behavior around these flows.

Sources: `eventhub-domain` skill (business-rules.md, user-flows.md, api-reference.md, ui-selectors.md), `frontend/app/events/[id]/page.tsx`, `frontend/app/bookings/page.tsx`, `frontend/app/bookings/[id]/page.tsx`, `frontend/components/bookings/BookingCard.jsx`, `backend/src/services/bookingService.js`, `backend/src/repositories/bookingRepository.js`, `backend/src/validators/bookingValidator.js`, `backend/src/routes/bookingRoutes.js`, `backend/src/middleware/errorHandler.js`, `backend/src/utils/errors.js`.

---

## Happy Path (TC-001 – TC-099)

### TC-001: Book a single ticket for an available event
**Category**: Happy Path
**Priority**: P0
**Preconditions**: User logged in; target event has `availableSeats > 0`
**Steps**:
1. Navigate to `/events/:id` for an available event
2. Leave quantity at 1
3. Fill Full Name, Email, Phone with valid data
4. Click "Confirm Booking"
**Expected Results**: Confirmation card shown with `booking-ref`, customer name, quantity (1), and total price = event price × 1; booking appears in `/bookings`
**Business Rule**: Flow 3 — Book an Event
**Suggested Layer**: E2E

### TC-002: Book multiple tickets (2–10) for an available event
**Category**: Happy Path
**Priority**: P0
**Preconditions**: User logged in; event has `availableSeats >= 2`
**Steps**:
1. Navigate to `/events/:id`
2. Increment quantity to a value between 2 and 10 (capped at min(10, availableSeats)) using the `+` button
3. Fill customer form and submit
**Expected Results**: `totalPrice = event.price × quantity`; confirmation shows correct quantity and total
**Business Rule**: Price Calculation (business-rules.md #9)
**Suggested Layer**: E2E

### TC-003: Booking reference first character matches event title's first letter
**Category**: Happy Path
**Priority**: P0
**Preconditions**: User logged in; note the first character of the event title (uppercased)
**Steps**:
1. Book any event
2. Read the `bookingRef` on the confirmation card
**Expected Results**: `bookingRef` matches pattern `[TITLE_FIRST_CHAR_UPPER]-[6_ALPHANUMERIC]`, e.g. event "Tech Summit" → ref starts with `T-`
**Business Rule**: Booking Reference Format (business-rules.md #7)
**Suggested Layer**: E2E / API

### TC-004: View list of all bookings
**Category**: Happy Path
**Priority**: P0
**Preconditions**: User has at least 1 confirmed booking
**Steps**:
1. Navigate to `/bookings`
**Expected Results**: Each booking card (`booking-card`) shows ref, status badge, booking id, event title, date, quantity, city, booked-on date, and total price; pagination control shown if `totalPages > 1`
**Business Rule**: Flow 4 — Manage Bookings
**Suggested Layer**: E2E

### TC-005: View a single booking's details
**Category**: Happy Path
**Priority**: P0
**Preconditions**: User has a confirmed booking; click "View Details" from `/bookings`
**Steps**:
1. Navigate to `/bookings/:id` (own booking)
**Expected Results**: Page shows Event Details, Customer Details, Payment Summary (tickets, price/ticket, total paid), Refund section, and Booking Information (booked-on date, `#id`); "Cancel Booking" button visible since status is `confirmed`
**Business Rule**: Flow 4 — Manage Bookings
**Suggested Layer**: E2E

### TC-006: Cancel a single booking
**Category**: Happy Path
**Priority**: P0
**Preconditions**: User has a confirmed booking
**Steps**:
1. From `/bookings` (or booking detail page) click "Cancel Booking" (`cancel-booking-btn`)
2. Confirm in the dialog (`confirm-dialog-yes` equivalent)
**Expected Results**: Toast "Booking cancelled successfully"; booking no longer appears in `/bookings`; seats for the event are restored (dynamic events: computed availability increases; static events: `availableSeats` DB field increments)
**Business Rule**: Booking deletion frees seats (business-rules.md #4); Per-User Seat Availability (#6)
**Suggested Layer**: E2E

### TC-007: Cancel a booking from the booking detail page redirects to list
**Category**: Happy Path
**Priority**: P1
**Preconditions**: User on `/bookings/:id` of an owned, confirmed booking
**Steps**:
1. Click "Cancel Booking" → confirm dialog → confirm
**Expected Results**: Toast success shown; user is redirected to `/bookings`
**Business Rule**: Flow 4 — Manage Bookings
**Suggested Layer**: E2E

### TC-008: Clear all bookings
**Category**: Happy Path
**Priority**: P1
**Preconditions**: User has 2+ bookings
**Steps**:
1. On `/bookings`, click "Clear all bookings"
2. Accept the native `confirm()` dialog
**Expected Results**: All bookings for the user deleted (`DELETE /api/bookings` → `deleteAllForUser`); list refetches and shows the empty state "No bookings yet"
**Business Rule**: "Clear All Bookings" button removes all bookings in one go (business-rules.md #4)
**Suggested Layer**: E2E

### TC-009: Cancelling "Clear all bookings" native confirm dialog does nothing
**Category**: Happy Path
**Priority**: P2
**Preconditions**: User has bookings
**Steps**:
1. Click "Clear all bookings"
2. Dismiss/cancel the native `confirm()` dialog
**Expected Results**: No API call made; bookings list unchanged
**Business Rule**: Flow 4 — Manage Bookings
**Suggested Layer**: E2E

### TC-010: Check refund eligibility for a single-ticket booking
**Category**: Happy Path
**Priority**: P1
**Preconditions**: User has a confirmed booking with `quantity = 1`
**Steps**:
1. Navigate to `/bookings/:id`
2. Click "Check eligibility for refund?" (`check-refund-btn`)
3. Wait through the spinner state
**Expected Results**: After ~4s, result shows "Eligible for refund. Single-ticket bookings qualify for a full refund." with success styling
**Business Rule**: Refund Eligibility (business-rules.md #8)
**Suggested Layer**: E2E / Component

### TC-011: Check refund eligibility for a multi-ticket booking
**Category**: Happy Path
**Priority**: P1
**Preconditions**: User has a confirmed booking with `quantity > 1`
**Steps**:
1. Navigate to `/bookings/:id`
2. Click "Check eligibility for refund?"
**Expected Results**: After ~4s, result shows "Not eligible for refund. Group bookings (N tickets) are non-refundable." with N = actual quantity
**Business Rule**: Refund Eligibility (business-rules.md #8)
**Suggested Layer**: E2E / Component

### TC-012: Look up a booking by reference code (API)
**Category**: Happy Path
**Priority**: P2
**Preconditions**: Valid bearer token; known `bookingRef` owned by the caller
**Steps**:
1. `GET /api/bookings/ref/:ref` with Bearer token
**Expected Results**: 200, `data` contains the matching booking with nested `event`
**Business Rule**: api-reference.md — GET /api/bookings/ref/:ref
**Suggested Layer**: API

### TC-013: Filter bookings list by eventId and status (API)
**Category**: Happy Path
**Priority**: P2
**Preconditions**: Valid bearer token; user has bookings across multiple events/statuses
**Steps**:
1. `GET /api/bookings?eventId=<id>&status=confirmed&page=1&limit=10`
**Expected Results**: 200; `data` only contains bookings matching both filters, scoped to the caller's `userId`; `pagination.total/page/limit/totalPages` correct
**Business Rule**: api-reference.md — GET /api/bookings
**Suggested Layer**: API

---

## Business Rules (TC-100 – TC-199)

### TC-100: 9th booking succeeds normally (at limit boundary)
**Category**: Business Rule
**Priority**: P1
**Preconditions**: User has exactly 8 existing bookings
**Steps**:
1. Create a 9th booking
**Expected Results**: Booking created successfully; no pruning occurs (count was `< 9` before create); user now has 9 bookings
**Business Rule**: Max 9 bookings per user (business-rules.md #4)
**Suggested Layer**: API

### TC-101: 10th booking triggers FIFO pruning of the oldest booking (different event)
**Category**: Business Rule
**Priority**: P0
**Preconditions**: User has 9 existing bookings, oldest of which is for a *different* event than the new booking
**Steps**:
1. Create a new (10th) booking for a different event than the oldest existing booking
**Expected Results**: The oldest booking (excluding the new booking's event) is deleted first; total booking count remains 9 after creation; the deleted booking's seats are NOT permanently burned (dynamic availability recalculated, since `sameEventFallback` is false)
**Business Rule**: Booking Limits FIFO Pruning (business-rules.md #4); `bookingService.createBooking` — `findOldestUserBookingExcludingEvent` preferred
**Suggested Layer**: API

### TC-102: FIFO pruning falls back to oldest booking when all 9 existing bookings share the new booking's event
**Category**: Business Rule
**Priority**: P1
**Preconditions**: User has 9 existing bookings, ALL for the same event as the new booking request
**Steps**:
1. Create a new booking for that same event
**Expected Results**: `findOldestUserBookingExcludingEvent` returns null → falls back to `findOldestUserBooking` (oldest overall, same event) → that booking is deleted AND `sameEventFallback = true`, so `eventRepository.decrementSeats` is called, permanently burning `data.quantity` seats off that event's `availableSeats` (a real seat is lost, not just reassigned)
**Business Rule**: `bookingService.createBooking` same-event fallback (backend/src/services/bookingService.js:71-97) — discovered code behavior, not documented in business-rules.md
**Suggested Layer**: API

### TC-103: New booking's own seat check happens after pruning, using post-prune availability
**Category**: Business Rule
**Priority**: P2
**Preconditions**: User at 9-booking limit; event has exactly enough seats for the new request only after an old booking of the same event is pruned and its quantity is "returned" to the personal pool
**Steps**:
1. Create a booking whose quantity would otherwise exceed personally-available seats before pruning
**Expected Results**: Behavior traced precisely against `getBookedQuantitiesForEvents`, which is computed AFTER the prune-delete — confirm whether the freed quantity from the deleted same-event booking is reflected in `personalAvailable` before the seat check runs
**Business Rule**: `bookingService.createBooking` ordering of prune → event lookup → seat check (backend/src/services/bookingService.js:70-92)
**Suggested Layer**: API

### TC-104: 7th user-created event triggers FIFO pruning of the oldest custom event
**Category**: Business Rule
**Priority**: P2
**Preconditions**: User has 6 custom events already
**Steps**:
1. Create a 7th event via Admin UI or API
**Expected Results**: Oldest user-created event automatically deleted (cascades to its bookings, per business-rules.md #2); static events unaffected
**Business Rule**: Event Limits FIFO Pruning (business-rules.md #3) — cross-references booking cascade
**Suggested Layer**: API (included because deleting a pruned event cascades and removes any bookings against it, directly impacting Booking Management data)

### TC-105: Cancelling a pruned/cascade-deleted event's bookings is reflected in the bookings list
**Category**: Business Rule
**Priority**: P2
**Preconditions**: User has a booking against a custom event that later gets FIFO-pruned (event limit reached)
**Steps**:
1. Book a custom event
2. Trigger event pruning by creating 6 more custom events
**Expected Results**: The booking tied to the deleted event is also removed (`onDelete: Cascade` on `Booking.event`); booking no longer appears in `/bookings`
**Business Rule**: "Deleting a user cascades to their events and bookings" / event cascade (business-rules.md #2, #3)
**Suggested Layer**: API

### TC-106: Seat availability for dynamic events is computed per-user, not globally shared
**Category**: Business Rule
**Priority**: P1
**Preconditions**: Two different users can each book the same user-created (dynamic) event
**Steps**:
1. User A books 3 seats of a dynamic event with `totalSeats = 5`
2. User B (different account) views/books the same event
**Expected Results**: User B's `availableSeats` for that event is NOT reduced by User A's booking (each computed as `totalSeats - sum(that user's own booking quantities)`), so User B can still book up to 5 (business rule allows same-user re-booking flexibility, and since dynamic event ownership/visibility rules apply, verify actual cross-user visibility of another user's dynamic event first)
**Business Rule**: Per-User Seat Availability (business-rules.md #6)
**Suggested Layer**: API

### TC-107: Booking the same dynamic event multiple times by the same user reduces personal availability cumulatively
**Category**: Business Rule
**Priority**: P1
**Preconditions**: User owns/can access a dynamic event with `totalSeats = 5`, no prior bookings
**Steps**:
1. Book 2 seats
2. Book 3 more seats of the same event
3. Attempt to book 1 more seat
**Expected Results**: After step 1, personal availability = 3; after step 2, personal availability = 0; step 3 fails with `InsufficientSeatsError` ("Only 0 seat(s) available, but 1 requested")
**Business Rule**: Per-User Seat Availability (business-rules.md #6)
**Suggested Layer**: API

### TC-108: Cancelling a booking restores seats for a static event
**Category**: Business Rule
**Priority**: P1
**Preconditions**: User has a confirmed booking on a static (seeded) event
**Steps**:
1. Note `availableSeats` for the event
2. Cancel the booking
3. Re-check event's `availableSeats`
**Expected Results**: `availableSeats` increments by the cancelled booking's `quantity` (static events use the fixed DB field, unlike dynamic events which are computed)
**Business Rule**: Per-User Seat Availability (business-rules.md #6); cancelBooking comment "for static events, seats were never modified anyway" vs. static booking flow — verify actual increment behavior since static bookings DO decrement (see repository/service split); this is a candidate for a real bug
**Suggested Layer**: API

### TC-109: Booking reference collision retry / fallback format
**Category**: Business Rule
**Priority**: P3
**Preconditions**: Ability to force `generateUniqueRef` to exhaust 10 attempts (e.g. via seeded/mocked collisions)
**Steps**:
1. Force 10 consecutive `randomRef` collisions for the same event title
**Expected Results**: Falls back to `${PREFIX}-${Date.now() base36 last 8 chars}` format instead of the standard 6-char random suffix; ref is still unique and prefixed with the event title's first letter
**Business Rule**: Booking Reference Format guaranteed unique via collision retry (business-rules.md #7)
**Suggested Layer**: Unit (isolate `generateUniqueRef`)

### TC-110: totalPrice uses the event's current price at booking time
**Category**: Business Rule
**Priority**: P2
**Preconditions**: Admin updates a dynamic event's price after a prior booking exists
**Steps**:
1. Book event at price P1
2. Admin updates event price to P2
3. Book the same event again
**Expected Results**: First booking's `totalPrice` stays `P1 × qty` (immutable historical record); second booking's `totalPrice = P2 × qty`
**Business Rule**: Price Calculation (business-rules.md #9)
**Suggested Layer**: API

---

## Security (TC-200 – TC-299)

### TC-200: Cannot view another user's booking by ID
**Category**: Security
**Priority**: P0
**Preconditions**: User A creates a booking and notes its `id`; User B is a different authenticated account
**Steps**:
1. As User B, navigate to `/bookings/:userA_booking_id` (or `GET /api/bookings/:id` with User B's token)
**Expected Results**: 403 Forbidden, "Access Denied" UI message ("You are not authorized to view this booking"); no booking data leaked in the response
**Business Rule**: Cross-User Security, Flow 6 (business-rules.md #2); `getBookingById` ownership check
**Suggested Layer**: E2E + API

### TC-201: Cannot view another user's booking by reference code
**Category**: Security
**Priority**: P1
**Preconditions**: User A's `bookingRef` known to User B
**Steps**:
1. As User B, `GET /api/bookings/ref/:userA_ref`
**Expected Results**: 403 Forbidden ("You do not own this booking")
**Business Rule**: `getBookingByRef` ownership check (bookingService.js:61-66)
**Suggested Layer**: API

### TC-202: Cannot cancel another user's booking
**Category**: Security
**Priority**: P0
**Preconditions**: User A owns booking `id=X`; User B is authenticated
**Steps**:
1. As User B, `DELETE /api/bookings/X`
**Expected Results**: 404 (per `cancelBooking`, `bookingRepository.findById(id, userId)` is scoped to `userId`, so a non-owned booking simply isn't found — returns `NotFoundError`, not 403); confirm actual status code returned matches this code path exactly (differs from the 403 used for GET-by-id)
**Business Rule**: cancelBooking ownership check (bookingService.js:126-136) — note asymmetry vs. GET, worth explicitly verifying
**Suggested Layer**: API

### TC-203: Cannot list another user's bookings via query manipulation
**Category**: Security
**Priority**: P1
**Preconditions**: User A and User B both have bookings
**Steps**:
1. As User B, `GET /api/bookings` (no way to pass a foreign `userId` — findAll always scopes to `req.user`'s id)
**Expected Results**: Response only contains User B's own bookings, regardless of any extraneous query params attempting to override user scope
**Business Rule**: findAll always injects `where: { userId }` server-side (bookingRepository.js:8-10)
**Suggested Layer**: API

### TC-204: Requests without a Bearer token are rejected
**Category**: Security
**Priority**: P0
**Preconditions**: None
**Steps**:
1. Call any `/api/bookings*` endpoint with no `Authorization` header
**Expected Results**: 401 `{ success: false, error: 'Unauthorized' }`
**Business Rule**: Missing auth token (api-reference.md, Error Scenarios); authMiddleware.js:4-6
**Suggested Layer**: API

### TC-205: Requests with an invalid or expired JWT are rejected
**Category**: Security
**Priority**: P0
**Preconditions**: A malformed token string, and/or an expired JWT (past 7-day expiry)
**Steps**:
1. Call `/api/bookings` with `Authorization: Bearer <bad-token>`
**Expected Results**: 401 `{ success: false, error: 'Invalid or expired token' }`
**Business Rule**: authMiddleware.js:8-13; JWT 7-day expiry (eventhub-domain SKILL.md)
**Suggested Layer**: API

### TC-206: Cannot create a booking with a JWT for a userId that doesn't exist / was deleted
**Category**: Security
**Priority**: P2
**Preconditions**: A JWT signed for a `userId` whose account has since been deleted
**Steps**:
1. `POST /api/bookings` with that token and a valid body
**Expected Results**: Determine actual behavior — Prisma FK constraint (`P2003`) should surface as 400 "Related record does not exist" since `userId` is a foreign key on `Booking`; verify booking creation does not silently succeed with an orphaned reference
**Business Rule**: errorHandler.js P2003 mapping; User cascade delete (business-rules.md #2)
**Suggested Layer**: API

### TC-207: SQL/NoSQL injection style payloads in booking form fields are safely handled
**Category**: Security
**Priority**: P2
**Preconditions**: None
**Steps**:
1. Submit booking with `customerName` = `Robert'); DROP TABLE Booking;--` and similar payloads in name/email/phone
**Expected Results**: Prisma parameterizes queries — no injection possible; either the value is stored as literal text (if it passes validation) or rejected by `isLength`/`isEmail` validators; no server error/500
**Business Rule**: General input safety — Prisma ORM parameterization
**Suggested Layer**: API

### TC-208: XSS payloads in customerName render safely in the UI
**Category**: Security
**Priority**: P2
**Preconditions**: None
**Steps**:
1. Book an event with `customerName = <script>alert(1)</script>`
2. View the booking on `/bookings/:id` and the confirmation card
**Expected Results**: Value is displayed as inert text (React escapes by default), not executed; no alert fires
**Business Rule**: General input safety — React JSX auto-escaping
**Suggested Layer**: E2E

### TC-209: Tampering with `eventId` to reference another user's private/inaccessible dynamic event
**Category**: Security
**Priority**: P1
**Preconditions**: User B does not have visibility of User A's dynamic event through the UI, but knows its numeric `id`
**Steps**:
1. As User B, `POST /api/bookings` with `eventId = <userA's dynamic event id>`
**Expected Results**: `eventRepository.findById(eventId, userId)` — verify whether it scopes dynamic events by owner (should 404 if User B has no access) or whether static-vs-dynamic visibility rules allow booking events you don't "own"; confirm actual sandbox isolation of events (business-rules.md #2) is enforced at the booking layer, not just the listing layer
**Business Rule**: User Sandbox Isolation (business-rules.md #2)
**Suggested Layer**: API

### TC-210: IDOR via sequential booking IDs cannot enumerate other users' bookings
**Category**: Security
**Priority**: P2
**Preconditions**: Authenticated as a low-privilege user
**Steps**:
1. Iterate `GET /api/bookings/:id` for a range of sequential numeric IDs not owned by the caller
**Expected Results**: Every non-owned ID returns 403 ("Access Denied") or 404, never leaks another user's booking payload
**Business Rule**: Cross-user booking access (api-reference.md, Error Scenarios)
**Suggested Layer**: API

---

## Negative / Error Scenarios (TC-300 – TC-399)

### TC-300: Booking with quantity exceeding available seats is rejected
**Category**: Negative
**Priority**: P0
**Preconditions**: Event has `availableSeats = N`
**Steps**:
1. Attempt to book `N + 1` tickets (bypassing the UI's max-qty cap via direct API call, since the UI caps the stepper at `availableSeats`)
**Expected Results**: 400 `InsufficientSeatsError`, message "Only N seat(s) available, but (N+1) requested"
**Business Rule**: Insufficient seats (api-reference.md, Error Scenarios); bookingService.js:86-92
**Suggested Layer**: API

### TC-301: Booking a fully sold-out event via UI is blocked
**Category**: Negative
**Priority**: P1
**Preconditions**: Event has `availableSeats = 0`
**Steps**:
1. Navigate to `/events/:id` for the sold-out event
**Expected Results**: "Confirm Booking" button disabled and reads "Sold Out"; form cannot be submitted
**Business Rule**: BookingForm `soldOut` state (frontend/app/events/[id]/page.tsx:83,152-154)
**Suggested Layer**: E2E

### TC-302: Booking with quantity = 0 is rejected
**Category**: Negative
**Priority**: P1
**Preconditions**: None
**Steps**:
1. `POST /api/bookings` with `quantity: 0`
**Expected Results**: 400 validation error, "Quantity must be an integer between 1 and 10"
**Business Rule**: validateCreateBooking `isInt({ min: 1, max: 10 })` (bookingValidator.js:38-41)
**Suggested Layer**: API

### TC-303: Booking with quantity = 11 is rejected
**Category**: Negative
**Priority**: P1
**Preconditions**: None
**Steps**:
1. `POST /api/bookings` with `quantity: 11`
**Expected Results**: 400 validation error, "Quantity must be an integer between 1 and 10"
**Business Rule**: validateCreateBooking max 10 (bookingValidator.js:40)
**Suggested Layer**: API

### TC-304: Booking with negative or non-integer quantity is rejected
**Category**: Negative
**Priority**: P2
**Preconditions**: None
**Steps**:
1. `POST /api/bookings` with `quantity: -1`, then `quantity: 2.5`, then `quantity: "abc"`
**Expected Results**: All rejected with 400 "Quantity must be an integer between 1 and 10" / "Quantity is required" as applicable
**Business Rule**: validateCreateBooking (bookingValidator.js:38-41)
**Suggested Layer**: API

### TC-305: Booking with missing eventId is rejected
**Category**: Negative
**Priority**: P1
**Preconditions**: None
**Steps**:
1. `POST /api/bookings` omitting `eventId`
**Expected Results**: 400, "Event ID is required"
**Business Rule**: validateCreateBooking (bookingValidator.js:16-19)
**Suggested Layer**: API

### TC-306: Booking a non-existent eventId returns 404
**Category**: Negative
**Priority**: P1
**Preconditions**: A numeric `eventId` guaranteed not to exist
**Steps**:
1. `POST /api/bookings` with that `eventId` and otherwise-valid data
**Expected Results**: 404 "Event with id <id> not found"
**Business Rule**: bookingService.js:82-83
**Suggested Layer**: API

### TC-307: Booking with eventId = non-numeric string is rejected
**Category**: Negative
**Priority**: P2
**Preconditions**: None
**Steps**:
1. `POST /api/bookings` with `eventId: "abc"`
**Expected Results**: 400, "Event ID must be a positive integer"
**Business Rule**: validateCreateBooking `.isInt({ min: 1 })` (bookingValidator.js:18)
**Suggested Layer**: API

### TC-308: Booking with empty/whitespace-only customerName is rejected
**Category**: Negative
**Priority**: P1
**Preconditions**: None
**Steps**:
1. Submit booking form with name = `"  "` (spaces only)
**Expected Results**: Client-side: "Name must be at least 2 chars"; server-side (if bypassed): 400 "Customer name is required" (trimmed empty)
**Business Rule**: Frontend validate() (events/[id]/page.tsx:90); backend `.trim().notEmpty()` (bookingValidator.js:21-24)
**Suggested Layer**: E2E + API

### TC-309: Booking with 1-character customerName is rejected
**Category**: Negative
**Priority**: P2
**Preconditions**: None
**Steps**:
1. Submit booking with `customerName = "A"`
**Expected Results**: Client: "Name must be at least 2 chars"; server: "Customer name must be at least 2 characters"
**Business Rule**: bookingValidator.js:24; events/[id]/page.tsx:90
**Suggested Layer**: E2E + API

### TC-310: Booking with malformed email is rejected
**Category**: Negative
**Priority**: P1
**Preconditions**: None
**Steps**:
1. Submit booking with `customerEmail = "not-an-email"`
**Expected Results**: Client: "Enter a valid email"; server (if bypassed): "Customer email must be a valid email address"
**Business Rule**: events/[id]/page.tsx:91; bookingValidator.js:26-30
**Suggested Layer**: E2E + API

### TC-311: Booking with phone number under 10 digits is rejected
**Category**: Negative
**Priority**: P1
**Preconditions**: None
**Steps**:
1. Submit booking with `customerPhone = "12345"`
**Expected Results**: Client: "Enter a valid 10-digit phone"; server: "Customer phone must be at least 10 digits"
**Business Rule**: events/[id]/page.tsx:92; bookingValidator.js:32-36
**Suggested Layer**: E2E + API

### TC-312: Booking with phone containing invalid characters (letters) is rejected server-side
**Category**: Negative
**Priority**: P2
**Preconditions**: None
**Steps**:
1. `POST /api/bookings` with `customerPhone: "98765ABCDE"`
**Expected Results**: 400, "Customer phone must contain only digits and +, -, spaces, or parentheses" — note the client-side check only counts digit length and would NOT catch this locally, so this must be tested at the API layer
**Business Rule**: bookingValidator.js:36 regex vs. client-side check (events/[id]/page.tsx:92) — discovered validation gap between client and server
**Suggested Layer**: API

### TC-313: Booking with all fields missing returns all field errors together
**Category**: Negative
**Priority**: P2
**Preconditions**: None
**Steps**:
1. `POST /api/bookings` with an empty body `{}`
**Expected Results**: 400, `details` array contains one entry per missing/invalid field (eventId, customerName, customerEmail, customerPhone, quantity)
**Business Rule**: handleValidationErrors aggregates all express-validator errors (bookingValidator.js:3-13)
**Suggested Layer**: API

### TC-314: Cancelling a booking that doesn't exist returns 404
**Category**: Negative
**Priority**: P1
**Preconditions**: A booking `id` guaranteed not to exist (or already deleted)
**Steps**:
1. `DELETE /api/bookings/:nonexistent_id`
**Expected Results**: 404 "Booking with id <id> not found"
**Business Rule**: bookingService.js:126-129
**Suggested Layer**: API

### TC-315: Double-cancel of the same booking (race/idempotency)
**Category**: Negative
**Priority**: P2
**Preconditions**: A confirmed booking
**Steps**:
1. Cancel the booking
2. Immediately cancel it again (before UI refetches, or via direct API call)
**Expected Results**: Second call returns 404 "Booking with id <id> not found" (already deleted); UI should surface the toast error gracefully without crashing, per `onError` handler in BookingCard/detail page
**Business Rule**: bookingService.js:126-129; BookingCard.jsx `onError` handler
**Suggested Layer**: API + E2E

### TC-316: Fetching a booking by a bookingRef that doesn't exist returns 404
**Category**: Negative
**Priority**: P2
**Preconditions**: None
**Steps**:
1. `GET /api/bookings/ref/DOESNOTEXIST-123`
**Expected Results**: 404 "Booking with reference "DOESNOTEXIST-123" not found"
**Business Rule**: api-reference.md Error Scenarios; bookingService.js:62-63
**Suggested Layer**: API

### TC-317: Fetching a booking by non-numeric ID
**Category**: Negative
**Priority**: P3
**Preconditions**: None
**Steps**:
1. `GET /api/bookings/abc`
**Expected Results**: Determine behavior — `findByIdOnly` calls `prisma.booking.findUnique({ where: { id: Number(id) } })`; `Number("abc")` = `NaN`, verify this returns a clean 404 rather than a 500 from a malformed Prisma query
**Business Rule**: bookingRepository.js:34-39 — potential unhandled edge case
**Suggested Layer**: API

### TC-318: Clearing all bookings when the user has none is a safe no-op
**Category**: Negative
**Priority**: P3
**Preconditions**: User has zero bookings
**Steps**:
1. Click "Clear all bookings" (or call `DELETE /api/bookings` directly) with no existing bookings
**Expected Results**: 200, `{ deleted: 0 }`, no error; UI's already-empty check (`alreadyEmpty`) may skip the call entirely at the E2E layer
**Business Rule**: clearAllBookings (bookingService.js:121-124); tests/booking-management.spec.js `clearBookings` helper "Safe to call when already empty"
**Suggested Layer**: API + E2E

### TC-319: Insufficient seats error message reflects the exact remaining count
**Category**: Negative
**Priority**: P2
**Preconditions**: Event with exactly 2 seats remaining for the requesting user
**Steps**:
1. Attempt to book 5 tickets
**Expected Results**: 400, error message exactly "Only 2 seat(s) available, but 5 requested"
**Business Rule**: bookingService.js:88-91
**Suggested Layer**: API

---

## Edge Cases (TC-400 – TC-499)

### TC-400: Booking exactly the last available seat
**Category**: Edge Case
**Priority**: P1
**Preconditions**: Event has `availableSeats = 1`
**Steps**:
1. Book 1 ticket
**Expected Results**: Booking succeeds; event immediately becomes sold out for that user (availableSeats/personalAvailable = 0)
**Business Rule**: Seat count reduces immediately on booking confirmation (business-rules.md #6)
**Suggested Layer**: API

### TC-401: Booking the maximum allowed quantity (10) when seats allow it
**Category**: Edge Case
**Priority**: P1
**Preconditions**: Event has `availableSeats >= 10`
**Steps**:
1. Set quantity to 10 (UI stepper max) and submit
**Expected Results**: Booking succeeds with `quantity = 10`; UI stepper `+` button disables at 10 even if more seats remain (`maxQty = Math.min(10, event.availableSeats)`)
**Business Rule**: validateCreateBooking max 10 (bookingValidator.js:40); events/[id]/page.tsx:81
**Suggested Layer**: E2E

### TC-402: Quantity stepper caps at availableSeats when fewer than 10 remain
**Category**: Edge Case
**Priority**: P1
**Preconditions**: Event has `availableSeats = 3`
**Steps**:
1. Click `+` repeatedly on the ticket stepper
**Expected Results**: Stepper stops incrementing at 3 (not 10); `+` button becomes disabled at `quantity === maxQty`
**Business Rule**: `maxQty = Math.min(10, event.availableSeats)` (events/[id]/page.tsx:81,127-131)
**Suggested Layer**: E2E

### TC-403: Quantity stepper cannot go below 1
**Category**: Edge Case
**Priority**: P2
**Preconditions**: On the booking form
**Steps**:
1. Click `-` while quantity = 1
**Expected Results**: `-` button disabled at quantity 1; quantity never reaches 0
**Business Rule**: events/[id]/page.tsx:120-123
**Suggested Layer**: E2E

### TC-404: Race condition — two simultaneous bookings for the last seat
**Category**: Edge Case
**Priority**: P2
**Preconditions**: Event has `availableSeats = 1`; two concurrent requests from the same or different users each request 1 seat
**Steps**:
1. Fire two `POST /api/bookings` requests concurrently for the same event/user (or two users if dynamic event shared context applies) each requesting the last seat
**Expected Results**: Exactly one booking succeeds; the other receives `InsufficientSeatsError` — verify there's no lack-of-transaction race allowing both to succeed and oversell (booking creation is NOT wrapped in a DB transaction with the seat check in bookingService.js, which is a plausible real bug to confirm)
**Business Rule**: bookingService.js:85-92 seat check is read-then-write, not atomic
**Suggested Layer**: API

### TC-405: Booking exactly at the 9-booking limit boundary combined with quantity=10 request
**Category**: Edge Case
**Priority**: P2
**Preconditions**: User has 9 bookings already
**Steps**:
1. Attempt to create booking #10 requesting the max quantity (10) for a new event
**Expected Results**: FIFO pruning removes the oldest booking first (dropping count to 8), then the new booking is created, quantity permitting — final count = 9
**Business Rule**: Booking Limits FIFO Pruning (business-rules.md #4); bookingService.js:69-79
**Suggested Layer**: API

### TC-406: Refund eligibility check spinner duration is exactly ~4 seconds
**Category**: Edge Case
**Priority**: P3
**Preconditions**: On a booking detail page
**Steps**:
1. Click "Check eligibility for refund?" and measure time until result appears
**Expected Results**: Spinner (`refund-spinner`) visible for ~4000ms before `refund-result` appears (hardcoded `setTimeout(..., 4000)`, client-only — no backend call)
**Business Rule**: Refund Eligibility "4-second spinner" (business-rules.md #8); frontend/app/bookings/[id]/page.tsx:26-28
**Suggested Layer**: Component / E2E (use `toBeVisible({ timeout: 6000 })`, not `waitForTimeout`)

### TC-407: Clicking "Check eligibility" repeatedly doesn't stack duplicate timers/results
**Category**: Edge Case
**Priority**: P3
**Preconditions**: On booking detail page, refund check already idle after a prior check (component state only allows one check per mount since button disappears once `status !== 'idle'`)
**Steps**:
1. Click "Check eligibility for refund?"
2. Attempt to click again while `checking`
**Expected Results**: Button is unmounted once status leaves `idle`, so a second click is impossible through normal UI interaction; confirm no duplicate spinner/result renders
**Business Rule**: RefundEligibility component state machine (bookings/[id]/page.tsx:21-30)
**Suggested Layer**: Component

### TC-408: Very long customerName / customerPhone values
**Category**: Edge Case
**Priority**: P3
**Preconditions**: None
**Steps**:
1. Submit booking with a 500-character `customerName`
**Expected Results**: No explicit max-length validation exists client or server side — verify it's accepted and stored (Prisma `String` column) without truncation or DB error; flag as missing max-length validation if it causes issues
**Business Rule**: bookingValidator.js has no `.isLength({ max })` — discovered gap
**Suggested Layer**: API

### TC-409: Unicode/emoji characters in customerName
**Category**: Edge Case
**Priority**: P3
**Preconditions**: None
**Steps**:
1. Submit booking with `customerName = "李雷 🎫"`
**Expected Results**: Accepted (no charset restriction in validator beyond length), stored and displayed correctly (utf8mb4 charset per README DB setup)
**Business Rule**: bookingValidator.js:21-24; README DB charset `utf8mb4`
**Suggested Layer**: API

### TC-410: Pagination boundary on bookings list — exactly 10 bookings (one full page)
**Category**: Edge Case
**Priority**: P2
**Preconditions**: User has exactly 10 bookings, `limit=10` default
**Steps**:
1. Navigate to `/bookings`
**Expected Results**: `totalPages = 1`; pagination control still renders per component logic but has nothing to page to (verify no "page 2" is reachable/renders as empty)
**Business Rule**: useBookings default `limit: 10` (frontend/app/bookings/page.tsx:24); bookingService.js:44-51 `Math.ceil(total/limit)`
**Suggested Layer**: E2E

### TC-411: Requesting a bookings page number beyond totalPages
**Category**: Edge Case
**Priority**: P3
**Preconditions**: User has fewer bookings than would fill the requested page
**Steps**:
1. `GET /api/bookings?page=99&limit=10`
**Expected Results**: 200 with empty `data` array, correct `pagination` metadata (no error thrown for out-of-range page)
**Business Rule**: bookingRepository.js:8-24 skip/take math with no bounds check
**Suggested Layer**: API

---

## UI State (TC-500 – TC-599)

### TC-500: Bookings list loading state shows skeletons
**Category**: UI State
**Priority**: P2
**Preconditions**: Simulate slow network via `page.route` delay
**Steps**:
1. Navigate to `/bookings` while the request is pending
**Expected Results**: 5 `BookingCardSkeleton` placeholders render (animate-pulse) instead of real cards
**Business Rule**: frontend/app/bookings/page.tsx:66-70
**Suggested Layer**: Component / E2E

### TC-501: Bookings list error state shows retry
**Category**: UI State
**Priority**: P2
**Preconditions**: Mock `GET /api/bookings` to return a 500/network failure
**Steps**:
1. Navigate to `/bookings`
**Expected Results**: EmptyState "Couldn't load bookings" with a "Retry" button that re-triggers `refetch()`
**Business Rule**: frontend/app/bookings/page.tsx:72-78
**Suggested Layer**: Component (API mocking)

### TC-502: Bookings list empty state shown when user has zero bookings
**Category**: UI State
**Priority**: P1
**Preconditions**: New/cleared user account with no bookings
**Steps**:
1. Navigate to `/bookings`
**Expected Results**: EmptyState "No bookings yet" with description and "Browse Events" CTA linking to `/events`
**Business Rule**: frontend/app/bookings/page.tsx:80-92
**Suggested Layer**: E2E

### TC-503: "Clear all bookings" button shows loading label while clearing
**Category**: UI State
**Priority**: P3
**Preconditions**: User has bookings
**Steps**:
1. Click "Clear all bookings", observe button text during the request
**Expected Results**: Button text changes to "Clearing…" and is disabled until the request completes
**Business Rule**: frontend/app/bookings/page.tsx:27-36,55-61
**Suggested Layer**: Component

### TC-504: No sandbox-limit banner appears on the bookings page
**Category**: UI State
**Priority**: P3
**Preconditions**: User has any number of bookings, including 6+ (near/at the 9-booking limit)
**Steps**:
1. Navigate to `/bookings` with 6, 8, and 9 bookings
**Expected Results**: No sandbox warning banner is rendered on `/bookings` at any count — this corrects `eventhub-domain/business-rules.md` #5, which claims a "conditional banner" exists on the bookings page; actual code shows the sandbox-limits banner (`sandbox holds up to 9 bookings and 6 custom events`) only renders on `/events` when `events.length > 5`
**Business Rule**: Discovered code behavior contradicts documented rule — frontend/app/bookings/page.tsx has no banner; frontend/app/events/page.tsx:74-83 has the only banner
**Suggested Layer**: E2E

### TC-505: Cancel Booking button hidden for non-confirmed bookings
**Category**: UI State
**Priority**: P2
**Preconditions**: A booking with `status !== 'confirmed'` (e.g. already cancelled, if such a booking could still be fetched/displayed)
**Steps**:
1. View that booking's card and detail page
**Expected Results**: "Cancel Booking" button not rendered on either card (`BookingCard.jsx:82-84`) or detail page (`bookings/[id]/page.tsx:166-168`), since both conditionally render on `status === 'confirmed'`
**Business Rule**: Booking status field, default "confirmed" (schema.prisma) — status transitions aren't otherwise triggered in the app, so this is largely a defensive-UI check
**Suggested Layer**: Component

### TC-506: Cancel confirmation dialog shows correct seat-release copy
**Category**: UI State
**Priority**: P3
**Preconditions**: A confirmed booking with `quantity = 3`
**Steps**:
1. Click "Cancel Booking"
**Expected Results**: Dialog description reads "...release 3 seat(s) back to the event..." with the exact quantity interpolated, and correct `bookingRef`
**Business Rule**: BookingCard.jsx:89; bookings/[id]/page.tsx:221
**Suggested Layer**: Component

### TC-507: Booking confirmation card renders immediately after successful booking (no navigation)
**Category**: UI State
**Priority**: P1
**Preconditions**: On `/events/:id` booking form
**Steps**:
1. Submit a valid booking
**Expected Results**: Page does not navigate away; `BookingForm` swaps in-place to `BookingConfirmation` (`confirmed` state), showing ref/customer/tickets/total and links to "View My Bookings" / "Browse More Events"
**Business Rule**: events/[id]/page.tsx:77-79
**Suggested Layer**: E2E

### TC-508: Booking submit button shows loading state and is not double-submittable
**Category**: UI State
**Priority**: P2
**Preconditions**: On the booking form with valid data entered
**Steps**:
1. Click "Confirm Booking" and immediately click again before the request resolves
**Expected Results**: Button enters `loading` state (`isPending` from `useCreateBooking`) and should prevent a duplicate submission; verify only one booking is created, not two
**Business Rule**: events/[id]/page.tsx:71,103-109,152
**Suggested Layer**: E2E

### TC-509: Booking form validation errors clear on successful resubmission
**Category**: UI State
**Priority**: P3
**Preconditions**: Submit the booking form with invalid data first (see TC-308–TC-311)
**Steps**:
1. Trigger validation errors
2. Correct all fields
3. Resubmit
**Expected Results**: All inline error messages clear (`setErrors({})` on valid submit) and booking proceeds
**Business Rule**: events/[id]/page.tsx:99-101
**Suggested Layer**: E2E

### TC-510: Toast notification appears and auto-dismisses on booking cancel error
**Category**: UI State
**Priority**: P3
**Preconditions**: Force a cancel request to fail (e.g. booking already deleted — see TC-315)
**Steps**:
1. Trigger a cancel that results in a server error
**Expected Results**: Error toast shows the server's error message; confirm dialog closes (`setConfirm(false)` in `onError`)
**Business Rule**: BookingCard.jsx:35-38; bookings/[id]/page.tsx:107-110
**Suggested Layer**: E2E
