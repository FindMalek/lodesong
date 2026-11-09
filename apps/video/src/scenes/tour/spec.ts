import type { ComponentType, ReactNode } from "react";
import type { PlateLayout } from "../../design/plate";
import type { Box } from "../../design/probe";
import type { Feature } from "../../features";

export type Lane = "bl" | "tl" | "br" | "tr";

import type { PlateAsset } from "./plates";

export type Frac = readonly [number, number, number, number];

interface HostContext {
  feature: Feature;
  frame: number;
  frames: number;
  asset: PlateAsset;
  layout: PlateLayout;
  focus: Box;
}

export interface HostSpec {
  focus?: string | Frac;
  plates?: readonly string[];
  push?: number;
  brightness?: number;
  cursor?: boolean;
  bare?: boolean;
  lane?: Lane;
  scene?: ComponentType<{ feature: Feature; frames: number }>;
  overlay?: (context: HostContext) => ReactNode;
}

export interface ChapterSpec {
  hosts: Record<string, HostSpec>;
}
