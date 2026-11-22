interface O2Target {
  url: string;
  org: string;
  stream: string;
  auth: string;
}

interface TelemetryOptions {
  on: boolean;
  dsn: string;
  o2: O2Target | null;
  release: string;
  fetcher?: typeof fetch;
}

type Level = "warn" | "error";
type Fields = Record<string, string | number | boolean | undefined>;

const FLUSH_MS = 5000;
const MAX_BUFFER = 200;
const MAX_TEXT = 2000;

/** Addresses lose their query and fragment (stream urls carry tokens), and long token-looking strings go. */
export function scrub(text: string): string {
  return text
    .replace(/(https?:\/\/[^\s?#"')]+)[?#][^\s"')]*/g, "$1")
    .replace(/\b(token|secret|password|auth|jwt|bearer)(["']?\s*[:=]\s*["']?)[^\s"',;&]+/gi, "$1$2[redacted]")
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, "[redacted]")
    .slice(0, MAX_TEXT);
}

function parseDsn(dsn: string): { key: string; endpoint: string } | null {
  try {
    const url = new URL(dsn);
    const project = url.pathname.split("/").filter(Boolean).pop();
    if (!url.username || !project) return null;
    return { key: url.username, endpoint: `${url.origin}/api/${project}/store/` };
  } catch {
    return null;
  }
}

export class Telemetry {
  private readonly target: ReturnType<typeof parseDsn>;
  private readonly fetcher: typeof fetch;
  private buffer: Record<string, unknown>[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly options: TelemetryOptions) {
    this.target = options.on ? parseDsn(options.dsn) : null;
    this.fetcher = options.fetcher ?? fetch;
  }

  get active(): boolean {
    return this.options.on && (this.target !== null || this.options.o2 !== null);
  }

  /** Fire and forget: reporting must never take the server down or slow a request. */
  error(error: unknown, where: string, fields: Fields = {}): void {
    if (!this.active) return;
    const failure = error instanceof Error ? error : new Error(String(error));
    this.log("error", `${where}: ${failure.message}`, { ...fields, stack: failure.stack });
    if (!this.target) return;
    const event = {
      event_id: crypto.randomUUID().replaceAll("-", ""),
      timestamp: Date.now() / 1000,
      platform: "javascript",
      level: "error",
      release: this.options.release,
      tags: { where },
      extra: Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, typeof value === "string" ? scrub(value) : value])),
      exception: { values: [{ type: failure.name, value: scrub(failure.message) }] },
      message: scrub(failure.stack ?? failure.message),
    };
    void this.fetcher(this.target.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-sentry-auth": `Sentry sentry_version=7, sentry_key=${this.target.key}, sentry_client=lodesong/${this.options.release}`,
      },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(5000),
    }).catch(() => undefined);
  }

  log(level: Level, message: string, fields: Fields = {}): void {
    if (!this.options.on || !this.options.o2) return;
    if (this.buffer.length >= MAX_BUFFER) this.buffer.shift();
    this.buffer.push({
      _timestamp: Date.now() * 1000,
      level,
      message: scrub(message),
      release: this.options.release,
      ...Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, typeof value === "string" ? scrub(value) : value])),
    });
    this.timer ??= setTimeout(() => void this.flush(), FLUSH_MS);
  }

  async flush(): Promise<void> {
    this.timer = null;
    const o2 = this.options.o2;
    if (!o2 || this.buffer.length === 0) return;
    const batch = this.buffer;
    this.buffer = [];
    await this.fetcher(`${o2.url}/api/${encodeURIComponent(o2.org)}/${encodeURIComponent(o2.stream)}/_json`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: o2.auth },
      body: JSON.stringify(batch),
      signal: AbortSignal.timeout(5000),
    }).catch(() => undefined);
  }

  /** Server warnings and errors, uncaught exceptions included. The original console output stays. */
  install(): void {
    if (!this.active) return;
    for (const level of ["warn", "error"] as const) {
      const original = console[level].bind(console);
      console[level] = (...args: unknown[]) => {
        original(...args);
        this.log(level, args.map((arg) => (arg instanceof Error ? (arg.stack ?? arg.message) : String(arg))).join(" "), {
          source: "server",
        });
      };
    }
    process.on("uncaughtException", (error) => this.error(error, "uncaughtException"));
    process.on("unhandledRejection", (reason) => this.error(reason, "unhandledRejection"));
  }
}

const MAX_BODY_BYTES = 8 * 1024;
const MAX_PER_MINUTE = 20;

/** The player's own errors, forwarded from here so the DSN and the O2 credentials never reach a browser. */
export function createClientReporter(telemetry: Telemetry, now: () => number = Date.now) {
  let windowStart = 0;
  let count = 0;
  return async (request: Request): Promise<Response> => {
    if (request.headers.get("x-lodesong") !== "1") return new Response(null, { status: 403 });
    if (!telemetry.active) return new Response(null, { status: 204 });
    if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return new Response(null, { status: 413 });
    const stamp = now();
    if (stamp - windowStart >= 60_000) {
      windowStart = stamp;
      count = 0;
    }
    if (count++ >= MAX_PER_MINUTE) return new Response(null, { status: 204 });
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const text = (value: unknown) => (typeof value === "string" ? value.slice(0, 1000) : "");
    const message = text(body?.message);
    if (!message) return new Response(null, { status: 400 });
    const error = new Error(message);
    error.stack = text(body?.stack) || undefined;
    telemetry.error(error, "player", { page: text(body?.page).replace(/[?#].*$/s, ""), source: "player" });
    return new Response(null, { status: 204 });
  };
}
