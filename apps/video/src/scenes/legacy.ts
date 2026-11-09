import type { ComponentType } from "react";
import { EndShot } from "./end";
import { KeysShot } from "./keys";
import { MixesShot } from "./mixes";
import { OpenShot } from "./open";
import { SessionShot } from "./session";
import { TerminalShot } from "./terminal";

/** The pre-v2 shots, kept as Studio-only `scene-*` compositions until the new shots reuse their parts and T7 deletes them. */
export const LEGACY_SCENES: Record<string, ComponentType> = {
  open: OpenShot,
  keys: KeysShot,
  mixes: MixesShot,
  session: SessionShot,
  terminal: TerminalShot,
  end: EndShot,
};
