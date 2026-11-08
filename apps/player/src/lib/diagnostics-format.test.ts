import { expect, test } from "bun:test";
import { findings, redactText, redactUrl, summarizeResponse } from "./diagnostics-format";

test("a stream url keeps its path and the audio params, and loses everything that could sign it", () => {
  const url = "https://music.example.com/rest/stream?id=so-1&format=opus&maxBitRate=192&t=abc&s=salt&u=malek&apiKey=k#frag";
  expect(redactUrl(url)).toBe(
    "<origin>/rest/stream?id=so-1&format=opus&maxBitRate=192&t=<redacted>&s=<redacted>&u=<redacted>&apiKey=<redacted>",
  );
  expect(redactUrl("/rest/stream?id=so-1&token=zzz")).toBe("/rest/stream?id=so-1&token=<redacted>");
  expect(redactUrl("blob:http://localhost/1234-secret")).toBe("blob:");
});

test("free text loses urls, tokens and bearer headers", () => {
  const text = "failed https://a.example.com/rest/stream?id=1&t=abc, Authorization: Bearer xyz.123, cookie=sid42";
  const out = redactText(text);
  expect(out).not.toMatch(/abc|xyz|sid42|a\.example\.com/);
  expect(out).toContain("<origin>/rest/stream?id=1&t=<redacted>");
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

test("findings name a stream without a length that plays into a silent graph", () => {
  const deck = { active: true, paused: false, duration: "Infinity", error: null };
  const probe = { status: 200, contentLength: null };
  const found = findings({ decks: [deck], context: { state: "running" }, master: 1, graphPeak: 0, probe });
  expect(found).toContain("the stream has no length: WebKit plays it, but Web Audio gets silence");
  expect(found).toContain("the element is playing but nothing leaves the audio graph");
  expect(found).toContain("a range request got 200 with no Content-Length");
});

test("findings say when the player had to download a stream that came without a length", () => {
  const deck = { active: true, paused: false, duration: 6, error: null, sizedFrom: "/rest/stream?id=so-1" };
  const found = findings({ decks: [deck], context: { state: "running" }, master: 1, graphPeak: 0.2, probe: { status: 200 } });
  expect(found.join()).toContain("downloaded it whole");
});

test("a healthy playback has no findings", () => {
  const deck = { active: true, paused: false, duration: 214, error: null };
  const probe = { status: 206, contentLength: "2" };
  expect(findings({ decks: [deck], context: { state: "running" }, master: 0.8, graphPeak: 0.2, probe })).toEqual([]);
});
