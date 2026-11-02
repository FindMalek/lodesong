import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { chromium, expect, test } from "@playwright/test";
import lighthouse from "lighthouse";
import desktopConfig from "lighthouse/core/config/desktop-config.js";

const PORT = 9333;
/** Single Lighthouse runs swing by several points on shared CI machines; the median of three is what's judged. */
const RUNS = 3;

const PROFILES = [
  // Runners land the same code on 0.94 or 0.95, so 0.95 failed unrelated changes; a real regression moves it by points.
  { name: "desktop", config: desktopConfig, floor: 0.93 },
  { name: "mobile", config: undefined, floor: 0.7 },
] as const;

const METRICS = ["first-contentful-paint", "largest-contentful-paint", "total-blocking-time", "cumulative-layout-shift", "speed-index"];

for (const profile of PROFILES)
  test(`home scores ≥ ${Math.round(profile.floor * 100)} on Lighthouse performance (${profile.name}, 10k-track fixture, median of 3)`, async ({
    baseURL,
  }) => {
    test.setTimeout(240_000);
    const login = await fetch(`${baseURL}/auth/login`, {
      method: "POST",
      headers: { "x-lodesong": "1", "content-type": "application/json" },
      body: JSON.stringify({ user: "demo", password: "demo" }),
    });
    const cookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";
    const browser = await chromium.launch({ args: [`--remote-debugging-port=${PORT}`] });
    const runs: { score: number; metrics: Record<string, number> }[] = [];
    try {
      for (let run = 0; run < RUNS; run += 1) {
        const result = await lighthouse(
          `${baseURL}/`,
          { port: PORT, output: "json", logLevel: "error", onlyCategories: ["performance"], extraHeaders: { cookie } },
          profile.config,
        );
        const audits = result?.lhr.audits ?? {};
        runs.push({
          score: result?.lhr.categories.performance?.score ?? 0,
          metrics: Object.fromEntries(METRICS.map((id) => [id, Math.round(audits[id]?.numericValue ?? 0)])),
        });
        console.log([`score ${runs.at(-1)?.score}`, ...METRICS.map((id) => `${id} ${audits[id]?.displayValue ?? "?"}`)].join(" · "));
        const shifts =
          (audits["layout-shifts"]?.details as { items?: { node?: { selector?: string; snippet?: string }; score?: number }[] } | undefined)
            ?.items ?? [];
        for (const shift of shifts)
          console.log(
            `layout shift ${shift.score?.toFixed(3)}: ${shift.node?.selector ?? "?"} ${shift.node?.snippet?.slice(0, 120) ?? ""}`,
          );
      }
    } finally {
      await browser.close();
    }
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
