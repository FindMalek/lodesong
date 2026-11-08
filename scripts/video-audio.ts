import { mkdirSync } from "node:fs";
import { FILM_BEATS, FILM_FRAMES, type Film, SHEET, type SheetCue } from "../apps/video/src/audio-cues";
import { FPS } from "../apps/video/src/design/beat";
import { BEDS, type BedSpec, mixAt, renderArp, renderBass, renderHats, renderPad, renderTexture, sampleOf, windowSpec } from "./audio/bed";
import { addStereo, dbGain, highpass, limit, lowpass, peakOf, RATE, rng, type Stereo, seedOf, stereo, wavBytes } from "./audio/dsp";
import { measureLoudness } from "./audio/loudness";
import { reverbReturn } from "./audio/rig";
import { render } from "./audio/voices";

// bun scripts/video-audio.ts   renders hero.wav, cutdown.wav, open.wav and stems from the one cue sheet in apps/video/src/audio-cues.ts
const OUT = "apps/video/public/audio";
const TARGET_LUFS = -14;
const TRUE_PEAK = -1.5;
const SAMPLES_PER_FRAME = RATE / FPS;

interface Rig {
  dry: Stereo;
  verb: Stereo;
  echo: Stereo;
}

const newRig = (length: number): Rig => ({ dry: stereo(length), verb: stereo(length), echo: stereo(length) });

type Trigger = readonly [weight: number, release: number];

const BED_DUCK: Partial<Record<SheetCue["kind"], Trigger>> = { kick: [0.6, 0.2], impact: [1, 0.5], hit: [0.8, 0.4] };
const UI_DUCK: Partial<Record<SheetCue["kind"], Trigger>> = { key: [0.5, 0.12], ping: [0.4, 0.12], tick: [0.25, 0.1] };
const JITTER: Partial<Record<SheetCue["kind"], readonly [ms: number, db: number]>> = {
  kick: [1, 0.4],
  tick: [2, 1.5],
  key: [2, 1.5],
  ping: [1, 1],
};

function duckEnvelope(cues: readonly SheetCue[], length: number, triggers: Partial<Record<SheetCue["kind"], Trigger>>): Float32Array {
  const env = new Float32Array(length);
  for (const cue of cues) {
    const trigger = triggers[cue.kind];
    if (!trigger) continue;
    const [weight, release] = cue.kind === "hit" && cue.style === "brand" ? [0.9, trigger[1]] : trigger;
    const start = cue.frame * SAMPLES_PER_FRAME;
    const span = Math.min(length - start, Math.round(release * 5 * RATE));
    for (let i = 0; i < span; i += 1) {
      const value = weight * Math.exp(-i / (release * RATE)) * Math.min(1, i / (0.004 * RATE));
      if (value > (env[start + i] ?? 0)) env[start + i] = value;
    }
  }
  return env;
}

function ducked(audio: Stereo, env: Float32Array, depth: number): void {
  for (let i = 0; i < env.length; i += 1) {
    const gain = Math.max(0, 1 - depth * (env[i] ?? 0));
    audio.l[i] = (audio.l[i] ?? 0) * gain;
    audio.r[i] = (audio.r[i] ?? 0) * gain;
  }
}

function feed(rig: Rig, audio: Stereo, start: number, verb: number, echo: number, gain = 1): void {
  addStereo(rig.dry, audio, start, gain);
  if (verb > 0) addStereo(rig.verb, audio, start, verb * gain);
  if (echo > 0) addStereo(rig.echo, audio, start, echo * gain);
}

function cutTo(audio: Stereo, from: number, to: number): void {
  const ramp = Math.round(RATE * 0.003);
  for (let i = 0; i < audio.l.length; i += 1) {
    const g = i < from || i >= to ? 0 : to >= audio.l.length ? 1 : Math.min(1, (to - i) / ramp);
    audio.l[i] = (audio.l[i] ?? 0) * g;
    audio.r[i] = (audio.r[i] ?? 0) * g;
  }
}

function renderWindow(
  film: Film,
  spec: BedSpec,
  window: readonly [number, number],
  envs: { bed: Float32Array; ui: Float32Array },
): [Stereo, Stereo] {
  const length = FILM_FRAMES[film] * SAMPLES_PER_FRAME;
  const [from, to] = [sampleOf(window[0]), sampleOf(window[1])];
  const part = windowSpec(spec, window[0], window[1]);
  const cues = SHEET.filter((cue) => cue.film === film).entries();
  const bed = newRig(length);
  const sfx = newRig(length);

  const pad = renderPad(part, length);
  ducked(pad, envs.bed, 0.5);
  ducked(pad, envs.ui, 0.5);
  feed(bed, pad, 0, 0.3, 0);

  const texture = renderTexture(part, length, seedOf(film));
  ducked(texture, envs.bed, 0.3);
  feed(bed, texture, 0, 0, 0);

  const bassMono = renderBass(part, length);
  const bass = { l: bassMono, r: Float32Array.from(bassMono) };
  ducked(bass, envs.bed, 1.6);
  feed(bed, bass, 0, 0, 0);

  const arp = renderArp(part, length, seedOf(film));
  ducked(arp.audio, envs.bed, 0.35);
  ducked(arp.audio, envs.ui, 0.5);
  feed(bed, arp.audio, 0, 0.35, 0.7);

  renderHats(part, bed.dry, bed.verb, film);

  for (const [index, cue] of cues) {
    const at = cue.frame * SAMPLES_PER_FRAME;
    if (at < from || at >= to) continue;
    const human = rng(seedOf(cue.id));
    const [ms, db] = JITTER[cue.kind] ?? [0, 0];
    const start = Math.max(0, at + Math.round((human() - 0.5) * 2 * ms * (RATE / 1000)));
    const voice = render(cue, index);
    feed(cue.kind === "kick" ? bed : sfx, voice.audio, start, voice.verb, voice.echo, 10 ** (((human() - 0.5) * 2 * db) / 20));
  }
  const out = [reverbReturn(bed), reverbReturn(sfx)] as [Stereo, Stereo];
  for (const audio of out) {
    monoLowEnd(audio);
    cutTo(audio, from, to);
  }
  return out;
}

