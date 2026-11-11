import { highpass, lowpass, RATE, type Stereo } from "../../../scripts/audio/dsp";
import { measureLoudness } from "../../../scripts/audio/loudness";
import { AUDIO_CUES, FILM_FRAMES, type Film, SCORES, SECTIONS } from "../src/audio-cues";
import { FPS } from "../src/audio-tempo";

const TARGET_LUFS = -14;
const TRUE_PEAK_CEILING = -1.5;
const MAX_LRA = 6;
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
const REFERENCE_DB = [4, 2, 2, 0, -2.5, -4.5, -7.5, -9];
const BAND_TOLERANCE_DB = 9;
const LOW_SHARE_HZ = 150;
const MAX_LOW_SHARE = 0.45;
const MAX_HIGHPASS_GAP_LU = 2.5;
/** a phone speaker: nothing under 200 Hz and the top rolled off */
const PHONE_FILTER = "highpass=f=200:poles=2,highpass=f=200:poles=2,lowpass=f=9000,";
const MAX_PHONE_GAP_LU = 3.5;
const MIN_RISER_RISE = 1.6;
const FLAT_LU = 1.5;
const FLAT_SECONDS = 14;
const FLAT_SECONDS_TOUR = 18;
const BAR_SECONDS = 2;
const TILT_MIN = -7;
const TILT_MAX = -0.5;
const MIN_CORRELATION = 0.2;
const MAX_CORRELATION = 0.93;
const MIN_SPREAD = 3;
const MAX_SPREAD = 6;
/** The anthem is arranged to breathe: a near-silent hook and breath against a loud montage. */
const WIDE_SPREAD = 9;
const DROP_LU = 1;
const DENSE_MOODS = new Set(["drop", "groove", "peak", "storm", "flash", "land", "lift"]);
const FRAME_SECONDS = 1 / FPS;
const TAIL_FRAMES = 24;

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
type StemName = "drums" | "bass" | "music" | "fx" | "ui" | "space";
const STEM_NAMES: readonly StemName[] = ["drums", "bass", "music", "fx", "ui", "space"];
/** Kick timing is read from the kicks alone (stems/<film>-kicks.wav): snares, toms and claps share the drums stem and their low end moves the threshold crossing by up to 12 ms, which is the measurement and not the score. */
type Stems = Record<StemName, Source> & { kicks: Source };

const TRANSIENT_KINDS = new Set([
  "kick",
  "snare",
  "impact",
  "key",
  "type",
  "click",
  "enter",
  "row",
  "tile",
  "chip",
  "line",
  "device",
  "ignite",
  "seek",
  "draw",
  "flash",
]);
const SOUNDING_STEM: Record<string, StemName> = {
  kick: "drums",
  snare: "drums",
  impact: "fx",
  riser: "fx",
  whoosh: "fx",
  reverse: "fx",
  down: "fx",
};
const BAND_OF: Record<string, Group> = {
  kick: "low",
  impact: "low",
  snare: "mid",
  line: "mid",
  chip: "mid",
  tile: "mid",
  device: "mid",
  ignite: "mid",
  enter: "mid",
  riser: "wide",
  whoosh: "wide",
  reverse: "wide",
  down: "wide",
};
/** in its own band, the median cue of each kind must sit at least this far above everything else playing at that moment */
const MIN_MEDIAN_DB: Record<string, number> = {
  snare: -2,
  kick: 0,
  impact: -1,
  key: -6,
  type: -6,
  click: -6,
  row: -6,
  chip: -6,
  line: -6,
  ignite: -6,
  device: -6,
  tile: -6,
  enter: -6,
};
const MAX_KICK_GAP_MS = 1;
/** a kick that starts while the last one still rings has no clean onset to measure, ghost notes included */
const KICK_TAIL_SECONDS = 0.27;
/** an onset can hide under the ring of the previous sound; more than this share of cues doing it is a mix problem */
const MAX_MASKED = 0.04;

