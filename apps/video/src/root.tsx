import "./index.css";
import type { ComponentType, ReactElement } from "react";
import { Composition } from "remotion";
import { beat, FPS } from "./design/beat";
import { Shell } from "./design/shell";
import { Film, SHOTS } from "./scenes/film";
import { Loop } from "./scenes/loop";
import { Open } from "./scenes/open";
import { FRAMES } from "./scenes/open-timeline";
import { CUT_SHOTS, frames, HERO_SHOTS, LOOP } from "./scenes/timelines";

interface Props {
  probe?: boolean;
}

type Scene = (props: Props) => ReactElement;

function solo(Shot: ComponentType): Scene {
  return function Solo({ probe }: Props) {
    return (
      <Shell probe={probe}>
        <Shot />
      </Shell>
    );
  };
}

const beats = (id: string): number => beat(HERO_SHOTS.find((shot) => shot.id === id)?.beats ?? 1);

const WIDE = { width: 1920, height: 1080 };
const TALL = { width: 1080, height: 1920 };

function hero({ probe }: Props): ReactElement {
  return <Film shots={HERO_SHOTS} audio="audio/hero.wav" probe={probe} />;
}

function cutdown({ probe }: Props): ReactElement {
  return <Film shots={CUT_SHOTS} audio="audio/cutdown.wav" probe={probe} />;
}

const COMPOSITIONS: { id: string; component: Scene; frames: number; size: { width: number; height: number } }[] = [
  { id: "hero", component: hero, frames: frames(HERO_SHOTS), size: WIDE },
  { id: "cutdown-vertical", component: cutdown, frames: frames(CUT_SHOTS), size: TALL },
  { id: "loop-readme", component: Loop, frames: beat(LOOP.end), size: WIDE },
  { id: "scene-open", component: Open, frames: FRAMES, size: WIDE },
  ...Object.entries(SHOTS)
    .filter(([id]) => id !== "open")
    .map(([id, Shot]) => ({ id: `scene-${id}`, component: solo(Shot), frames: beats(id), size: WIDE })),
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