function renderRigs(film: Film, spec: BedSpec): { bed: Stereo; sfx: Stereo } {
  const length = FILM_FRAMES[film] * SAMPLES_PER_FRAME;
  const cues = SHEET.filter((cue) => cue.film === film);
  const envs = { bed: duckEnvelope(cues, length, BED_DUCK), ui: duckEnvelope(cues, length, UI_DUCK) };
  const edges = [0, ...spec.gates.flat(), FILM_BEATS[film]];
  const total = { bed: stereo(length), sfx: stereo(length) };
  for (let i = 0; i < edges.length; i += 2) {
    const [bed, sfx] = renderWindow(film, spec, [edges[i] as number, edges[i + 1] as number], envs);
    addStereo(total.bed, bed, 0, 1);
    addStereo(total.sfx, sfx, 0, 1);
  }
  for (let i = 0; i < length; i += 1) {
    const g = mixAt(spec, i);
    total.bed.l[i] = (total.bed.l[i] ?? 0) * g;
    total.bed.r[i] = (total.bed.r[i] ?? 0) * g;
  }
  return total;
}

function fadeTail(audio: Stereo): void {
  const fade = Math.round(RATE * 0.7);
  for (let i = 0; i < audio.l.length; i += 1) {
    const tail = Math.min(1, (audio.l.length - i) / fade);
    const head = Math.min(1, i / (RATE * 0.002));
    const g = Math.sin((tail * Math.PI) / 2) * head;
    audio.l[i] = (audio.l[i] ?? 0) * g;
    audio.r[i] = (audio.r[i] ?? 0) * g;
  }
}

function monoLowEnd(audio: Stereo): void {
  const side = Float32Array.from(audio.l, (l, i) => (l - (audio.r[i] ?? 0)) / 2);
  const cleaned = lowpass(highpass(highpass(side, 150), 150), 15500);
  const left = lowpass(
    highpass(
      Float32Array.from(audio.l, (l, i) => (l + (audio.r[i] ?? 0)) / 2),
      24,
    ),
    15500,
  );
  for (let i = 0; i < left.length; i += 1) {
    audio.l[i] = (left[i] ?? 0) + (cleaned[i] ?? 0);
    audio.r[i] = (left[i] ?? 0) - (cleaned[i] ?? 0);
  }
}

function scaled(audio: Stereo, gain: number): Stereo {
  return { l: audio.l.map((x) => x * gain), r: audio.r.map((x) => x * gain) };
}

async function write(name: string, audio: Stereo): Promise<void> {
  await Bun.write(`${OUT}/${name}`, wavBytes(audio, seedOf(name)));
}

async function masterFilm(film: Film): Promise<{ lufs: number; peak: number; lra: number }> {
  const spec = BEDS[film];
  const parts = renderRigs(film, spec);
  for (const part of [parts.bed, parts.sfx]) {
    fadeTail(part);
  }
  const total = stereo(parts.bed.l.length);
  addStereo(total, parts.bed, 0, 1);
  addStereo(total, parts.sfx, 0, 1);

  let gainDb = 0;
  let ceilingDb = -2;
  let master = total;
  let stats = { lufs: Number.NaN, peak: Number.NaN, lra: Number.NaN };
  for (let pass = 0; pass < 8; pass += 1) {
    master = scaled(total, dbGain(gainDb));
    limit(master, dbGain(ceilingDb));
    await write(`${film}.wav`, master);
    stats = await measureLoudness(`${OUT}/${film}.wav`);
    const lufsError = TARGET_LUFS - stats.lufs;
    const peakError = TRUE_PEAK - 0.05 - stats.peak;
    if (Math.abs(lufsError) < 0.05 && peakError >= 0) break;
    if (peakError < 0) ceilingDb += peakError - 0.05;
    gainDb += lufsError * 0.9;
  }
  const gain = dbGain(gainDb);
  await write(`stems/${film}-music.wav`, scaled(parts.bed, gain));
  await write(`stems/${film}-sfx.wav`, scaled(parts.sfx, gain));
  if (film === "hero") {
    const open = stereo(FPS * 8 * SAMPLES_PER_FRAME);
    addStereo(open, master, 0, 1);
    const fade = RATE * 0.4;
    for (let i = open.l.length - fade; i < open.l.length; i += 1) {
      const g = (open.l.length - i) / fade;
      open.l[i] = (open.l[i] ?? 0) * g;
      open.r[i] = (open.r[i] ?? 0) * g;
    }
    await write("open.wav", open);
  }
  console.log(
    `${film}: gain ${gainDb.toFixed(1)} dB, ${stats.lufs.toFixed(1)} LUFS, true peak ${stats.peak.toFixed(2)} dBTP, LRA ${stats.lra.toFixed(1)} LU, sample peak ${(20 * Math.log10(peakOf(master))).toFixed(2)} dBFS`,
  );
  return stats;
}

mkdirSync(`${OUT}/stems`, { recursive: true });
for (const film of ["hero", "cutdown"] as const) await masterFilm(film);
