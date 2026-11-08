export interface Failed {
  failed: string;
}

export const isFailed = (value: unknown): value is Failed => typeof value === "object" && value !== null && "failed" in value;

/** Only the error's name and code: its message can carry anything the page was holding. */
export function describeError(error: unknown): string {
  const name = error instanceof Error ? error.name : "Error";
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "number" ? `${name} code ${code}` : name;
}

export async function safe<T>(run: () => T | Promise<T>): Promise<T | Failed> {
  try {
    return await run();
  } catch (error) {
    return { failed: describeError(error) };
  }
}

const KNOWN_PATH = /^\/(?:rest\/\w+(?:\.view)?|worklets\/levels\.js)$/;
const KEPT_PARAMS: Record<string, RegExp> = {
  format: /^[a-z0-9]{1,8}$/i,
  maxBitRate: /^\d{1,4}$/,
  estimateContentLength: /^(?:true|false)$/,
};

/** A url reduced to a known path and a few audio params: a host, credentials, ids and every other param are gone. */
export function redactUrl(value: string): string {
  if (/^(?:blob|data):/i.test(value)) return value.slice(0, value.indexOf(":") + 1);
  let url: URL;
  try {
    url = new URL(value, "http://relative.invalid");
  } catch {
    return "<url>";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return "<url>";
  const origin = url.host === "relative.invalid" && !value.startsWith("//") ? "" : "<origin>";
  const path = KNOWN_PATH.test(url.pathname) ? url.pathname : "<path>";
  const kept: string[] = [];
  let others = 0;
  for (const [name, text] of url.searchParams) {
    if (name === "id") kept.push("id=<id>");
    else if (KEPT_PARAMS[name]?.test(text)) kept.push(`${name}=${text}`);
    else others += 1;
  }
  if (others) kept.push(`(${others} other)`);
  return `${origin}${path}${kept.length ? `?${kept.join("&")}` : ""}`;
}

const HEADERS = /\b(proxy-authorization|authorization|set-cookie|cookie)\s*:[^\n]*/gi;
const SCHEME_URLS = /[a-z][a-z0-9+.-]*:\/\/[^\s"'<>)\]]+/gi;
const RELATIVE_URLS = /(?<![\w:/])\/\/[^\s"'<>)\]]+/g;
const REST_URLS = /\/rest\/\w+(?:\.view)?\?[^\s"'<>)\]]*/g;
const FILE_PATHS = /(?<![\w<:/.])\/(?!rest\/|worklets\/)[\w.~%-]+(?:\/[\w.~%-]+)+/g;
const JWTS = /\beyJ[\w-]+\.[\w-]+\.[\w-]*/g;
const SECRET_NAME = String.raw`[\w-]*(?:token|secret|pass\w*|key|auth\w*|cookie|session\w*|sid|user\w*|salt|jwt|bearer|sig(?:nature)?)[\w-]*`;
const PAIRS = new RegExp(String.raw`(["']?)(${SECRET_NAME})\1\s*[:=]\s*("[^"]*"|'[^']*'|[^&\s,;}"']+)`, "gi");
const SHORT_PAIRS = /\b([tsup])=[^&\s,;}"']+/g;
const IPV4 = /\b\d{1,3}(?:\.\d{1,3}){3}\b/g;
const HOSTS = /\b(?:[a-z0-9-]+\.)+[a-z]{2,}\b/gi;

/** Free text with urls, credentials, headers, tokens, file paths and hosts replaced. */
export function redactText(text: string): string {
  return text
    .replace(HEADERS, (_match, name: string) => `${name}: <redacted>`)
    .replace(SCHEME_URLS, "<url>")
    .replace(RELATIVE_URLS, "<url>")
    .replace(REST_URLS, redactUrl)
    .replace(FILE_PATHS, "<path>")
    .replace(/<path>\?[^\s"'<>)\]]*/g, "<path>")
    .replace(JWTS, "<jwt>")
    .replace(PAIRS, (_match, _quote: string, name: string) => `${name}=<redacted>`)
    .replace(SHORT_PAIRS, (_match, name: string) => `${name}=<redacted>`)
    .replace(IPV4, "<ip>")
    .replace(HOSTS, "<host>");
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

export interface DeckSnapshot {
  index: number;
  active: boolean;
  songId: string | null;
  src: string | null;
  fromBlob: boolean;
  sizedFrom: string | null;
  downloading: boolean;
  downloadError: string | null;
  readyState: number;
  networkState: number;
  error: { code: number; message: string } | null;
  currentTime: number;
  duration: number;
  paused: boolean;
  muted: boolean;
  volume: number;
  gain: number | null;
  factor: number;
}

export interface Snapshot {
  decks: DeckSnapshot[];
  context: {
    state: string;
    sampleRate: number;
    baseLatency: number;
    outputLatency: number | null;
    sinkId: string;
    hasSetSinkId: boolean;
  } | null;
  master: number | null;
  volume: number;
  levels: string;
  events: { ms: number; deck: number; name: string; detail?: string }[];
}

export interface Parts {
  at: string;
  page: unknown;
  song: unknown;
  stream: unknown;
  canPlayType: unknown;
  player: { playing: boolean; buffering: boolean; error: string | null; volume: number; muted: boolean; outputDevice: string } | Failed;
  normalization: unknown;
  snapshot: Snapshot | Failed;
  graphPeak: number | null | Failed;
  probe: StreamProbe | Failed;
  levelsFile: unknown;
  serviceWorker: unknown;
  settings: Record<string, unknown> | Failed;
}

const round = (value: number | null, digits = 3): number | string | null => {
  if (value === null) return null;
  if (!Number.isFinite(value)) return String(value);
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
};

const unlessFailed = <T, R>(value: T | Failed, map: (value: T) => R): R | Failed => (isFailed(value) ? value : map(value));

function describeDeck(deck: DeckSnapshot) {
  return {
    ...deck,
    src: deck.src && redactUrl(deck.src),
    sizedFrom: deck.sizedFrom && redactUrl(deck.sizedFrom),
    error: deck.error && { code: deck.error.code, message: redactText(deck.error.message) },
    currentTime: round(deck.currentTime),
    duration: round(deck.duration),
    volume: round(deck.volume),
    gain: round(deck.gain),
    factor: round(deck.factor),
  };
}

function describeSnapshot(snapshot: Snapshot) {
  const { context } = snapshot;
  return {
    decks: snapshot.decks.map(describeDeck),
    context: context && {
      ...context,
      baseLatency: round(context.baseLatency, 4),
      outputLatency: round(context.outputLatency, 4),
    },
    gains: { master: round(snapshot.master), volume: round(snapshot.volume) },
    levels: snapshot.levels,
    events: snapshot.events.map(
      (event) => `+${event.ms}ms deck ${event.deck} ${event.name}${event.detail ? ` ${redactText(event.detail)}` : ""}`,
    ),
  };
}

function findings(parts: Parts): string[] {
  const out: string[] = [];
  for (const [name, value] of Object.entries(parts)) if (isFailed(value)) out.push(`${name} failed: ${value.failed}`);
  const { snapshot, player, probe, graphPeak } = parts;
  const active = isFailed(snapshot) ? undefined : snapshot.decks.find((deck) => deck.active);
  const playing = !!active && !active.paused;
  if (!isFailed(snapshot)) {
    if (!snapshot.context) out.push("no audio graph was built");
    else if (snapshot.context.state !== "running") out.push(`the audio context is ${snapshot.context.state}`);
    if (snapshot.master === 0) out.push("the master gain is 0");
  }
  if (!isFailed(player)) {
    if (player.muted) out.push("the player is muted");
    else if (player.volume === 0) out.push("the player volume is 0");
  }
  if (active && playing) {
    if (active.factor === 0 || !Number.isFinite(active.factor))
      out.push(`the normalization factor is ${active.factor}: a bad ReplayGain tag or pre-amp`);
    else if (active.gain === 0 || (active.gain !== null && !Number.isFinite(active.gain))) out.push(`the deck gain is ${active.gain}`);
    if (!active.sizedFrom && !Number.isFinite(active.duration) && active.duration > 0)
      out.push("the stream has no length: WebKit plays it, but Web Audio gets silence");
    if (graphPeak === 0) out.push("the element is playing but nothing leaves the audio graph");
  }
  if (active?.sizedFrom)
    out.push("the server's stream has no length (WebKit would play it silent): the player downloads it whole, so it plays");
  if (active?.downloadError)
    out.push(`downloading the stream whole failed (${active.downloadError}): the player retries, then skips the song`);
  if (active?.downloading) out.push("the stream is still being downloaded whole before it plays");
  if (active?.error) out.push("the element reports a media error");
  if (!isFailed(probe)) {
    if (probe.error) out.push(`the range probe failed: ${probe.error}`);
    else if (probe.status === 200 && !probe.contentLength && !active?.sizedFrom)
      out.push("a range request got 200 with no Content-Length (sent by your music server or a proxy in front of lodesong)");
  }
  return out;
}

/** The report: findings first, every url and message redacted, numbers rounded, events and eq bands on one line each. */
export function buildReport(parts: Parts): Record<string, unknown> {
  const settings = unlessFailed(parts.settings, (value) => ({
    ...value,
    ...(Array.isArray(value.eqGains) ? { eqGains: value.eqGains.join(" ") } : {}),
  }));
  const snapshot = isFailed(parts.snapshot) ? { snapshot: parts.snapshot } : describeSnapshot(parts.snapshot);
  return {
    findings: findings(parts),
    at: parts.at,
    page: parts.page,
    song: parts.song,
    stream: parts.stream,
    canPlayType: parts.canPlayType,
    player: unlessFailed(parts.player, (value) => ({ ...value, volume: round(value.volume) })),
    normalization: parts.normalization,
    ...snapshot,
    graphPeak: isFailed(parts.graphPeak) ? parts.graphPeak : round(parts.graphPeak, 4),
    probe: isFailed(parts.probe) ? parts.probe : { via: "lodesong's own server", ...parts.probe },
    levelsFile: parts.levelsFile,
    serviceWorker: parts.serviceWorker,
    settings,
  };
}
