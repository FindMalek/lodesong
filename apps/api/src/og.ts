import { layoutOf } from "./card-layout";
import { CardImages, pictureUri, rasterize } from "./card-png";
import { cardSvg } from "./card-svg";
import type { Upstream } from "./config";
import type { CoverCache } from "./covers";
import type { Session } from "./sessions";
import { type CardData, cardOf, type Entity, GENERIC_TEXT, ID, textOf } from "./share-card";
import type { SharedCards } from "./share-store";
import type { ShareKind, ShareTokens } from "./share-token";
import { subsonic, upstreamQuery } from "./subsonic";

export type { ShareKind };

export interface Access {
  session: Session;
  upstream: Upstream;
}

type Loader = (cover: string, size: number) => Promise<Uint8Array | null>;

const ENDPOINT = { album: "getAlbum", artist: "getArtist", playlist: "getPlaylist", song: "getSong" } as const;
// The page waits on this lookup, so a slow Navidrome must not hold up the app.
const LOOKUP_MS = 2000;
const ONE_DAY = "public, max-age=86400";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

function origin(request: Request): string {
  const url = new URL(request.url);
  return request.headers.get("x-forwarded-proto") === "https" ? `https://${url.host}` : url.origin;
}

function tags(shown: { title: string; description: string }, image: string, url?: string): string {
  const pairs: [string, string, string][] = [
    ["property", "og:site_name", "lodesong"],
    ["property", "og:type", "website"],
    ["property", "og:title", shown.title],
    ["property", "og:description", shown.description],
    ["property", "og:image", image],
    ["property", "og:image:width", "1200"],
    ["property", "og:image:height", "630"],
    ["property", "og:image:alt", shown.title],
    ["name", "twitter:card", "summary_large_image"],
    ["name", "twitter:title", shown.title],
    ["name", "twitter:description", shown.description],
    ["name", "twitter:image", image],
  ];
  if (url) pairs.splice(2, 0, ["property", "og:url", url]);
  return pairs.map(([attribute, name, value]) => `<meta ${attribute}="${name}" content="${escapeHtml(value)}" />`).join("\n    ");
}

/** Link previews: the player's own links say nothing about the library unless the viewer is signed in or holds a signed link. */
export class ShareCards {
  private readonly images = new CardImages();

  constructor(private readonly options: { upstreams: Upstream[]; covers: CoverCache; tokens: ShareTokens; cards: SharedCards }) {}

  private async lookup(kind: ShareKind, id: string, access: Access): Promise<CardData | null> {
    if (!ID.test(id)) return null;
    const asked = subsonic<Partial<Record<ShareKind, Entity>>>(access.upstream, access.session, ENDPOINT[kind], { id });
    const result = await Promise.race([asked, Bun.sleep(LOOKUP_MS).then(() => null)]);
    const entity = result?.[kind];
    return entity ? cardOf(kind, entity) : null;
  }

  private loader(server: string, access: Access | null): Loader {
    return async (cover, size) => {
      const path = await this.options.covers.get(
        `${server}:${cover}`,
        size,
        async (id, wanted) => {
          if (!access) return null;
          const query = upstreamQuery(access.session);
          query.set("id", id);
          query.set("size", String(wanted));
          return fetch(`${access.upstream.url}/rest/getCoverArt?${query}`, { signal: AbortSignal.timeout(LOOKUP_MS * 4) }).catch(
            () => null,
          );
        },
        cover,
      );
      return path ? new Uint8Array(await Bun.file(path).arrayBuffer()) : null;
    };
  }

  private async draw(card: CardData | null, load: Loader): Promise<Uint8Array> {
    const size = (card?.covers.length ?? 0) > 1 ? 256 : 512;
    const found = await Promise.all((card?.covers ?? []).map((cover) => load(cover, size)));
    const covers = found.filter((bytes): bytes is Uint8Array => !!bytes);
    const images = (await Promise.all(covers.map((bytes) => pictureUri(bytes)))).filter((uri): uri is string => !!uri);
    const backdrop = covers[0] ? await pictureUri(covers[0], 5) : null;
    return rasterize(await cardSvg(card ? layoutOf(card) : null, images, backdrop ?? undefined));
  }

  async tags(request: Request, kind: ShareKind, id: string, access: Access | null): Promise<string> {
    const base = origin(request);
    const { tokens, cards } = this.options;
    if (access) {
      const card = await this.lookup(kind, id, access);
      if (card) return tags(textOf(card), `${base}/og/${kind}/${id}.png`, base + new URL(request.url).pathname);
    } else if (ID.test(id) && tokens.verify(new URL(request.url).searchParams.get("s"), kind, id, "page")) {
      const shared = cards.find(kind, id);
      // No og:url: a canonical address without the token would send crawlers to the generic card.
      if (shared) return tags(textOf(shared.card), `${base}/og/${kind}/${id}.png?s=${tokens.sign(kind, id, "image")}`);
    }
    return tags(GENERIC_TEXT, `${base}/og.png`, base + new URL(request.url).pathname);
  }

  async image(request: Request, kind: ShareKind, id: string, access: Access | null): Promise<Response> {
    const { tokens, cards } = this.options;
    let card: CardData | null = null;
    let load: Loader = this.loader("", null);
    let cache = ONE_DAY;
    if (access) {
      card = await this.lookup(kind, id, access);
      load = this.loader(access.upstream.id, access);
      cache = "private, max-age=300";
    } else if (ID.test(id) && tokens.verify(new URL(request.url).searchParams.get("s"), kind, id, "image")) {
      const shared = cards.find(kind, id);
      if (shared) {
        card = shared.card;
        load = this.loader(shared.server, null);
      }
    }
    const bytes = await this.images.get(card ? JSON.stringify(card) : "generic", () => this.draw(card, load));
    return new Response(bytes as Uint8Array<ArrayBuffer>, {
      headers: { "content-type": "image/png", "cache-control": cache, "x-content-type-options": "nosniff" },
    });
  }

  async create(access: Access, kind: ShareKind, id: string): Promise<string | null> {
    const card = await this.lookup(kind, id, access);
    if (!card) return null;
    this.options.cards.save(access.upstream.id, kind, id, card);
    const load = this.loader(access.upstream.id, access);
    const size = card.covers.length > 1 ? 256 : 512;
    await Promise.all(card.covers.map((cover) => load(cover, size)));
    return `/${kind}/${encodeURIComponent(id)}?s=${this.options.tokens.sign(kind, id)}`;
  }
}
