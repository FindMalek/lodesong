export const FPS = 60;
export const BPM = 120;

/** Frame of the nth beat (fractions allowed: 0.5 is the off-beat). Pure, so scripts can import it without remotion. */
export const beat = (count: number): number => Math.round((count * FPS * 60) / BPM);