const stemOf = (kind: string): StemName => SOUNDING_STEM[kind] ?? "ui";
const groupOf = (kind: string): Group => BAND_OF[kind] ?? "high";

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

/** samples from the expected onset to where the band envelope crosses 30% of its rise; undefined when nothing rises */
function onsetOffset(env: Float32Array, sample: number): number | undefined {
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
  for (let s = start; s < sample + Math.round(30 * ms); s += 1) if ((env[s] ?? 0) >= threshold) return s - sample;
  return undefined;
}

function silenced(frame: number, film: Film): boolean {
  const t = frame / FPS;
  return SCORES[film].gates.some(([from, to]) => t >= from - 0.04 && t <= to + 0.04);
}

function reportCues(stems: Stems, film: Film, maxFrame: number): number {
  const failures: string[] = [];
  const masked: string[] = [];
  const quiet = new Map<string, number[]>();
  let checked = 0;
  let worst = 0;
  const cues = AUDIO_CUES.filter(
    (c) => c.film === film && c.frame + Math.max(c.length ?? 0, FPS / 2) + TAIL_FRAMES <= maxFrame && !silenced(c.frame, film),
  );
  for (const cue of cues) {
    const sample = Math.round(secondsOf(cue.frame) * RATE);
    const group = groupOf(cue.kind);
    const own = stemOf(cue.kind);
    const timing = cue.kind === "kick" ? stems.kicks : stems[own];
    const span = Math.max(1, cue.length ?? 30) * (RATE / FPS);
    const tailing =
      cue.kind === "kick" &&
      SCORES[film].events.some(
        (e) => e.track === "kick" && e.t < secondsOf(cue.frame) - 0.002 && secondsOf(cue.frame) - e.t < KICK_TAIL_SECONDS,
      );
    const crowded =
      tailing ||
      cues.some(
        (o) =>
          o !== cue &&
          o.frame < cue.frame &&
          cue.frame - o.frame < 40 &&
          stemOf(o.kind) === stemOf(cue.kind) &&
          (o.kind === cue.kind || stemOf(cue.kind) === "ui"),
      );
    if (TRANSIENT_KINDS.has(cue.kind) && !crowded) {
      const offset = onsetOffset(timing.env(group), sample);
      checked += 1;
      const delta = offset === undefined ? undefined : offset / RATE / FRAME_SECONDS;
      if (delta === undefined) masked.push(`${cue.id} (${cue.label})`);
      else if (Math.abs(delta) > 1) failures.push(`${cue.id} (${cue.label}): ${delta.toFixed(2)} frames off`);
      else worst = Math.max(worst, Math.abs(delta));
    } else if (
      cue.kind === "riser" &&
      stems[own].energy("high", sample + span * 0.7, sample + span) <= stems[own].energy("high", sample, sample + span * 0.3) * 2
    ) {
      failures.push(`${cue.id} (${cue.label}): the riser does not rise`);
    }
    const window: Record<string, [number, number]> = { riser: [0.8, 1], whoosh: [0.3, 0.7], reverse: [0.8, 1], down: [0.1, 0.4] };
    const quick = ["key", "click", "type", "row", "flash", "seek", "draw"].includes(cue.kind) ? 0.025 : 0.05;
    const [lo, hi] = window[cue.kind] ?? [0, Math.min(1, (quick * RATE) / span)];
    const [from, to] = [sample + span * lo, sample + span * hi];
    const band = group;
    const mine = stems[own].energy(band, from, to);
    const rest = STEM_NAMES.filter((n) => n !== own).reduce((sum, n) => sum + stems[n].energy(band, from, to), 0);
    const ratio = 10 * Math.log10((mine + 1e-14) / (rest + 1e-14));
    quiet.set(cue.kind, [...(quiet.get(cue.kind) ?? []), ratio]);
  }
  if (masked.length > checked * MAX_MASKED)
    failures.push(`${masked.length} of ${checked} cues have no findable onset: ${masked.slice(0, 4).join(", ")}`);
  for (const [kind, ratios] of quiet) {
    const median = [...ratios].sort((a, b) => a - b)[Math.floor(ratios.length / 2)] ?? 0;
    const minimum = MIN_MEDIAN_DB[kind];
    if (minimum !== undefined && median < minimum)
      failures.push(`${kind}: median ${median.toFixed(1)} dB against the rest, needs ${minimum}`);
  }
  for (const failure of failures.slice(0, 25)) console.error(`  FAIL ${failure}`);
  if (failures.length > 25) console.error(`  ... and ${failures.length - 25} more`);
  console.log(
    `${film} cues: ${checked} transients within 1 frame (worst ${worst.toFixed(2)}), ${masked.length} masked by a neighbour, ${failures.length} problems`,
  );
  for (const [kind, ratios] of quiet)
    console.log(
      `  ${kind.padEnd(7)} against the rest: min ${Math.min(...ratios).toFixed(1)} dB, median ${[...ratios].sort((a, b) => a - b)[Math.floor(ratios.length / 2)]?.toFixed(1)} dB (${ratios.length})`,
    );
  return failures.length;
}

