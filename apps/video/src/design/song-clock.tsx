import { createContext, useContext } from "react";
import { useCurrentFrame } from "remotion";
import { shotOf } from "../scenes/timelines";
import { FPS } from "./beat";

/** The searched line, "I keep the lights on for you", is played from here on the first frame of S3: 0:50 is what the real play-from-line plate shows on North Morning (5:51). */
const LINE_SECONDS = 50;
const PLAY_FROM = shotOf("play-line").start;

export const ShotStart = createContext(0);

/** One playhead for the whole film: every shot that shows the playing song reads the same clock, so 0:50 never turns into 1:20 across a cut. Before S3 it counts down to the line. */
export function useSongSeconds(): number {
  const start = useContext(ShotStart);
  return LINE_SECONDS + (start + useCurrentFrame() - PLAY_FROM) / FPS;
}
