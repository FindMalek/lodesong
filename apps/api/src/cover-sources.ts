import { CANDIDATE_ID, type CoverCandidate } from "@lodesong/shared/cover-candidates";
import { gate } from "./covers";
import { type Cover, readCover } from "./folder-cover";
import type { MusicBrainz } from "./releases";

// Only the server talks to these hosts, with urls built from ids (the browser never sends one).

const OVERRIDE_BYTES = 400_000;
const THUMB_BYTES = 60_000;
const SOURCE_TIMEOUT_MS = 8_000;
const MAX_HOPS = 3;
const MAX_CANDIDATES = 8;
const IMAGE_HOSTS = /(^|\.)(coverartarchive\.org|archive\.org|dzcdn\.net)$/;
const IMAGE_TYPE = /^image\/(jpeg|png|webp)\s*(;|$)/;

interface DeezerHit {
  id: number;
  title?: string;
  name?: string;
  artist?: { name?: string };
  cover_medium?: string;
  cover_big?: string;
  cover_xl?: string;
  picture_medium?: string;
  picture_big?: string;
  picture_xl?: string;
}

export type CoverKind = "album" | "artist";

export class CoverSources {
  private readonly slot = gate(4);
  private readonly bases: URL[];

  constructor(
    private readonly options: { musicbrainz: MusicBrainz | null; archiveUrl: string; deezerUrl: string; fetcher?: typeof fetch },
  ) {
    this.bases = [options.archiveUrl, options.deezerUrl].filter(Boolean).map((base) => new URL(base));
  }

  get enabled(): boolean {
    return this.bases.length > 0;
  }

  /** https on a known image host, or a source the operator configured. */
  allowed(url: URL): boolean {
    if (url.username || url.password) return false;
    if (this.bases.some((base) => base.origin === url.origin)) return true;
    return url.protocol === "https:" && !url.port && IMAGE_HOSTS.test(url.hostname);
  }

  /** Redirects are followed by hand so each hop is checked: Cover Art Archive hands off to archive.org. */
  private async fetchAllowed(start: URL, accept: string): Promise<Response | null> {
    const fetcher = this.options.fetcher ?? fetch;
    let target = start;
    for (let hop = 0; hop <= MAX_HOPS; hop++) {
      if (!this.allowed(target)) return null;
      const response = await fetcher(target, {
        redirect: "manual",
        signal: AbortSignal.timeout(SOURCE_TIMEOUT_MS),
        headers: { accept, "user-agent": "lodesong ( https://github.com/FindMalek/lodesong )" },
      }).catch(() => null);
      if (!response) return null;
      if (response.status >= 300 && response.status < 400) {
        const next = response.headers.get("location");
        await response.body?.cancel().catch(() => undefined);
        if (!next) return null;
        try {
          target = new URL(next, target);
        } catch {
          return null;
        }
        continue;
      }
      return response.ok ? response : null;
    }
    return null;
  }

  private async json<T>(url: URL): Promise<T | null> {
    const response = await this.fetchAllowed(url, "application/json");
    return response ? ((await response.json().catch(() => null)) as T | null) : null;
  }

  private async image(url: string | URL | undefined, max: number): Promise<string | null> {
    if (!url) return null;
    let target: URL;
    try {
      target = new URL(url);
    } catch {
      return null;
    }
    const response = await this.slot(() => this.fetchAllowed(target, "image/*"));
    const type = response?.headers.get("content-type") ?? "";
    if (!response?.body || !IMAGE_TYPE.test(type)) return null;
    const declared = Number(response.headers.get("content-length"));
    if (declared > max) return null;
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > max) {
          await reader.cancel();
          return null;
        }
        chunks.push(value);
      }
    } catch {
      return null;
    }
    return `data:${type.split(";")[0]};base64,${Buffer.concat(chunks).toString("base64")}`;
  }

  async candidates(kind: CoverKind, name: string, artist: string): Promise<CoverCandidate[]> {
    const [archive, deezer] = await Promise.all([
      kind === "album" ? this.archiveCandidates(name, artist) : [],
      this.deezerCandidates(kind, name, artist),
    ]);
    return [...archive.slice(0, deezer.length ? 5 : MAX_CANDIDATES), ...deezer].slice(0, MAX_CANDIDATES);
  }

  private async archiveCandidates(album: string, artist: string): Promise<CoverCandidate[]> {
    const { musicbrainz, archiveUrl } = this.options;
    if (!musicbrainz || !archiveUrl) return [];
    const groups = (await musicbrainz.searchReleaseGroups(album, artist)) ?? [];
    const found = await Promise.all(
      groups.slice(0, 6).map(async (group): Promise<CoverCandidate | null> => {
        const thumb = await this.image(`${archiveUrl}/release-group/${group.id}/front-250`, THUMB_BYTES);
        return thumb ? { id: `archive:${group.id}`, source: "archive", title: group.label, size: 500, thumb } : null;
      }),
    );
    return found.filter((item) => item !== null);
  }

  private async deezerCandidates(kind: CoverKind, name: string, artist: string): Promise<CoverCandidate[]> {
    const base = this.options.deezerUrl;
    if (!base) return [];
    const query = kind === "album" ? `artist:"${artist.replace(/"/g, " ")}" album:"${name.replace(/"/g, " ")}"` : name;
    const answer = await this.json<{ data?: DeezerHit[] }>(
      new URL(`${base}/search/${kind}?${new URLSearchParams({ q: query, limit: "4" })}`),
    );
    const found = await Promise.all(
      (answer?.data ?? []).slice(0, 4).map(async (hit): Promise<CoverCandidate | null> => {
        if (!Number.isSafeInteger(hit.id)) return null;
        const thumb = await this.image(hit.cover_medium ?? hit.picture_medium, THUMB_BYTES);
        const title = kind === "album" ? `${hit.title ?? name} - ${hit.artist?.name ?? artist}` : (hit.name ?? name);
        return thumb
          ? {
              id: kind === "album" ? `deezer:${hit.id}` : `deezer-artist:${hit.id}`,
              source: "deezer",
              title: title.slice(0, 120),
              size: 1000,
              thumb,
            }
          : null;
      }),
    );
    return found.filter((item) => item !== null);
  }

  async pick(id: string): Promise<Cover | null> {
    if (!CANDIDATE_ID.test(id)) return null;
    const { archiveUrl, deezerUrl } = this.options;
    const [source, ref = ""] = id.split(":");
    if (source === "archive") {
      if (!archiveUrl) return null;
      const data = await this.image(`${archiveUrl}/release-group/${ref}/front-500`, OVERRIDE_BYTES);
      return data ? readCover(data, OVERRIDE_BYTES) : null;
    }
    if (!deezerUrl) return null;
    const kind = source === "deezer-artist" ? "artist" : "album";
    const hit = await this.json<DeezerHit>(new URL(`${deezerUrl}/${kind}/${ref}`));
    for (const url of [hit?.cover_xl ?? hit?.picture_xl, hit?.cover_big ?? hit?.picture_big]) {
      const data = await this.image(url, OVERRIDE_BYTES);
      const cover = data ? await readCover(data, OVERRIDE_BYTES) : null;
      if (cover) return cover;
    }
    return null;
  }
}
