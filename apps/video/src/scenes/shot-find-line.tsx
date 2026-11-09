import { useCurrentFrame } from "remotion";
import { ease, lerp, ramp } from "../design/motion";
import { Whip } from "../design/whip";
import { Keycap, pressAt } from "../ui/keycap";
import { ShotChip } from "../ui/s1-chip";
import { PaletteView } from "../ui/s2-palette-view";
import { BarView } from "../ui/s3-bar";
import { KEY_AT, RESULTS_AT, WHIP_AT, WHIP_FRAMES } from "./s2-palette";

export { S2_CUES } from "./s2-palette";

const KEYCAP = 84;
const KEYS_OUT = KEY_AT + 52;

/** S2: the real palette, ⌘K stamped, the lyric typed with a caret, the match underlined, a cursor picks the line, and the shot whips up to the player bar. */
export function FindLineShot() {
  const frame = useCurrentFrame();
  const enter = ramp(frame, KEY_AT - 8, 10, ease.out);
  const leave = ramp(frame, KEYS_OUT, 10, ease.in);
  const down = pressAt(frame, KEY_AT, 4, 9);
  return (
    <>
      <Whip at={WHIP_AT} length={WHIP_FRAMES} direction="up" from={<PaletteView />} to={<BarView t={0} />} />
      {frame < KEYS_OUT + 12 ? (
        <div
          style={{
            position: "absolute",
            right: 72,
            bottom: 72,
            display: "flex",
            gap: 16,
            opacity: enter,
            transform: `translateY(${lerp(28, 0, enter) + leave * 140}px)`,
          }}
        >
          <Keycap label="⌘" size={KEYCAP} press={down} bright legible />
          <Keycap label="K" size={KEYCAP} press={down} bright legible />
        </div>
      ) : null}
      <ShotChip text="search by lyric" from={RESULTS_AT + 6} out={WHIP_AT - 14} />
    </>
  );
}
