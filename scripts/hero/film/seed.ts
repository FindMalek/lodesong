import type { Page } from "@playwright/test";
import { api, type Found, findSynced } from "../seed";

const HOUR = 3_600_000;
const ARTISTS = 24;
const REQUIRED = ["daily mix 1", "daily mix 2", "daily mix 3", "discover weekly", "daylist"];

async function buildIndex(page: Page): Promise<void> {
  await api(page, "/api/index", { method: "POST" });
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (!(await api(page, "/api/index")).building) return;
    await page.waitForTimeout(500);
  }
  throw new Error("search index never finished");
}

/** The hero's listening history, over more artists and ending just now, so the mixes exist at any hour of the day. */
async function listen(page: Page, found: Found): Promise<void> {
  const base = Math.floor(Date.now() / HOUR) * HOUR;
  const index = (await api(page, "/rest/getArtists?f=json"))["subsonic-response"].artists.index;
  let played = 0;
  const post = async (song: unknown, offset: number): Promise<void> => {
    const body = JSON.stringify({ song, started: base - offset, listened: 200, finished: true });
    await api(page, "/api/history", { method: "POST", body });
  };
  for (const artist of index.flatMap((group: { artist: { id: string }[] }) => group.artist).slice(0, ARTISTS)) {
    const detail = (await api(page, `/rest/getArtist?id=${artist.id}&f=json`))["subsonic-response"].artist;
    const album = (await api(page, `/rest/getAlbum?id=${detail.album[0].id}&f=json`))["subsonic-response"].album;
    for (const song of album.song.slice(0, 4))
      for (let repeat = 0; repeat < 2; repeat += 1) {
        played += 1;
        await post(song, played * 300_000 + 60_000);
      }
  }
  const featured = (await api(page, `/rest/getAlbum?id=${found.album}&f=json`))["subsonic-response"].album;
  for (const song of featured.song.slice(0, 2)) await post(song, 30_000);
}

async function waitForMixes(page: Page, base: string): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await page.goto(base);
    await page.waitForTimeout(1500);
    const names: string[] | undefined = (await api(page, "/rest/getPlaylists?f=json"))["subsonic-response"].playlists?.playlist?.map(
      (playlist: { name: string }) => playlist.name,
    );
    if (REQUIRED.every((name) => names?.includes(name))) return;
  }
  throw new Error(`mixes never appeared: ${REQUIRED.join(", ")}`);
}

/**
 * The hero seed with two changes: it does not insist on a fifth daily mix (how many exist depends on the day), and
 * its plays are packed into the last two hours.
 */
export async function filmSeed(page: Page, base: string): Promise<Found> {
  await buildIndex(page);
  const found = await findSynced(page);
  await listen(page, found);
  await waitForMixes(page, base);
  return found;
}
