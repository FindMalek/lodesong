import { expect, test } from "bun:test";
import { startTracing, Tracer, tracedRoutes } from "./tracing";

test("a request span and its upstream child share the incoming trace, without addresses", async () => {
  let exported = "";
  let sent: string | null = null;
  const real = globalThis.fetch;
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    sent = new Headers(init.headers).get("traceparent");
    return new Response();
  }) as never;
  const tracer = new Tracer({
    url: "http://o2",
    org: "default",
    auth: "Basic x",
    release: "1",
    fetcher: (async (_url: string, init: RequestInit) => {
      exported = String(init.body);
      return new Response();
    }) as never,
  });
  const stop = startTracing(tracer, [["navidrome", "http://music.test"]]);
  try {
    const routes = tracedRoutes({
      "/song/:id": async (_request: Request) => {
        await fetch("http://music.test/rest/getAlbumList2?u=alice&t=secret");
        return new Response();
      },
    });
    const traceId = "4bf92f3577b34da6a3ce929d0e0e4736";
    await routes["/song/:id"](
      new Request("http://x/song/abc123?q=hidden", { headers: { traceparent: `00-${traceId}-00f067aa0ba902b7-01` } }),
    );
    await tracer.flush();
    const [child, parent] = JSON.parse(exported).resourceSpans[0].scopeSpans[0].spans;
    expect(parent).toMatchObject({ name: "GET /song/:id", kind: 2, traceId, parentSpanId: "00f067aa0ba902b7" });
    expect(child).toMatchObject({ name: "GET navidrome getAlbumList2", kind: 3, traceId, parentSpanId: parent.spanId });
    expect(String(sent)).toBe(`00-${traceId}-${child.spanId}-01`);
    expect(exported).not.toMatch(/alice|secret|abc123|hidden|music\.test/);
  } finally {
    stop();
    globalThis.fetch = real;
  }
});
