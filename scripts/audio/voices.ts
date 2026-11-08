import type { SheetCue } from "../../apps/video/src/audio-cues";
import { bandpass, highpass, lowpass, midiHz, mixIn, noiseBuffer, RATE, rng, type Stereo, seedOf, softClip, stereo } from "./dsp";

export interface Voice {
  audio: Stereo;
  verb: number;
  echo: number;
}

const samples = (seconds: number): number => Math.round(seconds * RATE);
const tone = (length: number, fn: (t: number) => number): Float32Array => Float32Array.from({ length }, (_, i) => fn(i / RATE));
const decay = (t: number, tau: number): number => Math.exp(-t / tau);
const attack = (t: number, seconds: number): number => Math.min(1, t / seconds);

function panned(wave: Float32Array, pan: number, gain: number): Stereo {
  const out = stereo(wave.length);
  mixIn(out, wave, 0, gain, pan);
  return out;
}

function sum(...waves: Float32Array[]): Float32Array {
  const length = Math.max(...waves.map((w) => w.length));
  const out = new Float32Array(length);
  for (const wave of waves) for (let i = 0; i < wave.length; i += 1) out[i] = (out[i] ?? 0) + (wave[i] ?? 0);
  return out;
}

function gated(wave: Float32Array, fn: (t: number) => number): Float32Array {
  return wave.map((x, i) => x * fn(i / RATE));
}

function endFade(wave: Float32Array, seconds = 0.003): Float32Array {
  const fade = samples(seconds);
  return wave.map((x, i) => (i > wave.length - fade ? x * Math.max(0, (wave.length - i) / fade) : x));
}

export function kick(gain: number): Voice {
  const length = samples(0.6);
  const noise = highpass(noiseBuffer(length, 11), 1800);
  const body = tone(length, (t) => {
    const phase = 2 * Math.PI * (55 * t + 130 * 0.018 * (1 - Math.exp(-t / 0.018)));
    return Math.sin(phase) * decay(t, 0.26) * attack(t, 0.0008);
  });
  const click = gated(noise, (t) => decay(t, 0.0025) * 0.3);
  const out = sum(body, click).map((x) => softClip(x * 1.5, 1.3));
  return { audio: panned(out, 0, gain * 0.9), verb: 0, echo: 0 };
}

export function hat(gain: number, open: boolean, pan: number, seed: number): Voice {
  const length = samples(open ? 0.32 : 0.1);
  const noise = highpass(bandpass(noiseBuffer(length, seed), 9500, 0.7), 6500);
  const tau = open ? 0.09 : 0.02;
  return {
    audio: panned(
      gated(noise, (t) => decay(t, tau) * attack(t, 0.0006)),
      pan,
      gain * 0.5,
    ),
    verb: 0.12,
    echo: 0,
  };
}

export function hit(style: SheetCue["style"], gain: number, seed: number): Voice {
  const brand = style === "brand";
  const drop = style === "drop";
  const length = samples(brand ? 2.6 : drop ? 1.8 : 1.2);
  const subTau = brand ? 0.9 : drop ? 0.55 : 0.32;
  const subLevel = brand ? 0.75 : drop ? 0.85 : 0.55;
  const sub = tone(length, (t) => {
    const hz = 44 + 22 * Math.exp(-t / 0.045) + (brand ? 11 : 0);
    return Math.sin(2 * Math.PI * hz * t) * decay(t, subTau) * attack(t, 0.002) * subLevel;
  });
  const noise = noiseBuffer(length, seed);
  const mid = gated(bandpass(noise, brand ? 1500 : 1000, 1.1), (t) => decay(t, 0.012) * 0.65);
  const thump = tone(length, (t) => Math.sin(2 * Math.PI * (brand ? 440 : 180) * t) * decay(t, brand ? 0.09 : 0.05) * 0.25);
  const crash = drop ? gated(highpass(noise, 3500), (t) => decay(t, 0.3) * 0.16) : new Float32Array(0);
  return { audio: panned(sum(sub, mid, thump, crash), 0, gain * 0.9), verb: brand ? 0.5 : drop ? 0.35 : 0.22, echo: 0 };
}

const CHORD_GOLD = [53, 57, 60, 64, 72];
const CHORD_DROP = [45, 57, 64, 67, 71, 76];

function chordBloom(notes: number[], tau: number, length: number, level: number): Float32Array {
  const waves = notes.map((note, k) => {
    const hz = midiHz(note);
    return tone(length, (t) => {
      const wobble = 1 + 0.0009 * Math.sin(2 * Math.PI * (0.3 + 0.07 * k) * t);
      const x = Math.sin(2 * Math.PI * hz * wobble * t) + 0.35 * Math.sin(4 * Math.PI * hz * t) + 0.12 * Math.sin(6 * Math.PI * hz * t);
      return x * attack(t, 0.03) * decay(t, tau) * level;
    });
  });
  return lowpass(sum(...waves), 3200);
}

