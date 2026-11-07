import { expect, test } from "bun:test";
import { layoutOf, titleSize } from "./card-layout";
import { cardSvg } from "./card-svg";
import { cardOf, clock, hours } from "./share-card";

test("an album card carries artist, year, song count and length", () => {
  const card = cardOf("album", {
    name: "Midnight Static",
    artist: "Orbit Hollow",
    year: 2019,
    songCount: 12,
    duration: 2880,
    coverArt: "al-1",
  });
  expect(card).toEqual({
    kind: "album",
    title: "Midnight Static",
    subtitle: "Orbit Hollow · 2019",
    stats: "12 songs · 48 min",
    covers: ["al-1"],
  });
});

test("an artist counts albums and the songs on them", () => {
  const card = cardOf("artist", {
    name: "Velvet Harbor",
    albumCount: 2,
    coverArt: "ar-1",
    album: [{ songCount: 10 }, { songCount: 1 }],
  } as never);
  expect(card?.stats).toBe("2 albums · 11 songs");
});

test("a playlist without art gets a mosaic of its first distinct covers", () => {
  const entry = ["a", "a", "b", "c", "d", "e"].map((coverArt) => ({ coverArt }));
  const card = cardOf("playlist", { name: "Drive", songCount: 6, duration: 14_520, entry });
  expect(card?.covers).toEqual(["a", "b", "c", "d"]);
  expect(card?.stats).toBe("6 songs · 4 hr 2 min");
});

test("a song shows artist and album, and its length as a clock", () => {
  const card = cardOf("song", { title: "Neon Lantern", artist: "Silver Atlas", album: "Quiet Summer", duration: 225, coverArt: "s-1" });
  expect(card).toMatchObject({ subtitle: "Silver Atlas · Quiet Summer", stats: "3:45" });
  expect(clock(61)).toBe("1:01");
  expect(hours(30)).toBe("1 min");
});

test("an item without a name has no card", () => {
  expect(cardOf("album", { name: "  " })).toBeNull();
});

test("text the fonts cannot draw is dropped, with no dangling separator, and long titles shrink", () => {
  const layout = layoutOf({ kind: "album", title: "夜に駆ける", subtitle: "YOASOBI 🎵 · 夜 · 2020", stats: "5 songs", covers: [] });
  expect(layout.title).toBe("untitled album");
  expect(layout.subtitle).toBe("YOASOBI · 2020");
  expect(titleSize("Late night drive")).toBeGreaterThan(
    titleSize("The Extraordinarily Long Title of an Album That Wraps Around Several Lines"),
  );
  expect(layoutOf({ kind: "song", title: "Çok güzel Привет", stats: "", covers: ["a", "b"] })).toMatchObject({
    title: "Çok güzel Привет",
    art: "mosaic",
  });
});

test("markup in a title is drawn as text, never as elements", async () => {
  const hostile = `"><script>alert(1)</script> & 'x'`;
  const svg = await cardSvg(layoutOf({ kind: "playlist", title: hostile, subtitle: "<b>x</b>", stats: "3 songs", covers: [] }), []);
  expect(svg).not.toContain("<script");
  expect(svg).not.toContain("<b>");
  expect(svg.startsWith("<svg")).toBe(true);
});
