const LIMIT_MS = 2500;
const AFTER_POINTER_UP_MS = 400;
const KEYS = new Set([" ", "Enter"]);

let held = false;
let released: ReturnType<typeof setTimeout> | undefined;
let limit: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

export function pressHeld(): boolean {
  return held;
}

export function whenPressEnds(listener: () => void): void {
  listeners.add(listener);
}

function letGo(): void {
  clearTimeout(released);
  clearTimeout(limit);
  if (!held) return;
  held = false;
  for (const listener of listeners) listener();
}

function hold(): void {
  clearTimeout(released);
  clearTimeout(limit);
  held = true;
  limit = setTimeout(letGo, LIMIT_MS);
}

function release(delay: number): void {
  clearTimeout(released);
  released = setTimeout(letGo, delay);
}

// A button swapped out mid-press loses its click in WebKit. Buttons act on pointerup or click, Space and Enter on keyup.
if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", hold, true);
  window.addEventListener(
    "keydown",
    (event) => {
      if (KEYS.has(event.key)) hold();
    },
    true,
  );
  window.addEventListener("click", () => release(0), true);
  window.addEventListener("pointerup", () => release(AFTER_POINTER_UP_MS), true);
  window.addEventListener("keyup", () => release(AFTER_POINTER_UP_MS), true);
  for (const name of ["pointercancel", "contextmenu", "dragend", "blur"]) window.addEventListener(name, () => release(0), name !== "blur");
  document.addEventListener("visibilitychange", () => document.hidden && release(0));
}
