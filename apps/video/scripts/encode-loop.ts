// the readme loop: the 60 fps half-size render, re-encoded to 300 frames at 30 fps, no audio, faststart
export {};

const run = Bun.spawn(
  [
    "ffmpeg",
    "-y",
    "-v",
    "error",
    "-i",
    "out/loop-60.mp4",
    "-r",
    "30",
    "-frames:v",
    "300",
    "-c:v",
    "libx264",
    "-crf",
    "22",
    "-pix_fmt",
    "yuv420p",
    "-an",
    "-movflags",
    "+faststart",
    "out/loop-readme.mp4",
  ],
  { stdout: "inherit", stderr: "inherit" },
);
process.exit(await run.exited);
