import "./index.css";
import type { ComponentType, ReactElement } from "react";
import { Composition } from "remotion";
import { beat, FPS } from "./design/beat";
import { Shell } from "./design/shell";
import { MixesShot } from "./scenes/mixes";
import { EndShot } from "./scenes/end";
import { KeysShot } from "./scenes/keys";
import { SessionShot } from "./scenes/session";
import { TerminalShot } from "./scenes/terminal";
import { Open } from "./scenes/open";
import { FRAMES } from "./scenes/open-timeline";
import { HERO_SHOTS } from "./scenes/timelines";

interface SoloProps {
  probe?: boolean;
}

const beats = (id: string): number => beat(HERO_SHOTS.find((shot) => shot.id === id)?.beats ?? 1);

function solo(Shot: ComponentType): (props: SoloProps) => ReactElement {
  return function Solo({ probe }: SoloProps) {
    return (
      <Shell probe={probe}>
        <Shot />
      </Shell>
    );
  };
}

const SCENES: { id: string; component: (props: SoloProps) => ReactElement; frames: number }[] = [
  { id: "scene-open", component: Open, frames: FRAMES },
  { id: "scene-mixes", component: solo(MixesShot), frames: beats("mixes") },
  { id: "scene-session", component: solo(SessionShot), frames: beats("session") },
  { id: "scene-keys", component: solo(KeysShot), frames: beats("keys") },
  { id: "scene-terminal", component: solo(TerminalShot), frames: beats("terminal") },
  { id: "scene-end", component: solo(EndShot), frames: beats("end") },
];

export function Root() {
  return (
    <>
      {SCENES.map((scene) => (
        <Composition
          key={scene.id}
          id={scene.id}
          component={scene.component}
          durationInFrames={scene.frames}
          fps={FPS}
          width={1920}
          height={1080}
          defaultProps={{ probe: false }}
        />
      ))}
    </>
  );
}
