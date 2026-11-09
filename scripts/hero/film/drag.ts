import type { Ctx, Sel } from "./types";

/**
 * An HTML5 drag from one row onto another, with a plate after the drop: the app listens for native drag events, so
 * they are dispatched by hand around a shared DataTransfer.
 */
export async function dragRows(c: Ctx, rows: Sel, from: number, to: number, label: string): Promise<void> {
  const list = c.page.locator(c.fill(rows));
  const transfer = await c.page.evaluateHandle(() => new DataTransfer());
  const send = (index: number, type: string) => list.nth(index).dispatchEvent(type, { dataTransfer: transfer });
  c.event("drag", {
    name: label,
    target:
      (await list
        .nth(from)
        .boundingBox()
        .then((b) => (b ? { x: b.x, y: b.y, w: b.width, h: b.height } : undefined))) ?? undefined,
  });
  await send(from, "dragstart");
  await send(to, "dragenter");
  await send(to, "dragover");
  await send(to, "drop");
  await send(from, "dragend");
  await c.shot(`${label}-drop`);
}

/** A native drag from one element onto another anywhere on the page, for drops that are not between rows of one list. */
export async function dragBetween(c: Ctx, from: Sel, to: Sel, label: string): Promise<void> {
  const source = c.page.locator(c.fill(from)).first();
  const target = c.page.locator(c.fill(to)).first();
  const transfer = await c.page.evaluateHandle(() => new DataTransfer());
  const box = await source.boundingBox();
  if (box) c.event("drag", { name: label, target: { x: box.x, y: box.y, w: box.width, h: box.height } });
  await source.dispatchEvent("dragstart", { dataTransfer: transfer });
  await target.dispatchEvent("dragenter", { dataTransfer: transfer });
  await target.dispatchEvent("dragover", { dataTransfer: transfer });
  await target.dispatchEvent("drop", { dataTransfer: transfer });
  await source.dispatchEvent("dragend", { dataTransfer: transfer });
}
