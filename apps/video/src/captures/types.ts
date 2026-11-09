import { FPS } from "../design/beat";

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type CaptureEventKind = "key" | "click" | "line" | "device" | "row";

export interface CaptureEvent {
  t: number;
  kind: CaptureEventKind;
  label?: string;
  target?: Box;
}

/** One captured plate or sequence; the rig writes `manifest.json` as Record<id, Capture>, files under `public/captures/`, boxes in CSS px. */
export interface Capture {
  id: string;
  file: string;
  w: number;
  h: number;
  dsf: number;
  sequence?: { count: number; fps: number };
  events: readonly CaptureEvent[];
  boxes: Record<string, Box>;
}

export type CaptureManifest = Record<string, Capture>;

/** Where a capture plays in the film: shot-local frame of its t = 0, and its playback rate (2 = twice as fast). */
export interface Placement {
  capture: string;
  shot: string;
  at: number;
  rate?: number;
}

export interface ShotCue {
  shot: string;
  at: number;
  kind: string;
  label: string;
}

/** One feature on screen, in shot-local frames: the coverage checklist is a list of these. */
export interface FeatureCoverage {
  id: string;
  label: string;
  film: string;
  shot: string;
  from: number;
  to: number;
}

export const eventFrame = (placement: Placement, event: CaptureEvent): number =>
  placement.at + Math.round((event.t * FPS) / (placement.rate ?? 1));
