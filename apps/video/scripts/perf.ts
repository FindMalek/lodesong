import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "@playwright/test";
import { bundle } from "@remotion/bundler";
import { openBrowser, renderFrames, renderStill, selectComposition } from "@remotion/renderer";
import { enableTailwind } from "@remotion/tailwind-v4";
import { HERO } from "../src/scenes/timelines";

// bun scripts/perf.ts bench|stills <dir>|compare <a> <b>|trace|play [--shot id] [--samples 6] [--throttle 4] [--gl angle]
// play = real-time Player playback on the GPU (what Studio does), bench = frame renders with the page warm

const args = process.argv.slice(2);
const mode = args[0] ?? "bench";
const flag = (name: string, fallback: string): string => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? (args[at + 1] ?? fallback) : fallback;
};
const ID = flag("id", "hero");
const SAMPLES = Number(flag("samples", "6"));
const WINDOW = Number(flag("window", "6"));
const ONLY = flag("shot", "");
const picked = (id: string): boolean => !ONLY || ONLY.split(",").includes(id);
const PNG = args.includes("--png");
const GL = flag("gl", "") as "angle" | "swangle" | "egl" | "vulkan" | "angle-egl" | "";
const launch = () => openBrowser("chrome", GL ? { chromiumOptions: { gl: GL } } : {});

interface Sample {
  shot: string;
  frame: number;
  cold: number;
  warm: number[];
}

function pointsOf(start: number, frames: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => start + Math.floor(((i + 0.5) / count) * Math.max(1, frames - WINDOW)));
}

const median = (xs: number[]): number => {
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
};

async function serve(): Promise<string> {
  return bundle({ entryPoint: resolve("src/index.ts"), webpackOverride: enableTailwind });
}

async function collect(serveUrl: string, browser: Awaited<ReturnType<typeof openBrowser>>): Promise<Sample[]> {
  const composition = await selectComposition({ serveUrl, id: ID });
  const shots = ID === "hero" ? HERO.shots.filter((shot) => picked(shot.id)) : [];
  const samples: Sample[] = [];
  for (const shot of shots) {
    for (const frame of pointsOf(shot.start, shot.frames, SAMPLES)) {
      const times: number[] = [];
      await renderFrames({
        composition,
        serveUrl,
        puppeteerInstance: browser,
        inputProps: {},
        concurrency: 1,
        frameRange: [frame, frame + WINDOW - 1],
        imageFormat: PNG ? "png" : "jpeg",
        jpegQuality: 70,
        outputDir: null,
        onFrameBuffer: () => undefined,
        onStart: () => undefined,
        onFrameUpdate: (_done, _index, ms) => {
          times.push(ms);
        },
        timeoutInMilliseconds: 120_000,
      });
      samples.push({ shot: shot.id, frame, cold: times[0] ?? 0, warm: times.slice(1) });
      process.stdout.write(".");
    }
  }
  return samples;
}

async function bench(): Promise<void> {
  const serveUrl = await serve();
  const browser = await launch();
  const samples = await collect(serveUrl, browser);
  process.stdout.write("\n");
  report(samples);
  await browser.close({ silent: true });
}

function report(samples: Sample[]): void {
  const perShot = new Map<string, number[]>();
  const frames: { shot: string; frame: number; ms: number }[] = [];
  for (const sample of samples) {
    const bucket = perShot.get(sample.shot) ?? [];
    bucket.push(...sample.warm);
    perShot.set(sample.shot, bucket);
    sample.warm.forEach((ms, i) => {
      frames.push({ shot: sample.shot, frame: sample.frame + 1 + i, ms });
    });
  }
  console.log("shot          median   p90     max   (ms/frame, warm)");
  for (const [shot, ms] of perShot) {
    const sorted = [...ms].sort((a, b) => a - b);
    const p90 = sorted[Math.floor(sorted.length * 0.9)] ?? 0;
    console.log(
      `${shot.padEnd(13)} ${median(ms).toFixed(0).padStart(6)} ${p90.toFixed(0).padStart(6)} ${(sorted.at(-1) ?? 0).toFixed(0).padStart(7)}`,
    );
  }
  const all = frames.map((one) => one.ms);
  console.log(
    `overall median ${median(all).toFixed(0)} ms, max ${Math.max(...all).toFixed(0)} ms, mean ${(all.reduce((a, b) => a + b, 0) / all.length).toFixed(0)} ms over ${all.length} frames`,
  );
  const cold = samples.map((s) => s.cold);
  console.log(`first frame of each window (cold seek): median ${median(cold).toFixed(0)} ms, max ${Math.max(...cold).toFixed(0)} ms`);
  console.log("slowest frames:");
  for (const one of frames.sort((a, b) => b.ms - a.ms).slice(0, 12))
    console.log(`  ${one.shot.padEnd(12)} f${String(one.frame).padEnd(6)} ${one.ms.toFixed(0)} ms`);
  const json = flag("json", "");
  if (json) {
    mkdirSync(resolve(json, ".."), { recursive: true });
    writeFileSync(json, JSON.stringify({ samples }, null, 1));
  }
}

