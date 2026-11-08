import { Easing, interpolate } from "remotion";

export const FPS = 60;
const BPM = 120;
const BEAT = (FPS * 60) / BPM;

/** Frame of the nth beat (fractions allowed: 0.5 is the off-beat). */
export const beat = (count: number): number => Math.round(count * BEAT);

/** One signature curve for entrances (expo-out feel), one for exits, one for camera drift. Nothing bounces. */
export const ease = {
  out: Easing.bezier(0.16, 1, 0.3, 1),
  in: Easing.bezier(0.7, 0, 0.84, 0),
  inOut: Easing.bezier(0.65, 0, 0.35, 1),
};

export function ramp(frame: number, from: number, duration: number, easing: (t: number) => number = ease.out): number {
  return interpolate(frame, [from, from + duration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing,
  });
}

export const lerp = (from: number, to: number, t: number): number => from + (to - from) * t;

/** Deterministic 0..1 hash of a number, for per-frame and per-cell randomness (never Math.random in a render). */
export function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}
