import type { Page } from "@playwright/test";
import { api } from "../seed";

const WARM = 900;
const WARM_BATCH = 30;

/** Lyric search only knows songs whose lyrics the server has fetched once, and the backfill is off: ask for them all. */
async function warmLyrics(page: Page): Promise<void> {
  for (let from = 0; from < WARM; from += WARM_BATCH)
    await page.evaluate(
      ([first, count]) =>
        Promise.all(
          Array.from({ length: count }, (_, at) =>
            fetch(`/api/lyrics/so-${first + at}`, { headers: { "x-lodesong": "1" } }).then((r) => r.text()),
          ),
        ),
      [from, WARM_BATCH] as const,
    );
}

const DAY = 86_400_000;
const LAST_YEAR = 8;

/** "On this day" is what you played around this date a year ago, so put a few plays there. */
async function playedLastYear(page: Page): Promise<void> {
  for (let at = 0; at < LAST_YEAR; at += 1) {
    const song = (await api(page, `/rest/getSong?id=so-${40 + at}&f=json`))["subsonic-response"].song;
    const body = JSON.stringify({ song, started: Date.now() - 365 * DAY + at * 600_000, listened: 200, finished: true });
    await api(page, "/api/history", { method: "POST", body });
  }
}

const LIKED = 18;
const LIKED_STEP = 7;

/** State the seed leaves out: lyrics for the search index, and some liked songs so that page is not empty. */
export async function prepare(page: Page): Promise<void> {
  await warmLyrics(page);
  await playedLastYear(page);
  for (let at = 0; at < LIKED; at += 1) await api(page, `/rest/star?id=so-${3 + at * LIKED_STEP}&f=json`);
}
