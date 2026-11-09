import type { CSSProperties } from "react";
import { useCurrentFrame } from "remotion";
import { gridBeat as beat } from "./beat";
import { gold } from "./gold";

export interface KaraokeWord {
  text: string;
  at: number;
  length: number;
}

/** Spreads a line over `length` beats, each word weighted by its letters. */
export function wordsOf(text: string, at: number, length: number): KaraokeWord[] {
  const words = text.split(/\s+/).filter(Boolean);
  const total = words.reduce((sum, word) => sum + word.length + 1, 0);
  let cursor = at;
  return words.map((word) => {
    const span = (length * (word.length + 1)) / total;
    const entry = { text: word, at: cursor, length: span };
    cursor += span;
    return entry;
  });
}

export function fillAt(frame: number, word: KaraokeWord): number {
  const from = beat(word.at);
  const to = beat(word.at + word.length);
  if (frame <= from) return 0;
  if (frame >= to) return 1;
  return (frame - from) / (to - from);
}

interface KaraokeLineProps {
  words: readonly KaraokeWord[];
  size?: number;
  dim?: string;
  style?: CSSProperties;
}

const EDGE = 0.12;

/** A lyric line whose words fill with gold as sung, a soft-edged sweep inside each word. */
export function KaraokeLine({
  words,
  size = 96,
  dim = "color-mix(in oklch, var(--foreground) 34%, transparent)",
  style,
}: KaraokeLineProps) {
  const frame = useCurrentFrame();
  return (
    <div
      data-legible=""
      style={{
        display: "flex",
        flexWrap: "wrap",
        columnGap: size * 0.28,
        fontFamily: "var(--font-sans)",
        fontSize: size,
        fontWeight: 650,
        letterSpacing: "-0.02em",
        lineHeight: 1.12,
        ...style,
      }}
    >
      {words.map((word) => {
        const p = fillAt(frame, word);
        const edge = p * (1 + EDGE);
        const sung = `${(edge - EDGE) * 100}%`;
        const head = `${edge * 100}%`;
        return (
          <span
            key={`${word.at}-${word.text}`}
            style={{
              backgroundImage: `linear-gradient(90deg, ${gold(1)} ${sung}, ${dim} ${head})`,
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              WebkitTextFillColor: "transparent",
              color: "transparent",
            }}
          >
            {word.text}
          </span>
        );
      })}
    </div>
  );
}
