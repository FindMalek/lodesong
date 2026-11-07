import { MAX_COVER_BYTES, MAX_COVER_SIDE } from "@lodesong/shared/playlist-folders";

export interface Cover {
  type: string;
  bytes: Uint8Array<ArrayBuffer>;
  hash: string;
}

const DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/;
const FORMATS: Record<string, string> = { "image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp" };

/** A picture only counts when it really decodes, as the type it says, within the byte and pixel limits. */
export async function readCover(dataUrl: string): Promise<Cover | null> {
  const match = DATA_URL.exec(dataUrl);
  if (!match) return null;
  const [, type = "", base64 = ""] = match;
  const bytes = new Uint8Array(Buffer.from(base64, "base64"));
  if (bytes.length > MAX_COVER_BYTES) return null;
  try {
    const meta = await new Bun.Image(bytes).metadata();
    if (meta.format !== FORMATS[type] || meta.width > MAX_COVER_SIDE || meta.height > MAX_COVER_SIDE) return null;
    await new Bun.Image(bytes).resize(8, 8).bytes();
  } catch {
    return null;
  }
  return { type, bytes, hash: new Bun.CryptoHasher("sha1").update(bytes).digest("hex").slice(0, 16) };
}

/** 304 when the browser already has this version; the picture changes only with its hash, so a short cache is safe. */
export function coverResponse(request: Request, cover: Cover | null, headers: Record<string, string>): Response {
  if (!cover) return new Response(null, { status: 404, headers: { ...headers, "cache-control": "private, no-store" } });
  const etag = `"${cover.hash}"`;
  const shared = { ...headers, etag, "cache-control": "private, max-age=3600", "x-content-type-options": "nosniff" };
  if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: shared });
  return new Response(cover.bytes, { headers: { ...shared, "content-type": cover.type } });
}
