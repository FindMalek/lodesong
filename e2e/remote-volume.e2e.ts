import type { Page } from "@playwright/test";
import { DeviceHub } from "../apps/api/src/devices";
import { expect, fakeMediaClock, signIn, test } from "./fixtures";

// Two tabs of one account joined through the real DeviceHub, as the server does with ONE_SESSION on.
const hub = new DeviceHub();

async function join(page: Page): Promise<void> {
  await page.addInitScript(fakeMediaClock);
  await page.route("**/auth/session", async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, json: { ...(await response.json()), oneSession: true } });
  });
  await page.routeWebSocket("**/api/devices**", (ws) => {
    const url = new URL(ws.url());
    const peer = {
      id: url.searchParams.get("id") ?? "",
      name: url.searchParams.get("name") ?? "",
      session: "e2e",
      send: (message: string) => ws.send(message),
      close: () => ws.close(),
    };
    hub.join("e2e:volume", peer);
    ws.onMessage((message) => hub.handle("e2e:volume", peer, String(message)));
    ws.onClose(() => hub.leave("e2e:volume", peer));
  });
}

const volumeOf = async (page: Page): Promise<number> =>
  Number.parseInt((await page.getByRole("contentinfo").locator("input[aria-label=Volume]").getAttribute("aria-valuetext")) ?? "", 10);

test("the slider of a device that isn't playing sets the volume of the one that is", async ({ page, context }) => {
  await join(page);
  await signIn(page);
  await page.goto("/album/al-26");
  await page.getByRole("button", { name: "play", exact: true }).first().click();
  await expect(page.getByRole("contentinfo").getByRole("button", { name: "pause" })).toBeVisible();
  const here = await volumeOf(page);

  const other = await context.newPage();
  await join(other);
  if (process.env.SCHEME) await other.emulateMedia({ colorScheme: process.env.SCHEME as "light" | "dark" });
  await other.goto("/");
  await expect(other.getByRole("button", { name: /^devices, playing on / })).toBeVisible({ timeout: 10_000 });
  // The other tab's slider shows what the playing one has, and its own volume is not what it shows.
  await expect.poll(() => volumeOf(other)).toBe(here);

  const thumb = other.getByRole("contentinfo").locator("input[aria-label=Volume]");
  await thumb.focus();
  for (let i = 0; i < 6; i++) await thumb.press("ArrowLeft");
  const final = await volumeOf(other);
  expect(final).toBeLessThan(here);
  await expect.poll(() => volumeOf(page)).toBe(final);
  await expect.poll(() => volumeOf(other)).toBe(final);

  if (process.env.SHOT) {
    await other.getByRole("contentinfo").screenshot({ path: `${process.env.SHOT}.png` });
  }

  // Mute follows too, in both directions.
  await other.getByRole("contentinfo").getByRole("button", { name: "Mute" }).click();
  await expect(page.getByRole("contentinfo").getByRole("button", { name: "Unmute" })).toBeVisible();
  await page.getByRole("contentinfo").getByRole("button", { name: "Unmute" }).click();
  await expect(other.getByRole("contentinfo").getByRole("button", { name: "Mute" })).toBeVisible();
});