/** a riser has to be heard rising in the finished mix, not only on its own stem: the top band must grow while the music plays on */
function risersInMix(mix: Source, film: Film): number {
  const bad: string[] = [];
  const risers = AUDIO_CUES.filter((c) => c.film === film && c.kind === "riser" && !silenced(c.frame, film));
  for (const cue of risers) {
    const span = (cue.length ?? 30) * (RATE / FPS);
    const sample = Math.round(secondsOf(cue.frame) * RATE);
    const early = mix.energy("high", sample, sample + span * 0.3);
    const late = mix.energy("high", sample + span * 0.6, sample + span * 0.9);
    if (late < early * MIN_RISER_RISE)
      bad.push(`${cue.id} (${cue.label}): ${(10 * Math.log10((late + 1e-14) / (early + 1e-14))).toFixed(1)} dB`);
  }
  for (const line of bad) console.error(`  FAIL riser does not rise in the mix: ${line}`);
  console.log(
    `  risers in the finished mix: ${risers.length - bad.length} of ${risers.length} rise by at least ${(10 * Math.log10(MIN_RISER_RISE)).toFixed(1)} dB in the top band`,
  );
  return bad.length;
}

/** consecutive kicks one beat apart must be one beat apart in the audio, whatever the tempo of the shot */
function kickGrid(stems: Stems, film: Film): number {
  const { clock, events } = SCORES[film];
  const every = events.filter((e) => e.track === "kick");
  const clear = (t: number): boolean => !every.some((o) => o.t < t - 0.002 && t - o.t < KICK_TAIL_SECONDS);
  const kicks = every.filter((e) => e.vel >= 0.8 && clear(e.t) && !silenced(Math.round(e.t * FPS), film));
  const env = stems.kicks.env("low");
  const errors: number[] = [];
  const onset = (t: number): number | undefined => {
    const sample = Math.round(t * RATE);
    const offset = onsetOffset(env, sample);
    return offset === undefined ? undefined : sample + offset;
  };
  for (const [i, k] of kicks.entries()) {
    const next = kicks[i + 1];
    if (!next) continue;
    const bpm =
      clock.segments[
        Math.max(
          0,
          clock.starts.findLastIndex((s) => clock.at(s) <= k.t + 1e-6),
        )
      ]?.bpm;
    if (!bpm || Math.abs(next.t - k.t - 60 / bpm) > 0.0005) continue;
    const [a, b] = [onset(k.t), onset(next.t)];
    if (a === undefined || b === undefined) continue;
    errors.push((Math.abs(b - a - (next.t - k.t) * RATE) / RATE) * 1000);
  }
  const sorted = [...errors].sort((a, b) => a - b);
  const worst = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
  const mean = errors.reduce((s, e) => s + e, 0) / Math.max(1, errors.length);
  console.log(
    `  kick grid: ${errors.length} beat gaps follow the tempo map, mean error ${mean.toFixed(2)} ms, 95th percentile ${worst.toFixed(2)} ms, worst ${(sorted.at(-1) ?? 0).toFixed(2)} ms`,
  );
  if (errors.length === 0 || worst > MAX_KICK_GAP_MS) {
    console.error("  FAIL kick spacing does not follow the tempo map");
    return 1;
  }
  return 0;
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
    c.kind === "key" || c.kind === "type" ? 0.09 : 0.012,
  ]);
  for (const [from, to] of SCORES[film].gates) exempt.push([from * RATE, 0.004], [to * RATE, 0.012]);
  const near = (n: number): boolean => exempt.some(([at, tail]) => n >= at - 0.009 * RATE && n <= at + tail * RATE);
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

