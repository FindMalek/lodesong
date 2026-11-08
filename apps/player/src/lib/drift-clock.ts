const FRAME_MS = 500;
const frames = new Set<() => void>();
let clock: ReturnType<typeof setInterval> | undefined;

/** Calls `frame` every half second until the returned stop. Callers share one timer, which stops with the last of them; a frame that throws doesn't skip the rest. */
export function onDriftFrame(frame: () => void): () => void {
  frames.add(frame);
  clock ??= setInterval(() => {
    for (const next of frames) {
      try {
        next();
      } catch (error) {
        reportError(error);
      }
    }
  }, FRAME_MS);
  return () => {
    frames.delete(frame);
    if (frames.size > 0) return;
    clearInterval(clock);
    clock = undefined;
  };
}
