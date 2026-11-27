const COVER_LIMIT = 10_000;
const TRIM_EVERY = 200;
let puts = 0;

/** Listing a full cache takes longer than fetching a cover, so it is never done before answering. */
async function store(cache: Cache, request: Request, response: Response, limit: number): Promise<void> {
  const due = puts++ % TRIM_EVERY === 0;
  // A full quota is the one time trimming can't wait.
  const stored = await cache.put(request, response).then(
    () => true,
    (error: unknown) => {
      // A dropped download must not cost the covers already kept.
      if (!(error instanceof Error && error.name === "QuotaExceededError")) throw error;
      return false;
    },
  );
  if (stored && !due) return;
  const keys = await cache.keys();
  if (stored && keys.length <= limit) return;
  const target = Math.floor(Math.min(keys.length, limit) * 0.9);
  for (const key of keys.slice(0, keys.length - target)) await cache.delete(key);
}

export async function coverResponse(
  cache: Cache,
  request: Request,
  keep: (work: Promise<unknown>) => void,
  limit = COVER_LIMIT,
): Promise<Response> {
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) keep(store(cache, request, response.clone(), limit).catch(() => undefined));
  return response;
}
