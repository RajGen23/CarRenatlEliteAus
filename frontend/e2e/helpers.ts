import { APIRequestContext, Page, expect, request as playwrightRequest } from "@playwright/test";

export const API = `${process.env.E2E_API_URL ?? "http://localhost:8000"}/api`;
export const ADMIN = { username: process.env.E2E_ADMIN_USERNAME ?? "admin", password: process.env.E2E_ADMIN_PASSWORD ?? "" };
export const DEMO_HOST = { username: "vendordemo", password: "Vendor@123" };
export const DEMO_RENTER = { username: "userdemo", password: "User@123" };
export const HOST_CAR = "vcar_demo_porsche_911";

export const RENTER_PROFILE = {
  full_name: "Playwright Renter",
  phone: "+61 400 222 333",
  dob: "1991-07-09",
  address_line1: "120 Collins Street",
  city: "Melbourne",
  state: "VIC",
  postcode: "3000",
  license_no: "VIC-E2E-001",
  license_expiry: "2032-01-31",
};

export const tid = (page: Page, id: string) => page.getByTestId(id);

export function uniqueName(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
}

/** Accept every browser dialog (alerts and confirms) and keep their text for assertions. */
export function captureDialogs(page: Page): string[] {
  const messages: string[] = [];
  page.on("dialog", async (dialog) => {
    messages.push(dialog.message());
    await dialog.accept();
  });
  return messages;
}

export async function api(): Promise<APIRequestContext> {
  return playwrightRequest.newContext({ baseURL: `${API}/` });
}

export async function apiLogin(ctx: APIRequestContext, identifier: string, password: string) {
  const res = await ctx.post("auth/login", { data: { identifier, password } });
  expect(res.ok(), await res.text()).toBeTruthy();
  return (await res.json()).session_token as string;
}

export async function apiRegister(ctx: APIRequestContext, prefix: string) {
  const username = uniqueName(prefix);
  const res = await ctx.post("auth/register", {
    data: { username, password: "Secret123", email: `${username}@example.com`, accept_terms: true, name: prefix },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  const body = await res.json();
  return { username, password: "Secret123", token: body.session_token as string, userId: body.user.user_id as string };
}

export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/** A renter with a complete profile and enough wallet credit to book. */
export async function apiReadyRenter(ctx: APIRequestContext, prefix = "e2e_renter") {
  const renter = await apiRegister(ctx, prefix);
  const profile = await ctx.patch("profile/renter", { headers: auth(renter.token), data: RENTER_PROFILE });
  expect(profile.ok(), await profile.text()).toBeTruthy();
  await ctx.post("wallet/topup", { headers: auth(renter.token), data: { amount: 20000 } });
  return renter;
}

let slot = 400 + Math.floor(Math.random() * 2000);

/** Future booking dates that don't overlap any other test booking. */
export function freeWindow(days = 2) {
  slot += days + 2;
  const pickup = new Date(Date.now() + slot * 86_400_000);
  pickup.setUTCMinutes(0, 0, 0);
  const drop = new Date(pickup.getTime() + days * 86_400_000);
  return { pickup: pickup.toISOString(), drop: drop.toISOString() };
}

export async function apiRequestBooking(ctx: APIRequestContext, token: string, carId = HOST_CAR, window = freeWindow()) {
  const res = await ctx.post("bookings", {
    headers: auth(token),
    data: {
      car_id: carId,
      pickup_location: "Crown Casino · Southbank, VIC",
      drop_location: "Melbourne Airport · Tullamarine",
      pickup_datetime: window.pickup,
      drop_datetime: window.drop,
      accept_rental_terms: true,
    },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  return res.json();
}

export async function signIn(page: Page, identifier: string, password: string) {
  await page.goto("/login");
  await tid(page, "login-identifier").fill(identifier);
  await tid(page, "login-password").fill(password);
  await tid(page, "login-submit").click();
  await expect(page).not.toHaveURL(/\/login$/);
}

export async function signUp(page: Page, prefix: string) {
  const username = uniqueName(prefix);
  await page.goto("/register");
  await tid(page, "reg-username").fill(username);
  await tid(page, "reg-email").fill(`${username}@example.com`);
  await tid(page, "reg-password").fill("Secret123");
  await tid(page, "reg-confirm").fill("Secret123");
  await tid(page, "reg-accept-terms").click();
  await tid(page, "reg-submit").click();
  await expect(page).toHaveURL(/\/home$/);
  return username;
}

/** Tiny PNG used for document uploads. */
export const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);
