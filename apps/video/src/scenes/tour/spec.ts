import type { ReactNode } from "react";
import type { Box } from "../../design/probe";
import type { PlateLayout } from "../../design/plate";
import type { Feature } from "../../features";
import type { PlateAsset } from "./plates";

/** A region of a plate as fractions of its width and height: x, y, w, h. */
export type Frac = readonly [number, number, number, number];

export interface HostContext {
  feature: Feature;
  /** frame inside the host, 0 on its first frame */
  frame: number;
  frames: number;
  asset: PlateAsset;
  layout: PlateLayout;
  /** the focus region in plate px */
  focus: Box;
}

/** What a chapter may say about one host; everything it leaves out falls back to the engine's defaults. */
export interface HostSpec {
  /** a box name from the capture manifest, or a region of the plate; the camera pushes toward it */
  focus?: string | Frac;
  /** plate names played one after the other across the host (a typed query, a word sweep, before and after) */
  plates?: readonly string[];
  /** the camera's closest scale for this host */
  push?: number;
  /** the pointer glides to the focus and clicks */
  cursor?: boolean;
  /** hide the gold brackets around the focus */
  bare?: boolean;
  /** extra overlay in plate px, drawn above the plate */
  overlay?: (context: HostContext) => ReactNode;
}

export interface ChapterSpec {
  hosts: Record<string, HostSpec>;
}
