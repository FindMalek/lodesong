import type { ComponentType, CSSProperties } from "react";
import { Sequence } from "remotion";
import { Shell } from "../design/shell";
import { ShotStart } from "../design/song-clock";
import { ColdOpenShot } from "./shot-cold-open";
import { FindLineShot } from "./shot-find-line";
import { KeysShot } from "./shot-keys";
import { LandShot } from "./shot-land";
import { LyricsShot } from "./shot-lyrics";
import { LyterionShot } from "./shot-lyterion";
import { MixesShot } from "./shot-mixes";
import { MoodShot } from "./shot-mood";
import { NotchShot } from "./shot-notch";
import { PlayLineShot } from "./shot-play-line";
import { QueueShot } from "./shot-queue";
import { SessionShot } from "./shot-session";
import { ShellsShot } from "./shot-shells";
import { ThemesShot } from "./shot-themes";
import { YoursShot } from "./shot-yours";
import type { Plan, ShotId } from "./timelines";

/** One scene per hero shot. Each lives in its own `shot-<id>.tsx`, so shots land without touching each other. */
export const HERO_SCENES: Record<ShotId, ComponentType> = {
  "cold-open": ColdOpenShot,
  "find-line": FindLineShot,
  "play-line": PlayLineShot,
  lyrics: LyricsShot,
  lyterion: LyterionShot,
  queue: QueueShot,
  mixes: MixesShot,
  mood: MoodShot,
  session: SessionShot,
  shells: ShellsShot,
  notch: NotchShot,
  keys: KeysShot,
  themes: ThemesShot,
  yours: YoursShot,
  land: LandShot,
};

const PREMOUNT = 60;

/** The next shot is mounted a second early but painted at an opacity below one 8-bit step: `display: none` (the default) would leave its plates undecoded until the cut, and the first paint of a 2880 px plate is a visible stall in Studio. */
const WARM: CSSProperties = { display: "flex", opacity: 0.004 };

interface FilmProps<Id extends string> {
  plan: Plan<Id>;
  scenes: Record<Id, ComponentType>;
  audio: string;
  probe?: boolean;
  grainOut?: boolean;
}

/** The whole film: the shots back to back on the tempo map, one shell, one score. Any plan works, so a second film only needs its own table. */
export function Film<Id extends string>({ plan, scenes, audio, probe, grainOut }: FilmProps<Id>) {
  return (
    <Shell audio={audio} probe={probe} grainOutAt={grainOut ? plan.frames - 12 : undefined}>
      {plan.shots.map((shot) => {
        const Scene: ComponentType = scenes[shot.id];
        return (
          <Sequence
            key={shot.id}
            from={shot.start}
            durationInFrames={shot.frames}
            premountFor={PREMOUNT}
            styleWhilePremounted={WARM}
            name={`S${shot.number} ${shot.id}`}
          >
            <ShotStart.Provider value={shot.start}>
              <Scene />
            </ShotStart.Provider>
          </Sequence>
        );
      })}
    </Shell>
  );
}
