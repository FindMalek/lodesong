import { type Clock, createClock, FPS, type Ritard, type Segment } from "./audio-tempo";

export type Track =
  | "kick"
  | "snare"
  | "clap"
  | "hat"
  | "ohat"
  | "tom"
  | "shaker"
  | "crash"
  | "sub"
  | "bass"
  | "pad"
  | "arp"
  | "stab"
  | "lead"
  | "bell"
  | "keys"
  | "pluck"
  | "riser"
  | "impact"
  | "whoosh"
  | "down"
  | "reverse"
  | "ui";

export type UiKind =
  | "draw"
  | "key"
  | "type"
  | "click"
  | "enter"
  | "line"
  | "row"
  | "tile"
  | "device"
  | "ignite"
  | "seek"
  | "chip"
  | "flash";
export interface UiEvent {
  frame: number;
  kind: UiKind;
  label?: string;
  pan?: number;
  /** multiplies the kind's own level, for a cue that lands inside a loud bar */
  gain?: number;
}

export interface ScoreEvent {
  track: Track;
  /** seconds */
  t: number;
  /** seconds the note is held */
  dur: number;
  midi: number;
  vel: number;
  pan: number;
  /** attack seconds for pads and leads */
  a?: number;
  style?: string;
  /** shows up on the cue sheet the picture can read */
  label?: string;
}

interface ChordSpan {
  from: number;
  to: number;
  name: string;
  root: number;
  voicing: number[];
}

export interface FilmSpec {
  id: string;
  segments: readonly Segment[];
  ritard?: Ritard;
  ui: readonly UiEvent[];
  /** frames of silence before the final hit */
  finalGap?: number;
}

export interface Score {
  clock: Clock;
  events: ScoreEvent[];
  gates: [number, number][];
  chords: ChordSpan[];
  curves: { padCut: [number, number][]; trim: [number, number][]; tex: [number, number][] };
  landmarks: { id: string; frame: number }[];
}

interface ChordDef {
  root: number;
  tones: number[];
}

/** root is semitones above the tonic (A), tones are semitones above the root */
const CHORDS = {
  i: { root: 0, tones: [0, 3, 7, 10, 14] },
  VI: { root: -4, tones: [0, 4, 7, 11, 14] },
  III: { root: 3, tones: [0, 4, 7, 11, 14] },
  VII: { root: -2, tones: [0, 4, 7, 9, 14] },
  iv: { root: 5, tones: [0, 3, 7, 10, 14] },
  V: { root: 7, tones: [0, 5, 7, 10, 13] },
  v: { root: 7, tones: [0, 3, 7, 10, 14] },
  II: { root: 2, tones: [0, 4, 7, 11, 14] },
} satisfies Record<string, ChordDef>;
type ChordName = keyof typeof CHORDS;

const SCALE = [0, 2, 3, 5, 7, 8, 10];
const TONIC = 57;
const MOTIF: readonly (readonly [at: number, midi: number, dur: number])[] = [
  [0, 76, 1],
  [1, 81, 0.75],
  [1.75, 84, 0.25],
  [2, 83, 1],
  [3, 79, 0.5],
  [3.5, 81, 0.5],
];

function shiftDiatonic(midi: number, steps: number): number {
  const rel = midi - TONIC;
  const octave = Math.floor(rel / 12);
  const pc = rel - octave * 12;
  const index =
    Math.max(
      0,
      SCALE.findLastIndex((s) => s <= pc),
    ) + steps;
  const carry = Math.floor(index / 7);
  return TONIC + (octave + carry) * 12 + (SCALE[((index % 7) + 7) % 7] as number);
}

type KickPat = "none" | "one" | "half" | "four" | "drive";
type HatPat = "none" | "off" | "shuffle";
type BassPat = "none" | "drone" | "sub" | "pulse" | "roll";
type ArpPat = "none" | "p8" | "p16" | "gate";
type Voice = "bell" | "keys" | "lead" | "pluck";

interface MotifUse {
  voice: Voice;
  double?: Voice;
  oct: number;
  rate: number;
  take: number;
  every: number;
  shifts: number[];
  /** beats before the first statement */
  offset?: number;
  vel?: number;
}

interface Mood {
  loops: ChordName[][];
  hb: number;
  db: number;
  pad: number;
  padCut: [number, number];
  padAttack: number;
  air?: boolean;
  kick: KickPat;
  snare?: boolean;
  hats: HatPat;
  shaker?: boolean;
  bass: BassPat;
  arp: ArpPat;
  stab?: boolean;
  motif?: MotifUse;
  tex: number;
  pump?: number;
}

