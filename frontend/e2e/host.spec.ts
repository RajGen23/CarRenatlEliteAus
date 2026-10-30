import { expect, test } from "@playwright/test";

import {
  DEMO_HOST,
  HOST_CAR,
  RENTER_PROFILE,
  TINY_PNG,
  api,
  apiReadyRenter,
  apiRequestBooking,
  captureDialogs,
  signIn,
  signUp,
  tid,
} from "./helpers";

test.describe("Host journey", () => {
  test("new host finishes onboarding and lands on their dashboard", async ({ page }) => {
    captureDialogs(page);
    await signUp(page, "e2e_newhost");
    await page.goto("/profile");
    await tid(page, "become-host-cta").click();
    await expect(page).toHaveURL(/\/vendor\/onboarding$/);

    await tid(page, "onboard-next").click();
    await expect(page.getByText("Tell us about your")).toBeVisible();

    await tid(page, "f-company").fill("Playwright Motors");
    await tid(page, "f-phone").fill("+61 400 777 888");
    await tid(page, "onboard-next").click();
    await tid(page, "f-license").fill("VIC-HOST-77");
    await tid(page, "onboard-next").click();
    await tid(page, "f-bank-name").fill("Playwright Motors");
    await tid(page, "f-bsb").fill("063000");
    await tid(page, "f-acct").fill("12345678");
    await tid(page, "onboard-next").click();

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText("Welcome back, host")).toBeVisible();
    await page.waitForTimeout(1500);
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("host lists a car with documents and sees it go into review", async ({ page }) => {
    const dialogs = captureDialogs(page);
    await signUp(page, "e2e_lister");
    await page.goto("/vendor/onboarding");
    await tid(page, "f-company").fill("Lister Co");
    await tid(page, "f-phone").fill("+61 400 777 999");
    await tid(page, "onboard-next").click();
    await tid(page, "f-license").fill("VIC-L-1");
    await tid(page, "onboard-next").click();
    await tid(page, "f-bank-name").fill("Lister Co");
    await tid(page, "f-bsb").fill("063000");
    await tid(page, "f-acct").fill("87654321");
    await tid(page, "onboard-next").click();
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.goto("/vendor/car-form");
    await tid(page, "f-brand").fill("Aston Martin");
    await tid(page, "f-model").fill("DB12");
    await tid(page, "f-price").fill("1350");

    await tid(page, "vehicle-submit").click();
    await expect.poll(() => dialogs.join(" ")).toContain("insurance expiry");

    await tid(page, "f-insurance-expiry").fill("2028-03-31");
    for (const kind of ["insurance", "registration"]) {
      const chooser = page.waitForEvent("filechooser");
      await tid(page, `f-doc-${kind}`).click();
      await (await chooser).setFiles({ name: `${kind}.png`, mimeType: "image/png", buffer: TINY_PNG });
      await expect(tid(page, `f-doc-${kind}`)).toContainText(`${kind}.png`);
    }
    await tid(page, "vehicle-submit").click();

    await expect(page).toHaveURL(/\/fleet$/);
    const card = page.locator('[data-testid^="fleet-car-"]', { hasText: "DB12" });
    await expect(card).toBeVisible();
    await expect(card.locator('[data-testid^="listing-status-"]')).toHaveText("In review");
  });

  test("host sees only the renter's summary before accepting, contact details after", async ({ page }) => {
    const ctx = await api();
    const renter = await apiReadyRenter(ctx, "e2e_privacy");
    const booking = await apiRequestBooking(ctx, renter.token);

    captureDialogs(page);
    await signIn(page, DEMO_HOST.username, DEMO_HOST.password);
    await page.goto("/requests");
    const card = tid(page, `request-${booking.booking_id}`);
    await expect(card).toContainText(RENTER_PROFILE.full_name);
    await expect(card).toContainText("shared once you accept");
    await expect(card).not.toContainText(RENTER_PROFILE.phone);
    await expect(card).not.toContainText(RENTER_PROFILE.address_line1);

    await tid(page, `accept-${booking.booking_id}`).click();
    await expect(card).toHaveCount(0);

    await page.getByText("Bookings", { exact: true }).click();
    await expect(page).toHaveURL(/\/reservations$/);
    const confirmed = tid(page, `v-booking-${booking.booking_id}`);
    await expect(confirmed).toContainText(RENTER_PROFILE.phone);
    await expect(confirmed).toContainText(RENTER_PROFILE.license_no);
    await expect(confirmed).not.toContainText(RENTER_PROFILE.address_line1);

    await page.reload();
    await expect(page).toHaveURL(/\/reservations$/);
    await expect(page.getByText("Reservations")).toBeVisible();

    const pickupDay = new Date(booking.pickup_datetime).toLocaleDateString("en-CA", { timeZone: "Australia/Melbourne" });
    await page.goto(`/vendor/calendar?id=${HOST_CAR}`);
    await expect(page.getByText("Booked", { exact: true })).toBeVisible();
    expect(await (await ctx.get(`cars/${HOST_CAR}/availability`)).json()).toBeTruthy();
    const months = Math.max(0, Math.round((new Date(pickupDay).getTime() - Date.now()) / (30 * 86_400_000)));
    for (let i = 0; i < months + 2 && !(await tid(page, `cal-day-${pickupDay}`).isVisible()); i++) {
      await tid(page, "cal-next").click();
    }
    await expect(tid(page, `cal-day-${pickupDay}`)).toHaveAttribute("aria-label", `${pickupDay}, booked`);
    await ctx.dispose();
  });

  test("host declines a request with a reason the renter can see", async ({ page, browser }) => {
    const ctx = await api();
    const renter = await apiReadyRenter(ctx, "e2e_declined");
    const booking = await apiRequestBooking(ctx, renter.token);

    captureDialogs(page);
    await signIn(page, DEMO_HOST.username, DEMO_HOST.password);
    await page.goto("/requests");
    await tid(page, `decline-${booking.booking_id}`).click();
    await expect(tid(page, "decline-sheet")).toBeVisible();
    await tid(page, "reason-Vehicle under maintenance").click();
    await tid(page, "decline-note").fill("Back in two weeks");
    await tid(page, "decline-submit").click();
    await expect(tid(page, `request-${booking.booking_id}`)).toHaveCount(0);

    const renterPage = await (await browser.newContext({ viewport: { width: 412, height: 915 } })).newPage();
    await signIn(renterPage, renter.username, renter.password);
    await renterPage.goto("/bookings");
    await renterPage.getByTestId("tab-cancelled").click();
    await expect(renterPage.getByText("Vehicle under maintenance")).toBeVisible();
    await ctx.dispose();
  });

  test("payout requests can't exceed completed-trip earnings", async ({ page }) => {
    const dialogs = captureDialogs(page);
    await signIn(page, DEMO_HOST.username, DEMO_HOST.password);
    await page.goto("/earnings");
    await expect(page.getByText("AVAILABLE FOR PAYOUT")).toBeVisible();
    await tid(page, "payout-amount").fill("99999999");
    await tid(page, "request-payout").click();
    await expect.poll(() => dialogs.join(" ")).toMatch(/Max available|up to/);
  });
});
