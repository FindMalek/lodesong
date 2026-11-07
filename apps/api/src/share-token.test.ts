import { expect, test } from "bun:test";
import { ShareTokens } from "./share-token";

const tokens = new ShareTokens("secret");

test("a token opens exactly the item it was signed for", () => {
  const token = tokens.sign("album", "al-1");
  expect(tokens.verify(token, "album", "al-1", "page")).toBe(true);
  expect(tokens.verify(token, "album", "al-2", "page")).toBe(false);
  expect(tokens.verify(token, "playlist", "al-1", "page")).toBe(false);
});

test("a changed token, another secret or no token opens nothing", () => {
  const token = tokens.sign("song", "s-1");
  const [expires = "", mac = ""] = token.split(".");
  expect(tokens.verify(`${expires}.${mac.slice(0, -1)}${mac.endsWith("A") ? "B" : "A"}`, "song", "s-1", "page")).toBe(false);
  expect(tokens.verify(`${(Number.parseInt(expires, 36) + 1).toString(36)}.${mac}`, "song", "s-1", "page")).toBe(false);
  expect(new ShareTokens("other").verify(token, "song", "s-1", "page")).toBe(false);
  expect(tokens.verify(null, "song", "s-1", "page")).toBe(false);
  expect(tokens.verify("not a token", "song", "s-1", "page")).toBe(false);
});

test("a token stops working when it expires", () => {
  let now = 1_000_000;
  const short = new ShareTokens("secret", () => now, 60_000);
  const token = short.sign("artist", "ar-1");
  expect(short.verify(token, "artist", "ar-1", "page")).toBe(true);
  now += 61_000;
  expect(short.verify(token, "artist", "ar-1", "page")).toBe(false);
});

test("an image token cannot be turned into a page token", () => {
  const image = tokens.sign("album", "al-1", "image");
  expect(tokens.verify(image, "album", "al-1", "image")).toBe(true);
  expect(tokens.verify(image, "album", "al-1", "page")).toBe(false);
  expect(tokens.verify(tokens.sign("album", "al-1"), "album", "al-1", "image")).toBe(true);
});
