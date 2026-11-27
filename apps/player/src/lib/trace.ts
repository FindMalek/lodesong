const API = /^\/(api|auth|rest)(\/|$)/;
/** How long a failed call stays the one an error is blamed on. */
const BLAME_MS = 30_000;

const randomHex = (bytes: number) =>
  Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (byte) => byte.toString(16).padStart(2, "0")).join("");

/** Adds a W3C `traceparent` to calls to this server, and remembers the one an error report should carry. */
export function createTracedFetch(send: typeof fetch, origin: string, now: () => number = Date.now) {
  let last: string | undefined;
  let failed: { value: string; at: number } | undefined;
  const traced = async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input, origin);
    if (url.origin !== origin || !API.test(url.pathname) || url.pathname === "/api/diagnostics") return send(input, init);
    const value = `00-${randomHex(16)}-${randomHex(8)}-01`;
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    headers.set("traceparent", value);
    last = value;
    try {
      const response = await send(input, { ...init, headers });
      if (response.status >= 500) failed = { value, at: now() };
      return response;
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError")) failed = { value, at: now() };
      throw error;
    }
  };
  return {
    fetch: Object.assign(traced, { preconnect: send.preconnect }) as typeof fetch,
    traceparent: () => (failed && now() - failed.at < BLAME_MS ? failed.value : last),
  };
}
