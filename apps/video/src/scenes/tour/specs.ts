import type { Chapter } from "../../features";
import { EVERYWHERE } from "./chapter-everywhere";
import { FORYOU } from "./chapter-foryou";
import { INTAKE } from "./chapter-intake";
import { KEYS } from "./chapter-keys";
import { LIBRARY } from "./chapter-library";
import { LISTENING } from "./chapter-listening";
import { LYRICS } from "./chapter-lyrics";
import { PLAYBACK } from "./chapter-playback";
import { POLISH } from "./chapter-polish";
import { QUEUE } from "./chapter-queue";
import { SEARCH } from "./chapter-search";
import { YOURS } from "./chapter-yours";
import type { ChapterSpec } from "./spec";

export const SPECS: Record<Chapter, ChapterSpec> = {
  lyrics: LYRICS,
  search: SEARCH,
  playback: PLAYBACK,
  queue: QUEUE,
  foryou: FORYOU,
  intake: INTAKE,
  listening: LISTENING,
  library: LIBRARY,
  everywhere: EVERYWHERE,
  keys: KEYS,
  polish: POLISH,
  yours: YOURS,
};
