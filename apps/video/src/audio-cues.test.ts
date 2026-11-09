import { expect, test } from "bun:test";
import { AUDIO_CUES, FILM_BEATS, FILM_FRAMES, type Film, SECTIONS, SHEET } from "./audio-cues";
import { gridBeat as beat } from "./design/beat";

const FILMS: Film[] = ["hero", "cutdown"];
const forFilm = (film: Film) => AUDIO_CUES.filter((cue) => cue.film === film);
const onQuarterBeat = (frame: number): boolean => Math.abs(frame - Math.round(frame / (beat(1) / 4)) * (beat(1) / 4)) <= 0.5;

test("each film is sorted, unique and inside its length", () => {
  for (const film of FILMS) {
    const cues = forFilm(film);
    const frames = cues.map((cue) => cue.frame);
    expect(frames).toEqual([...frames].sort((a, b) => a - b));
    expect(frames.every((frame) => Number.isInteger(frame) && frame >= 0 && frame < FILM_FRAMES[film])).toBe(true);
  }
  const ids = AUDIO_CUES.map((cue) => cue.id);
  expect(new Set(ids).size).toBe(ids.length);
});

test("sounds sit on the quarter-beat grid, kicks on half beats, except the terminal typing", () => {
  const typed = (label: string): boolean => label.startsWith("terminal types");
  const off = AUDIO_CUES.filter((cue) => !typed(cue.label) && !onQuarterBeat(cue.frame)).map((cue) => cue.id);
  const kicks = AUDIO_CUES.filter((cue) => cue.kind === "kick" && cue.frame % (beat(1) / 2) !== 0).map((cue) => cue.id);
  expect({ off, kicks }).toEqual({ off: [], kicks: [] });
});

test("keycaps and typed keys exist and the gold impact is a single hero moment", () => {
  const hero = forFilm("hero");
  expect(hero.filter((cue) => cue.kind === "key").length).toBeGreaterThanOrEqual(15);
  expect(hero.filter((cue) => cue.label === "cover turns gold")).toHaveLength(1);
  expect(forFilm("cutdown").filter((cue) => cue.label === "cover turns gold")).toHaveLength(1);
});

test("the cutdown has its hook inside two seconds and both films end on the lodesong motif", () => {
  const early = forFilm("cutdown").filter((cue) => cue.frame < 120);
  expect(early.length).toBeGreaterThanOrEqual(3);
  for (const film of FILMS) {
    const motif = forFilm(film).filter((cue) => cue.label.startsWith("lodesong:"));
    expect(motif.map((cue) => cue.kind)).toEqual(["ping", "ping"]);
    expect(motif[1]?.frame).toBe((motif[0]?.frame ?? 0) + beat(0.5));
    expect(motif[1]?.frame).toBeLessThan(FILM_FRAMES[film]);
  }
});

test("risers, swells and whooshes carry a length that ends inside the film", () => {
  const lasting = SHEET.filter((cue) => ["riser", "swell", "whoosh"].includes(cue.kind));
  const bad = lasting.filter((cue) => !cue.length || cue.frame + cue.length > FILM_FRAMES[cue.film]).map((cue) => cue.id);
  expect(bad).toEqual([]);
});

test("sections tile each film without gaps", () => {
  for (const film of FILMS) {
    const sections = SECTIONS[film];
    expect(sections[0]?.from).toBe(0);
    expect(sections.at(-1)?.to).toBe(FILM_BEATS[film]);
    expect(FILM_FRAMES[film]).toBe(beat(FILM_BEATS[film]));
    for (const [i, section] of sections.entries()) if (i > 0) expect(section.from).toBe(sections[i - 1]?.to ?? -1);
  }
});
