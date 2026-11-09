import type { ReactNode } from "react";
import { Sequence, useCurrentFrame } from "remotion";
import { plateBox, plateSrc, take } from "../captures/film-manifest";
import type { ShotCue } from "../captures/types";
import { addCam, Camera, type CamKey, camAt, handheld } from "../design/camera";
import { Cursor, type CursorStop } from "../design/cursor";
import { Bracket } from "../design/draw";
import { ease, ramp } from "../design/motion";
import { Plate, plateKeys, plateLayout } from "../design/plate";
import type { Box } from "../design/probe";
import { ShotChip } from "../ui/s1-chip";
import { DitherReveal } from "../ui/themes-reveal";
import { type LookInfo, lookInfo, TokenStrip } from "../ui/themes-tokens";
import { shotOf } from "./timelines";

const SHOT = shotOf("themes");
const LAYOUT = plateLayout({ w: take("look-paper").w, h: take("look-paper").h });
const REVEAL = 10;

interface Look {
  info: LookInfo;
  take: string;
  start: number;
  frames: number;
  keys: readonly CamKey[];
}

const g = (frame: number): number => frame / 30;
const BOUNDS = [1, 3.5, 5.75, 8].map((beat) => SHOT.beat(beat));
const spans = (index: number): { start: number; frames: number } => {
  const start = index === 0 ? 0 : (BOUNDS[index - 1] ?? 0);
  return { start, frames: (BOUNDS[index] ?? SHOT.frames) - start };
};

const stops = (list: readonly { box: Box; scale: number; ry: number }[], frames: number): CamKey[] =>
  plateKeys(
    LAYOUT,
    list.map((stop, i) => ({ at: g((frames * i) / Math.max(1, list.length - 1)), box: stop.box, scale: stop.scale, ry: stop.ry })),
  );

const FULL: Box = { x: 0, y: 0, w: 1440, h: 810 };

const DEFS: readonly { name: string; dark: boolean; push: readonly [Box, Box] }[] = [
  { name: "paper", dark: false, push: [FULL, { x: 160, y: 120, w: 1100, h: 620 }] },
  {
    name: "slate",
    dark: true,
    push: [
      { x: 280, y: 60, w: 1160, h: 650 },
      { x: 140, y: 100, w: 1100, h: 620 },
    ],
  },
  { name: "terminal", dark: true, push: [FULL, { x: 260, y: 150, w: 1100, h: 620 }] },
];

const LOOKS: readonly Look[] = DEFS.map((entry, i): Look => {
  const { start, frames } = spans(i + 1);
  return {
    info: lookInfo(entry.name, entry.dark),
    take: `look-${entry.name}`,
    start,
    frames,
    keys: stops(
      [
        { box: entry.push[0] ?? FULL, scale: 1.04, ry: i % 2 === 0 ? -0.8 : 0.8 },
        { box: entry.push[1] ?? FULL, scale: 1.16, ry: i % 2 === 0 ? 0.8 : -0.8 },
      ],
      frames + REVEAL,
    ),
  };
});

const DIALOG = spans(0);
const CLICK_AT = SHOT.beat(0.8);
const PICKED = plateBox("look-paper", "before", "picked");
const DIALOG_KEYS = plateKeys(LAYOUT, [
  { at: 0, box: { x: 0, y: 0, w: 1440, h: 810 }, scale: 1.05, ry: -1.5 },
  { at: g(CLICK_AT), box: { x: 700, y: 150, w: 420, h: 60 }, scale: 2.2, ry: 0.8 },
  { at: g(SHOT.frames), box: { x: 700, y: 150, w: 420, h: 60 }, scale: 2.4, ry: 1.2 },
]);
const CURSOR: CursorStop[] = [
  { at: 0, x: 1210, y: 430 },
  { at: g(CLICK_AT), x: PICKED.x + PICKED.w / 2, y: PICKED.y + PICKED.h / 2, click: true },
];

const THEME_CUES_UNSORTED: readonly ShotCue[] = [
  { shot: "themes", at: 0, kind: "tick", label: "settings, appearance" },
  { shot: "themes", at: CLICK_AT, kind: "click", label: "click the paper look" },
  ...LOOKS.map((look): ShotCue => ({ shot: "themes", at: look.start, kind: "hit", label: `look: ${look.info.name}` })),
  ...LOOKS.map((look): ShotCue => ({ shot: "themes", at: look.start + 14, kind: "tick", label: `tokens settle: ${look.info.code}` })),
];

export const THEMES_CUES: readonly ShotCue[] = [...THEME_CUES_UNSORTED].sort((a, b) => a.at - b.at);

function Dialog() {
  const frame = useCurrentFrame();
  const cam = addCam(camAt(frame, DIALOG_KEYS), handheld(frame, 0.5));
  return (
    <Camera cam={cam}>
      <Plate src={plateSrc("settings-appearance", "settings-appearance")} layout={LAYOUT} brightness={1.6}>
        <Bracket box={PICKED} at={g(CLICK_AT)} pad={5} arm={9} width={2.4} />
        <Cursor stops={CURSOR} size={46 / (LAYOUT.k * cam.scale)} />
      </Plate>
    </Camera>
  );
}

function LookView({ look }: { look: Look }) {
  const frame = useCurrentFrame();
  const cam = addCam(
    camAt(frame, look.keys, (t) => t),
    handheld(frame, 0.5),
  );
  const settle = ramp(frame, 8, 14, ease.out);
  return (
    <>
      <Camera cam={cam}>
        <Plate src={plateSrc(look.take, "albums")} layout={LAYOUT} brightness={1} />
      </Camera>
      <div style={{ position: "absolute", left: 72, bottom: 72, opacity: settle, transform: `translateY(${(1 - settle) * 24}px)` }}>
        <TokenStrip info={look.info} />
      </div>
      <ShotChip text={look.info.name} from={4} right={72} />
    </>
  );
}

/** The themes shot: the settings look row, one click, then the same albums page under three looks, each applied through the dither and carrying its own tokens. */
export function ThemesShot() {
  return (
    <>
      <Sequence layout="none" from={DIALOG.start} durationInFrames={DIALOG.frames + REVEAL}>
        <Dialog />
      </Sequence>
      {LOOKS.map((look) => (
        <Sequence
          key={look.info.name}
          layout="none"
          from={look.start}
          durationInFrames={look.frames + (look === LOOKS.at(-1) ? 0 : REVEAL)}
        >
          <Reveal>
            <LookView look={look} />
          </Reveal>
        </Sequence>
      ))}
      <ShotChip text="make it yours" from={6} right={72} top={840} />
    </>
  );
}

function Reveal({ children }: { children: ReactNode }) {
  const frame = useCurrentFrame();
  return <DitherReveal progress={ramp(frame, 0, REVEAL, ease.inOut)}>{children}</DitherReveal>;
}
