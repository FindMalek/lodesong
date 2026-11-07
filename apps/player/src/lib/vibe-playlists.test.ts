import { expect, test } from "bun:test";
import { FIT_REASONS } from "@lodesong/shared/vibe-fit";
import { VIBES } from "@lodesong/shared/vibes";
import en from "@/locales/en.json";
import fr from "@/locales/fr.json";
import { t } from "./i18n";
import type { Playlist } from "./types";
import { fitWords, moodPollMs, vibePlaylists } from "./vibe-playlists";

const gym = VIBES[0] as (typeof VIBES)[number];
const list = (...names: string[]): Playlist[] => names.map((name, index) => ({ id: `p${index}`, name, songCount: 10, duration: 0 }));
const ids = (found: ReturnType<typeof vibePlaylists>) => found.map(({ playlist }) => playlist.id);

test("without the server's answer the names decide, whole words only, at most 4", () => {
  const playlists = list("Gym 1", "Runaway", "Gym 2", "Gym 3", "Gym 4", "Gym 5", "Workout");
  const found = vibePlaylists(gym, playlists, undefined);
  expect(ids(found)).toEqual(["p0", "p2", "p3", "p4"]);
  expect(found[0]?.reasons).toEqual(["name"]);
});

test("the server's ranking and reasons are used, for playlists that still exist, at most 4", () => {
  const playlists = list("a", "b", "c", "d", "e", "f");
  const fit = {
    mood: "gym",
    playlists: [
      { id: "p4", reasons: ["loud" as const, "fast" as const] },
      { id: "gone", reasons: [] },
      { id: "p1", reasons: ["name" as const] },
      { id: "p0", reasons: [] },
      { id: "p2", reasons: [] },
      { id: "p3", reasons: [] },
    ],
  };
  const found = vibePlaylists(gym, playlists, fit);
  expect(ids(found)).toEqual(["p4", "p1", "p0", "p2"]);
  expect(found[0]?.reasons).toEqual(["loud", "fast"]);
});

test("an answer for another mood is never shown", () => {
  const playlists = list("Gym", "Quiet one");
  const stale = { mood: "melancholy", playlists: [{ id: "p1", reasons: ["quiet" as const] }] };
  expect(ids(vibePlaylists(gym, playlists, stale))).toEqual(["p0"]);
});

test("a server answer with nothing in it shows nothing, even if a name matched before it came", () => {
  expect(vibePlaylists(gym, list("Gym"), { mood: "gym", playlists: [] })).toEqual([]);
});

test("polling for the rest of the ranking stops once it is complete or after a few tries", () => {
  const at = (complete: boolean, dataUpdateCount: number) => moodPollMs({ data: { complete }, dataUpdateCount });
  expect(at(false, 1)).toBe(3000);
  expect(at(false, 4)).toBe(3000);
  expect(at(false, 5)).toBe(false);
  expect(at(true, 1)).toBe(false);
  expect(moodPollMs({ dataUpdateCount: 0 })).toBe(false);
});

test("a playlist that fits by sound alone still says something, in every language", () => {
  expect(fitWords(["loud", "fast"], t)).toBe("loud, fast");
  expect(fitWords([], t)).toBe("fits the mood");
  expect(fr).toHaveProperty(["fit.mood"]);
});

test("every reason the server can give has words in every language", () => {
  for (const reason of FIT_REASONS) {
    expect(en).toHaveProperty([`fit.${reason}`]);
    expect(fr).toHaveProperty([`fit.${reason}`]);
  }
});
