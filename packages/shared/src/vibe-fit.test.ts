import { expect, test } from "bun:test";
import { parseQuery } from "./search-query";
import { fitsSound, playlistFit, type Sound, songFit } from "./vibe-fit";
import { VIBES, type Vibe } from "./vibes";

const vibe = (label: string): Vibe => {
  const found = VIBES.find((item) => item.label === label);
  if (!found) throw new Error(label);
  return found;
};
const gym = vibe("gym").profile;
const song = (energy: number, valence: number, bpm: number): Sound => ({ energy, valence, bpm });

test("a song inside the range scores 1, and the score falls to 0 over the margin outside it", () => {
  expect(songFit(gym, song(0.7, 0.1, 110))).toBe(1);
  expect(songFit(gym, song(1, 0.9, 200))).toBe(1);
  expect(songFit({ energy: [0.7, 1] }, song(0.6, 0, 0))).toBeCloseTo(0.5);
  expect(songFit({ energy: [0.7, 1] }, song(0.5, 0, 0))).toBeCloseTo(0);
  expect(songFit({ bpm: [110, Number.POSITIVE_INFINITY] }, song(0, 0, 95))).toBeCloseTo(0.5);
  expect(songFit({ bpm: [110, Number.POSITIVE_INFINITY] }, song(0, 0, 80))).toBe(0);
  expect(songFit({ valence: [0, 0.5] }, song(0, 0.6, 0))).toBeCloseTo(0.5);
});

test("every feature the mood constrains has to fit, the others don't count", () => {
  expect(songFit(gym, song(0.7, 0, 80))).toBe(0);
  expect(songFit(gym, song(0.5, 0, 110))).toBeCloseTo(0);
  expect(songFit(gym, song(0.6, 0, 100))).toBeCloseTo(0.5 * (2 / 3));
  expect(songFit(vibe("rainy days").profile, song(0.1, 1, 300))).toBe(1);
});

test("a playlist scores the average of its songs and says how it sounds", () => {
  const fit = playlistFit(gym, [song(0.9, 0.5, 130), song(0.8, 0.5, 120), song(0.5, 0.5, 130)]);
  expect(fit.score).toBeCloseTo(2 / 3);
  expect(fit.reasons).toEqual(["loud", "fast"]);
  expect(playlistFit(gym, [])).toEqual({ score: 0, reasons: [] });
});

test("reasons only name what the playlist really is, in the direction the mood wants", () => {
  expect(playlistFit(gym, [song(0.9, 0, 80)]).reasons).toEqual(["loud"]);
  expect(playlistFit(gym, [song(0.6, 0, 130)]).reasons).toEqual(["fast"]);
  expect(playlistFit(vibe("melancholy").profile, [song(0.2, 0.2, 90)]).reasons).toEqual(["quiet", "dark"]);
  expect(playlistFit(vibe("happy").profile, [song(0.8, 0.9, 90)]).reasons).toEqual(["loud", "bright"]);
  expect(playlistFit(vibe("late night").profile, [song(0.2, 0, 70)]).reasons).toEqual(["quiet", "slow"]);
  expect(playlistFit(vibe("focus").profile, [song(0.5, 0, 90)]).reasons).toEqual(["steady"]);
  expect(playlistFit(vibe("focus").profile, [song(0.9, 0, 90)]).reasons).toEqual([]);
  expect(playlistFit(gym, [song(0.68, 0, 130)]).reasons).toEqual(["loud", "fast"]);
  expect(playlistFit(gym, [song(0.64, 0, 130)]).reasons).toEqual(["fast"]);
  expect(playlistFit({ valence: [0.3, 0.7] }, [song(0, 0.5, 0)]).reasons).toEqual([]);
});

test("a playlist is judged only when enough of it is analysed and it scores well", () => {
  const good = { score: 0.65, reasons: [] };
  expect(fitsSound(good, 3, 6)).toBe(true);
  expect(fitsSound({ ...good, score: 0.64 }, 3, 6)).toBe(false);
  expect(fitsSound(good, 2, 4)).toBe(false);
  expect(fitsSound(good, 2, 2)).toBe(true);
  expect(fitsSound(good, 1, 1)).toBe(true);
  expect(fitsSound(good, 4, 9)).toBe(false);
  expect(fitsSound(good, 5, 10)).toBe(true);
  expect(fitsSound(good, 0, 0)).toBe(false);
});

test("every profile says what its search query says", () => {
  const sad = { energy: [0, 0.5], valence: [0, 0.5] };
  const chill = { energy: [0, 0.5], valence: [0.5, 1] };
  const upbeat = { energy: [0.5, 1], valence: [0.5, 1] };
  const moods: Record<string, object> = { sad, chill, upbeat };
  for (const item of VIBES) {
    const { filters } = parseQuery(item.query);
    const expected = {
      ...(filters.mood ? moods[filters.mood] : {}),
      ...(filters.energy && { energy: filters.energy }),
      ...(filters.bpm && { bpm: filters.bpm }),
    };
    expect(item.profile).toEqual(expected);
  }
});
