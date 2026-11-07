const HIDDEN = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu;
const DECORATION = /[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{M}]/u;
const LETTER = /[\p{L}\p{N}]/u;

/** Text from the library as shown anywhere outside the app: composed, no control or bidi characters, one line, capped. */
export function clean(text: string, max: number): string {
  const flat = text.toWellFormed().normalize("NFC").replace(HIDDEN, " ").replace(/\s+/g, " ").trim();
  const chars = [...flat];
  return chars.length > max
    ? `${chars
        .slice(0, max - 1)
        .join("")
        .trimEnd()}…`
    : flat;
}

/**
 * What a card can show of `text` in fonts that cover `covered`: emoji and stray marks drop, but a run of letters the fonts
 * lack becomes one "…" so a reader sees something was left out.
 */
export function drawable(text: string, covered: (code: number) => boolean): string {
  let out = "";
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (covered(code)) out += char;
    else if (!DECORATION.test(char) && !out.endsWith("…")) out += "…";
  }
  return out
    .replace(/\s+/g, " ")
    .replace(/\s*…(?:\s*…)+/g, " …")
    .trim();
}

export const hasLetters = (text: string): boolean => LETTER.test(text);
