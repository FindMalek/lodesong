import { AsyncLocalStorage } from "node:async_hooks";
import { mapHandlers } from "./compress";

export interface TraceContext {
  traceId: string;
  spanId: string;
}

type Attributes = Record<string, string | number | undefined>;
interface Outcome {
  attributes: Attributes;
  failed: boolean;
}

// OTLP enum values (opentelemetry-proto trace.proto); the JSON encoding takes the numbers.
const INTERNAL = 1;
const SERVER = 2;
const CLIENT = 3;
const STATUS_ERROR = 2;

const FLUSH_MS = 5000;
const MAX_SPANS = 1000;

const context = new AsyncLocalStorage<TraceContext>();
let tracer: Tracer | null = null;

export const currentTrace = () => context.getStore();

export function parseTraceparent(header: string | null): TraceContext | undefined {
  const match = /^(?!ff)[0-9a-f]{2}-(?!0{32})([0-9a-f]{32})-(?!0{16})([0-9a-f]{16})-[0-9a-f]{2}/.exec(header ?? "");
  return match?.[1] && match[2] ? { traceId: match[1], spanId: match[2] } : undefined;
}

const randomHex = (bytes: number) => Buffer.from(crypto.getRandomValues(new Uint8Array(bytes))).toString("hex");
const unixNanos = () => (BigInt(Math.round((performance.timeOrigin + performance.now()) * 1000)) * 1000n).toString();

const encode = (attributes: Attributes) =>
  Object.entries(attributes).flatMap(([key, value]) =>
    value === undefined ? [] : [{ key, value: typeof value === "number" ? { intValue: String(value) } : { stringValue: value } }],
  );

interface TracerOptions {
  url: string;
  org: string;
  auth: string;
  release: string;
  fetcher?: typeof fetch;
}

/** Spans as OTLP/HTTP JSON. Attributes only ever hold fixed names: no addresses, queries or library content. */
export class Tracer {
  private readonly fetcher: typeof fetch;
  private buffer: Record<string, unknown>[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly options: TracerOptions) {
    this.fetcher = options.fetcher ?? fetch;
  }

  async run<T>(
    name: string,
    kind: number,
    parent: TraceContext | undefined,
    attributes: Attributes,
    work: (own: TraceContext) => T | Promise<T>,
    outcome?: (value: T) => Outcome,
  ): Promise<T> {
    const own = { traceId: parent?.traceId ?? randomHex(16), spanId: randomHex(8) };
    const startTimeUnixNano = unixNanos();
    const end = (result: Outcome) =>
      this.record({
        ...own,
        ...(parent ? { parentSpanId: parent.spanId } : {}),
        name,
        kind,
        startTimeUnixNano,
        endTimeUnixNano: unixNanos(),
        attributes: encode({ ...attributes, ...result.attributes }),
        ...(result.failed ? { status: { code: STATUS_ERROR } } : {}),
      });
    try {
      const value = await context.run(own, () => work(own));
      end(outcome?.(value) ?? { attributes: {}, failed: false });
      return value;
    } catch (error) {
      const type = error instanceof Error ? error.name : "Error";
      end({ attributes: { "error.type": type }, failed: type !== "AbortError" });
      throw error;
    }
  }

  private rejected = false;

  private record(span: Record<string, unknown>): void {
    if (this.buffer.length >= MAX_SPANS) this.buffer.shift();
    this.buffer.push(span);
    if (this.timer) return;
    this.timer = setTimeout(() => void this.flush(), FLUSH_MS);
    this.timer.unref?.();
  }

  async flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.buffer.length === 0) return;
    const spans = this.buffer;
    this.buffer = [];
    const { url, org, auth, release } = this.options;
    const resource = { attributes: encode({ "service.name": "lodesong", "service.version": release }) };
    const sent = await this.fetcher(`${url}/api/${encodeURIComponent(org)}/v1/traces`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: auth },
      body: JSON.stringify({ resourceSpans: [{ resource, scopeSpans: [{ scope: { name: "lodesong", version: release }, spans }] }] }),
      signal: AbortSignal.timeout(5000),
    }).catch(() => undefined);
    if (sent && !sent.ok && !this.rejected) {
      this.rejected = true;
      console.warn(`traces were rejected: ${sent.status}`);
    }
  }
}

const OWN = new Set(["navidrome", "lyterion", "audiomuse"]);

/** Outgoing calls get a span, and a `traceparent` when they stay with us. `services` names each configured address; the address itself isn't recorded. */
function tracedFetch(active: Tracer, send: typeof fetch, services: [name: string, base: string][]): typeof fetch {
  const known = [...services, ["coverartarchive", "https://coverartarchive.org"], ["github", "https://api.github.com"]]
    .map(([name = "", base = ""]) => ({ name, base }))
    .sort((a, b) => b.base.length - a.base.length);
  const traced = (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    const service = known.find(({ base }) => url === base || url.startsWith(`${base}/`) || url.startsWith(`${base}?`))?.name ?? "external";
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const endpoint = service === "navidrome" ? /\/rest\/([A-Za-z0-9]{1,40})(?:\.view)?(?:\?|$)/.exec(url)?.[1] : undefined;
    return active.run(
      [method, service, endpoint].filter(Boolean).join(" "),
      CLIENT,
      currentTrace(),
      { "http.request.method": method, "peer.service": service, "subsonic.endpoint": endpoint },
      (own) => {
        if (!OWN.has(service)) return send(input, init);
        const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
        headers.set("traceparent", `00-${own.traceId}-${own.spanId}-01`);
        return send(input, { ...init, headers });
      },
      (response) => ({
        attributes: { "http.response.status_code": response.status },
        // LRCLIB answers 404 for a song it has no lyrics for.
        failed: response.status >= 400 && !(service === "lrclib" && response.status === 404),
      }),
    );
  };
  return Object.assign(traced, { preconnect: send.preconnect });
}

export function startTracing(active: Tracer, services: [name: string, base: string][]): () => void {
  const send = globalThis.fetch;
  tracer = active;
  globalThis.fetch = tracedFetch(active, send, services);
  return () => {
    tracer = null;
    globalThis.fetch = send;
  };
}

export function tracedRoutes<T extends Record<string, unknown>>(routes: T): T {
  const active = tracer;
  if (!active) return routes;
  return mapHandlers(routes, (path, handler) =>
    path === "/healthz"
      ? handler
      : (request, server) =>
          active.run(
            `${request.method} ${path}`,
            SERVER,
            parseTraceparent(request.headers.get("traceparent")),
            { "http.request.method": request.method, "http.route": path },
            () => handler(request, server),
            (response) => ({
              attributes: { "http.response.status_code": response?.status },
              failed: (response?.status ?? 0) >= 500 && !request.signal.aborted,
            }),
          ),
  );
}

/** Background work starts its own trace, even when a request is what scheduled it. */
export function job<T>(name: string, work: () => Promise<T>): Promise<T> {
  return tracer ? tracer.run(`job ${name}`, INTERNAL, undefined, {}, work) : work();
}
