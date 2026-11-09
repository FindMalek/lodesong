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

const twiddles = new Map<number, { cos: Float64Array; sin: Float64Array }>();

export function fft(re: Float64Array, im: Float64Array, inverse = false): void {
  const n = re.length;
  let table = twiddles.get(n);
  if (!table) {
    const cos = new Float64Array(n / 2);
    const sin = new Float64Array(n / 2);
    for (let k = 0; k < n / 2; k += 1) {
      cos[k] = Math.cos((2 * Math.PI * k) / n);
      sin[k] = Math.sin((2 * Math.PI * k) / n);
    }
    table = { cos, sin };
    twiddles.set(n, table);
  }
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i] as number;
      re[i] = re[j] as number;
      re[j] = tr;
      const ti = im[i] as number;
      im[i] = im[j] as number;
      im[j] = ti;
    }
  }
  const sign = inverse ? 1 : -1;
  for (let size = 2; size <= n; size <<= 1) {
    const half = size / 2;
    const stride = n / size;
    for (let start = 0; start < n; start += size) {
      for (let k = 0; k < half; k += 1) {
        const wr = table.cos[k * stride] as number;
        const wi = sign * (table.sin[k * stride] as number);
        const a = start + k;
        const b = a + half;
        const tr = (re[b] as number) * wr - (im[b] as number) * wi;
        const ti = (re[b] as number) * wi + (im[b] as number) * wr;
        re[b] = (re[a] as number) - tr;
        im[b] = (im[a] as number) - ti;
        re[a] = (re[a] as number) + tr;
        im[a] = (im[a] as number) + ti;
      }
    }
  }
  if (inverse)
    for (let i = 0; i < n; i += 1) {
      re[i] = (re[i] as number) / n;
      im[i] = (im[i] as number) / n;
    }
}

/** stereo convolution with one complex FFT per signal: left rides in the real part, right in the imaginary part */
export function convolve(signal: Stereo, ir: Stereo, length: number): Stereo {
  let size = 1;
  while (size < signal.l.length + ir.l.length) size <<= 1;
  const xr = new Float64Array(size);
  const xi = new Float64Array(size);
  const hr = new Float64Array(size);
  const hi = new Float64Array(size);
  xr.set(signal.l);
  xi.set(signal.r);
  hr.set(ir.l);
  hi.set(ir.r);
  fft(xr, xi);
  fft(hr, hi);
  const yr = new Float64Array(size);
  const yi = new Float64Array(size);
  for (let k = 0; k < size; k += 1) {
    const m = (size - k) % size;
    const [ar, ai, br, bi] = [xr[k] as number, xi[k] as number, xr[m] as number, xi[m] as number];
    const [cr, ci, dr, di] = [hr[k] as number, hi[k] as number, hr[m] as number, hi[m] as number];
    const xlr = (ar + br) / 2;
    const xli = (ai - bi) / 2;
    const xrr = (ai + bi) / 2;
    const xri = -(ar - br) / 2;
    const hlr = (cr + dr) / 2;
    const hli = (ci - di) / 2;
    const hrr = (ci + di) / 2;
    const hri = -(cr - dr) / 2;
    const ylr = xlr * hlr - xli * hli;
    const yli = xlr * hli + xli * hlr;
    const yrr = xrr * hrr - xri * hri;
    const yri = xrr * hri + xri * hrr;
    yr[k] = ylr - yri;
    yi[k] = yli + yrr;
  }
  fft(yr, yi, true);
  const out = stereo(length);
  for (let i = 0; i < length; i += 1) {
    out.l[i] = yr[i] ?? 0;
    out.r[i] = yi[i] ?? 0;
  }
  return out;
}

export interface ReverbShape {
  rt60: number;
  pre: number;
  bright: [number, number];
  early: number;
  seed: number;
  low: number;
}

