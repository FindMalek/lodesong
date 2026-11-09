import type { ReactNode } from "react";
import { Img, useCurrentFrame } from "remotion";
import { ease, ramp } from "../design/motion";
import { GoldText, Patch, PLATE_PX, plateFile } from "./s4-kit";
import { fillOf, LINE_SAY, LINE_STAY, type LyricLine, SCROLL_DY, wordSpans } from "./s4-lyric-data";

const GLOW = "drop-shadow(0 0 8px color-mix(in oklch, var(--ignite) 50%, transparent))";

const COLUMN = { x: 560, y: 0, w: 880, h: 810 };

interface GoldLineProps {
  src: string;
  line: LyricLine;
  start: number;
}

function GoldLine({ src, line, start }: GoldLineProps) {
  const frame = useCurrentFrame();
  const spans = wordSpans(line, start);
  return (
    <div style={{ position: "absolute", inset: 0, filter: GLOW }}>
      {line.words.map((word, i) => {
        const p = fillOf(frame, spans[i] ?? { from: 0, to: 0 });
        if (p <= 0) return null;
        const w = word.x1 - word.x0 + 4;
        return (
          <div key={word.text + word.at}>
            <Patch
              src={src}
              box={{ x: word.x0 - 2, y: line.y - 2, w, h: line.h + 4 }}
              filter="url(#s4-gold)"
              style={{ clipPath: `inset(0 ${(1 - p) * 100}% 0 0)` }}
            />
          </div>
        );
      })}
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
  singAt: number;
  clickAt: number;
  scrollFrames?: number;
}

const SAY = "lyrics-full/word-04-0";
const STAY = "lyrics-full/click-line";

/** The real full-screen lyrics view: two captured plates, the column scrolled between them by the same distance the app scrolled, gold word fill laid on the line that is being sung. */
export function FullScreenLyrics({ singAt, clickAt, scrollFrames = 22 }: FullScreenLyricsProps) {
  const frame = useCurrentFrame();
  const sayFile = plateFile(SAY);
  const stayFile = plateFile(STAY);
  const s = ramp(frame, clickAt, scrollFrames, ease.out);
  const showB = frame >= clickAt;
  const bOpacity = ramp(frame, clickAt, 8, ease.out);
  return (
    <>
      <GoldText />
      <Patch src={sayFile} box={{ x: 0, y: 0, w: COLUMN.x, h: PLATE_PX.h }} />
      <Column src={sayFile} shift={-SCROLL_DY * s}>
        <GoldLine src={sayFile} line={LINE_SAY} start={singAt} />
      </Column>
      {showB ? (
        <Column src={stayFile} shift={SCROLL_DY * (1 - s)} opacity={bOpacity}>
          <GoldLine src={stayFile} line={LINE_STAY} start={clickAt + 3} />
        </Column>
      ) : null}
    </>
  );
}
