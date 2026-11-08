import type { ComponentType } from "react";
import { Sequence } from "remotion";
import { beat } from "../design/beat";
import { Shell } from "../design/shell";
import { ShotStart } from "../design/song-clock";
import { EndShot } from "./end";
import { KeysShot } from "./keys";
import { MixesShot } from "./mixes";
import { OpenShot } from "./open";
import { SessionShot } from "./session";
import { TerminalShot } from "./terminal";
import { type Shot, starts } from "./timelines";

export const SHOTS: Record<string, ComponentType> = {
  open: OpenShot,
  keys: KeysShot,
  mixes: MixesShot,
  session: SessionShot,
  terminal: TerminalShot,
  end: EndShot,
};

interface FilmProps {
  shots: readonly Shot[];
  audio: string;
  probe?: boolean;
}

/** The whole film: the shots back to back on the score's grid, one shell, one score. */
export function Film({ shots, audio, probe }: FilmProps) {
  const at = starts(shots);
  return (
    <Shell audio={audio} probe={probe}>
      {shots.map((shot) => {
        const Component = SHOTS[shot.id];
        return Component ? (
          <Sequence key={shot.id} from={at[shot.id] ?? 0} durationInFrames={beat(shot.beats)} name={shot.id}>
            <ShotStart.Provider value={at[shot.id] ?? 0}>
              <Component />
            </ShotStart.Provider>
          </Sequence>
        ) : null;
      })}
    </Shell>
  );
}
