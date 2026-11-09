import { DEFAULT_LOOK, encodeLook, type Look, lookCss, PRESETS } from "../../../player/src/lib/look-code";

export interface LookInfo {
  name: string;
  code: string;
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

/** What a preset look is made of, from the app's own theme builder: its code and the five tokens that carry it. */
export function lookInfo(name: string, dark: boolean): LookInfo {
  const look = PRESETS.find((preset) => preset.name === name)?.look ?? DEFAULT_LOOK;
  return { name, code: encodeLook(look), dark, swatches: swatchesOf(look, dark) };
}

/** The brand as tokens: five swatches and the theme code that rebuilds them. */
export function TokenStrip({ info }: { info: LookInfo }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
      <div style={{ display: "flex", gap: 8 }}>
        {info.swatches.map((color, i) => (
          <i
            key={NAMES[i]}
            style={{
              display: "block",
              width: 54,
              height: 54,
              background: color,
              border: "2px solid color-mix(in oklch, #888 70%, transparent)",
            }}
          />
        ))}
      </div>
      <span
        data-legible=""
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 30,
          letterSpacing: "0.02em",
          color: info.dark ? "#f3f3f3" : "#141414",
          background: info.dark ? "rgb(10 10 10 / 0.78)" : "rgb(250 250 250 / 0.86)",
          border: `2px solid ${info.dark ? "rgb(255 255 255 / 0.34)" : "rgb(0 0 0 / 0.3)"}`,
          padding: "8px 18px",
          whiteSpace: "nowrap",
        }}
      >
        {info.code}
      </span>
    </div>
  );
}
