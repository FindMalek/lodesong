import { expect, test } from "bun:test";
import { createTracedFetch } from "./trace";

test("only calls to this server carry a traceparent, and a failed one is what gets reported", async () => {
  const sent: (string | null)[] = [];
  const send = (async (url: string, init?: RequestInit) => {
    sent.push(new Headers(init?.headers).get("traceparent"));
    return new Response(null, { status: url === "/api/search" ? 502 : 200 });
  }) as never;
  const tracing = createTracedFetch(send, "http://app.test");
  await tracing.fetch("/api/search");
  await tracing.fetch("/api/prefs");
  await tracing.fetch("https://elsewhere.test/api/x");
  expect(sent[0]).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
  expect(sent[2]).toBeNull();
  expect(tracing.traceparent()).toBe(sent[0] as string);
});
