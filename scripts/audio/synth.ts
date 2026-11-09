import type { ScoreEvent, Track } from "../../apps/video/src/audio-plan";
import { bandpass, highpass, lowpass, midiHz, noiseBuffer, RATE, rng, type Stereo, sawBlep, seedOf, softClip, stereo } from "./dsp";

const secs = (s: number): number => Math.max(1, Math.round(s * RATE));
const TAU = 2 * Math.PI;

const mono = (wave: Float32Array, pan = 0, gain = 1): Stereo => {
  const out = stereo(wave.length);
  const angle = ((Math.min(1, Math.max(-1, pan)) + 1) * Math.PI) / 4;
  const [l, r] = [Math.cos(angle) * gain * Math.SQRT2, Math.sin(angle) * gain * Math.SQRT2];
  for (let i = 0; i < wave.length; i += 1) {
    out.l[i] = (wave[i] ?? 0) * l;
    out.r[i] = (wave[i] ?? 0) * r;
  }
  return out;
};

function peakNormalise(audio: Stereo): Stereo {
  let peak = 1e-9;
  for (let i = 0; i < audio.l.length; i += 1) peak = Math.max(peak, Math.abs(audio.l[i] ?? 0), Math.abs(audio.r[i] ?? 0));
  for (let i = 0; i < audio.l.length; i += 1) {
    audio.l[i] = (audio.l[i] ?? 0) / peak;
    audio.r[i] = (audio.r[i] ?? 0) / peak;
  }
  return audio;
}

function fadeEnds(audio: Stereo, tail: number): Stereo {
  const n = secs(tail);
  const length = audio.l.length;
  for (let i = 0; i < Math.min(n, length); i += 1) {
    const g = i / n;
    const j = length - 1 - i;
    audio.l[j] = (audio.l[j] ?? 0) * g;
    audio.r[j] = (audio.r[j] ?? 0) * g;
  }
  return audio;
}

const env = (t: number, tau: number): number => Math.exp(-t / tau);
const rise = (t: number, a: number): number => Math.min(1, t / a);

function kick(): Stereo {
  const n = secs(0.55);
  const body = new Float32Array(n);
  let phase = 0;
  let punchPhase = 0;
  const click = bandpass(noiseBuffer(n, 11), 3400, 0.9);
  for (let i = 0; i < n; i += 1) {
    const t = i / RATE;
    phase += (TAU * (52 + 175 * env(t, 0.016))) / RATE;
    punchPhase += (TAU * (110 + 420 * env(t, 0.009))) / RATE;
    const x = Math.sin(phase) * env(t, 0.105) + Math.sin(punchPhase) * env(t, 0.028) * 0.55 + (click[i] ?? 0) * env(t, 0.0022) * 0.5;
    body[i] = softClip(x * rise(t, 0.0006) * 1.5, 1.9);
  }
  return fadeEnds(peakNormalise(mono(lowpass(body, 11000))), 0.02);
}

function snare(roll: boolean, seed: number): Stereo {
  const n = secs(roll ? 0.16 : 0.3);
  const noise = highpass(lowpass(noiseBuffer(n, seed), 8500), 900);
  const crack = highpass(lowpass(noiseBuffer(n, seed + 1), 9000), 3800);
  const out = new Float32Array(n);
  let phase = 0;
  const k = roll ? 0.55 : 1;
  for (let i = 0; i < n; i += 1) {
    const t = i / RATE;
    phase += (TAU * (175 + 70 * env(t, 0.02))) / RATE;
    const body = Math.sin(phase) * env(t, 0.055 * k) * 0.8 + Math.sin(phase * 1.83) * env(t, 0.03 * k) * 0.25;
    const air = (noise[i] ?? 0) * (0.75 * env(t, 0.045 * k) + 0.3 * env(t, 0.17 * k));
    out[i] = softClip((body + air + (crack[i] ?? 0) * env(t, 0.003) * 0.5) * rise(t, 0.0005), 1.6);
  }
  return fadeEnds(peakNormalise(mono(out)), 0.02);
}

