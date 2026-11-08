import type { Page } from "@playwright/test";

export type Found = { album: string; title: string };

const MIXES = ["daily mix 1", "daily mix 2", "daily mix 3", "daily mix 4", "daily mix 5", "discover weekly", "daylist"];
const HOUR = 3_600_000;

export const api = (page: Page, path: string, init?: { method?: string; body?: string }) =>
  page.evaluate(
    async ([target, options]) =>
      (await fetch(target, { ...options, headers: { "x-lodesong": "1", "content-type": "application/json" } })).json(),
    [path, init ?? {}] as const,
  );

export async function signIn(page: Page, base: string): Promise<void> {
  await page.goto(base);
  await page.getByLabel("username").fill("demo");
  await page.getByLabel("password").fill("demo");
  await page.getByRole("button", { name: "sign in" }).click();
  await page
    .getByRole("button", { name: "search" })
    .or(page.getByRole("link", { name: "albums", exact: true }))
    .first()
    .waitFor({ timeout: 30_000 });
}

async function buildIndex(page: Page): Promise<void> {
  await api(page, "/api/index", { method: "POST" });
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (!(await api(page, "/api/index")).building) return;
    await page.waitForTimeout(500);
  }
  throw new Error("search index never finished");
}

export async function findSynced(page: Page): Promise<Found> {
  const albums = (await api(page, "/rest/getAlbumList2?type=newest&size=80&f=json"))["subsonic-response"].albumList2.album;
  for (const album of albums.filter((item: { songCount: number }) => item.songCount >= 8)) {
    const full = (await api(page, `/rest/getAlbum?id=${album.id}&f=json`))["subsonic-response"].album;
    for (const song of full.song.slice(2)) {
      const lyrics = (await api(page, `/rest/getLyricsBySongId?id=${song.id}&f=json`))["subsonic-response"].lyricsList.structuredLyrics;
      if (lyrics?.[0]?.synced) return { album: album.id, title: song.title };
    }
  }
  throw new Error("no song with synced lyrics");
}

async function listen(page: Page, found: Found): Promise<void> {
  const base = Math.floor(Date.now() / HOUR) * HOUR;
  const index = (await api(page, "/rest/getArtists?f=json"))["subsonic-response"].artists.index;
  let played = 0;
  const post = async (song: unknown, offset: number): Promise<void> => {
    const body = JSON.stringify({ song, started: base - offset, listened: 200, finished: true });
    await api(page, "/api/history", { method: "POST", body });
  };
  for (const artist of index.flatMap((group: { artist: { id: string }[] }) => group.artist).slice(0, 10)) {
    const detail = (await api(page, `/rest/getArtist?id=${artist.id}&f=json`))["subsonic-response"].artist;
    const album = (await api(page, `/rest/getAlbum?id=${detail.album[0].id}&f=json`))["subsonic-response"].album;
    for (const song of album.song.slice(0, 4))
      for (let repeat = 0; repeat < 2; repeat += 1) {
        played += 1;
        await post(song, played * 900_000 + 60_000);
      }
  }
  const featured = (await api(page, `/rest/getAlbum?id=${found.album}&f=json`))["subsonic-response"].album;
  for (const song of featured.song.slice(0, 2)) await post(song, 30_000);
}

async function waitForMixes(page: Page, base: string): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    await page.goto(base);
    await page.waitForTimeout(1500);
    const names: string[] | undefined = (await api(page, "/rest/getPlaylists?f=json"))["subsonic-response"].playlists?.playlist?.map(
      (playlist: { name: string }) => playlist.name,
    );
    if (MIXES.every((name) => names?.includes(name))) return;
  }
  throw new Error(`mixes never appeared: ${MIXES.join(", ")}`);
}

export async function seed(page: Page, base: string): Promise<Found> {
  await buildIndex(page);
  const found = await findSynced(page);
  await listen(page, found);
  await waitForMixes(page, base);
  return found;
}
