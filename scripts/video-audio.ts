import { mkdirSync } from "node:fs";

// Placeholder score for the opening scene: bun scripts/video-audio.ts. 120 BPM, 6 s, 48 kHz stereo, no samples, no licence needed.
const RATE = 48_000;
const BPM = 120;
const SECONDS = 6;
const BEAT = 60 / BPM;
const OUT = "apps/video/public/audio/open.wav";

const frames = RATE * SECONDS;
const left = new Float32Array(frames);
const right = new Float32Array(frames);

let seed = 7;
const noise = (): number => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 2147483648 - 1;
};

function add(start: number, length: number, voice: (t: number) => number, gain: number, pan = 0): void {
  const from = Math.floor(start * RATE);
  const count = Math.floor(length * RATE);
  for (let i = 0; i < count && from + i < frames; i += 1) {
    const sample = voice(i / RATE) * gain;
    left[from + i] = (left[from + i] ?? 0) + sample * (1 - pan);
    right[from + i] = (right[from + i] ?? 0) + sample * (1 + pan);
  }
}

const kick = (t: number): number => Math.sin(2 * Math.PI * (48 + 110 * Math.exp(-t * 28)) * t) * Math.exp(-t * 7);
const sub = (t: number): number => Math.sin(2 * Math.PI * 42 * t) * Math.exp(-t * 2.2);
const hat = (t: number): number => noise() * Math.exp(-t * 90);
const tick = (t: number): number => Math.sin(2 * Math.PI * 2400 * t) * Math.exp(-t * 160);
const click = (t: number): number => (Math.sin(2 * Math.PI * 1500 * t) + noise() * 0.4) * Math.exp(-t * 220);
const pad = (t: number): number => (Math.sin(2 * Math.PI * 55 * t) + 0.4 * Math.sin(2 * Math.PI * 110.4 * t)) * 0.5;

const riser =
  (length: number) =>
  (t: number): number =>
    noise() * (t / length) ** 2.2 * Math.min(1, (length - t) / 0.02);
const whoosh = (t: number): number => noise() * Math.sin(Math.PI * Math.min(1, t / 0.5)) ** 2;

add(0, 0.05, tick, 0.5);
add(0, 6, pad, 0.07);
add(BEAT * 1, 0.1, tick, 0.4);
add(BEAT * 2, 0.1, tick, 0.4);
add(BEAT * 2.5, BEAT * 1.5, riser(BEAT * 1.5), 0.22);
for (let n = 3; n < 12; n += 1) add(BEAT * (n + 0.5), 0.08, hat, 0.12, n % 2 ? 0.3 : -0.3);
for (let n = 4; n < 12; n += 1) add(BEAT * n, 0.5, kick, 0.7);
add(BEAT * 4, 2.2, sub, 0.65);
add(BEAT * 4, 0.5, whoosh, 0.18);
add(BEAT * 5.5, 0.05, click, 0.5);
add(BEAT * 7, 0.05, click, 0.35);
add(BEAT * 9, 0.05, click, 0.35);

const peak = Math.max(...left.map(Math.abs), ...right.map(Math.abs));
const scale = 0.85 / peak;
const fade = Math.floor(RATE * 0.4);
const bytes = new DataView(new ArrayBuffer(44 + frames * 4));
const text = (offset: number, value: string): void => {
  for (const [i, char] of [...value].entries()) bytes.setUint8(offset + i, char.charCodeAt(0));
};
text(0, "RIFF");
bytes.setUint32(4, 36 + frames * 4, true);
text(8, "WAVEfmt ");
bytes.setUint32(16, 16, true);
bytes.setUint16(20, 1, true);
bytes.setUint16(22, 2, true);
bytes.setUint32(24, RATE, true);
bytes.setUint32(28, RATE * 4, true);
bytes.setUint16(32, 4, true);
bytes.setUint16(34, 16, true);
text(36, "data");
bytes.setUint32(40, frames * 4, true);
for (let i = 0; i < frames; i += 1) {
  const tail = Math.min(1, (frames - i) / fade);
  bytes.setInt16(44 + i * 4, Math.round((left[i] ?? 0) * scale * tail * 32767), true);
  bytes.setInt16(46 + i * 4, Math.round((right[i] ?? 0) * scale * tail * 32767), true);
}
mkdirSync("apps/video/public/audio", { recursive: true });
await Bun.write(OUT, bytes.buffer);
console.log(OUT);
