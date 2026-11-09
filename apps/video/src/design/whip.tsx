import type { ReactNode } from "react";
import { Easing, useCurrentFrame } from "remotion";
import { STAGE } from "./camera";

type WhipDirection = "left" | "right" | "up" | "down";

const THROW = Easing.bezier(0.8, 0, 0.12, 1);

export function whipProgress(frame: number, at: number, length: number): number {
  if (frame <= at) return 0;
  if (frame >= at + length) return 1;
  return THROW((frame - at) / length);
}

export function whipSpeed(frame: number, at: number, length: number, distance: number): number {
  return Math.abs(whipProgress(frame + 0.5, at, length) - whipProgress(frame - 0.5, at, length)) * distance;
}

interface WhipProps {
  at: number;
  length?: number;
  direction?: WhipDirection;
  from: ReactNode;
  to: ReactNode;
  shutter?: number;
  width?: number;
  height?: number;
}

const OFFSET: Record<WhipDirection, { x: number; y: number }> = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
};

const FILTER_ID = "whip-blur";

/** A whip pan between two views with directional blur from the move speed; `direction` is where the picture travels. */
export function Whip({ at, length = 8, direction = "left", from, to, shutter = 0.35, width = STAGE.w, height = STAGE.h }: WhipProps) {
  const frame = useCurrentFrame();
  if (frame < at) return from;
  const dir = OFFSET[direction];
  const horizontal = dir.x !== 0;
  const distance = horizontal ? width : height;
  const t = whipProgress(frame, at, length);
  const blur = Math.min(220, whipSpeed(frame, at, length, distance) * shutter);
  const deviation = horizontal ? `${blur} 0` : `0 ${blur}`;
  const move = (share: number) => `translate(${dir.x * share * width}px, ${dir.y * share * height}px)`;
  const style = (transform: string) => ({
    position: "absolute" as const,
    inset: 0,
    transform,
    filter: blur > 0.5 ? `url(#${FILTER_ID})` : undefined,
  });
  return (
    <>
      <svg aria-hidden width={0} height={0} style={{ position: "absolute" }}>
        <filter id={FILTER_ID} x="-30%" y="-30%" width="160%" height="160%" colorInterpolationFilters="sRGB">
          <feGaussianBlur stdDeviation={deviation} />
        </filter>
      </svg>
      {frame < at + length ? <div style={style(move(t))}>{from}</div> : null}
      <div style={style(move(t - 1))}>{to}</div>
    </>
  );
}
