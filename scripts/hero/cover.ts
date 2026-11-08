import { BAYER, field } from "../demo/cover";
import { rgbPng } from "../demo/png";

type Rgb = [number, number, number];
type Palette = [string, string, string];

const PALETTES: Palette[] = [
  ["#0b1026", "#3b5bdb", "#dbe4ff"],
  ["#1a0a05", "#e8590c", "#ffe8cc"],
  ["#1f0614", "#d6336c", "#ffdeeb"],
  ["#07140c", "#2f9e44", "#d3f9d8"],
  ["#120a24", "#7048e8", "#e5dbff"],
  ["#111111", "#868e96", "#f1f3f5"],
  ["#041a1c", "#0c8599", "#c5f6fa"],
  ["#1a1203", "#f59f00", "#fff3bf"],
];

const LEVELS = 4;

function rgb(hex: string): Rgb {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function ramp(palette: Palette, t: number): Rgb {
  const [dark, mid, light] = palette.map(rgb) as [Rgb, Rgb, Rgb];
  const [from, to, local] = t < 0.5 ? [dark, mid, t * 2] : [mid, light, (t - 0.5) * 2];
  return from.map((channel, index) => Math.round(channel + ((to[index] ?? 0) - channel) * local)) as Rgb;
}

export function colourCover(index: number, size = 512): Uint8Array<ArrayBuffer> {
  const palette = PALETTES[index % PALETTES.length] as Palette;
  const swatches = Array.from({ length: LEVELS }, (_, level) => ramp(palette, level / (LEVELS - 1)));
  const f = field(index + Math.floor(index / PALETTES.length), index * 7919 + 13);
  const pixels = new Uint8Array(size * size * 3);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const value = Math.min(1, Math.max(0, f(x / size, y / size))) * (LEVELS - 1);
      const base = Math.floor(value);
      const threshold = ((BAYER[(y >> 1) % 8]?.[(x >> 1) % 8] ?? 0) + 0.5) / 64;
      const level = Math.min(LEVELS - 1, value - base > threshold ? base + 1 : base);
      pixels.set(swatches[level] as Rgb, (y * size + x) * 3);
    }
  }
  return rgbPng(size, pixels);
}
