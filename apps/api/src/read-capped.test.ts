import { expect, test } from "bun:test";
import { readCapped } from "./read-capped";

const streamOf = (text: string) =>
  new Request("http://x", {
    method: "POST",
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(text));
        controller.close();
      },
    }),
    duplex: "half",
  } as RequestInit);

test("a body up to the cap is read whole, one byte over is refused", async () => {
  expect(await readCapped(new Request("http://x", { method: "POST", body: "abcd" }), 4)).toBe("abcd");
  expect(await readCapped(new Request("http://x", { method: "POST", body: "abcde" }), 4)).toBeNull();
  expect(await readCapped(new Request("http://x"), 4)).toBe("");
});

test("a body that does not say how long it is is still cut off", async () => {
  expect(await readCapped(streamOf("abcd"), 4)).toBe("abcd");
  expect(await readCapped(streamOf("abcde"), 4)).toBeNull();
});

test("multi-byte text counts in bytes", async () => {
  expect(await readCapped(new Request("http://x", { method: "POST", body: "éé" }), 4)).toBe("éé");
  expect(await readCapped(new Request("http://x", { method: "POST", body: "ééé" }), 4)).toBeNull();
});
