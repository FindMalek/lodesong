import type { ReactNode } from "react";
import { AbsoluteFill, Freeze, Img, Sequence, staticFile, useCurrentFrame } from "remotion";
import { type Cam, Camera, handheld, STAGE } from "../../design/camera";
import { Cursor, type CursorStop } from "../../design/cursor";
import { Bracket } from "../../design/draw";
import { ease, lerp, ramp } from "../../design/motion";
import { camToBox, Plate, type PlateLayout, plateLayout } from "../../design/plate";
import type { Box } from "../../design/probe";
import { CHAPTERS, type Chapter, chapterRange, type Feature, hostsOf } from "../../features";
import { ChipStack } from "./chip";
import { MockHost } from "./mocks";
import { mockIdOf, type PlateAsset, plateOf, platesOf } from "./plates";
import type { ChapterSpec, Frac, HostSpec } from "./spec";
import { Counter, DitherVeil } from "./stinger";

const MAX_SCALE_UP = 2.2;
const WIDE = 16 / 9;

/** Captures that are 16:9 fill the stage; anything else (phones, docs crops, tiles) sits whole on a blurred copy of itself. */
function layoutOf(asset: PlateAsset): PlateLayout {
  const size = { w: asset.w, h: asset.h };
  const cover = Math.abs(asset.w / asset.h - WIDE) < 0.06;
  const base = plateLayout(size, STAGE, cover ? "cover" : "contain");
  if (base.k <= MAX_SCALE_UP || cover) return base;
  return { ...base, k: MAX_SCALE_UP, left: (STAGE.w - asset.w * MAX_SCALE_UP) / 2, top: (STAGE.h - asset.h * MAX_SCALE_UP) / 2 };
}

const srcOf = (asset: PlateAsset): string => (asset.kind === "film" ? staticFile(`film/${asset.file}`) : (asset.src ?? ""));

const CENTER: Frac = [0.25, 0.22, 0.5, 0.5];

const PREFER = [
  "menu",
  "dialog",
  "toast",
  "sliders",
  "slider",
  "shuffle",
  "active",
  "badge",
  "heart",
  "precached",
  "seek",
  "input",
  "rows",
  "panel",
  "folder",
  "health",
  "fix",
  "card",
  "header",
  "tile",
  "form",
  "drop",
  "next",
  "bar",
];

function autoBox(boxes: Record<string, Box>): Box | undefined {
  const name = PREFER.find((one) => boxes[one]);
  return name ? boxes[name] : Object.values(boxes)[0];
}

function resolveFocus(asset: PlateAsset, primary: PlateAsset, focus: HostSpec["focus"]): { box: Box; named: boolean } {
  if (typeof focus === "string") {
    const box = asset.boxes[focus] ?? primary.boxes[focus];
    if (box) return { box, named: true };
  }
  if (!focus) {
    const auto = autoBox(asset.boxes);
    if (auto) return { box: auto, named: true };
  }
  const named = Array.isArray(focus);
  const [x, y, w, h] = (Array.isArray(focus) ? (focus as Frac) : CENTER) as Frac;
  return { box: { x: x * asset.w, y: y * asset.h, w: w * asset.w, h: h * asset.h }, named };
}

function hostCam(layout: PlateLayout, focus: Box, frame: number, frames: number, wow: Feature["wow"], push?: number): Cam {
  const reach = wow === "A" ? { fill: 0.55, maxScale: 1.6 } : { fill: 0.72, maxScale: 1.25 };
  const aim = camToBox(layout, focus, push ? { scale: push } : reach);
  const t = ease.out(Math.min(1, frame / (frames * 0.85)));
  const creep = 1 + 0.025 * (frame / frames);
  const sway = handheld(frame, 0.35);
  return {
    x: lerp(0, aim.x, t) + sway.x,
    y: lerp(0, aim.y, t) + sway.y,
    scale: lerp(1, aim.scale, t) * creep,
    rx: lerp(1, 0, t) + sway.rx,
    ry: lerp(3, 0, t) + sway.ry,
  };
}

function Backdrop({ src }: { src: string }) {
  return (
    <Img
      src={src}
      style={{
        position: "absolute",
        inset: -80,
        width: STAGE.w + 160,
        height: STAGE.h + 160,
        objectFit: "cover",
        filter: "blur(46px) brightness(0.3) saturate(1.3)",
      }}
    />
  );
}

interface HostViewProps {
  feature: Feature;
  spec?: HostSpec;
  frames: number;
}

