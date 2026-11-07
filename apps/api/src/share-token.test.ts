import { expect, test } from "bun:test";
import { ShareTokens } from "./share-token";

const tokens = new ShareTokens("secret");
const SHARE = "abcdefghijklmnop";

test("a token opens exactly the item it was signed for, and names its share", () => {
  const token = tokens.sign("album", "al-1", SHARE);
  expect(tokens.verify(token, "album", "al-1", "page")).toBe(SHARE);
  expect(tokens.verify(token, "album", "al-2", "page")).toBeNull();
  expect(tokens.verify(token, "playlist", "al-1", "page")).toBeNull();
});

test("a token cannot be moved onto another share row", () => {
  const [, expires = "", mac = ""] = tokens.sign("album", "al-1", SHARE).split(".");
  expect(tokens.verify(`ABCDEFGHIJKLMNOP.${expires}.${mac}`, "album", "al-1", "page")).toBeNull();
});

test("a changed token, another secret or no token opens nothing", () => {
  const token = tokens.sign("song", "s-1", SHARE);
  const [share = "", expires = "", mac = ""] = token.split(".");
  expect(tokens.verify(`${share}.${expires}.${mac.slice(0, -1)}${mac.endsWith("A") ? "B" : "A"}`, "song", "s-1", "page")).toBeNull();
  expect(tokens.verify(`${share}.${expires}.${mac.slice(0, 12)}`, "song", "s-1", "page")).toBeNull();
  expect(tokens.verify(`${share}.${(Number.parseInt(expires, 36) + 1).toString(36)}.${mac}`, "song", "s-1", "page")).toBeNull();
  expect(new ShareTokens("other").verify(token, "song", "s-1", "page")).toBeNull();
  expect(tokens.verify(null, "song", "s-1", "page")).toBeNull();
  expect(tokens.verify("not a token", "song", "s-1", "page")).toBeNull();
});

test("a token lives for the configured time and not a moment longer", () => {
  let now = 1_000_000;
  const short = new ShareTokens("secret", () => now, 60_000);
  const token = short.sign("artist", "ar-1", SHARE);
  now += 59_000;
  expect(short.verify(token, "artist", "ar-1", "page")).toBe(SHARE);
  now += 2_000;
  expect(short.verify(token, "artist", "ar-1", "page")).toBeNull();
});

test("a default token is good for 180 days", () => {
  let now = 0;
  const standard = new ShareTokens("secret", () => now);
  const token = standard.sign("album", "al-1", SHARE);
  now = 179 * 86_400_000;
  expect(standard.verify(token, "album", "al-1", "page")).toBe(SHARE);
  now = 181 * 86_400_000;
  expect(standard.verify(token, "album", "al-1", "page")).toBeNull();
});

test("an image token cannot be turned into a page token", () => {
  const image = tokens.sign("album", "al-1", SHARE, "image");
  expect(tokens.verify(image, "album", "al-1", "image")).toBe(SHARE);
  expect(tokens.verify(image, "album", "al-1", "page")).toBeNull();
  expect(tokens.verify(tokens.sign("album", "al-1", SHARE), "album", "al-1", "image")).toBe(SHARE);
});
