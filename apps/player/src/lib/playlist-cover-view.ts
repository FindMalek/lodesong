export type PlaylistCoverView = { kind: "loading" } | { kind: "mosaic" } | { kind: "dither" } | { kind: "image"; url: string };

export function coverView(
  covers: { playlistId: string; kind: "dither" | "image"; version: string }[] | undefined,
  id: string,
): PlaylistCoverView {
  const found = covers?.find((cover) => cover.playlistId === id);
  if (!found) return { kind: "mosaic" };
  if (found.kind === "dither") return { kind: "dither" };
  return { kind: "image", url: `/api/playlists/${encodeURIComponent(id)}/cover?v=${found.version}` };
}
