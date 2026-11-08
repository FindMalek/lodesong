import { AbsoluteFill, useCurrentFrame } from "remotion";
import { beat, FPS } from "../design/beat";
import { ease, ramp } from "../design/motion";
import { Shell } from "../design/shell";
import { DitherCover } from "../ui/dither-cover";
import { LyricsCloseUp } from "../ui/lyrics-close-up";
import { LOOP } from "./timelines";

const FOCUS_FROM = 2;
const SCROLLS = [7, 9, 11] as const;

/** The readme loop: the lyrics close-up built from nothing and taken back to nothing, so the last frame is the first and the seam is invisible. */
function LoopShot() {
  const frame = useCurrentFrame();
  const time = frame / FPS;
  const out = beat(17);
  const settle = 1 - ramp(frame, out, beat(2), ease.in);
  const focus =
    FOCUS_FROM +
    ramp(frame, beat(LOOP.ignite), beat(0.5)) +
    ramp(frame, beat(LOOP.advance), beat(0.5)) +
    SCROLLS.reduce((sum, at) => sum + ramp(frame, beat(at), beat(0.5)), 0);
  const ignite = ramp(frame, beat(LOOP.ignite), beat(0.5)) * (1 - ramp(frame, beat(16), beat(1.5), ease.inOut));
  const pulse = ramp(frame, beat(LOOP.ignite), beat(0.25)) - ramp(frame, beat(LOOP.ignite) + beat(0.25), beat(1));
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ opacity: 0.12, maskImage: "radial-gradient(circle at 70% 50%, black 0, transparent 620px)" }}>
        <div style={{ position: "absolute", left: "50%", top: "50%", marginLeft: -540, marginTop: -540 }}>
          <DitherCover id="loop-field" size={1080} time={time * 0.4} />
        </div>
      </AbsoluteFill>
      <LyricsCloseUp
        focus={focus}
        enter={ramp(frame, beat(1), beat(1)) * settle}
        ignite={ignite}
        pulse={pulse}
        develop={ramp(frame, beat(0.5), beat(3.5), ease.inOut) * settle}
        time={time * 0.5}
        chip={ramp(frame, beat(0.5), beat(1)) * settle}
        press={0}
      />
    </AbsoluteFill>
  );
}

export function Loop({ probe = false }: { probe?: boolean }) {
  return (
    <Shell grain={false} chrome={false} probe={probe}>
      <LoopShot />
    </Shell>
  );
}
