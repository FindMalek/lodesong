import { Badge } from "@lodesong/ui/components/badge";
import { Button } from "@lodesong/ui/components/button";
import { Kbd } from "@lodesong/ui/components/kbd";
import {
  DiscIcon,
  FolderIcon,
  HeartIcon,
  HistoryIcon,
  HomeIcon,
  ListMusicIcon,
  MicVocalIcon,
  MusicIcon,
  PauseIcon,
  RepeatIcon,
  SearchIcon,
  ShuffleIcon,
  SkipBackIcon,
  SkipForwardIcon,
  UsersIcon,
  Volume2Icon,
} from "lucide-react";
import type { CSSProperties } from "react";
import { BrandMark } from "../../../player/src/components/brand";
import { ALBUM_MINUTES, COPY, clock, FIXTURE } from "../copy";
import { DitherCover } from "./dither-cover";

export const STAGE = { width: 1280, height: 800 };
const TRACK_SECONDS = FIXTURE.tracks[0][1];
const BAR = 72;
const SIDE = 224;
const LYRICS = 320;
const LINE_STEP = 52;
const NAV_ICONS = [HomeIcon, DiscIcon, UsersIcon, MusicIcon, HeartIcon, HistoryIcon, FolderIcon];
const BAR_IDS = ["a", "b", "c", "d"] as const;

const panel: CSSProperties = {
  position: "absolute",
  background: "var(--background)",
  overflow: "hidden",
  boxShadow: "0 40px 120px rgb(0 0 0 / calc(0.55 * var(--float, 0)))",
};

export function Sidebar() {
  return (
    <div
      data-panel="sidebar"
      style={{ ...panel, left: 0, top: 0, width: SIDE, height: STAGE.height - BAR, borderRight: "1px solid var(--border)" }}
    >
      <div className="flex h-11 items-center px-5">
        <BrandMark />
      </div>
      <div className="px-5 pt-4 pb-2 font-mono text-label text-faint">library</div>
      <div className="flex flex-col gap-0.5 px-2">
        {FIXTURE.nav.map((name, index) => {
          const Icon = NAV_ICONS[index] ?? HomeIcon;
          return (
            <div key={name} className="flex h-8 items-center gap-3 px-3 font-mono text-small text-foreground">
              <Icon className="size-4 text-muted-foreground" />
              {name}
            </div>
          );
        })}
      </div>
      <div className="px-5 pt-6 pb-2 font-mono text-label text-faint">playlists</div>
      <div className="flex flex-col gap-0.5 px-2">
        {FIXTURE.playlists.map((name) => (
          <div key={name} className="flex h-8 items-center px-3 font-mono text-small text-muted-foreground">
            {name}
          </div>
        ))}
      </div>
    </div>
  );
}

interface MainProps {
  develop: number;
  time: number;
  bars: readonly number[];
  coverColor: string;
}