const BELL: readonly [number, number, number][] = [
  [1, 1, 1.8],
  [2.01, 0.5, 1.1],
  [3.02, 0.22, 0.65],
  [4.18, 0.12, 0.4],
  [5.43, 0.06, 0.25],
];

function bell(hz: number, length: number, seed: number): Float32Array {
  const body = tone(
    length,
    (t) =>
      BELL.reduce((acc, [ratio, amp, tau]) => acc + Math.sin(2 * Math.PI * hz * ratio * t) * amp * decay(t, tau), 0) * attack(t, 0.0015),
  );
  const click = gated(highpass(noiseBuffer(length, seed), 5000), (t) => decay(t, 0.002) * 0.12);
  return sum(body, click);
}

export function impact(style: SheetCue["style"], gain: number, seed: number): Voice {
  const drop = style === "drop";
  const length = samples(drop ? 4.2 : 3.6);
  const sub = tone(length, (t) => Math.sin(2 * Math.PI * 55 * t) * decay(t, drop ? 1.2 : 0.9) * attack(t, 0.006) * (drop ? 0.8 : 0.5));
  const chord = chordBloom(drop ? CHORD_DROP : CHORD_GOLD, drop ? 1.5 : 1.3, length, drop ? 0.13 : 0.15);
  const shimmer = bell(midiHz(drop ? 100 : 93), length, seed).map((x) => x * 0.14);
  const thud = gated(lowpass(noiseBuffer(length, seed + 1), 320), (t) => decay(t, 0.03) * 0.5);
  const crash = drop ? gated(highpass(noiseBuffer(length, seed + 2), 2600), (t) => decay(t, 0.5) * 0.14) : new Float32Array(0);
  return { audio: panned(sum(sub, chord, shimmer, thud, crash), 0, gain), verb: drop ? 0.5 : 0.65, echo: 0.25 };
}

export function ping(note: number, gain: number, pan: number, seed: number): Voice {
  return { audio: panned(bell(midiHz(note), samples(3.2), seed), pan, gain * 0.34), verb: 0.55, echo: 0.4 };
}

export function tick(note: number, gain: number, pan: number, seed: number): Voice {
  const hz = midiHz(note);
  const length = samples(0.09);
  const body = tone(
    length,
    (t) => Math.sin(2 * Math.PI * hz * (1 + 0.1 * Math.exp(-t / 0.004)) * t) * decay(t, 0.0085) * attack(t, 0.0004) * 0.8,
  );
  const grit = gated(highpass(noiseBuffer(length, seed), 5000), (t) => decay(t, 0.0015) * 0.18);
  return { audio: panned(lowpass(sum(body, grit), 9000), pan, gain * 0.34), verb: 0.18, echo: 0.1 };
}

export function key(style: SheetCue["style"], gain: number, seed: number): Voice {
  const next = rng(seed);
  const typed = style === "typed";
  const enter = style === "enter";
  const jitter = 1 + (next() - 0.5) * (typed ? 0.22 : 0.06);
  const length = samples(0.3);
  const noise = noiseBuffer(length, seed + 3);
  const bodyHz = (enter ? 135 : 190) * jitter;
  const body = tone(
    length,
    (t) => Math.sin(2 * Math.PI * (bodyHz + 90 * Math.exp(-t / 0.012)) * t) * decay(t, enter ? 0.06 : 0.034) * attack(t, 0.0006) * 0.85,
  );
  const clack = sum(
    gated(bandpass(noise, 2300 * jitter, 2.2), (t) => decay(t, 0.0035) * 1.2),
    gated(bandpass(noise, 5200 * jitter, 3), (t) => decay(t, 0.002) * 0.5),
  );
  const releaseAt = typed ? 0.055 : 0.078;
  const release = gated(bandpass(noise, 3200, 2.5), (t) => (t >= releaseAt ? decay(t - releaseAt, 0.0025) * 0.38 : 0));
  const thock = tone(length, (t) => (t >= releaseAt ? Math.sin(2 * Math.PI * 260 * t) * decay(t - releaseAt, 0.014) * 0.18 : 0));
  return { audio: panned(sum(body, clack, release, thock), 0, gain * 0.5), verb: 0.1, echo: 0 };
}