const LOOP_A: ChordName[] = ["i", "VI", "III", "VII"];
const LOOP_B: ChordName[] = ["iv", "VI", "III", "V"];
const LOOP_C: ChordName[] = ["i", "III", "VII", "VI"];
const LOOP_D: ChordName[] = ["VI", "III", "iv", "V"];

export const MOODS: Record<string, Mood> = {
  /** The anthem is one song: A minor, i VI III VII, a chord a bar. Each mood below is one part of its arrangement, so layers enter and leave instead of everything playing at once. */
  "anthem-hook": {
    loops: [["i"]],
    hb: 4,
    db: 0,
    pad: 0.7,
    padCut: [320, 1100],
    padAttack: 1,
    kick: "none",
    hats: "none",
    bass: "drone",
    arp: "none",
    motif: { voice: "bell", oct: 0, rate: 1, take: 2, every: 4, shifts: [0], offset: 1 },
    tex: 1,
  },
  "anthem-rise": {
    loops: [["V"]],
    hb: 4,
    db: 0,
    pad: 0.75,
    padCut: [700, 3000],
    padAttack: 0.4,
    kick: "one",
    hats: "off",
    bass: "drone",
    arp: "p8",
    tex: 0.6,
  },
  "anthem-drop": {
    loops: [LOOP_A],
    hb: 4,
    db: 0,
    pad: 0.85,
    padCut: [2200, 3800],
    padAttack: 0.06,
    air: true,
    kick: "four",
    snare: true,
    hats: "shuffle",
    bass: "roll",
    arp: "p16",
    motif: { voice: "lead", double: "bell", oct: 0, rate: 1, take: 6, every: 4, shifts: [0, 0, 0, 1], vel: 1 },
    tex: 0.25,
    pump: 0.65,
  },
  "anthem-ride": {
    loops: [["i", "VI"]],
    hb: 4,
    db: 0,
    pad: 0.6,
    padCut: [1300, 2400],
    padAttack: 0.08,
    kick: "four",
    hats: "off",
    bass: "pulse",
    arp: "none",
    motif: { voice: "pluck", double: "bell", oct: 1, rate: 1, take: 6, every: 4, shifts: [0, 1], vel: 0.85 },
    tex: 0.2,
    pump: 0.55,
  },
  "anthem-peak": {
    loops: [["III", "VII"]],
    hb: 4,
    db: 0,
    pad: 1,
    padCut: [3000, 5200],
    padAttack: 0.04,
    air: true,
    kick: "four",
    snare: true,
    hats: "shuffle",
    shaker: true,
    bass: "roll",
    arp: "p16",
    stab: true,
    motif: { voice: "lead", double: "bell", oct: 0, rate: 1, take: 6, every: 4, shifts: [2, 3], vel: 1.1 },
    tex: 0.15,
    pump: 0.7,
  },
  "anthem-rest": {
    loops: [["i"]],
    hb: 4,
    db: 0,
    pad: 1,
    padCut: [900, 1500],
    padAttack: 0.5,
    kick: "none",
    hats: "none",
    bass: "sub",
    arp: "none",
    motif: { voice: "keys", double: "bell", oct: 0, rate: 1, take: 4, every: 4, shifts: [0], vel: 1 },
    tex: 0.5,
    pump: 0,
  },
  "anthem-wind": {
    loops: [["iv"]],
    hb: 4,
    db: 0,
    pad: 0.8,
    padCut: [1000, 3600],
    padAttack: 0.1,
    kick: "half",
    hats: "off",
    bass: "pulse",
    arp: "gate",
    tex: 0.3,
    pump: 0.4,
  },
  "anthem-burst": {
    loops: [LOOP_A],
    hb: 2,
    db: 0,
    pad: 1,
    padCut: [3200, 6000],
    padAttack: 0.03,
    air: true,
    kick: "four",
    snare: true,
    hats: "shuffle",
    shaker: true,
    bass: "pulse",
    arp: "gate",
    stab: true,
    motif: { voice: "lead", double: "bell", oct: 0, rate: 1, take: 6, every: 4, shifts: [0, 1], vel: 1.15 },
    tex: 0.1,
    pump: 0.75,
  },
  "anthem-breath": {
    loops: [["V"]],
    hb: 4,
    db: 0,
    pad: 1.1,
    padCut: [900, 1800],
    padAttack: 0.5,
    kick: "none",
    hats: "none",
    bass: "drone",
    arp: "none",
    tex: 1,
  },
  "anthem-home": {
    loops: [["VI", "VII"]],
    hb: 4,
    db: 0,
    pad: 1.05,
    padCut: [2400, 4200],
    padAttack: 0.05,
    air: true,
    kick: "one",
    hats: "none",
    bass: "sub",
    arp: "p8",
    motif: { voice: "keys", double: "bell", oct: 0, rate: 1, take: 6, every: 4, shifts: [0, 1], vel: 1.1 },
    tex: 0.2,
    pump: 0.3,
  },
  void: {
    loops: [["i"]],
    hb: 4,
    db: 1,
    pad: 0.6,
    padCut: [300, 900],
    padAttack: 1.2,
    kick: "none",
    hats: "none",
    bass: "drone",
    arp: "none",
    motif: { voice: "bell", oct: 0, rate: 1, take: 2, every: 8, shifts: [0], offset: 1 },
    tex: 1,
  },
  tension: {
    loops: [["i", "i", "VI", "V"]],
    hb: 4,
    db: -3,
    pad: 0.55,
    padCut: [500, 1800],
    padAttack: 0.5,
    kick: "one",
    hats: "off",
    bass: "drone",
    arp: "p8",
    motif: { voice: "bell", oct: 0, rate: 1, take: 4, every: 4, shifts: [0, 0, 1, 2], vel: 0.8 },
    tex: 0.6,
  },
  drop: {
    loops: [LOOP_A, LOOP_C],
    hb: 4,
    db: 0,
    pad: 0.85,
    padCut: [2400, 3600],
    padAttack: 0.06,
    air: true,
    kick: "four",
    snare: true,
    hats: "shuffle",
    bass: "roll",
    arp: "p16",
    stab: true,
    motif: { voice: "lead", double: "bell", oct: 0, rate: 1, take: 6, every: 4, shifts: [0, 0, 0, 1], vel: 1 },
    tex: 0.3,
    pump: 0.6,
  },
  calm: {
    loops: [
      ["III", "VII", "i", "VI"],
      ["VI", "III", "VII", "i"],
    ],
    hb: 4,
    db: -2,
    pad: 0.75,
    padCut: [900, 1700],
    padAttack: 0.6,
    kick: "one",
    hats: "none",
    bass: "sub",
    arp: "none",
    motif: { voice: "keys", double: "bell", oct: -1, rate: 2, take: 6, every: 8, shifts: [0, 2], vel: 0.9 },
    tex: 0.7,
    pump: 0.25,
  },
  groove: {
    loops: [LOOP_A, LOOP_B],
    hb: 2,
    db: -2,
    pad: 0.7,
    padCut: [1400, 3000],
    padAttack: 0.08,
    kick: "four",
    snare: true,
    hats: "shuffle",
    bass: "pulse",
    arp: "p16",
    motif: { voice: "pluck", double: "bell", oct: 1, rate: 1, take: 6, every: 4, shifts: [0, 1], vel: 0.85 },
    tex: 0.2,
    pump: 0.55,
  },
  lift: {
    loops: [LOOP_B],
    hb: 2,
    db: -2,
    pad: 0.8,
    padCut: [700, 4200],
    padAttack: 0.1,
    kick: "four",
    snare: true,
    hats: "off",
    bass: "pulse",
    arp: "gate",
    motif: { voice: "pluck", double: "bell", oct: 1, rate: 0.5, take: 3, every: 2, shifts: [0, 1, 2, 3], vel: 0.9 },
    tex: 0.4,
    pump: 0.5,
  },
  peak: {
    loops: [LOOP_A, LOOP_D],
    hb: 2,
    db: 2,
    pad: 1,
    padCut: [3200, 5200],
    padAttack: 0.04,
    air: true,
    kick: "four",
    snare: true,
    hats: "shuffle",
    shaker: true,
    bass: "pulse",
    arp: "gate",
    motif: { voice: "lead", double: "bell", oct: 0, rate: 1, take: 6, every: 4, shifts: [0, 2, 0, 3], vel: 1.1 },
    tex: 0.15,
    pump: 0.7,
  },
  glow: {
    loops: [["III", "VII", "VI", "III"]],
    hb: 2,
    db: 0,
    pad: 1,
    padCut: [1800, 4200],
    padAttack: 0.12,
    air: true,
    kick: "half",
    hats: "off",
    bass: "pulse",
    arp: "p8",
    motif: { voice: "keys", double: "bell", oct: 0, rate: 1, take: 6, every: 4, shifts: [0], vel: 1 },
    tex: 0.3,
    pump: 0.4,
  },
  strip: {
    loops: [["i", "VII", "VI", "V"]],
    hb: 2,
    db: -1,
    pad: 0.8,
    padCut: [1100, 2200],
    padAttack: 0.08,
    kick: "four",
    hats: "none",
    bass: "pulse",
    arp: "gate",
    motif: { voice: "pluck", oct: 1, rate: 0.5, take: 3, every: 2, shifts: [0, 1], vel: 0.8 },
    tex: 0.2,
    pump: 0.5,
  },
  breather: {
    loops: [["VI", "III", "VII", "i"]],
    hb: 4,
    db: -9,
    pad: 1.1,
    padCut: [900, 1500],
    padAttack: 0.7,
    kick: "none",
    hats: "none",
    bass: "sub",
    arp: "none",
    motif: { voice: "keys", double: "bell", oct: 0, rate: 2, take: 6, every: 8, shifts: [0], vel: 1.1 },
    tex: 0.5,
    pump: 0,
  },
  pocket: {
    loops: [["i", "V"]],
    hb: 2,
    db: -9,
    pad: 1.2,
    padCut: [1000, 1700],
    padAttack: 0.3,
    kick: "none",
    hats: "none",
    bass: "drone",
    arp: "none",
    motif: { voice: "keys", oct: 0, rate: 1, take: 2, every: 4, shifts: [0], vel: 0.8 },
    tex: 0.9,
  },
  storm: {
    loops: [["i", "VI", "III", "VII"]],
    hb: 1,
    db: 1,
    pad: 0.9,
    padCut: [2400, 4600],
    padAttack: 0.03,
    kick: "four",
    snare: true,
    hats: "shuffle",
    shaker: true,
    bass: "pulse",
    arp: "gate",
    stab: true,
    motif: { voice: "lead", double: "pluck", oct: 0, rate: 0.5, take: 3, every: 1, shifts: [0, 0, 1, 2], vel: 1 },
    tex: 0.1,
    pump: 0.7,
  },
  flash: {
    loops: [["i", "VI", "III", "VII"]],
    hb: 1,
    db: 4,
    pad: 1,
    padCut: [3000, 6000],
    padAttack: 0.03,
    air: true,
    kick: "four",
    snare: true,
    hats: "shuffle",
    shaker: true,
    bass: "pulse",
    arp: "gate",
    stab: true,
    motif: { voice: "lead", double: "bell", oct: 0, rate: 1, take: 6, every: 4, shifts: [0, 0, 0, 1], vel: 1.15 },
    tex: 0.1,
    pump: 0.75,
  },
  hush: {
    loops: [["i"]],
    hb: 4,
    db: -7,
    pad: 1.3,
    padCut: [1200, 2000],
    padAttack: 0.5,
    kick: "none",
    hats: "none",
    bass: "drone",
    arp: "none",
    tex: 1,
  },
  land: {
    loops: [["VI", "III", "VII", "V", "V"]],
    hb: 1,
    db: 1,
    pad: 1,
    padCut: [2600, 4200],
    padAttack: 0.04,
    air: true,
    kick: "four",
    snare: true,
    hats: "off",
    bass: "pulse",
    arp: "none",
    stab: true,
    motif: { voice: "lead", double: "bell", oct: 0, rate: 1, take: 6, every: 4, shifts: [0], vel: 1.1 },
    tex: 0.1,
    pump: 0.5,
  },
  afterglow: {
    loops: [["i"]],
    hb: 8,
    db: 2,
    pad: 0.9,
    padCut: [2200, 700],
    padAttack: 0.1,
    air: true,
    kick: "none",
    hats: "none",
    bass: "drone",
    arp: "none",
    tex: 0.6,
  },
};

