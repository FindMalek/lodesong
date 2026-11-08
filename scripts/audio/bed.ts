import type { Film } from "../../apps/video/src/audio-cues";
import { BPM } from "../../apps/video/src/design/beat";
import type { Stereo } from "./dsp";
import { highpass, lowpass, midiHz, noiseBuffer, RATE, rng, sawBlep, softClip } from "./dsp";
import { hat } from "./voices";

export interface Chord {
  notes: number[];
  root: number;
}

const CHORDS = {
  am9: { notes: [45, 52, 60, 67, 71, 76], root: 33 },
  fmaj7: { notes: [41, 48, 52, 57, 60, 64], root: 29 },
  cmaj9: { notes: [48, 55, 59, 62, 64, 67], root: 36 },
  g6: { notes: [43, 50, 59, 64, 67, 71], root: 31 },
} satisfies Record<string, Chord>;

type ChordName = keyof typeof CHORDS;
type Curve = readonly (readonly [number, number])[];

interface Segment {
  from: number;
  to: number;
  chord: ChordName;
}

interface HatSpan {
  from: number;
  to: number;
  mode: "off" | "eighth" | "ghost";
  level: number;
  open?: boolean;
}

interface ArpSpan {
  from: number;
  to: number;
  level: number;
  sparse?: boolean;
  octave?: boolean;
}

interface BassSpan {
  from: number;
  to: number;
  mode: "drone" | "line";
  level: number;
}

export interface BedSpec {
  chords: Segment[];
  pad: Curve;
  cut: Curve;
  tex: Curve;
  hats: HatSpan[];
  arp: ArpSpan[];
  bass: BassSpan[];
  mix: Curve;
  gates: readonly [number, number][];
}

const curveAt = (curve: Curve, beat: number): number => {
  const first = curve[0];
  if (!first || beat <= first[0]) return first?.[1] ?? 0;
  for (let i = 1; i < curve.length; i += 1) {
    const [b1, v1] = curve[i] as readonly [number, number];
    const [b0, v0] = curve[i - 1] as readonly [number, number];
    if (beat <= b1) return v0 + ((v1 - v0) * (beat - b0)) / (b1 - b0 || 1);
  }
  return curve.at(-1)?.[1] ?? 0;
};

