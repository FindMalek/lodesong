import { expect, test } from "bun:test";
import { coverResponse, readCover } from "./folder-cover";

const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const url = (type: string, bytes: Uint8Array) => `data:${type};base64,${Buffer.from(bytes).toString("base64")}`;
const make = (width: number, format: "png" | "jpeg" | "webp", height = width) => {
  const image = new Bun.Image(PIXEL).resize(width, height);
  return (format === "png" ? image.png() : format === "jpeg" ? image.jpeg({ quality: 80 }) : image.webp({ quality: 80 })).bytes();
};

test("a cover counts only when it decodes as the type it claims, within the byte and pixel limits", async () => {
  const png = await make(64, "png");
  const jpeg = await make(64, "jpeg");
  const webp = await make(64, "webp");
  expect(await readCover(url("image/png", png))).toMatchObject({ type: "image/png", hash: expect.any(String) });
  expect(await readCover(url("image/jpeg", jpeg))).toMatchObject({ type: "image/jpeg" });
  expect(await readCover(url("image/webp", webp))).toMatchObject({ type: "image/webp" });

  expect(await readCover(url("image/png", jpeg))).toBeNull();
  expect(await readCover(url("image/png", new TextEncoder().encode("not a picture")))).toBeNull();
  expect(await readCover(url("image/jpeg", jpeg.slice(0, jpeg.length / 2)))).toBeNull();
  expect(await readCover(url("image/png", png.slice(0, png.length - 30)))).toBeNull();
  expect(await readCover(url("image/png", await make(1025, "png", 8)))).toBeNull();
  expect(await readCover(url("image/png", await make(8, "png", 1025)))).toBeNull();
  expect(await readCover(url("image/png", await make(1024, "png", 8)))).not.toBeNull();
  const noisy = new Uint8Array(60_000).map((_, at) => (at * 7919) % 251);
  expect(await readCover(url("image/png", new Uint8Array([...png, ...noisy])))).toBeNull();
  expect(await readCover("data:image/gif;base64,R0lGODlhAQABAAAAACw=")).toBeNull();
  expect(await readCover(`data:image/png;base64,${Buffer.from(png).toString("base64")}!`)).toBeNull();
});

test("the cover response is 404 with none, 304 for the version the browser has, and the bytes with their type otherwise", async () => {
  const bytes = await make(32, "png");
  const cover = await readCover(url("image/png", bytes));
  const ask = (headers: Record<string, string> = {}) => new Request("http://app/api/folders/x/cover", { headers });

  expect(coverResponse(ask(), null, {}).status).toBe(404);
  const fresh = coverResponse(ask(), cover, { "x-kept": "1" });
  expect(fresh.status).toBe(200);
  expect(fresh.headers.get("content-type")).toBe("image/png");
  expect(fresh.headers.get("x-kept")).toBe("1");
  expect(fresh.headers.get("cache-control")).toContain("private");
  expect([...new Uint8Array(await fresh.arrayBuffer())]).toEqual([...bytes]);
  const again = coverResponse(ask({ "if-none-match": fresh.headers.get("etag") ?? "" }), cover, {});
  expect(again.status).toBe(304);
  expect(coverResponse(ask({ "if-none-match": '"other"' }), cover, {}).status).toBe(200);
});
