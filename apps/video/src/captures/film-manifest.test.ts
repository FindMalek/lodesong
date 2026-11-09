import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  captureOf,
  eventsOf,
  featuresOf,
  filmManifest,
  lyricWords,
  plateBox,
  plateOf,
  plateScale,
  plateSize,
  plateSrc,
  take,
  videoSrc,
} from "./film-manifest";

const FILM = join(import.meta.dir, "../../public/film");
const takes = Object.values(filmManifest.features);
const HAS_PLATES = existsSync(join(FILM, "find-the-line"));

test.skipIf(!HAS_PLATES)("every plate and video the manifest names is a file in public/film", () => {
  const files = takes.flatMap((item) => [...item.plates.map((plate) => plate.file), ...(item.video ? [item.video.file] : [])]);
  expect(files.length).toBeGreaterThan(100);
  expect(files.filter((file) => !existsSync(join(FILM, file)))).toEqual([]);
});

test("every capture points at a recipe and plate that exist, and no feature is served twice", () => {
  const seen = new Set<string>();
  for (const [name, served] of Object.entries(filmManifest.captures)) {
    const owner = take(served.recipe);
    if (served.plate) expect(owner.plates.some((plate) => plate.name === served.plate) || owner.video !== undefined).toBe(true);
    for (const id of served.features) {
      expect(seen.has(id)).toBe(false);
      seen.add(id);
      expect(captureOf(id).capture).toBe(name);
    }
  }
  expect(seen.size).toBe(125);
});

test("boxes are real rectangles inside their plate, in CSS pixels", () => {
  for (const item of takes)
    for (const plate of item.plates)
      for (const box of Object.values(plate.boxes)) {
        expect(box.w).toBeGreaterThan(0);
        expect(box.h).toBeGreaterThan(0);
        expect(box.x).toBeGreaterThanOrEqual(-1);
        expect(box.x + box.w).toBeLessThanOrEqual((plate.w ?? item.w) + 1);
      }
});

test("lookups give the plate, its box, its scale and its static path", () => {
  expect(plateSrc("find-the-line", "results")).toBe("/film/find-the-line/results.png");
  expect(plateBox("find-the-line", "results", "input").w).toBeGreaterThan(300);
  expect(plateScale("find-the-line")).toBe(2);
  expect(plateScale("phone-home")).toBe(3);
  expect(plateSize("find-the-line", "results")).toEqual({ w: 2880, h: 1620 });
  expect(plateOf("devices", "phone-after").device).toBe("phone");
  expect(plateScale("devices", "phone-after")).toBe(3);
  expect(videoSrc("scroll-10k")).toBe("/film/scroll-10k/scroll.mp4");
  expect(eventsOf("find-the-line").some((event) => event.kind === "key" && event.key === "Meta+K")).toBe(true);
  expect(() => plateBox("find-the-line", "results", "nope")).toThrow("no box");
});

test("a capture lists the features that ride on it, and a feature finds its capture", () => {
  expect(featuresOf("cmdk-typos")).toEqual(["search-typos", "search-artist-title"]);
  expect(captureOf("search-typos")).toEqual({ capture: "cmdk-typos", recipe: "cmdk-typos" });
  expect(captureOf("queue-undo").plate).toBe("undo");
});

test("the featured song's words come out in time order with their line", () => {
  const words = lyricWords();
  expect(words.length).toBeGreaterThan(50);
  expect(words.every((word, index) => index === 0 || word.start >= (words[index - 1]?.start ?? 0))).toBe(true);
  expect(words[0]).toEqual({ start: 0, text: "your", line: 0 });
});
