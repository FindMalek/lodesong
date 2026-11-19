import { expect, test } from "./fixtures";

test("a preset previews at once, saves, and survives a reload", async ({ page, signedIn }) => {
  // The fixture stubs the synced settings; this flow needs the real ones, and puts the default look back at the end.
  await page.unroute("**/api/settings");
  await page.goto("/settings/appearance");
  const radius = () => page.evaluate(() => getComputedStyle(document.body).getPropertyValue("--look-radius"));
  const presets = page.getByRole("group", { name: "presets" });
  const putSettings = () =>
    page.waitForResponse((response) => response.url().endsWith("/api/settings") && response.request().method() === "PUT");

  await presets.getByRole("button", { name: "soft" }).click();
  await expect.poll(radius).toBe("8px");
  await expect(page.getByText("previewing, not saved yet")).toBeVisible();

  const saved = putSettings();
  await page.getByRole("button", { name: "save look" }).click();
  expect((await saved).ok()).toBe(true);
  await page.reload();
  await expect.poll(radius).toBe("8px");
  await expect(presets.getByRole("button", { name: "soft" })).toHaveAttribute("aria-pressed", "true");

  await page.getByLabel("theme code to import").fill("lode1.cool.steel.0.mono");
  await page.getByRole("button", { name: "preview" }).click();
  await expect.poll(radius).toBe("0px");
  await page.getByRole("button", { name: "revert" }).click();
  await expect.poll(radius).toBe("8px");

  await presets.getByRole("button", { name: "lodesong" }).click();
  const reset = putSettings();
  await page.getByRole("button", { name: "save look" }).click();
  await reset;
});

test("a shadcn preset code loads as a look, a bad one changes nothing, and reset brings the brand back", async ({ page, signedIn }) => {
  await page.unroute("**/api/settings");
  await page.goto("/settings/appearance");
  const token = (name: string) => page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);
  const field = page.getByLabel("theme code to import");
  const before = await token("--primary");

  await field.fill("b7k!");
  await page.getByRole("button", { name: "preview" }).click();
  await expect(page.getByRole("alert")).toContainText("not a shadcn preset code");
  expect(await token("--primary")).toBe(before);

  await field.fill("--preset b7kBsBkh7b");
  await page.getByRole("button", { name: "preview" }).click();
  await expect.poll(() => token("--primary")).toBe("oklch(0.527 0.154 150.069)");
  await expect.poll(() => token("--look-radius")).toBe("10px");
  await expect(page.getByText("style, icons, menu and chart colors are not used")).toBeVisible();

  await page.getByRole("button", { name: "reset to lodesong" }).click();
  await expect.poll(() => token("--primary")).toBe(before);
  await expect.poll(() => token("--look-radius")).toBe("");
});
