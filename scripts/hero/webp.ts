import type { Browser, Page } from "@playwright/test";

export type Piece = { x: number; y: number; width: number; height: number; ms: number; data: Buffer };
type Region = { x: number; y: number; width: number; height: number; webp: string };

const FRAME_TAGS = new Set(["VP8 ", "VP8L"]);

const le = (value: number, bytes: number): Buffer => {
  const out = Buffer.alloc(bytes);
  for (let i = 0; i < bytes; i += 1) out[i] = (value >> (8 * i)) & 255;
  return out;
};

function chunk(tag: string, body: Buffer): Buffer {
  return Buffer.concat([Buffer.from(tag, "ascii"), le(body.length, 4), body, body.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)]);
}

function frameChunks(webp: Buffer): Buffer {
  const parts: Buffer[] = [];
  for (let at = 12; at + 8 <= webp.length; ) {
    const tag = webp.toString("ascii", at, at + 4);
    const size = webp.readUInt32LE(at + 4);
    const end = at + 8 + size + (size % 2);
    if (FRAME_TAGS.has(tag)) parts.push(webp.subarray(at, end));
    at = end;
  }
  return Buffer.concat(parts);
}

export function animate(width: number, height: number, pieces: Piece[]): Buffer {
  const head = chunk("VP8X", Buffer.concat([Buffer.from([0x02, 0, 0, 0]), le(width - 1, 3), le(height - 1, 3)]));
  const anim = chunk("ANIM", Buffer.concat([le(0, 4), le(0, 2)]));
  const frames = pieces.map((piece) =>
    chunk(
      "ANMF",
      Buffer.concat([
        le(piece.x / 2, 3),
        le(piece.y / 2, 3),
        le(piece.width - 1, 3),
        le(piece.height - 1, 3),
        le(piece.ms, 3),
        Buffer.from([0x02]),
        frameChunks(piece.data),
      ]),
    ),
  );
  const body = Buffer.concat([Buffer.from("WEBP", "ascii"), head, anim, ...frames]);
  return Buffer.concat([Buffer.from("RIFF", "ascii"), le(body.length, 4), body]);
}

export async function regions(
  page: Page,
  pngs: Buffer[],
  border: string,
  quality: number,
  diffFrom: number,
  size: [number, number],
): Promise<Region[]> {
  return page.evaluate(
    async ([sources, edge, q, from, expected]) => {
      const load = async (data: string): Promise<ImageData> => {
        const image = new Image();
        image.src = `data:image/png;base64,${data}`;
        await image.decode();
        if (image.width !== expected[0] || image.height !== expected[1]) throw new Error(`frame is ${image.width}x${image.height}`);
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
        ctx.drawImage(image, 0, 0);
        ctx.fillStyle = edge;
        ctx.fillRect(0, 0, image.width, 1);
        ctx.fillRect(0, image.height - 1, image.width, 1);
        ctx.fillRect(0, 0, 1, image.height);
        ctx.fillRect(image.width - 1, 0, 1, image.height);
        return ctx.getImageData(0, 0, image.width, image.height);
      };
      const encode = async (source: ImageData, x: number, y: number, width: number, height: number): Promise<string> => {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
        const whole = document.createElement("canvas");
        whole.width = source.width;
        whole.height = source.height;
        (whole.getContext("2d") as CanvasRenderingContext2D).putImageData(source, 0, 0);
        ctx.drawImage(whole, x, y, width, height, 0, 0, width, height);
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", Number(q)));
        const bytes = new Uint8Array((await blob?.arrayBuffer()) ?? new ArrayBuffer(0));
        let binary = "";
        for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        return btoa(binary);
      };
      const out: { x: number; y: number; width: number; height: number; webp: string }[] = [];
      let previous: ImageData | null = null;
      for (const [index, data] of sources.entries()) {
        const current = await load(data);
        let box = { x: 0, y: 0, width: current.width, height: current.height };
        if (previous && index >= Number(from)) {
          let minX = current.width;
          let minY = current.height;
          let maxX = -1;
          let maxY = -1;
          for (let y = 0; y < current.height; y += 1)
            for (let x = 0; x < current.width; x += 1) {
              const at = (y * current.width + x) * 4;
              if (
                current.data[at] !== previous.data[at] ||
                current.data[at + 1] !== previous.data[at + 1] ||
                current.data[at + 2] !== previous.data[at + 2]
              ) {
                minX = Math.min(minX, x);
                maxX = Math.max(maxX, x);
                minY = Math.min(minY, y);
                maxY = Math.max(maxY, y);
              }
            }
          if (maxX >= 0) {
            const x = Math.max(0, (minX - 2) & ~1);
            const y = Math.max(0, (minY - 2) & ~1);
            box = { x, y, width: Math.min(current.width, maxX + 3) - x, height: Math.min(current.height, maxY + 3) - y };
          } else box = { x: 0, y: 0, width: 2, height: 2 };
        }
        out.push({ ...box, webp: await encode(current, box.x, box.y, box.width, box.height) });
        previous = current;
      }
      return out;
    },
    [pngs.map((png) => png.toString("base64")), border, String(quality), String(diffFrom), size] as const,
  );
}

export async function decodedFrames(browser: Browser, webp: Buffer): Promise<{ width: number; height: number; ms: number }[]> {
  const page = await browser.newPage();
  await page.route("https://hero.test/", (route) => route.fulfill({ body: "<html></html>", contentType: "text/html" }));
  await page.goto("https://hero.test/");
  const frames = await page.evaluate(async (data) => {
    const decoder = new ImageDecoder({ data: Uint8Array.from(atob(data), (char) => char.charCodeAt(0)), type: "image/webp" });
    await decoder.tracks.ready;
    const out: { width: number; height: number; ms: number }[] = [];
    for (let index = 0; index < (decoder.tracks.selectedTrack?.frameCount ?? 0); index += 1) {
      const { image } = await decoder.decode({ frameIndex: index });
      out.push({ width: image.displayWidth, height: image.displayHeight, ms: (image.duration ?? 0) / 1000 });
    }
    return out;
  }, webp.toString("base64"));
  await page.close();
  return frames;
}
