const QUIET_MS = 2000;
const ACTIVITY = ["pointerdown", "keydown", "wheel"] as const;
const SLOW = new Set(["slow-2g", "2g"]);

type Connection = { saveData?: boolean; effectiveType?: string };

/** Data saver and 2g links keep to the page they open: the rest of the app loads when it's asked for. */
export function mayWarm(connection: Connection | undefined = (navigator as { connection?: Connection }).connection): boolean {
  return !connection?.saveData && !SLOW.has(connection?.effectiveType ?? "");
}

function idle(run: () => void): void {
  if (typeof requestIdleCallback === "function") requestIdleCallback(run, { timeout: 2000 });
  else setTimeout(run, 1000);
}

/** Runs each step once the page has been quiet a while (loaded, no input, no file arriving); a step's own downloads delay the next. */
export function whenQuiet(steps: (() => void)[], quietMs = QUIET_MS, target: EventTarget = window): () => void {
  if (!mayWarm()) return () => {};
  const queue = [...steps];
  const waitForLoad = typeof document !== "undefined" && document.readyState !== "complete";
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let loaded = !waitForLoad;
  let round = 0;
  const arm = () => {
    clearTimeout(timer);
    round += 1;
    if (stopped || !loaded) return;
    const mine = round;
    timer = setTimeout(() => idle(() => mine === round && next()), quietMs);
  };
  function next() {
    const step = queue.shift();
    if (step && mayWarm()) step();
    if (queue.length > 0) arm();
  }
  const files = typeof PerformanceObserver === "function" ? new PerformanceObserver(arm) : undefined;
  try {
    files?.observe({ type: "resource" });
  } catch {}
  const onLoad = () => {
    loaded = true;
    arm();
  };
  if (waitForLoad) window.addEventListener("load", onLoad, { once: true });
  for (const input of ACTIVITY) target.addEventListener(input, arm, { passive: true });
  arm();
  return () => {
    stopped = true;
    round += 1;
    clearTimeout(timer);
    files?.disconnect();
    if (waitForLoad) window.removeEventListener("load", onLoad);
    for (const input of ACTIVITY) target.removeEventListener(input, arm);
  };
}
