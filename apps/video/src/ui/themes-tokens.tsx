import { DEFAULT_LOOK, type Look, lookCss, PRESETS } from "../../../player/src/lib/look-code";

export interface LookInfo {
  name: string;
  dark: boolean;
  swatches: string[];
}

const BRAND = {
  light: ["oklch(0.944 0 0)", "oklch(0.97 0 0)", "oklch(0.837 0 0)", "oklch(0.178 0 0)", "oklch(0.178 0 0)"],
  dark: ["#101010", "#191919", "#262626", "#ebebeb", "#ebebeb"],
};
const NAMES = ["background", "card", "border", "foreground", "primary"] as const;

function swatchesOf(look: Look, dark: boolean): string[] {
  const css = lookCss(look);
  if (!css) return dark ? BRAND.dark : BRAND.light;
  const block = dark ? css.slice(css.indexOf(".dark{")) : css.slice(0, css.indexOf(".dark{"));
  return NAMES.map((name) => new RegExp(`--${name}:(oklch\\([^)]*\\))`).exec(block)?.[1] ?? "transparent");
}

/** What a preset look is made of, from the app's own theme builder: the five tokens that carry it. */
export function lookInfo(name: string, dark: boolean): LookInfo {
  const look = PRESETS.find((preset) => preset.name === name)?.look ?? DEFAULT_LOOK;
  return { name, dark, swatches: swatchesOf(look, dark) };
}

/** The look as five swatches on a plain panel in its own ground, so they never sit straight on the album art. */
export function TokenStrip({ info }: { info: LookInfo }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        padding: 14,
        background: info.dark ? "rgb(10 10 10 / 0.9)" : "rgb(250 250 250 / 0.92)",
        border: `2px solid ${info.dark ? "rgb(255 255 255 / 0.34)" : "rgb(0 0 0 / 0.3)"}`,
      }}
    >
      {info.swatches.map((color, i) => (
        <i
          key={NAMES[i]}
          style={{
            display: "block",
            width: 64,
            height: 64,
            background: color,
            border: "2px solid color-mix(in oklch, #888 70%, transparent)",
          }}
        />
      ))}
    </div>
  );
}
