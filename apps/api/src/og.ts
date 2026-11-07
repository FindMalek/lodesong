import { Busy, CardImages, type Drawn, pictureUri, rasterize } from "./card-image";
import { cardSvg } from "./card-svg";
import { clean } from "./card-text";
import type { Upstream } from "./config";
import type { CoverCache } from "./covers";
import { type CardData, cardOf, type Entity, GENERIC_TEXT, ID, textOf } from "./share-card";
import type { SharedCards } from "./share-store";
import type { ShareKind, ShareTokens } from "./share-token";
import { type Credentials, subsonic, upstreamQuery } from "./subsonic";

export type { ShareKind };

export interface Access {
  session: Credentials;
  upstream: Upstream;
}

type Loader = (cover: string, size: number) => Promise<Uint8Array | null>;

export type Created = { path: string; share: string } | "missing" | "full";

const ENDPOINT = { album: "getAlbum", artist: "getArtist", playlist: "getPlaylist", song: "getSong" } as const;
// The page waits on this lookup, so a slow Navidrome must not hold up the app.
const LOOKUP_MS = 2000;
const ONE_DAY = "public, max-age=86400";
const ONE_HOUR = "public, max-age=3600";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

function tags(shown: { title: string; description: string }, image: string, url?: string): string {
  const title = clean(shown.title, 100);
  const description = clean(shown.description, 200);
  const pairs: [string, string, string][] = [
    ["property", "og:site_name", "lodesong"],
    ["property", "og:type", "website"],
    ["property", "og:title", title],
    ["property", "og:description", description],
    ["property", "og:image", image],
    ["property", "og:image:type", "image/jpeg"],
    ["property", "og:image:width", "1200"],
    ["property", "og:image:height", "630"],
    ["property", "og:image:alt", title],
    ["name", "twitter:card", "summary_large_image"],
    ["name", "twitter:title", title],
    ["name", "twitter:description", description],
    ["name", "twitter:image", image],
  ];
  if (url) pairs.splice(2, 0, ["property", "og:url", url]);
  return pairs.map(([attribute, name, value]) => `<meta ${attribute}="${name}" content="${escapeHtml(value)}" />`).join("\n    ");
}

interface ShareOptions {
  upstreams: Upstream[];
  covers: CoverCache;
  tokens: ShareTokens;
  cards: SharedCards;
  origin: (request: Request) => string;
  credentials: (server: string, user: string) => Credentials | null;
}

/** Link previews: the player's own links say nothing about the library unless the viewer is signed in or holds a signed link. */
export class ShareCards {
  private readonly images = new CardImages();

  constructor(private readonly options: ShareOptions) {}

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

  private async draw(card: CardData | null, load: Loader): Promise<Drawn> {
    const size = (card?.covers.length ?? 0) > 1 ? 256 : 512;
    const found = await Promise.all((card?.covers ?? []).map((cover) => load(cover, size)));
    const covers = found.filter((bytes): bytes is Uint8Array => !!bytes);
    const images = (await Promise.all(covers.map((bytes) => pictureUri(bytes)))).filter((uri): uri is string => !!uri);
    const backdrop = covers[0] ? await pictureUri(covers[0], 5) : null;
    const bytes = await rasterize(await cardSvg(card, images, backdrop ?? undefined));
    return { bytes, complete: images.length === (card?.covers.length ?? 0) };
  }

  private shared(request: Request, kind: ShareKind, id: string, scope: "page" | "image") {
    if (!ID.test(id)) return null;
    const share = this.options.tokens.verify(new URL(request.url).searchParams.get("s"), kind, id, scope);
    const found = share ? this.options.cards.find(share) : null;
    return found;
  }

  async tags(request: Request, kind: ShareKind, id: string, access: Access | null): Promise<string> {
    const base = this.options.origin(request);
    const { tokens } = this.options;
    if (access) {
      const card = await this.lookup(kind, id, access);
      if (card) return tags(textOf(card), `${base}/og/${kind}/${id}.jpg`, base + new URL(request.url).pathname);
    } else {
      const shared = this.shared(request, kind, id, "page");
      // No og:url: a canonical address without the token would send crawlers to the generic card.
      if (shared) return tags(textOf(shared.card), `${base}/og/${kind}/${id}.jpg?s=${tokens.sign(kind, id, shared.id, "image")}`);
    }
    return tags(GENERIC_TEXT, `${base}/og.jpg`, base + new URL(request.url).pathname);
  }

  async image(request: Request, kind: ShareKind, id: string, access: Access | null): Promise<Response> {
    let card: CardData | null = null;
    let server = "";
    let load: Loader = this.loader("", null);
    let cache = ONE_DAY;
    if (access) {
      card = await this.lookup(kind, id, access);
      server = access.upstream.id;
      load = this.loader(server, access);
      cache = "private, max-age=300";
    } else {
      const shared = this.shared(request, kind, id, "image");
      if (shared) {
        const upstream = this.options.upstreams.find((item) => item.id === shared.server);
        const session = this.options.credentials(shared.server, shared.user);
        card = shared.card;
        server = shared.server;
        load = this.loader(server, upstream && session ? { upstream, session } : null);
        cache = ONE_HOUR;
      }
    }
    const headers = { "content-type": "image/jpeg", vary: "cookie", "x-content-type-options": "nosniff" };
    try {
      const drawn = await this.images.get(card ? `${server}\n${JSON.stringify(card)}` : "generic", () => this.draw(card, load));
      return new Response(drawn.bytes as Uint8Array<ArrayBuffer>, {
        headers: { ...headers, "cache-control": drawn.complete ? cache : "private, no-store" },
      });
    } catch (error) {
      if (!(error instanceof Busy)) throw error;
      return new Response(null, { status: 503, headers: { "retry-after": "5", "cache-control": "no-store", vary: "cookie" } });
    }
  }

  async create(access: Access, kind: ShareKind, id: string): Promise<Created> {
    const card = await this.lookup(kind, id, access);
    if (!card) return "missing";
    const saved = this.options.cards.save({ server: access.upstream.id, user: access.session.user }, kind, id, card);
    if (!saved) return "full";
    return { share: saved.id, path: `/${kind}/${encodeURIComponent(id)}?s=${this.options.tokens.sign(kind, id, saved.id)}` };
  }
}
