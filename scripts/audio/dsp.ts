export const RATE = 48_000;

export interface Stereo {
  l: Float32Array;
  r: Float32Array;
}

export const stereo = (length: number): Stereo => ({ l: new Float32Array(length), r: new Float32Array(length) });

export const midiHz = (note: number): number => 440 * 2 ** ((note - 69) / 12);
export const dbGain = (db: number): number => 10 ** (db / 20);
export const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

export function seedOf(text: string): number {
  let hash = 2166136261;
  for (const char of text) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function noiseBuffer(length: number, seed: number): Float32Array {
  const next = rng(seed);
  return Float32Array.from({ length }, () => next() * 2 - 1);
}

export function mixIn(dst: Stereo, src: Float32Array, startSample: number, gain: number, pan: number): void {
  const angle = ((clamp01((pan + 1) / 2) * Math.PI) / 2) as number;
  const left = Math.cos(angle) * gain * Math.SQRT2;
  const right = Math.sin(angle) * gain * Math.SQRT2;
  const from = Math.max(0, -startSample);
  for (let i = from; i < src.length && startSample + i < dst.l.length; i += 1) {
    const at = startSample + i;
    const sample = src[i] ?? 0;
    dst.l[at] = (dst.l[at] ?? 0) + sample * left;
    dst.r[at] = (dst.r[at] ?? 0) + sample * right;
  }
}

export function addStereo(dst: Stereo, src: Stereo, startSample: number, gain: number): void {
  const from = Math.max(0, -startSample);
  for (let i = from; i < src.l.length && startSample + i < dst.l.length; i += 1) {
    const at = startSample + i;
    dst.l[at] = (dst.l[at] ?? 0) + (src.l[i] ?? 0) * gain;
    dst.r[at] = (dst.r[at] ?? 0) + (src.r[i] ?? 0) * gain;
  }
}

export type FilterKind = "lp" | "hp" | "bp";

export function filter(input: Float32Array, kind: FilterKind, cutoff: number | ((i: number) => number), q = Math.SQRT1_2): Float32Array {
  const out = new Float32Array(input.length);
  const k = 1 / q;
  let ic1 = 0;
  let ic2 = 0;
  const fixed = typeof cutoff === "number" ? Math.tan((Math.PI * Math.min(cutoff, RATE * 0.45)) / RATE) : 0;
  for (let i = 0; i < input.length; i += 1) {
    const g = typeof cutoff === "number" ? fixed : Math.tan((Math.PI * Math.min(Math.max(cutoff(i), 15), RATE * 0.45)) / RATE);
    const a1 = 1 / (1 + g * (g + k));
    const a2 = g * a1;
    const a3 = g * a2;
    const x = input[i] ?? 0;
    const v3 = x - ic2;
    const v1 = a1 * ic1 + a2 * v3;
    const v2 = ic2 + a2 * ic1 + a3 * v3;
    ic1 = 2 * v1 - ic1;
    ic2 = 2 * v2 - ic2;
    out[i] = kind === "lp" ? v2 : kind === "bp" ? v1 * k : x - k * v1 - v2;
  }
  return out;
}

export const lowpass = (input: Float32Array, hz: number | ((i: number) => number), q?: number): Float32Array => filter(input, "lp", hz, q);
export const highpass = (input: Float32Array, hz: number | ((i: number) => number), q?: number): Float32Array => filter(input, "hp", hz, q);
export const bandpass = (input: Float32Array, hz: number | ((i: number) => number), q?: number): Float32Array => filter(input, "bp", hz, q);

export function sawBlep(phase: number, dt: number): number {
  let value = 2 * phase - 1;
  if (phase < dt) {
    const t = phase / dt;
    value -= t + t - t * t - 1;
  } else if (phase > 1 - dt) {
    const t = (phase - 1) / dt;
    value -= t * t + t + t + 1;
  }
  return value;
}

export function softClip(x: number, drive: number): number {
  return Math.tanh(x * drive) / Math.tanh(drive);
}

export function reverb(send: Stereo, rt60: number, damp: number, preDelay: number, scale = 1): Stereo {
  const lengths = [1031, 1187, 1303, 1471, 1609, 1787, 1931, 2087].map((n) => Math.round(n * scale));
  const lines = lengths.map((n) => new Float32Array(n));
  const feedback = lengths.map((n) => 10 ** ((-3 * n) / (rt60 * RATE)));
  const heads = lengths.map(() => 0);
  const lowpassed = lengths.map(() => 0);
  const pre = Math.round(preDelay * RATE);
  const out = stereo(send.l.length);
  const taps = new Float64Array(8);
  const sign = [1, -1, 1, -1, -1, 1, -1, 1];
  for (let n = 0; n < send.l.length; n += 1) {
    const source = n >= pre ? ((send.l[n - pre] ?? 0) + (send.r[n - pre] ?? 0)) * 0.5 : 0;
    for (let i = 0; i < 8; i += 1) {
      const line = lines[i] as Float32Array;
      const read = line[heads[i] as number] ?? 0;
      lowpassed[i] = (lowpassed[i] as number) + damp * (read - (lowpassed[i] as number));
      taps[i] = (lowpassed[i] as number) * (feedback[i] as number);
    }
    for (let step = 1; step < 8; step *= 2) {
      for (let i = 0; i < 8; i += step * 2) {
        for (let j = i; j < i + step; j += 1) {
          const a = taps[j] as number;
          const b = taps[j + step] as number;
          taps[j] = a + b;
          taps[j + step] = a - b;
        }
      }
    }
    let left = 0;
    let right = 0;
    for (let i = 0; i < 8; i += 1) {
      const line = lines[i] as Float32Array;
      const head = heads[i] as number;
      const value = line[head] ?? 0;
      if (i % 2 === 0) left += value * (sign[i] as number);
      else right += value * (sign[i] as number);
      line[head] = (taps[i] as number) * 0.3535 + source * 0.35 * (sign[(i + 3) % 8] as number);
      heads[i] = (head + 1) % line.length;
    }
    out.l[n] = left * 0.5;
    out.r[n] = right * 0.5;
  }
  return out;
}

export function pingPong(send: Stereo, seconds: number, feedback: number, damp: number): Stereo {
  const delay = Math.round(seconds * RATE);
  const out = stereo(send.l.length);
  let lowL = 0;
  let lowR = 0;
  for (let n = delay; n < send.l.length; n += 1) {
    const input = ((send.l[n - delay] ?? 0) + (send.r[n - delay] ?? 0)) * 0.5;
    lowL += damp * (input + feedback * (out.r[n - delay] ?? 0) - lowL);
    lowR += damp * (feedback * (out.l[n - delay] ?? 0) - lowR);
    out.l[n] = lowL;
    out.r[n] = lowR;
  }
  return out;
}

export function limit(audio: Stereo, ceiling: number, radius = 220): void {
  const length = audio.l.length;
  const floorGain = new Float32Array(length).fill(1);
  for (let i = 0; i < length; i += 1) {
    const peak = Math.max(Math.abs(audio.l[i] ?? 0), Math.abs(audio.r[i] ?? 0));
    if (peak <= ceiling) continue;
    const need = ceiling / peak;
    for (let j = Math.max(0, i - radius); j <= Math.min(length - 1, i + radius); j += 1) {
      if (need < (floorGain[j] ?? 1)) floorGain[j] = need;
    }
  }
  const prefix = new Float64Array(length + 1);
  for (let i = 0; i < length; i += 1) prefix[i + 1] = (prefix[i] ?? 0) + (floorGain[i] ?? 1);
  for (let i = 0; i < length; i += 1) {
    const from = Math.max(0, i - radius);
    const to = Math.min(length, i + radius + 1);
    const gain = ((prefix[to] ?? 0) - (prefix[from] ?? 0)) / (to - from);
    audio.l[i] = (audio.l[i] ?? 0) * gain;
    audio.r[i] = (audio.r[i] ?? 0) * gain;
  }
}

export function peakOf(audio: Stereo): number {
  let peak = 0;
  for (let i = 0; i < audio.l.length; i += 1) peak = Math.max(peak, Math.abs(audio.l[i] ?? 0), Math.abs(audio.r[i] ?? 0));
  return peak;
}

export function wavBytes(audio: Stereo, seed: number): Uint8Array {
  const frames = audio.l.length;
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
  const dither = rng(seed);
  const quantise = (sample: number): number => {
    const noise = (dither() - dither()) / 32768;
    return Math.max(-32768, Math.min(32767, Math.round((sample + noise) * 32768)));
  };
  for (let i = 0; i < frames; i += 1) {
    bytes.setInt16(44 + i * 4, quantise(audio.l[i] ?? 0), true);
    bytes.setInt16(46 + i * 4, quantise(audio.r[i] ?? 0), true);
  }
  return new Uint8Array(bytes.buffer);
}