type Hit = readonly [step: number, vel: number];
const KICKS: Record<KickPat, readonly Hit[]> = {
  none: [],
  one: [[0, 0.8]],
  half: [
    [0, 0.9],
    [8, 0.7],
  ],
  four: [
    [0, 1],
    [4, 0.9],
    [8, 0.95],
    [12, 0.9],
  ],
  drive: [
    [0, 1],
    [4, 0.9],
    [8, 0.95],
    [11, 0.55],
    [12, 0.9],
    [14, 0.45],
  ],
};
const BASS_ROLL: readonly Hit[] = [
  [0, 1],
  [3, 0.8],
  [6, 0.9],
  [8, 1],
  [10, 0.7],
  [11, 0.9],
  [14, 0.8],
];
const ARP_PAT: Record<Exclude<ArpPat, "none">, readonly number[]> = {
  p16: [0, 2, 1, 3, 2, 4, 3, 5, 4, 2, 3, 1, 2, 0, 1, 3],
  p8: [0, -1, 2, -1, 4, -1, 3, -1, 1, -1, 4, -1, 2, -1, 5, -1],
  gate: [3, -1, 4, 5, -1, 4, 3, -1, 5, -1, 4, 3, -1, 2, 3, -1],
};
const STABS: readonly Hit[] = [
  [0, 1],
  [3, 0.8],
  [6, 0.9],
  [10, 0.75],
];
const SWING = 0.16;
/** share of the per-segment level offsets that survives: the section spread and loudness range stay under 6 LU */
const DYNAMICS = 0.34;

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const wrapTo = (midi: number, low: number, near: number): number => {
  let m = midi;
  while (m < low) m += 12;
  while (m - 12 >= low && Math.abs(m - 12 - near) < Math.abs(m - near)) m -= 12;
  return m;
};