function clap(seed: number): Stereo {
  const n = secs(0.34);
  const out = stereo(n);
  for (const [c, ch] of [out.l, out.r].entries()) {
    const noise = bandpass(noiseBuffer(n, seed + c * 7), 1250, 1.1);
    for (let i = 0; i < n; i += 1) {
      const t = i / RATE;
      let burst = 0;
      for (const at of [0, 0.011, 0.021, 0.033]) burst += t >= at ? env(t - at, 0.004) : 0;
      ch[i] = (noise[i] ?? 0) * (burst * 0.8 + (t >= 0.033 ? env(t - 0.033, 0.07) : 0));
    }
  }
  return fadeEnds(peakNormalise(out), 0.03);
}

const METAL = [205.3, 304.4, 369.6, 522.7, 540, 800];

function hat(open: boolean, seed: number): Stereo {
  const n = secs(open ? 0.34 : 0.1);
  const noise = highpass(noiseBuffer(n, seed), 8000);
  const metal = new Float32Array(n);
  for (const f of METAL) {
    const hz = f * 1.6;
    for (let i = 0; i < n; i += 1) metal[i] = (metal[i] ?? 0) + (Math.sin(TAU * hz * (i / RATE)) > 0 ? 1 : -1) * 0.16;
  }
  const bright = highpass(metal, 7000);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const t = i / RATE;
    out[i] = ((noise[i] ?? 0) * 0.75 + (bright[i] ?? 0) * 0.25) * env(t, open ? 0.1 : 0.022) * rise(t, 0.0002);
  }
  return fadeEnds(peakNormalise(mono(lowpass(out, 11500))), open ? 0.04 : 0.02);
}

function shaker(seed: number): Stereo {
  const n = secs(0.09);
  const noise = bandpass(noiseBuffer(n, seed), 7500, 0.8);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const t = i / RATE;
    out[i] = (noise[i] ?? 0) * Math.min(1, t / 0.006) * env(t, 0.022);
  }
  return fadeEnds(peakNormalise(mono(out)), 0.02);
}

function tom(midi: number, seed: number): Stereo {
  const n = secs(0.5);
  const click = highpass(noiseBuffer(n, seed), 2500);
  const out = new Float32Array(n);
  let phase = 0;
  const base = midiHz(midi - 24);
  for (let i = 0; i < n; i += 1) {
    const t = i / RATE;
    phase += (TAU * base * (1 + 0.9 * env(t, 0.035))) / RATE;
    out[i] = softClip((Math.sin(phase) * env(t, 0.19) + (click[i] ?? 0) * env(t, 0.003) * 0.4) * rise(t, 0.0006), 1.4);
  }
  return fadeEnds(peakNormalise(mono(out)), 0.03);
}

function crash(style: string | undefined, seed: number): Stereo {
  const length = style === "drop" ? 3 : 1.8;
  const n = secs(length);
  const out = stereo(n);
  for (const [c, ch] of [out.l, out.r].entries()) {
    const noise = noiseBuffer(n, seed + c * 3);
    const shine = highpass(noise, 2800);
    const bands = [4300, 6200, 8100, 10500].map((f) => bandpass(noise, f, 4));
    for (let i = 0; i < n; i += 1) {
      const t = i / RATE;
      const ring = (bands[0]?.[i] ?? 0) + (bands[1]?.[i] ?? 0) + (bands[2]?.[i] ?? 0) + (bands[3]?.[i] ?? 0);
      ch[i] = ((shine[i] ?? 0) * 0.5 + ring * 1.2) * rise(t, 0.003) * (0.7 * env(t, length * 0.14) + 0.4 * env(t, length * 0.45));
    }
  }
  return fadeEnds(peakNormalise(out), 0.1);
}

