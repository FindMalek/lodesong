import { type ChildProcess, spawn } from "node:child_process";
import { expect, test } from "./fixtures";

// The public demo is a server setting, so these run against a second player (same build, PUBLIC_DEMO=on) in front of the mock.
const OFFSET = Number(process.env.E2E_PORT_OFFSET ?? 0);
// Its own port per worker and browser, so repeats or shards running side by side never share a server.
const port = () => 4400 + OFFSET + (test.info().project.name === "webkit" ? 50 : 0) + test.info().parallelIndex;
const base = () => `http://127.0.0.1:${port()}`;

test.describe.configure({ mode: "serial" });

let server: ChildProcess | undefined;

test.beforeAll(async () => {
  server = spawn("./dist/lodesong", {
    env: {
      ...process.env,
      PORT: String(port()),
      NAVIDROME_URL: process.env.E2E_MOCK_URL ?? "",
      DATA_DIR: `test-results/demo-data-${port()}`,
      PUBLIC_DEMO: "on",
      TRUST_PROXY: "true",
      DEMO_USER: "demo",
      DEMO_PASSWORD: "demo",
      LYRICS_BACKFILL: "off",
      LRCLIB_URL: "",
      UPDATE_CHECK: "off",
    },
    stdio: "ignore",
  });
  await expect
    .poll(
      () =>
        fetch(`${base()}/healthz`).then(
          (response) => response.ok,
          () => false,
        ),
      { timeout: 30_000 },
    )
    .toBe(true);
});

test.afterAll(async () => {
  if (!server || server.exitCode !== null) return;
  const stopped = new Promise((resolve) => server?.once("exit", resolve));
  server.kill();
  await stopped;
});

// Sign-ins are limited per address; each test is its own visitor, as the proxy in front of the demo would say.
test.beforeEach(async ({ page }) => {
  await page.setExtraHTTPHeaders({
    "x-forwarded-for": `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
  });
});

const signedIn = (page: import("@playwright/test").Page) =>
  page.getByRole("link", { name: "albums", exact: true }).or(page.getByRole("button", { name: "open menu" }));

test("a visitor lands signed in with no form, with a notice and no log out", async ({ page }) => {
  await page.goto(`${base()}/`);
  await expect(signedIn(page)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByLabel("password")).toHaveCount(0);

  await expect(page.getByText("public demo, resets every night")).toBeVisible();
  await page.getByRole("button", { name: "dismiss" }).click();
  await page.reload();
  await expect(signedIn(page)).toBeVisible();
  await expect(page.getByText("public demo, resets every night")).toHaveCount(0);

  await page.getByRole("button", { name: /demo$/ }).click();
  await expect(page.getByRole("menuitem", { name: "settings" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "log out" })).toHaveCount(0);
});

test("when the music server is down it says so and lets the visitor try again", async ({ page }) => {
  let failures = 1;
  await page.route("**/auth/demo", (route) =>
    failures-- > 0 ? route.fulfill({ status: 502, json: { error: "can't reach the music server" } }) : route.continue(),
  );
  await page.goto(`${base()}/`);
  await expect(page.getByText("can't reach the music server")).toBeVisible();
  await expect(page.getByLabel("password")).toHaveCount(0);
  await page.getByRole("button", { name: "try again" }).click();
  await expect(signedIn(page)).toBeVisible({ timeout: 15_000 });
});

test("a slow health check doesn't hold back the normal form on a server that isn't a demo", async ({ page }) => {
  await page.route("**/api/health", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 4000));
    await route.continue().catch(() => undefined);
  });
  await page.goto("/");
  await expect(page.getByLabel("password")).toBeVisible({ timeout: 1500 });
});

test("with cookies blocked it stops asking instead of looping", async ({ page }) => {
  let asked = 0;
  await page.route("**/auth/demo", (route) => {
    asked += 1;
    return route.fulfill({ json: { user: "demo", server: "default" } });
  });
  await page.goto(`${base()}/`);
  await expect(page.getByText("the demo can't keep you signed in")).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(1500);
  expect(asked).toBeLessThanOrEqual(2);
});
