/** Runs at once, then at most once per window with the latest arguments, so a burst can never exceed one run per `ms`. */
export function throttle<A extends unknown[]>(run: (...args: A) => void, ms: number): (...args: A) => void {
  let ranAt = Number.NEGATIVE_INFINITY;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: A | null = null;
  const fire = (args: A) => {
    ranAt = Date.now();
    run(...args);
  };
  return (...args) => {
    const wait = ranAt + ms - Date.now();
    if (!timer && wait <= 0) return fire(args);
    pending = args;
    if (timer) return;
    timer = setTimeout(() => {
      timer = undefined;
      const latest = pending;
      pending = null;
      if (latest) fire(latest);
    }, wait);
  };
}
