import type { ReactNode } from "react";
import { Img, useCurrentFrame } from "remotion";
import { ease, ramp } from "../design/motion";
import type { Box } from "../design/probe";
import { GoldText, Patch, PLATE_PX, plateFile } from "./s4-kit";
import { LINE_HOLD, LINE_SAY, LINE_STAY, SCROLL_DY } from "./s4-lyric-data";

const GLOW = "drop-shadow(0 0 8px color-mix(in oklch, var(--ignite) 50%, transparent))";

const COLUMN = { x: 560, y: 0, w: 880, h: 810 };

function GoldLine({ src, box, from }: { src: string; box: Box; from: number }) {
  const frame = useCurrentFrame();
  const t = ramp(frame, from, 8);
  if (t <= 0) return null;
  return (
    <div style={{ position: "absolute", inset: 0, filter: GLOW, opacity: t }}>
      <Patch src={src} box={{ x: box.x - 4, y: box.y - 3, w: box.w + 8, h: box.h + 6 }} filter="url(#s4-gold)" />
    </div>
  );
}

interface ColumnProps {
  src: string;
  shift: number;
  opacity?: number;
  children?: ReactNode;
}

function Column({ src, shift, opacity = 1, children }: ColumnProps) {
  return (
    <div style={{ position: "absolute", left: COLUMN.x, top: COLUMN.y, width: COLUMN.w, height: COLUMN.h, overflow: "hidden", opacity }}>
      <div style={{ position: "absolute", inset: 0, transform: `translateY(${shift}px)` }}>
        <div style={{ position: "absolute", left: -COLUMN.x, top: 0, width: PLATE_PX.w, height: PLATE_PX.h }}>
          <Img src={src} style={{ width: PLATE_PX.w, height: PLATE_PX.h, display: "block", maxWidth: "none" }} />
          {children}
        </div>
      </div>
    </div>
  );
}

interface FullScreenLyricsProps {
  /** frame the highlight moves from the first line to the second */
  advanceAt: number;
  /** frame of the click on a far line, the column scrolls from there */
  clickAt: number;
  scrollFrames?: number;
}

const HOLD = "lyrics-full/line-02";
const SAY = "lyrics-full/word-04-0";
const STAY = "lyrics-full/click-line";

/** The real full-screen lyrics view from three captured plates: the highlight follows the song line by line, then a click scrolls the column the distance the app scrolled and lights the clicked line. */
export function FullScreenLyrics({ advanceAt, clickAt, scrollFrames = 22 }: FullScreenLyricsProps) {
  const frame = useCurrentFrame();
  const holdFile = plateFile(HOLD);
  const sayFile = plateFile(SAY);
  const stayFile = plateFile(STAY);
  const s = ramp(frame, clickAt, scrollFrames, ease.out);
  const bOpacity = ramp(frame, clickAt, 8, ease.out);
  return (
    <>
      <GoldText />
      <Patch src={sayFile} box={{ x: 0, y: 0, w: COLUMN.x, h: PLATE_PX.h }} />
      {frame < advanceAt ? (
        <Column src={holdFile} shift={0}>
          <GoldLine src={holdFile} box={LINE_HOLD} from={2} />
        </Column>
      ) : (
        <Column src={sayFile} shift={-SCROLL_DY * s}>
          <GoldLine src={sayFile} box={LINE_SAY} from={advanceAt} />
        </Column>
      )}
      {frame >= clickAt ? (
        <Column src={stayFile} shift={SCROLL_DY * (1 - s)} opacity={bOpacity}>
          <GoldLine src={stayFile} box={LINE_STAY} from={clickAt + 3} />
        </Column>
      ) : null}
    </>
  );
}
