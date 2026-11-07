import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export type ShareKind = "album" | "artist" | "playlist" | "song";
export const SHARE_KINDS: readonly ShareKind[] = ["album", "artist", "playlist", "song"];

/** A page token unlocks the link's tags and image; an image token only the image. */
type Scope = "page" | "image";

const DAY_MS = 86_400_000;
const SHAPE = /^([0-9a-z]{1,9})\.([A-Za-z0-9_-]{24})$/;

/** Signed, expiring grants for one item: the secret never leaves the server and a token carries no library data. */
export class ShareTokens {
  private readonly key: Buffer;

  constructor(
    secret: string,
    private readonly now: () => number = Date.now,
    private readonly lifeMs: number = 180 * DAY_MS,
  ) {
    this.key = createHash("sha256").update(`lodesong:share:${secret}`).digest();
  }

  private mac(scope: Scope, kind: ShareKind, id: string, expires: string): Buffer {
    return createHmac("sha256", this.key).update(`${scope}\n${kind}\n${id}\n${expires}`).digest().subarray(0, 18);
  }

  sign(kind: ShareKind, id: string, scope: Scope = "page"): string {
    const expires = Math.floor((this.now() + this.lifeMs) / 1000).toString(36);
    return `${expires}.${this.mac(scope, kind, id, expires).toString("base64url")}`;
  }

  verify(token: string | null | undefined, kind: ShareKind, id: string, scope: Scope): boolean {
    const parts = token ? SHAPE.exec(token) : null;
    if (!parts) return false;
    const [, expires = "", given = ""] = parts;
    if (Number.parseInt(expires, 36) * 1000 < this.now()) return false;
    const have = Buffer.from(given, "base64url");
    const matches = (allowed: Scope): boolean => timingSafeEqual(have, this.mac(allowed, kind, id, expires));
    const page = matches("page");
    const image = matches("image");
    return scope === "image" ? page || image : page;
  }
}
