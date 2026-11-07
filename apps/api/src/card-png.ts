import { initWasm, Resvg } from "@resvg/resvg-wasm";
import wasmPath from "@resvg/resvg-wasm/index_bg.wasm" with { type: "file" };
import { CARD_WIDTH } from "./card-layout";
import { gate } from "./covers";

let ready: Promise<void> | undefined;

/** resvg as WebAssembly, embedded in the executable: no native addon, nothing written to disk. */
function wasmReady(): Promise<void> {
  ready ??= Bun.file(wasmPath)
    .arrayBuffer()
    .then((bytes) => initWasm(bytes));
  return ready;
}

export async function rasterize(svg: string): Promise<Uint8Array> {
  await wasmReady();
  return new Resvg(svg, { fitTo: { mode: "width", value: CARD_WIDTH } }).render().asPng();
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

/** Rendered cards by key: the least recently used one goes first, and requests for a card being drawn wait for it. */
export class CardImages {
  private readonly done = new Map<string, Uint8Array>();
  private readonly running = new Map<string, Promise<Uint8Array>>();
  private readonly slot = gate(2);

  constructor(private readonly limit: number = 48) {}

  get(key: string, draw: () => Promise<Uint8Array>): Promise<Uint8Array> {
    const hit = this.done.get(key);
    if (hit) {
      this.done.delete(key);
      this.done.set(key, hit);
      return Promise.resolve(hit);
    }
    const pending = this.running.get(key);
    if (pending) return pending;
    const job = this.slot(draw)
      .then((bytes) => {
        this.done.set(key, bytes);
        for (const old of this.done.keys()) {
          if (this.done.size <= this.limit) break;
          this.done.delete(old);
        }
        return bytes;
      })
      .finally(() => this.running.delete(key));
    this.running.set(key, job);
    return job;
  }
}
