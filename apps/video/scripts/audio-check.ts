import { mkdirSync } from "node:fs";
import { BEDS } from "../../../scripts/audio/bed";
import { highpass, lowpass, RATE, type Stereo } from "../../../scripts/audio/dsp";
import { measureLoudness } from "../../../scripts/audio/loudness";
import { AUDIO_CUES, FILM_BEATS, FILM_FRAMES, type Film, SECTIONS } from "../src/audio-cues";
import { BPM, gridBeat as beat, FPS } from "../src/design/beat";

const TARGET_LUFS = -14;
const TRUE_PEAK_CEILING = -1.5;
const MAX_LRA = 12;
const BANDS: readonly [number, number][] = [
  [0, 60],
  [60, 120],
  [120, 300],
  [300, 800],
  [800, 2000],
  [2000, 5000],
  [5000, 10000],
  [10000, 24000],
];
const REFERENCE_DB = [3, 0, 2, 0, -4, -8, -13, -20];
const BAND_TOLERANCE_DB = 10;
const LOW_SHARE_HZ = 150;
const MAX_LOW_SHARE = 0.65;
const MAX_HIGHPASS_GAP_LU = 4;
const FLAT_LU = 2;
const FLAT_SECONDS = 10;
const DENSE = new Set(["drop", "wide app", "queue", "mixes", "session", "lyrics", "strip"]);
const FRAME_SECONDS = 1 / FPS;
const TAIL_FRAMES = 24;
const OUT = "out/audio-qa";

const db = (x: number): number => 20 * Math.log10(Math.max(x, 1e-9));
const secondsOf = (frames: number): number => frames / FPS;

async function decode(file: string): Promise<Stereo> {
  const run = Bun.spawn(["ffmpeg", "-v", "error", "-i", file, "-vn", "-ac", "2", "-ar", String(RATE), "-f", "f32le", "-"], {
    stdout: "pipe",
  });
  const raw = new Float32Array(await new Response(run.stdout).arrayBuffer());
  const frames = raw.length / 2;
  const audio = { l: new Float32Array(frames), r: new Float32Array(frames) };
  for (let i = 0; i < frames; i += 1) {
    audio.l[i] = raw[2 * i] ?? 0;
    audio.r[i] = raw[2 * i + 1] ?? 0;
  }
  return audio;
}

function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j] ?? 0, re[i] ?? 0];
      [im[i], im[j]] = [im[j] ?? 0, im[i] ?? 0];
    }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const angle = (-2 * Math.PI) / size;
    for (let start = 0; start < n; start += size) {
      for (let k = 0; k < size / 2; k += 1) {
        const wr = Math.cos(angle * k);
        const wi = Math.sin(angle * k);
        const a = start + k;
        const b = a + size / 2;
        const tr = (re[b] ?? 0) * wr - (im[b] ?? 0) * wi;
        const ti = (re[b] ?? 0) * wi + (im[b] ?? 0) * wr;
        re[b] = (re[a] ?? 0) - tr;
        im[b] = (im[a] ?? 0) - ti;
        re[a] = (re[a] ?? 0) + tr;
        im[a] = (im[a] ?? 0) + ti;
      }
    }
  }
}

function bandPowers(mono: Float32Array, from: number, to: number): { bands: number[]; lowShare: number } {
  const size = 4096;
  const window = Float64Array.from({ length: size }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size));
  const power = new Float64Array(size / 2);
  for (let start = from; start + size <= to; start += size / 2) {
    const re = Float64Array.from({ length: size }, (_, i) => (mono[start + i] ?? 0) * (window[i] ?? 0));
    const im = new Float64Array(size);
    fft(re, im);
    for (let k = 0; k < size / 2; k += 1) power[k] = (power[k] ?? 0) + (re[k] ?? 0) ** 2 + (im[k] ?? 0) ** 2;
  }
  const bands = BANDS.map(() => 0);
  let total = 0;
  let low = 0;
  for (let k = 1; k < size / 2; k += 1) {
    const hz = (k * RATE) / size;
    const index = BANDS.findLastIndex(([lo]) => hz >= lo);
    bands[Math.max(0, index)] = (bands[Math.max(0, index)] ?? 0) + (power[k] ?? 0);
    total += power[k] ?? 0;
    if (hz < LOW_SHARE_HZ) low += power[k] ?? 0;
  }
  return { bands, lowShare: low / Math.max(total, 1e-18) };
}

