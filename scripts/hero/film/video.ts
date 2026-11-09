import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import type { Ctx } from "./types";

/**
 * Steps something one unit at a time with a settled screenshot each, then encodes the stills as all-intra H.264 (every
 * frame a keyframe, so Remotion can seek anywhere). The stills are thrown away; the manifest gets the video.
 */
export async function recordVideo(c: Ctx, name: string, frames: number, step: (index: number) => Promise<void>): Promise<void> {
  const temp = `${c.dir}/.${name}-frames`;
  mkdirSync(temp, { recursive: true });
  for (let index = 0; index < frames; index += 1) {
    await step(index);
    writeFileSync(`${temp}/${String(index).padStart(4, "0")}.png`, await c.grab());
  }
  const file = `${c.dir}/${name}.mp4`;
  const run = Bun.spawnSync([
    "ffmpeg",
    "-y",
    "-loglevel",
    "error",
    "-framerate",
    String(c.take.fps),
    "-i",
    `${temp}/%04d.png`,
    "-c:v",
    "libx264",
    "-crf",
    "12",
    "-g",
    "1",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    file,
  ]);
  rmSync(temp, { recursive: true, force: true });
  if (run.exitCode !== 0) throw new Error(run.stderr.toString());
  c.take.video = { file: `${c.take.id}/${name}.mp4`, frames, fps: c.take.fps };
}
