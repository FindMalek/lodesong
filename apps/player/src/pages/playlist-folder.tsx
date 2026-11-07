import { Button } from "@lodesong/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import { FolderPlusIcon, ListMusicIcon, PencilIcon } from "lucide-react";
import { useState } from "react";
import { FolderCover } from "@/components/folder-cover";
import { Content, EmptyState, PageHeader, Section } from "@/components/library";
import { Link } from "@/components/link";
import { endDrag, startDrag } from "@/lib/drag";
import { folderDrop } from "@/lib/folder-drop";
import { findFolder, pathTo } from "@/lib/folder-find";
import { shownName } from "@/lib/folder-tree";
import { plural } from "@/lib/format";
import { openPlaylistDialog } from "@/lib/playlist-dialogs";
import { foldersQuery, usePlaylistTree } from "@/lib/playlist-folders";

const DROP = "data-drop-target:bg-card data-drop-target:outline data-drop-target:outline-foreground";

/** A folder of playlists: its cover (an uploaded picture or its aura), the folders inside it, and the playlists in it. */
export function PlaylistFolderPage({ id }: { id: string }) {
  const loaded = useQuery(foldersQuery());
  const tree = usePlaylistTree();
  const [drop, setDrop] = useState<string | null>(null);
  const folder = findFolder(tree, id);
  if (!folder)
    return (
      <>
        <PageHeader title="folder" />
        <Content>
          {loaded.isError ? (
            <EmptyState>
              couldn't load your folders
              <Button variant="outline" size="sm" className="ml-3" onClick={() => loaded.refetch()}>
                try again
              </Button>
            </EmptyState>
          ) : (
            <EmptyState>{loaded.isPending ? "loading…" : "that folder isn't here any more"}</EmptyState>
          )}
        </Content>
      </>
    );
  const trail = pathTo(tree, id);
  const chain = trail.map((step) => step.name);
  const parent = trail.at(-2);
  return (
    <>
      <PageHeader title={chain.join(" / ")} meta={plural(folder.playlists.length, "playlist")}>
        <Button variant="outline" size="sm" onClick={() => openPlaylistDialog({ kind: "folder-new", parentId: id })}>
          <FolderPlusIcon />
          new folder in here
        </Button>
        <Button variant="outline" size="sm" onClick={() => openPlaylistDialog({ kind: "folder-edit", id })}>
          <PencilIcon />
          edit
        </Button>
      </PageHeader>
      <Content>
        <div className="flex flex-wrap items-end gap-4">
          <FolderCover id={id} cover={folder.cover} className="size-40 shrink-0" />
          <div
            data-drop-target={drop === (parent?.id ?? "root") || undefined}
            className={`flex items-center gap-2 px-2 py-1 font-mono text-muted-foreground text-xs ${DROP}`}
            {...folderDrop(parent?.id ?? null, setDrop)}
          >
            {parent ? <Link href={`/playlist-folder/${parent.id}`}>up to {parent.name}</Link> : "top level"}
            <span className="text-faint">· drop a playlist here to move it up</span>
          </div>
        </div>
      </Content>
      {folder.folders.length > 0 && (
        <Section title="folders">
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-3">
            {folder.folders.map((child) => (
              <li
                key={child.key}
                data-drop-target={(child.id && drop === child.id) || undefined}
                className={DROP}
                {...(child.id ? folderDrop(child.id, setDrop) : {})}
              >
                {child.id ? (
                  <Link href={`/playlist-folder/${child.id}`} className="flex items-center gap-3 p-1.5">
                    <FolderCover id={child.id} cover={child.cover} className="size-12 shrink-0" />
                    <span className="truncate font-mono text-sm">{child.name}</span>
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        </Section>
      )}
      <Section title="playlists">
        {folder.playlists.length === 0 ? (
          <EmptyState>drag playlists here from the sidebar</EmptyState>
        ) : (
          <ul>
            {folder.playlists.map((playlist) => (
              <li key={playlist.id} className="border-b last:border-b-0">
                <Link
                  href={`/playlist/${playlist.id}`}
                  className="flex items-center gap-3 py-1.5 hover:bg-card"
                  onDragStart={(event) => startDrag(event, { kind: "playlist", playlist })}
                  onDragEnd={endDrag}
                >
                  <ListMusicIcon className="size-4 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-sm">{shownName(playlist, chain)}</span>
                  <span className="font-mono text-faint text-xs">{plural(playlist.songCount, "song")}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