function stats(audio: Stereo, from: number, to: number): { rms: number; peak: number } {
  let sum = 0;
  let peak = 0;
  for (let i = from; i < to; i += 1) {
    const l = audio.l[i] ?? 0;
    const r = audio.r[i] ?? 0;
    sum += (l * l + r * r) / 2;
    peak = Math.max(peak, Math.abs(l), Math.abs(r));
  }
  return { rms: db(Math.sqrt(sum / Math.max(1, to - from))), peak: db(peak) };
}

function envelope(signal: Float32Array, window: number): Float32Array {
  const out = new Float32Array(signal.length);
  let sum = 0;
  for (let i = 0; i < signal.length; i += 1) {
    sum += (signal[i] ?? 0) ** 2;
    if (i >= window) sum -= (signal[i - window] ?? 0) ** 2;
    out[i] = Math.sqrt(Math.max(0, sum) / window);
  }
  return out;
}

type Group = "low" | "mid" | "high" | "wide";

const TRANSIENT_KINDS = new Set(["kick", "hit", "impact", "key", "tick", "ping"]);
const MIN_AUDIBLE_DB: Record<string, number> = { tick: 0, key: 3, ping: 3, hit: 0, whoosh: 3, riser: 0, swell: -4, impact: 3 };

const groupOf = (kind: string): Group =>
  kind === "kick" || kind === "hit" || kind === "impact"
    ? "low"
    : kind === "ping"
      ? "mid"
      : kind === "key" || kind === "tick"
        ? "high"
        : "wide";

class Source {
  private readonly mono: Float32Array;
  private readonly bands = new Map<Group, Float32Array>();
  private readonly envs = new Map<Group, Float32Array>();

  constructor(audio: Stereo) {
    this.mono = Float32Array.from(audio.l, (l, i) => (l + (audio.r[i] ?? 0)) / 2);
  }

  band(group: Group): Float32Array {
    const cached = this.bands.get(group);
    if (cached) return cached;
    const made =
      group === "low"
        ? lowpass(this.mono, 300)
        : group === "mid"
          ? lowpass(highpass(this.mono, 1200), 8000)
          : highpass(this.mono, group === "high" ? 2000 : 400);
    this.bands.set(group, made);
    return made;
  }

  env(group: Group): Float32Array {
    const cached = this.envs.get(group);
    if (cached) return cached;
    const made = envelope(this.band(group), group === "low" ? 192 : 24);
    this.envs.set(group, made);
    return made;
  }

  energy(group: Group, from: number, to: number): number {
    const band = this.band(group);
    let sum = 0;
    const start = Math.max(0, Math.round(from));
    const stop = Math.min(band.length, Math.round(to));
    for (let i = start; i < stop; i += 1) sum += (band[i] ?? 0) ** 2;
    return sum / Math.max(1, stop - start);
  }
}

function onsetDelta(env: Float32Array, sample: number): number | undefined {
  const ms = RATE / 1000;
  const maxIn = (from: number, to: number): number => {
    let top = 0;
    for (let s = Math.max(0, sample + Math.round(from * ms)); s < Math.min(env.length, sample + Math.round(to * ms)); s += 1)
      top = Math.max(top, env[s] ?? 0);
    return top;
  };
  const base = maxIn(-35, -8);
  const peak = maxIn(0, 50);
  if (peak < 1.25 * base) return undefined;
  const threshold = base + 0.3 * (peak - base);
  const start = Math.max(0, sample - Math.round(20 * ms));
  for (let s = start; s < sample + Math.round(30 * ms); s += 1) if ((env[s] ?? 0) >= threshold) return (s - sample) / RATE / FRAME_SECONDS;
  return undefined;
}

