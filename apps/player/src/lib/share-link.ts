import { notify } from "./notify";
import { HEADERS } from "./subsonic";

export type ShareKind = "album" | "artist" | "playlist" | "song";

class ShareError extends Error {}

async function signedLink(kind: ShareKind, id: string): Promise<{ url: string; share: string }> {
  const response = await fetch("/api/share", {
    method: "POST",
    headers: { ...HEADERS, "content-type": "application/json" },
    body: JSON.stringify({ kind, id }),
  });
  const body = (await response.json().catch(() => null)) as { path?: string; share?: string; error?: string } | null;
  if (!response.ok || !body?.path || !body.share) throw new ShareError(body?.error ?? "share link failed");
  return { url: new URL(body.path, window.location.origin).toString(), share: body.share };
}

async function stopSharing(share: string): Promise<void> {
  const response = await fetch(`/api/share/${share}`, { method: "DELETE", headers: HEADERS }).catch(() => null);
  notify(response?.ok ? { message: "share link stopped" } : { kind: "error", message: "that didn't work, try again" });
}

async function writeLink(link: Promise<string>): Promise<void> {
  // Safari only lets the clipboard be written inside the click, so it gets the pending text instead of waiting for it here.
  if (navigator.clipboard && typeof ClipboardItem !== "undefined" && navigator.clipboard.write) {
    await navigator.clipboard.write([new ClipboardItem({ "text/plain": link.then((text) => new Blob([text], { type: "text/plain" })) })]);
  } else if (navigator.clipboard) {
    await navigator.clipboard.writeText(await link);
  } else {
    // Plain http (a LAN address) has no clipboard: show the link to copy by hand.
    window.prompt("copy this link", await link);
  }
}

/** Copies a link that unfurls with the item's details for people who aren't signed in; it opens nothing else. */
export async function copyShareLink(kind: ShareKind, id: string): Promise<void> {
  let share = "";
  const link = signedLink(kind, id).then((made) => {
    share = made.share;
    return made.url;
  });
  try {
    await writeLink(link);
  } catch (error) {
    const failed = await link.then(
      () => null,
      (reason: unknown) => reason,
    );
    if (!failed) throw error;
    notify({ kind: "error", message: failed instanceof ShareError ? failed.message : "that didn't work, try again" });
    return;
  }
  notify({ message: "share link copied", action: { label: "stop sharing", onClick: () => void stopSharing(share) } });
}
