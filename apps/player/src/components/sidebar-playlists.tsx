import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@lodesong/ui/components/collapsible";
import { useQuery } from "@tanstack/react-query";
import { ChevronRightIcon, EllipsisIcon, FolderIcon, ListMusicIcon } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { SidebarMenu, SidebarMenuItem, SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem } from "@/components/ui/sidebar";
import { current as currentDrag, dropFailed, dropSongs, endDrag, leftTarget, startDrag } from "@/lib/drag";
import { folderDrop, legacyDrop } from "@/lib/folder-drop";
import { type FolderNode, shownName } from "@/lib/folder-tree";
import { usePlayer } from "@/lib/player";
import { openPlaylistDialog } from "@/lib/playlist-dialogs";
import { useFoldersSettled, useOpenFolders, usePlaylistTree } from "@/lib/playlist-folders";
import { queries } from "@/lib/queries";
import { useUser } from "@/lib/subsonic";
import type { Playlist } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Equalizer } from "./equalizer";
import { Link } from "./link";

const PointMenu = lazy(() => import("./item-menu").then((module) => ({ default: module.PointMenu })));

const playlistPrefix = (key: string) => key.replace(/^\//, "").split("/").join(" / ");

interface TreeProps {
  node: FolderNode;
  chain: string[];
  path: string;
  dropId: string | null;
  dropFolder: string | null;
  setDropFolder: (id: string | null) => void;
  open: Set<string>;
  toggle: (key: string, open: boolean) => void;
}

function SubTree({ node, chain, path, dropId, dropFolder, setDropFolder, open, toggle }: TreeProps) {
  const playingHref = usePlayer((state) => (state.queue.context.source?.kind === "playlist" ? state.queue.context.source.href : undefined));
  const playing = usePlayer((state) => state.playing);
  return (
    <>
      {node.folders.map((folder) => {
        const id = folder.id;
        const label = id ? folder.name : playlistPrefix(folder.key);
        return (
          <SidebarMenuSubItem
            key={folder.key}
            data-drop-target={(id && dropFolder === id) || undefined}
            className="data-drop-target:bg-sidebar-accent data-drop-target:outline data-drop-target:outline-foreground"
          >
            <Collapsible open={open.has(folder.key)} onOpenChange={(next) => toggle(folder.key, next)}>
              {/* The trigger is a button (it expands a folder); the sub-button's default would be a link. */}
              <SidebarMenuSubButton
                render={<CollapsibleTrigger />}
                data-folder-id={id ?? undefined}
                className="w-full font-mono text-muted-foreground [&[data-panel-open]>svg]:rotate-90"
                {...(id ? folderDrop(id, setDropFolder) : legacyDrop)}
              >
                <ChevronRightIcon className="transition-transform" />
                <span>{folder.name}</span>
              </SidebarMenuSubButton>
              {id && (
                <Link
                  href={`/playlist-folder/${id}`}
                  aria-label={`open folder ${label}`}
                  className="absolute top-1 right-6 grid size-5 place-items-center text-muted-foreground opacity-0 hover:text-foreground focus-visible:opacity-100 group-hover/menu-sub-item:opacity-100"
                >
                  <FolderIcon className="size-3.5" />
                </Link>
              )}
              <button
                type="button"
                aria-label={`folder ${label}: rename or add a playlist`}
                className="absolute top-1 right-1 grid size-5 place-items-center text-muted-foreground opacity-0 hover:text-foreground focus-visible:opacity-100 group-hover/menu-sub-item:opacity-100"
                onClick={() => openPlaylistDialog(id ? { kind: "folder-edit", id } : { kind: "folder", path: label })}
              >
                <EllipsisIcon className="size-3.5" />
              </button>
              <CollapsibleContent>
                <SidebarMenuSub className="mr-0 pr-0">
                  <SubTree
                    node={folder}
                    chain={id ? [...chain, folder.name] : []}
                    path={path}
                    dropId={dropId}
                    dropFolder={dropFolder}
                    setDropFolder={setDropFolder}
                    open={open}
                    toggle={toggle}
                  />
                </SidebarMenuSub>
              </CollapsibleContent>
            </Collapsible>
          </SidebarMenuSubItem>
        );
      })}
      {node.playlists.map((playlist) => {
        const href = `/playlist/${playlist.id}`;
        return (
          <SidebarMenuSubItem
            key={playlist.id}
            data-playlist-id={playlist.id}
            data-drop-target={dropId === playlist.id || undefined}
            className="data-drop-target:bg-sidebar-accent data-drop-target:outline data-drop-target:outline-foreground"
          >
            <SidebarMenuSubButton
              isActive={path === href}
              className={cn("font-mono text-muted-foreground", playingHref === href && "text-foreground")}
              render={<Link href={href} onDragStart={(event) => startDrag(event, { kind: "playlist", playlist })} onDragEnd={endDrag} />}
            >
              <span>{shownName(playlist, chain)}</span>
              {playingHref === href && <Equalizer playing={playing} />}
            </SidebarMenuSubButton>
          </SidebarMenuSubItem>
        );
      })}
    </>
  );
}

interface PlaylistsProps {
  path: string;
  dropFolder: string | null;
  setDropFolder: (id: string | null) => void;
}

export function SidebarPlaylists({ path, dropFolder, setDropFolder }: PlaylistsProps) {
  const user = useUser() ?? "";
  // Dragging songs, an album or a playlist over a playlist you can edit adds them to it on drop.
  const [dropId, setDropId] = useState<string | null>(null);
  const [open, toggle] = useOpenFolders();
  const settled = useFoldersSettled();
  const [menu, setMenu] = useState<{ target: { kind: "playlist"; playlist: Playlist }; x: number; y: number } | null>(null);
  const { data } = useQuery(queries.playlists());
  const tree = usePlaylistTree();
  const playlists = [...(data ?? [])].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      {menu && (
        <Suspense>
          <PointMenu target={menu.target} x={menu.x} y={menu.y} onClose={() => setMenu(null)} />
        </Suspense>
      )}
      <SidebarMenu>
        <SidebarMenuItem>
          {playlists.length > 0 && !settled ? null : playlists.length === 0 ? (
            <span className="flex h-7 items-center gap-2 px-2 text-faint text-xs">
              <ListMusicIcon /> none yet · save your queue as one
            </span>
          ) : (
            <SidebarMenuSub
              className="mx-0 border-0 px-0"
              onDragOver={(event) => {
                const id = (event.target as Element).closest("[data-playlist-id]")?.getAttribute("data-playlist-id");
                const playlist = playlists.find((item) => item.id === id);
                const drag = currentDrag(event);
                // Yours and not a smart playlist (lib/playlists canEdit, inlined to keep it off the first screen).
                const editable = playlist && !playlist.readonly && (!playlist.owner || playlist.owner === user);
                if (!drag || !playlist || !editable) {
                  setDropId(null);
                  return;
                }
                event.preventDefault();
                event.dataTransfer.dropEffect = "copy";
                setDropId(playlist.id);
              }}
              onDragLeave={(event) => leftTarget(event) && setDropId(null)}
              onDrop={(event) => {
                const drag = currentDrag(event);
                const playlist = playlists.find((item) => item.id === dropId);
                setDropId(null);
                if (!drag || !playlist) return;
                event.preventDefault();
                endDrag();
                void Promise.all([dropSongs(drag.target), import("@/lib/playlists")])
                  .then(([songs, edits]) => edits.addToPlaylist(playlist, songs))
                  .catch(dropFailed);
              }}
              onContextMenu={(event) => {
                const id = (event.target as Element).closest("[data-playlist-id]")?.getAttribute("data-playlist-id");
                const playlist = playlists.find((item) => item.id === id);
                if (!playlist) return;
                event.preventDefault();
                setMenu({ target: { kind: "playlist", playlist }, x: event.clientX, y: event.clientY });
              }}
            >
              <SubTree
                node={tree}
                chain={[]}
                path={path}
                dropId={dropId}
                dropFolder={dropFolder}
                setDropFolder={setDropFolder}
                open={open}
                toggle={toggle}
              />
            </SidebarMenuSub>
          )}
        </SidebarMenuItem>
      </SidebarMenu>
    </>
  );
}
