import wasmPath from "@resvg/resvg-wasm/index_bg.wasm" with { type: "file" };
import { CARD_WIDTH } from "./card-layout";
import { gate } from "./covers";

type Resvg = typeof import("@resvg/resvg-wasm");

let ready: Promise<Resvg> | undefined;

function engine(): Promise<Resvg> {
  ready ??= (async () => {
    const resvg = await import("@resvg/resvg-wasm");
    await resvg.initWasm(await Bun.file(wasmPath).arrayBuffer());
    return resvg;
  })();
  return ready;
}

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

export class CardImages {
  private readonly done = new Map<string, Uint8Array>();
  private readonly running = new Map<string, Promise<Drawn>>();
  private readonly slot = gate(2);

  constructor(
    private readonly limit: number = 48,
    private readonly queue: number = 8,
    private readonly timeoutMs: number = 20_000,
  ) {}

  async get(key: string, draw: () => Promise<Drawn>): Promise<Drawn> {
    const hit = this.done.get(key);
    if (hit) {
      this.done.delete(key);
      this.done.set(key, hit);
      return { bytes: hit, complete: true };
    }
    const pending = this.running.get(key);
    if (pending) return this.within(pending);
    if (this.running.size >= this.queue) throw new Busy("render queue full");
    const job = this.slot(draw)
      .then((drawn) => {
        if (drawn.complete) this.keep(key, drawn.bytes);
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

  private keep(key: string, bytes: Uint8Array): void {
    this.done.set(key, bytes);
    for (const old of this.done.keys()) {
      if (this.done.size <= this.limit) break;
      this.done.delete(old);
    }
  }
}