function sub(midi: number, dur: number, soft: boolean): Stereo {
  const n = secs(dur + 0.08);
  const out = new Float32Array(n);
  const hz = midiHz(midi);
  let phase = 0;
  for (let i = 0; i < n; i += 1) {
    const t = i / RATE;
    phase += (TAU * hz) / RATE;
    const a = rise(t, soft ? 0.06 : 0.006);
    const r = t > dur ? Math.max(0, 1 - (t - dur) / 0.08) : 1;
    out[i] = softClip(Math.sin(phase) * 1.2 + Math.sin(phase * 2) * 0.16, 1.4) * a * r;
  }
  return mono(out);
}

function bass(midi: number, dur: number): Stereo {
  const n = secs(dur + 0.06);
  const hz = midiHz(midi);
  const saw = new Float32Array(n);
  const fund = new Float32Array(n);
  let p1 = 0;
  let p2 = 0.37;
  let ps = 0;
  const dt = hz / RATE;
  for (let i = 0; i < n; i += 1) {
    p1 = (p1 + dt * 0.997) % 1;
    p2 = (p2 + dt * 1.003) % 1;
    ps += (TAU * hz) / RATE;
    saw[i] = (sawBlep(p1, dt) + sawBlep(p2, dt)) * 0.5;
    fund[i] = Math.sin(ps);
  }
  const body = lowpass(saw, (i) => 220 + 1900 * env(i / RATE, 0.11), 1.3);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const t = i / RATE;
    const g = rise(t, 0.004) * (t > dur ? Math.max(0, 1 - (t - dur) / 0.06) : 1);
    out[i] = softClip((fund[i] ?? 0) * 0.95 + (body[i] ?? 0) * 0.5, 1.5) * g;
  }
  return mono(out);
}

const DETUNE = [-1, -0.55, -0.18, 0.18, 0.55, 1];

/** detuned saws spread over the stereo field */
function supersaw(
  midi: number,
  dur: number,
  opts: { a: number; r: number; spread: number; voices: number; seed: number; sub?: number },
): Stereo {
  const n = secs(dur);
  const out = stereo(n);
  const hz = midiHz(midi);
  const next = rng(opts.seed);
  for (let v = 0; v < opts.voices; v += 1) {
    const cents = (DETUNE[v % DETUNE.length] as number) * opts.spread;
    const f = hz * 2 ** (cents / 1200);
    const dt = f / RATE;
    let phase = next();
    const side = opts.voices === 1 ? 0 : (v / (opts.voices - 1)) * 2 - 1;
    const angle = ((side * 0.5 + 1) * Math.PI) / 4;
    const [gl, gr] = [Math.cos(angle), Math.sin(angle)];
    for (let i = 0; i < n; i += 1) {
      phase += dt;
      if (phase >= 1) phase -= 1;
      const s = sawBlep(phase, dt);
      out.l[i] = (out.l[i] ?? 0) + s * gl;
      out.r[i] = (out.r[i] ?? 0) + s * gr;
    }
  }
  const scale = 1 / Math.sqrt(opts.voices);
  const subHz = hz / 2;
  for (let i = 0; i < n; i += 1) {
    const t = i / RATE;
    const g = Math.min(1, t / opts.a) ** 1.5 * (t > dur - opts.r ? Math.max(0, (dur - t) / opts.r) ** 1.5 : 1) * scale;
    const s = opts.sub ? Math.sin(TAU * subHz * t) * opts.sub : 0;
    out.l[i] = ((out.l[i] ?? 0) + s) * g;
    out.r[i] = ((out.r[i] ?? 0) + s) * g;
  }
  return out;
}

function lead(midi: number, dur: number, a: number, seed: number): Stereo {
  const tail = 0.14;
  const total = dur + tail;
  const raw = supersaw(midi, total, { a: Math.max(a, 0.008), r: tail, spread: 11, voices: 4, seed, sub: 0.35 });
  const n = raw.l.length;
  const hz = midiHz(midi);
  const cut = (i: number): number => Math.min(7000, Math.max(700, hz * 2 + 2200 * env(i / RATE, 0.28)));
  const out = { l: lowpass(raw.l, cut, 0.9), r: lowpass(raw.r, cut, 0.9) };
  for (let i = 0; i < n; i += 1) {
    const t = i / RATE;
    const wob = 1 + 0.12 * Math.min(1, Math.max(0, (t - 0.18) / 0.3)) * Math.sin(TAU * 5.3 * t);
    out.l[i] = (out.l[i] ?? 0) * wob;
    out.r[i] = (out.r[i] ?? 0) * wob;
  }
  return out;
}

