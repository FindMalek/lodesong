import { expect, test } from "bun:test";
import {
  buildReport,
  type DeckSnapshot,
  describeError,
  type Parts,
  redactText,
  redactUrl,
  type Snapshot,
  safe,
  summarizeResponse,
} from "./diagnostics-format";

const CANARY = "canary-s3cr3t";

const HOSTILE_URLS = [
  `//canary.example/rest/stream?id=${CANARY}&t=${CANARY}`,
  `wss://canary.example/ws?token=${CANARY}`,
  `file:///Users/${CANARY}/Music/song.flac`,
  `https://user:${CANARY}@canary.example/rest/stream?id=${CANARY}&format=opus&size=${CANARY}&timeOffset=${CANARY}`,
  `/rest/stream?id=${CANARY}&format=${CANARY}&maxBitRate=${CANARY}&apiKey=${CANARY}`,
  `/Users/${CANARY}/Music/a.mp3?x=${CANARY}`,
  `/some/${CANARY}/path?u=${CANARY}`,
  `http://${CANARY}.example:4533/rest/stream#${CANARY}`,
  `blob:http://canary.example/${CANARY}`,
];

const HOSTILE_TEXT = [
  ...HOSTILE_URLS,
  `failed to fetch //canary.example/x?token=${CANARY}`,
  `user=${CANARY}`,
  `username=${CANARY}`,
  `pass=${CANARY}`,
  `password = "${CANARY}"`,
  `salt=${CANARY}`,
  `secret=${CANARY}`,
  `access_token=${CANARY}`,
  `client_secret=${CANARY}`,
  `sessionid=${CANARY}`,
  `JSESSIONID=${CANARY}`,
  `{"token":"${CANARY}"}`,
  `token = "${CANARY}"`,
  `{'apiKey': '${CANARY}'}`,
  `Authorization: Basic ${CANARY}`,
  `authorization: Bearer ${CANARY}.${CANARY}`,
  `Cookie: a=1; other=${CANARY}`,
  `Set-Cookie: sid=${CANARY}; Path=/`,
  `t=${CANARY}&s=${CANARY}&u=${CANARY}&p=${CANARY}`,
  `eyJhbGciOiJIUzI1NiJ9.${CANARY}.${CANARY}`,
  `connect ECONNREFUSED ${CANARY}.example.com`,
  `/Volumes/${CANARY}/x.flac`,
];

test("no hostile url keeps a credential, a host, an id or a private path", () => {
  for (const url of HOSTILE_URLS) expect(redactUrl(url), url).not.toContain("canary");
});

test("a stream url keeps its path and the audio params only", () => {
  expect(redactUrl("/rest/stream?id=so-1&format=opus&maxBitRate=192&estimateContentLength=true&t=abc")).toBe(
    "/rest/stream?id=<id>&format=opus&maxBitRate=192&estimateContentLength=true&(1 other)",
  );
  expect(redactUrl("https://music.example.com/rest/stream?id=so-1")).toBe("<origin>/rest/stream?id=<id>");
  expect(redactUrl("blob:http://localhost/1234")).toBe("blob:");
});

test("no hostile text keeps a credential, a host or an address", () => {
  for (const text of HOSTILE_TEXT) expect(redactText(`error: ${text} (retrying)`), text).not.toContain("canary");
  expect(redactText("refused by 10.1.2.3 and 192.168.0.9")).not.toMatch(/\d+\.\d+\.\d+\.\d+/);
});

test("ordinary media errors survive redaction", () => {
  expect(redactText("MEDIA_ELEMENT_ERROR: Format error")).toBe("MEDIA_ELEMENT_ERROR: Format error");
});

test("an error is reduced to its name and code", () => {
  expect(describeError(new TypeError(`bad ${CANARY}`))).toBe("TypeError");
  expect(describeError(Object.assign(new Error(CANARY), { code: 4 }))).toBe("Error code 4");
  expect(describeError(CANARY)).toBe("Error");
});

test("a part that throws becomes a failure that names the error and nothing else", async () => {
  expect(await safe(() => 1)).toBe(1);
  expect(
    await safe(() => {
      throw new DOMException(CANARY, "InvalidStateError");
    }),
  ).toEqual({ failed: "InvalidStateError code 11" });
});

test("a response is reduced to the headers that decide how a browser plays it", () => {
  const headers = new Headers({ "content-type": "audio/ogg", "accept-ranges": "none", "set-cookie": "sid=1", "x-secret": "s" });
  expect(summarizeResponse({ status: 200, headers })).toEqual({
    status: 200,
    contentType: "audio/ogg",
    contentLength: null,
    acceptRanges: "none",
    contentRange: null,
    contentEncoding: null,
  });
});

const deck = (over: Partial<DeckSnapshot> = {}): DeckSnapshot => ({
  index: 0,
  active: true,
  songId: "so-1",
  src: "/rest/stream?id=so-1&format=opus",
  fromBlob: false,
  sizedFrom: null,
  downloading: false,
  downloadError: null,
  readyState: 4,
  networkState: 1,
  error: null,
  currentTime: 2.123456,
  duration: 214,
  paused: false,
  muted: false,
  volume: 1,
  gain: 0.8000000119,
  factor: 0.8,
  ...over,
});

const snapshot = (over: Partial<Snapshot> = {}): Snapshot => ({
  decks: [deck()],
  context: { state: "running", sampleRate: 48000, baseLatency: 0.0026666, outputLatency: 0.0158333, sinkId: "", hasSetSinkId: false },
  master: 0.8000000119,
  volume: 0.8,
  levels: "off",
  events: [{ ms: 519, deck: 0, name: "playing" }],
  ...over,
});

