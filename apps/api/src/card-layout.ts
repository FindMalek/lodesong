import { type CardData, printable } from "./share-card";

export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 630;
export const TEXT_WIDTH = 514;

/** What is drawn for a card: the text that the fonts can show, sized to fit two lines. */
export interface CardLayout {
  label: string;
  title: string;
  titleSize: number;
  subtitle?: string;
  stats: string;
  art: "single" | "mosaic" | "none";
}

const SIZES = [84, 70, 58, 48, 40];
const EM = 0.54;

/** The largest size at which the title takes at most two lines; longer ones get the smallest and an ellipsis. */
export function titleSize(title: string): number {
  const fits = SIZES.find((size) => {
    const perLine = Math.floor(TEXT_WIDTH / (size * EM));
    const longestWord = Math.max(...title.split(" ").map((word) => word.length));
    return longestWord <= perLine && Math.ceil(title.length / perLine) <= 2;
  });
  return fits ?? (SIZES.at(-1) as number);
}

/** Dropping unprintable parts can leave a dangling separator ("· Cafe"): keep only the parts that are left. */
const parts = (text: string | undefined): string =>
  printable(text ?? "")
    .split(/\s*·\s*/)
    .filter(Boolean)
    .join(" · ");

export function layoutOf(card: CardData): CardLayout {
  const title = printable(card.title) || `untitled ${card.kind}`;
  return {
    label: card.kind,
    title,
    titleSize: titleSize(title),
    subtitle: parts(card.subtitle) || undefined,
    stats: parts(card.stats),
    art: card.covers.length > 1 ? "mosaic" : card.covers.length === 1 ? "single" : "none",
  };
}
