const COVER_LIMIT = 10_000;
const TRIM_EVERY = 200;
let puts = 0;

/** Listing a full cache takes longer than fetching a cover, so it is never done before answering. */
async function store(cache: Cache, request: Request, response: Response, limit: number): Promise<void> {
  const due = puts++ % TRIM_EVERY === 0;
  await cache.put(request, response);
  if (!due) return;
  const keys = await cache.keys();
  if (keys.length <= limit) return;
  for (const key of keys.slice(0, keys.length - Math.floor(limit * 0.9))) await cache.delete(key);
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
  // A full disk only costs the cached copy.
  if (response.ok) keep(store(cache, request, response.clone(), limit).catch(() => undefined));
  return response;
}
