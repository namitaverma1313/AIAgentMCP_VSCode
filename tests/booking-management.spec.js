import { test, expect } from '@playwright/test';

const BASE_URL      = 'https://eventhub.rahulshettyacademy.com';
const USER_EMAIL    = 'rahulshetty1@gmail.com';
const USER_PASSWORD = 'Magiclife1!';

// Second, independent account — used only by TC-200 to prove cross-user isolation.
const USER_B_EMAIL    = 'rahulshetty1@yahoo.com';
const USER_B_PASSWORD = 'Magiclife1!';

// ── Helpers ────────────────────────────────────────────────────────────────────

async function login(page, email = USER_EMAIL, password = USER_PASSWORD) {
  await page.goto(`${BASE_URL}/login`);
  await page.getByPlaceholder('you@email.com').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.locator('#login-btn').click();
  // Home page loads after login — "Browse Events →" link confirms successful auth
  await expect(page.getByRole('link', { name: /Browse Events/i }).first()).toBeVisible();
}

/**
 * Clears all bookings so each test starts from a known, isolated state.
 * Safe to call when already empty.
 */
async function clearBookings(page) {
  await page.goto(`${BASE_URL}/bookings`);
  const alreadyEmpty = await page.getByText('No bookings yet').isVisible().catch(() => false);
  if (alreadyEmpty) return;

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: /clear all bookings/i }).click();
  await expect(page.getByText('No bookings yet')).toBeVisible();
}

/**
 * Books 1 ticket on the first available (non-sold-out) event, leaving quantity
 * at its default of 1. Returns confirmation-card data for assertions.
 * Precondition: user must be logged in before calling.
 */
async function bookEvent(page) {
  await page.goto(`${BASE_URL}/events`);

  // Pick the first card that has a visible "Book Now" button (not sold out)
  const firstCard = page.getByTestId('event-card').filter({
    has: page.getByTestId('book-now-btn'),
  }).first();
  await expect(firstCard).toBeVisible();

  const eventTitle = (await firstCard.locator('h3').textContent())?.trim() ?? '';
  console.log(`Booking event: "${eventTitle}"`);

  await firstCard.getByTestId('book-now-btn').click();
  await expect(page).toHaveURL(/\/events\/\d+/);

  // Capture the per-ticket price shown next to the "Book Tickets" heading,
  // before quantity/total math can be affected by anything else on the page.
  const pricePerTicket = (
    await page.locator('h2:text("Book Tickets") + span').textContent()
  )?.trim() ?? '';

  // Quantity defaults to 1 — confirm the stepper hasn't drifted before submitting.
  await expect(page.locator('#ticket-count')).toHaveText('1');

  // Fill booking form
  await page.getByLabel('Full Name').fill('Test User');
  await page.getByTestId('customer-email').fill('testuser@example.com');
  await page.getByPlaceholder('+91 98765 43210').fill('9876543210');
  await page.locator('.confirm-booking-btn').click();

  // Wait for confirmation card
  const refEl = page.locator('.booking-ref').first();
  await expect(refEl).toBeVisible();
  const bookingRef = (await refEl.textContent())?.trim() ?? '';
  console.log(`Booking confirmed. Ref: ${bookingRef}`);

  return { bookingRef, eventTitle, pricePerTicket };
}

/**
 * Opens a booking's detail page from /bookings by its ref and returns the
 * numeric booking id parsed from the resulting /bookings/:id URL.
 * Precondition: caller is logged in and the booking exists in their list.
 */
async function getBookingId(page, bookingRef) {
  await page.goto(`${BASE_URL}/bookings`);
  const card = page.getByTestId('booking-card').filter({ hasText: bookingRef });
  await card.getByRole('link', { name: 'View Details' }).click();
  await expect(page).toHaveURL(/\/bookings\/\d+/);
  return page.url().match(/\/bookings\/(\d+)/)?.[1];
}

// ── Test Suite ─────────────────────────────────────────────────────────────────
// Covers the 4 critical E2E scenarios from docs/test-strategy.md's critical-path
// table: TC-001, TC-006, TC-008, TC-200. All other booking-management scenarios
// in docs/test-scenarios.md are assigned to API/Component/Unit layers per the
// strategy doc and are intentionally NOT duplicated here.

