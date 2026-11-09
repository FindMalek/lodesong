import { plateBox } from "../captures/film-manifest";

export const LINE_HOLD = plateBox("lyrics-full", "line-02", "active");
export const LINE_SAY = plateBox("lyrics-full", "word-04-0", "active");
export const LINE_STAY = plateBox("lyrics-full", "click-line", "active");

/** Distance between two lyric lines in the full-screen view, CSS px, measured between the rows on the plates. */
const LINE_PITCH = 71.4;

/** The column scrolls up by this much when the click lands: where that line sat on word-04 (three rows down) minus where the click plate has it. */
export const SCROLL_DY = LINE_SAY.y + 3 * LINE_PITCH - LINE_STAY.y;
