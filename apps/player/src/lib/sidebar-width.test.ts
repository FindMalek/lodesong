import { describe, expect, test } from "bun:test";
import { clampSidebarWidth, SIDEBAR_DEFAULT, SIDEBAR_MAX, SIDEBAR_MIN, sidebarKeyWidth } from "./sidebar-width";

describe("sidebar width", () => {
  test("a stored width is kept inside the limits and junk falls back to the default", () => {
    expect(clampSidebarWidth(10)).toBe(SIDEBAR_MIN);
    expect(clampSidebarWidth(9000)).toBe(SIDEBAR_MAX);
    expect(clampSidebarWidth(250.4)).toBe(250);
    expect(clampSidebarWidth(Number.NaN)).toBe(SIDEBAR_DEFAULT);
  });
  test("arrows nudge the width, shift goes further, home and end jump to the limits", () => {
    expect(sidebarKeyWidth("ArrowRight", 200, false)).toBe(216);
    expect(sidebarKeyWidth("ArrowLeft", 200, true)).toBe(SIDEBAR_MIN);
    expect(sidebarKeyWidth("ArrowRight", SIDEBAR_MAX, false)).toBe(SIDEBAR_MAX);
    expect(sidebarKeyWidth("End", 200, false)).toBe(SIDEBAR_MAX);
    expect(sidebarKeyWidth("a", 200, false)).toBeNull();
  });
});
