import { deflateSync } from "node:zlib";
import { type Film, SCORES } from "../../apps/video/src/audio-cues";
import { highpass, lowpass, RATE } from "./dsp";

const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = (crcTable[(c ^ b) & 0xff] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i += 1) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc(out.subarray(4, 8 + data.length)));
  return out;
}

class Canvas {
  readonly pixels: Uint8Array;
  constructor(
    readonly width: number,
    readonly height: number,
    background: [number, number, number],
  ) {
    this.pixels = new Uint8Array(width * height * 3);
    for (let i = 0; i < width * height; i += 1) this.pixels.set(background, i * 3);
  }

  dot(x: number, y: number, color: readonly number[]): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    this.pixels.set(color, (Math.round(y) * this.width + Math.round(x)) * 3);
  }

  line(x0: number, y0: number, x1: number, y1: number, color: readonly number[], thick = 1): void {
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
    for (let i = 0; i <= steps; i += 1) {
      const x = x0 + ((x1 - x0) * i) / steps;
      const y = y0 + ((y1 - y0) * i) / steps;
      for (let a = 0; a < thick; a += 1) for (let b = 0; b < thick; b += 1) this.dot(x + a, y + b, color);
    }
  }

  png(): Uint8Array {
    const rows = new Uint8Array((this.width * 3 + 1) * this.height);
    for (let y = 0; y < this.height; y += 1)
      rows.set(this.pixels.subarray(y * this.width * 3, (y + 1) * this.width * 3), y * (this.width * 3 + 1) + 1);
    const header = new Uint8Array(13);
    const view = new DataView(header.buffer);
    view.setUint32(0, this.width);
    view.setUint32(4, this.height);
    header.set([8, 2, 0, 0, 0], 8);
    const parts = [
      new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk("IHDR", header),
      chunk("IDAT", deflateSync(rows)),
      chunk("IEND", new Uint8Array(0)),
    ];
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const p of parts) {
      out.set(p, at);
      at += p.length;
    }
    return out;
  }
}

async function decode(file: string): Promise<{ l: Float32Array; r: Float32Array }> {
  const run = Bun.spawn(["ffmpeg", "-v", "error", "-i", file, "-vn", "-ac", "2", "-ar", String(RATE), "-f", "f32le", "-"], {
    stdout: "pipe",
  });
  const raw = new Float32Array(await new Response(run.stdout).arrayBuffer());
  const frames = raw.length / 2;
  const audio = { l: new Float32Array(frames), r: new Float32Array(frames) };
  for (let i = 0; i < frames; i += 1) {
    audio.l[i] = raw[2 * i] ?? 0;
    audio.r[i] = raw[2 * i + 1] ?? 0;
  }
  return audio;
}

const BANDS: readonly { name: string; low: number; high: number; color: [number, number, number] }[] = [
  { name: "sub 30-60", low: 30, high: 60, color: [220, 80, 80] },
  { name: "bass 60-250", low: 60, high: 250, color: [230, 150, 60] },
  { name: "low-mid 250-800", low: 250, high: 800, color: [220, 210, 80] },
  { name: "mid 800-2k", low: 800, high: 2000, color: [90, 200, 110] },
  { name: "presence 2-5k", low: 2000, high: 5000, color: [70, 190, 220] },
  { name: "air 8k+", low: 8000, high: 20000, color: [150, 120, 240] },
];

const WINDOW = Math.round(RATE * 0.5);
const dbOf = (x: number): number => 20 * Math.log10(Math.max(x, 1e-6));

/** per half second: band levels in dB and the stereo correlation, drawn as two stacked charts with a grey tick at every segment start */
export async function plotFilm(film: Film, dir: string, out: string): Promise<void> {
  const audio = await decode(`${dir}/${film}.wav`);
  const mid = Float32Array.from(audio.l, (l, i) => (l + (audio.r[i] ?? 0)) / 2);
  const windows = Math.floor(mid.length / WINDOW);
  const levels = BANDS.map(({ low, high }) => {
    const band = lowpass(highpass(mid, low), high);
    return Array.from({ length: windows }, (_, w) => {
      let sum = 0;
      for (let i = w * WINDOW; i < (w + 1) * WINDOW; i += 1) sum += (band[i] ?? 0) ** 2;
      return dbOf(Math.sqrt(sum / WINDOW));
    });
  });
  const total = Array.from({ length: windows }, (_, w) => {
    let sum = 0;
    for (let i = w * WINDOW; i < (w + 1) * WINDOW; i += 1) sum += ((audio.l[i] ?? 0) ** 2 + (audio.r[i] ?? 0) ** 2) / 2;
    return dbOf(Math.sqrt(sum / WINDOW));
  });
  const corr = Array.from({ length: windows }, (_, w) => {
    let ab = 0;
    let aa = 0;
    let bb = 0;
    for (let i = w * WINDOW; i < (w + 1) * WINDOW; i += 1) {
      const [a, b] = [audio.l[i] ?? 0, audio.r[i] ?? 0];
      ab += a * b;
      aa += a * a;
      bb += b * b;
    }
    return ab / Math.max(Math.sqrt(aa * bb), 1e-12);
  });

  const [width, height] = [1800, 900];
  const canvas = new Canvas(width, height, [14, 14, 18]);
  const x = (w: number): number => 30 + ((width - 60) * w) / Math.max(1, windows - 1);
  const top = (db: number): number => 30 + ((-10 - db) / 70) * 480;
  for (let db = -10; db >= -80; db -= 10) canvas.line(30, top(db), width - 30, top(db), [38, 38, 46]);
  for (const start of SCORES[film].clock.starts) {
    const w = (SCORES[film].clock.at(start) * RATE) / WINDOW;
    canvas.line(x(w), 20, x(w), 520, [60, 60, 70]);
    canvas.line(x(w), 560, x(w), 880, [60, 60, 70]);
  }
  const draw = (series: number[], color: readonly number[], thick: number): void => {
    for (let w = 1; w < series.length; w += 1) canvas.line(x(w - 1), top(series[w - 1] ?? -80), x(w), top(series[w] ?? -80), color, thick);
  };
  for (const [i, band] of BANDS.entries()) draw(levels[i] as number[], band.color, 2);
  draw(total, [255, 255, 255], 3);
  const c = (v: number): number => 560 + ((1 - v) / 2) * 320;
  canvas.line(30, c(0), width - 30, c(0), [60, 60, 70]);
  canvas.line(30, c(0.5), width - 30, c(0.5), [38, 38, 46]);
  for (let w = 1; w < windows; w += 1) canvas.line(x(w - 1), c(corr[w - 1] ?? 0), x(w), c(corr[w] ?? 0), [120, 220, 140], 2);
  await Bun.write(`${out}/${film}-levels.png`, canvas.png());

  for (const name of ["master", "drums", "kicks", "bass", "music", "fx", "ui", "space"]) {
    const file = name === "master" ? `${dir}/${film}.wav` : `${dir}/stems/${film}-${name}.wav`;
    Bun.spawnSync([
      "ffmpeg",
      "-y",
      "-v",
      "error",
      "-i",
      file,
      "-lavfi",
      "showspectrumpic=s=1600x420:scale=log:fscale=log:legend=0:gain=1:drange=90:stop=20000",
      "-frames:v",
      "1",
      `${out}/${film}-${name}-spectrogram.png`,
    ]);
  }
  console.log(
    `  plots: ${out}/${film}-levels.png (white = total rms, bands red sub, orange bass, yellow low-mid, green mid, cyan presence, violet air; green below = stereo correlation) and ${film}-<stem>-spectrogram.png`,
  );
}
