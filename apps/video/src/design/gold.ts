/** Ink to the film's one accent colour: t is 0 for the monochrome product, 1 for the song that is playing. */
export const gold = (t: number): string => `color-mix(in oklch, var(--foreground) ${(1 - t) * 100}%, var(--ignite))`;

export const glowOf = (t: number, size: number): string =>
  `radial-gradient(circle, color-mix(in oklch, var(--ignite) ${Math.round(t * size)}%, transparent), transparent 68%)`;
