import { notify } from "./notify";
import { HEADERS } from "./subsonic";

export type ShareKind = "album" | "artist" | "playlist" | "song";

async function signedLink(kind: ShareKind, id: string): Promise<string> {
  const response = await fetch("/api/share", {
    method: "POST",
    headers: { ...HEADERS, "content-type": "application/json" },
    body: JSON.stringify({ kind, id }),
  });
  if (!response.ok) throw new Error("share link failed");
  const { path } = (await response.json()) as { path: string };
  return new URL(path, window.location.origin).toString();
}

/** Copies a link that unfurls with the item's details for people who aren't signed in; it opens nothing else. */
export async function copyShareLink(kind: ShareKind, id: string): Promise<void> {
  const link = signedLink(kind, id);
  // Safari only lets the clipboard be written inside the click, so it gets the pending text instead of waiting for it here.
  if (typeof ClipboardItem !== "undefined" && navigator.clipboard.write) {
    await navigator.clipboard.write([new ClipboardItem({ "text/plain": link.then((text) => new Blob([text], { type: "text/plain" })) })]);
  } else {
    await navigator.clipboard.writeText(await link);
  }
  notify({ message: "share link copied" });
}
