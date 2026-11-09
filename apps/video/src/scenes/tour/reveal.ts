/** Characters shown at a frame when a string types itself in over `duration` frames from `from`: the tour is too fast for hand-speed typing. */
export function revealed(frame: number, from: number, duration: number, length: number): number {
  if (frame < from) return 0;
  return Math.min(length, Math.floor(((frame - from) / Math.max(1, duration)) * (length + 1)));
}
