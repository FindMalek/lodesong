import { expect, test } from "bun:test";
import { covered as coveredCodes } from "./card-fonts";
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

const covered = await coveredCodes();
const layout = (title: string, subtitle = "", kind: "album" | "artist" = "album") =>
  layoutOf({ kind, title, subtitle, stats: "5 songs", covers: [] }, covered);

test("letters the fonts lack show as an ellipsis, never vanish, and emoji drop quietly", () => {
  expect(layout("Café 夜に駆ける (Live)").title).toBe("Café … (Live)");
  expect(layout("Chill 🔥 Mix").title).toBe("Chill Mix");
  expect(layout("Sơn Tùng · Nhạc Việt Nam buồn").title).toBe("Sơn Tùng · Nhạc Việt Nam buồn");
  expect(layout("Bjo\u0308rk Cafe\u0301".normalize("NFC")).title).toBe("Björk Café");
});

test("a title with nothing drawable is replaced by the artist, then by the kind", () => {
  expect(layout("夜に駆ける", "YOASOBI · 2020")).toMatchObject({ title: "YOASOBI", subtitle: "2020" });
  expect(layout("夜に駆ける", "夜 · 2020")).toMatchObject({ title: "2020", subtitle: "…" });
  expect(layout("שלום", "", "artist").title).toBe("an artist");
  expect(layout("🎵🎵").title).toBe("an album");
});

test("long titles shrink and the longest word must fit the column", () => {
  expect(titleSize("Midnight Static Sessions Live")).toBeLessThanOrEqual(60);
  expect(titleSize("Late night drive")).toBeGreaterThan(
    titleSize("The Extraordinarily Long Title of an Album That Wraps Around Several Lines"),
  );
  expect(layoutOf({ kind: "song", title: "Çok güzel Привет", stats: "", covers: ["a", "b"] }, covered)).toMatchObject({
    title: "Çok güzel Привет",
    art: "mosaic",
  });
});

test("text kept on a card is cleaned and capped, and a playlist cover id must be a plain id", () => {
  const card = cardOf("playlist", {
    name: `Night\u202e\u0000 ${"y".repeat(500)}`,
    songCount: 2,
    entry: [{ coverArt: "ok-1" }, { coverArt: "../etc" }, { coverArt: "x".repeat(200) }],
  });
  expect(card?.title.length).toBeLessThanOrEqual(120);
  expect(card?.title).not.toMatch(/[\p{Cc}\p{Cf}]/u);
  expect(card?.covers).toEqual(["ok-1"]);
  expect(cardOf("playlist", { name: "P", coverArt: "../x" })?.covers).toEqual([]);
  expect(cardOf("album", { name: "A", artist: "Cafe\u0301" })?.subtitle).toBe("Café");
  expect(cardOf("album", { name: "\u200b\u202e" })).toBeNull();
});

test("markup in a title is drawn as text, never as elements", async () => {
  const hostile = `"><script>alert(1)</script> & 'x'`;
  const svg = await cardSvg({ kind: "playlist", title: hostile, subtitle: "<b>x</b>", stats: "3 songs", covers: [] }, []);
  expect(svg).not.toContain("<script");
  expect(svg).not.toContain("<b>");
  expect(svg.startsWith("<svg")).toBe(true);
});