function pluck(midi: number, dur: number, bright: number, seed: number): Stereo {
  const n = secs(Math.max(0.2, dur) + 0.12);
  const raw = supersaw(midi, n / RATE, { a: 0.001, r: 0.05, spread: 9, voices: 3, seed });
  const cut = (i: number): number => 320 + bright * 2300 * env(i / RATE, 0.075);
  const out = { l: lowpass(raw.l, cut, 1.6), r: lowpass(raw.r, cut, 1.6) };
  for (let i = 0; i < n; i += 1) {
    const g = env(i / RATE, 0.24 + dur * 0.4) * rise(i / RATE, 0.0012);
    out.l[i] = (out.l[i] ?? 0) * g;
    out.r[i] = (out.r[i] ?? 0) * g;
  }
  return out;
}

function stab(midi: number, dur: number, seed: number): Stereo {
  const raw = supersaw(midi, Math.max(0.2, dur) + 0.06, { a: 0.003, r: 0.06, spread: 16, voices: 5, seed });
  const cut = (i: number): number => 500 + 2500 * env(i / RATE, 0.1);
  const out = { l: lowpass(raw.l, cut, 0.9), r: lowpass(raw.r, cut, 0.9) };
  for (let i = 0; i < out.l.length; i += 1) {
    const g = env(i / RATE, 0.16);
    out.l[i] = (out.l[i] ?? 0) * g;
    out.r[i] = (out.r[i] ?? 0) * g;
  }
  return out;
}

/** two-operator FM bell: inharmonic modulator whose index dies away, with a detuned pair for width */
function bellVoice(midi: number, length: number, ratio = 3.5): Stereo {
  const n = secs(length);
  const out = stereo(n);
  const hz = midiHz(midi);
  for (const [c, ch] of [out.l, out.r].entries()) {
    const f = hz * (c === 0 ? 0.9997 : 1.0003);
    for (let i = 0; i < n; i += 1) {
      const t = i / RATE;
      const index = 0.3 + 1.9 * env(t, 0.28);
      const car = Math.sin(TAU * f * t + index * Math.sin(TAU * f * ratio * t));
      const partial = Math.sin(TAU * f * 2.003 * t) * 0.3 * env(t, 0.5) + Math.sin(TAU * f * 5.4 * t) * 0.03 * env(t, 0.1);
      ch[i] = (car * env(t, 1.7) + partial) * rise(t, 0.0012);
    }
  }
  return fadeEnds(out, 0.15);
}

/** electric piano: bell-like tine over a warm FM body, with a slow auto-pan */
function keys(midi: number, dur: number): Stereo {
  const length = Math.min(3.2, Math.max(0.9, dur + 0.5));
  const n = secs(length);
  const out = stereo(n);
  const hz = midiHz(midi);
  for (const [c, ch] of [out.l, out.r].entries()) {
    const f = hz * (c === 0 ? 0.9998 : 1.0002);
    for (let i = 0; i < n; i += 1) {
      const t = i / RATE;
      const body = Math.sin(TAU * f * t + (1.5 * env(t, 0.45) + 0.25) * Math.sin(TAU * f * t));
      const tine = Math.sin(TAU * f * 14 * t) * 0.035 * env(t, 0.03);
      const hold = t < dur ? 1 : env(t - dur, 0.28);
      const pan = 1 + 0.08 * Math.sin(TAU * 4.2 * t + c * Math.PI);
      ch[i] = (body * env(t, 1.1) + tine) * hold * pan * rise(t, 0.002);
    }
  }
  return fadeEnds(out, 0.1);
}

