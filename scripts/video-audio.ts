import { mkdirSync } from "node:fs";
import { FILM_FRAMES, type Film, SHEET, type SheetCue } from "../apps/video/src/audio-cues";
import { FPS } from "../apps/video/src/design/beat";
import { BEDS, type BedSpec, renderArp, renderBass, renderHats, renderPad, renderTexture, sampleOf } from "./audio/bed";
import { addStereo, dbGain, highpass, limit, peakOf, RATE, type Stereo, seedOf, stereo, wavBytes } from "./audio/dsp";
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

function duckEnvelope(cues: readonly SheetCue[], length: number): Float32Array {
  const env = new Float32Array(length);
  for (const cue of cues) {
    const [weight, release] =
      cue.kind === "kick"
        ? [0.6, 0.2]
        : cue.kind === "impact"
          ? [1, 0.5]
          : cue.kind === "hit"
            ? [cue.style === "brand" ? 0.9 : 0.8, 0.4]
            : [0, 0];
    if (weight === 0) continue;
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
    const gain = 1 - depth * (env[i] ?? 0);
    audio.l[i] = (audio.l[i] ?? 0) * gain;
    audio.r[i] = (audio.r[i] ?? 0) * gain;
  }
}

function feed(rig: Rig, audio: Stereo, start: number, verb: number, echo: number): void {
  addStereo(rig.dry, audio, start, 1);
  if (verb > 0) addStereo(rig.verb, audio, start, verb);
  if (echo > 0) addStereo(rig.echo, audio, start, echo);
}

function renderRigs(film: Film, spec: BedSpec): { bed: Stereo; sfx: Stereo } {
  const length = FILM_FRAMES[film] * SAMPLES_PER_FRAME;
  const cues = SHEET.filter((cue) => cue.film === film);
  const env = duckEnvelope(cues, length);
  const bed = newRig(length);
  const sfx = newRig(length);

  const pad = renderPad(spec, length);
  ducked(pad, env, 0.5);
  feed(bed, pad, 0, 0.3, 0);

  const texture = renderTexture(spec, length, seedOf(film));
  ducked(texture, env, 0.3);
  feed(bed, texture, 0, 0, 0);

  const bassMono = renderBass(spec, length);
  const bass = { l: bassMono, r: Float32Array.from(bassMono) };
  ducked(bass, env, 0.85);
  feed(bed, bass, 0, 0, 0);

  const arp = renderArp(spec, length);
  ducked(arp.audio, env, 0.35);
  feed(bed, arp.audio, 0, 0.35, 0.7);

  renderHats(spec, bed.dry, bed.verb, film);

  for (const [index, cue] of cues.entries()) {
    const voice = render(cue, index);
    feed(cue.kind === "kick" ? bed : sfx, voice.audio, cue.frame * SAMPLES_PER_FRAME, voice.verb, voice.echo);
  }
  return { bed: reverbReturn(bed), sfx: reverbReturn(sfx) };
}

function gateAndFade(audio: Stereo, spec: BedSpec): void {
  const ramp = Math.round(RATE * 0.003);
  const gain = new Float32Array(audio.l.length).fill(1);
  for (const [from, to] of spec.gates) {
    const a = sampleOf(from);
    const b = sampleOf(to);
    for (let i = a - ramp; i < b + ramp; i += 1) {
      const down = Math.min(1, Math.max(0, (a - i) / ramp));
      const up = Math.min(1, Math.max(0, (i - (b - ramp)) / ramp));
      if (i >= 0 && i < gain.length) gain[i] = Math.min(gain[i] ?? 1, i < a ? down : i >= b ? up : 0);
    }
  }
  const fade = Math.round(RATE * 0.7);
  for (let i = 0; i < audio.l.length; i += 1) {
    const tail = Math.min(1, (audio.l.length - i) / fade);
    const head = Math.min(1, i / (RATE * 0.002));
    const g = (gain[i] ?? 1) * Math.sin((tail * Math.PI) / 2) * head;
    audio.l[i] = (audio.l[i] ?? 0) * g;
    audio.r[i] = (audio.r[i] ?? 0) * g;
  }
}

function monoLowEnd(audio: Stereo): void {
  const side = Float32Array.from(audio.l, (l, i) => (l - (audio.r[i] ?? 0)) / 2);
  const cleaned = highpass(side, 150);
  const left = highpass(
    Float32Array.from(audio.l, (l, i) => (l + (audio.r[i] ?? 0)) / 2),
    24,
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
    monoLowEnd(part);
    gateAndFade(part, spec);
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
    `${film}: ${stats.lufs.toFixed(1)} LUFS, true peak ${stats.peak.toFixed(2)} dBTP, LRA ${stats.lra.toFixed(1)} LU, sample peak ${(20 * Math.log10(peakOf(master))).toFixed(2)} dBFS`,
  );
  return stats;
}

mkdirSync(`${OUT}/stems`, { recursive: true });
for (const film of ["hero", "cutdown"] as const) await masterFilm(film);
