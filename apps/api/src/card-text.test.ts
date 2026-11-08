import { expect, test } from "bun:test";
import { covered } from "./card-fonts";
import { PALETTE } from "./card-svg";
import { clean, drawable } from "./card-text";

test("clean composes accents, drops control and bidi characters, flattens lines and caps the length", () => {
  expect(clean("Björk Café", 50)).toBe("Björk Café");
  const hidden = (code: number) => String.fromCodePoint(code);
  expect(clean(`a${hidden(0x202e)}b${hidden(0)}c${hidden(0x200b)}d\ne\t f`, 50)).toBe("a b c d e f");
  expect(clean("abcdefghij", 5)).toBe("abcd…");
  expect(clean("abcde", 5)).toBe("abcde");
  expect(clean("😀".repeat(10), 4)).toBe("😀😀😀…");
  expect(clean("x\ud800y", 10)).toBe("x�y");
});

test("the fonts' own glyph tables decide what is drawn: Vietnamese and Cyrillic yes, CJK, Arabic, Hebrew and Thai no", async () => {
  const has = await covered();
  for (const char of "ạệồơưĐđÇğŞłПривет αβγ éÖß·") expect(has(char.codePointAt(0) as number)).toBe(true);
  for (const char of "夜あ한شשก🎵") expect(has(char.codePointAt(0) as number)).toBe(false);
});

test("a run of letters the fonts lack becomes one ellipsis, while emoji and stray marks vanish", async () => {
  const has = await covered();
  expect(drawable("Café 夜に駆ける (Live)", has)).toBe("Café … (Live)");
  expect(drawable("夜 and 駆", has)).toBe("… and …");
  expect(drawable("夜 夜", has)).toBe("…");
  expect(drawable("Night夜に", has)).toBe("Night…");
  expect(drawable("Chill 🔥👍🏽 Mix", has)).toBe("Chill Mix");
  expect(drawable("eั", has)).toBe("e");
});

test("the card's colours are the player's dark theme tokens", async () => {
  const css = await Bun.file(`${import.meta.dir}/../../../packages/ui/src/styles/theme.css`).text();
  const dark = css.slice(css.indexOf(".dark {"));
  const token = (name: string) => new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`).exec(dark)?.[1];
  const palette: Record<string, string> = PALETTE;
  expect(palette.BG).toBe(token("background"));
  expect(palette.FG).toBe(token("foreground"));
  expect(palette.PANEL).toBe(token("card"));
  expect(palette.MUTED).toBe(token("muted-foreground"));
  expect(palette.LINE).toBe(token("border"));
});

test("joiners stay inside emoji sequences and Persian words, and go everywhere else", () => {
  const family = "👨\u200d👩\u200d👧";
  expect(clean(family, 50)).toBe(family);
  expect(clean("می\u200cخواهم", 50)).toBe("می\u200cخواهم");
  expect(clean("\u200dab\u200d \u200c\u200cc\u200d", 50)).toBe("ab c");
  expect(clean("a\u200bb\u202ec", 50)).toBe("a b c");
});

test("a joiner left over from a dropped emoji or an unsupported word draws nothing", async () => {
  const has = await covered();
  expect(drawable("Fam 👨\u200d👩 Mix", has)).toBe("Fam Mix");
  expect(drawable("a\u200cb", has)).toBe("ab");
});