function riser(dur: number, midi: number, seed: number): Stereo {
  const n = secs(dur);
  const out = stereo(n);
  const noise = noiseBuffer(n, seed);
  const sweepA = bandpass(noise, (i) => 300 * (11000 / 300) ** (i / n), 2.1);
  const air = highpass(noiseBuffer(n, seed + 1), 5200);
  let gate = 0;
  let pitch = 0;
  let pitch2 = 0.4;
  const hz0 = midiHz(midi);
  for (let i = 0; i < n; i += 1) {
    const u = i / n;
    gate += (4 + 28 * u * u) / RATE;
    const pulse = 0.65 + 0.35 * Math.cos(TAU * gate);
    const hz = hz0 * 4 ** u;
    pitch = (pitch + hz / RATE) % 1;
    pitch2 = (pitch2 + (hz * 1.006) / RATE) % 1;
    const tone = (sawBlep(pitch, hz / RATE) + sawBlep(pitch2, (hz * 1.006) / RATE)) * 0.5;
    const level = u ** 2.3;
    const s = (sweepA[i] ?? 0) * pulse * level * 1.1 + (air[i] ?? 0) * level * level * 0.22;
    out.l[i] = s + tone * level * 0.24;
    out.r[i] = s * 0.92 + tone * level * 0.24 * 0.9;
  }
  const bright = { l: lowpass(out.l, (i) => 500 + 7500 * (i / n) ** 2), r: lowpass(out.r, (i) => 500 + 7500 * (i / n) ** 2) };
  return fadeEnds(peakNormalise(bright), 0.003);
}

function reverseCymbal(dur: number, seed: number): Stereo {
  const n = secs(dur);
  const out = stereo(n);
  for (const [c, ch] of [out.l, out.r].entries()) {
    const noise = highpass(noiseBuffer(n, seed + c), 3000);
    const ring = bandpass(noiseBuffer(n, seed + 9 + c), 6800, 3);
    for (let i = 0; i < n; i += 1) {
      const u = i / n;
      ch[i] = ((noise[i] ?? 0) * 0.6 + (ring[i] ?? 0) * 1.2) * u ** 3.2;
    }
  }
  return fadeEnds(peakNormalise(out), 0.002);
}

function whoosh(dur: number, seed: number): Stereo {
  const n = secs(dur);
  const noise = noiseBuffer(n, seed);
  const sweep = bandpass(noise, (i) => 400 * (5200 / 400) ** (Math.sin((Math.PI * i) / n / 2) ** 1.6), 1.2);
  const out = stereo(n);
  for (let i = 0; i < n; i += 1) {
    const shape = Math.sin((Math.PI * i) / n) ** 2;
    const pan = -0.7 + (1.4 * i) / n;
    const angle = ((pan + 1) * Math.PI) / 4;
    out.l[i] = (sweep[i] ?? 0) * shape * Math.cos(angle);
    out.r[i] = (sweep[i] ?? 0) * shape * Math.sin(angle);
  }
  return peakNormalise(out);
}

function downlifter(dur: number, midi: number, seed: number): Stereo {
  const n = secs(dur);
  const noise = bandpass(noiseBuffer(n, seed), (i) => 7000 * (220 / 7000) ** Math.min(1, (i / n) * 1.3), 1.6);
  const out = stereo(n);
  let phase = 0;
  for (let i = 0; i < n; i += 1) {
    const u = i / n;
    phase += (TAU * midiHz(midi + 12) * 2 ** (-1.4 * u)) / RATE;
    const g = (1 - u) ** 1.6 * rise(i / RATE, 0.01);
    out.l[i] = ((noise[i] ?? 0) * 0.9 + Math.sin(phase) * 0.35) * g;
    out.r[i] = ((noise[i] ?? 0) * 0.82 + Math.sin(phase) * 0.35) * g;
  }
  return peakNormalise(out);
}

