import { expect, test } from "bun:test";
import { noisePng } from "../../../test/mock/png";
import { Busy, CardImages, type Drawn, pictureUri, rasterize } from "./card-image";
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

test("a card missing a cover is returned but not kept", async () => {
  const images = new CardImages();
  let draws = 0;
  const draw = async () => drawn(++draws > 1);
  expect((await images.get("a", draw)).complete).toBe(false);
  expect((await images.get("a", draw)).complete).toBe(true);
  expect(draws).toBe(2);
  await images.get("a", draw);
  expect(draws).toBe(2);
});

test("too many different cards waiting is refused, and a slow render times out", async () => {
  const images = new CardImages(48, 3, 30);
  const waiting = [1, 2, 3].map((id) => images.get(String(id), never).catch((error) => error));
  await expect(images.get("4", never)).rejects.toBeInstanceOf(Busy);
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
});
