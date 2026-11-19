import { expect, test } from "bun:test";
import { missingTracks, placeMissing } from "./album-missing";

test("lists the release tracks whose title the library lacks, ignoring case and accents", () => {
  const tracks = [
    { title: "Intro", durationMs: 1 },
    { title: "Café Nights", durationMs: 2 },
    { title: "Outro (feat. Z)", durationMs: 3 },
  ];
  expect(missingTracks([{ title: "cafe nights" }, { title: "Outro" }], tracks).map((track) => track.title)).toEqual(["Intro"]);
});

test("punctuation-only titles don't collide and a repeated title needs each copy", () => {
  const tracks = [
    { title: "!!!", durationMs: 1 },
    { title: "???", durationMs: 1 },
    { title: "Intro", durationMs: 1 },
    { title: "Intro", durationMs: 1 },
  ];
  expect(missingTracks([{ title: "!!!" }, { title: "Intro" }], tracks).map((track) => track.title)).toEqual(["???", "Intro"]);
});

test("a missing track sits before the next owned song, numbered after its neighbour on the same disc", () => {
  const tracks = ["A", "B", "C", "D"].map((title) => ({ title, durationMs: 1 }));
  const owned = [
    { title: "B", track: 2 },
    { title: "D", track: 4 },
  ];
  expect(placeMissing(owned, tracks).map(({ title, number, before }) => [title, number, before])).toEqual([
    ["A", 1, 0],
    ["C", 3, 1],
  ]);
});

test("the first track of disc 2 starts at 1 and stays on its own disc, whichever way the album numbers its songs", () => {
  const tracks = [
    { title: "A", durationMs: 1, disc: 1 },
    { title: "B", durationMs: 1, disc: 2 },
    { title: "C", durationMs: 1, disc: 2 },
  ];
  const owned = [
    { title: "A", track: 1, discNumber: 1 },
    { title: "C", track: 2, discNumber: 2 },
  ];
  expect(placeMissing(owned, tracks).map(({ title, number, disc, before }) => [title, number, disc, before])).toEqual([["B", 1, 2, 1]]);
});
