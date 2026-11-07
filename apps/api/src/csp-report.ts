const MAX_BODY_BYTES = 8 * 1024;
const MAX_PER_MINUTE = 30;

interface Violation {
  directive: string;
  blocked: string;
  page: string;
}

const text = (value: unknown): string => (typeof value === "string" ? value.slice(0, 200) : "");
/** The address without its query or fragment: a page address can carry a share token. */
const address = (value: unknown): string => text(value).replace(/[?#].*$/s, "");

/** Both report formats: the legacy `{ "csp-report": {...} }` and the Reporting API's `[{ type, body }]`. */
function violationsOf(payload: unknown): Violation[] {
  const entries = Array.isArray(payload) ? payload : [payload];
  return entries.flatMap((entry): Violation[] => {
    const record = (entry ?? {}) as Record<string, Record<string, unknown> | undefined>;
    const body = record["csp-report"] ?? record.body;
    if (!body) return [];
    return [
      {
        directive: text(body["violated-directive"] ?? body.effectiveDirective),
        blocked: address(body["blocked-uri"] ?? body.blockedURL),
        page: address(body["document-uri"] ?? body.documentURL),
      },
    ];
  });
}

export function createCspReporter(log: (line: string) => void = console.warn, now: () => number = Date.now) {
  let windowStart = 0;
  let count = 0;
  return async (request: Request): Promise<Response> => {
    const length = Number(request.headers.get("content-length") ?? 0);
    if (length > MAX_BODY_BYTES) return new Response(null, { status: 413 });
    const stamp = now();
    if (stamp - windowStart >= 60_000) {
      windowStart = stamp;
      count = 0;
    }
    if (count >= MAX_PER_MINUTE) return new Response(null, { status: 204 });
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return new Response(null, { status: 413 });
    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      return new Response(null, { status: 400 });
    }
    for (const violation of violationsOf(payload).slice(0, MAX_PER_MINUTE - count)) {
      count += 1;
      log(`csp violation: ${violation.directive} blocked ${violation.blocked || "inline"} on ${violation.page}`);
    }
    return new Response(null, { status: 204 });
  };
}
