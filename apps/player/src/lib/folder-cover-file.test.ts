import { expect, test } from "bun:test";
import { MAX_COVER_BYTES } from "@lodesong/shared/playlist-folders";
import { fitCover } from "./folder-cover-file";

const sized = (bytes: number) => `data:image/jpeg;base64,${"A".repeat(Math.ceil((bytes * 4) / 3))}`;

test("a picture too big at the first quality is encoded again smaller, and given up on only when nothing fits", () => {
  const tried: [number, number][] = [];
  const picture = fitCover((size, quality) => {
    tried.push([size, quality]);
    return sized(quality > 0.5 ? MAX_COVER_BYTES + 3000 : MAX_COVER_BYTES - 100);
  });
  expect(tried).toEqual([
    [256, 0.8],
    [256, 0.65],
    [256, 0.5],
  ]);
  expect(picture).toHaveLength(sized(MAX_COVER_BYTES - 100).length);
  expect(fitCover(() => sized(MAX_COVER_BYTES + 3000))).toBeNull();
});
