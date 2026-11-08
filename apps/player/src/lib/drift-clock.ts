const FRAME_MS = 500;
const frames = new Set<() => void>();
let clock: ReturnType<typeof setInterval> | undefined;

/** Calls `frame` every half second until the returned stop; every caller shares one timer, and it stops with the last of them. */
export function onDriftFrame(frame: () => void): () => void {
  frames.add(frame);
  clock ??= setInterval(() => {
    for (const next of frames) next();
  }, FRAME_MS);
  return () => {
    frames.delete(frame);
    if (frames.size > 0) return;
    clearInterval(clock);
    clock = undefined;
  };
}
