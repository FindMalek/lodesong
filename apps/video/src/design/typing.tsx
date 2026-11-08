import { hash } from "./motion";

const FIRST_CHAR_GAP = 4;

/** Frames at which each character lands: 4 to 7 frames apart (66 to 116 ms), irregular like a hand, same every render. */
export function typingFrames(text: string, from: number, salt = 0): number[] {
  const out: number[] = [];
  let at = from;
  for (let i = 0; i < text.length; i += 1) {
    out.push(at);
    at += FIRST_CHAR_GAP + Math.round(3 * hash(i * 3.7 + salt));
  }
  return out;
}

export const typedCount = (frame: number, landings: readonly number[]): number => landings.filter((at) => frame >= at).length;

/** Block caret: solid while typing, then about 1 Hz. */
export function Caret({
  frame,
  typing,
  size,
  color = "var(--foreground)",
}: {
  frame: number;
  typing: boolean;
  size: number;
  color?: string;
}) {
  const on = typing || Math.floor(frame / 30) % 2 === 0;
  return (
    <span
      style={{
        display: "inline-block",
        width: size * 0.56,
        height: size * 1.05,
        verticalAlign: "text-bottom",
        marginLeft: 2,
        background: color,
        opacity: on ? 1 : 0,
      }}
    />
  );
}
