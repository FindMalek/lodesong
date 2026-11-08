import { mkdirSync } from "node:fs";

// bun scripts/docs-stills.ts: the small jpgs under docs-stills/, cut from the final renders in out/
const SHOTS: readonly [file: string, seconds: number, name: string, width: number][] = [
  ["out/hero-16x9.mp4", 2.4, "hero-01-line", 960],
  ["out/hero-16x9.mp4", 5.5, "hero-02-lyrics-gold", 960],
  ["out/hero-16x9.mp4", 7.4, "hero-03-app", 960],
  ["out/hero-16x9.mp4", 9.7, "hero-04-palette", 960],
  ["out/hero-16x9.mp4", 12.5, "hero-05-keyboard", 960],
  ["out/hero-16x9.mp4", 17.0, "hero-06-mixes", 960],
  ["out/hero-16x9.mp4", 21.5, "hero-07-session", 960],
  ["out/hero-16x9.mp4", 26.5, "hero-08-terminal", 960],
  ["out/hero-16x9.mp4", 29.6, "hero-09-end", 960],
  ["out/cutdown-9x16.mp4", 2.0, "cutdown-01-line", 480],
  ["out/cutdown-9x16.mp4", 6.0, "cutdown-02-lyrics", 480],
  ["out/cutdown-9x16.mp4", 11.0, "cutdown-03-session", 480],
  ["out/cutdown-9x16.mp4", 14.5, "cutdown-04-end", 480],
  ["out/loop-readme.mp4", 4.0, "loop-01", 640],
];

mkdirSync("docs-stills", { recursive: true });
let failed = 0;
for (const [file, seconds, name, width] of SHOTS) {
  const run = Bun.spawn(
    [
      "ffmpeg",
      "-y",
      "-v",
      "error",
      "-ss",
      String(seconds),
      "-i",
      file,
      "-frames:v",
      "1",
      "-vf",
      `scale=${width}:-1`,
      "-q:v",
      "4",
      `docs-stills/${name}.jpg`,
    ],
    { stdout: "inherit", stderr: "inherit" },
  );
  failed += (await run.exited) === 0 ? 0 : 1;
}
process.exit(failed === 0 ? 0 : 1);
