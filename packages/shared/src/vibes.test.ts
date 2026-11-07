import { expect, test } from "bun:test";
import { fitsGenre, fitsPlaylist, vibeOf } from "./vibes";

const labelOf = (text: string) => vibeOf(text)?.label ?? null;
const vibe = (text: string) => {
  const found = vibeOf(text);
  if (!found) throw new Error(`no vibe for ${text}`);
  return found;
};

test("what people type finds its vibe: its label, plurals, 'for the' and filler words", () => {
  expect(labelOf("rainy days")).toBe("rainy days");
  expect(labelOf("workouts")).toBe("gym");
  expect(labelOf("for the gym")).toBe("gym");
  expect(labelOf("music for gym")).toBe("gym");
  expect(labelOf("Workout mix")).toBe("gym");
  expect(labelOf("late nights")).toBe("late night");
  expect(labelOf("Chill Out")).toBe("chill");
  expect(labelOf("lofi")).toBe("chill");
});

test("band names, titles and short words are not moods", () => {
  for (const text of [
    "g",
    "gy",
    "beatles",
    "party of five",
    "Blue Monday",
    "Run DMC",
    "Midnight City",
    "After Hours",
    "Train",
    "Blue",
    "Dance",
    "Summer",
    "Joy",
  ])
    expect(labelOf(text)).toBeNull();
});

test("a prefix names a vibe from 6 letters, an exact word wins over any prefix", () => {
  expect(labelOf("melanc")).toBe("melancholy");
  expect(labelOf("melan")).toBeNull();
  expect(labelOf("late nig")).toBe("late night");
  expect(labelOf("work")).toBe("focus");
  expect(labelOf("workout")).toBe("gym");
});

test("playlists fit by whole words, not by how they start", () => {
  const gym = vibe("gym");
  expect(fitsPlaylist(gym, "Running")).toBe(true);
  expect(fitsPlaylist(gym, "my workouts")).toBe(true);
  for (const name of ["Brunch", "Runaway", "Run DMC", "Gymnastics", "Energy Drinks"]) expect(fitsPlaylist(gym, name)).toBe(false);
  expect(fitsPlaylist(vibe("sad"), "Bluetooth")).toBe(false);
  expect(fitsPlaylist(vibe("rainy"), "Rainbow")).toBe(false);
  expect(fitsPlaylist(vibe("focus"), "Workout Hits")).toBe(false);
});

test("genres fit however the library spells them", () => {
  expect(fitsGenre(vibe("gym"), "Hip-Hop")).toBe(true);
  expect(fitsGenre(vibe("gym"), "Drum & Bass")).toBe(true);
  expect(fitsGenre(vibe("gym"), "Jazz")).toBe(false);
  for (const genre of ["R&B", "R'n'B", "Rnb"]) expect(fitsGenre(vibe("late night"), genre)).toBe(true);
  for (const genre of ["Lofi", "Lo-Fi", "Chill Out", "Chillout"]) expect(fitsGenre(vibe("chill"), genre)).toBe(true);
  expect(fitsGenre(vibe("happy"), "Popular")).toBe(false);
});