export const BEDS: Record<Film, BedSpec> = {
  hero: {
    chords: [
      { from: 0, to: 9, chord: "am9" },
      { from: 9, to: 12, chord: "fmaj7" },
      { from: 12, to: 16, chord: "cmaj9" },
      { from: 16, to: 20, chord: "am9" },
      { from: 20, to: 24, chord: "fmaj7" },
      { from: 24, to: 26, chord: "g6" },
      { from: 26, to: 30, chord: "fmaj7" },
      { from: 30, to: 34, chord: "cmaj9" },
      { from: 34, to: 36, chord: "g6" },
      { from: 36, to: 40, chord: "am9" },
      { from: 40, to: 44, chord: "fmaj7" },
      { from: 44, to: 46, chord: "g6" },
      { from: 46, to: 50, chord: "am9" },
      { from: 50, to: 52, chord: "fmaj7" },
      { from: 52, to: 54, chord: "g6" },
      { from: 54.5, to: 60, chord: "am9" },
    ],
    pad: [
      [0, 0.12],
      [4, 0.22],
      [5.75, 0.3],
      [6, 0.7],
      [36, 0.85],
      [45.9, 0.9],
      [46, 0.3],
      [52, 0.4],
      [54, 0.7],
      [54.5, 0.7],
      [58, 0.55],
      [60, 0],
    ],
    cut: [
      [0, 380],
      [4, 520],
      [5.75, 1000],
      [6, 2200],
      [36, 2600],
      [45.9, 2600],
      [46, 600],
      [52, 650],
      [54, 2000],
      [54.5, 1900],
      [60, 800],
    ],
    tex: [
      [0, 0.5],
      [5.9, 0.7],
      [6, 0.3],
      [46, 0.5],
      [54, 0.5],
      [54.5, 0.25],
      [60, 0.1],
    ],
    hats: [
      { from: 4.5, to: 6, mode: "off", level: 0.45 },
      { from: 6, to: 16, mode: "off", level: 0.8, open: true },
      { from: 16, to: 19, mode: "off", level: 0.8, open: true },
      { from: 19, to: 26, mode: "ghost", level: 0.5 },
      { from: 19, to: 26, mode: "off", level: 0.8, open: true },
      { from: 26, to: 31, mode: "off", level: 0.65 },
      { from: 31, to: 36, mode: "off", level: 0.8, open: true },
      { from: 31, to: 36, mode: "ghost", level: 0.5 },
      { from: 36, to: 46, mode: "eighth", level: 1, open: true },
      { from: 36, to: 46, mode: "ghost", level: 0.55 },
      { from: 52, to: 54, mode: "eighth", level: 0.45 },
    ],
    arp: [
      { from: 8, to: 12, level: 0.55, sparse: true },
      { from: 12, to: 36, level: 0.75 },
      { from: 36, to: 46, level: 1.1, octave: true },
      { from: 50, to: 54, level: 0.35, sparse: true },
    ],
    bass: [
      { from: 2, to: 6, mode: "drone", level: 0.05 },
      { from: 6, to: 30, mode: "drone", level: 0.15 },
      { from: 30, to: 46, mode: "line", level: 0.25 },
      { from: 46, to: 54, mode: "drone", level: 0.12 },
    ],
    mix: [
      [0, 1],
      [5.9, 1],
      [6, 0.7],
      [12, 0.7],
      [12.5, 0.62],
      [16, 0.62],
      [16.5, 0.5],
      [26, 0.85],
      [26.5, 0.8],
      [36, 1],
      [36.5, 1.5],
      [45.9, 1.5],
      [46, 1],
      [60, 1],
    ],
    gates: [[54, 54.5]],
  },
  cutdown: {
    chords: [
      { from: 0, to: 9, chord: "am9" },
      { from: 9, to: 13, chord: "fmaj7" },
      { from: 13, to: 17, chord: "cmaj9" },
      { from: 17, to: 18, chord: "g6" },
      { from: 18, to: 21, chord: "am9" },
      { from: 21, to: 23, chord: "fmaj7" },
      { from: 23, to: 25, chord: "g6" },
      { from: 26, to: 30, chord: "am9" },
    ],
    pad: [
      [0, 0.2],
      [3, 0.28],
      [5, 0.7],
      [18, 0.85],
      [25, 0.8],
      [26, 0.7],
      [28, 0.5],
      [30, 0],
    ],
    cut: [
      [0, 700],
      [3, 900],
      [4.75, 1400],
      [5, 3200],
      [18, 3600],
      [24.9, 3600],
      [26, 2300],
      [30, 900],
    ],
    tex: [
      [0, 0.8],
      [5, 0.35],
      [25, 0.5],
      [26, 0.3],
      [30, 0.1],
    ],
    hats: [
      { from: 1.5, to: 5, mode: "off", level: 0.5 },
      { from: 5, to: 25, mode: "off", level: 0.8, open: true },
      { from: 11, to: 25, mode: "ghost", level: 0.5 },
    ],
    arp: [
      { from: 6, to: 18, level: 0.75 },
      { from: 18, to: 25, level: 0.9, octave: true },
    ],
    bass: [
      { from: 1, to: 5, mode: "drone", level: 0.1 },
      { from: 5, to: 9, mode: "drone", level: 0.15 },
      { from: 9, to: 25, mode: "line", level: 0.25 },
    ],
    mix: [
      [0, 1],
      [4.9, 1],
      [5, 1],
      [18, 1],
      [18.5, 1.3],
      [24.9, 1.3],
      [25, 1],
      [30, 1],
    ],
    gates: [[25, 26]],
  },
};

export function windowSpec(spec: BedSpec, from: number, to: number): BedSpec {
  const clip = <T extends { from: number; to: number }>(items: T[]): T[] =>
    items
      .filter((item) => item.to > from && item.from < to)
      .map((item) => ({ ...item, from: Math.max(item.from, from), to: Math.min(item.to, to) }));
  return { ...spec, chords: clip(spec.chords), hats: clip(spec.hats), arp: clip(spec.arp), bass: clip(spec.bass), gates: [] };
}

export const mixAt = (spec: BedSpec, sample: number): number => curveAt(spec.mix, beatOf(sample));

const BEAT_SECONDS = 60 / BPM;
export const beatOf = (sample: number): number => sample / RATE / BEAT_SECONDS;
export const sampleOf = (beat: number): number => Math.round(beat * BEAT_SECONDS * RATE);

export function chordAt(spec: BedSpec, beat: number): Chord | undefined {
  const segment = spec.chords.find((s) => beat >= s.from && beat < s.to);
  return segment ? CHORDS[segment.chord] : undefined;
}

