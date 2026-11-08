export interface Loudness {
  lufs: number;
  peak: number;
  lra: number;
}

const last = (text: string, pattern: RegExp): number => {
  const all = [...text.matchAll(pattern)];
  return Number(all.at(-1)?.[1] ?? Number.NaN);
};

export async function measureLoudness(file: string, from?: number, to?: number): Promise<Loudness> {
  const window = from === undefined || to === undefined ? [] : ["-ss", String(from), "-t", String(to - from)];
  const run = Bun.spawn(["ffmpeg", "-nostats", "-hide_banner", ...window, "-i", file, "-af", "ebur128=peak=true", "-f", "null", "-"], {
    stderr: "pipe",
    stdout: "ignore",
  });
  const text = await new Response(run.stderr).text();
  const summary = text.slice(text.lastIndexOf("Summary:"));
  return {
    lufs: last(summary, /\sI:\s+(-?[\d.]+) LUFS/g),
    lra: last(summary, /\sLRA:\s+([\d.]+) LU/g),
    peak: last(summary, /Peak:\s+(-?[\d.]+) dBFS/g),
  };
}
