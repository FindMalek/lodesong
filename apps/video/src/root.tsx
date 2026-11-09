import "./index.css";
import type { ComponentType, ReactElement } from "react";
import { Composition } from "remotion";
import { FPS, gridBeat } from "./design/beat";
import { Shell } from "./design/shell";
import { CUT_SCENES } from "./scenes/cutdown";
import { Film, HERO_SCENES } from "./scenes/film";
import { LEGACY_SCENES } from "./scenes/legacy";
import { LEGACY_HERO_SHOTS, LOOP } from "./scenes/legacy-timelines";
import { Loop } from "./scenes/loop";
import { Open } from "./scenes/open";
import { FRAMES } from "./scenes/open-timeline";
import { CUTDOWN, HERO, type Plan } from "./scenes/timelines";

interface Props {
  probe?: boolean;
}

type Scene = (props: Props) => ReactElement;

interface Size {
  width: number;
  height: number;
}

const WIDE: Size = { width: 1920, height: 1080 };
const TALL: Size = { width: 1080, height: 1920 };

function solo(Shot: ComponentType): Scene {
  return function Solo({ probe }: Props) {
    return (
      <Shell probe={probe}>
        <Shot />
      </Shell>
    );
  };
}

function filmOf<Id extends string>(plan: Plan<Id>, scenes: Record<Id, ComponentType>, audio: string): Scene {
  return function Rendered({ probe }: Props) {
    return <Film plan={plan} scenes={scenes} audio={audio} probe={probe} />;
  };
}

interface Item {
  id: string;
  component: Scene;
  frames: number;
  size: Size;
}

/** Every film is one row: a plan (shot table on a tempo map), its scenes, its score, its size. A new film needs only a row here. */
const FILMS: Item[] = [
  { id: "hero", component: filmOf(HERO, HERO_SCENES, "audio/hero.wav"), frames: HERO.frames, size: WIDE },
  { id: "cutdown-vertical", component: filmOf(CUTDOWN, CUT_SCENES, "audio/cutdown.wav"), frames: CUTDOWN.frames, size: TALL },
];

/** Each shot alone, at its own length, for working on it in Studio. */
const SHOT_STUDIO: Item[] = HERO.shots.map((shot) => ({
  id: `shot-${shot.id}`,
  component: solo(HERO_SCENES[shot.id]),
  frames: shot.frames,
  size: WIDE,
}));

/** The pre-v2 scenes keep their old ids and their constant 120 bpm grid until the new shots replace them. */
const LEGACY: Item[] = [
  { id: "scene-open", component: Open, frames: FRAMES, size: WIDE },
  ...Object.entries(LEGACY_SCENES)
    .filter(([id]) => id !== "open")
    .map(([id, Shot]) => ({
      id: `scene-${id}`,
      component: solo(Shot),
      frames: gridBeat(LEGACY_HERO_SHOTS.find((shot) => shot.id === id)?.beats ?? 1),
      size: WIDE,
    })),
];

const COMPOSITIONS: Item[] = [
  ...FILMS,
  { id: "loop-readme", component: Loop, frames: gridBeat(LOOP.end), size: WIDE },
  ...SHOT_STUDIO,
  ...LEGACY,
];

export function Root() {
  return (
    <>
      {COMPOSITIONS.map((item) => (
        <Composition
          key={item.id}
          id={item.id}
          component={item.component}
          durationInFrames={item.frames}
          fps={FPS}
          width={item.size.width}
          height={item.size.height}
          defaultProps={{ probe: false }}
        />
      ))}
    </>
  );
}
