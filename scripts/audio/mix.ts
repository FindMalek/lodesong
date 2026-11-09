import { MOODS, type Score, type ScoreEvent, type Track } from "../../apps/video/src/audio-plan";
import { FPS } from "../../apps/video/src/audio-tempo";
import {
  addStereo,
  chorus,
  compress,
  convolve,
  dbGain,
  highpass,
  highShelf,
  lowpass,
  lowShelf,
  makeIR,
  noiseBuffer,
  peakEq,
  pingPong,
  RATE,
  type ReverbShape,
  type Stereo,
  saturate,
  stereo,
} from "./dsp";
import { LEVELS, voice } from "./synth";

export interface Stems {
  drums: Stereo;
  bass: Stereo;
  music: Stereo;
  fx: Stereo;
  ui: Stereo;
  space: Stereo;
}

type Group = "kick" | "drums" | "hats" | "bass" | "pad" | "arp" | "lead" | "fx" | "ui";

const GROUP: Record<Track, Group> = {
  kick: "kick",
  snare: "drums",
  clap: "drums",
  tom: "drums",
  hat: "hats",
  ohat: "hats",
  shaker: "hats",
  sub: "bass",
  bass: "bass",
  pad: "pad",
  arp: "arp",
  stab: "arp",
  pluck: "arp",
  lead: "lead",
  bell: "lead",
  keys: "lead",
  crash: "fx",
  riser: "fx",
  impact: "fx",
  whoosh: "fx",
  down: "fx",
  reverse: "fx",
  ui: "ui",
};

const HALL: ReverbShape = { rt60: 3.4, pre: 0.022, bright: [6500, 1300], early: 0.3, seed: 4, low: 150 };
const ROOM: ReverbShape = { rt60: 0.5, pre: 0.003, bright: [12000, 3800], early: 0.5, seed: 21, low: 200 };
const PLATE: ReverbShape = { rt60: 1.5, pre: 0.008, bright: [15000, 6500], early: 0.15, seed: 33, low: 380 };

/** how much of each track goes to the hall, the room, the plate and the tempo delay */
const SENDS: Partial<Record<Track, { hall?: number; room?: number; plate?: number; delay?: number }>> = {
  pad: { hall: 0.22 },
  arp: { hall: 0.2, delay: 0.3 },
  pluck: { hall: 0.2, delay: 0.35 },
  stab: { hall: 0.24, delay: 0.15 },
  lead: { hall: 0.3, delay: 0.32 },
  bell: { hall: 0.5, delay: 0.4 },
  keys: { hall: 0.38, delay: 0.22 },
  snare: { hall: 0.1, room: 0.3 },
  clap: { hall: 0.18, room: 0.35 },
  tom: { hall: 0.12, room: 0.3 },
  hat: { room: 0.08 },
  ohat: { room: 0.1, hall: 0.05 },
  crash: { hall: 0.25 },
  impact: { hall: 0.6 },
  riser: { hall: 0.22 },
  whoosh: { hall: 0.25 },
  ui: { plate: 0.5, hall: 0.12 },
};

/** final balance between the buses, tuned against the stem loudness table */
const BUS_GAIN: Record<keyof Stems, number> = { drums: 0.9, bass: 0.92, music: 1.15, fx: 1, ui: 0.6, space: 0.55 };

const scaled = (audio: Stereo, gain: number): Stereo => {
  const out = stereo(audio.l.length);
  for (let i = 0; i < audio.l.length; i += 1) {
    out.l[i] = (audio.l[i] ?? 0) * gain;
    out.r[i] = (audio.r[i] ?? 0) * gain;
  }
  return out;
};

function interpolate(points: readonly [number, number][], length: number, log = false): Float32Array {
  const out = new Float32Array(length);
  let k = 0;
  for (let i = 0; i < length; i += 1) {
    const t = i / RATE;
    while (k + 1 < points.length && (points[k + 1] as [number, number])[0] <= t) k += 1;
    const a = points[k] as [number, number];
    const b = points[k + 1] ?? a;
    const u = b[0] === a[0] ? 0 : Math.min(1, Math.max(0, (t - a[0]) / (b[0] - a[0])));
    out[i] = log ? Math.exp(Math.log(a[1]) + (Math.log(b[1]) - Math.log(a[1])) * u) : a[1] + (b[1] - a[1]) * u;
  }
  return out;
}

function pumpEnvelope(score: Score, length: number): Float32Array {
  const env = new Float32Array(length);
  const tau = 0.105 * RATE;
  for (const e of score.events) {
    const strength = e.track === "kick" ? e.vel : e.track === "impact" ? 1.1 : e.track === "clap" ? 0.18 : 0;
    if (strength === 0) continue;
    const mood = MOODS[score.clock.segments[segmentAtTime(score, e.t)]?.mood ?? ""];
    const depth = e.track === "impact" ? 1 : (mood?.pump ?? 0.2);
    const start = Math.round(e.t * RATE);
    const span = Math.min(length - start, Math.round(tau * 5));
    for (let i = 0; i < span; i += 1) {
      const v = depth * strength * Math.exp(-i / tau) * Math.min(1, i / (0.003 * RATE));
      if (v > (env[start + i] ?? 0)) env[start + i] = v;
    }
  }
  return env;
}

