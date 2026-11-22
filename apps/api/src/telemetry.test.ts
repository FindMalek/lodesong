import { describe, expect, test } from "bun:test";
import { createClientReporter, scrub, Telemetry } from "./telemetry";

const recorder = (calls: string[]) =>
  (async (url: string) => {
    calls.push(url);
    return new Response();
  }) as never;
const bodyRecorder = (calls: { url: string; body: string }[]) =>
  (async (url: string, init: RequestInit) => {
    calls.push({ url, body: String(init.body) });
    return new Response();
  }) as never;
const o2 = { url: "http://o2", org: "default", stream: "lodesong", auth: "Basic x" };

describe("scrub", () => {
  test("drops query strings and token values", () => {
    expect(scrub("GET https://music.example.com/rest/stream?id=1&t=abc failed")).toBe("GET https://music.example.com/rest/stream failed");
    expect(scrub("login password=hunter2 failed")).toBe("login password=[redacted] failed");
  });
});

describe("Telemetry", () => {
  test("sends nothing when diagnostics are off", async () => {
    const calls: string[] = [];
    const telemetry = new Telemetry({
      on: false,
      dsn: "https://key@gt.example/1",
      o2,
      release: "1",
      fetcher: recorder(calls),
    });
    telemetry.error(new Error("boom"), "test");
    await telemetry.flush();
    expect(telemetry.active).toBe(false);
    expect(calls).toEqual([]);
  });

  test("an error goes to glitchtip and its log line to o2", async () => {
    const calls: { url: string; body: string }[] = [];
    const telemetry = new Telemetry({
      on: true,
      dsn: "https://key@gt.example/7",
      o2,
      release: "1.2.3",
      fetcher: bodyRecorder(calls),
    });
    telemetry.error(new Error("boom at https://x.test/a?token=secret"), "unit");
    await telemetry.flush();
    expect(calls.map((call) => call.url).sort()).toEqual(["http://o2/api/default/lodesong/_json", "https://gt.example/api/7/store/"]);
    expect(calls.every((call) => !call.body.includes("secret"))).toBe(true);
  });
});

describe("client reporter", () => {
  test("needs the csrf header and forwards a player error", async () => {
    const calls: string[] = [];
    const telemetry = new Telemetry({
      on: true,
      dsn: "https://key@gt.example/7",
      o2: null,
      release: "1",
      fetcher: recorder(calls),
    });
    const report = createClientReporter(telemetry);
    const post = (headers: Record<string, string>) =>
      report(
        new Request("http://x/api/diagnostics", {
          method: "POST",
          headers,
          body: JSON.stringify({ message: "x is not a function", page: "/albums?id=1" }),
        }),
      );
    expect((await post({})).status).toBe(403);
    expect((await post({ "x-lodesong": "1" })).status).toBe(204);
    expect(calls).toEqual(["https://gt.example/api/7/store/"]);
  });
});
