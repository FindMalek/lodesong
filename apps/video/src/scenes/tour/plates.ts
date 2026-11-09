import manifest from "../../../public/film/manifest.json";
import type { Box } from "../../design/probe";
import { DOC_PLATES } from "./docs-plates";

interface ManifestPlate {
  name: string;
  file: string;
  boxes: Record<string, Box>;
  device?: string;
  w?: number;
  h?: number;
}

interface ManifestFeature {
  w: number;
  h: number;
  plates: ManifestPlate[];
}

interface ManifestCapture {
  recipe: string;
  plate?: string;
  features: string[];
}

interface Manifest {
  captures: Record<string, ManifestCapture>;
  features: Record<string, ManifestFeature>;
}

const MANIFEST = manifest as unknown as Manifest;

export interface PlateAsset {
  kind: "film" | "doc";
  name: string;
  /** film: path under public/film/; doc: the file name under docs/ */
  file: string;
  /** the plate in the px its boxes use */
  w: number;
  h: number;
  boxes: Record<string, Box>;
  src?: string;
}

/** docs/radio.png is committed as an empty file, so the radio station borrows the captured radio plate. */
const SUBSTITUTE: Record<string, string> = { "doc:radio.png": "cap:radio-tune" };

const filmPlate = (recipe: string, plate: ManifestPlate): PlateAsset | null => {
  const feature = MANIFEST.features[recipe];
  if (!feature) return null;
  return { kind: "film", name: plate.name, file: plate.file, w: plate.w ?? feature.w, h: plate.h ?? feature.h, boxes: plate.boxes };
};

/** All plates of one capture, in order: the sequence a chapter can play through (a typed query, a word sweep, before and after). */
export function platesOf(capture: string): PlateAsset[] {
  const ref = SUBSTITUTE[capture] ?? capture;
  if (ref.startsWith("cap:")) {
    const entry = MANIFEST.captures[ref.slice(4)];
    const feature = entry ? MANIFEST.features[entry.recipe] : undefined;
    if (!entry || !feature) return [];
    return feature.plates.flatMap((plate) => filmPlate(entry.recipe, plate) ?? []);
  }
  const name = ref.slice(ref.indexOf(":") + 1);
  const doc = DOC_PLATES[name];
  return doc ? [{ kind: "doc", name, file: name, w: doc.w, h: doc.h, boxes: {}, src: doc.src }] : [];
}

/** The plate a feature stands on: the manifest's chosen plate for a capture, the whole image for a doc. */
export function plateOf(capture: string): PlateAsset | null {
  const ref = SUBSTITUTE[capture] ?? capture;
  if (ref.startsWith("cap:")) {
    const entry = MANIFEST.captures[ref.slice(4)];
    const plates = platesOf(ref);
    return plates.find((plate) => plate.name === entry?.plate) ?? plates[0] ?? null;
  }
  return platesOf(ref)[0] ?? null;
}

/** The mock a capture falls back to: a `mock:` id, or a `cap:` id the capture rig could not make. */
export const mockIdOf = (capture: string): string | null => {
  const ref = SUBSTITUTE[capture] ?? capture;
  if (ref.startsWith("mock:")) return ref.slice(5);
  return ref.startsWith("cap:") && !plateOf(ref) ? ref.slice(4) : null;
};