/** an impulse response made from decaying noise that darkens as it dies, with early taps, decorrelated left and right */
export function makeIR(shape: ReverbShape): Stereo {
  const length = Math.round((shape.pre + shape.rt60 * 1.05) * RATE);
  const out = stereo(length);
  const common = rng(shape.seed + 999);
  const shared = Float32Array.from({ length }, () => common() * 2 - 1);
  for (const [c, channel] of [out.l, out.r].entries()) {
    const next = rng(shape.seed + c * 101);
    let state = 0;
    for (let i = 0; i < length; i += 1) {
      const t = i / RATE - shape.pre;
      if (t < 0) continue;
      const cutoff = shape.bright[0] * (shape.bright[1] / shape.bright[0]) ** Math.min(1, t / shape.rt60);
      const a = 1 - Math.exp((-2 * Math.PI * cutoff) / RATE);
      state += a * ((next() * 2 - 1) * 0.8 + (shared[i] ?? 0) * 0.5 - state);
      channel[i] = state * Math.exp((-6.9078 * t) / shape.rt60) * Math.min(1, t / 0.012);
    }
    const taps = rng(shape.seed + 7 + c);
    for (let k = 0; k < 9; k += 1) {
      const at = Math.round((shape.pre + 0.004 + taps() * 0.07) * RATE);
      channel[at] = (channel[at] ?? 0) + (taps() < 0.5 ? -1 : 1) * shape.early * (1 - k / 12) * 0.5;
    }
  }
  const out2 = { l: highpass(out.l, shape.low), r: highpass(out.r, shape.low) };
  let energy = 0;
  for (let i = 0; i < length; i += 1) energy += (out2.l[i] as number) ** 2 + (out2.r[i] as number) ** 2;
  const scale = 1 / Math.sqrt(energy / 2);
  for (let i = 0; i < length; i += 1) {
    out2.l[i] = (out2.l[i] as number) * scale;
    out2.r[i] = (out2.r[i] as number) * scale;
  }
  return out2;
}

export interface Compressor {
  threshold: number;
  ratio: number;
  attack: number;
  release: number;
  knee?: number;
  makeup?: number;
  /** listen to this signal instead of the input */
  key?: Stereo;
  /** share of the unprocessed signal kept (parallel compression) */
  mix?: number;
}

/** feed-forward compressor with a stereo-linked peak detector; returns the deepest gain reduction in dB */
export function compress(audio: Stereo, options: Compressor): number {
  const { threshold, ratio, knee = 6, makeup = 0 } = options;
  const key = options.key ?? audio;
  const attack = Math.exp(-1 / (options.attack * RATE));
  const release = Math.exp(-1 / (options.release * RATE));
  const mix = options.mix ?? 1;
  const post = dbGain(makeup);
  let env = 0;
  let deepest = 0;
  for (let i = 0; i < audio.l.length; i += 1) {
    const x = Math.max(Math.abs(key.l[i] ?? 0), Math.abs(key.r[i] ?? 0));
    env = x > env ? attack * env + (1 - attack) * x : release * env + (1 - release) * x;
    const level = 20 * Math.log10(Math.max(env, 1e-9));
    const over = level - threshold;
    const reduction =
      over <= -knee / 2 ? 0 : over >= knee / 2 ? over * (1 - 1 / ratio) : ((over + knee / 2) ** 2 / (2 * knee)) * (1 - 1 / ratio);
    deepest = Math.max(deepest, reduction);
    const gain = dbGain(-reduction) * post;
    audio.l[i] = (audio.l[i] ?? 0) * (mix * gain + (1 - mix));
    audio.r[i] = (audio.r[i] ?? 0) * (mix * gain + (1 - mix));
  }
  return deepest;
}

