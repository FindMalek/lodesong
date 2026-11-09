import { mkdirSync } from "node:fs";
import { FILM_FRAMES, FILMS, type Film, SCORES } from "../apps/video/src/audio-cues";
import { FPS } from "../apps/video/src/audio-tempo";
import { addStereo, dbGain, limit, peakOf, RATE, type Stereo, seedOf, stereo, wavBytes } from "./audio/dsp";
import { measureLoudness } from "./audio/loudness";
import { applyGates, masterChain, mixScore, type Stems, sumStems } from "./audio/mix";
import { plotFilm } from "./audio/plots";

// bun scripts/video-audio.ts [hero|tour|cutdown ...]   renders <film>.wav and its stems from the score in apps/video/src/audio-plan.ts
const OUT = "apps/video/public/audio";
const QA = "apps/video/out/audio-qa";
const TARGET_LUFS = -14;
const TRUE_PEAK = -1.5;

const scaled = (audio: Stereo, gain: number): Stereo => ({ l: audio.l.map((x) => x * gain), r: audio.r.map((x) => x * gain) });

async function write(name: string, audio: Stereo): Promise<void> {
  await Bun.write(`${OUT}/${name}`, wavBytes(audio, seedOf(name)));
}

function fadeTail(audio: Stereo, seconds: number): void {
  const fade = Math.round(RATE * seconds);
  for (let i = 0; i < Math.min(fade, audio.l.length); i += 1) {
    const g = Math.sin((i / fade) * (Math.PI / 2));
    const j = audio.l.length - 1 - i;
    audio.l[j] = (audio.l[j] ?? 0) * g;
    audio.r[j] = (audio.r[j] ?? 0) * g;
  }
}

async function masterFilm(film: Film): Promise<void> {
  const started = performance.now();
  const score = SCORES[film];
  const stems: Stems = mixScore(score);
  for (const stem of Object.values(stems)) fadeTail(stem, 1.2);
  const total = sumStems(stems);
  masterChain(total);
  for (const audio of [total, ...Object.values(stems)]) applyGates(audio, score.gates);
  const mixed = performance.now();

  let gainDb = 0;
  let ceilingDb = -2;
  let master = total;
  let stats = { lufs: Number.NaN, peak: Number.NaN, lra: Number.NaN };
  for (let pass = 0; pass < 10; pass += 1) {
    master = scaled(total, dbGain(gainDb));
    limit(master, dbGain(ceilingDb), 360);
    await write(`${film}.wav`, master);
    stats = await measureLoudness(`${OUT}/${film}.wav`);
    const lufsError = TARGET_LUFS - stats.lufs;
    const peakError = TRUE_PEAK - 0.05 - stats.peak;
    if (Math.abs(lufsError) < 0.05 && peakError >= 0) break;
    if (peakError < 0) ceilingDb += peakError - 0.05;
    gainDb += lufsError * 0.9;
  }
  const gain = dbGain(gainDb);
  for (const [name, stem] of Object.entries(stems)) await write(`stems/${film}-${name}.wav`, scaled(stem, gain));
  if (film === "hero") {
    const open = stereo(FPS * 8 * (RATE / FPS));
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
    `${film}: ${(FILM_FRAMES[film] / FPS).toFixed(1)} s, gain ${gainDb.toFixed(1)} dB, ${stats.lufs.toFixed(1)} LUFS, true peak ${stats.peak.toFixed(2)} dBTP, LRA ${stats.lra.toFixed(1)} LU, sample peak ${(20 * Math.log10(peakOf(master))).toFixed(2)} dBFS, mix ${((mixed - started) / 1000).toFixed(0)} s`,
  );
  mkdirSync(QA, { recursive: true });
  await plotFilm(film, OUT, QA);
}

mkdirSync(`${OUT}/stems`, { recursive: true });
const wanted = process.argv.slice(2).filter((a): a is Film => (FILMS as readonly string[]).includes(a));
for (const film of wanted.length ? wanted : FILMS) await masterFilm(film);
