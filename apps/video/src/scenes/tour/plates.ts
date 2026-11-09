import { filmManifest, take } from "../../captures/film-manifest";
import type { Box } from "../../design/probe";
import { DOC_PLATES } from "./docs-plates";

export interface PlateAsset {
  kind: "film" | "doc";
  name: string;
  file: string;
  w: number;
  h: number;
  boxes: Record<string, Box>;
  src?: string;
  /** a light-theme screenshot: shown a step dimmer so it does not flash against the dark film */
  light?: boolean;
}

const LIGHT_DOCS = new Set([
  "phone-lyrics-coverage.png",
  "search-mood-fit.png",
  "search-vibe.png",
  "mix-covers-dither.png",
  "following-page.png",
  "new-from-follows.png",
  "follow-sync.png",
  "import-ai-metadata.png",
  "genres-inferred.png",
  "stats-desktop-light.png",
  "history-fr.png",
  "scrobbling-setting.png",
  "phone-albums-filters-open.png",
  "phone-artists-strip.png",
  "playlist-folders.png",
  "playlist-folder-move.png",
  "playlist-folder-edit.png",
  "album-lyrics-light.png",
  "sidebar-resize.png",
  "macos/compact.png",
  "phone-light.png",
  "phone-albums-filters.png",
  "language-setting.png",
  "a11y-radio.png",
  "public-demo.png",
  "og-share-menu.png",
]);

/** docs/radio.png is committed as an empty file, so the radio station borrows the captured radio plate. */
const SUBSTITUTE: Record<string, string> = { "doc:radio.png": "cap:radio-tune" };

export function platesOf(capture: string): PlateAsset[] {
  const ref = SUBSTITUTE[capture] ?? capture;
  if (ref.startsWith("cap:")) {
    const served = filmManifest.captures[ref.slice(4)];
    if (!served) return [];
    const owner = take(served.recipe);
    return owner.plates.map((plate) => ({
      kind: "film",
      name: plate.name,
      file: plate.file,
      w: plate.w ?? owner.w,
      h: plate.h ?? owner.h,
      boxes: plate.boxes,
    }));
  }
  const name = ref.slice(ref.indexOf(":") + 1);
  const doc = DOC_PLATES[name];
  return doc ? [{ kind: "doc", name, file: name, w: doc.w, h: doc.h, boxes: {}, src: doc.src, light: LIGHT_DOCS.has(name) }] : [];
}

export function plateOf(capture: string): PlateAsset | null {
  const ref = SUBSTITUTE[capture] ?? capture;
  const chosen = ref.startsWith("cap:") ? filmManifest.captures[ref.slice(4)]?.plate : undefined;
  const plates = platesOf(ref);
  return plates.find((plate) => plate.name === chosen) ?? plates[0] ?? null;
}

export const mockIdOf = (capture: string): string | null => {
  const ref = SUBSTITUTE[capture] ?? capture;
  if (ref.startsWith("mock:")) return ref.slice(5);
  return ref.startsWith("cap:") && !plateOf(ref) ? ref.slice(4) : null;
};