interface Stems {
  music: Source;
  sfx: Source;
  isolated: boolean;
}

function reportCues(stems: Stems, film: Film, maxFrame: number): number {
  const failures: string[] = [];
  const quiet = new Map<string, number[]>();
  let checked = 0;
  let worst = 0;
  for (const cue of AUDIO_CUES.filter((c) => c.film === film && c.frame + Math.max(c.length ?? 0, FPS / 2) + TAIL_FRAMES <= maxFrame)) {
    const sample = Math.round(secondsOf(cue.frame) * RATE);
    const group = groupOf(cue.kind);
    const source = cue.kind === "kick" ? stems.music : stems.sfx;
    const span = Math.max(1, cue.length ?? 30) * (RATE / FPS);
    if (TRANSIENT_KINDS.has(cue.kind)) {
      const delta = onsetDelta(source.env(group), sample);
      checked += 1;
      if (delta === undefined || Math.abs(delta) > 1)
        failures.push(`${cue.id} (${cue.label}): ${delta === undefined ? "no onset found" : `${delta.toFixed(2)} frames off`}`);
      else worst = Math.max(worst, Math.abs(delta));
    } else if (
      cue.kind === "riser" &&
      source.energy("high", sample + span * 0.7, sample + span) <= source.energy("high", sample, sample + span * 0.3) * 2
    ) {
      failures.push(`${cue.id} (${cue.label}): the riser does not rise`);
    }
    if (stems.isolated && cue.kind !== "kick") {
      const window: Record<string, [number, number]> = { riser: [0.8, 1], whoosh: [0.3, 0.7], swell: [0.3, 0.7] };
      const [lo, hi] = window[cue.kind] ?? [0, Math.min(1, (0.08 * RATE) / span)];
      const [from, to] = [sample + span * lo, sample + span * hi];
      const heard: Group = cue.kind === "hit" || cue.kind === "impact" ? "wide" : group;
      const ratio = 10 * Math.log10((stems.sfx.energy(heard, from, to) + 1e-14) / (stems.music.energy(heard, from, to) + 1e-14));
      quiet.set(cue.kind, [...(quiet.get(cue.kind) ?? []), ratio]);
      const minimum = MIN_AUDIBLE_DB[cue.kind] ?? 0;
      if (ratio < minimum) failures.push(`${cue.id} (${cue.label}): ${ratio.toFixed(1)} dB against the bed, needs ${minimum}`);
    }
  }
  for (const failure of failures) console.error(`  FAIL ${failure}`);
  console.log(`${film} cues: ${checked} transients within 1 frame (worst ${worst.toFixed(2)}), ${failures.length} problems`);
  for (const [kind, ratios] of quiet)
    console.log(
      `  ${kind.padEnd(7)} against the bed: min ${Math.min(...ratios).toFixed(1)} dB, median ${[...ratios].sort((a, b) => a - b)[Math.floor(ratios.length / 2)]?.toFixed(1)} dB (${ratios.length})`,
    );
  return failures.length;
}

export async function onsets(file: string, film: Film): Promise<number> {
  const audio = await decode(file);
  const source = new Source(audio);
  return reportCues({ music: source, sfx: source, isolated: false }, film, Math.round(audio.l.length / (RATE / FPS)));
}

function renderPictures(file: string, film: Film): void {
  mkdirSync(OUT, { recursive: true });
  const wave = `${OUT}/${film}-wave.png`;
  const spectrum = `${OUT}/${film}-spectrum.png`;
  Bun.spawnSync([
    "ffmpeg",
    "-y",
    "-v",
    "error",
    "-i",
    file,
    "-filter_complex",
    "showwavespic=s=1800x400:split_channels=1:colors=black|slategray",
    "-frames:v",
    "1",
    wave,
  ]);
  Bun.spawnSync([
    "ffmpeg",
    "-y",
    "-v",
    "error",
    "-i",
    file,
    "-lavfi",
    "showspectrumpic=s=1800x700:scale=log:fscale=log:legend=0:gain=1:drange=90",
    "-frames:v",
    "1",
    spectrum,
  ]);
  console.log(`  pictures: ${wave} ${spectrum}`);
}

