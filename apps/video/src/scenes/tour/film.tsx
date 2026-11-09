import type { ComponentType } from "react";
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import { Grain } from "../../design/grain";
import { ease, ramp } from "../../design/motion";
import { Shell } from "../../design/shell";
import { CHAPTERS, type Chapter, hostsOf } from "../../features";
import type { TourId } from "../timelines";
import { TOUR } from "../timelines";
import { EVERYWHERE, EverywhereChapter } from "./chapter-everywhere";
import { FORYOU, ForyouChapter } from "./chapter-foryou";
import { INTAKE, IntakeChapter } from "./chapter-intake";
import { KEYS, KeysChapter } from "./chapter-keys";
import { LIBRARY, LibraryChapter } from "./chapter-library";
import { LISTENING, ListeningChapter } from "./chapter-listening";
import { LYRICS, LyricsChapter } from "./chapter-lyrics";
import { PLAYBACK, PlaybackChapter } from "./chapter-playback";
import { POLISH, PolishChapter } from "./chapter-polish";
import { QUEUE, QueueChapter } from "./chapter-queue";
import { SEARCH, SearchChapter } from "./chapter-search";
import { YOURS, YoursChapter } from "./chapter-yours";
import type { ChapterProps } from "./engine";
import { FinaleScene } from "./finale";
import { FeatureProbe } from "./probe";
import type { ChapterSpec } from "./spec";

const VIEWS: Record<Chapter, { spec: ChapterSpec; View: ComponentType<ChapterProps> }> = {
  lyrics: { spec: LYRICS, View: LyricsChapter },
  search: { spec: SEARCH, View: SearchChapter },
  playback: { spec: PLAYBACK, View: PlaybackChapter },
  queue: { spec: QUEUE, View: QueueChapter },
  foryou: { spec: FORYOU, View: ForyouChapter },
  intake: { spec: INTAKE, View: IntakeChapter },
  listening: { spec: LISTENING, View: ListeningChapter },
  library: { spec: LIBRARY, View: LibraryChapter },
  everywhere: { spec: EVERYWHERE, View: EverywhereChapter },
  keys: { spec: KEYS, View: KeysChapter },
  polish: { spec: POLISH, View: PolishChapter },
  yours: { spec: YOURS, View: YoursChapter },
};

function sceneOf(chapter: Chapter): ComponentType {
  const before = CHAPTERS[CHAPTERS.findIndex((one) => one.id === chapter) - 1]?.id;
  const last = before ? hostsOf(before).at(-1) : undefined;
  const previous = before && last ? VIEWS[before].spec.hosts[last.id] : undefined;
  const { View } = VIEWS[chapter];
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
