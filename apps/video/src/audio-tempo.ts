import { FPS } from "./design/beat";

export { FPS };

/** enter: how a segment opens (cut, hit with riser, or full drop); gap: frames of true silence before it; db overrides the mood level; key is semitones above A minor */
export interface Segment {
  id: string;
  beats: number;
  bpm: number;
  mood: string;
  enter?: "none" | "cut" | "hit" | "drop";
  key?: number;
  variant?: number;
  gap?: number;
  db?: number;
}

export interface Ritard {
  final: number;
  over: number;
  slow: number;
}

/** seconds and frame are the straight grid the picture cuts on; at() is when the score plays a beat, with the ritardando applied */
export interface Clock {
  segments: readonly Segment[];
  starts: readonly number[];
  totalBeats: number;
  totalFrames: number;
  seconds: (beat: number) => number;
  frame: (beat: number) => number;
  at: (beat: number) => number;
  bpmAt: (beat: number) => number;
  segmentAt: (beat: number) => number;
}

export function createClock(segments: readonly Segment[], ritard?: Ritard): Clock {
  const starts: number[] = [];
  const startSeconds: number[] = [];
  let beats = 0;
  let seconds = 0;
  for (const segment of segments) {
    starts.push(beats);
    startSeconds.push(seconds);
    beats += segment.beats;
    seconds += (segment.beats * 60) / segment.bpm;
  }
  const segmentAt = (beat: number): number =>
    Math.max(
      0,
      starts.findLastIndex((start) => beat >= start),
    );
  const straight = (beat: number): number => {
    const i = Math.min(segmentAt(beat), segments.length - 1);
    const segment = segments[i] as Segment;
    return (startSeconds[i] ?? 0) + ((beat - (starts[i] ?? 0)) * 60) / segment.bpm;
  };
  const bpmAt = (beat: number): number => (segments[Math.min(segmentAt(beat), segments.length - 1)] as Segment).bpm;
  const warp = (beat: number): number => {
    if (!ritard) return 0;
    const from = ritard.final - ritard.over;
    if (beat <= from) return 0;
    const k = 1 - ritard.slow;
    const u = Math.min(1, (beat - from) / ritard.over);
    const bpm = bpmAt(from);
    return ((60 * ritard.over) / bpm) * (-Math.log(1 - k * u) / k - u);
  };
  return {
    segments,
    starts,
    totalBeats: beats,
    totalFrames: Math.round(seconds * FPS),
    seconds: straight,
    frame: (beat) => Math.round(straight(beat) * FPS),
    at: (beat) => straight(beat) + warp(beat),
    bpmAt,
    segmentAt,
  };
}
