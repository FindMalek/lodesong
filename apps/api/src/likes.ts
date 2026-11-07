/** The ids in a `getStarred2` answer; an entry that isn't an object with a string id is skipped. */
export function likedIds(starred2: unknown): Set<string> {
  if (!starred2 || typeof starred2 !== "object") return new Set();
  const items = Object.values(starred2).flat() as ({ id?: unknown } | null)[];
  return new Set(items.flatMap((item) => (typeof item?.id === "string" ? [item.id] : [])));
}

/** Part of a cache key: the same likes always give the same text. */
export function likesKey(liked: Set<string> | null): string {
  return liked ? Bun.hash([...liked].sort().join("\u0000")).toString(36) : "unknown";
}
