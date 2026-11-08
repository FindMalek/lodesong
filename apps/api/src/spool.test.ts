import { expect, test } from "bun:test";
import { needsLength, spool } from "./spool";

const body = (pieces: number[][]) =>
  new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const piece of pieces) {
        controller.enqueue(new Uint8Array(piece));
        await Bun.sleep(1);
      }
      controller.close();
    },
  });

test("a body under the limit becomes a blob that knows its size", async () => {
  const spooled = await spool(body([[1, 2], [3], [4, 5, 6]]), 100);
  expect("blob" in spooled && spooled.blob.size).toBe(6);
});

test("past the limit the same bytes keep streaming, in order", async () => {
  const spooled = await spool(body([[1, 2], [3, 4], [5, 6], [7]]), 3);
  expect("stream" in spooled).toBe(true);
  if ("stream" in spooled) expect([...new Uint8Array(await new Response(spooled.stream).arrayBuffer())]).toEqual([1, 2, 3, 4, 5, 6, 7]);
});

test("only WebKit is held for a length", () => {
  const safari = "Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15";
  const app = "Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 (KHTML, like Gecko) lodesong-desktop";
  const chrome = "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
  expect([safari, app, chrome, "Mozilla/5.0 Firefox/130.0", null].map(needsLength)).toEqual([true, true, false, false, false]);
});
