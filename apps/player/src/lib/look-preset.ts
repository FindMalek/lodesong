import { DEFAULT_LOOK, type Look, MONO_CSS } from "./look-code";
import { BASE_KEYS, BASES, THEME_KEYS, THEMES } from "./look-preset-table";

// Offline decode vendored from shadcn@4.21.4 (@shadcn/registry 0.1.3 preset.js); colors: look-preset-table.ts.
const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const STYLES = ["nova", "vega", "maia", "lyra", "mira", "luma", "sera", "rhea"];
const BASE_COLORS = ["neutral", "stone", "zinc", "gray", "mauve", "olive", "mist", "taupe"];
const THEME_NAMES = [
  ...BASE_COLORS.slice(0, 4),
  "amber",
  "blue",
  "cyan",
  "emerald",
  "fuchsia",
  "green",
  "indigo",
  "lime",
  "orange",
  "pink",
  "purple",
  "red",
  "rose",
  "sky",
  "teal",
  "violet",
  "yellow",
  "mauve",
  "olive",
  "mist",
  "taupe",
];
const ICONS = ["lucide", "hugeicons", "tabler", "phosphor", "remixicon"];
const FONT_NAMES = [
  "inter",
  "noto-sans",
  "nunito-sans",
  "figtree",
  "roboto",
  "raleway",
  "dm-sans",
  "public-sans",
  "outfit",
  "jetbrains-mono",
  "geist",
  "geist-mono",
  "lora",
  "merriweather",
  "playfair-display",
  "noto-serif",
  "roboto-slab",
  "oxanium",
  "manrope",
  "space-grotesk",
  "montserrat",
  "ibm-plex-sans",
  "source-sans-3",
  "instrument-sans",
  "eb-garamond",
  "instrument-serif",
];
const RADIUS_NAMES = ["default", "none", "small", "medium", "large"];
const MENU_ACCENTS = ["subtle", "bold"];
const MENU_COLORS = ["default", "inverted", "default-translucent", "inverted-translucent"];
const FIELDS: [string, string[], number][] = [
  ["menuColor", MENU_COLORS, 3],
  ["menuAccent", MENU_ACCENTS, 3],
  ["radius", RADIUS_NAMES, 4],
  ["font", FONT_NAMES, 6],
  ["iconLibrary", ICONS, 6],
  ["theme", THEME_NAMES, 6],
  ["baseColor", BASE_COLORS, 6],
  ["style", STYLES, 6],
];

export interface DecodedPreset {
  baseColor: string;
  theme: string;
  radius: string;
  font: string;
}

/** Accepts the bare code, `--preset <code>` or a `?preset=` link. */
export function presetCodeFrom(input: string): string {
  const text = input.trim();
  const flagged = text.match(/(?:--preset[= ]|[?&]preset=)\s*([0-9A-Za-z]+)/);
  return flagged?.[1] ?? text;
}

export function decodeShadcnPreset(code: string): DecodedPreset | null {
  if (code.length < 2 || code.length > 10 || (code[0] !== "a" && code[0] !== "b")) return null;
  let value = 0;
  for (const char of code.slice(1)) {
    const digit = BASE62.indexOf(char);
    if (digit < 0) return null;
    value = value * 62 + digit;
  }
  const out: Record<string, string> = {};
  let shift = 0;
  for (const [key, values, bits] of FIELDS) {
    const index = Math.floor(value / 2 ** shift) % 2 ** bits;
    out[key] = values[index < values.length ? index : 0] as string;
    shift += bits;
  }
  return out as unknown as DecodedPreset;
}

const MONO_FONTS = ["geist-mono", "jetbrains-mono"];
const RADIUS_PX: Record<string, number> = { none: 0, small: 7, default: 10, medium: 10, large: 14 };

/** Linear RGB from an oklch color. */
function linear(color: string): [number, number, number] | null {
  const match = color.match(/^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
  if (!match) return null;
  const [lightness, chroma, hue] = [Number(match[1]), Number(match[2]), (Number(match[3]) * Math.PI) / 180];
  const a = chroma * Math.cos(hue);
  const b = chroma * Math.sin(hue);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const clamp = (n: number) => Math.min(1, Math.max(0, n));
  return [
    clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    clamp(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

/** WCAG contrast ratio, null for a color it can't read. */
export function contrast(foreground: string, background: string): number | null {
  const [f, g] = [linear(foreground), linear(background)];
  if (!f || !g) return null;
  const luminance = (rgb: [number, number, number]) => 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  const [hi, lo] = [Math.max(luminance(f), luminance(g)), Math.min(luminance(f), luminance(g))];
  return (hi + 0.05) / (lo + 0.05);
}

const TEXT_PAIRS = [
  ["foreground", "background"],
  ["primary-foreground", "primary"],
  ["muted-foreground", "background"],
] as const;

export type PresetResult = { ok: true; look: Look; warnings: string[]; ignored: string } | { ok: false; error: string };

export function resolvePreset(input: string): PresetResult {
  const code = presetCodeFrom(input);
  const decoded = decodeShadcnPreset(code);
  if (!decoded) return { ok: false, error: "that is not a shadcn preset code" };
  const base = BASES[decoded.baseColor];
  const theme = THEMES[decoded.theme];
  if (!base || !theme) return { ok: false, error: `the ${!base ? decoded.baseColor : decoded.theme} color is not available offline` };

  const warnings: string[] = [];
  const blocks = [0, 1].map((mode) => {
    const vars: Record<string, string> = {};
    BASE_KEYS.forEach((key, index) => {
      vars[key] = (base[mode] as string[])[index] as string;
    });
    THEME_KEYS.forEach((key, index) => {
      vars[key] = (theme[mode] as string[])[index] as string;
    });
    for (const [text, surface] of TEXT_PAIRS) {
      const ratio = contrast(vars[text] as string, vars[surface] as string);
      if (ratio !== null && ratio < 4.5) warnings.push(`${mode ? "dark" : "light"}: ${text} on ${surface} is ${ratio.toFixed(1)}:1`);
    }
    return Object.entries(vars)
      .map(([key, value]) => `--${key}:${value}`)
      .join(";");
  });
  const mono = MONO_FONTS.includes(decoded.font);
  const css = `:root{${blocks[0]};--look-radius:${RADIUS_PX[decoded.radius] ?? 10}px}.dark{${blocks[1]}}${mono ? MONO_CSS : ""}`;
  return {
    ok: true,
    look: { ...DEFAULT_LOOK, font: mono ? "mono" : "plex", preset: { code, css } },
    warnings,
    ignored: "style, icons, menu and chart colors are not used, lodesong keeps its own",
  };
}
