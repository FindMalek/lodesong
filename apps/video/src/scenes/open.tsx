import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { COPY } from "../copy";
import { beat, FPS } from "../design/beat";
import { DitherWipe } from "../design/dither-wipe";
import { Label, MaskLine } from "../design/kinetic";
import { useLayout } from "../design/layout";
import { ease, hash, lerp, ramp } from "../design/motion";
import { Shell } from "../design/shell";
import { useSongSeconds } from "../design/song-clock";
import { ALBUM_SLOT, APP_VIEW, AppStage, type AppView, stageToScreen } from "../ui/app-stage";
import { DitherCover } from "../ui/dither-cover";
import { GoldTransit, type Spot } from "../ui/gold-transit";
import { LYRICS_COVER, LyricsCloseUp } from "../ui/lyrics-close-up";
import { LABEL_FADE } from "./open-timeline";
import { OPEN, type OpenTimeline } from "./timelines";

const FOCUS_FROM = 2;

const slotSpot = (view: AppView): Spot => {
  const c = stageToScreen(view, ALBUM_SLOT.x + ALBUM_SLOT.size / 2, ALBUM_SLOT.y + ALBUM_SLOT.size / 2);
  return { cx: c.x, cy: c.y, size: ALBUM_SLOT.size * view.scale };
};

/** The opening shot: the line, the lyrics close-up with the one gold moment, and (wide only) the app, full frame, with the gold cover shrinking into its album slot. */
export function OpenShot({ tl }: { tl?: OpenTimeline }) {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const { layout } = useLayout();
  const tall = layout === "tall";
  const T = tl ?? OPEN[layout];
  const time = frame / FPS;
  const cut = beat(T.cut);
  const hasApp = !tall && T.cut < T.end;
  const inCloseUp = frame >= beat(T.chip) && frame < cut;

  const scrolled = (T.scroll ?? []).reduce((sum, at) => sum + ramp(frame, beat(at), beat(0.5)), 0);
  const focus = FOCUS_FROM + ramp(frame, beat(T.ignite), beat(0.5)) + ramp(frame, beat(T.advance), beat(0.5)) + scrolled;
  const ignite = ramp(frame, beat(T.ignite), beat(0.5));
  const pulse = ramp(frame, beat(T.ignite), beat(0.25)) - ramp(frame, beat(T.ignite) + beat(0.25), beat(1));

  const wideT = ramp(frame, cut, beat(T.end) - cut, ease.inOut);
  const view: AppView = {
    scale: lerp(APP_VIEW.from.scale, APP_VIEW.to.scale, wideT),
    cx: lerp(APP_VIEW.from.cx, APP_VIEW.to.cx, wideT),
    cy: lerp(APP_VIEW.from.cy, APP_VIEW.to.cy, wideT),
  };
  const landing = ramp(frame, cut, beat(1.25), ease.inOut);
  const bars = [0, 1, 2, 3].map((i) => 0.25 + 0.75 * hash(Math.floor(frame / beat(0.25)) + i * 13));
  const position = useSongSeconds();

  const headlineOut = beat(T.headlineOut);
  const gone = ramp(frame, headlineOut, beat(0.5));
  const headFont = tall ? 150 : 176;
  const left = tall ? 90 : 168;
  const texture = 0.16 + 0.34 * (1 - ramp(frame, 0, beat(1.5)));

  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ opacity: texture * (1 - gone), maskImage: "radial-gradient(circle at 50% 50%, black 0, transparent 540px)" }}>
        <div style={{ position: "absolute", left: (width - 1080) / 2, top: (height - 1080) / 2 }}>
          <DitherCover id="lodesong-open" size={1080} time={time * 0.6} />
        </div>
      </AbsoluteFill>

      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: "50%",
          height: 1,
          background: "var(--border)",
          transform: `scaleX(${ramp(frame, 0, beat(1), ease.inOut)})`,
          opacity: 1 - gone,
        }}
      />

      <AbsoluteFill style={{ justifyContent: "center", paddingLeft: left }}>
        <div style={{ fontSize: headFont, fontWeight: 500, letterSpacing: "-0.045em", lineHeight: 1.02 }}>
          <MaskLine from={beat(T.music)} out={headlineOut}>
            {COPY.headline[0]}
          </MaskLine>
          <MaskLine from={beat(T.server)} out={headlineOut} style={{ color: "var(--muted-foreground)" }}>
            {COPY.headline[1]}
          </MaskLine>
        </div>
        <div
          style={{
            position: "absolute",
            left,
            bottom: tall ? 420 : 150,
            opacity: ramp(frame, beat(T.label), beat(LABEL_FADE)) * (1 - gone),
          }}
        >
          <Label>{COPY.label}</Label>
        </div>
      </AbsoluteFill>

      {inCloseUp ? (
        <LyricsCloseUp
          layout={layout}
          focus={focus}
          enter={ramp(frame, beat(T.chip) + beat(0.25), beat(1))}
          ignite={ignite}
          pulse={pulse}
          develop={ramp(frame, beat(T.chip), beat(T.ignite - T.chip), ease.inOut)}
          time={time * 0.5}
          chip={ramp(frame, beat(T.chip), beat(1))}
          press={ramp(frame, beat(T.press), beat(0.125)) - ramp(frame, beat(T.press) + beat(0.25), beat(0.25))}
        />
      ) : null}

      {hasApp && frame >= cut ? (
        <>
          <AppStage view={view} focus={focus} bars={bars} position={position} time={time} coverOpacity={landing >= 1 ? 1 : 0} />
          <GoldTransit from={LYRICS_COVER} to={slotSpot(view)} progress={landing} time={time} />
        </>
      ) : null}
      <DitherWipe />
      {hasApp ? <DitherWipe from={cut} /> : null}
    </AbsoluteFill>
  );
}

/** The proof scene on its own: the opening shot in the shared shell with its own placeholder score. */
export function Open({ probe = false }: { probe?: boolean }) {
  return (
    <Shell audio="audio/open.wav" probe={probe}>
      <OpenShot tl={OPEN.wide} />
    </Shell>
  );
}