const parts = (over: Partial<Parts> = {}): Parts => ({
  at: "2026-01-01T00:00:00.000Z",
  page: { userAgent: "x" },
  song: { id: "so-1", title: "Ember" },
  stream: { setting: "auto", playing: "opus-192" },
  canPlayType: {},
  player: { playing: true, buffering: false, error: null, volume: 0.8, muted: false, outputDevice: "default" },
  normalization: {},
  snapshot: snapshot(),
  graphPeak: 0.2,
  probe: { status: 206, contentLength: "2" },
  levelsFile: 200,
  serviceWorker: {},
  settings: { streamQuality: "auto", eqGains: [0, 0, 6] },
  ...over,
});

test("a healthy playback has no findings, and they come first when there are some", () => {
  const healthy = buildReport(parts());
  expect(healthy.findings).toEqual([]);
  expect(Object.keys(healthy)[0]).toBe("findings");
});

test("the report holds no credential whatever the page was holding", () => {
  const hostile = buildReport(
    parts({
      snapshot: snapshot({
        decks: [
          deck({
            src: `https://user:${CANARY}@canary.example/rest/stream?id=${CANARY}&t=${CANARY}`,
            sizedFrom: `//canary.example/rest/stream?token=${CANARY}`,
            error: { code: 4, message: `failed https://canary.example/x?t=${CANARY}, Cookie: a=${CANARY}` },
          }),
        ],
        events: [{ ms: 5, deck: 0, name: "error", detail: `code 4 Authorization: Basic ${CANARY} at 10.0.0.2` }],
      }),
    }),
  );
  expect(JSON.stringify(hostile)).not.toMatch(/canary|10\.0\.0\.2/);
});

test("numbers are rounded and events and eq bands are one line each", () => {
  const report = buildReport(parts());
  expect(report.gains).toEqual({ master: 0.8, volume: 0.8 });
  expect((report.decks as { gain: number; currentTime: number }[])[0]).toMatchObject({ gain: 0.8, currentTime: 2.123 });
  expect(report.events).toEqual(["+519ms deck 0 playing"]);
  expect((report.settings as { eqGains: string }).eqGains).toBe("0 0 6");
});

const found = (over: Partial<Parts>): string[] => buildReport(parts(over)).findings as string[];

test("findings name a silent master gain, a suspended context and a muted player", () => {
  expect(found({ snapshot: snapshot({ master: 0 }) })).toContain("the master gain is 0");
  expect(
    found({ snapshot: snapshot({ context: { ...(snapshot().context as object), state: "suspended" } as Snapshot["context"] }) }),
  ).toContain("the audio context is suspended");
  expect(found({ snapshot: snapshot({ context: null }) })).toContain("no audio graph was built");
  expect(found({ player: { ...(parts().player as object), muted: true } as Parts["player"] })).toContain("the player is muted");
  expect(found({ player: { ...(parts().player as object), volume: 0 } as Parts["player"] })).toContain("the player volume is 0");
});

test("findings name a playing deck whose gain is 0 and say why", () => {
  expect(found({ snapshot: snapshot({ decks: [deck({ factor: 0, gain: 0 })] }) }).join()).toContain("normalization factor is 0");
  expect(found({ snapshot: snapshot({ decks: [deck({ gain: 0 })] }) })).toContain("the deck gain is 0");
});

test("a stream with no length, a silent graph and a media error are findings", () => {
  const infinite = snapshot({ decks: [deck({ duration: Number.POSITIVE_INFINITY, error: { code: 4, message: "x" } })] });
  const out = found({ snapshot: infinite, graphPeak: 0, probe: { status: 200, contentLength: null } });
  expect(out).toContain("the stream has no length: WebKit plays it, but Web Audio gets silence");
  expect(out).toContain("the element is playing but nothing leaves the audio graph");
  expect(out).toContain("the element reports a media error");
  expect(out.join()).toContain("a range request got 200 with no Content-Length");
});

test("a stream the player downloaded whole is one finding that says it was handled", () => {
  const out = found({
    snapshot: snapshot({ decks: [deck({ sizedFrom: "/rest/stream?id=so-1" })] }),
    probe: { status: 200, contentLength: null },
  });
  expect(out).toHaveLength(1);
  expect(out[0]).toContain("the player downloads it whole, so it plays");
});

test("a whole-stream download that failed or is still running is a finding", () => {
  expect(found({ snapshot: snapshot({ decks: [deck({ downloadError: "TimeoutError" })] }) }).join()).toContain(
    "downloading the stream whole failed (TimeoutError)",
  );
  expect(found({ snapshot: snapshot({ decks: [deck({ downloading: true })] }) })).toContain(
    "the stream is still being downloaded whole before it plays",
  );
});

test("the probe says it went through lodesong's own server", () => {
  expect(buildReport(parts()).probe).toMatchObject({ via: "lodesong's own server" });
});

test("a probe that fails is a finding", () => {
  expect(found({ probe: { error: "TimeoutError code 23" } })).toContain("the range probe failed: TimeoutError code 23");
});

test("a part that failed is named and the rest of the report still arrives", () => {
  const report = buildReport(parts({ graphPeak: { failed: "InvalidStateError code 11" } }));
  expect(report.findings).toContain("graphPeak failed: InvalidStateError code 11");
  expect(report.graphPeak).toEqual({ failed: "InvalidStateError code 11" });
  expect((report.decks as unknown[]).length).toBe(1);
  const lost = buildReport(parts({ snapshot: { failed: "TypeError" } }));
  expect(lost.findings).toContain("snapshot failed: TypeError");
  expect(lost.probe).toMatchObject({ status: 206, contentLength: "2" });
});
