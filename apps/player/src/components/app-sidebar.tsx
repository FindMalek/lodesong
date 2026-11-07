import {
  BellIcon,
  BookmarkIcon,
  ChartColumnIcon,
  Disc3Icon,
  FolderIcon,
  FolderPlusIcon,
  HeartIcon,
  HistoryIcon,
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
  useSidebar,
} from "@/components/ui/sidebar";
import { eager } from "@/lib/eager";
import { useElsewhere } from "@/lib/elsewhere";
import { folderDrop } from "@/lib/folder-drop";
import { openPlaylistDialog } from "@/lib/playlist-dialogs";
import { cn } from "@/lib/utils";
import { BrandMark } from "./brand";
import { Link } from "./link";

const ElsewhereBadge = lazy(() => import("./elsewhere-badge").then((module) => ({ default: module.ElsewhereBadge })));
const SidebarResizer = lazy(() => import("./sidebar-resizer").then((module) => ({ default: module.SidebarResizer })));
const SidebarPlaylists = eager(() => import("./sidebar-playlists").then((module) => module.SidebarPlaylists));

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

export function AppSidebar({ path }: { path: string }) {
  const elsewhere = useElsewhere();
  const [dropFolder, setDropFolder] = useState<string | null>(null);
  // On a narrow window the sidebar is a sheet: going somewhere closes it.
  const { setOpenMobile } = useSidebar();
  // biome-ignore lint/correctness/useExhaustiveDependencies: close on every navigation
  useEffect(() => setOpenMobile(false), [path, setOpenMobile]);

  return (
    <Sidebar collapsible="icon" className="bottom-(--bar-height) h-auto">
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
            <Suspense>
              <SidebarPlaylists path={path} dropFolder={dropFolder} setDropFolder={setDropFolder} />
            </Suspense>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="border-t">
          {elsewhere[0] && (
            <Suspense>
              <ElsewhereBadge playing={elsewhere[0]} />
            </Suspense>
          )}
        </SidebarFooter>
        <Suspense>
          <SidebarResizer />
        </Suspense>
      </nav>
    </Sidebar>
  );
}
