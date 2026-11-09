import type { ComponentType } from "react";
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import { Grain } from "../../design/grain";
import { ease, ramp } from "../../design/motion";
import { Shell } from "../../design/shell";
import { CHAPTERS, type Chapter, hostsOf } from "../../features";
import type { TourId } from "../timelines";
import { TOUR } from "../timelines";
import { EverywhereChapter } from "./chapter-everywhere";
import { ForyouChapter } from "./chapter-foryou";
import { IntakeChapter } from "./chapter-intake";
import { KeysChapter } from "./chapter-keys";
import { LibraryChapter } from "./chapter-library";
import { ListeningChapter } from "./chapter-listening";
import { LyricsChapter } from "./chapter-lyrics";
import { PlaybackChapter } from "./chapter-playback";
import { PolishChapter } from "./chapter-polish";
import { QueueChapter } from "./chapter-queue";
import { SearchChapter } from "./chapter-search";
import { YoursChapter } from "./chapter-yours";
import type { ChapterProps } from "./engine";
import { FinaleScene } from "./finale";
import { FeatureProbe } from "./probe";
import { SPECS } from "./specs";

const VIEWS: Record<Chapter, ComponentType<ChapterProps>> = {
  lyrics: LyricsChapter,
  search: SearchChapter,
  playback: PlaybackChapter,
  queue: QueueChapter,
  foryou: ForyouChapter,
  intake: IntakeChapter,
  listening: ListeningChapter,
  library: LibraryChapter,
  everywhere: EverywhereChapter,
  keys: KeysChapter,
  polish: PolishChapter,
  yours: YoursChapter,
};

function sceneOf(chapter: Chapter): ComponentType {
  const before = CHAPTERS[CHAPTERS.findIndex((one) => one.id === chapter) - 1]?.id;
  const last = before ? hostsOf(before).at(-1) : undefined;
  const previous = before && last ? SPECS[before].hosts[last.id] : undefined;
  const View = VIEWS[chapter];
  return function Chapter() {
    return <View previous={previous} />;
  };
}

export const TOUR_SCENES: Record<TourId, ComponentType> = {
  ...(Object.fromEntries(CHAPTERS.map((chapter) => [chapter.id, sceneOf(chapter.id)])) as Record<Chapter, ComponentType>),
  finale: FinaleScene,
};

function Fade() {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  return <Grain opacity={0.07 * (1 - ramp(frame, durationInFrames - 110, 70, ease.inOut))} />;
}

export function TourFilm({ probe, audio }: { probe?: boolean; audio?: string }) {
  return (
    <Shell grain={false} probe={probe} audio={audio}>
      {TOUR.shots.map((shot) => {
        const Scene = TOUR_SCENES[shot.id];
        return (
          <Sequence key={shot.id} from={shot.start} durationInFrames={shot.frames} name={`${shot.number} ${shot.id}`}>
            <Scene />
          </Sequence>
        );
      })}
      <AbsoluteFill>
        <Fade />
      </AbsoluteFill>
      {probe ? <FeatureProbe /> : null}
    </Shell>
  );
}