function segmentAtTime(score: Score, t: number): number {
  let index = 0;
  for (const [i, start] of score.clock.starts.entries()) if (score.clock.at(start) <= t + 1e-6) index = i;
  return index;
}

function duck(audio: Stereo, env: Float32Array, depth: number): void {
  for (let i = 0; i < env.length; i += 1) {
    const g = Math.max(0, 1 - depth * (env[i] ?? 0));
    audio.l[i] = (audio.l[i] ?? 0) * g;
    audio.r[i] = (audio.r[i] ?? 0) * g;
  }
}

function place(dst: Stereo, e: ScoreEvent, src: Stereo): void {
  const start = Math.round(e.t * RATE);
  const gain = LEVELS[e.track] * e.vel;
  const angle = ((Math.min(1, Math.max(-1, e.pan)) + 1) * Math.PI) / 4;
  const [l, r] = e.pan === 0 ? [gain, gain] : [Math.cos(angle) * gain * Math.SQRT2, Math.sin(angle) * gain * Math.SQRT2];
  for (let i = 0; i < src.l.length && start + i < dst.l.length; i += 1) {
    dst.l[start + i] = (dst.l[start + i] ?? 0) + (src.l[i] ?? 0) * l;
    dst.r[start + i] = (dst.r[start + i] ?? 0) + (src.r[i] ?? 0) * r;
  }
}

/** The six stems that sum to the mix, plus the kicks alone: not part of the sum, only there so timing can be measured without snares, toms and claps in the way. */
export interface Mix {
  stems: Stems;
  kicks: Stereo;
}

export function mixScore(score: Score): Mix {
  const length = score.clock.totalFrames * (RATE / FPS);
  const groups = new Map<Group, Stereo>();
  const group = (g: Group): Stereo => {
    const hit = groups.get(g);
    if (hit) return hit;
    const made = stereo(length);
    groups.set(g, made);
    return made;
  };
  const sends = { hall: stereo(length), room: stereo(length), plate: stereo(length), delay: stereo(length) };

  for (const [index, e] of score.events.entries()) {
    const target = group(GROUP[e.track]);
    const src = voice(e, index);
    place(target, e, src);
    const s = SENDS[e.track];
    if (!s) continue;
    const start = Math.round(e.t * RATE);
    const gain = LEVELS[e.track] * e.vel;
    for (const key of ["hall", "room", "plate", "delay"] as const) {
      const amount = s[key];
      if (!amount) continue;
      const send = sends[key];
      for (let i = 0; i < src.l.length && start + i < length; i += 1) {
        send.l[start + i] = (send.l[start + i] ?? 0) + (src.l[i] ?? 0) * gain * amount;
        send.r[start + i] = (send.r[start + i] ?? 0) + (src.r[i] ?? 0) * gain * amount;
      }
    }
  }

  const pump = pumpEnvelope(score, length);
  const padCut = interpolate(score.curves.padCut, length, true);
  const padBus = group("pad");
  const warm = { l: lowpass(padBus.l, (i) => padCut[i] ?? 1000, 0.8), r: lowpass(padBus.r, (i) => padCut[i] ?? 1000, 0.8) };
  const pad = chorus({ l: highpass(warm.l, 130), r: highpass(warm.r, 130) }, 2.2, 0.27, 0.2);
  duck(pad, pump, 0.9);
  const hallPad = scaled(pad, 0.2);
  addStereo(sends.hall, hallPad, 0, 1);

  const arp = group("arp");
  duck(arp, pump, 0.6);
  const lead = group("lead");
  duck(lead, pump, 0.3);
  const bass = group("bass");
  duck(bass, pump, 0.92);

  const tex = interpolate(score.curves.tex, length);
  const body = highpass(lowpass(noiseBuffer(length, 92), 1800), 200);
  const bed = stereo(length);
  for (let i = 0; i < length; i += 1) {
    const breath = 0.7 + 0.3 * Math.sin((2 * Math.PI * 0.09 * i) / RATE);
    const v = (body[i] ?? 0) * 0.016 * (tex[i] ?? 0) * breath;
    bed.l[i] = v;
    bed.r[i] = (body[length - 1 - i] ?? 0) * 0.016 * (tex[i] ?? 0) * breath;
  }

  const bpmAtSample = new Float32Array(Math.ceil(length / 512));
  for (let k = 0; k < bpmAtSample.length; k += 1) bpmAtSample[k] = score.clock.segments[segmentAtTime(score, (k * 512) / RATE)]?.bpm ?? 120;
  const delayReturn = pingPong(
    sends.delay,
    (n) => (0.75 * 60) / (bpmAtSample[Math.min(bpmAtSample.length - 1, n >> 9)] ?? 120),
    0.42,
    0.45,
  );

  const room = convolve(sends.room, makeIR(ROOM), length);
  const plate = convolve(sends.plate, makeIR(PLATE), length);
  const hall = convolve(sends.hall, makeIR(HALL), length);
  for (const wet of [hall, plate]) highShelf(wet, 3000, -5);
  highShelf(room, 5000, -4);

  const kicks = groups.has("kick") ? scaled(group("kick"), BUS_GAIN.drums) : stereo(length);
  const drums = stereo(length);
  for (const g of ["kick", "drums", "hats"] as const) if (groups.has(g)) addStereo(drums, group(g), 0, 1);
  highShelf(drums, 6000, -3);
  compress(drums, { threshold: -17, ratio: 3.5, attack: 0.012, release: 0.09, makeup: 2.5, mix: 0.85 });
  saturate(drums, 1.5);
  addStereo(drums, room, 0, 0.9);

  saturate(bass, 2.2);
  compress(bass, { threshold: -20, ratio: 3, attack: 0.01, release: 0.12, makeup: 2 });

  const music = stereo(length);
  addStereo(music, pad, 0, 1);
  addStereo(music, arp, 0, 1);
  addStereo(music, lead, 0, 1);
  addStereo(music, bed, 0, 1);
  addStereo(music, delayReturn, 0, 0.55);
  highShelf(music, 2500, -5);
  saturate(music, 1.5);
  compress(music, { threshold: -22, ratio: 2, attack: 0.02, release: 0.2, makeup: 1.5 });

  const fx = group("fx");
  const ui = group("ui");
  addStereo(ui, plate, 0, 0.9);
  const uiClean = { l: highpass(ui.l, 150), r: highpass(ui.r, 150) };
  highShelf(uiClean, 2500, -5);

  const trim = interpolate(
    score.curves.trim.flatMap(([t, db], i, all) =>
      i === 0 ? [[0, db] as [number, number]] : [[t - 0.12, all[i - 1]?.[1] ?? db] as [number, number], [t, db] as [number, number]],
    ),
    length,
  );
  const stems: Stems = { drums, bass, music, fx, ui: uiClean, space: hall };
  for (const [key, gain] of Object.entries(BUS_GAIN) as [keyof Stems, number][]) {
    const stem = stems[key];
    for (let i = 0; i < length; i += 1) {
      stem.l[i] = (stem.l[i] ?? 0) * gain;
      stem.r[i] = (stem.r[i] ?? 0) * gain;
    }
  }
  for (const key of ["kicks", "drums", "bass", "music", "space", "ui"] as const) {
    const stem = key === "kicks" ? kicks : stems[key];
    const share = key === "ui" ? 0.7 : 1;
    for (let i = 0; i < length; i += 1) {
      const g = dbGain((trim[i] ?? 0) * share);
      stem.l[i] = (stem.l[i] ?? 0) * g;
      stem.r[i] = (stem.r[i] ?? 0) * g;
    }
  }
  return { stems, kicks };
}

