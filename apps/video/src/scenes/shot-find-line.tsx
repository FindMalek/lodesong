import { useCurrentFrame } from "remotion";
import { MaskLine } from "../design/kinetic";
import { ease, lerp, ramp } from "../design/motion";
import { Whip } from "../design/whip";
import { Keycap, pressAt } from "../ui/keycap";
import { ShotChip } from "../ui/s1-chip";
import { PaletteView } from "../ui/s2-palette-view";
import { BarView } from "../ui/s3-bar";
import { DOWN_AT, ENTER_AT, KEY_AT, RESULTS_AT, WHIP_AT, WHIP_FRAMES } from "./s2-palette";

export { S2_CUES } from "./s2-palette";

const KEYCAP = 84;
const KEYS_OUT = KEY_AT + 52;
const LINE_IN = 158;
const LINE_OUT = 238;

function Keys({ labels, at, out, enterAt = at }: { labels: readonly string[]; at: number; out?: number; enterAt?: number }) {
  const frame = useCurrentFrame();
  const enter = ramp(frame, enterAt - 8, 10, ease.out);
  const leave = out === undefined ? 0 : ramp(frame, out, 10, ease.in);
  const down = pressAt(frame, at, 4, 9);
  if (frame < enterAt - 8 || (out !== undefined && frame > out + 12)) return null;
  return (
    <div
      style={{
        position: "absolute",
        right: 72,
        bottom: 72,
        display: "flex",
        gap: 16,
        opacity: enter * (1 - leave),
        transform: `translateY(${lerp(28, 0, enter)}px)`,
      }}
    >
      {labels.map((label) => (
        <Keycap key={label} label={label} size={KEYCAP} press={down} bright legible />
      ))}
    </div>
  );
}

/** S2: the real palette, ⌘K stamped, the lyric typed with a caret, the match underlined and bracketed, then ↓ and ↵ pick the line and the shot whips up to the player bar. */
export function FindLineShot() {
  const frame = useCurrentFrame();
  return (
    <>
      <Whip at={WHIP_AT} length={WHIP_FRAMES} direction="up" from={<PaletteView />} to={<BarView t={0} />} />
      <Keys labels={["⌘", "K"]} at={KEY_AT} out={KEYS_OUT} />
      <Keys labels={["↓"]} at={DOWN_AT} out={DOWN_AT + 22} enterAt={DOWN_AT} />
      <Keys labels={["↵"]} at={ENTER_AT} enterAt={ENTER_AT} />
      <ShotChip text="search by lyric" from={RESULTS_AT + 6} out={LINE_IN - 8} right={72} />
      {frame >= LINE_IN - 2 && frame < LINE_OUT + 24 ? (
        <div
          style={{
            position: "absolute",
            left: 72,
            top: 64,
            background: "color-mix(in oklch, var(--background) 84%, transparent)",
            padding: "6px 26px 0",
          }}
        >
          <MaskLine from={LINE_IN} out={LINE_OUT} length={16}>
            <span data-legible="" style={{ fontSize: 68, fontWeight: 600, letterSpacing: "-0.03em", color: "var(--foreground)" }}>
              i keep the lights on
            </span>
          </MaskLine>
        </div>
      ) : null}
    </>
  );
}
