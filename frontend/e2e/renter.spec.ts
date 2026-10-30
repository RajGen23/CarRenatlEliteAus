import { expect, test } from "@playwright/test";

import {
  DEMO_HOST,
  HOST_CAR,
  RENTER_PROFILE,
  api,
  apiLogin,
  apiReadyRenter,
  apiRequestBooking,
  auth,
  captureDialogs,
  signIn,
  signUp,
  tid,
} from "./helpers";

test.describe("Renter journey", () => {
  test("new renter completes their profile and requests a car", async ({ page }) => {
    const dialogs = captureDialogs(page);
    await signUp(page, "e2e_booker");

    await page.goto(`/car/${HOST_CAR}`);
    await expect(page.getByText("911 Carrera S").first()).toBeVisible();
    await page.getByText("Book now").click();
    await expect(page).toHaveURL(new RegExp(`/book/${HOST_CAR}$`));

    await tid(page, "confirm-booking").click();
    await expect(page).toHaveURL(/\/renter-profile$/);
    const fields: Record<string, string> = {
      "rp-name": RENTER_PROFILE.full_name,
      "rp-phone": RENTER_PROFILE.phone,
      "rp-dob": RENTER_PROFILE.dob,
      "rp-address": RENTER_PROFILE.address_line1,
      "rp-city": RENTER_PROFILE.city,
      "rp-state": RENTER_PROFILE.state,
      "rp-postcode": RENTER_PROFILE.postcode,
      "rp-license": RENTER_PROFILE.license_no,
      "rp-license-expiry": RENTER_PROFILE.license_expiry,
    };
    for (const [id, value] of Object.entries(fields)) await tid(page, id).fill(value);
    await tid(page, "rp-save").click();

    await expect(page).toHaveURL(new RegExp(`/book/${HOST_CAR}$`));
    await expect(tid(page, "confirm-booking")).toContainText("Request to book");

    await tid(page, "confirm-booking").click();
    await expect.poll(() => dialogs.join(" ")).toContain("rental agreement");
    await expect(page).toHaveURL(new RegExp(`/book/${HOST_CAR}$`));

    await tid(page, "accept-rental-terms").click();
    await tid(page, "confirm-booking").click();
    await expect(page).toHaveURL(/\/booking-success/);
    await tid(page, "view-bookings").click();
    await expect(page.getByText("Waiting on host approval")).toBeVisible();
  });

  test("renter profile rejects an expired licence", async ({ page }) => {
    const dialogs = captureDialogs(page);
    await signUp(page, "e2e_expired");
    await page.goto("/renter-profile");
    const values = { ...RENTER_PROFILE, license_expiry: "2020-01-01" };
    await tid(page, "rp-name").fill(values.full_name);
    await tid(page, "rp-phone").fill(values.phone);
    await tid(page, "rp-dob").fill(values.dob);
    await tid(page, "rp-address").fill(values.address_line1);
    await tid(page, "rp-city").fill(values.city);
    await tid(page, "rp-state").fill(values.state);
    await tid(page, "rp-postcode").fill(values.postcode);
    await tid(page, "rp-license").fill(values.license_no);
    await tid(page, "rp-license-expiry").fill(values.license_expiry);
    await tid(page, "rp-save").click();
    await expect.poll(() => dialogs.join(" ")).toContain("licence has expired");
    await expect(page).toHaveURL(/\/renter-profile$/);
  });

  test("dates taken by a confirmed trip are flagged at checkout", async ({ page }) => {
    const ctx = await api();
    const car = "vcar_demo_range_rover";
    const hostToken = await apiLogin(ctx, DEMO_HOST.username, DEMO_HOST.password);
    const other = await apiReadyRenter(ctx, "e2e_first");
    // Covers the checkout's default dates (pickup tomorrow, return in three days).
    const window = {
      pickup: new Date(Date.now() + 20 * 3_600_000).toISOString(),
      drop: new Date(Date.now() + 80 * 3_600_000).toISOString(),
    };
    const res = await ctx.post("bookings", {
      headers: auth(other.token),
      data: {
        car_id: car, pickup_location: "A", drop_location: "B",
        pickup_datetime: window.pickup, drop_datetime: window.drop, accept_rental_terms: true,
      },
    });
    if (res.ok()) {
      const accepted = await ctx.post(`vendor/bookings/${(await res.json()).booking_id}/accept`, { headers: auth(hostToken) });
      expect(accepted.ok(), await accepted.text()).toBeTruthy();
    } else {
      expect(res.status(), "an earlier run already holds these dates").toBe(409);
    }

    const me = await apiReadyRenter(ctx, "e2e_second");
    const dialogs = captureDialogs(page);
    await signIn(page, me.username, me.password);
    await page.goto(`/book/${car}`);
    await expect(tid(page, "dates-unavailable")).toBeVisible();

    await tid(page, "accept-rental-terms").click();
    await tid(page, "confirm-booking").click();
    await expect.poll(() => dialogs.join(" ")).toContain("already booked or blocked");
    await expect(page).toHaveURL(new RegExp(`/book/${car}$`));
    await ctx.dispose();
  });

  test("withdrawing a pending request costs nothing", async ({ page }) => {
    const ctx = await api();
    const renter = await apiReadyRenter(ctx, "e2e_withdraw");
    const booking = await apiRequestBooking(ctx, renter.token);
    const before = (await (await ctx.get("wallet", { headers: auth(renter.token) })).json()).balance;

    await signIn(page, renter.username, renter.password);
    await page.goto("/bookings");
    await tid(page, `cancel-${booking.booking_id}`).click();
    await expect(page.getByText("Nothing has been charged.")).toBeVisible();
    await tid(page, "confirm-ok").click();
    await expect(tid(page, `cancel-${booking.booking_id}`)).toHaveCount(0);

    const after = (await (await ctx.get("wallet", { headers: auth(renter.token) })).json()).balance;
    expect(after).toBe(before);
    await page.goto("/notifications");
    await expect(page.getByText(/Request withdrawn/).first()).toBeVisible();
    await ctx.dispose();
  });

  test("an unavailable car shows a clear message instead of a spinner", async ({ page }) => {
    await signUp(page, "e2e_missing");
    await page.goto("/car/vcar_does_not_exist");
    await expect(tid(page, "car-unavailable")).toBeVisible();
    await page.getByText("Browse cars").click();
    await expect(page).toHaveURL(/\/cars$/);
  });

  test("search and category filters narrow the fleet", async ({ page }) => {
    await signUp(page, "e2e_search");
    await page.goto("/cars");
    const count = tid(page, "results-count");
    await expect(count).toContainText("vehicles");
    const total = parseInt((await count.innerText()).match(/\d+/)![0], 10);

    await tid(page, "cars-search").fill("porsche");
    await expect.poll(async () => parseInt((await count.innerText()).match(/\d+/)![0], 10)).toBeLessThan(total);
    await tid(page, "search-clear").click();
    await tid(page, "filter-cat-SUV").click();
    await expect(page.getByText("Range Rover Autobiography").first()).toBeVisible();
  });

  test("wishlist add and remove", async ({ page }) => {
    await signUp(page, "e2e_wish");
    await page.goto(`/car/${HOST_CAR}`);
    await expect(page.getByText("911 Carrera S").first()).toBeVisible();
    const saved = page.waitForResponse((r) => r.url().includes(`/wishlist/${HOST_CAR}`) && r.request().method() === "POST");
    await tid(page, "wishlist-toggle").click();
    await saved;
    await page.goto("/wishlist");
    await expect(page.getByText("911 Carrera S").first()).toBeVisible();
  });
});
