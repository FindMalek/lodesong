import wasmPath from "@resvg/resvg-wasm/index_bg.wasm" with { type: "file" };
import { CARD_WIDTH } from "./card-layout";
import { gate } from "./covers";
import { memoAsync } from "./memo-async";

type Resvg = typeof import("@resvg/resvg-wasm");

const engine = memoAsync<Resvg>(async () => {
  const resvg = await import("@resvg/resvg-wasm");
  await resvg.initWasm(await Bun.file(wasmPath).arrayBuffer());
  return resvg;
});

const QUALITY = 90;
const FALLBACK_QUALITY = [75, 60, 45];
const BUDGET = 280_000;

/** JPEG, not PNG: a photographic cover makes a 400 to 800 KB PNG and chat apps drop thumbnails past about 300 KB. */
export async function rasterize(svg: string): Promise<Uint8Array> {
  const { Resvg } = await engine();
  const png = new Resvg(svg, { fitTo: { mode: "width", value: CARD_WIDTH } }).render().asPng();
  let jpeg = await new Bun.Image(png).jpeg({ quality: QUALITY }).bytes();
  for (const quality of FALLBACK_QUALITY) {
    if (jpeg.length <= BUDGET) break;
    jpeg = await new Bun.Image(png).jpeg({ quality }).bytes();
  }
  return jpeg;
}

/** A cover as a JPEG data URI (resvg doesn't read the webp the cover cache keeps), optionally shrunk to `side` pixels. */
export async function pictureUri(bytes: Uint8Array, side?: number): Promise<string | null> {
  const image = new Bun.Image(bytes);
  const jpeg = await (side ? image.resize(side, side) : image)
    .jpeg({ quality: 88 })
    .bytes()
    .catch(() => null);
  return jpeg ? `data:image/jpeg;base64,${Buffer.from(jpeg).toString("base64")}` : null;
}

export interface Drawn {
  bytes: Uint8Array;
  complete: boolean;
}

export class Busy extends Error {}

export const PARTIAL_MS = 60_000;
const PARTIAL_LIMIT = 16;

export class CardImages {
  private readonly done = new Map<string, Uint8Array>();
  private readonly partial = new Map<string, { bytes: Uint8Array; until: number }>();
  private readonly running = new Map<string, Promise<Drawn>>();
  private readonly slot = gate(2);
  private fixed: Promise<Uint8Array> | undefined;

  constructor(
    private readonly limit: number = 48,
    private readonly queue: number = 8,
    private readonly timeoutMs: number = 20_000,
    private readonly now: () => number = Date.now,
  ) {}

  /** One card drawn the first time and then kept for good, outside the cache and the queue, so it is always there to serve. */
  pinned(draw: () => Promise<Uint8Array>): Promise<Uint8Array> {
    this.fixed ??= draw().catch((error: unknown) => {
      this.fixed = undefined;
      throw error;
    });
    return this.fixed;
  }

  async get(key: string, draw: () => Promise<Drawn>): Promise<Drawn> {
    const hit = this.done.get(key);
    if (hit) {
      this.done.delete(key);
      this.done.set(key, hit);
      return { bytes: hit, complete: true };
    }
    const brief = this.partial.get(key);
    if (brief && brief.until > this.now()) return { bytes: brief.bytes, complete: false };
    const pending = this.running.get(key);
    if (pending) return this.within(pending);
    if (this.running.size >= this.queue) throw new Busy("render queue full");
    const job = this.slot(draw)
      .then((drawn) => {
        if (drawn.complete) this.keep(key, drawn.bytes);
        else this.hold(key, drawn.bytes);
        return drawn;
      })
      .finally(() => this.running.delete(key));
    this.running.set(key, job);
    return this.within(job);
  }

  private within(job: Promise<Drawn>): Promise<Drawn> {
    const timer = Promise.withResolvers<never>();
    const id = setTimeout(() => timer.reject(new Busy("render timed out")), this.timeoutMs);
    return Promise.race([job, timer.promise]).finally(() => clearTimeout(id));
  }

  private hold(key: string, bytes: Uint8Array): void {
    this.partial.delete(key);
    this.partial.set(key, { bytes, until: this.now() + PARTIAL_MS });
    for (const old of this.partial.keys()) {
      if (this.partial.size <= PARTIAL_LIMIT) break;
      this.partial.delete(old);
    }
  }

  private keep(key: string, bytes: Uint8Array): void {
    this.done.set(key, bytes);
    for (const old of this.done.keys()) {
      if (this.done.size <= this.limit) break;
      this.done.delete(old);
    }
  }
}
