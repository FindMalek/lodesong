import { applyLookCss, storedLookCss, storeLookCss } from "./look";
import { DEFAULT_LOOK, decodeLook, encodeLook, type Look, lookCss } from "./look-code";
import { getSetting, setSetting } from "./settings";

export function savedLook(): Look {
  return decodeLook(getSetting("look")) ?? DEFAULT_LOOK;
}

/** Shows a look without keeping it. */
export function previewLook(look: Look): void {
  applyLookCss(lookCss(look));
}

export function revertLook(): void {
  applyLookCss(storedLookCss());
}

/** Keeps a look: applied now, stored on this device, synced through the setting. */
export function saveLook(look: Look): void {
  const css = lookCss(look);
  storeLookCss(css);
  applyLookCss(css);
  setSetting("look", css ? encodeLook(look) : "");
}

export async function resolveLook(look: Look): Promise<Look> {
  if (!look.preset || look.preset.css) return look;
  const { resolvePreset } = await import("./look-preset");
  const result = resolvePreset(look.preset.code);
  return result.ok ? result.look : DEFAULT_LOOK;
}

/** After the server's copy arrived: make this device match it. */
export async function syncLook(): Promise<void> {
  const css = lookCss(await resolveLook(savedLook()));
  storeLookCss(css);
  applyLookCss(css);
}
