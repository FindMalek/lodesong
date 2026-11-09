import { Sequence, useCurrentFrame } from "remotion";
import type { ShotCue } from "../captures/types";
import { Whip } from "../design/whip";
import { ShotChip } from "../ui/s1-chip";
import { PaletteView } from "../ui/s2-palette-view";
import { BarView, IGNITE_AT, LIFT_AT, lyricCues } from "../ui/s3-bar";
import { S2_FRAMES, WHIP_AT, WHIP_FRAMES } from "./s2-palette";

/** The whip began in S2: this shot opens `S2_FRAMES - WHIP_AT` frames into it. */
const WHIP_DONE = WHIP_AT + WHIP_FRAMES - S2_FRAMES;

const S3_UNSORTED: readonly ShotCue[] = [
  { shot: "play-line", at: 0, kind: "impact", label: "the drop: the song starts mid-song" },
  { shot: "play-line", at: IGNITE_AT, kind: "kick", label: "kick enters, cover ignites gold" },
  { shot: "play-line", at: IGNITE_AT + 3, kind: "ping", label: "bell on the ignite" },
  { shot: "play-line", at: IGNITE_AT + 8, kind: "tick", label: "seek fill jumps to the line" },
  { shot: "play-line", at: 148, kind: "tick", label: "lyric scrolls to the next line" },
  { shot: "play-line", at: LIFT_AT, kind: "swell", label: "cover lifts out of the bar" },
  ...lyricCues.map((cue): ShotCue => ({ shot: "play-line", at: cue.at, kind: "ping", label: `sung: ${cue.text}` })),
];

export const S3_CUES: readonly ShotCue[] = [...S3_UNSORTED].sort((a, b) => a.at - b.at);

/** S3: the whip lands on the real player bar, the cover ignites gold and the seek track fills to the line, then the cover lifts into the lyric. */
export function PlayLineShot() {
  const frame = useCurrentFrame();
  return (
    <>
      <Whip
        at={-(S2_FRAMES - WHIP_AT)}
        length={WHIP_FRAMES}
        direction="up"
        from={
          <Sequence layout="none" from={-S2_FRAMES}>
            <PaletteView />
          </Sequence>
        }
        to={<BarView t={frame} />}
      />
      <ShotChip text="play from line" from={WHIP_DONE + 2} out={LIFT_AT + 34} right={72} />
    </>
  );
}