function impact(style: string | undefined, dur: number, midi: number, seed: number): Stereo {
  const big = style === "drop" || style === "final";
  const medium = style === "hit";
  const n = secs(dur);
  const out = stereo(n);
  const sub = new Float32Array(n);
  let phase = 0;
  const thump = lowpass(noiseBuffer(n, seed), 240);
  const mid = bandpass(noiseBuffer(n, seed + 1), 1100, 1);
  const tau = big ? 1.5 : medium ? 0.7 : 0.3;
  for (let i = 0; i < n; i += 1) {
    const t = i / RATE;
    phase += (TAU * (31 + 34 * env(t, 0.09))) / RATE;
    const boom = Math.sin(phase) * env(t, tau) * rise(t, 0.003);
    sub[i] = boom;
    const hit = (thump[i] ?? 0) * env(t, 0.07) * 1.6 + (mid[i] ?? 0) * env(t, 0.012) * 0.7;
    out.l[i] = boom * 1.1 + hit;
    out.r[i] = boom * 1.1 + hit;
  }
  if (big) {
    for (const [semi, pan] of [
      [0, -0.35],
      [7, 0.35],
      [12, 0],
    ] as const) {
      const hz = midiHz(midi + semi + (midi < 40 ? 12 : 0));
      const stack = supersaw(midi + semi + (midi < 40 ? 12 : 0), n / RATE, { a: 0.006, r: 0.4, spread: 20, voices: 5, seed: seed + semi });
      const cut = (i: number): number => Math.max(200, Math.min(hz * 6, 150 + 2200 * env(i / RATE - 0.02, 0.35)));
      const l = lowpass(stack.l, cut, 1.2);
      const r = lowpass(stack.r, cut, 1.2);
      const angle = ((pan + 1) * Math.PI) / 4;
      for (let i = 0; i < n; i += 1) {
        const g = env(i / RATE, 1.1) * 0.5;
        out.l[i] = (out.l[i] ?? 0) + (l[i] ?? 0) * g * Math.cos(angle) * 1.3;
        out.r[i] = (out.r[i] ?? 0) + (r[i] ?? 0) * g * Math.sin(angle) * 1.3;
      }
    }
  }
  if (big || medium) {
    const shine = bellVoice(midi + (midi < 40 ? 36 : 24), Math.min(dur, 3.5));
    for (let i = 0; i < shine.l.length && i < n; i += 1) {
      out.l[i] = (out.l[i] ?? 0) + (shine.l[i] ?? 0) * 0.25;
      out.r[i] = (out.r[i] ?? 0) + (shine.r[i] ?? 0) * 0.25;
    }
  }
  return fadeEnds(peakNormalise(out), 0.1);
}

function thock(seed: number, body: number): Float32Array {
  const n = secs(0.2);
  const noise = noiseBuffer(n, seed);
  const click = bandpass(noise, 2400, 2.2);
  const high = bandpass(noise, 5200, 3);
  const out = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i += 1) {
    const t = i / RATE;
    phase += (TAU * (body + 90 * env(t, 0.012))) / RATE;
    out[i] =
      (Math.sin(phase) * env(t, 0.034) * 0.85 + (click[i] ?? 0) * env(t, 0.0035) * 1.6 + (high[i] ?? 0) * env(t, 0.002) * 0.8) *
      rise(t, 0.0005);
  }
  return out;
}

function sweepUp(dur: number, from: number, to: number, seed: number): Float32Array {
  const n = secs(dur);
  const noise = bandpass(noiseBuffer(n, seed), (i) => from * (to / from) ** (i / n), 2);
  return noise.map((x, i) => x * (i / n) ** 2.2);
}

