import type { Page } from "@playwright/test";
import { keepNative, nativeBridge, outputLevel, outputStates, sinkCalls, tapOutput } from "./audio";
import { expect, test } from "./fixtures";

// The macOS island, menu bar and media keys start playback through `window.keepNative` with no tap behind it.
test.use({ hasTouch: true });

const AUDIBLE = 0.04;
const SLOW = 15_000;
const bar = (page: Page) => page.getByRole("contentinfo");

/** A queue with a song, paused, in a document that has had no tap yet. */
async function pausedAfterReload(page: Page): Promise<void> {
  await page.goto("/album/al-3");
  await page.getByRole("button", { name: "play", exact: true }).first().click();
  await expect.poll(() => outputLevel(page), { timeout: SLOW }).toBeGreaterThan(AUDIBLE);
  await bar(page).getByRole("button", { name: "pause" }).click();
  await page.reload();
  await expect(bar(page).getByRole("button", { name: "play" })).toBeVisible();
  expect(await outputStates(page)).toEqual([]);
}

const TAPS: [string, (page: Page) => Promise<void>][] = [
  ["a click", (page) => page.mouse.click(0, 0)],
  ["a key press", (page) => page.keyboard.press("Shift")],
  [
    "a touch",
    async (page) => {
      // Without this the tap also fires a click, which would unlock on its own.
      await page.evaluate(() => document.addEventListener("touchend", (event) => event.preventDefault(), { passive: false }));
      await page.touchscreen.tap(0, 0);
    },
  ],
];

for (const [name, tap] of TAPS) {
  test(`playback started without a tap stays silent, then plays on ${name}`, async ({ page, signedIn }) => {
    await tapOutput(page, { gate: true });
    await nativeBridge(page);
    await pausedAfterReload(signedIn);
    await keepNative(page, "play");
    await expect.poll(() => outputStates(page), { timeout: SLOW }).toEqual(["suspended"]);
    expect(await outputLevel(page)).toBeLessThan(AUDIBLE);
    await tap(page);
    await expect.poll(() => outputStates(page), { timeout: SLOW }).toEqual(["running"]);
    await expect.poll(() => outputLevel(page), { timeout: SLOW }).toBeGreaterThan(AUDIBLE);
  });
}

test("playback started without a tap is audible once the first tap lands, whatever the engine allows", async ({ page, signedIn }) => {
  await tapOutput(page);
  await nativeBridge(page);
  await pausedAfterReload(signedIn);
  await keepNative(page, "play");
  await expect.poll(async () => (await outputStates(page)).length, { timeout: SLOW }).toBeGreaterThan(0);
  await page.keyboard.press("Shift");
  await expect.poll(() => outputStates(page), { timeout: SLOW }).toEqual(["running"]);
  await expect.poll(() => outputLevel(page), { timeout: SLOW }).toBeGreaterThan(AUDIBLE);
});

test.describe("output device", () => {
  test.skip(({ browserName }) => browserName === "webkit", "WebKit has no AudioContext.setSinkId");

  test("the real setSinkId gets the default device and leaves the context running", async ({ page, signedIn }) => {
    await tapOutput(page, { sink: "spy" });
    await signedIn.goto("/album/al-3");
    await page.getByRole("button", { name: "play", exact: true }).first().click();
    await expect.poll(() => outputStates(page), { timeout: SLOW }).toEqual(["running"]);
    await expect.poll(() => outputLevel(page), { timeout: SLOW }).toBeGreaterThan(AUDIBLE);
    const calls = await sinkCalls(page);
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((id) => id === "")).toBe(true);
  });

  test("an output device that is gone falls back to the default and keeps playing", async ({ page, signedIn }) => {
    await tapOutput(page, { sink: "spy" });
    await page.addInitScript(() => {
      const gone = { kind: "audiooutput", deviceId: "nonexistent", label: "gone speakers", groupId: "g" };
      MediaDevices.prototype.enumerateDevices = async () => [gone as MediaDeviceInfo];
    });
    await signedIn.goto("/album/al-3");
    await page.getByRole("button", { name: "play", exact: true }).first().click();
    await expect.poll(() => outputLevel(page), { timeout: SLOW }).toBeGreaterThan(AUDIBLE);
    await bar(page).getByRole("button", { name: "more controls" }).click();
    await page.getByRole("menuitem", { name: "output device" }).click();
    await page.getByRole("menuitemradio", { name: "gone speakers" }).click();
    await expect.poll(() => sinkCalls(page), { timeout: SLOW }).toContain("nonexistent");
    await expect(page.getByRole("menuitemradio", { name: "gone speakers" })).not.toBeChecked();
    await expect.poll(() => outputStates(page)).toEqual(["running"]);
    await expect.poll(() => outputLevel(page), { timeout: SLOW }).toBeGreaterThan(AUDIBLE);
  });
});
