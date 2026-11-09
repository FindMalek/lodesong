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
  /** The feature id: the manifest key and the folder under public/film/. */
  id: string;
  /** Which storyboard shot this plate belongs to (S1 to S12, or "tour"). */
  shot?: string;
  device?: Device;
  theme?: Theme;
  /** The long stack serves 10,000 songs; everything else gets 900. */
  stack?: "main" | "long";
  needs?: Need[];
  /** Skip the sign-in: the login screen and first-run states. */
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
  /** Seconds each lyric line starts at, and the word stamps of every line (from the app's own lyrics endpoint). */
  starts: number[];
  lyrics: Lyrics;
  take: Take;
  /** A plate of this recipe's page, or of the second device when its page is passed. */
  shot: (name: string, boxes?: Record<string, Sel>, toasts?: boolean, other?: Page) => Promise<void>;
  /** The recipe's own folder under public/film/, and a settled screenshot of its page that is not kept as a plate. */
  dir: string;
  /** Keep the pointer where a hover step put it for the next plates (tooltips), or park it again. */
  hover: (on: boolean) => void;
  grab: () => Promise<Buffer>;
  event: (kind: string, extra?: Partial<Event>) => void;
  fill: (text: string) => string;
  freeze: (seconds: number) => Promise<void>;
  /** A second signed-in device on the same session, opened on demand. */
  phone: () => Promise<Page>;
};

export type Lyrics = { title: string; lines: { start: number; text: string; words?: { start: number; text: string }[] }[] };

export type Manifest = {
  version: 1;
  fps: number;
  viewports: Record<Device, { w: number; h: number; dsf: number }>;
  lyrics: Lyrics | null;
  features: Record<string, Take>;
  /** The director's `cap:` captures: which recipe (and plate) serves it, and which FEATURES ids ride on it. */
  captures: Record<string, Served & { features: string[] }>;
  /** Captures that cannot be taken, and why. */
  uncapturable: Record<string, string>;
};
