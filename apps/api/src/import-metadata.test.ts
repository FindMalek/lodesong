import { expect, test } from "bun:test";
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseSuggestions, readTags } from "./import-metadata";

function id3(frames: Record<string, string>): Uint8Array {
  const body = Object.entries(frames).map(([id, text]) => {
    const data = Buffer.concat([Buffer.from([3]), Buffer.from(text)]);
    const size = Buffer.alloc(4);
    size.writeUInt32BE(data.length);
    return Buffer.concat([Buffer.from(id), size, Buffer.alloc(2), data]);
  });
  const frameBytes = Buffer.concat(body);
  const size = Buffer.from([0, 0, (frameBytes.length >> 7) & 0x7f, frameBytes.length & 0x7f]);
  return Buffer.concat([Buffer.from("ID3"), Buffer.from([3, 0, 0]), size, frameBytes]);
}

test("only missing tags are filled; a tag the file already has is offered as a replace, never applied", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tags-"));
  const file = join(dir, "song.mp3");
  await Bun.write(file, id3({ TIT2: "dl_song_v2_(official)", TALB: "Nights" }));
  const tags = await readTags(file);
  expect(tags).toEqual({ title: "dl_song_v2_(official)", album: "Nights" });

  const answer = JSON.stringify({ title: "Song", artist: "Big Roshi", album: "Nights", year: "20xx", track: 3 });
  expect(parseSuggestions(answer, tags)).toEqual([
    { field: "title", current: "dl_song_v2_(official)", proposed: "Song", kind: "replace" },
    { field: "artist", current: "", proposed: "Big Roshi", kind: "fill" },
    { field: "track", current: "", proposed: "3", kind: "fill" },
  ]);
  expect(await readdir(dir)).toEqual(["song.mp3"]);
});
