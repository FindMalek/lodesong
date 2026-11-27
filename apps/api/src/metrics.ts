type Labels = Record<string, string>;

interface Series {
  name: string;
  labels: Labels;
  count: number;
  sum: number;
  buckets: number[] | null;
}

interface MetricsOptions {
  url: string;
  org: string;
  auth: string;
  release: string;
  fetcher?: typeof fetch;
}

const FLUSH_MS = 15_000;
const MAX_SERIES = 500;
const BOUNDS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
// OTLP's AGGREGATION_TEMPORALITY_CUMULATIVE, what PromQL's `rate` expects.
const CUMULATIVE = 2;

let active: Metrics | null = null;

const encode = (labels: Labels) => Object.entries(labels).map(([key, stringValue]) => ({ key, value: { stringValue } }));
const unixNanos = () => `${Date.now()}000000`;

/** Totals since start, sent as OTLP/HTTP JSON. Labels only ever hold fixed names: no ids, addresses, users or library content. */
export class Metrics {
  private readonly fetcher: typeof fetch;
  private readonly series = new Map<string, Series>();
  private readonly gauges: { name: string; labels: Labels; read: () => number }[] = [];
  private readonly started = unixNanos();
  private rejected = false;

  constructor(private readonly options: MetricsOptions) {
    this.fetcher = options.fetcher ?? fetch;
    for (const [kind, key] of [
      ["rss", "rss"],
      ["heap_used", "heapUsed"],
      ["external", "external"],
    ] as const)
      this.gauge("lodesong_memory_bytes", { kind }, () => process.memoryUsage()[key]);
  }

  gauge(name: string, labels: Labels, read: () => number): void {
    this.gauges.push({ name, labels, read });
  }

  count(name: string, labels: Labels): void {
    const series = this.at(name, labels, false);
    if (series) series.count++;
  }

  observe(name: string, labels: Labels, seconds: number): void {
    const series = this.at(name, labels, true);
    if (!series?.buckets) return;
    series.count++;
    series.sum += seconds;
    const index = BOUNDS.findIndex((bound) => seconds <= bound);
    const bucket = index < 0 ? BOUNDS.length : index;
    series.buckets[bucket] = (series.buckets[bucket] ?? 0) + 1;
  }

  private at(name: string, labels: Labels, histogram: boolean): Series | undefined {
    const key = `${name} ${Object.values(labels).join(" ")}`;
    let series = this.series.get(key);
    if (!series && this.series.size < MAX_SERIES) {
      series = { name, labels, count: 0, sum: 0, buckets: histogram ? new Array<number>(BOUNDS.length + 1).fill(0) : null };
      this.series.set(key, series);
    }
    return series;
  }

  private payload() {
    const times = { startTimeUnixNano: this.started, timeUnixNano: unixNanos() };
    const metrics = new Map<string, Record<string, { dataPoints: object[]; aggregationTemporality?: number; isMonotonic?: boolean }>>();
    const add = (name: string, type: "gauge" | "sum" | "histogram", point: object) => {
      const metric = metrics.get(name) ?? {
        [type]: {
          dataPoints: [],
          ...(type === "gauge" ? {} : { aggregationTemporality: CUMULATIVE }),
          ...(type === "sum" ? { isMonotonic: true } : {}),
        },
      };
      metric[type]?.dataPoints.push(point);
      metrics.set(name, metric);
    };
    for (const { name, labels, read } of this.gauges)
      add(name, "gauge", { attributes: encode(labels), ...times, asInt: String(Math.round(read())) });
    for (const { name, labels, count, sum, buckets } of this.series.values()) {
      const base = { attributes: encode(labels), ...times };
      if (buckets)
        add(name, "histogram", { ...base, count: String(count), sum, bucketCounts: buckets.map(String), explicitBounds: BOUNDS });
      else add(name, "sum", { ...base, asInt: String(count) });
    }
    const { release } = this.options;
    const resource = { attributes: encode({ "service.name": "lodesong", "service.version": release }) };
    const list = [...metrics].map(([name, data]) => ({ name, ...data }));
    return { resourceMetrics: [{ resource, scopeMetrics: [{ scope: { name: "lodesong", version: release }, metrics: list }] }] };
  }

  /** A lost export costs nothing but resolution: the next one carries the same totals. */
  async flush(): Promise<void> {
    const { url, org, auth } = this.options;
    const sent = await this.fetcher(`${url}/api/${encodeURIComponent(org)}/v1/metrics`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: auth },
      body: JSON.stringify(this.payload()),
      signal: AbortSignal.timeout(5000),
    }).catch(() => undefined);
    if (sent && !sent.ok && !this.rejected) {
      this.rejected = true;
      console.warn(`metrics were rejected: ${sent.status}`);
    }
  }

  start(): () => void {
    active = this;
    const timer = setInterval(() => void this.flush(), FLUSH_MS);
    timer.unref?.();
    return () => {
      clearInterval(timer);
      active = null;
    };
  }
}

export const count = (name: string, labels: Labels) => active?.count(name, labels);
export const observe = (name: string, labels: Labels, seconds: number) => active?.observe(name, labels, seconds);
export const queueDepth = (queue: string, read: () => number) => active?.gauge("lodesong_queue_depth", { queue }, read);
