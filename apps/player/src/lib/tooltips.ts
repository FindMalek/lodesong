import { useSyncExternalStore } from "react";

// Tooltips (~20 KB gzip) load when idle or on the first hover or focus; until then triggers render as plain markup.

type TooltipModule = typeof import("@lodesong/ui/components/tooltip");

let loaded: TooltipModule | null = null;
let arrived: TooltipModule | null = null;
let requested = false;
let pressed = false;
let released: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

function publish(): void {
  if (!arrived || pressed) return;
  loaded = arrived;
  arrived = null;
  for (const listener of listeners) listener();
}

// The code arriving swaps every trigger for a new element, and WebKit drops the click of a button swapped out mid-press.
if (typeof window !== "undefined") {
  const release = (delay: number) => {
    clearTimeout(released);
    released = setTimeout(() => {
      pressed = false;
      publish();
    }, delay);
  };
  window.addEventListener(
    "pointerdown",
    () => {
      clearTimeout(released);
      pressed = true;
    },
    true,
  );
  window.addEventListener("click", () => release(0), true);
  window.addEventListener("pointerup", () => release(400), true);
  window.addEventListener("pointercancel", () => release(0), true);
}

export function loadTooltips(): void {
  if (requested) return;
  requested = true;
  void import("@lodesong/ui/components/tooltip").then((module) => {
    arrived = module;
    publish();
  });
}

export function useTooltips(): TooltipModule | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => loaded,
  );
}

// For 400 ms after a tooltip closes, triggers open with no delay (Base UI's provider does this, but pulls floating-ui in).
const OPEN_DELAY_MS = 400;
let warm = false;
let cool: ReturnType<typeof setTimeout> | undefined;
const warmListeners = new Set<() => void>();

function setWarm(next: boolean): void {
  if (warm === next) return;
  warm = next;
  for (const listener of warmListeners) listener();
}

export function tooltipClosed(): void {
  setWarm(true);
  clearTimeout(cool);
  cool = setTimeout(() => setWarm(false), OPEN_DELAY_MS);
}

export function useOpenDelay(): number {
  return useSyncExternalStore(
    (listener) => {
      warmListeners.add(listener);
      return () => warmListeners.delete(listener);
    },
    () => (warm ? 0 : OPEN_DELAY_MS),
  );
}
