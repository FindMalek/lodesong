const QUIET_MS = 5000;
const INPUTS = ["pointerdown", "keydown"] as const;

/** Runs `run` once, on idle: when the first tap or key lands, or a few seconds in. Warm-ups wait so they never compete with the first screen. */
export function whenQuiet(run: () => void, delayMs = QUIET_MS, target: EventTarget = window): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stop = () => {
    clearTimeout(timer);
    for (const input of INPUTS) target.removeEventListener(input, go);
  };
  function go() {
    stop();
    if (typeof requestIdleCallback === "function") requestIdleCallback(run, { timeout: 2000 });
    else setTimeout(run, 0);
  }
  timer = setTimeout(go, delayMs);
  for (const input of INPUTS) target.addEventListener(input, go, { once: true, passive: true });
  return stop;
}
