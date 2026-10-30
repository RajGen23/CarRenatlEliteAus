import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests drive the web build against a running API.
 *
 *   cd backend && SEED_DEMO_DATA=true ADMIN_PASSWORD='<12+ chars>' uvicorn server:app
 *   cd frontend && EXPO_PUBLIC_BACKEND_URL=http://localhost:8000 npx expo start --web
 *   cd frontend && E2E_ADMIN_PASSWORD='<same>' npm run e2e
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:8081",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "phone", use: { ...devices["Pixel 7"], browserName: "chromium" }, testIgnore: /admin\.spec/ },
    { name: "desktop", use: { viewport: { width: 1440, height: 900 }, browserName: "chromium" }, testMatch: /admin\.spec/ },
  ],
});
