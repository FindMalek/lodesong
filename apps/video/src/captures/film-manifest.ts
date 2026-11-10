import { getRemotionEnvironment, staticFile } from "remotion";
import type { Box, Event, Manifest, Plate, Take } from "../../../../scripts/hero/film/types";
import raw from "../../public/film/manifest.json";

export type { Box, Event, Manifest, Plate, Take };

export const filmManifest = raw as unknown as Manifest;

function optimisedFiles(): Record<string, string> {
  if (typeof require.context !== "function") return {};
  const context = require.context("../../public/film", false, /^\.\/optimised\.json$/);
  return context.keys().length ? (context("./optimised.json") as Record<string, string>) : {};
}

const OPTIMISED = optimisedFiles();

/** Studio gets the optimised twin written by `film:optimize`; renders always read the original. */
const filmFile = (file: string): string => staticFile(`film/${(getRemotionEnvironment().isStudio ? OPTIMISED[file] : undefined) ?? file}`);

export interface Word {
  start: number;
  text: string;
  line: number;
}

function missing(what: string): never {
  throw new Error(`film manifest: no ${what}`);
}

export const take = (id: string): Take => filmManifest.features[id] ?? missing(`take "${id}"`);

export const plateOf = (takeId: string, plateName: string): Plate =>
  take(takeId).plates.find((plate) => plate.name === plateName) ?? missing(`plate "${takeId}/${plateName}"`);

export const plateSrc = (takeId: string, plateName: string): string => filmFile(plateOf(takeId, plateName).file);

export const videoSrc = (takeId: string): string => staticFile(`film/${take(takeId).video?.file ?? missing(`video in "${takeId}"`)}`);

export const plateBox = (takeId: string, plateName: string, boxName: string): Box =>
  plateOf(takeId, plateName).boxes[boxName] ?? missing(`box "${boxName}" on "${takeId}/${plateName}"`);

export const eventsOf = (takeId: string): readonly Event[] => take(takeId).events;

/** Plate pixels per CSS pixel: the plate's own device scale, else its take's (a phone plate inside a desktop take has its own). */
export const plateScale = (takeId: string, plateName?: string): number =>
  (plateName ? plateOf(takeId, plateName).dsf : undefined) ?? take(takeId).dsf;

export function plateSize(takeId: string, plateName: string): { w: number; h: number } {
  const owner = take(takeId);
  const plate = plateOf(takeId, plateName);
  const scale = plateScale(takeId, plateName);
  return { w: (plate.w ?? owner.w) * scale, h: (plate.h ?? owner.h) * scale };
}

export const featuresOf = (captureName: string): readonly string[] =>
  filmManifest.captures[captureName]?.features ?? missing(`capture "${captureName}"`);

export function captureOf(featureId: string): { capture: string; recipe: string; plate?: string } {
  for (const [capture, served] of Object.entries(filmManifest.captures))
    if (served.features.includes(featureId)) return { capture, recipe: served.recipe, ...(served.plate ? { plate: served.plate } : {}) };
  return missing(`capture for feature "${featureId}"`);
}

/** Every word of the featured song with its start in seconds, in order: the cue source for lyric plucks and the karaoke fill. */
export function lyricWords(): Word[] {
  const lyrics = filmManifest.lyrics ?? missing("lyrics");
  return lyrics.lines.flatMap((line, index) =>
    (line.words ?? [{ start: line.start, text: line.text }]).map((word) => ({ start: word.start / 1000, text: word.text, line: index })),
  );
}
