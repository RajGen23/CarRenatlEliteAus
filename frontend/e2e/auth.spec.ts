import { expect, test } from "@playwright/test";

import { DEMO_RENTER, signIn, signUp, tid, uniqueName } from "./helpers";

test.describe("Accounts", () => {
  test("sign-up requires an email and accepting the terms", async ({ page }) => {
    await page.goto("/register");
    const username = uniqueName("e2e_signup");
    await tid(page, "reg-username").fill(username);
    await tid(page, "reg-password").fill("Secret123");
    await tid(page, "reg-confirm").fill("Secret123");
    await tid(page, "reg-submit").click();
    await expect(page.getByText("Email is required.")).toBeVisible();

    await tid(page, "reg-email").fill("not-an-email");
    await tid(page, "reg-submit").click();
    await expect(page.getByText("Please enter a valid email address.")).toBeVisible();

    await tid(page, "reg-email").fill(`${username}@example.com`);
    await tid(page, "reg-submit").click();
    await expect(page.getByText("Please accept the Terms of Service to continue.")).toBeVisible();

    await tid(page, "reg-accept-terms").click();
    await tid(page, "reg-submit").click();
    await expect(page).toHaveURL(/\/home$/);
    await expect(tid(page, "header-user")).toBeVisible();
  });

  test("wrong password shows an error and the right one signs in", async ({ page }) => {
    await page.goto("/login");
    await tid(page, "login-identifier").fill(DEMO_RENTER.username);
    await tid(page, "login-password").fill("definitely-wrong");
    await tid(page, "login-submit").click();
    await expect(page.getByText("Invalid username or password.")).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);

    await signIn(page, DEMO_RENTER.username, DEMO_RENTER.password);
    await expect(page).toHaveURL(/\/home$/);
  });

  test("signing out returns to the login screen", async ({ page }) => {
    await signUp(page, "e2e_logout");
    await page.goto("/profile");
    await tid(page, "logout-btn").click();
    await tid(page, "confirm-ok").click();
    await expect(page).toHaveURL(/\/login$/);
  });
});
