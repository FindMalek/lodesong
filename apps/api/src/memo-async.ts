/** Runs `load` once and shares the result, but a failure is forgotten so the next call tries again. */
export function memoAsync<T>(load: () => Promise<T>): () => Promise<T> {
  let cached: Promise<T> | undefined;
  return () => {
    cached ??= load().catch((error: unknown) => {
      cached = undefined;
      throw error;
    });
    return cached;
  };
}
