import type { Page } from "@playwright/test";
import type { Theme } from "../capture";
import type { Found } from "../seed";

export type Box = { x: number; y: number; w: number; h: number };
export type Device = "desktop" | "phone";

/** Selectors are Playwright strings (css, `role=button[name="devices"]`, `text=...`); `{title}` and `{album}` are filled in. */
export type Sel = string;

export type Step =
  | { go: string; ready?: Sel }
  | { key: string; at?: Sel; name?: string }
  | { click: Sel; name?: string; right?: boolean }
  | { type: string; into?: Sel; each?: boolean }
  | { wait: Sel }
  | { hover: Sel }
  | { reveal: Sel }
  | { freeze: number | `line:${number}` }
  | { shot: string; boxes?: Record<string, Sel>; toasts?: boolean }
  | { run: (ctx: Ctx) => Promise<void> };

export type Need = "playing";

export type Served = { recipe: string; plate?: string };

export type Recipe = {
  id: string;
  shot?: string;
  device?: Device;
  theme?: Theme;
  /** The long stack serves 10,000 songs; everything else gets 900. */
  stack?: "main" | "long";
  needs?: Need[];
  anon?: boolean;
  steps: Step[];
};

export type Event = { t: number; kind: string; key?: string; name?: string; target?: Box };

export type Plate = {
  name: string;
  file: string;
  t: number;
  boxes: Record<string, Box>;
  device?: Device;
  w?: number;
  h?: number;
  dsf?: number;
};

export type Take = {
  id: string;
  shot: string;
  device: Device;
  theme: Theme;
  w: number;
  h: number;
  dsf: number;
  fps: number;
  plates: Plate[];
  events: Event[];
  video?: { file: string; frames: number; fps: number };
  data?: Record<string, unknown>;
};

export type Ctx = {
  page: Page;
  base: string;
  found: Found;
  starts: number[];
  lyrics: Lyrics;
  take: Take;
  shot: (name: string, boxes?: Record<string, Sel>, toasts?: boolean, other?: Page) => Promise<void>;
  dir: string;
  /** Keep the pointer where a hover step put it for the next plates (tooltips), or park it again. */
  hover: (on: boolean) => void;
  grab: () => Promise<Buffer>;
  event: (kind: string, extra?: Partial<Event>) => void;
  fill: (text: string) => string;
  freeze: (seconds: number) => Promise<void>;
  phone: () => Promise<Page>;
};

export type Lyrics = { title: string; lines: { start: number; text: string; words?: { start: number; text: string }[] }[] };

export type Manifest = {
  version: 1;
  fps: number;
  viewports: Record<Device, { w: number; h: number; dsf: number }>;
  lyrics: Lyrics | null;
  features: Record<string, Take>;
  captures: Record<string, Served & { features: string[] }>;
  uncapturable: Record<string, string>;
};
