import { createContext, useContext } from "react";
import { useCurrentFrame } from "remotion";
import { FPS } from "./beat";

const SONG_OFFSET = 65;

export const ShotStart = createContext(0);

/** One playhead for the whole film: every shot that shows the playing song reads the same clock, so 1:11 never turns into 1:42 across a cut. */
export function useSongSeconds(): number {
  const start = useContext(ShotStart);
  return SONG_OFFSET + (start + useCurrentFrame()) / FPS;
}
