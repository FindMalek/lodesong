import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { chromium, expect, test } from "@playwright/test";
import lighthouse from "lighthouse";
import desktopConfig from "lighthouse/core/config/desktop-config.js";

const PORT = 9333 + Number(process.env.E2E_PORT_OFFSET ?? 0);
/** Single Lighthouse runs swing by several points on shared CI machines; the median of three is what's judged. */
const RUNS = 3;
/** A run that dies (the browser closed under it, no paint) is thrown away and tried again, not counted as a zero. */
const ATTEMPTS = RUNS * 2;

const PROFILES = [
  // Runners land the same code on 0.94 or 0.95, so 0.95 failed unrelated changes; a real regression moves it by points.
  { name: "desktop", config: desktopConfig, floor: 0.93, port: PORT },
  { name: "mobile", config: undefined, floor: 0.7, port: PORT + 1 },
] as const;

const METRICS = ["first-contentful-paint", "largest-contentful-paint", "total-blocking-time", "cumulative-layout-shift", "speed-index"];

for (const profile of PROFILES)
  test(`home scores ≥ ${Math.round(profile.floor * 100)} on Lighthouse performance (${profile.name}, 10k-track fixture, median of 3)`, async ({
    baseURL,
  }) => {
    test.setTimeout(420_000);
    const login = await fetch(`${baseURL}/auth/login`, {
      method: "POST",
      headers: { "x-lodesong": "1", "content-type": "application/json" },
      body: JSON.stringify({ user: "demo", password: "demo" }),
    });
    const cookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";
    const runs: { score: number; metrics: Record<string, number> }[] = [];
    for (let attempt = 0; attempt < ATTEMPTS && runs.length < RUNS; attempt += 1) {
      const browser = await chromium.launch({ args: [`--remote-debugging-port=${profile.port}`] });
      try {
        const result = await lighthouse(
          `${baseURL}/`,
          { port: profile.port, output: "json", logLevel: "error", onlyCategories: ["performance"], extraHeaders: { cookie } },
          profile.config,
        );
        const score = result?.lhr.categories.performance?.score;
        const audits = result?.lhr.audits ?? {};
        if (!score || result?.lhr.runtimeError) {
          console.log(`run ${attempt + 1} gave no score (${result?.lhr.runtimeError?.code ?? "none"}), trying again`);
          continue;
        }
        runs.push({ score, metrics: Object.fromEntries(METRICS.map((id) => [id, Math.round(audits[id]?.numericValue ?? 0)])) });
        console.log([`score ${score}`, ...METRICS.map((id) => `${id} ${audits[id]?.displayValue ?? "?"}`)].join(" · "));
        const shifts =
          (audits["layout-shifts"]?.details as { items?: { node?: { selector?: string; snippet?: string }; score?: number }[] } | undefined)
            ?.items ?? [];
        for (const shift of shifts)
          console.log(
            `layout shift ${shift.score?.toFixed(3)}: ${shift.node?.selector ?? "?"} ${shift.node?.snippet?.slice(0, 120) ?? ""}`,
          );
      } catch (error) {
        console.log(`run ${attempt + 1} failed (${error instanceof Error ? error.name : "error"}), trying again`);
      } finally {
        await browser.close();
      }
    }
    expect(runs.length, `${profile.name}: only ${runs.length} of ${RUNS} runs gave a score in ${ATTEMPTS} tries`).toBe(RUNS);
    const median = [...runs].sort((a, b) => a.score - b.score)[Math.floor(RUNS / 2)] ?? { score: 0, metrics: {} };
    if (process.env.GITHUB_STEP_SUMMARY)
      appendFileSync(
        process.env.GITHUB_STEP_SUMMARY,
        `### lighthouse ${profile.name} (median of ${RUNS})\n\nscore ${median.score}\n\n| metric | ms |\n|---|---|\n${METRICS.map((id) => `| ${id} | ${median.metrics[id]} |`).join("\n")}\n\n`,
      );
    mkdirSync("perf-trend", { recursive: true });
    writeFileSync(`perf-trend/lighthouse-${profile.name}.json`, `${JSON.stringify({ profile: profile.name, ...median }, null, 2)}\n`);
    expect(median.score).toBeGreaterThanOrEqual(profile.floor);
  });
