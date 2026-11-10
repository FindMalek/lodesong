import type { ComponentType } from "react";
import { FindScene } from "./cut-find";
import { FlashesScene } from "./cut-flashes";
import { HookScene } from "./cut-hook";
import { LandScene } from "./cut-land";
import { MixesScene } from "./cut-mixes";
import { SessionScene } from "./cut-session";
import type { CutId } from "./timelines";

/** One scene per cutdown cut, each laid out for 1080x1920 with its copy inside the 900x1400 safe box. */
export const CUT_SCENES: Record<CutId, ComponentType> = {
  hook: HookScene,
  find: FindScene,
  mixes: MixesScene,
  session: SessionScene,
  shells: FlashesScene,
  land: LandScene,
};