function ui(kind: string, midi: number, seed: number): Stereo {
  const hz = midiHz(midi);
  const plain = (wave: Float32Array, pan = 0): Stereo => fadeEnds(peakNormalise(mono(lowpass(wave, 7500), pan)), 0.01);
  switch (kind) {
    case "key":
      return plain(thock(seed, 190));
    case "enter":
      return fadeEnds(
        peakNormalise(
          sum([mono(thock(seed, 140)), delayed(bellVoice(midi, 1.2, 2), 0.04, 0.5), delayed(bellVoice(midi + 7, 1.4, 2), 0.1, 0.45)]),
        ),
        0.05,
      );
    case "type": {
      const n = secs(0.16);
      const noise = highpass(noiseBuffer(n, seed), 4500);
      return plain(
        Float32Array.from({ length: n }, (_, i) => {
          const t = i / RATE;
          return (
            (Math.sin(TAU * hz * t) * env(t, 0.04) +
              Math.sin(TAU * hz * 3 * t) * env(t, 0.01) * 0.12 +
              (noise[i] ?? 0) * env(t, 0.0015) * 0.1) *
            rise(t, 0.0004)
          );
        }),
      );
    }
    case "click": {
      const n = secs(0.12);
      const noise = bandpass(noiseBuffer(n, seed), 3000, 1.4);
      return plain(
        Float32Array.from(
          { length: n },
          (_, i) =>
            ((noise[i] ?? 0) * env(i / RATE, 0.002) + Math.sin(TAU * 240 * (i / RATE)) * env(i / RATE, 0.02) * 0.4) *
            rise(i / RATE, 0.0004),
        ),
      );
    }
    case "row": {
      const n = secs(0.1);
      const noise = highpass(noiseBuffer(n, seed), 5000);
      return plain(
        Float32Array.from({ length: n }, (_, i) => {
          const t = i / RATE;
          return (Math.sin(TAU * hz * 2 * t) * env(t, 0.014) + (noise[i] ?? 0) * env(t, 0.0015) * 0.3) * rise(t, 0.0004);
        }),
      );
    }
    case "line":
      return fadeEnds(peakNormalise(keys(midi, 0.3)), 0.05);
    case "tile":
      return fadeEnds(
        peakNormalise(sum([bellVoice(midi + 12, 1.6, 4.1), mono(highpass(sweepUp(0.35, 4000, 12000, seed), 3000), 0, 0.4)])),
        0.05,
      );
    case "chip":
      return fadeEnds(peakNormalise(bellVoice(midi + 12, 1.2, 3.1)), 0.05);
    case "device":
      return fadeEnds(peakNormalise(sum([bellVoice(midi, 1.4), delayed(bellVoice(midi + 7, 1.6), 0.11, 0.8)])), 0.05);
    case "ignite":
      return fadeEnds(
        peakNormalise(
          sum([
            bellVoice(midi, 2.4),
            bellVoice(midi + 4, 2.4),
            bellVoice(midi + 7, 2.4),
            bellVoice(midi + 12, 2.6),
            mono(sweepUp(0.5, 500, 9000, seed), 0, 1.2),
          ]),
        ),
        0.1,
      );
    case "seek": {
      const n = secs(0.3);
      const noise = bandpass(noiseBuffer(n, seed), (i) => 9000 * (900 / 9000) ** (i / n), 2.2);
      return plain(
        Float32Array.from({ length: n }, (_, i) => (noise[i] ?? 0) * env(i / RATE, 0.07) * rise(i / RATE, 0.0005)),
        0.2,
      );
    }
    case "draw": {
      const n = secs(0.3);
      const noise = bandpass(noiseBuffer(n, seed), (i) => 2000 + 4000 * (i / n), 3);
      return plain(
        Float32Array.from(
          { length: n },
          (_, i) => (noise[i] ?? 0) * Math.sin((Math.PI * i) / n) ** 2 + Math.sin(TAU * 3200 * (i / RATE)) * env(i / RATE, 0.006) * 0.4,
        ),
      );
    }
    case "flash": {
      const n = secs(0.18);
      const noise = highpass(noiseBuffer(n, seed), 3500);
      let phase = 0;
      return plain(
        Float32Array.from({ length: n }, (_, i) => {
          const t = i / RATE;
          phase += (TAU * (200 + 400 * env(t, 0.02))) / RATE;
          return (Math.sin(phase) * env(t, 0.04) * 0.7 + (noise[i] ?? 0) * env(t, 0.03)) * rise(t, 0.0004);
        }),
      );
    }
    default:
      return plain(thock(seed, 190));
  }
}

