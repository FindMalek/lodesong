const KEPT_PARAMS = new Set(["id", "format", "maxBitRate", "estimateContentLength", "size", "timeOffset"]);
const URLS = /(?:https?|blob|data):[^\s"'<>)]+/g;
const SECRETS = /\b(token|t|s|u|p|apikey|api_key|password|auth|authorization|cookie|session|sid|key)\s*[=:]\s*[^&\s,;"']+/gi;
const BEARER = /\bBearer\s+\S+/gi;

export function redactUrl(value: string): string {
  if (/^(blob|data):/.test(value)) return value.slice(0, value.indexOf(":") + 1);
  let url: URL;
  try {
    url = new URL(value, "http://relative.invalid");
  } catch {
    return "<unparseable url>";
  }
  const params = [...url.searchParams].map(([name, text]) => `${name}=${KEPT_PARAMS.has(name) ? text : "<redacted>"}`).join("&");
  const origin = /^https?:/.test(value) ? "<origin>" : "";
  return `${origin}${url.pathname}${params ? `?${params}` : ""}`;
}

export function redactText(text: string): string {
  return text
    .replace(URLS, redactUrl)
    .replace(BEARER, "Bearer <redacted>")
    .replace(SECRETS, (_match, name: string) => `${name}=<redacted>`);
}

export interface StreamProbe {
  status?: number;
  contentType?: string | null;
  contentLength?: string | null;
  acceptRanges?: string | null;
  contentRange?: string | null;
  contentEncoding?: string | null;
  error?: string;
  skipped?: string;
}

export function summarizeResponse(response: Pick<Response, "status" | "headers">): StreamProbe {
  const header = (name: string) => response.headers.get(name);
  return {
    status: response.status,
    contentType: header("content-type"),
    contentLength: header("content-length"),
    acceptRanges: header("accept-ranges"),
    contentRange: header("content-range"),
    contentEncoding: header("content-encoding"),
  };
}

export function findings(report: {
  decks: { active: boolean; paused: boolean; duration: number | string; error: unknown; sizedFrom?: string | null }[];
  context: { state: string } | null;
  master: number | null;
  graphPeak: number | null;
  probe: StreamProbe;
}): string[] {
  const out: string[] = [];
  const active = report.decks.find((deck) => deck.active);
  const playing = !!active && !active.paused;
  if (!report.context) out.push("no audio graph was built");
  else if (report.context.state !== "running") out.push(`the audio context is ${report.context.state}`);
  if (report.master === 0) out.push("the master gain is 0");
  if (playing && active.duration === "Infinity") out.push("the stream has no length: WebKit plays it, but Web Audio gets silence");
  if (active?.sizedFrom)
    out.push("the server's stream had no length, so the player downloaded it whole (WebKit gives a stream like that no sound)");
  if (playing && report.graphPeak === 0) out.push("the element is playing but nothing leaves the audio graph");
  if (active?.error) out.push("the element reports a media error");
  if (report.probe.status === 200 && !report.probe.contentLength) out.push("a range request got 200 with no Content-Length");
  return out;
}
