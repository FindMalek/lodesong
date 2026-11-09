import { type Tempo, tempoMap } from "./design/beat";
import { CHAPTERS, type Chapter, type ChapterInfo, FEATURE_ROWS, FINALE_BEATS, FINALE_BPM, type RawFeature } from "./features-data";

export type { Chapter, ChapterInfo, RawFeature, Wow } from "./features-data";
export { CHAPTERS } from "./features-data";

/** Frames of a feature on the tour's clock: hosts own a slice of the chapter, ribbon chips ride on their host. */
export interface Feature extends RawFeature {
  tour: readonly [from: number, to: number];
}

export const STINGER_BEATS = 2;
export const HOST_BEATS = { A: 2, B: 1.5 } as const;
export const CHIP_STEP = 6;
export const MIN_FRAMES = 30;
export const MAX_CHIPS = { A: 3, B: 1 } as const;

const isHost = (row: RawFeature): boolean => row.wow !== "C";

const rowsOf = (chapter: Chapter): RawFeature[] => FEATURE_ROWS.filter((row) => row.chapter === chapter);

const hostBeats = (row: RawFeature): number => (row.wow === "A" ? HOST_BEATS.A : HOST_BEATS.B);

export const chapterBeats = (chapter: Chapter): number =>
  STINGER_BEATS + rowsOf(chapter).filter(isHost).reduce((sum, row) => sum + hostBeats(row), 0);

/** One tempo segment per chapter, then the finale. */
export const TOUR_TEMPO: readonly Tempo[] = [
  ...CHAPTERS.map((chapter) => ({ beats: chapterBeats(chapter.id), bpm: chapter.bpm })),
  { beats: FINALE_BEATS, bpm: FINALE_BPM },
];

export const TOUR_MAP = tempoMap(TOUR_TEMPO);

const startBeatOf = (chapter: Chapter): number => {
  const at = CHAPTERS.findIndex((one) => one.id === chapter);
  return TOUR_TEMPO.slice(0, at).reduce((sum, segment) => sum + segment.beats, 0);
};

/** First and last frame (exclusive) of a chapter on the tour clock. */
export function chapterRange(chapter: Chapter): readonly [number, number] {
  const from = startBeatOf(chapter);
  return [TOUR_MAP.beat(from), TOUR_MAP.beat(from + chapterBeats(chapter))];
}

export const FINALE_RANGE: readonly [number, number] = [
  TOUR_MAP.beat(TOUR_TEMPO.slice(0, -1).reduce((sum, segment) => sum + segment.beats, 0)),
  TOUR_MAP.totalFrames,
];

function derive(): Feature[] {
  const tour = new Map<string, readonly [number, number]>();
  for (const { id } of CHAPTERS) {
    const rows = rowsOf(id);
    const start = startBeatOf(id);
    let local = STINGER_BEATS;
    for (const host of rows.filter(isHost)) {
      const from = TOUR_MAP.beat(start + local);
      local += hostBeats(host);
      const to = TOUR_MAP.beat(start + local);
      tour.set(host.id, [from, to]);
      rows
        .filter((row) => row.rideOn === host.id)
        .forEach((chip, k) => {
          tour.set(chip.id, [from + CHIP_STEP * (k + 1), to]);
        });
    }
  }
  return FEATURE_ROWS.map((row) => ({ ...row, tour: tour.get(row.id) ?? [0, 0] }));
}

export const FEATURES: readonly Feature[] = derive();

export const featureOf = (id: string): Feature => {
  const found = FEATURES.find((feature) => feature.id === id);
  if (!found) throw new Error(`no feature ${id}`);
  return found;
};

export const hostsOf = (chapter: Chapter): Feature[] => FEATURES.filter((feature) => feature.chapter === chapter && isHost(feature));

export const chipsOf = (hostId: string): Feature[] => FEATURES.filter((feature) => feature.rideOn === hostId);

/** One sound per feature, on its first frame: the score reads this list. */
export interface TourCue {
  id: string;
  frame: number;
  label: string;
}

export const TOUR_CUES: readonly TourCue[] = FEATURES.map((feature) => ({
  id: `feature:${feature.id}`,
  frame: feature.tour[0],
  label: feature.label,
}));