function correlation(a: Float32Array, b: Float32Array, from: number, to: number): number {
  let ab = 0;
  let aa = 0;
  let bb = 0;
  for (let i = from; i < to; i += 1) {
    ab += (a[i] ?? 0) * (b[i] ?? 0);
    aa += (a[i] ?? 0) ** 2;
    bb += (b[i] ?? 0) ** 2;
  }
  return ab / Math.max(Math.sqrt(aa * bb), 1e-18);
}

function clicks(audio: Stereo, film: Film): string[] {
  const exempt = AUDIO_CUES.filter((c) => c.film === film).map((c): [number, number] => [
    c.frame * (RATE / FPS),
    c.kind === "key" ? 0.09 : 0.012,
  ]);
  const near = (n: number): boolean => exempt.some(([at, tail]) => n >= at - 0.002 * RATE && n <= at + tail * RATE);
  const found: number[] = [];
  const radius = 240;
  for (const channel of [audio.l, audio.r]) {
    const d2 = Float32Array.from(channel, (x, n) => (channel[n + 1] ?? 0) - 2 * x + (channel[n - 1] ?? 0));
    const prefix = new Float64Array(d2.length + 1);
    for (let n = 0; n < d2.length; n += 1) prefix[n + 1] = (prefix[n] ?? 0) + Math.abs(d2[n] ?? 0);
    for (let n = radius; n < d2.length - radius; n += 1) {
      const step = Math.abs(d2[n] ?? 0);
      if (step < 0.03) continue;
      const around = (prefix[n + radius] ?? 0) - (prefix[n - radius] ?? 0) - ((prefix[n + 16] ?? 0) - (prefix[n - 16] ?? 0));
      const local = around / (2 * radius - 32);
      if (step <= 12 * local || near(n) || (found.at(-1) !== undefined && n - (found.at(-1) as number) <= 0.005 * RATE)) continue;
      let neighbour = 0;
      for (let k = n - 960; k < n + 960; k += 1) if (Math.abs(k - n) > 24) neighbour = Math.max(neighbour, Math.abs(d2[k] ?? 0));
      if (step > 2 * neighbour) found.push(n);
    }
  }
  return found.sort((a, b) => a - b).map((n) => `${(n / RATE).toFixed(3)}s`);
}

