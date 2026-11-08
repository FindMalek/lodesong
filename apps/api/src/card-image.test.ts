import { expect, test } from "bun:test";
import { noisePng } from "../../../test/mock/png";
import { Busy, CardImages, type Drawn, PARTIAL_MS, pictureUri, rasterize } from "./card-image";
import { cardSvg } from "./card-svg";

const drawn = (complete = true): Drawn => ({ bytes: new Uint8Array([1]), complete });
const never = () => new Promise<Drawn>(() => {});

test("a finished card is kept and reused, the oldest goes first, and one still being drawn is shared", async () => {
  const images = new CardImages(2);
  let draws = 0;
  const draw = async () => {
    draws += 1;
    return drawn();
  };
  await Promise.all([images.get("a", draw), images.get("a", draw)]);
  expect(draws).toBe(1);
  await images.get("b", draw);
  await images.get("a", draw);
  await images.get("c", draw);
  expect(draws).toBe(3);
  await images.get("a", draw);
  expect(draws).toBe(3);
  await images.get("b", draw);
  expect(draws).toBe(4);
});

test("a card missing a cover is reused for a minute, then drawn again and kept once it is whole", async () => {
  let now = 1000;
  const images = new CardImages(48, 8, 20_000, () => now);
  let draws = 0;
  const draw = async () => drawn(++draws > 1);
  expect((await images.get("a", draw)).complete).toBe(false);
  now += PARTIAL_MS - 1;
  expect((await images.get("a", draw)).complete).toBe(false);
  expect(draws).toBe(1);
  now += 1;
  expect((await images.get("a", draw)).complete).toBe(true);
  expect(draws).toBe(2);
  await images.get("a", draw);
  expect(draws).toBe(2);
});

test("incomplete cards are held only a few at a time and never push whole ones out", async () => {
  const images = new CardImages(2);
  await images.get("whole", async () => drawn());
  let draws = 0;
  const draw = async () => {
    draws += 1;
    return drawn(false);
  };
  for (let index = 0; index < 17; index++) await images.get(`p${index}`, draw);
  expect(draws).toBe(17);
  await images.get("p0", draw);
  expect(draws).toBe(18);
  await images.get("p16", draw);
  expect(draws).toBe(18);
  await images.get("whole", draw);
  expect(draws).toBe(18);
});

test("a pinned card is drawn once, outside the queue, and a failed draw is tried again", async () => {
  const images = new CardImages(48, 0);
  let draws = 0;
  const first = await images.pinned(async () => new Uint8Array([++draws]));
  expect(await images.pinned(async () => new Uint8Array([9]))).toBe(first);
  expect(draws).toBe(1);
  const retry = new CardImages();
  await expect(retry.pinned(() => Promise.reject(new Error("no wasm")))).rejects.toThrow("no wasm");
  expect([...(await retry.pinned(async () => new Uint8Array([7])))]).toEqual([7]);
});

test("the default keeps the 48 newest finished cards", async () => {
  const images = new CardImages();
  let draws = 0;
  const draw = async () => {
    draws += 1;
    return drawn();
  };
  for (let index = 0; index < 49; index++) await images.get(`k${index}`, draw);
  expect(draws).toBe(49);
  await images.get("k48", draw);
  await images.get("k1", draw);
  expect(draws).toBe(49);
  await images.get("k0", draw);
  expect(draws).toBe(50);
});

test("a render gets 20 seconds by default", async () => {
  const delays: number[] = [];
  const real = globalThis.setTimeout;
  globalThis.setTimeout = ((handler: () => void, ms?: number) => {
    delays.push(ms ?? 0);
    return real(handler, ms);
  }) as typeof setTimeout;
  try {
    await new CardImages().get("a", async () => drawn());
  } finally {
    globalThis.setTimeout = real;
  }
  expect(delays).toContain(20_000);
});

test("by default 8 cards may wait at once and the 9th is refused", async () => {
  const images = new CardImages(48, undefined, 30);
  const waiting = Array.from({ length: 8 }, (_, index) => images.get(`w${index}`, never).catch((error) => error));
  await expect(images.get("w8", never)).rejects.toBeInstanceOf(Busy);
  expect((await Promise.all(waiting)).every((error) => error instanceof Busy)).toBe(true);
});

test("only two cards are drawn at once", async () => {
  const images = new CardImages(48, 10);
  let active = 0;
  let peak = 0;
  const draw = async () => {
    active += 1;
    peak = Math.max(peak, active);
    await Bun.sleep(5);
    active -= 1;
    return drawn();
  };
  await Promise.all(["a", "b", "c", "d", "e"].map((key) => images.get(key, draw)));
  expect(peak).toBe(2);
});

test("a card over a worst-case noisy cover stays under the 300 KB chat apps allow", async () => {
  const cover = (await pictureUri(noisePng(512))) as string;
  const card = { kind: "album" as const, title: "Grain", subtitle: "Noise", stats: "1 song", covers: ["a"] };
  const jpeg = await rasterize(await cardSvg(card, [cover], cover));
  expect([...jpeg.slice(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
  expect(jpeg.length).toBeLessThan(300_000);
}, 60_000);

test("a card that fits the budget is encoded at the first quality, 90", async () => {
  const svg = await cardSvg(null, []);
  const { Resvg } = await import("@resvg/resvg-wasm");
  await rasterize(svg);
  const png = new Resvg(svg, { fitTo: { mode: "width", value: 1200 } }).render().asPng();
  const expected = await new Bun.Image(png).jpeg({ quality: 90 }).bytes();
  expect(expected.length).toBeLessThan(280_000);
  expect(await rasterize(svg)).toEqual(expected);
});