export function whoosh(length: number, gain: number, seed: number): Voice {
  const n = samples(length / 60);
  const noise = noiseBuffer(n, seed);
  const sweep = bandpass(noise, (i) => 350 * (5200 / 350) ** (Math.sin((Math.PI * i) / n / 2) ** 1.5), 1.1);
  const shaped = sweep.map((x, i) => x * Math.sin((Math.PI * i) / n) ** 2);
  const out = stereo(n);
  for (let i = 0; i < n; i += 1) {
    const pan = -0.6 + (1.2 * i) / n;
    const angle = ((pan + 1) * Math.PI) / 4;
    out.l[i] = (shaped[i] ?? 0) * Math.cos(angle) * 0.95;
    out.r[i] = (shaped[i] ?? 0) * Math.sin(angle) * 0.95;
  }
  for (let i = 0; i < n; i += 1) {
    out.l[i] = (out.l[i] ?? 0) * gain * 0.42;
    out.r[i] = (out.r[i] ?? 0) * gain * 0.42;
  }
  return { audio: out, verb: 0.3, echo: 0 };
}

export function riser(length: number, style: SheetCue["style"], gain: number, seed: number): Voice {
  const n = samples(length / 60);
  const quiet = style === "quiet";
  const noise = noiseBuffer(n, seed);
  const air = bandpass(noise, (i) => 300 * (8200 / 300) ** (i / n), 2.4);
  const rate = (u: number): number => 4 + 20 * u * u;
  let gatePhase = 0;
  const shaped = air.map((x, i) => {
    const u = i / n;
    gatePhase += rate(u) / RATE;
    const gate = 0.62 + 0.38 * Math.cos(2 * Math.PI * gatePhase);
    return x * gate * u ** 2.2 * (quiet ? 0.5 : 1);
  });
  const out = stereo(n);
  let phaseA = 0;
  let phaseB = 0;
  for (let i = 0; i < n; i += 1) {
    const u = i / n;
    const hz = (quiet ? 110 : 220) * 8 ** u;
    phaseA += (2 * Math.PI * hz) / RATE;
    phaseB += (2 * Math.PI * hz * 1.004) / RATE;
    const level = u ** 2.4 * (quiet ? 0.2 : 0.11);
    out.l[i] = ((shaped[i] ?? 0) * 0.6 + Math.sin(phaseA) * level) * gain * 0.55;
    out.r[i] = ((shaped[i] ?? 0) * 0.6 + Math.sin(phaseB) * level) * gain * 0.55;
  }
  const fade = samples(0.003);
  for (let i = Math.max(0, n - fade); i < n; i += 1) {
    const g = (n - i) / fade;
    out.l[i] = (out.l[i] ?? 0) * g;
    out.r[i] = (out.r[i] ?? 0) * g;
  }
  return { audio: out, verb: 0, echo: 0 };
}

export function swell(style: SheetCue["style"], length: number, gain: number, seed: number): Voice {
  const n = samples(length / 60);
  if (style === "bloom") {
    const tail = samples(2.4);
    const chord = chordBloom([53, 57, 60, 64, 69], 1.2, n + tail, 0.16);
    const open = lowpass(
      chord.map((x, i) => x * Math.min(1, i / samples(0.12))),
      (i) => 700 + 3600 * Math.min(1, i / samples(0.8)),
    );
    return { audio: panned(open, 0, gain), verb: 0.5, echo: 0.15 };
  }
  const noise = noiseBuffer(n, seed);
  if (style === "down") {
    const tail = samples(0.8);
    const down = bandpass(noiseBuffer(n + tail, seed), (i) => 7000 * (250 / 7000) ** Math.min(1, i / n), 1.6);
    const shaped = down.map((x, i) => x * (i < n ? (1 - i / n) ** 1.4 : 0) * 0.5);
    const glide = tone(n, (t) => Math.sin(2 * Math.PI * 880 * 0.125 ** (t / (n / RATE)) * t) * (1 - t / (n / RATE)) ** 2 * 0.05);
    return { audio: panned(sum(shaped, glide), 0, gain), verb: 0.3, echo: 0 };
  }
  const up = bandpass(noise, (i) => 800 * (7000 / 800) ** (i / n), 1.8);
  const shaped = endFade(up.map((x, i) => x * (i / n) ** 3 * 0.6));
  return { audio: panned(shaped, 0, gain * 0.9), verb: 0.1, echo: 0 };
}

export function render(cue: SheetCue, index: number): Voice {
  const seed = seedOf(`${cue.id}:${index}`);
  const note = cue.note ?? 81;
  const length = cue.length ?? 30;
  switch (cue.kind) {
    case "kick":
      return kick(cue.gain);
    case "hit":
      return hit(cue.style, cue.gain, seed);
    case "impact":
      return impact(cue.style, cue.gain, seed);
    case "ping":
      return ping(note, cue.gain, cue.pan, seed);
    case "tick":
      return tick(note, cue.gain, cue.pan, seed);
    case "key":
      return key(cue.style, cue.gain, seed);
    case "whoosh":
      return whoosh(length, cue.gain, seed);
    case "riser":
      return riser(length, cue.style, cue.gain, seed);
    case "swell":
      return swell(cue.style, length, cue.gain, seed);
  }
}
