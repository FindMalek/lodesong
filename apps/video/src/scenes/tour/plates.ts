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

export function platesOf(capture: string): PlateAsset[] {
  if (capture.startsWith("cap:")) {
    const served = filmManifest.captures[capture.slice(4)];
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
  const name = capture.slice(capture.indexOf(":") + 1);
  const doc = DOC_PLATES[name];
  return doc ? [{ kind: "doc", name, file: name, w: doc.w, h: doc.h, boxes: {}, src: doc.src, light: LIGHT_DOCS.has(name) }] : [];
}

export function plateOf(capture: string): PlateAsset | null {
  const chosen = capture.startsWith("cap:") ? filmManifest.captures[capture.slice(4)]?.plate : undefined;
  const plates = platesOf(capture);
  return plates.find((plate) => plate.name === chosen) ?? plates[0] ?? null;
}

export const mockIdOf = (capture: string): string | null => {
  if (capture.startsWith("mock:")) return capture.slice(5);
  return capture.startsWith("cap:") && !plateOf(capture) ? capture.slice(4) : null;
};