async function stills(): Promise<void> {
  const dir = resolve(args[1] ?? "out/perf/stills");
  mkdirSync(dir, { recursive: true });
  const serveUrl = await serve();
  const composition = await selectComposition({ serveUrl, id: ID });
  const browser = await launch();
  for (const shot of HERO.shots.filter((one) => picked(one.id))) {
    for (const frame of pointsOf(shot.start, shot.frames, SAMPLES)) {
      await renderStill({
        composition,
        serveUrl,
        puppeteerInstance: browser,
        frame,
        output: join(dir, `${shot.id}-f${frame}.png`),
        imageFormat: "png",
        overwrite: true,
        timeoutInMilliseconds: 120_000,
      });
      process.stdout.write(".");
    }
  }
  await browser.close({ silent: true });
  process.stdout.write(`\n${dir}\n`);
}

async function compare(): Promise<void> {
  const [a, b] = [resolve(args[1] ?? ""), resolve(args[2] ?? "")];
  const names = (await Array.fromAsync(new Bun.Glob("*.png").scan(a))).sort();
  const floor = Number(flag("psnr", "38"));
  let worst = { name: "", psnr: Number.POSITIVE_INFINITY };
  let failures = 0;
  for (const name of names) {
    const run = Bun.spawnSync(["ffmpeg", "-v", "info", "-i", join(a, name), "-i", join(b, name), "-lavfi", "psnr", "-f", "null", "-"], {
      stderr: "pipe",
    });
    const match = /average:(\S+)/.exec(run.stderr.toString());
    const psnr = match?.[1] === "inf" ? 99 : Number(match?.[1] ?? 0);
    if (psnr < worst.psnr) worst = { name, psnr };
    if (psnr < floor) {
      failures += 1;
      console.log(`DIFF ${name} psnr ${psnr.toFixed(1)} dB`);
    }
  }
  console.log(`${names.length} stills, worst ${worst.name} ${worst.psnr.toFixed(1)} dB, ${failures} under ${floor} dB`);
  process.exit(failures > 0 ? 1 : 0);
}

interface TraceEvent {
  ph: string;
  name: string;
  pid: number;
  tid: number;
  dur?: number;
  args?: { name?: string };
}

async function trace(): Promise<void> {
  const wrapper = join(tmpdir(), "chrome-with-debug-port.sh");
  const real = Bun.spawnSync(["find", resolve("node_modules/.remotion"), "-name", "chrome-headless-shell", "-type", "f"])
    .stdout.toString()
    .trim();
  writeFileSync(wrapper, `#!/bin/sh\nexec "${real}" --remote-debugging-port=9333 "$@"\n`, { mode: 0o755 });
  const serveUrl = await serve();
  const composition = await selectComposition({ serveUrl, id: ID });
  const browser = await openBrowser("chrome", { browserExecutable: wrapper });
  const version = (await (await fetch("http://127.0.0.1:9333/json/version")).json()) as { webSocketDebuggerUrl: string };
  const socket = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((done) => socket.addEventListener("open", done, { once: true }));
  const events: TraceEvent[] = [];
  let ended: () => void = () => undefined;
  const complete = new Promise<void>((done) => {
    ended = done;
  });
  socket.addEventListener("message", (message) => {
    const data = JSON.parse(String(message.data)) as { method?: string; params?: { value?: TraceEvent[] } };
    if (data.method === "Tracing.dataCollected") events.push(...(data.params?.value ?? []));
    if (data.method === "Tracing.tracingComplete") ended();
  });
  const shot = HERO.shots.find((one) => one.id === ONLY) ?? HERO.shots[0];
  if (!shot) throw new Error("no shot");
  const frame = shot.start + Math.floor(shot.frames / 2);
  const run = (start: number, end: number) =>
    renderFrames({
      composition,
      serveUrl,
      puppeteerInstance: browser,
      inputProps: {},
      concurrency: 1,
      frameRange: [start, end],
      imageFormat: "jpeg",
      jpegQuality: 70,
      outputDir: null,
      onFrameBuffer: () => undefined,
      onStart: () => undefined,
      onFrameUpdate: () => undefined,
      timeoutInMilliseconds: 120_000,
    });
  await run(frame - 8, frame - 1);
  socket.send(
    JSON.stringify({
      id: 1,
      method: "Tracing.start",
      params: { categories: "devtools.timeline,cc,gpu,viz,skia,disabled-by-default-devtools.timeline", transferMode: "ReportEvents" },
    }),
  );
  await Bun.sleep(300);
  await run(frame, frame + WINDOW - 1);
  socket.send(JSON.stringify({ id: 2, method: "Tracing.end" }));
  await complete;
  const names = new Map<string, string>();
  for (const event of events)
    if (event.ph === "M" && event.name === "thread_name") names.set(`${event.pid}:${event.tid}`, String(event.args?.name));
  const totals = new Map<string, number>();
  for (const event of events) {
    if (event.ph !== "X" || !event.dur) continue;
    const key = `${names.get(`${event.pid}:${event.tid}`) ?? event.tid} | ${event.name}`;
    totals.set(key, (totals.get(key) ?? 0) + event.dur / 1000);
  }
  console.log(`trace of ${shot.id} f${frame}..${frame + WINDOW - 1}: ms per frame by thread | event`);
  for (const [key, ms] of [...totals].sort((a, b) => b[1] - a[1]).slice(0, 40))
    console.log(`${(ms / WINDOW).toFixed(1).padStart(8)}  ${key}`);
  socket.close();
  await browser.close({ silent: true });
}