async function auditFilm(film: Film): Promise<number> {
  const file = `public/audio/${film}.wav`;
  const audio = await decode(file);
  let failures = 0;
  const fail = (message: string): void => {
    failures += 1;
    console.error(`  FAIL ${message}`);
  };
  const expected = FILM_FRAMES[film] * (RATE / FPS);
  console.log(`\n${film}: ${(audio.l.length / RATE).toFixed(3)} s, ${audio.l.length} samples`);
  if (audio.l.length !== expected) fail(`length ${audio.l.length} != ${expected}`);

  const loud = await measureLoudness(file);
  console.log(`  integrated ${loud.lufs.toFixed(2)} LUFS, true peak ${loud.peak.toFixed(2)} dBTP, LRA ${loud.lra.toFixed(1)} LU`);
  if (Math.abs(loud.lufs - TARGET_LUFS) > 0.3) fail(`integrated loudness ${loud.lufs} is not ${TARGET_LUFS} +-0.3`);
  if (loud.peak > TRUE_PEAK_CEILING) fail(`true peak ${loud.peak} above ${TRUE_PEAK_CEILING}`);
  if (loud.lra > MAX_LRA) fail(`loudness range ${loud.lra} above ${MAX_LRA}`);

  const whole = stats(audio, 0, audio.l.length);
  const dc = [audio.l, audio.r].map((c) => c.reduce((sum, x) => sum + x, 0) / c.length);
  const clipped = [audio.l, audio.r].reduce((sum, c) => sum + c.filter((x) => Math.abs(x) >= 0.9999).length, 0);
  console.log(
    `  sample peak ${whole.peak.toFixed(2)} dBFS, rms ${whole.rms.toFixed(2)} dBFS, dc ${dc.map((x) => x.toExponential(1)).join(" / ")}, clipped samples ${clipped}`,
  );
  if (clipped > 0) fail("clipped samples");
  if (dc.some((x) => Math.abs(x) > 0.002)) fail("dc offset");

  const share = bandPowers(
    Float32Array.from(audio.l, (l, i) => (l + (audio.r[i] ?? 0)) / 2),
    0,
    audio.l.length,
  ).lowShare;
  const highpassed = await measureLoudness(file, undefined, undefined, "highpass=f=150:poles=2,highpass=f=150:poles=2,");
  console.log(
    `  energy below ${LOW_SHARE_HZ} Hz ${(share * 100).toFixed(0)}%, loudness through a 150 Hz high-pass ${highpassed.lufs.toFixed(1)} LUFS (${(loud.lufs - highpassed.lufs).toFixed(1)} LU under full range)`,
  );
  if (share > MAX_LOW_SHARE) fail(`${(share * 100).toFixed(0)}% of the energy is below ${LOW_SHARE_HZ} Hz, limit ${MAX_LOW_SHARE * 100}%`);
  if (loud.lufs - highpassed.lufs > MAX_HIGHPASS_GAP_LU)
    fail(`small speakers hear it ${(loud.lufs - highpassed.lufs).toFixed(1)} LU quieter, limit ${MAX_HIGHPASS_GAP_LU}`);

  for (const [from, to] of BEDS[film].gates) {
    const [first, last] = [Math.round(((from * 60) / BPM) * RATE) + 200, Math.round(((to * 60) / BPM) * RATE) - 1];
    let loudest = 0;
    for (let i = first; i < last; i += 1) loudest = Math.max(loudest, Math.abs(audio.l[i] ?? 0), Math.abs(audio.r[i] ?? 0));
    console.log(
      `  silence gate ${((from * 60) / BPM).toFixed(2)} to ${((to * 60) / BPM).toFixed(2)} s: loudest sample ${loudest.toExponential(1)} (16 bit dither is about 3e-5)`,
    );
    if (loudest > 1e-4) fail(`something rings through the silence gate (${loudest.toExponential(1)})`);
  }

  const found = clicks(audio, film);
  console.log(
    `  click candidates (second difference against local level, away from cues): ${found.length}${found.length ? ` at ${found.slice(0, 6).join(" ")}` : ""}`,
  );
  if (found.length > 0) fail(`${found.length} click candidates`);

  const mid = Float32Array.from(audio.l, (l, i) => (l + (audio.r[i] ?? 0)) / 2);
  const side = Float32Array.from(audio.l, (l, i) => (l - (audio.r[i] ?? 0)) / 2);
  const lowMid = bandPowers(mid, 0, mid.length)
    .bands.slice(0, 2)
    .reduce((a, b) => a + b, 0);
  const lowSide = bandPowers(side, 0, side.length)
    .bands.slice(0, 2)
    .reduce((a, b) => a + b, 0);
  const monoLoss = db(Math.sqrt(mid.reduce((sum, x) => sum + x * x, 0) / mid.length)) - whole.rms;
  console.log(
    `  low end (20-120 Hz) side vs mid ${(10 * Math.log10(lowSide / lowMid)).toFixed(1)} dB, mono fold-down ${monoLoss.toFixed(2)} dB`,
  );
  if (10 * Math.log10(lowSide / lowMid) > -30) fail("low end is not mono");
  if (monoLoss < -3) fail("mono fold-down loses more than 3 dB");

  const [highL, highR] = [highpass(audio.l, 300), highpass(audio.r, 300)];
  console.log("  section            lufs   rms   peak  corr>300 | spectrum dev vs reference (dB, 8 bands 0..24 kHz)");
  const lufs: Record<string, number> = {};
  for (const section of SECTIONS[film]) {
    const from = Math.round(secondsOf(beat(section.from)) * RATE);
    const to = Math.round(secondsOf(beat(section.to)) * RATE);
    const level = stats(audio, from, to);
    const l = (await measureLoudness(file, secondsOf(beat(section.from)), secondsOf(beat(section.to)))).lufs;
    lufs[section.id] = l;
    const { bands: power } = bandPowers(mid, from, to);
    const reference = power[3] ?? 1;
    const devs = power.map((p, i) => 10 * Math.log10(Math.max(p, 1e-18) / Math.max(reference, 1e-18)) - (REFERENCE_DB[i] ?? 0));
    const worst = Math.max(...devs.map(Math.abs));
    const dense = DENSE.has(section.id);
    const audible = level.rms > -45;
    const tooFar = devs.some((d) => d > BAND_TOLERANCE_DB || (dense && d < -BAND_TOLERANCE_DB));
    console.log(
      `  ${section.id.padEnd(16)} ${l.toFixed(1).padStart(6)} ${level.rms.toFixed(1).padStart(6)} ${level.peak.toFixed(1).padStart(6)} ${correlation(highL, highR, from, to).toFixed(2).padStart(8)} | ${devs.map((d) => d.toFixed(0).padStart(4)).join("")}${audible && tooFar ? "  FAIL" : ""}`,
    );
    if (audible && tooFar) fail(`${section.id} spectrum is ${worst.toFixed(0)} dB off the reference in one band`);
  }

  const arc = (loud_: number | undefined, quiet: number | undefined, label: string, lu: number): void => {
    if (loud_ === undefined || quiet === undefined || loud_ - quiet < lu) fail(`dynamics: ${label} is not ${lu} LU quieter`);
  };
  if (film === "hero") {
    arc(lufs.session, lufs.intro, "the intro against the session", 5);
    arc(lufs.session, lufs.terminal, "the terminal against the session", 5);
    arc(
      lufs.session,
      Math.max(lufs.drop ?? -99, lufs["wide app"] ?? -99, lufs.queue ?? -99, lufs.mixes ?? -99),
      "the loudest other section against the session",
      2.5,
    );
  } else arc(lufs.lyrics, lufs.hook, "the hook against the lyrics drop", 5);
  const bars = [];
  for (let bar = 0; bar < FILM_BEATS[film] / 4; bar += 1) {
    const value = (await measureLoudness(file, bar * 2, bar * 2 + 2)).lufs;
    bars.push(Number.isFinite(value) ? value : -70);
  }
  console.log(`  loudness per bar (2 s, LUFS): ${bars.map((v) => v.toFixed(1)).join(" ")}`);
  for (let from = 0; from < bars.length; from += 1) {
    let to = from;
    let [lowest, highest] = [bars[from] as number, bars[from] as number];
    while (to + 1 < bars.length && Math.max(highest, bars[to + 1] as number) - Math.min(lowest, bars[to + 1] as number) <= FLAT_LU) {
      to += 1;
      lowest = Math.min(lowest, bars[to] as number);
      highest = Math.max(highest, bars[to] as number);
    }
    if ((to - from + 1) * 2 > FLAT_SECONDS) {
      fail(`bars ${from + 1} to ${to + 1} stay within ${FLAT_LU} LU for ${(to - from + 1) * 2} s`);
      break;
    }
  }

  failures += reportCues(
    {
      music: new Source(await decode(`public/audio/stems/${film}-music.wav`)),
      sfx: new Source(await decode(`public/audio/stems/${film}-sfx.wav`)),
      isolated: true,
    },
    film,
    FILM_FRAMES[film],
  );
  renderPictures(file, film);
  return failures;
}

export async function audio(films: Film[]): Promise<number> {
  let failures = 0;
  for (const film of films) failures += await auditFilm(film);
  console.log(failures === 0 ? "\naudio checks ok" : `\n${failures} audio failures`);
  return failures;
}