/** energy per octave from 125 Hz to 8 kHz and the slope between the first and the last, in dB per octave */
function tilt(mono: Float32Array): { octaves: number[]; slope: number } {
  const edges = [125, 250, 500, 1000, 2000, 4000, 8000];
  const size = 4096;
  const power = new Float64Array(size / 2);
  const window = Float64Array.from({ length: size }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size));
  for (let start = 0; start + size <= mono.length; start += size) {
    const re = Float64Array.from({ length: size }, (_, i) => (mono[start + i] ?? 0) * (window[i] ?? 0));
    const im = new Float64Array(size);
    fft(re, im);
    for (let k = 0; k < size / 2; k += 1) power[k] = (power[k] ?? 0) + (re[k] ?? 0) ** 2 + (im[k] ?? 0) ** 2;
  }
  const octaves = edges.slice(0, -1).map((lo, i) => {
    let sum = 0;
    for (let k = 1; k < size / 2; k += 1) {
      const hz = (k * RATE) / size;
      if (hz >= lo && hz < (edges[i + 1] as number)) sum += power[k] ?? 0;
    }
    return 10 * Math.log10(Math.max(sum, 1e-18));
  });
  return { octaves, slope: ((octaves.at(-1) ?? 0) - (octaves[0] ?? 0)) / (octaves.length - 1) };
}

