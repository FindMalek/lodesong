import { expect, test } from "bun:test";
import { discoveryLane, familiarShare } from "./mix-discovery";
import { keyOf, type Listening, seeded } from "./mixes";

const NOW = Date.UTC(2026, 9, 24, 12);
const song = (artist: string, i: number) => ({ id: `${artist}-${i}`, artist, title: `${artist} ${i}` });
const keys = (artist: string, from: number, to: number) => Array.from({ length: to - from }, (_, i) => keyOf(song(artist, from + i)));

/** Artists with `count` songs each; `level` analyses an artist's songs at that sound, and the mix artist "seed" is always analysed and played. */
function world(count: Record<string, number>, level: Record<string, number> = {}, together: Record<string, [string, number][]> = {}) {
  const l: Listening = {
    plays: [],
    byArtist: new Map(),
    counts: new Map(),
    playedKeys: new Set(),
    together: new Map(Object.entries(together).map(([artist, row]) => [artist, new Map(row)])),
    signals: new Map(),
    liked: new Set(),
    sounds: new Map(),
    familiar: 0.6,
    now: NOW,
  };
  for (const [artist, n] of Object.entries(count)) {
    l.byArtist.set(
      artist,
      Array.from({ length: n }, (_, i) => song(artist, i)),
    );
    const at = level[artist];
    if (at !== undefined)
      l.sounds.set(
        artist,
        Array.from({ length: n }, (_, i) => ({
          song: song(artist, i),
          key: keyOf(song(artist, i)),
          features: { bpm: 0, key: "", energy: at, valence: at, danceability: at },
        })),
      );
  }
  for (const key of keys("seed", 0, 3)) l.playedKeys.add(key);
  return l;
}
const lane = (l: Listening, left: number, cap: number, avoid = new Set<string>(), seed = "a") =>
  discoveryLane(l, ["seed"], left, cap, keyOf, avoid, seeded(seed));
const from = (songs: { artist?: string }[], artist: string) => songs.filter((item) => item.artist === artist);

test("the lane is half of what's left, from the artists nearest in sound", () => {
  const l = world({ seed: 10, near: 20, far: 20 }, { seed: 0.5, near: 0.5, far: 0.9 });
  const songs = lane(l, 20, 20);
  expect(songs).toHaveLength(10);
  expect(from(songs, "near")).toHaveLength(10);
});

test("equally near songs rotate with the seed", () => {
  const l = world({ seed: 10, a: 30, b: 30 }, { seed: 0.5, a: 0.5, b: 0.5 });
  const [one, two] = ["x", "y"].map((seed) =>
    lane(l, 20, 20, new Set(), seed)
      .map((item) => item.id)
      .sort()
      .join(),
  );
  expect(one).not.toBe(two);
});

test("one artist takes at most the cap, played songs never come back, and songs from the last days wait", () => {
  const l = world({ seed: 10, a: 30, b: 30 }, { seed: 0.5, a: 0.5, b: 0.55 });
  for (const key of keys("a", 0, 5)) l.playedKeys.add(key);
  const songs = lane(l, 40, 8);
  expect(from(songs, "a")).toHaveLength(8);
  expect(songs.some((item) => Number(item.title?.split(" ")[1]) < 5 && item.artist === "a")).toBe(false);
  const avoided = new Set(keys("a", 5, 30));
  expect(from(lane(l, 40, 20, avoided), "a")).toHaveLength(0);
  expect(from(lane(world({ seed: 10, a: 30 }, { seed: 0.5, a: 0.5 }), 40, 20, new Set(keys("a", 0, 30))), "a")).toHaveLength(20);
});

test("songs you skipped are left out of the sound lane and songs you like come a little earlier", () => {
  const l = world({ seed: 10, skipped: 10, plain: 10, liked: 10 }, { seed: 0.5, skipped: 0.5, plain: 0.5, liked: 0.6 });
  for (const key of keys("skipped", 0, 10)) l.signals.set(key, { plays: 0, skips: 5, last: 0 });
  for (const key of keys("liked", 0, 10)) l.liked.add(key);
  const songs = lane(l, 20, 10);
  expect(from(songs, "skipped")).toHaveLength(0);
  expect(from(songs, "liked").length).toBeGreaterThanOrEqual(7);
});

test("a thin lane stays thin rather than serve songs you skipped, and a liked song far in sound doesn't beat the near ones", () => {
  const l = world({ seed: 10, plain: 3, skipped: 10 }, { seed: 0.5, plain: 0.5, skipped: 0.5 });
  for (const key of keys("skipped", 0, 10)) l.signals.set(key, { plays: 0, skips: 5, last: 0 });
  expect(lane(l, 20, 10).map((item) => item.artist)).toEqual(["plain", "plain", "plain"]);
  const far = world({ seed: 10, plain: 10, farLiked: 10 }, { seed: 0.5, plain: 0.5, farLiked: 0.9 });
  for (const key of keys("farLiked", 0, 10)) far.liked.add(key);
  expect(from(lane(far, 20, 10), "farLiked")).toHaveLength(0);
});

