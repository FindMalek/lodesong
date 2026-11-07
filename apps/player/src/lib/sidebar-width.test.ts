import { describe, expect, test } from "bun:test";
import {
  clampSidebarWidth,
  SIDEBAR_DEFAULT,
  SIDEBAR_MAX,
  SIDEBAR_MIN,
  shouldCollapseSidebar,
  sidebarKeyWidth,
  visibleSidebarWidth,
} from "./sidebar-width";

describe("sidebar width", () => {
  test("a stored width is kept inside the limits and junk falls back to the default", () => {
    expect(clampSidebarWidth(10)).toBe(SIDEBAR_MIN);
    expect(clampSidebarWidth(9000)).toBe(SIDEBAR_MAX);
    expect(clampSidebarWidth(250.4)).toBe(250);
    expect(clampSidebarWidth(Number.NaN)).toBe(SIDEBAR_DEFAULT);
  });
  test("arrows nudge the width, shift goes further, home and end jump to the limits", () => {
    expect(sidebarKeyWidth("ArrowRight", 200, false)).toBe(216);
    expect(sidebarKeyWidth("ArrowLeft", 200, false)).toBe(184);
    expect(sidebarKeyWidth("ArrowRight", 200, true)).toBe(264);
    expect(sidebarKeyWidth("ArrowLeft", 300, true)).toBe(236);
    expect(sidebarKeyWidth("ArrowRight", SIDEBAR_MAX, false)).toBe(SIDEBAR_MAX);
    expect(sidebarKeyWidth("End", 200, false)).toBe(SIDEBAR_MAX);
    expect(sidebarKeyWidth("a", 200, false)).toBeNull();
  });
  test("a drag released under 120 collapses and 120 itself does not", () => {
    expect(shouldCollapseSidebar(119.9)).toBe(true);
    expect(shouldCollapseSidebar(120)).toBe(false);
  });
  test("a small window shows less than the stored width, zoom included", () => {
    expect(visibleSidebarWidth(400, 768, 1)).toBe(298);
    expect(visibleSidebarWidth(400, 1440, 1)).toBe(400);
    expect(visibleSidebarWidth(400, 800, 1.1)).toBe(257);
  });
});