test.describe('Booking Management — Critical E2E Flows', () => {

  // TC-001 ───────────────────────────────────────────────────────────────────
  test('TC-001: books a single ticket and shows correct confirmation details', async ({ page }) => {
    // -- Step 1: Login and start from a clean slate --
    await login(page);
    await clearBookings(page);

    // -- Step 2: Book 1 ticket on the first available event --
    const { bookingRef, eventTitle, pricePerTicket } = await bookEvent(page);

    // -- Step 3: Confirmation card shows ref, customer, quantity, and total = price x 1 --
    // The booking form (and its own "Tickets"/"Total" labels) unmounts once confirmed,
    // so these label->sibling lookups are unambiguous on the confirmation view.
    await expect(page.getByText('Booking Confirmed!')).toBeVisible();
    await expect(page.getByText('Test User')).toBeVisible();
    await expect(page.locator('span:text-is("Tickets") + span')).toHaveText('1');
    // Quantity is 1, so the confirmed total must equal the per-ticket price captured pre-submit
    await expect(page.locator('span:text-is("Total") + span')).toHaveText(pricePerTicket);

    // -- Step 4: Booking appears in /bookings --
    await page.goto(`${BASE_URL}/bookings`);
    const card = page.getByTestId('booking-card').filter({ hasText: bookingRef });
    await expect(card).toBeVisible();
    await expect(card).toContainText(eventTitle);
    await expect(card).toContainText('confirmed');
  });

  // TC-006 ───────────────────────────────────────────────────────────────────
  test('TC-006: cancels a booking from the detail page — toast, redirect, and removal', async ({ page }) => {
    // -- Step 1: Login, clear state, create exactly one booking --
    await login(page);
    await clearBookings(page);
    const { bookingRef } = await bookEvent(page);

    // -- Step 2: Navigate to the booking detail page via "View Details" --
    await page.goto(`${BASE_URL}/bookings`);
    const card = page.getByTestId('booking-card').filter({ hasText: bookingRef });
    await card.getByRole('link', { name: 'View Details' }).click();
    await expect(page).toHaveURL(/\/bookings\/\d+/);

    // -- Step 3: Click Cancel Booking and confirm the dialog --
    await page.getByRole('button', { name: 'Cancel Booking' }).click();
    await expect(page.getByText('Cancel this booking?')).toBeVisible();
    await page.getByTestId('confirm-dialog-yes').click();

    // -- Step 4: Assert success toast and redirect back to /bookings --
    await expect(page).toHaveURL(`${BASE_URL}/bookings`);
    await expect(page.getByText('Booking cancelled successfully')).toBeVisible();

    // -- Step 5: Booking no longer appears (it was the only one) --
    await expect(page.getByText('No bookings yet')).toBeVisible();
  });

  // TC-008 ───────────────────────────────────────────────────────────────────
  test('TC-008: clears all bookings and shows the empty state', async ({ page }) => {
    // -- Step 1: Login, clear state, create 2+ bookings (TC-008 precondition) --
    await login(page);
    await clearBookings(page);
    await bookEvent(page);
    await bookEvent(page);

    // -- Step 2: Verify bookings exist before clearing --
    await page.goto(`${BASE_URL}/bookings`);
    await expect(page.getByTestId('booking-card').first()).toBeVisible();
    expect(await page.getByTestId('booking-card').count()).toBeGreaterThanOrEqual(2);

    // -- Step 3: Click "Clear all bookings" and accept the native confirm() dialog --
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: /clear all bookings/i }).click();

    // -- Step 4: Assert empty state --
    await expect(page.getByText('No bookings yet')).toBeVisible();
    await expect(page.getByRole('main').getByRole('link', { name: 'Browse Events' })).toBeVisible();
  });

  // TC-200 ───────────────────────────────────────────────────────────────────
  test('TC-200: cannot view another user\'s booking — shows Access Denied', async ({ page, browser }) => {
    // -- Step 1: User A logs in, clears state, creates a booking --
    await login(page);
    await clearBookings(page);
    const { bookingRef } = await bookEvent(page);
    const bookingId = await getBookingId(page, bookingRef);

    // -- Step 2: User B authenticates in a fully separate browser session,
    //    proving real JWT-based isolation rather than shared page state --
    const userBContext = await browser.newContext();
    const userBPage = await userBContext.newPage();
    await login(userBPage, USER_B_EMAIL, USER_B_PASSWORD);

    // -- Step 3: User B navigates directly to User A's booking detail URL --
    await userBPage.goto(`${BASE_URL}/bookings/${bookingId}`);

    // -- Step 4: Access Denied is shown and no booking data is leaked --
    await expect(userBPage.getByText('Access Denied')).toBeVisible();
    await expect(userBPage.getByText('You are not authorized to view this booking.')).toBeVisible();
    await expect(userBPage.getByText(bookingRef)).not.toBeVisible();

    await userBContext.close();
  });

});
