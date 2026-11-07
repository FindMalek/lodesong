import { expect, test } from "bun:test";
import { fitsGenre, fitsPlaylist, vibeOf } from "./vibes";

test("words people use find their vibe, genres and playlists follow it", () => {
  expect(vibeOf("Workout mix")?.label).toBe("gym");
  expect(vibeOf("melan")?.label).toBe("melancholy");
  expect(vibeOf("beatles")).toBeNull();
  const gym = vibeOf("gym");
  if (!gym) throw new Error("no gym vibe");
  expect(fitsPlaylist(gym, "Running")).toBe(true);
  expect(fitsPlaylist(gym, "Brunch")).toBe(false);
  expect(fitsGenre(gym, "Hip-Hop")).toBe(true);
  expect(fitsGenre(gym, "Jazz")).toBe(false);
});
