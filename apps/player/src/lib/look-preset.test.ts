import { expect, test } from "bun:test";
import { decodeLook, encodeLook, lookCss } from "./look-code";
import { contrast, decodeShadcnPreset, presetCodeFrom, resolvePreset } from "./look-preset";

test("decodes the documented shadcn preset codes", () => {
  expect(decodeShadcnPreset("b6tOz2I0x")).toMatchObject({ baseColor: "olive", theme: "olive", radius: "default", font: "geist" });
  expect(decodeShadcnPreset("b7kBsBkh7b")).toMatchObject({ baseColor: "zinc", theme: "green", radius: "medium", font: "geist-mono" });
});

test("a pasted flag or link is reduced to the code", () => {
  expect(presetCodeFrom("  --preset b7kBsBkh7b ")).toBe("b7kBsBkh7b");
  expect(presetCodeFrom("bunx shadcn init --preset=b7kBsBkh7b")).toBe("b7kBsBkh7b");
  expect(presetCodeFrom("https://ui.shadcn.com/create?base=radix&preset=b7kBsBkh7b")).toBe("b7kBsBkh7b");
});

test("a preset becomes a green mono look, and survives the setting round trip", () => {
  const result = resolvePreset("--preset b7kBsBkh7b");
  if (!result.ok) throw new Error(result.error);
  expect(result.look.font).toBe("mono");
  const css = lookCss(result.look);
  expect(css).toContain("--primary:oklch(0.527 0.154 150.069)");
  expect(css).toContain("--look-radius:10px");
  expect(css).toContain(".dark{");
  expect(css).toContain("JetBrains Mono");
  expect(encodeLook(result.look)).toBe("shadcn1.b7kBsBkh7b");
  expect(decodeLook("shadcn1.b7kBsBkh7b")?.preset?.code).toBe("b7kBsBkh7b");
});

test("invalid codes are rejected and apply nothing", () => {
  for (const code of ["", "x", "lode1.warm.ink.0.plex", "c6tOz2I0x", "b6tOz2I0!", "b6tOz2I0x1234", "hello world"]) {
    expect(resolvePreset(code).ok).toBe(false);
  }
});

test("contrast follows WCAG", () => {
  expect(contrast("oklch(0 0 0)", "oklch(1 0 0)")).toBeCloseTo(21, 0);
  expect(contrast("oklch(0.6 0 0)", "oklch(0.62 0 0)")).toBeLessThan(1.1);
});
