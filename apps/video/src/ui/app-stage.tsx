import { Lyrics, Main, PlayerBar, Sidebar, STAGE } from "./player-panels";

export interface AppView {
  scale: number;
  cx: number;
  cy: number;
}

/** the camera on the app: pushing in during the open, and the same framing carried into the keyboard shot behind the palette */
export const APP_VIEW: { from: AppView; to: AppView } = {
  from: { scale: 1.5, cx: 640, cy: 360 },
  to: { scale: 1.62, cx: 630, cy: 340 },
};

export const ALBUM_SLOT = { x: 244, y: 65, size: 128 };

export const stageToScreen = (view: AppView, x: number, y: number, frameW = 1920, frameH = 1080): { x: number; y: number } => ({
  x: frameW / 2 + (x - view.cx) * view.scale,
  y: frameH / 2 + (y - view.cy) * view.scale,
});

interface AppStageProps {
  view: AppView;
  focus: number;
  bars: readonly number[];
  position: number;
  time: number;
  coverOpacity?: number;
}

/** The whole app drawn flat and big: the 1280x800 window scaled to bleed past the frame, brighter than the app itself, no tilt. */
export function AppStage({ view, focus, bars, position, time, coverOpacity = 1 }: AppStageProps) {
  const origin = stageToScreen(view, 0, 0);
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: STAGE.width,
        height: STAGE.height,
        transformOrigin: "0 0",
        transform: `translate(${origin.x}px, ${origin.y}px) scale(${view.scale})`,
        filter: "brightness(1.2) contrast(1.06)",
      }}
    >
      <Main develop={1} time={time * 0.5} bars={bars} coverColor="var(--ignite)" coverOpacity={coverOpacity} />
      <Sidebar />
      <PlayerBar position={position} coverColor="var(--ignite)" />
      <Lyrics focus={focus} />
    </div>
  );
}