interface PlaySample {
  frame: number;
  ms: number;
}

const percentile = (sorted: number[], share: number): number => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))] ?? 0;

function missingRuns(seen: Set<number>, start: number, end: number): string {
  const runs: string[] = [];
  let from = -1;
  for (let frame = start; frame <= end + 1; frame += 1) {
    const gone = frame <= end && !seen.has(frame);
    if (gone && from < 0) from = frame;
    if (!gone && from >= 0) {
      if (frame - from >= 3) runs.push(`${from - start}+${frame - from}`);
      from = -1;
    }
  }
  return runs.slice(0, 12).join(" ");
}

/** Plays the hero in the Player in real time and reports the interval between painted frames per shot; 16.7 ms is a perfect 60 fps. */
async function play(): Promise<void> {
  const out = await bundle({
    entryPoint: resolve("scripts/perf-player.ts"),
    webpackOverride: enableTailwind,
    ignoreRegisterRootWarning: true,
  });
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      const path = decodeURIComponent(new URL(request.url).pathname);
      const file = Bun.file(join(out, path === "/" ? "index.html" : path));
      return (await file.exists()) ? new Response(file) : new Response("missing", { status: 404 });
    },
  });
  const soft = args.includes("--soft");
  const browser = await chromium.launch({
    channel: "chromium",
    args: [
      "--mute-audio",
      "--autoplay-policy=no-user-gesture-required",
      ...(soft ? ["--disable-gpu"] : ["--use-angle=metal", "--use-gl=angle", "--ignore-gpu-blocklist", "--enable-gpu-rasterization"]),
    ],
  });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on("pageerror", (error) => console.error(`page error: ${error.message}`));
  const rate = Number(flag("throttle", "1"));
  if (rate > 1) await (await page.context().newCDPSession(page)).send("Emulation.setCPUThrottlingRate", { rate });
  await page.goto(`http://127.0.0.1:${server.port}/index.html`);
  await page.waitForFunction(() => typeof window.playRange === "function", undefined, { timeout: 120_000 });
  const gpu = await page.evaluate(() => {
    const gl = document.createElement("canvas").getContext("webgl");
    const info = gl?.getExtension("WEBGL_debug_renderer_info");
    return info && gl ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "no webgl";
  });
  console.log(`renderer: ${gpu}`);
  const all: PlaySample[] = [];
  const rows: string[] = [];
  const lead = 45;
  for (const shot of HERO.shots.filter((one) => picked(one.id))) {
    const from = Math.max(0, shot.start - lead);
    const to = shot.start + shot.frames - 1;
    const run = await page.evaluate(([a, b]) => window.playRange(a ?? 0, b ?? 0), [from, to] as const);
    const mine = run.samples.filter((sample) => sample.frame >= shot.start);
    all.push(...mine);
    const sorted = mine.map((sample) => sample.ms).sort((a, b) => a - b);
    const seen = new Set(mine.map((sample) => sample.frame));
    const shown = seen.size;
    const lost = missingRuns(seen, shot.start, shot.start + shot.frames - 1);
    rows.push(
      `${shot.id.padEnd(11)} p50 ${percentile(sorted, 0.5).toFixed(1).padStart(5)}  p95 ${percentile(sorted, 0.95).toFixed(1).padStart(5)}  max ${(sorted.at(-1) ?? 0).toFixed(0).padStart(4)}  >25ms ${String(sorted.filter((ms) => ms > 25).length).padStart(3)}  frames shown ${shown}/${shot.frames}${lost ? `  lost ${lost}` : ""}`,
    );
    process.stdout.write(".");
  }
  const sorted = all.map((sample) => sample.ms).sort((a, b) => a - b);
  console.log(`\n${rows.join("\n")}`);
  console.log(
    `overall p50 ${percentile(sorted, 0.5).toFixed(1)} ms, p95 ${percentile(sorted, 0.95).toFixed(1)} ms, p99 ${percentile(sorted, 0.99).toFixed(1)} ms, max ${(sorted.at(-1) ?? 0).toFixed(0)} ms, ${sorted.filter((ms) => ms > 25).length} of ${sorted.length} intervals over 25 ms`,
  );
  await browser.close();
  server.stop(true);
}

if (mode === "bench") await bench();
else if (mode === "play") await play();
else if (mode === "trace") await trace();
else if (mode === "stills") await stills();
else if (mode === "compare") await compare();
else console.error("usage: perf.ts bench | stills <dir> | compare <a> <b>");
