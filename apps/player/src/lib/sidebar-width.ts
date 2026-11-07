export const SIDEBAR_DEFAULT = 200;
export const SIDEBAR_MIN = 160;
export const SIDEBAR_MAX = 400;
const SIDEBAR_COLLAPSE_BELOW = 120;
const SIDEBAR_ROOM = 470;
const SIDEBAR_STEP = 16;

export function clampSidebarWidth(width: number): number {
  if (!Number.isFinite(width)) return SIDEBAR_DEFAULT;
  return Math.round(Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, width)));
}

export const shouldCollapseSidebar = (raw: number): boolean => raw < SIDEBAR_COLLAPSE_BELOW;

/** What the page paints: a wide sidebar never squeezes the page below SIDEBAR_ROOM, whatever was stored. */
export const sidebarCss = (width: number): string => `min(${width}px, calc(100vw / var(--zoom) - ${SIDEBAR_ROOM}px))`;

export const visibleSidebarWidth = (width: number, viewport: number, zoom: number): number =>
  clampSidebarWidth(Math.min(width, viewport / zoom - SIDEBAR_ROOM));

export function sidebarKeyWidth(key: string, width: number, big: boolean): number | null {
  const step = big ? SIDEBAR_STEP * 4 : SIDEBAR_STEP;
  if (key === "ArrowRight") return clampSidebarWidth(width + step);
  if (key === "ArrowLeft") return clampSidebarWidth(width - step);
  if (key === "Home") return SIDEBAR_MIN;
  if (key === "End") return SIDEBAR_MAX;
  return null;
}