/** four voices for the chord that move as little as possible from the last four */
export function voiceLead(previous: readonly number[], chord: ChordDef, key: number): number[] {
  const base = TONIC + key + chord.root;
  const order = [1, 3, 4, 2, 0];
  const pcs = [...new Set(order.map((i) => (((base + (chord.tones[i] ?? 0)) % 12) + 12) % 12))].slice(0, 4);
  let best: number[] = [];
  let bestCost = Number.POSITIVE_INFINITY;
  const permute = (rest: number[], chosen: number[]): void => {
    if (rest.length === 0) {
      let cost = 0;
      const notes = chosen.map((pc, voice) => {
        const from = previous[voice] ?? 62;
        const note = [-12, 0, 12]
          .map((o) => Math.round((from - pc) / 12) * 12 + pc + o)
          .sort((a, b) => Math.abs(a - from) - Math.abs(b - from))[0] as number;
        cost += Math.abs(note - from);
        return note;
      });
      const sorted = [...notes].sort((a, b) => a - b);
      if (sorted[0] !== undefined && sorted[0] < 52) cost += 40;
      if (sorted.at(-1) !== undefined && (sorted.at(-1) as number) > 74) cost += 40;
      if (new Set(notes).size < notes.length) cost += 100;
      if (cost < bestCost) {
        bestCost = cost;
        best = sorted;
      }
      return;
    }
    for (const [i, pc] of rest.entries())
      permute(
        rest.filter((_, k) => k !== i),
        [...chosen, pc],
      );
  };
  permute(pcs, []);
  return best;
}

