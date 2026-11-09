import "./index.css";
import type { ComponentType, ReactElement } from "react";
import { Composition, Folder } from "remotion";
import { FPS, gridBeat } from "./design/beat";
import { Shell } from "./design/shell";
import { CUT_SCENES } from "./scenes/cutdown";
import { Film, HERO_SCENES } from "./scenes/film";
import { LEGACY_SCENES } from "./scenes/legacy";
import { LEGACY_HERO_SHOTS, LOOP } from "./scenes/legacy-timelines";
import { LENS_DEMO_BEATS, LensDemo } from "./scenes/lens-demo";
import { Loop } from "./scenes/loop";
import { Open } from "./scenes/open";
import { FRAMES } from "./scenes/open-timeline";
import { CUTDOWN, HERO, type Plan, TOUR } from "./scenes/timelines";
import { TOUR_SCENES, TourFilm } from "./scenes/tour/film";

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

function tourFilm({ probe }: Props) {
  return <TourFilm probe={probe} audio="audio/tour.wav" />;
}

interface Item {
  id: string;
  folder?: string;
  component: Scene;
  frames: number;
  size: Size;
}

/** Every film is one row: a plan (shot table on a tempo map), its scenes, its score, its size. A new film needs only a row here. */
const FILMS: Item[] = [
  { id: "hero", component: filmOf(HERO, HERO_SCENES, "audio/hero.wav"), frames: HERO.frames, size: WIDE },
  { id: "cutdown-vertical", component: filmOf(CUTDOWN, CUT_SCENES, "audio/cutdown.wav"), frames: CUTDOWN.frames, size: TALL },
  { id: "tour", component: tourFilm, frames: TOUR.frames, size: WIDE },
  { id: "loop-readme", component: Loop, frames: gridBeat(LOOP.end), size: WIDE },
];

const TOUR_STUDIO: Item[] = TOUR.shots.map((shot) => ({
  id: `tour-${shot.id}`,
  folder: "tour",
  component: solo(TOUR_SCENES[shot.id]),
  frames: shot.frames,
  size: WIDE,
}));

/** Each shot alone, at its own length, for working on it in Studio. */
const SHOT_STUDIO: Item[] = HERO.shots.map((shot) => ({
  id: `shot-${shot.id}`,
  folder: "shots",
  component: solo(HERO_SCENES[shot.id]),
  frames: shot.frames,
  size: WIDE,
}));

/** The pre-v2 scenes keep their old ids and their constant 120 bpm grid until the new shots replace them. */
const LEGACY: Item[] = [
  { id: "scene-open", folder: "old-v1", component: Open, frames: FRAMES, size: WIDE },
  { id: "scene-lens-demo", folder: "old-v1", component: LensDemo, frames: gridBeat(LENS_DEMO_BEATS), size: WIDE },
  ...Object.entries(LEGACY_SCENES)
    .filter(([id]) => id !== "open")
    .map(([id, Shot]) => ({
      id: `scene-${id}`,
      folder: "old-v1",
      component: solo(Shot),
      frames: gridBeat(LEGACY_HERO_SHOTS.find((shot) => shot.id === id)?.beats ?? 1),
      size: WIDE,
    })),
];

const COMPOSITIONS: Item[] = [...FILMS, ...SHOT_STUDIO, ...TOUR_STUDIO, ...LEGACY];

function Entry({ item }: { item: Item }) {
  return (
    <Composition
      id={item.id}
      component={item.component}
      durationInFrames={item.frames}
      fps={FPS}
      width={item.size.width}
      height={item.size.height}
      defaultProps={{ probe: false }}
    />
  );
}

export function Root() {
  const folders = ["shots", "tour", "old-v1"];
  return (
    <>
      {COMPOSITIONS.filter((item) => !item.folder).map((item) => (
        <Entry key={item.id} item={item} />
      ))}
      {folders.map((name) => (
        <Folder key={name} name={name}>
          {COMPOSITIONS.filter((item) => item.folder === name).map((item) => (
            <Entry key={item.id} item={item} />
          ))}
        </Folder>
      ))}
    </>
  );
}
