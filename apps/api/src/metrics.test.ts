import { expect, test } from "bun:test";
import { Metrics } from "./metrics";
import { startTracing, Tracer, tracedRoutes } from "./tracing";

test("a failed request is exported as a cumulative histogram labelled by route, never by address", async () => {
  let exported = "";
  const options = { url: "http://o2", org: "default", auth: "Basic x", release: "1" };
  const metrics = new Metrics({
    ...options,
    fetcher: (async (_url: string, init: RequestInit) => {
      exported = String(init.body);
      return new Response();
    }) as never,
  });
  const stopMetrics = metrics.start();
  const stopTracing = startTracing(new Tracer({ ...options, fetcher: (async () => new Response()) as never }), []);
  try {
    const routes = tracedRoutes({ "/song/:id": (_request: Request) => new Response(null, { status: 502 }) });
    await routes["/song/:id"](new Request("http://x/song/abc123?q=hidden"));
    await metrics.flush();
    const sent = JSON.parse(exported).resourceMetrics[0].scopeMetrics[0].metrics;
    const { histogram } = sent.find((metric: { name: string }) => metric.name === "lodesong_request_duration_seconds");
    expect(histogram.aggregationTemporality).toBe(2);
    const [point] = histogram.dataPoints;
    expect(point.attributes.map((a: { value: { stringValue: string } }) => a.value.stringValue)).toEqual(["/song/:id", "GET", "error"]);
    expect(point.count).toBe("1");
    expect(point.bucketCounts).toHaveLength(point.explicitBounds.length + 1);
    expect(exported).not.toMatch(/abc123|hidden/);
  } finally {
    stopTracing();
    stopMetrics();
  }
});