function delayed(audio: Stereo, seconds: number, gain: number): Stereo {
  const d = secs(seconds);
  const out = stereo(audio.l.length + d);
  for (let i = 0; i < audio.l.length; i += 1) {
    out.l[i + d] = (audio.l[i] ?? 0) * gain;
    out.r[i + d] = (audio.r[i] ?? 0) * gain;
  }
  return out;
}

function sum(parts: Stereo[]): Stereo {
  const length = Math.max(...parts.map((p) => p.l.length));
  const out = stereo(length);
  for (const part of parts)
    for (let i = 0; i < part.l.length; i += 1) {
      out.l[i] = (out.l[i] ?? 0) + (part.l[i] ?? 0);
      out.r[i] = (out.r[i] ?? 0) + (part.r[i] ?? 0);
    }
  return out;
}

/** how loud each track plays against the others before the buses, as a linear gain on a unit-peak voice */
export const LEVELS: Record<Track, number> = {
  kick: 0.8,
  snare: 1.7,
  clap: 0.9,
  hat: 0.11,
  ohat: 0.11,
  tom: 0.45,
  shaker: 0.04,
  crash: 0.13,
  sub: 0.36,
  bass: 0.3,
  pad: 0.17,
  arp: 0.18,
  stab: 0.16,
  lead: 0.3,
  bell: 0.2,
  keys: 0.22,
  pluck: 0.2,
  riser: 0.3,
  impact: 0.8,
  whoosh: 0.2,
  down: 0.22,
  reverse: 0.28,
  ui: 0.3,
};

const cache = new Map<string, Stereo>();
const cached = (key: string, make: () => Stereo): Stereo => {
  const hit = cache.get(key);
  if (hit) return hit;
  const made = make();
  cache.set(key, made);
  return made;
};

/** the sound of one event as a stereo buffer with unit-ish peak; the caller places it and sets the gain */
export function voice(e: ScoreEvent, index: number): Stereo {
  const variant = index % 3;
  const seed = seedOf(`${e.track}:${e.style ?? ""}:${e.midi}:${variant}`);
  switch (e.track) {
    case "kick":
      return cached("kick", kick);
    case "snare":
      return cached(`snare:${e.style}:${variant}`, () => snare(e.style === "roll", seed));
    case "clap":
      return cached(`clap:${variant}`, () => clap(seed));
    case "hat":
    case "ohat":
      return cached(`${e.track}:${variant}`, () => hat(e.track === "ohat", seed));
    case "shaker":
      return cached(`shaker:${variant}`, () => shaker(seed));
    case "tom":
      return cached(`tom:${e.midi}:${variant}`, () => tom(e.midi, seed));
    case "crash":
      return cached(`crash:${e.style === "drop"}:${variant}`, () => crash(e.style, seed));
    case "sub":
      return sub(e.midi, e.dur, e.style === "long");
    case "bass":
      return bass(e.midi, e.dur);
    case "pad":
      return supersaw(e.midi, e.dur, {
        a: e.a ?? 0.3,
        r: Math.min(0.5, e.dur * 0.4),
        spread: e.style === "air" ? 26 : 19,
        voices: 6,
        seed,
      });
    case "arp":
      return pluck(e.midi, e.dur, 0.7, seed);
    case "pluck":
      return pluck(e.midi, e.dur, 1, seed);
    case "stab":
      return stab(e.midi, e.dur, seed);
    case "lead":
      return lead(e.midi, e.dur, e.a ?? 0.012, seed);
    case "bell":
      return cached(`bell:${e.midi}`, () => bellVoice(e.midi, 4));
    case "keys":
      return keys(e.midi, e.dur);
    case "riser":
      return riser(e.dur, e.midi, seed);
    case "reverse":
      return reverseCymbal(e.dur, seed);
    case "whoosh":
      return whoosh(e.dur, seed);
    case "down":
      return downlifter(e.dur, e.midi, seed);
    case "impact":
      return impact(e.style, e.dur, e.midi, seed);
    case "ui":
      return cached(`ui:${e.style}:${e.midi}:${variant}`, () => ui(e.style ?? "key", e.midi, seed));
  }
}
