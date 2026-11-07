import { MAX_COVER_BYTES } from "@lodesong/shared/playlist-folders";

const SIZES = [256, 192, 128];
const QUALITIES = [0.8, 0.65, 0.5, 0.35];

const decodedBytes = (dataUrl: string): number => Math.floor(((dataUrl.length - dataUrl.indexOf(",") - 1) * 3) / 4);

/** The first size and quality whose picture fits what the server keeps; null when even the smallest doesn't. */
export function fitCover(encode: (size: number, quality: number) => string): string | null {
  for (const size of SIZES)
    for (const quality of QUALITIES) {
      const picture = encode(size, quality);
      if (decodedBytes(picture) <= MAX_COVER_BYTES) return picture;
    }
  return null;
}

/** An uploaded picture, cropped square on a white ground (so a transparent png doesn't go black) and shrunk to a small JPEG. */
export async function coverFromFile(file: File): Promise<string | null> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return null;
  const side = Math.min(bitmap.width, bitmap.height);
  const picture = fitCover((size, quality) => {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (context) {
      context.fillStyle = "white";
      context.fillRect(0, 0, size, size);
      context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
    }
    return canvas.toDataURL("image/jpeg", quality);
  });
  bitmap.close();
  return picture;
}
