import { expect, test } from "bun:test";
import { originOf } from "./origin-of";

const request = (headers: Record<string, string> = {}) => new Request("http://10.0.0.5:8080/album/x", { headers });
const forwarded = { "x-forwarded-host": "music.example, inner", "x-forwarded-proto": "https, http" };

test("without a trusted proxy the forwarded headers are ignored", () => {
  expect(originOf(request(forwarded), { trustProxy: false })).toBe("http://10.0.0.5:8080");
});

test("behind a trusted proxy the first forwarded host and protocol count", () => {
  expect(originOf(request(forwarded), { trustProxy: true })).toBe("https://music.example");
  expect(originOf(request(), { trustProxy: true })).toBe("http://10.0.0.5:8080");
  expect(originOf(request({ "x-forwarded-host": 'a"><b' }), { trustProxy: true })).toBe("http://10.0.0.5:8080");
});

test("a configured public address beats everything else", () => {
  expect(originOf(request(forwarded), { trustProxy: true, publicUrl: "https://tunes.example/" })).toBe("https://tunes.example");
});
