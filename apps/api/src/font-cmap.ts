import { inflateSync } from "node:zlib";

function tableOf(font: DataView, tag: string): DataView | null {
  const count = font.getUint16(12);
  for (let index = 0; index < count; index++) {
    const entry = 44 + index * 20;
    const name = String.fromCharCode(...[0, 1, 2, 3].map((offset) => font.getUint8(entry + offset)));
    if (name !== tag) continue;
    const offset = font.getUint32(entry + 4);
    const packed = font.getUint32(entry + 8);
    const length = font.getUint32(entry + 12);
    const raw = new Uint8Array(font.buffer, font.byteOffset + offset, packed);
    const data = packed < length ? inflateSync(raw) : raw;
    return new DataView(data.buffer, data.byteOffset, data.byteLength);
  }
  return null;
}

/** Every code point a WOFF font has a glyph for, read from its BMP `cmap` (format 4). */
export function glyphsOf(woff: ArrayBuffer): Set<number> {
  const cmap = tableOf(new DataView(woff), "cmap");
  const found = new Set<number>();
  if (!cmap) return found;
  for (let index = 0; index < cmap.getUint16(2); index++) {
    const start = cmap.getUint32(4 + index * 8 + 4);
    if (cmap.getUint16(start) !== 4) continue;
    const segments = cmap.getUint16(start + 6) / 2;
    const ends = start + 14;
    const starts = ends + segments * 2 + 2;
    const deltas = starts + segments * 2;
    const ranges = deltas + segments * 2;
    for (let segment = 0; segment < segments; segment++) {
      const first = cmap.getUint16(starts + segment * 2);
      const last = cmap.getUint16(ends + segment * 2);
      const offset = cmap.getUint16(ranges + segment * 2);
      for (let code = first; code <= last && code < 0xffff; code++) {
        const glyph = offset
          ? cmap.getUint16(ranges + segment * 2 + offset + (code - first) * 2)
          : (code + cmap.getInt16(deltas + segment * 2)) & 0xffff;
        if (glyph) found.add(code);
      }
    }
  }
  return found;
}