async function auditFilm(film: Film): Promise<number> {
  const file = `public/audio/${film}.wav`;
  const audio = await decode(file);
  const score = SCORES[film];
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
    `  sample peak ${whole.peak.toFixed(2)} dBFS, rms ${whole.rms.toFixed(2)} dBFS, crest ${(whole.peak - whole.rms).toFixed(1)} dB, dc ${dc.map((x) => x.toExponential(1)).join(" / ")}, clipped samples ${clipped}`,
  );
  if (clipped > 0) fail("clipped samples");
  if (dc.some((x) => Math.abs(x) > 0.002)) fail("dc offset");

  const mid = Float32Array.from(audio.l, (l, i) => (l + (audio.r[i] ?? 0)) / 2);
  const side = Float32Array.from(audio.l, (l, i) => (l - (audio.r[i] ?? 0)) / 2);
  const share = bandPowers(mid, 0, audio.l.length).lowShare;
  const highpassed = await measureLoudness(file, undefined, undefined, "highpass=f=150:poles=2,highpass=f=150:poles=2,");
  console.log(
    `  energy below ${LOW_SHARE_HZ} Hz ${(share * 100).toFixed(0)}%, loudness through a 150 Hz high-pass ${highpassed.lufs.toFixed(1)} LUFS (${(loud.lufs - highpassed.lufs).toFixed(1)} LU under full range)`,
  );
  if (share > MAX_LOW_SHARE) fail(`${(share * 100).toFixed(0)}% of the energy is below ${LOW_SHARE_HZ} Hz, limit ${MAX_LOW_SHARE * 100}%`);
  const phone = await measureLoudness(file, undefined, undefined, PHONE_FILTER);
  console.log(
    `  phone simulation (high-pass 200 Hz, low-pass 9 kHz): ${phone.lufs.toFixed(1)} LUFS, ${(loud.lufs - phone.lufs).toFixed(1)} LU under full range`,
  );
  if (loud.lufs - phone.lufs > MAX_PHONE_GAP_LU)
    fail(`on a phone speaker it is ${(loud.lufs - phone.lufs).toFixed(1)} LU quieter, limit ${MAX_PHONE_GAP_LU}`);
  if (loud.lufs - highpassed.lufs > MAX_HIGHPASS_GAP_LU)
    fail(`small speakers hear it ${(loud.lufs - highpassed.lufs).toFixed(1)} LU quieter, limit ${MAX_HIGHPASS_GAP_LU}`);

  for (const [from, to] of score.gates) {
    const [first, last] = [Math.round(from * RATE + 0.003 * RATE), Math.round(to * RATE) - 1];
    let loudest = 0;
    for (let i = first; i < last; i += 1) loudest = Math.max(loudest, Math.abs(audio.l[i] ?? 0), Math.abs(audio.r[i] ?? 0));
    const frames = Math.round((to - from) * FPS);
    if (frames >= 6)
      console.log(`  silence gate ${from.toFixed(2)} to ${to.toFixed(2)} s (${frames} frames): loudest sample ${loudest.toExponential(1)}`);
    if (loudest > 1e-4) fail(`something rings through the silence gate at ${from.toFixed(2)} s (${loudest.toExponential(1)})`);
  }
  const breaths = score.gates.filter(([from, to]) => Math.round((to - from) * FPS) >= 8).length;
  if (breaths < (film === "cutdown" ? 1 : 2)) fail(`expected the 8-frame silences before the last hit, found ${breaths}`);

  const found = clicks(audio, film);
  console.log(
    `  click candidates (second difference against local level, away from cues): ${found.length}${found.length ? ` at ${found.slice(0, 6).join(" ")}` : ""}`,
  );
  if (found.length > 0) fail(`${found.length} click candidates`);

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

  const slope = tilt(mid);
  console.log(
    `  octave energy 125 Hz..8 kHz (dB): ${slope.octaves.map((o) => o.toFixed(0)).join(" ")}, tilt ${slope.slope.toFixed(1)} dB per octave`,
  );
  if (slope.slope > TILT_MAX || slope.slope < TILT_MIN)
    fail(`spectral tilt ${slope.slope.toFixed(1)} dB/oct is outside ${TILT_MIN}..${TILT_MAX}`);

  const [highL, highR] = [highpass(audio.l, 300), highpass(audio.r, 300)];
  const width = correlation(highL, highR, 0, audio.l.length);
  console.log(`  stereo correlation above 300 Hz ${width.toFixed(2)} (1 is mono, trailers sit near 0.4 to 0.85)`);
  if (width > MAX_CORRELATION || width < MIN_CORRELATION)
    fail(`stereo correlation above 300 Hz is ${width.toFixed(2)}, wanted ${MIN_CORRELATION}..${MAX_CORRELATION}`);

  console.log("  section                lufs   rms   peak  corr>300 | spectrum dev vs reference (dB, 8 bands 0..24 kHz)");
  const lufs = new Map<number, number>();
  for (const [i, section] of SECTIONS[film].entries()) {
    const from = Math.round(score.clock.at(section.from) * RATE);
    const to = Math.min(audio.l.length, Math.round(score.clock.at(section.to) * RATE));
    if (to - from < RATE * 1.2) continue;
    const level = stats(audio, from, to);
    const l = (await measureLoudness(file, from / RATE, to / RATE)).lufs;
    lufs.set(i, l);
    const { bands: power } = bandPowers(mid, from, to);
    const reference = power[3] ?? 1;
    const devs = power.map((p, k) => 10 * Math.log10(Math.max(p, 1e-18) / Math.max(reference, 1e-18)) - (REFERENCE_DB[k] ?? 0));
    const worst = Math.max(...devs.map(Math.abs));
    const dense = DENSE_MOODS.has(score.clock.segments[i]?.mood ?? "");
    const audible = level.rms > -45;
    const tooFar = devs.some((d) => d > BAND_TOLERANCE_DB || (dense && d < -BAND_TOLERANCE_DB));
    console.log(
      `  ${section.id.padEnd(20).slice(0, 20)} ${l.toFixed(1).padStart(6)} ${level.rms.toFixed(1).padStart(6)} ${level.peak.toFixed(1).padStart(6)} ${correlation(highL, highR, from, to).toFixed(2).padStart(8)} | ${devs.map((d) => d.toFixed(0).padStart(4)).join("")}${audible && tooFar ? "  FAIL" : ""}`,
    );
    if (audible && tooFar) fail(`${section.id} spectrum is ${worst.toFixed(0)} dB off the reference in one band`);
  }

  const known = [...lufs.values()].filter(Number.isFinite);
  const spread = Math.max(...known) - Math.min(...known);
  console.log(
    `  section loudness spread ${spread.toFixed(1)} LU (loudest ${Math.max(...known).toFixed(1)}, quietest ${Math.min(...known).toFixed(1)})`,
  );
  if (spread < MIN_SPREAD) fail(`dynamics: sections only span ${spread.toFixed(1)} LU, wanted ${MIN_SPREAD}`);
  const limit = film === "anthem" ? WIDE_SPREAD : MAX_SPREAD;
  if (spread > limit) fail(`dynamics: sections span ${spread.toFixed(1)} LU, limit ${limit}`);
  for (const [i, segment] of score.clock.segments.entries()) {
    const before = lufs.get(i - 1);
    const here = lufs.get(i);
    if (segment.enter === "drop" && before !== undefined && here !== undefined && here - before < DROP_LU)
      fail(`dynamics: the drop into "${segment.id}" is only ${(here - before).toFixed(1)} LU louder than what leads in, wanted ${DROP_LU}`);
  }

  const bars: number[] = [];
  for (let at = 0; at + BAR_SECONDS <= audio.l.length / RATE; at += BAR_SECONDS) {
    const value = (await measureLoudness(file, at, at + BAR_SECONDS)).lufs;
    bars.push(Number.isFinite(value) ? value : -70);
  }
  console.log(`  loudness per ${BAR_SECONDS} s (LUFS): ${bars.map((v) => v.toFixed(0)).join(" ")}`);
  for (let from = 0; from < bars.length; from += 1) {
    let to = from;
    let [lowest, highest] = [bars[from] as number, bars[from] as number];
    while (to + 1 < bars.length && Math.max(highest, bars[to + 1] as number) - Math.min(lowest, bars[to + 1] as number) <= FLAT_LU) {
      to += 1;
      lowest = Math.min(lowest, bars[to] as number);
      highest = Math.max(highest, bars[to] as number);
    }
    if ((to - from + 1) * BAR_SECONDS > (film === "tour" ? FLAT_SECONDS_TOUR : FLAT_SECONDS)) {
      fail(`${from * BAR_SECONDS} s to ${(to + 1) * BAR_SECONDS} s stays within ${FLAT_LU} LU for ${(to - from + 1) * BAR_SECONDS} s`);
      break;
    }
  }

  const sources = Object.fromEntries(
    await Promise.all(STEM_NAMES.map(async (n) => [n, new Source(await decode(`public/audio/stems/${film}-${n}.wav`))])),
  ) as Record<StemName, Source>;
  const stems: Stems = { ...sources, kicks: new Source(await decode(`public/audio/stems/${film}-kicks.wav`)) };
  failures += kickGrid(stems, film);
  failures += reportCues(stems, film, FILM_FRAMES[film]);
  failures += risersInMix(new Source(audio), film);
  return failures;
}

export async function audio(films: Film[]): Promise<number> {
  let failures = 0;
  for (const film of films) failures += await auditFilm(film);
  console.log(failures === 0 ? "\naudio checks ok" : `\n${failures} audio failures`);
  return failures;
}

export async function onsets(file: string, film: Film): Promise<number> {
  const source = new Source(await decode(file));
  const stems = { drums: source, bass: source, music: source, fx: source, ui: source, space: source, kicks: source };
  return reportCues(stems, film, Math.round(source.band("wide").length / (RATE / FPS)));
}
