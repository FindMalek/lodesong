import { drawable, hasLetters } from "./card-text";
import type { CardData } from "./share-card";

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

const SIZES = [84, 72, 60, 52, 44];
const EM = 0.58;

/** The largest size at which the title takes at most two lines; longer ones get the smallest and an ellipsis. */
export function titleSize(title: string): number {
  const fits = SIZES.find((size) => {
    const perLine = Math.floor(TEXT_WIDTH / (size * EM));
    const longestWord = Math.max(...title.split(" ").map((word) => word.length));
    return longestWord <= perLine && Math.ceil(title.length / perLine) <= 2;
  });
  return fits ?? (SIZES.at(-1) as number);
}

type Covered = (code: number) => boolean;

const parts = (text: string | undefined, covered: Covered): string[] =>
  drawable(text ?? "", covered)
    .split(/\s*·\s*/)
    .filter(Boolean);

/** A title the fonts cannot draw falls back to the first part of the subtitle that they can, then to the kind. */
export function layoutOf(card: CardData, covered: Covered): CardLayout {
  const title = drawable(card.title, covered);
  const rest = parts(card.subtitle, covered);
  const readable = (text: string): boolean => hasLetters(text.replaceAll("…", ""));
  const stand = readable(title) ? -1 : rest.findIndex(readable);
  const shown =
    stand >= 0 ? (rest.splice(stand, 1)[0] as string) : readable(title) ? title : `${/^[aeiou]/.test(card.kind) ? "an" : "a"} ${card.kind}`;
  return {
    label: card.kind,
    title: shown,
    titleSize: titleSize(shown),
    subtitle: rest.join(" · ") || undefined,
    stats: parts(card.stats, covered).join(" · "),
    art: card.covers.length > 1 ? "mosaic" : card.covers.length === 1 ? "single" : "none",
  };
}