test("a thin sound lane is topped up with the artists played next to the mix, without repeating a song", () => {
  const l = world(
    { seed: 10, a: 6, b: 10, c: 10 },
    { seed: 0.5, a: 0.5 },
    {
      seed: [
        ["a", 30],
        ["b", 20],
        ["c", 10],
      ],
    },
  );
  l.sounds.set("a", l.sounds.get("a")?.slice(0, 3) ?? []);
  const songs = lane(l, 20, 4);
  expect(songs).toHaveLength(10);
  expect(new Set(songs.map(keyOf)).size).toBe(10);
  expect(from(songs, "a")).toHaveLength(4);
  expect(from(songs, "b")).toHaveLength(3);
  expect(from(songs, "c")).toHaveLength(3);
});

test("without analysis the lane is the artists played most next to the mix, walking past those with nothing left to offer", () => {
  const together: [string, number][] = [
    ...Array.from({ length: 20 }, (_, i): [string, number] => [`spent${i}`, 8]),
    ...Array.from({ length: 20 }, (_, i): [string, number] => [`fresh${i}`, 1]),
  ];
  const l = world({ seed: 10, ...Object.fromEntries(together.map(([artist]) => [artist, 3])) }, {}, { seed: together });
  for (let i = 0; i < 20; i++) for (const key of keys(`spent${i}`, 0, 3)) l.playedKeys.add(key);
  const songs = lane(l, 30, 2);
  expect(songs).toHaveLength(15);
  expect(songs.every((item) => item.artist?.startsWith("fresh"))).toBe(true);
});

test("the company lane keeps to the cap, to unplayed songs, and sends songs from the last days to the back", () => {
  const l = world({ seed: 10, a: 40 }, {}, { seed: [["a", 5]] });
  for (const key of keys("a", 0, 10)) l.playedKeys.add(key);
  const avoided = new Set(keys("a", 10, 40));
  const songs = lane(l, 40, 6, avoided);
  expect(songs).toHaveLength(6);
  expect(songs.every((item) => Number(item.title?.split(" ")[1]) >= 10)).toBe(true);
  const fresh = lane(l, 40, 6, new Set(keys("a", 10, 15)));
  expect(fresh.some((item) => Number(item.title?.split(" ")[1]) < 15)).toBe(false);
});

test("the artists played most next to the mix come first, then alphabetically, and within an artist liked songs lead and skipped ones trail", () => {
  const l = world(
    { seed: 10, zeta: 10, alpha: 10 },
    {},
    {
      seed: [
        ["zeta", 3],
        ["alpha", 3],
      ],
    },
  );
  expect(lane(l, 2, 1).map((item) => item.artist)).toEqual(["alpha"]);
  const strong = world(
    { seed: 10, aardvark: 10, strong: 10 },
    {},
    {
      seed: [
        ["aardvark", 1],
        ["strong", 9],
      ],
    },
  );
  expect(lane(strong, 2, 1).map((item) => item.artist)).toEqual(["strong"]);
  const taste = world({ seed: 10, a: 10 }, {}, { seed: [["a", 3]] });
  for (const key of keys("a", 7, 10)) taste.liked.add(key);
  for (const key of keys("a", 0, 3)) taste.signals.set(key, { plays: 0, skips: 5, last: 0 });
  expect(
    lane(taste, 6, 3)
      .map((item) => Number(item.title?.split(" ")[1]))
      .sort(),
  ).toEqual([7, 8, 9]);
});

test("a lane has nothing to offer when nothing is analysed and nobody was played next to the mix", () => {
  expect(lane(world({ seed: 10, a: 10 }), 40, 10)).toEqual([]);
});

test("someone who never repeats gets 40% familiar songs, a heavy repeater up to 85%, and no one more than a looped song allows", () => {
  expect(familiarShare(new Map())).toBe(0.4);
  expect(
    familiarShare(
      new Map([
        ["a", 1],
        ["b", 1],
        ["c", 1],
      ]),
    ),
  ).toBe(0.4);
  expect(
    familiarShare(
      new Map([
        ["a", 2],
        ["b", 2],
      ]),
    ),
  ).toBeCloseTo(0.625);
  expect(familiarShare(new Map([["a", 5]]))).toBeCloseTo(0.4 + 0.45 * 0.8);
  expect(familiarShare(new Map([["a", 200]]))).toBeCloseTo(0.4 + 0.45 * 0.8);
});
