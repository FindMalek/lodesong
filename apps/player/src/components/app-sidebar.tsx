import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@lodesong/ui/components/collapsible";
import { useQuery } from "@tanstack/react-query";
import {
  BellIcon,
  BookmarkIcon,
  ChartColumnIcon,
  ChevronRightIcon,
  Disc3Icon,
  EllipsisIcon,
  FolderIcon,
  FolderPlusIcon,
  HeartIcon,
  HistoryIcon,
  ListMusicIcon,
  MusicIcon,
  PlusIcon,
  TagIcon,
  UsersIcon,
} from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { current as currentDrag, dropFailed, dropSongs, endDrag, leftTarget, startDrag } from "@/lib/drag";
import { useElsewhere } from "@/lib/elsewhere";
import { folderDrop } from "@/lib/folder-drop";
import { type FolderNode, shownName } from "@/lib/folder-tree";
import { usePlayer } from "@/lib/player";
import { openPlaylistDialog } from "@/lib/playlist-dialogs";
import { readOpen, usePlaylistTree, writeOpen } from "@/lib/playlist-folders";
import { queries } from "@/lib/queries";
import { useUser } from "@/lib/subsonic";
import type { Playlist } from "@/lib/types";
import { cn } from "@/lib/utils";
import { BrandMark } from "./brand";
import { Equalizer } from "./equalizer";
import { Link } from "./link";

const ElsewhereBadge = lazy(() => import("./elsewhere-badge").then((module) => ({ default: module.ElsewhereBadge })));
// Right-clicking a playlist loads the shared item menu then (menus stay off the first screen).
const PointMenu = lazy(() => import("./item-menu").then((module) => ({ default: module.PointMenu })));

const LIBRARY = [
  ["/albums", "albums", Disc3Icon],
  ["/artists", "artists", UsersIcon],
  ["/songs", "songs", MusicIcon],
  ["/liked", "liked songs", HeartIcon],
  ["/history", "history", HistoryIcon],
  ["/following", "following", BellIcon],
  ["/moments", "moments", BookmarkIcon],
  ["/stats", "stats", ChartColumnIcon],
  ["/genres", "genres", TagIcon],
  ["/folders", "folders", FolderIcon],
] as const;

const LABEL = "font-mono text-label text-faint";

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
                {...(id ? folderDrop(id, setDropFolder) : {})}
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

export function AppSidebar({ path }: { path: string }) {
  const user = useUser() ?? "";
  const elsewhere = useElsewhere();
  // Dragging songs, an album or a playlist over a playlist you can edit adds them to it on drop.
  const [dropId, setDropId] = useState<string | null>(null);
  const [dropFolder, setDropFolder] = useState<string | null>(null);
  const [open, setOpen] = useState(readOpen);
  const toggle = (key: string, next: boolean) => {
    const updated = new Set(open);
    if (next) updated.add(key);
    else updated.delete(key);
    setOpen(updated);
    writeOpen(updated);
  };
  const [menu, setMenu] = useState<{ target: { kind: "playlist"; playlist: Playlist }; x: number; y: number } | null>(null);
  const { data } = useQuery(queries.playlists());
  const tree = usePlaylistTree();
  // On a narrow window the sidebar is a sheet: going somewhere closes it.
  const { setOpenMobile } = useSidebar();
  // biome-ignore lint/correctness/useExhaustiveDependencies: close on every navigation
  useEffect(() => setOpenMobile(false), [path, setOpenMobile]);
  const playlists = [...(data ?? [])].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <Sidebar collapsible="icon" className="bottom-(--bar-height) h-auto">
      {menu && (
        <Suspense>
          <PointMenu target={menu.target} x={menu.x} y={menu.y} onClose={() => setMenu(null)} />
        </Suspense>
      )}
      {/* `contents` keeps the sidebar's flex layout; the nav makes it a landmark for screen readers. */}
      <nav aria-label="sidebar" className="contents">
        <SidebarHeader className="gap-1.5">
          <div className="flex h-7 items-center px-2 group-data-[collapsible=icon]:px-2.5 group-data-[collapsible=icon]:[&_span:last-child]:hidden">
            <BrandMark />
          </div>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel className={LABEL}>library</SidebarGroupLabel>
            <SidebarMenu>
              {LIBRARY.map(([href, label, Icon]) => (
                <SidebarMenuItem key={href}>
                  <SidebarMenuButton
                    size="sm"
                    className="font-mono text-muted-foreground"
                    isActive={path.startsWith(href)}
                    tooltip={label}
                    render={<Link href={href} />}
                  >
                    <Icon />
                    <span>{label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>

          <SidebarGroup className="group-data-[collapsible=icon]:hidden">
            <SidebarGroupLabel
              className={cn(LABEL, "data-drop-target:bg-sidebar-accent data-drop-target:outline data-drop-target:outline-foreground")}
              data-drop-target={dropFolder === "root" || undefined}
              title="drop a playlist here to take it out of its folder"
              {...folderDrop(null, setDropFolder)}
            >
              playlists
            </SidebarGroupLabel>
            <SidebarGroupAction
              title="new folder"
              aria-label="new folder"
              className="right-8"
              onClick={() => openPlaylistDialog({ kind: "folder-new", parentId: null })}
            >
              <FolderPlusIcon />
            </SidebarGroupAction>
            <SidebarGroupAction title="new playlist" aria-label="new playlist" onClick={() => openPlaylistDialog({ kind: "new" })}>
              <PlusIcon />
            </SidebarGroupAction>
            <SidebarMenu>
              <SidebarMenuItem>
                {playlists.length === 0 ? (
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
                      if (!drag || !playlist || !editable || (drag.target.kind === "playlist" && drag.target.playlist.id === id)) {
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
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="border-t">
          {elsewhere[0] && (
            <Suspense>
              <ElsewhereBadge playing={elsewhere[0]} />
            </Suspense>
          )}
        </SidebarFooter>
      </nav>
    </Sidebar>
  );
}
