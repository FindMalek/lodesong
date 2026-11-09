import type { ComponentType } from "react";
import { Placeholder } from "./placeholder";
import { CUT_IDS, CUTDOWN, type CutId } from "./timelines";

function placeholderOf(id: CutId): ComponentType {
  const shot = CUTDOWN.shots.find((one) => one.id === id);
  return function CutPlaceholder() {
    return shot ? <Placeholder shot={shot} /> : null;
  };
}

/** One scene per cutdown cut; replace an entry as its scene lands. */
export const CUT_SCENES = Object.fromEntries(CUT_IDS.map((id) => [id, placeholderOf(id)])) as Record<CutId, ComponentType>;
