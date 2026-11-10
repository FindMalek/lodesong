import type { ComponentType } from "react";
import { FindScene } from "./cut-find";
import { FlashesScene } from "./cut-flashes";
import { HookScene } from "./cut-hook";
import { LandScene } from "./cut-land";
import { MixesScene } from "./cut-mixes";
import { SessionScene } from "./cut-session";
import type { CutId } from "./timelines";

/** A warm pool of the film's gold behind every cut, so no frame of the phone edit sits on bare black. */
function Lit({ scene: Scene }: { scene: ComponentType }) {
  return (
    <>
      <i
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse 980px 1180px at 50% 50%, color-mix(in oklch, var(--ignite) 28%, #0b0b0b), color-mix(in oklch, var(--ignite) 7%, #0b0b0b))",
        }}
      />
      <Scene />
    </>
  );
}

const lit = (scene: ComponentType): ComponentType =>
  function LitScene() {
    return <Lit scene={scene} />;
  };

/** One scene per cutdown cut, each laid out for 1080x1920 with its copy inside the 900x1400 safe box. */
export const CUT_SCENES: Record<CutId, ComponentType> = {
  hook: lit(HookScene),
  find: lit(FindScene),
  mixes: lit(MixesScene),
  session: lit(SessionScene),
  shells: lit(FlashesScene),
  land: lit(LandScene),
};