export function applyGates(audio: Stereo, gates: readonly [number, number][]): void {
  const fadeRamp = Math.round(0.002 * RATE);
  for (const [from, to] of gates) {
    const [a, b] = [Math.round(from * RATE), Math.round(to * RATE)];
    for (let i = Math.max(0, a); i < Math.min(audio.l.length, b); i += 1) {
      const g = Math.max(0, 1 - (i - a) / fadeRamp);
      audio.l[i] = (audio.l[i] ?? 0) * g;
      audio.r[i] = (audio.r[i] ?? 0) * g;
    }
  }
}

export function sumStems(stems: Stems): Stereo {
  const total = stereo(stems.drums.l.length);
  for (const stem of Object.values(stems)) addStereo(total, stem, 0, 1);
  return total;
}

export function masterChain(total: Stereo): void {
  compress(total, { threshold: -12, ratio: 1.7, attack: 0.03, release: 0.2, makeup: 1 });
  saturate(total, 1.25);
  lowShelf(total, 75, 1.6);
  peakEq(total, 320, -1.6, 0.9);
  peakEq(total, 3300, -3.5, 0.6);
  highShelf(total, 5000, -3);
  highShelf(total, 8500, 3.5);
  monoLowEnd(total);
}

export function monoLowEnd(audio: Stereo): void {
  const side = Float32Array.from(audio.l, (l, i) => (l - (audio.r[i] ?? 0)) / 2);
  const cleaned = lowpass(highpass(highpass(side, 150), 150), 15500);
  const left = lowpass(
    highpass(
      Float32Array.from(audio.l, (l, i) => (l + (audio.r[i] ?? 0)) / 2),
      24,
    ),
    15500,
  );
  for (let i = 0; i < left.length; i += 1) {
    audio.l[i] = (left[i] ?? 0) + (cleaned[i] ?? 0);
    audio.r[i] = (left[i] ?? 0) - (cleaned[i] ?? 0);
  }
}