function PlateHost({ feature, spec = {}, frames }: HostViewProps) {
  const frame = useCurrentFrame();
  const primary = plateOf(feature.capture);
  const all = platesOf(feature.capture);
  const picked = spec.plates?.flatMap((name) => all.find((plate) => plate.name === name) ?? []) ?? [];
  const list = picked.length > 0 ? picked : primary ? [primary] : [];
  const asset = list[Math.min(list.length - 1, Math.floor((frame * list.length) / frames))] ?? primary;
  if (!asset || !primary) return null;
  const layout = layoutOf(asset);
  const { box, named } = resolveFocus(asset, list[0] ?? primary, spec.focus);
  const cam = hostCam(layout, box, frame, frames, feature.wow, spec.push);
  const src = srcOf(asset);
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const stops: CursorStop[] = [
    { at: 0, x: cx - 320, y: cy + 200 },
    { at: (frames * 0.5) / 30, x: cx, y: cy, click: true },
  ];
  const showBracket = named && feature.wow === "A" && !spec.bare;
  const pool = {
    x: cx,
    y: cy,
    radius: Math.max(360, Math.hypot(box.w, box.h) * 0.9),
    dim: feature.wow === "A" ? 0.6 : 0.78,
    wash: 0.06,
  };
  return (
    <AbsoluteFill>
      {layout.k * asset.w < STAGE.w - 4 || layout.k * asset.h < STAGE.h - 4 ? <Backdrop src={src} /> : null}
      <Camera cam={cam}>
        <Plate src={src} layout={layout} light={pool} brightness={asset.light ? 0.9 : spec.brightness}>
          {showBracket ? <Bracket box={box} at={(frames * 0.25) / 30} pad={8} width={3} /> : null}
          {spec.cursor ? <Cursor stops={stops} size={38 / (layout.k * cam.scale)} /> : null}
          {spec.overlay?.({ feature, frame, frames, asset, layout, focus: box })}
        </Plate>
      </Camera>
    </AbsoluteFill>
  );
}

function HostView(props: HostViewProps) {
  const mock = mockIdOf(props.feature.capture);
  return mock ? <MockHost mock={mock} featureId={props.feature.id} frames={props.frames} /> : <PlateHost {...props} />;
}

const lastHostOf = (chapter: Chapter): Feature | undefined => hostsOf(chapter).at(-1);

interface StingerProps {
  chapter: Chapter;
  frames: number;
  first: Feature;
  firstSpec?: HostSpec;
  previous?: { host: Feature; spec?: HostSpec };
}

function Stinger({ chapter, frames, first, firstSpec, previous }: StingerProps) {
  const frame = useCurrentFrame();
  const half = Math.round(frames / 2);
  const outgoing = Boolean(previous) && frame < half;
  const push = outgoing ? lerp(1, 1.05, frame / half) : lerp(0.95, 1, ease.out(ramp(frame, half, frames - half)));
  const cover = outgoing
    ? ramp(frame, 0, half, ease.in)
    : 1 - (previous ? ramp(frame, half, frames - half - 2, ease.inOut) : ramp(frame, 6, frames - 8, ease.inOut));
  const hostFrames = (host: Feature): number => host.tour[1] - host.tour[0];
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ transform: `scale(${push})` }}>
        {outgoing && previous ? (
          <Freeze frame={hostFrames(previous.host) - 1}>
            <HostView feature={previous.host} spec={previous.spec} frames={hostFrames(previous.host)} />
          </Freeze>
        ) : (
          <Freeze frame={0}>
            <HostView feature={first} spec={firstSpec} frames={hostFrames(first)} />
          </Freeze>
        )}
      </AbsoluteFill>
      <DitherVeil cover={cover} from="left" />
      <Counter chapter={chapter} frames={frames} />
    </AbsoluteFill>
  );
}

export interface ChapterProps {
  previous?: HostSpec;
}

interface TourChapterProps extends ChapterProps {
  chapter: Chapter;
  spec: ChapterSpec;
}

export function TourChapter({ chapter, spec, previous }: TourChapterProps): ReactNode {
  const [start] = chapterRange(chapter);
  const hosts = hostsOf(chapter);
  const first = hosts[0];
  if (!first) return null;
  const before = CHAPTERS[CHAPTERS.findIndex((one) => one.id === chapter) - 1]?.id;
  const prevHost = before ? lastHostOf(before) : undefined;
  return (
    <AbsoluteFill>
      <Sequence layout="none" durationInFrames={first.tour[0] - start}>
        <Stinger
          chapter={chapter}
          frames={first.tour[0] - start}
          first={first}
          firstSpec={spec.hosts[first.id]}
          previous={prevHost ? { host: prevHost, spec: previous } : undefined}
        />
      </Sequence>
      {hosts.map((host) => (
        <Sequence key={host.id} from={host.tour[0] - start} durationInFrames={host.tour[1] - host.tour[0]} name={host.id}>
          <HostView feature={host} spec={spec.hosts[host.id]} frames={host.tour[1] - host.tour[0]} />
        </Sequence>
      ))}
      <ChipStack chapter={chapter} />
    </AbsoluteFill>
  );
}