export function Main({ develop, time, bars, coverColor }: MainProps) {
  return (
    <div
      data-panel="main"
      style={{
        ...panel,
        left: SIDE,
        top: 0,
        width: STAGE.width - SIDE - LYRICS,
        height: STAGE.height - BAR,
        borderRight: "1px solid var(--border)",
      }}
    >
      <div className="flex h-11 items-center justify-between border-b px-4">
        <div className="flex h-8 w-72 items-center gap-2 border px-3 text-muted-foreground text-small">
          <SearchIcon className="size-3.5" />
          search
          <Kbd className="ml-auto">⌘K</Kbd>
        </div>
        <Badge variant="outline">demo</Badge>
      </div>
      <div className="flex gap-5 border-b p-5">
        <div className="outline outline-muted">
          <DitherCover id="quiet-hours-ii" size={128} develop={develop} time={time} color={coverColor} />
        </div>
        <div className="flex flex-col justify-between">
          <div>
            <Badge variant="outline">album</Badge>
            <div className="mt-2 font-medium text-title leading-none">{FIXTURE.album.title}</div>
            <div className="mt-1.5 font-medium text-lead">{FIXTURE.album.artist}</div>
            <div className="mt-0.5 text-muted-foreground text-small">
              {FIXTURE.album.year} · {FIXTURE.tracks.length} tracks · {ALBUM_MINUTES} min · {FIXTURE.album.format}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary">play</Button>
            <Button variant="outline">shuffle</Button>
            <Button variant="outline">add to queue</Button>
          </div>
        </div>
      </div>
      <div className="px-5 pt-3">
        <div className="flex h-8 items-center border-b font-mono text-faint text-label">
          <span className="w-8">#</span>
          <span className="flex-1">title</span>
          <span>time</span>
        </div>
        {FIXTURE.tracks.map(([title, seconds], index) => (
          <div
            key={title}
            className="flex h-9 items-center border-b text-body"
            style={{ color: index === 0 ? "var(--foreground)" : "var(--muted-foreground)" }}
          >
            <span className="w-8 font-mono text-small">
              {index === 0 ? (
                <span className="flex h-4 items-end gap-0.5">
                  {BAR_IDS.map((id, bar) => (
                    <i key={id} className="block w-0.5 bg-foreground" style={{ height: `${(bars[bar] ?? 0) * 100}%` }} />
                  ))}
                </span>
              ) : (
                index + 1
              )}
            </span>
            <span className="flex-1" style={{ fontWeight: index === 0 ? 500 : 400 }}>
              {title}
            </span>
            <span className="font-mono text-small">{clock(seconds)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Lyrics({ focus }: { focus: number }) {
  return (
    <div data-panel="lyrics" style={{ ...panel, left: STAGE.width - LYRICS, top: 0, width: LYRICS, height: STAGE.height - BAR }}>
      <div className="flex h-11 items-center border-b px-5 font-mono text-small">lyrics</div>
      <div
        className="absolute inset-x-0 top-11 bottom-0 overflow-hidden"
        style={{ maskImage: "linear-gradient(to bottom, transparent, black 18%, black 70%, transparent)" }}
      >
        <div className="flex flex-col gap-6 p-6" style={{ transform: `translateY(${60 - focus * LINE_STEP}px)` }}>
          {COPY.lyrics.map((line, index) => {
            const weight = Math.max(0, 1 - Math.abs(index - focus));
            return (
              <div
                key={line}
                className="font-medium text-lead"
                style={{ opacity: 0.35 + 0.65 * weight, transform: `translateX(${weight * 8}px)` }}
              >
                {line}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function PlayerBar({ position, coverColor }: { position: number; coverColor: string }) {
  const progress = Math.min(1, position / TRACK_SECONDS);
  return (
    <div
      data-panel="bar"
      style={{ ...panel, left: 0, top: STAGE.height - BAR, width: STAGE.width, height: BAR, borderTop: "1px solid var(--border)" }}
    >
      <div className="flex h-full items-center px-5">
        <div className="flex w-72 items-center gap-3">
          <div className="outline outline-muted">
            <DitherCover id="quiet-hours-ii" size={44} color={coverColor} />
          </div>
          <div>
            <div className="font-medium text-body">{FIXTURE.tracks[0][0]}</div>
            <div className="text-muted-foreground text-small">{FIXTURE.album.artist}</div>
          </div>
        </div>
        <div className="flex flex-1 flex-col items-center gap-1.5">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-sm">
              <ShuffleIcon />
            </Button>
            <Button variant="ghost" size="icon-sm">
              <SkipBackIcon />
            </Button>
            <Button size="icon">
              <PauseIcon />
            </Button>
            <Button variant="ghost" size="icon-sm">
              <SkipForwardIcon />
            </Button>
            <Button variant="ghost" size="icon-sm">
              <RepeatIcon />
            </Button>
          </div>
          <div className="flex w-[420px] items-center gap-3 font-mono text-faint text-meta">
            <span>{clock(position)}</span>
            <div className="relative h-0.5 flex-1 bg-border">
              <div className="absolute inset-y-0 left-0 bg-foreground" style={{ width: `${progress * 100}%` }} />
              <div className="absolute -top-1 size-2.5 bg-foreground" style={{ left: `calc(${progress * 100}% - 5px)` }} />
            </div>
            <span>{clock(TRACK_SECONDS)}</span>
          </div>
        </div>
        <div className="flex w-72 items-center justify-end gap-3 text-muted-foreground">
          <span className="font-mono text-meta">{FIXTURE.album.format}</span>
          <MicVocalIcon className="size-4 text-foreground" />
          <ListMusicIcon className="size-4" />
          <Volume2Icon className="size-4" />
        </div>
      </div>
    </div>
  );
}
