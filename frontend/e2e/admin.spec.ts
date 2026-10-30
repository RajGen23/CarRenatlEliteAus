import { expect, test } from "@playwright/test";

import {
  ADMIN,
  DEMO_HOST,
  TINY_PNG,
  api,
  apiLogin,
  apiReadyRenter,
  apiRegister,
  apiRequestBooking,
  auth,
  captureDialogs,
  signIn,
  tid,
} from "./helpers";

test.skip(!ADMIN.password, "Set E2E_ADMIN_PASSWORD to run the admin portal tests");

async function hostWithPendingCar() {
  const ctx = await api();
  const host = await apiRegister(ctx, "e2e_admin_host");
  const onboard = await ctx.post("vendor/onboard", {
    headers: auth(host.token),
    data: {
      company: "Review Motors", phone: "+61 400 111 000", license_no: "H-1",
      bank_account_name: "Review Motors", bank_bsb: "063000", bank_account_no: "11112222",
    },
  });
  expect(onboard.ok(), await onboard.text()).toBeTruthy();
  const model = `GT ${Date.now().toString(36)}`;
  const doc = { content_type: "image/png", data_b64: TINY_PNG.toString("base64") };
  const car = await ctx.post("vendor/cars", {
    headers: auth(host.token),
    data: {
      brand: "Bentley", model, category: "Luxury", price_per_day: 990, fuel_type: "Petrol",
      transmission: "Automatic", seats: 4, image: "https://example.com/bentley.jpg", description: "E2E",
      insurance_expiry: "2029-12-31", insurance_document: doc, registration_document: doc,
    },
  });
  expect(car.ok(), await car.text()).toBeTruthy();
  return { ctx, host, car: await car.json(), model };
}

test.describe("Admin portal", () => {
  test("admin reviews documents and approves a car, which then appears to renters", async ({ page, context }) => {
    const { ctx, car, model } = await hostWithPendingCar();
    expect((await ctx.get(`cars/${car.car_id}`)).status()).toBe(404);

    captureDialogs(page);
    await signIn(page, ADMIN.username, ADMIN.password);
    await expect(page).toHaveURL(/\/admin\/dashboard$/);
    await tid(page, "nav-vehicles").click();
    await tid(page, "filter-pending").click();
    const row = page.locator("div", { hasText: model }).filter({ has: page.getByText("Approve", { exact: true }) }).last();
    await expect(row.getByText("Insurance", { exact: true })).toBeVisible();

    const popup = context.waitForEvent("page");
    await row.getByText("Insurance", { exact: true }).click();
    const doc = await popup;
    expect(doc.url()).toMatch(/^blob:/);
    await doc.close();

    await row.getByText("Approve", { exact: true }).click();
    await expect(page.getByText(model)).toHaveCount(0);
    await expect.poll(async () => (await ctx.get(`cars/${car.car_id}`)).status()).toBe(200);
    await ctx.dispose();
  });

  test("refunds are offered only on charged bookings and need confirmation", async ({ page }) => {
    const ctx = await api();
    const adminToken = await apiLogin(ctx, ADMIN.username, ADMIN.password);
    const hostToken = await apiLogin(ctx, DEMO_HOST.username, DEMO_HOST.password);
    const renter = await apiReadyRenter(ctx, "e2e_refund");
    const pending = await apiRequestBooking(ctx, renter.token);
    const charged = await apiRequestBooking(ctx, renter.token);
    const accepted = await ctx.post(`vendor/bookings/${charged.booking_id}/accept`, { headers: auth(hostToken) });
    expect(accepted.ok(), await accepted.text()).toBeTruthy();

    const direct = await ctx.post(`admin/bookings/${pending.booking_id}/refund`, { headers: auth(adminToken), data: {} });
    expect(direct.status()).toBe(400);

    const dialogs = captureDialogs(page);
    await signIn(page, ADMIN.username, ADMIN.password);
    await tid(page, "nav-bookings").click();
    await expect(page.getByText(/\d+ bookings/)).toBeVisible();
    await expect(tid(page, `refund-${pending.booking_id}`)).toHaveCount(0);

    const walletBefore = (await (await ctx.get("wallet", { headers: auth(renter.token) })).json()).balance;
    await tid(page, `refund-${charged.booking_id}`).click();
    await expect.poll(() => dialogs.join(" ")).toContain(`$${charged.total.toFixed(2)} goes back to`);
    await expect(tid(page, `refund-${charged.booking_id}`)).toHaveCount(0);
    const walletAfter = (await (await ctx.get("wallet", { headers: auth(renter.token) })).json()).balance;
    expect(Math.round((walletAfter - walletBefore) * 100) / 100).toBe(charged.total);

    const again = await ctx.post(`admin/bookings/${charged.booking_id}/refund`, { headers: auth(adminToken), data: {} });
    expect(again.status()).toBe(400);
    await ctx.dispose();
  });

  test("admin portal is usable on a phone-sized screen", async ({ browser }) => {
    const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    await signIn(page, ADMIN.username, ADMIN.password);
    await expect(page.getByText("Overview").first()).toBeVisible();
    await expect(tid(page, "nav-vehicles")).toHaveCount(0);
    await tid(page, "admin-menu").click();
    await tid(page, "nav-vehicles").click();
    await expect(page).toHaveURL(/\/admin\/vehicles$/);
    await expect(tid(page, "nav-vehicles")).toHaveCount(0);
  });
});