export function renderPad(spec: BedSpec, length: number): Stereo {
  const left = new Float32Array(length);
  const right = new Float32Array(length);
  for (const segment of spec.chords) {
    const attack = segment.from >= 54 || segment.from === 26 ? 0.18 : 0.45;
    const start = sampleOf(segment.from);
    const stop = Math.min(length, sampleOf(segment.to) + Math.round(RATE * 0.9));
    const notes = CHORDS[segment.chord].notes;
    const phases = notes.map((_, k) => [(k * 0.37) % 1, (k * 0.61 + 0.2) % 1, (k * 0.83 + 0.5) % 1]);
    for (let i = start; i < stop; i += 1) {
      const t = (i - start) / RATE;
      const into = (i - sampleOf(segment.to)) / RATE;
      const env = Math.min(1, t / attack) ** 2 * (into > 0 ? Math.max(0, 1 - into / 0.9) ** 2 : 1);
      const seconds = i / RATE;
      const wow = 1 + 0.0014 * Math.sin(2 * Math.PI * 0.33 * seconds) + 0.0007 * Math.sin(2 * Math.PI * 1.13 * seconds + 1);
      const wowR = 1 + 0.0014 * Math.sin(2 * Math.PI * 0.29 * seconds + 2) + 0.0007 * Math.sin(2 * Math.PI * 1.31 * seconds);
      let l = 0;
      let r = 0;
      for (const [k, note] of notes.entries()) {
        const dt = (midiHz(note) * wow) / RATE;
        const dtR = (midiHz(note) * wowR) / RATE;
        const p = phases[k] as number[];
        p[0] = ((p[0] as number) + dt * 0.9965) % 1;
        p[1] = ((p[1] as number) + dt) % 1;
        p[2] = ((p[2] as number) + dtR * 1.0035) % 1;
        const weight = note < 50 ? 1.2 : 0.8;
        l += (sawBlep(p[0] as number, dt) + sawBlep(p[1] as number, dt) * 0.5) * weight;
        r += (sawBlep(p[2] as number, dtR) + sawBlep(p[1] as number, dtR) * 0.5) * weight;
      }
      left[i] = (left[i] ?? 0) + l * env * 0.12;
      right[i] = (right[i] ?? 0) + r * env * 0.12;
    }
  }
  const cut = (i: number): number => curveAt(spec.cut, beatOf(i));
  const level = (i: number): number => curveAt(spec.pad, beatOf(i));
  const l = highpass(lowpass(left, cut, 0.9), 140);
  const r = highpass(lowpass(right, cut, 0.9), 140);
  for (let i = 0; i < length; i += 1) {
    l[i] = (l[i] ?? 0) * level(i);
    r[i] = (r[i] ?? 0) * level(i);
  }
  const delay = Math.round(RATE * 0.007);
  const late = new Float32Array(length);
  late.set(r.subarray(0, length - delay), delay);
  return { l, r: late };
}

export function renderTexture(spec: BedSpec, length: number, seed: number): Stereo {
  const next = rng(seed + 5);
  const body = highpass(lowpass(noiseBuffer(length, seed), 5200), 220);
  const air = lowpass(highpass(noiseBuffer(length, seed + 1), 3500), 9000);
  const crackle = new Float32Array(length);
  for (let i = 0; i < length; i += 1) if (next() < 5 / RATE) crackle[i] = (next() * 2 - 1) * (0.2 + next() * 0.8) * 0.12;
  const pops = highpass(crackle, 1800);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const seconds = i / RATE;
    const breath = 0.65 + 0.35 * Math.sin(2 * Math.PI * 0.11 * seconds);
    out[i] = (body[i] ?? 0) * 0.02 * breath + (air[i] ?? 0) * 0.007 * (1.2 - breath * 0.5) + (pops[i] ?? 0) * 0.5;
    out[i] = (out[i] ?? 0) * curveAt(spec.tex, beatOf(i));
  }
  const shifted = new Float32Array(length);
  shifted.set(out.subarray(0, length - 24), 24);
  return { l: out, r: shifted };
}

export function renderBass(spec: BedSpec, length: number): Float32Array {
  const out = new Float32Array(length);
  for (const span of spec.bass) {
    if (span.mode === "drone") {
      for (const segment of spec.chords) {
        const from = Math.max(span.from, segment.from);
        const to = Math.min(span.to, segment.to);
        if (to <= from) continue;
        const hz = midiHz(CHORDS[segment.chord].root);
        const start = sampleOf(from);
        const stop = Math.min(length, sampleOf(to));
        for (let i = start; i < stop; i += 1) {
          const edge = Math.min((i - start) / (RATE * 0.05), (stop - i) / (RATE * 0.08), 1);
          out[i] = (out[i] ?? 0) + softClip(Math.sin((2 * Math.PI * hz * i) / RATE), 3) * edge * span.level * 0.5;
        }
      }
      continue;
    }
    const offsets = [0, 0, 7, 12];
    for (let beat = Math.ceil(span.from); beat < span.to; beat += 1) {
      const chord = chordAt(spec, beat + 0.5);
      if (!chord) continue;
      const hz = midiHz(chord.root + (offsets[beat % 4] as number));
      const start = sampleOf(beat + 0.5);
      const size = Math.round(RATE * 0.5);
      for (let i = 0; i < size && start + i < length; i += 1) {
        const t = i / RATE;
        const shape = Math.min(1, t / 0.004) * Math.exp(-t / 0.15) * Math.min(1, (size - i) / (RATE * 0.015));
        out[start + i] = (out[start + i] ?? 0) + softClip(Math.sin(2 * Math.PI * hz * t) * 1.2, 2.2) * shape * span.level * 0.5;
      }
    }
  }
  return out;
}

