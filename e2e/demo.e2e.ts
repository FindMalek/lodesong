import { type ChildProcess, spawn } from "node:child_process";
import { expect, test } from "./fixtures";

// The public demo is a server setting, so these run against a second player (same build, PUBLIC_DEMO=on) in front of the mock.
const OFFSET = Number(process.env.E2E_PORT_OFFSET ?? 0);
const port = () => 4560 + OFFSET + (test.info().project.name === "webkit" ? 1 : 0);
const base = () => `http://127.0.0.1:${port()}`;

let server: ChildProcess | undefined;

test.beforeAll(async () => {
  server = spawn("./dist/lodesong", {
    env: {
      ...process.env,
      PORT: String(port()),
      NAVIDROME_URL: process.env.E2E_MOCK_URL ?? "",
      DATA_DIR: `test-results/demo-data-${port()}`,
      PUBLIC_DEMO: "on",
      INDEX_USER: "demo",
      INDEX_PASSWORD: "demo",
      ONE_SESSION: "off",
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

test.afterAll(() => {
  server?.kill();
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