const bassRoot = (chord: ChordDef, key: number, near: number): number => wrapTo(TONIC - 24 + key + chord.root, 31, near);

export function buildScore(spec: FilmSpec): Score {
  const clock = createClock(spec.segments, spec.ritard);
  const events: ScoreEvent[] = [];
  const gates: [number, number][] = [];
  const chords: ChordSpan[] = [];
  const curves: Score["curves"] = { padCut: [], trim: [], tex: [] };
  const landmarks: Score["landmarks"] = [];
  const human = rng(spec.id.length * 7919 + 13);
  const push = (e: Omit<ScoreEvent, "pan"> & { pan?: number }): void => {
    events.push({ pan: 0, ...e });
  };
  const endSeconds = clock.totalFrames / FPS;
  let voicing = [57, 60, 64, 67];
  let bass = 33;

  for (const [index, segment] of spec.segments.entries()) {
    const mood = MOODS[segment.mood];
    if (!mood) throw new Error(`unknown mood ${segment.mood}`);
    const key = segment.key ?? 0;
    const start = clock.starts[index] as number;
    const end = start + segment.beats;
    const stepBeats = 0.25;
    const loop = mood.loops[(segment.variant ?? 0) % mood.loops.length] as ChordName[];
    const next = spec.segments[index + 1];
    const ending = next?.enter ?? "none";
    landmarks.push({ id: segment.id, frame: clock.frame(start) });
    const at = (beat: number): number => clock.at(beat);

    const level = (segment.db ?? mood.db) * DYNAMICS;
    curves.trim.push([at(start), level]);
    if (segment.beats >= 16) curves.trim.push([at(start + 8), level + 2.5 * DYNAMICS]);
    if (segment.beats >= 24) curves.trim.push([at(start + 16), level + 5 * DYNAMICS]);
    const grow = segment.beats >= 16 ? 8 : 0;
    curves.padCut.push([at(start), mood.padCut[0]], [at(end) - 0.01, segment.ignite === undefined ? mood.padCut[1] : 2600]);
    curves.tex.push([at(start), mood.tex]);

    const spans: ChordSpan[] = [];
    const hb = segment.hb ?? mood.hb;
    for (let b = 0, n = 0; b < segment.beats; b += hb, n += 1) {
      const name = loop[n % loop.length] as ChordName;
      const def = CHORDS[name];
      voicing = voiceLead(voicing, def, key);
      bass = bassRoot(def, key, bass);
      const span: ChordSpan = { from: at(start + b), to: at(Math.min(end, start + b + hb)), name, root: bass, voicing };
      spans.push(span);
      chords.push(span);
      const dur = span.to - span.from;
      const release = 0.35;
      for (const note of voicing) {
        push({ track: "pad", t: span.from, dur: dur + release, midi: note, vel: mood.pad, a: mood.padAttack, pan: 0 });
        if (mood.air)
          push({ track: "pad", t: span.from, dur: dur + release, midi: note + 12, vel: mood.pad * 0.35, a: mood.padAttack, style: "air" });
      }
      if (mood.bass === "drone" || mood.bass === "sub") {
        const bars = mood.bass === "drone" ? 1 : Math.max(1, Math.round(hb / 4));
        const each = dur / bars;
        for (let k = 0; k < bars; k += 1)
          push({ track: "sub", t: span.from + k * each, dur: each, midi: bass, vel: mood.bass === "drone" ? 0.28 : 0.8, style: "long" });
      }
    }
    const spanAt = (beat: number): ChordSpan => {
      const t = at(beat) + 1e-6;
      return (spans.find((s) => t >= s.from && t < s.to) ?? spans.at(-1)) as ChordSpan;
    };

    const stepSeconds = (60 / segment.bpm) * stepBeats;
    const steps = Math.floor(segment.beats / stepBeats);
    const swung = (step: number): number => start + step * stepBeats + (step % 2 === 1 ? SWING * stepBeats : 0);

    for (let step = 0; step < steps; step += 1) {
      const slot = step % 16;
      const beatAt = start + step * stepBeats;
      const t = at(beatAt);
      const span = spanAt(beatAt);
      const offset = step * stepBeats;
      const broken = segment.beats >= 20 && offset >= 14 && offset % 16 >= 14 && offset + 2 <= segment.beats;
      if (broken) {
        if (offset % 16 === 14 && step % 16 === 8) {
          push({
            track: "reverse",
            t: at(beatAt + 0.5),
            dur: at(beatAt + 2) - at(beatAt + 0.5),
            midi: 80,
            vel: 0.7,
            label: `${segment.id}: phrase break swell`,
          });
        }
        if (offset % 16 >= 15)
          push({ track: "snare", t, dur: 0.2, midi: 60, vel: 0.35 + 0.65 * (offset % 1 === 0 ? 0 : (offset % 1) * 1.3), style: "roll" });
        continue;
      }

      for (const [s, vel] of KICKS[mood.kick]) {
        if (s !== slot) continue;
        push({ track: "kick", t, dur: 0.4, midi: 33, vel, label: "kick" });
      }
      const on = (from: number | undefined): boolean => offset >= (from ?? 0);
      if (mood.snare && on(segment.build?.snare) && (slot === 4 || slot === 12)) {
        push({ track: "snare", t, dur: 0.3, midi: 60, vel: 1, label: "snare" });
        push({ track: "clap", t: t + 0.002, dur: 0.3, midi: 60, vel: 0.8, pan: 0.05 });
      }
      if (mood.hats === "shuffle" && on(segment.build?.hats)) {
        const accent = slot % 4 === 2 ? 1 : slot % 2 === 0 ? 0.65 : 0.38;
        const open = slot === 14 && (step / 16) % 2 === 1;
        const ht = at(swung(step)) + (human() - 0.5) * 0.003;
        push({ track: open ? "ohat" : "hat", t: ht, dur: 0.2, midi: 80, vel: accent * (0.85 + human() * 0.3), pan: slot % 2 ? 0.3 : -0.3 });
      } else if (mood.hats === "off" && on(segment.build?.hats) && slot % 4 === 2) {
        push({ track: slot === 14 ? "ohat" : "hat", t, dur: 0.2, midi: 80, vel: 0.8 + human() * 0.2, pan: 0.2 });
      }
      if (mood.shaker && on(segment.build?.hats) && slot % 2 === 1)
        push({ track: "shaker", t: at(swung(step)), dur: 0.08, midi: 80, vel: 0.4 + human() * 0.2, pan: slot % 4 === 1 ? -0.5 : 0.5 });

      if (mood.bass === "roll") {
        for (const [s, vel] of BASS_ROLL)
          if (s === slot)
            push({ track: "bass", t, dur: stepSeconds * (s === 14 ? 1.6 : 2.2), midi: span.root + (s === 11 || s === 14 ? 12 : 0), vel });
      } else if (mood.bass === "pulse" && slot % 2 === 0) {
        push({
          track: "bass",
          t,
          dur: stepSeconds * 1.8,
          midi: span.root + (slot === 6 || slot === 14 ? 12 : 0),
          vel: slot % 4 === 0 ? 1 : 0.75,
        });
      }

      if (mood.arp !== "none" && offset >= (segment.build?.arp ?? grow)) {
        const idx = ARP_PAT[mood.arp][slot] as number;
        if (idx >= 0) {
          const v = span.voicing;
          const pool = [v[0], v[1], v[2], v[3], (v[0] ?? 0) + 12, (v[1] ?? 0) + 12].map((n) => (n ?? 60) + 12);
          push({
            track: "arp",
            t: at(swung(step)) + (human() - 0.5) * 0.002,
            dur: stepSeconds * 1.4,
            midi: pool[idx % pool.length] as number,
            vel: 0.6 + 0.4 * (slot % 4 === 0 ? 1 : human()),
            pan: ((step % 6) - 2.5) * 0.16,
          });
        }
      }
      if (mood.stab && offset >= (segment.build?.stab ?? grow))
        for (const [s, vel] of STABS)
          if (s === slot)
            for (const [k, n] of span.voicing.entries())
              push({ track: "stab", t: t + k * 0.002, dur: stepSeconds * 1.6, midi: n + 12, vel: vel * 0.9, pan: (k - 1.5) * 0.18 });
    }

    if (mood.motif) {
      const m = mood.motif;
      const bar = m.every;
      const last = MOTIF[m.take - 1] ?? MOTIF[0];
      const span = ((last?.[0] ?? 0) + (last?.[2] ?? 0)) * m.rate;
      for (
        let n = 0;
        (segment.ignite === undefined ? (m.offset ?? 0) : segment.ignite + 2) + n * bar + span <= segment.beats + 0.001;
        n += 1
      ) {
        const shift = m.shifts[n % m.shifts.length] as number;
        const origin = start + (segment.ignite === undefined ? (m.offset ?? 0) : segment.ignite + 2) + n * bar;
        for (const [off, midi, dur] of MOTIF.slice(0, m.take)) {
          const note = shiftDiatonic(midi, shift) + key + m.oct * 12;
          const b = origin + off * m.rate;
          if (b >= end) continue;
          const tail = Math.min(dur * m.rate, end - b);
          const seconds = Math.max(0.12, at(b + tail) - at(b));
          push({ track: m.voice, t: at(b), dur: seconds, midi: note, vel: m.vel ?? 1, pan: 0 });
          if (m.double) push({ track: m.double, t: at(b), dur: seconds, midi: note + 12, vel: (m.vel ?? 1) * 0.7, pan: 0.18 });
        }
      }
    }

    if (segment.ignite !== undefined) {
      const hit = at(start + segment.ignite);
      const label = `${segment.id}: ignition`;
      gates.push([hit - 3 / FPS, hit]);
      push({
        track: "reverse",
        t: at(start + 0.5),
        dur: hit - at(start + 0.5) - 3 / FPS,
        midi: 80,
        vel: 0.55,
        label: `${label} dark swell`,
      });
      const riseBeat = segment.ignite <= 1 ? 0 : 1;
      push({
        track: "riser",
        t: at(start + riseBeat),
        dur: hit - at(start + riseBeat) - 3 / FPS,
        midi: (spans[0]?.root ?? 33) + 12,
        vel: 0.35,
      });
      push({ track: "impact", t: hit, dur: 3, midi: spans[0]?.root ?? 33, vel: 0.9, style: "hit", label });
      push({ track: "bell", t: hit, dur: 3, midi: 105, vel: 1.4, pan: 0 });
    }
    const intro = segment.enter ?? "none";
    if (intro !== "none" && index > 0) {
      const t0 = at(start);
      const first = spans[0] as ChordSpan;
      const prev = spec.segments[index - 1] as Segment;
      const prevBpm = prev.bpm;
      const label = `${segment.id}: ${intro}`;
      const gap = intro === "drop" ? (segment.gap ?? 3) : (segment.gap ?? 0);
      if (gap > 0) gates.push([t0 - gap / FPS, t0]);
      push({
        track: "impact",
        t: t0,
        dur: intro === "drop" ? 4 : intro === "hit" ? 2.4 : 1.2,
        midi: first.root,
        vel: intro === "drop" ? 1 : intro === "hit" ? 0.75 : 0.5,
        style: intro,
        label,
      });
      push({ track: "crash", t: t0, dur: 2, midi: 80, vel: intro === "drop" ? 0.9 : 0.55, style: intro });
      if (intro !== "cut")
        push({
          track: "reverse",
          t: t0 - (intro === "drop" ? 1.6 : 0.9),
          dur: intro === "drop" ? 1.6 : 0.9,
          midi: 80,
          vel: intro === "drop" ? 1 : 0.7,
          label: `${label} reverse swell`,
        });
      const rise = intro === "drop" ? 2 : intro === "hit" ? 2 : 0.5;
      const riseSeconds = t0 - at(start - rise);
      if (intro !== "cut")
        push({
          track: "riser",
          t: t0 - riseSeconds,
          dur: riseSeconds,
          midi: first.voicing[1] ?? 60,
          vel: intro === "drop" ? 1 : 0.7,
          label: `${label} riser`,
        });
      push({
        track: "whoosh",
        t: t0 - Math.min(0.6, riseSeconds),
        dur: Math.min(0.6, riseSeconds),
        midi: 80,
        vel: intro === "cut" ? 0.8 : 0.6,
        label: `${label} whoosh`,
      });
      if ((prevBpm > 0 && MOODS[prev.mood]?.snare) || intro === "drop") {
        const rollSteps = Math.round(rise * 4 * (intro === "drop" ? 2 : 1));
        for (let r = 0; r < rollSteps; r += 1) {
          const u = r / rollSteps;
          const when = at(start - rise + (r * rise) / rollSteps);
          if (t0 - when < (gap + 0.5) / FPS) continue;
          push({
            track: "snare",
            t: when,
            dur: 0.2,
            midi: 60,
            vel: 0.3 + 0.7 * u * u,
            style: "roll",
            label: r === 0 ? `${label} roll` : undefined,
          });
        }
      }
    }
    if (
      intro === "cut" &&
      index > 0 &&
      (MOODS[(spec.segments[index - 1] as Segment).mood]?.kick ?? "none") !== "none" &&
      mood.kick === "none"
    ) {
      push({ track: "down", t: at(start), dur: 2.4, midi: spans[0]?.root ?? 33, vel: 0.8, label: `${segment.id}: downlifter` });
    }

    for (let b = 7; b < segment.beats - (ending === "none" ? 0 : 2); b += 8) {
      if (!mood.snare) break;
      for (const [k, midi] of [74, 74, 69, 62].entries())
        push({ track: "tom", t: at(start + b + k * 0.25), dur: 0.3, midi, vel: 0.7 + 0.1 * k });
    }
  }

  if (spec.ritard) {
    const t = clock.at(spec.ritard.final);
    const span = chords.findLast((c) => c.from <= t) ?? (chords.at(-1) as ChordSpan);
    gates.push([t - (spec.finalGap ?? 8) / FPS, t]);
    push({ track: "impact", t, dur: 5, midi: span.root, vel: 1, style: "final", label: "final hit" });
    push({ track: "crash", t, dur: 3, midi: 80, vel: 0.8, style: "drop" });
    push({ track: "bell", t, dur: 3, midi: 76 + 12, vel: 1.1, pan: -0.15 });
    push({ track: "bell", t: t + 0.32, dur: 4, midi: 81 + 12, vel: 1.2, pan: 0.15 });
    push({ track: "lead", t, dur: 0.55, midi: 76, vel: 1, a: 0.01 });
    push({ track: "lead", t: t + 0.32, dur: 1.8, midi: 81, vel: 1, a: 0.01 });
    landmarks.push({ id: "final hit", frame: Math.round(t * FPS) });
  }

  const pitched = (kind: UiKind, t: number, counter: number): number => {
    const span = chords.findLast((c) => c.from <= t) ?? (chords.at(-1) as ChordSpan);
    const pool = span.voicing.map((n) => n + 24);
    return kind === "type"
      ? (pool[(counter * 3) % pool.length] as number) + (counter % 5 === 4 ? 12 : 0)
      : (pool[counter % pool.length] as number);
  };
  const vel: Partial<Record<UiKind, number>> = {
    ignite: 3.2,
    enter: 3,
    key: 7,
    click: 4.5,
    chip: 1.8,
    draw: 1.8,
    flash: 1.8,
    seek: 1.8,
    row: 2.2,
    line: 1.6,
    tile: 1.6,
    device: 3,
    type: 0.6,
  };
  let run = 0;
  let lastFrame = -999;
  for (const ui of spec.ui) {
    run = ui.kind === "type" && ui.frame - lastFrame < 18 ? run + 1 : 0;
    lastFrame = ui.frame;
    const t = ui.frame / FPS;
    push({
      track: "ui",
      t,
      dur: 0.6,
      midi: pitched(ui.kind, t, ui.kind === "type" ? run : Math.round(ui.frame / 7)),
      vel: (vel[ui.kind] ?? 1) * (ui.gain ?? 1),
      pan: ui.pan ?? ((ui.frame % 5) - 2) * 0.08,
      style: ui.kind,
      label: ui.label ?? ui.kind,
    });
  }

  const kept = events.filter((e) => e.t < endSeconds - 0.01 && e.t >= 0).sort((a, b) => a.t - b.t);
  gates.sort((a, b) => a[0] - b[0]);
  return { clock, events: kept, gates, chords, curves, landmarks };
}
