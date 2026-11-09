import { createContext, useContext } from "react";
import { useCurrentFrame } from "remotion";
import { shotOf } from "../scenes/timelines";
import { FPS } from "./beat";

/** The searched line, "i keep the lights on", starts here; the song is played from it on the first frame of S3. */
const LINE_SECONDS = 74;
const PLAY_FROM = shotOf("play-line").start;

export const ShotStart = createContext(0);

/** One playhead for the whole film: every shot that shows the playing song reads the same clock, so 1:14 never turns into 1:42 across a cut. Before S3 it counts down to the line. */
export function useSongSeconds(): number {
  const start = useContext(ShotStart);
  return LINE_SECONDS + (start + useCurrentFrame() - PLAY_FROM) / FPS;
}
