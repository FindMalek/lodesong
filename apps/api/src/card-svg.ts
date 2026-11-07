import satori from "satori";
import { cardFonts, MONO, SANS } from "./card-fonts";
import { CARD_HEIGHT, CARD_WIDTH, type CardLayout, TEXT_WIDTH } from "./card-layout";

// The player's palette (packages/ui theme.css, dark): near black, light grey, one hairline.
const BG = "#101010";
const FG = "#ebebeb";
const SOFT = "#b3b3b3";
const MUTED = "#8f8f8f";
const LINE = "#2a2a2a";
const PANEL = "#181818";
const PAD = 72;
const ART = CARD_HEIGHT - PAD * 2;
const GAP = 4;
const MARK = "M8 8h48v16H29v10H8zM8 40h27V30h21v26H8z";

type Style = Record<string, string | number>;
interface Node {
  type: string;
  props: Record<string, unknown>;
}

const h = (type: string, props: Record<string, unknown>, ...children: (Node | string | undefined | false)[]): Node => ({
  type,
  props: { ...props, children: children.filter((child) => child !== undefined && child !== false) },
});
const box = (style: Style, ...children: (Node | string | undefined | false)[]): Node =>
  h("div", { style: { display: "flex", ...style } }, ...children);

const text = (style: Style, content: string): Node =>
  h("div", { style: { ...style, wordBreak: "break-word", textOverflow: "ellipsis" } }, content);

function mark(size: number, color: string): Node {
  return h("svg", { width: size, height: size, viewBox: "8 8 48 48" }, h("path", { d: MARK, fill: color }));
}

function bars(height: number, color: string): Node {
  const width = Math.round(height / 4);
  return box(
    { alignItems: "flex-end", gap: Math.round(width * 0.8), height },
    ...[0.55, 1, 0.7, 0.85].map((part) => box({ width, height: Math.round(height * part), background: color })),
  );
}

function art(layout: CardLayout, images: string[], size: number): Node {
  const frame: Style = { width: size, height: size, background: PANEL, border: `1px solid ${LINE}` };
  if (layout.art === "none" || images.length === 0) {
    return box({ ...frame, alignItems: "center", justifyContent: "center" }, mark(Math.round(size * 0.34), LINE));
  }
  const picture = (src: string, side: number): Node =>
    h("img", { src, width: side, height: side, style: { width: side, height: side, objectFit: "cover" } });
  if (layout.art === "single" || images.length === 1) return box(frame, picture(images[0] as string, size));
  const cell = Math.floor((size - GAP) / 2);
  const tiles = [0, 1, 2, 3].map((index) => picture(images[index % images.length] as string, cell));
  return box({ ...frame, flexWrap: "wrap", gap: GAP, alignContent: "flex-start" }, ...tiles);
}

function brandRow(): Node {
  return box(
    { alignItems: "center", justifyContent: "space-between", width: TEXT_WIDTH, paddingTop: 26, borderTop: `1px solid ${LINE}` },
    box({ alignItems: "center", gap: 14, fontFamily: MONO, fontWeight: 500, fontSize: 28, color: FG }, mark(26, FG), "lodesong"),
    bars(30, MUTED),
  );
}

function cardTree(layout: CardLayout, images: string[]): Node {
  const details = box(
    { flexDirection: "column", gap: 14, width: TEXT_WIDTH },
    text(
      { fontFamily: SANS, fontWeight: 600, fontSize: layout.titleSize, lineHeight: 1.06, letterSpacing: -1.5, color: FG, lineClamp: 2 },
      layout.title,
    ),
    layout.subtitle &&
      text({ fontFamily: SANS, fontWeight: 400, fontSize: 32, lineHeight: 1.2, color: SOFT, lineClamp: 2 }, layout.subtitle),
    layout.stats && box({ fontFamily: MONO, fontWeight: 500, fontSize: 24, color: MUTED, marginTop: 14 }, layout.stats),
  );
  return box(
    { width: CARD_WIDTH, height: CARD_HEIGHT, padding: PAD },
    art(layout, images, ART),
    box(
      { flexDirection: "column", justifyContent: "space-between", width: TEXT_WIDTH, marginLeft: 56, height: ART },
      box(
        {
          alignItems: "center",
          gap: 12,
          fontFamily: MONO,
          fontWeight: 500,
          fontSize: 22,
          letterSpacing: 4,
          color: SOFT,
          textTransform: "uppercase",
        },
        box({ width: 12, height: 12, background: FG }),
        layout.label,
      ),
      details,
      brandRow(),
    ),
  );
}

function genericTree(): Node {
  return box(
    { width: CARD_WIDTH, height: CARD_HEIGHT, padding: PAD, alignItems: "center", gap: 64 },
    box(
      { width: 360, height: 360, background: PANEL, border: `1px solid ${LINE}`, alignItems: "center", justifyContent: "center" },
      mark(190, FG),
    ),
    box(
      { flexDirection: "column", flex: 1, gap: 22 },
      box({ fontFamily: MONO, fontWeight: 500, fontSize: 88, letterSpacing: -3, color: FG }, "lodesong"),
      box({ fontFamily: SANS, fontWeight: 400, fontSize: 38, lineHeight: 1.25, color: SOFT }, "a self-hosted music player"),
      box({ marginTop: 24 }, bars(48, MUTED)),
    ),
  );
}

const attribute = (value: string): string => value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
const DATA_IMAGE = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

/** A few pixels of the cover stretched over the card read as a soft colour wash: no blur filter, which is slow in wasm. */
function withBackdrop(svg: string, backdrop?: string): string {
  const wash = backdrop && DATA_IMAGE.test(backdrop);
  const inner = svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");
  const size = `width="${CARD_WIDTH}" height="${CARD_HEIGHT}"`;
  return [
    `<svg ${size} viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}" xmlns="http://www.w3.org/2000/svg">`,
    `<defs><linearGradient id="fade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${BG}" stop-opacity="0.45"/><stop offset="0.55" stop-color="${BG}" stop-opacity="0.8"/><stop offset="1" stop-color="${BG}" stop-opacity="0.92"/></linearGradient></defs>`,
    `<rect ${size} fill="${BG}"/>`,
    wash ? `<image href="${attribute(backdrop)}" ${size} preserveAspectRatio="none"/><rect ${size} fill="url(#fade)"/>` : "",
    inner,
    "</svg>",
  ].join("");
}

/** The card as SVG with its text turned into outlines, so rasterising it needs no fonts. Every string is escaped by satori. */
export async function cardSvg(layout: CardLayout | null, images: string[], backdrop?: string): Promise<string> {
  const tree = layout ? cardTree(layout, images) : genericTree();
  const svg = await satori(tree as unknown as Parameters<typeof satori>[0], {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    fonts: await cardFonts(),
  });
  return withBackdrop(svg, layout ? backdrop : undefined);
}
