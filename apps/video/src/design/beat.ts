export const FPS = 60;

/** The old constant grid. Only the pre-v2 score and its checks still count on it. */
export const BPM = 120;

export interface Tempo {
  beats: number;
  bpm: number;
}

export interface TempoMap {
  table: readonly Tempo[];
  totalBeats: number;
  totalFrames: number;
  beat: (count: number) => number;
  bpmAt: (count: number) => number;
  secondsOfBeat: (count: number) => number;
  beatAtFrame: (frame: number) => number;
}

/** A piecewise-constant tempo map: one segment per shot. Pure, so the score script can import it without remotion. */
export function tempoMap(table: readonly Tempo[]): TempoMap {
  const startBeats: number[] = [];
  const startSeconds: number[] = [];
  let beats = 0;
  let seconds = 0;
  for (const segment of table) {
    startBeats.push(beats);
    startSeconds.push(seconds);
    beats += segment.beats;
    seconds += (segment.beats * 60) / segment.bpm;
  }
  const last = Math.max(table.length - 1, 0);
  const indexOf = (count: number): number => {
    if (count <= 0) return 0;
    const at = startBeats.findIndex((from, i) => count >= from && count < from + (table[i]?.beats ?? 0));
    return at === -1 ? last : at;
  };
  const bpmAt = (count: number): number => table[indexOf(count)]?.bpm ?? 0;
  const secondsOfBeat = (count: number): number => {
    const i = indexOf(count);
    return (startSeconds[i] ?? 0) + ((count - (startBeats[i] ?? 0)) * 60) / bpmAt(count);
  };
  const beat = (count: number): number => Math.round(secondsOfBeat(count) * FPS);
  const beatAtFrame = (frame: number): number => {
    const time = frame / FPS;
    let i = 0;
    while (i < last && time >= (startSeconds[i + 1] ?? Number.POSITIVE_INFINITY)) i += 1;
    return (startBeats[i] ?? 0) + ((time - (startSeconds[i] ?? 0)) * (table[i]?.bpm ?? 0)) / 60;
  };
  return { table, totalBeats: beats, totalFrames: beat(beats), beat, bpmAt, secondsOfBeat, beatAtFrame };
}

export const TEMPO: readonly Tempo[] = [
  { beats: 4, bpm: 100 },
  { beats: 8, bpm: 104 },
  { beats: 8, bpm: 108 },
  { beats: 8, bpm: 112 },
  { beats: 4, bpm: 116 },
  { beats: 8, bpm: 120 },
  { beats: 4, bpm: 124 },
  { beats: 8, bpm: 128 },
  { beats: 8, bpm: 132 },
  { beats: 4, bpm: 136 },
  { beats: 4, bpm: 138 },
  { beats: 8, bpm: 138 },
];

const CUT_TEMPO: readonly Tempo[] = [
  { beats: 4, bpm: 108 },
  { beats: 8, bpm: 112 },
  { beats: 4, bpm: 120 },
  { beats: 4, bpm: 126 },
  { beats: 4, bpm: 132 },
  { beats: 6, bpm: 132 },
];

export const HERO_MAP = tempoMap(TEMPO);
export const CUT_MAP = tempoMap(CUT_TEMPO);

export const beat = HERO_MAP.beat;
export const bpmAt = HERO_MAP.bpmAt;
export const secondsOfBeat = HERO_MAP.secondsOfBeat;
export const beatAtFrame = HERO_MAP.beatAtFrame;

/** Frames of n beats on a constant grid: for the readme loop and effects that live inside one shot and must not wander with the ramp. */
export const gridBeat = (count: number, bpm: number = BPM): number => Math.round((count * FPS * 60) / bpm);