/** asymmetric tanh saturation: adds even and odd harmonics the way tape and tubes do */
export function saturate(audio: Stereo, drive: number, bias = 0.08): void {
  const offset = Math.tanh(bias);
  const norm = 1 / (drive * (1 - offset * offset));
  for (let i = 0; i < audio.l.length; i += 1) {
    audio.l[i] = (Math.tanh(drive * (audio.l[i] ?? 0) + bias) - offset) * norm;
    audio.r[i] = (Math.tanh(drive * (audio.r[i] ?? 0) + bias) - offset) * norm;
  }
}

export function lowShelf(audio: Stereo, hz: number, db: number): void {
  const extra = dbGain(db) - 1;
  const [lo, ro] = [lowpass(audio.l, hz), lowpass(audio.r, hz)];
  for (let i = 0; i < audio.l.length; i += 1) {
    audio.l[i] = (audio.l[i] ?? 0) + extra * (lo[i] ?? 0);
    audio.r[i] = (audio.r[i] ?? 0) + extra * (ro[i] ?? 0);
  }
}

export function highShelf(audio: Stereo, hz: number, db: number): void {
  const extra = dbGain(db) - 1;
  const [lo, ro] = [highpass(audio.l, hz), highpass(audio.r, hz)];
  for (let i = 0; i < audio.l.length; i += 1) {
    audio.l[i] = (audio.l[i] ?? 0) + extra * (lo[i] ?? 0);
    audio.r[i] = (audio.r[i] ?? 0) + extra * (ro[i] ?? 0);
  }
}

export function peakEq(audio: Stereo, hz: number, db: number, q: number): void {
  const extra = dbGain(db) - 1;
  const [lo, ro] = [bandpass(audio.l, hz, q), bandpass(audio.r, hz, q)];
  for (let i = 0; i < audio.l.length; i += 1) {
    audio.l[i] = (audio.l[i] ?? 0) + extra * (lo[i] ?? 0);
    audio.r[i] = (audio.r[i] ?? 0) + extra * (ro[i] ?? 0);
  }
}

/** a delay whose time follows the tempo; feedback bounces between the channels */
export function pingPong(send: Stereo, seconds: (sample: number) => number, feedback: number, damp: number): Stereo {
  const out = stereo(send.l.length);
  let lowL = 0;
  let lowR = 0;
  let smooth = seconds(0) * RATE;
  for (let n = 0; n < send.l.length; n += 1) {
    smooth += 0.0005 * (seconds(n) * RATE - smooth);
    const from = n - smooth;
    if (from < 1) continue;
    const i = Math.floor(from);
    const f = from - i;
    const read = (a: Float32Array): number => (a[i] ?? 0) * (1 - f) + (a[i + 1] ?? 0) * f;
    const input = (read(send.l) + read(send.r)) * 0.5;
    lowL += damp * (input + feedback * read(out.r) - lowL);
    lowR += damp * (feedback * read(out.l) - lowR);
    out.l[n] = lowL;
    out.r[n] = lowR;
  }
  return out;
}

/** short modulated delays that thicken a signal and spread it across the stereo field */
export function chorus(audio: Stereo, depthMs: number, rateHz: number, mix: number): Stereo {
  const out = stereo(audio.l.length);
  const base = 0.011 * RATE;
  for (let n = 0; n < audio.l.length; n += 1) {
    const sweepL = base + Math.sin(2 * Math.PI * rateHz * (n / RATE)) * depthMs * 0.001 * RATE;
    const sweepR = base + Math.sin(2 * Math.PI * rateHz * 1.13 * (n / RATE) + 2) * depthMs * 0.001 * RATE;
    const read = (a: Float32Array, d: number): number => {
      const from = n - d;
      if (from < 1) return 0;
      const i = Math.floor(from);
      return (a[i] ?? 0) * (1 - (from - i)) + (a[i + 1] ?? 0) * (from - i);
    };
    out.l[n] = (audio.l[n] ?? 0) * (1 - mix * 0.4) + read(audio.r, sweepL) * mix;
    out.r[n] = (audio.r[n] ?? 0) * (1 - mix * 0.4) + read(audio.l, sweepR) * mix;
  }
  return out;
}