export function renderArp(spec: BedSpec, length: number, seed: number): { audio: Stereo; echo: Stereo } {
  const human = rng(seed + 9);
  const audio = { l: new Float32Array(length), r: new Float32Array(length) };
  const pattern = [0, -1, 2, -1, -1, 4, -1, 3, -1, -1, 5, -1, 2, -1, -1, -1];
  const sparse = [0, -1, -1, -1, -1, -1, -1, 3, -1, -1, 5, -1, -1, -1, -1, -1];
  for (const span of spec.arp) {
    for (let step = Math.ceil(span.from * 4); step < span.to * 4; step += 1) {
      const index = (span.sparse ? sparse : pattern)[step % 16] as number;
      if (index < 0) continue;
      const beat = step / 4;
      const chord = chordAt(spec, beat);
      if (!chord) continue;
      const pool = chord.notes.slice(1).map((n) => n + 12);
      const note = (pool[index % pool.length] as number) + (index >= pool.length ? 12 : 0);
      const voices = span.octave ? [note, note + 12] : [note];
      for (const [v, midi] of voices.entries()) {
        const hz = midiHz(midi);
        const start = sampleOf(beat) + Math.round((human() - 0.5) * 0.006 * RATE);
        const pan = (step % 2 ? 0.35 : -0.35) + (human() - 0.5) * 0.4;
        const size = Math.round(RATE * 0.5);
        const level = span.level * (v === 0 ? 1 : 0.35) * 0.09 * 10 ** (((human() - 0.5) * 3) / 20);
        for (let i = 0; i < size && start + i < length; i += 1) {
          const t = i / RATE;
          const wave =
            Math.sin(2 * Math.PI * hz * t) +
            0.45 * Math.sin(4 * Math.PI * hz * t) * Math.exp(-t / 0.08) +
            0.2 * Math.sin(6 * Math.PI * hz * t) * Math.exp(-t / 0.04);
          const sample = wave * Math.min(1, t / 0.002) * Math.exp(-t / 0.16) * Math.min(1, (size - i) / (RATE * 0.015)) * level;
          audio.l[start + i] = (audio.l[start + i] ?? 0) + sample * (1 - pan) * 0.7;
          audio.r[start + i] = (audio.r[start + i] ?? 0) + sample * (1 + pan) * 0.7;
        }
      }
    }
  }
  return { audio, echo: audio };
}

export function renderHats(spec: BedSpec, dry: Stereo, verb: Stereo, film: Film): void {
  let n = 0;
  const human = rng(film === "hero" ? 77 : 78);
  for (const span of spec.hats) {
    const half = span.mode === "ghost" ? [0.25, 0.75] : span.mode === "eighth" ? [0, 0.5] : [0.5];
    for (let beat = Math.floor(span.from); beat < span.to; beat += 1) {
      for (const offset of half) {
        const at = beat + offset;
        if (at < span.from || at >= span.to) continue;
        n += 1;
        const open = Boolean(span.open) && span.mode !== "ghost" && offset === 0.5 && beat % 4 === 3;
        const accent = offset === 0.5 ? 1 : 0.7;
        const voice = hat(
          span.level * accent * (span.mode === "ghost" ? 0.55 : 1) * 10 ** (((human() - 0.5) * 4) / 20),
          open,
          (n % 2 ? 0.35 : -0.35) + (human() - 0.5) * 0.5,
          n + (film === "hero" ? 0 : 1000),
        );
        const start = sampleOf(at) + Math.round((human() - 0.5) * 0.008 * RATE);
        for (let i = 0; i < voice.audio.l.length && start + i < dry.l.length; i += 1) {
          dry.l[start + i] = (dry.l[start + i] ?? 0) + (voice.audio.l[i] ?? 0);
          dry.r[start + i] = (dry.r[start + i] ?? 0) + (voice.audio.r[i] ?? 0);
          verb.l[start + i] = (verb.l[start + i] ?? 0) + (voice.audio.l[i] ?? 0) * voice.verb;
          verb.r[start + i] = (verb.r[start + i] ?? 0) + (voice.audio.r[i] ?? 0) * voice.verb;
        }
      }
    }
  }
}
