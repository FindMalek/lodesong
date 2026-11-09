import { CUT_MAP, HERO_MAP, type TempoMap } from "../design/beat";
import { CHAPTERS, type Chapter, TOUR_MAP } from "../features";

export type ChapterId = "hook" | "listen" | "discover" | "everywhere" | "yours";

export const HERO_IDS = [
  "cold-open",
  "find-line",
  "play-line",
  "lyrics",
  "lyterion",
  "queue",
  "mixes",
  "mood",
  "session",
  "shells",
  "notch",
  "keys",
  "themes",
  "yours",
  "land",
] as const;
export type ShotId = (typeof HERO_IDS)[number];

export const CUT_IDS = ["hook", "find", "mixes", "session", "shells", "land"] as const;
export type CutId = (typeof CUT_IDS)[number];

export interface ShotPlan<Id extends string = string> {
  id: Id;
  number: number;
  label: string;
  chapter?: string | undefined;
  beats: number;
  bpm: number;
  startBeat: number;
  start: number;
  frames: number;
  beat: (localBeat: number) => number;
}

export interface Plan<Id extends string> {
  shots: readonly ShotPlan<Id>[];
  tempo: TempoMap;
  frames: number;
}

/** Builds a film from any shot list: ids and labels zipped with one tempo segment per shot, optionally grouped in chapters. */
export function planFilm<Id extends string>(
  ids: readonly Id[],
  labels: Record<Id, string>,
  tempo: TempoMap,
  chapters?: Record<Id, string>,
): Plan<Id> {
  let startBeat = 0;
  const shots = ids.map((id, i): ShotPlan<Id> => {
    const { beats, bpm } = tempo.table[i] ?? { beats: 0, bpm: 0 };
    const from = startBeat;
    startBeat += beats;
    const start = tempo.beat(from);
    return {
      id,
      number: i + 1,
      label: labels[id],
      chapter: chapters?.[id],
      beats,
      bpm,
      startBeat: from,
      start,
      frames: tempo.beat(from + beats) - start,
      beat: (localBeat) => tempo.beat(from + localBeat) - start,
    };
  });
  return { shots, tempo, frames: tempo.totalFrames };
}

const CHAPTER_OF: Record<ShotId, ChapterId> = {
  "cold-open": "hook",
  "find-line": "hook",
  "play-line": "listen",
  lyrics: "listen",
  lyterion: "listen",
  queue: "listen",
  mixes: "discover",
  mood: "discover",
  session: "everywhere",
  shells: "everywhere",
  notch: "everywhere",
  keys: "yours",
  themes: "yours",
  yours: "yours",
  land: "yours",
};

export const HERO = planFilm(
  HERO_IDS,
  {
    "cold-open": "cold open",
    "find-line": "find the line",
    "play-line": "play from the line",
    lyrics: "lyrics, full screen",
    lyterion: "lyrics for every song",
    queue: "queue, gapless",
    mixes: "mixes and radio",
    mood: "a sentence, a recap",
    session: "one session",
    shells: "everywhere",
    notch: "lives in your notch",
    keys: "keyboard storm",
    themes: "dark and light",
    yours: "yours",
    land: "land",
  },
  HERO_MAP,
  CHAPTER_OF,
);

export const CUTDOWN = planFilm(
  CUT_IDS,
  { hook: "the lyric hook", find: "search and ignite", mixes: "mixes", session: "handoff", shells: "everywhere", land: "front-on end" },
  CUT_MAP,
);

const TOUR_IDS = [...CHAPTERS.map((chapter) => chapter.id), "finale"] as const;
export type TourId = (typeof TOUR_IDS)[number];

export const TOUR: Plan<TourId> = planFilm(
  TOUR_IDS,
  { ...(Object.fromEntries(CHAPTERS.map((chapter) => [chapter.id, chapter.name])) as Record<Chapter, string>), finale: "land" },
  TOUR_MAP,
);

export function shotOf(id: ShotId): ShotPlan<ShotId> {
  const shot = HERO.shots.find((one) => one.id === id);
  if (!shot) throw new Error(`no hero shot ${id}`);
  return shot;
}

/** Film frame of a beat counted from the start of a shot: the one conversion scenes, cues and captures share. */
export const shotFrame = (id: ShotId, localBeat: number): number => shotOf(id).start + shotOf(id).beat(localBeat);

export interface ChapterSpan {
  id: string;
  start: number;
  frames: number;
  shots: readonly string[];
}

/** Consecutive shots that share a chapter, as film frame spans: the unit for per-chapter sections in the score. */
export function chapterSpans(film: Plan<string>): ChapterSpan[] {
  const spans: ChapterSpan[] = [];
  for (const shot of film.shots) {
    const id = shot.chapter ?? shot.id;
    const last = spans.at(-1);
    if (last && last.id === id) {
      last.frames = shot.start + shot.frames - last.start;
      last.shots = [...last.shots, shot.id];
    } else spans.push({ id, start: shot.start, frames: shot.frames, shots: [shot.id] });
  }
  return spans;
}
