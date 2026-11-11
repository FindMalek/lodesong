import type { ComponentType, CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Img, Sequence, useCurrentFrame } from "remotion";
import { plateBox, plateSrc } from "../../captures/film-manifest";
import { clock, FILM } from "../../copy";
import { Cursor, type CursorStop } from "../../design/cursor";
import { ease, hash, lerp, ramp } from "../../design/motion";
import { Shell } from "../../design/shell";
import { Caret, typingFrames } from "../../design/typing";
import { Keycap, pressAt } from "../../ui/keycap";
import { type IslandState, NotchIsland } from "../../ui/s9-notch-island";
import { TerminalMock } from "../../ui/s9-terminal-mock";
import { B, DotIn, dotMask, GOLD, LAP, Lifted, PlateShot, Say, type ViewKey } from "./kit";
import { CoverWall } from "./wall";

const p = plateSrc;

interface ShotProps {
  frames: number;
}

const LANDING = { x: 150, y: 170, size: 740 };

/** The hook: the whole library bursts out of one gold point, locks into a wall, and the camera falls into the cover that is playing. */
function WallShot() {
  return (
    <AbsoluteFill>
      <CoverWall timing={{ burst: 20, ripples: [44, 74, 104], pick: 124, dive: 132, end: 186 }} landing={LANDING} />
      <Say text="your music." from={186} x={1000} y={452} size={150} scrim={false} />
    </AbsoluteFill>
  );
}

const TYPE_FROM = 8;
const SKIP = 3;
const TYPE_STEP = 5;
const TYPED = 11;
const PICK_AT = 3 * B;
const ENTER_AT = 5.5 * B;
const PUSH_AT = ENTER_AT + 6;
/** The found line in the palette, in plate px, and the framing that puts it exactly where the lyrics page will light it. */
const HIT = { x: 428, y: 233 };
const LYRIC_OPEN = { x: 596, y: 196, w: 600 };
const LYRIC_LINE = { x: 616, y: 366 };
const MATCH_W = 232;
const MATCH = {
  x: HIT.x - ((LYRIC_LINE.x - LYRIC_OPEN.x) * MATCH_W) / LYRIC_OPEN.w,
  y: HIT.y - ((LYRIC_LINE.y - LYRIC_OPEN.y) * MATCH_W) / LYRIC_OPEN.w,
  w: MATCH_W,
};

const FIND_KEYS: ViewKey[] = [
  { at: 0, view: { x: 388, y: 100, w: 430 } },
  { at: 2.2, view: { x: 372, y: 96, w: 600 } },
  { at: 3, view: { x: 366, y: 104, w: 640 } },
  { at: PUSH_AT / B, view: { x: 372, y: 118, w: 520 } },
  { at: 8, view: MATCH },
];

function KeyRow({ at, labels, hold, wide = false }: { at: number; labels: readonly string[]; hold: number; wide?: boolean }) {
  const frame = useCurrentFrame();
  const rise = ramp(frame, at - 6, 6);
  const leave = ramp(frame, at + hold, 6, ease.in);
  if (rise <= 0 || leave >= 1) return null;
  return (
    <div style={{ position: "absolute", right: 96, bottom: 84, display: "flex", gap: 14, opacity: rise * (1 - leave) }}>
      {labels.map((label) => (
        <Keycap key={label} label={label} size={112} bright wide={wide} press={pressAt(frame, at, 3, 9)} />
      ))}
    </div>
  );
}

/** Half a lyric typed into the real palette: every song that sings it answers as you type, one is left standing, and the camera falls into its line. */
function SearchShot({ frames }: ShotProps) {
  const frame = useCurrentFrame();
  const typed = Array.from({ length: TYPED - SKIP }, (_, i) => ({
    src: p("find-slowly", `type-${String(i + SKIP + 1).padStart(2, "0")}`),
    from: TYPE_FROM + i * TYPE_STEP,
  }));
  const picked = ramp(frame, PICK_AT, 16);
  const push = ramp(frame, PUSH_AT, frames - PUSH_AT, ease.in);
  return (
    <AbsoluteFill style={{ background: "#000", filter: push > 0.25 ? `blur(${((push - 0.25) * 9).toFixed(1)}px)` : undefined }}>
      <PlateShot
        plates={[
          { src: p("find-slowly", "type-03"), from: 0 },
          ...typed,
          { src: p("find-slowly", "results"), from: TYPE_FROM + (TYPED - SKIP) * TYPE_STEP },
        ]}
        keys={FIND_KEYS}
        ease={frame >= PUSH_AT ? "in" : "inOut"}
      >
        <div
          style={{ position: "absolute", left: 381, top: 267, width: 678, height: 190, background: `rgb(22 22 22 / ${0.86 * picked})` }}
        />
        <div style={{ position: "absolute", left: 381, top: 183, width: 678, height: 34, background: `rgb(22 22 22 / ${0.5 * push})` }} />
      </PlateShot>
      <KeyRow at={ENTER_AT} labels={["enter"]} hold={14} wide />
      <Say text="half a lyric" from={PICK_AT + 10} to={ENTER_AT + 2} x={1010} y={520} size={104} scrim={false} />
      <Say text="is enough." from={PICK_AT + 18} to={ENTER_AT + 2} x={1010} y={636} size={104} scrim={false} />
    </AbsoluteFill>
  );
}

const WORD_AT = [0, 12, 24, 36, 48, 60];
const CLICK_AT = 4 * B;
const WHIP = 8;

const LYRIC_KEYS: ViewKey[] = [
  { at: 0, view: LYRIC_OPEN },
  { at: 4, view: { x: 590, y: 190, w: 620 } },
  { at: 4 + WHIP / B, view: { x: 590, y: 261, w: 620 } },
  { at: 8, view: { x: 600, y: 268, w: 590 } },
];

const LYRIC_CURSOR: CursorStop[] = [
  { at: 2.2, x: 1170, y: 500 },
  { at: 4, x: 840, y: 440, click: true, dwell: 0.5 },
  { at: 6, x: 1150, y: 600 },
];

/** Staging, not retouching: the lines that are not being sung fall back so the lit one carries the frame. */
function Spot({ y, depth }: { y: number; depth: number }) {
  const shade = `rgb(13 13 13 / ${depth})`;
  return (
    <>
      <div style={{ position: "absolute", left: 560, right: 0, top: 0, height: y - 6, background: shade }} />
      <div style={{ position: "absolute", left: 560, right: 0, top: y + 49, bottom: 0, background: shade }} />
    </>
  );
}

/** The drop, on the very line that was found: it lights a word at a time, then one click throws the song to another line. */
function LyricsShot() {
  const frame = useCurrentFrame();
  const punch = lerp(1.06, 1, ramp(frame, 0, 16));
  const cursor = ramp(frame, 2.2 * B, 8) * (1 - ramp(frame, 5.6 * B, 10, ease.in));
  const whip = frame >= CLICK_AT && frame < CLICK_AT + WHIP ? Math.sin(((frame - CLICK_AT) / WHIP) * Math.PI) : 0;
  const clicked = frame >= CLICK_AT;
  return (
    <AbsoluteFill style={{ transform: `scale(${punch})` }}>
      <AbsoluteFill style={{ filter: whip > 0.05 ? "url(#lyric-whip)" : undefined }}>
        <svg aria-hidden width={0} height={0} style={{ position: "absolute" }}>
          <filter id="lyric-whip" x="-5%" y="-30%" width="110%" height="160%">
            <feGaussianBlur stdDeviation={`0 ${(whip * 26).toFixed(1)}`} />
          </filter>
        </svg>
        <PlateShot
          plates={[
            ...WORD_AT.map((from, i) => ({ src: p("lyrics-full", `word-04-${i}`), from })),
            { src: p("lyrics-full", "click-line"), from: CLICK_AT },
          ]}
          keys={LYRIC_KEYS}
        >
          <Spot y={clicked ? 416 : 344.75} depth={clicked ? 0.72 : 0.6} />
          <div style={{ opacity: cursor, filter: "grayscale(1) brightness(1.6)" }}>
            <Cursor stops={LYRIC_CURSOR} size={18} />
          </div>
        </PlateShot>
      </AbsoluteFill>
      <Say text="it plays from there." from={CLICK_AT + 22} x={1130} y={880} size={76} scrim={false} />
    </AbsoluteFill>
  );
}

const BAR = { x: 110, y: 540, w: 1700 };
const LIST_AT = 190;
const COLUMNS = 100;
const WAVE = Array.from(
  { length: COLUMNS },
  (_, i) => 2 + Math.round(7 * (0.5 + 0.5 * Math.sin(i * 0.37) * Math.sin(i * 0.11 + 1)) * (0.45 + 0.55 * hash(i * 5.3))),
);
const PRESSES = [24, 84, 144];
const TOAST = plateBox("moments-save", "saved", "toast");

/** Saving a moment: the gold point is the playhead, every press of b leaves a mark, and the marks become the list you come back to. */
function MomentsShot({ frames }: ShotProps) {
  const frame = useCurrentFrame();
  const first = PRESSES[0] ?? 0;
  const at = (f: number): number => 0.62 * Math.max(0, (f - first) / (frames - first));
  const head = BAR.x + BAR.w * at(frame);
  const toast = ramp(frame, first, 12) * (1 - ramp(frame, first + 45, 10, ease.in));
  const kept = ramp(frame, LIST_AT, 18);
  return (
    <AbsoluteFill style={{ background: "#060606" }}>
      <div style={{ position: "absolute", left: BAR.x, top: 96, fontSize: 40, color: "#8f8f8f" }}>
        Static Mirror at Night · Orchard Static
      </div>
      {WAVE.map((dots, i) => {
        const x = BAR.x + (i + 0.5) * (BAR.w / COLUMNS);
        const played = x <= head;
        return Array.from({ length: dots }, (_, k) => (
          <i
            key={`${String(i)}-${String(k)}`}
            style={{
              position: "absolute",
              left: x - 5,
              top: BAR.y - 5 - (k - (dots - 1) / 2) * 19,
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: played ? "#ededed" : "#3a3a3a",
            }}
          />
        ));
      })}
      {PRESSES.map((press) => {
        const drop = ramp(frame, press, 10);
        if (drop <= 0) return null;
        const x = BAR.x + BAR.w * at(press);
        const ring = ramp(frame, press, 26);
        return (
          <div key={press}>
            <div
              style={{
                position: "absolute",
                left: x - 3,
                top: BAR.y - lerp(190, 120, drop),
                width: 6,
                height: 240,
                background: "#fff",
                opacity: drop,
              }}
            />
            <div
              style={{
                position: "absolute",
                left: x - 90 * ring,
                top: BAR.y - 90 * ring,
                width: 180 * ring,
                height: 180 * ring,
                borderRadius: "50%",
                border: "2px solid #fff",
                opacity: 0.7 * (1 - ring),
              }}
            />
          </div>
        );
      })}
      <div
        style={{
          position: "absolute",
          left: head - 15,
          top: BAR.y - 15,
          width: 30,
          height: 30,
          background: GOLD,
          boxShadow: `0 0 30px ${GOLD}`,
        }}
      />
      <div style={{ position: "absolute", left: BAR.x, top: BAR.y + 130, fontFamily: "var(--font-mono)", fontSize: 44, color: "#cfcfcf" }}>
        {clock(258 * at(frame))}
      </div>
      <div
        style={{
          position: "absolute",
          left: BAR.x + BAR.w - 108,
          top: BAR.y + 130,
          fontFamily: "var(--font-mono)",
          fontSize: 44,
          color: "#6f6f6f",
        }}
      >
        4:18
      </div>
      <div style={{ position: "absolute", right: 110, top: 70 }}>
        <Keycap label="b" size={240} bright press={Math.max(...PRESSES.map((press) => pressAt(frame, press, 3, 10)))} />
      </div>
      <div style={{ position: "absolute", left: 1920 - 110 - 356 * 2.4, top: lerp(1090, 760, toast), opacity: Math.min(1, toast * 2) }}>
        <Lifted src={p("moments-save", "saved")} box={TOAST} width={356 * 2.4} style={{ boxShadow: "0 30px 90px rgb(0 0 0 / 0.8)" }} />
      </div>
      <div style={{ position: "absolute", left: (1920 - 1320) / 2, top: lerp(800, 730, kept), opacity: Math.min(1, kept * 2) }}>
        <Lifted src={p("moments-save", "moments")} box={{ x: 220, y: 140, w: 330, h: 84 }} width={1320} />
      </div>
      <Say text="keep the second that got you." from={112} size={100} x={BAR.x} y={176} scrim={false} />
    </AbsoluteFill>
  );
}

const MIXES = ["daily mix 1", "daily mix 2", "daily mix 3", "daily mix 4", "daily mix 5", "discover weekly"] as const;
const TILE = 500;
const GUTTER = 22;
const HERO = 860;
const OPEN_AT = 4.4 * B;
const TRACKS = [0, 1, 2, 3, 4].map((i) => ({ x: 226, y: 305 + i * 44, w: 290, h: 44 }));

function DotInAt({ at, children }: { at: number; children: ReactNode }) {
  const frame = useCurrentFrame();
  return <AbsoluteFill style={dotMask(ramp(frame, at, LAP, ease.inOut))}>{children}</AbsoluteFill>;
}

/** The mixes are made, not listed: six covers resolve out of the dot lattice, one on each eighth, until they are the frame; then the first one opens into its songs. */
function MixesShot() {
  const frame = useCurrentFrame();
  const home = p("home-mixes", "home");
  const mix = p("home-mixes", "mix");
  const open = ramp(frame, OPEN_AT, 20, ease.inOut);
  const side = TILE + GUTTER;
  return (
    <AbsoluteFill style={{ background: "#060606" }}>
      <Img src={home} style={{ position: "absolute", width: 1, height: 1, opacity: 0 }} />
      <Img src={mix} style={{ position: "absolute", width: 1, height: 1, opacity: 0 }} />
      <AbsoluteFill style={dotMask(0.16)}>
        <div style={{ position: "absolute", inset: 0, background: "#3a3a3a", opacity: 1 - open }} />
      </AbsoluteFill>
      {MIXES.map((name, i) => {
        const made = ramp(frame, 6 + i * 15, 18, ease.inOut);
        const first = i === 0;
        const x = (1920 - 3 * side + GUTTER) / 2 + (i % 3) * side;
        const y = (1080 - 2 * side + GUTTER) / 2 + Math.floor(i / 3) * side;
        const grown = first ? lerp(1, HERO / TILE, open) : 1;
        return (
          <div
            key={name}
            style={{
              position: "absolute",
              left: first ? lerp(x, 96, open) : x,
              top: first ? lerp(y, (1080 - HERO) / 2, open) : y,
              transformOrigin: "0 0",
              transform: `scale(${grown * lerp(0.94, 1, made)})`,
              opacity: first ? 1 : 1 - open,
              filter: "brightness(1.4)",
              ...dotMask(made),
            }}
          >
            <Lifted src={home} box={plateBox("home-mixes", "home", name)} width={TILE} />
          </div>
        );
      })}
      {TRACKS.map((row, i) => {
        const fly = ramp(frame, OPEN_AT + 8 + i * 4, 18);
        if (fly <= 0) return null;
        return (
          <div
            key={row.y}
            style={{
              position: "absolute",
              left: 1010,
              top: 300 + i * 136,
              opacity: fly,
              transform: `perspective(1200px) translateX(${lerp(260, 0, fly)}px) rotateY(${lerp(-30, 0, fly)}deg)`,
              transformOrigin: "0 50%",
            }}
          >
            <Lifted src={mix} box={row} width={820} />
          </div>
        );
      })}
      <Say text="made from what you play." from={OPEN_AT + 14} x={1010} y={150} size={68} scrim={false} />
    </AbsoluteFill>
  );
}

const STATS = [
  { label: "minutes", value: 647, note: "listened in this range" },
  { label: "plays", value: 194, note: "skips (under 30 s) not counted" },
  { label: "songs", value: 96, note: "different songs played" },
] as const;
const RECAP_AT = 5 * B;

/** The numbers are the picture: three counters from the real stats page fill the frame, then the month's recap. */
function StatsShot() {
  const frame = useCurrentFrame();
  const away = ramp(frame, RECAP_AT - 8, 10, ease.in);
  const recap = ramp(frame, RECAP_AT, 16);
  return (
    <AbsoluteFill style={{ background: "#060606", fontFamily: "var(--font-mono)" }}>
      {STATS.map((stat, i) => {
        const run = ramp(frame, 4 + i * 30, 44);
        const rise = ramp(frame, 4 + i * 30, 14);
        return (
          <div
            key={stat.label}
            style={{
              position: "absolute",
              left: 96 + i * 620,
              top: 300 - away * 80,
              opacity: Math.min(1, rise * 2) * (1 - away),
              transform: `translateY(${lerp(60, 0, rise)}px)`,
            }}
          >
            <div style={{ fontSize: 48, color: "#9a9a9a" }}>{stat.label}</div>
            <div data-legible="" style={{ fontSize: 310, fontWeight: 500, letterSpacing: "-0.06em", lineHeight: 1.08, color: "#fff" }}>
              {Math.round(stat.value * run)}
            </div>
            <div style={{ fontSize: 30, color: "#6f6f6f", fontFamily: "var(--font-sans)" }}>{stat.note}</div>
          </div>
        );
      })}
      {recap > 0 ? (
        <div
          style={{
            position: "absolute",
            left: 96,
            top: 230,
            opacity: Math.min(1, recap * 2),
            transform: `translateY(${lerp(60, 0, recap)}px)`,
          }}
        >
          <div style={{ fontSize: 48, color: "#9a9a9a" }}>your november 2026 in music</div>
          <div data-legible="" style={{ fontSize: 350, fontWeight: 500, letterSpacing: "-0.06em", lineHeight: 1.05, color: "#fff" }}>
            {Math.round(11 * ramp(frame, RECAP_AT, 12))} hours
          </div>
          <div style={{ fontSize: 40, color: "#8f8f8f", fontFamily: "var(--font-sans)" }}>194 plays · 96 different songs</div>
        </div>
      ) : null}
    </AbsoluteFill>
  );
}

const LOOKS = ["look-paper", "look-slate", "look-terminal", "look-soft"] as const;
const KEYS_AT = 4.6 * B;

function wipe(progress: number, dotted: boolean): CSSProperties {
  const edge = lerp(-30, 130, progress) - (dotted ? 0 : 16);
  const sweep = `linear-gradient(115deg, #000 ${edge.toFixed(1)}%, transparent ${(edge + 0.2).toFixed(1)}%)`;
  if (!dotted) return { maskImage: sweep, WebkitMaskImage: sweep };
  const dots = "radial-gradient(circle at center, #000 7px, transparent 7.8px)";
  return {
    maskImage: `${sweep}, ${dots}`,
    WebkitMaskImage: `${sweep}, ${dots}`,
    maskSize: "100% 100%, 22px 22px",
    WebkitMaskSize: "100% 100%, 22px 22px",
    maskComposite: "intersect",
    WebkitMaskComposite: "source-in",
  };
}

const cover: CSSProperties = { position: "absolute", inset: 0, width: "100%", height: "100%" };

/** One screen, four looks, a beat each, swept in by a dithered edge; then one key given a new job. */
function CustomShot({ frames }: ShotProps) {
  const frame = useCurrentFrame();
  const scale = lerp(
    1.02,
    1.1,
    ramp(frame, 0, KEYS_AT, (t) => t),
  );
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <AbsoluteFill style={{ transform: `scale(${scale})` }}>
        <Img src={p("albums", "albums")} style={cover} />
        {LOOKS.map((look, i) => {
          const progress = ramp(frame, 10 + i * 28, 22, ease.inOut);
          if (progress <= 0) return null;
          const src = p(look, "albums");
          return (
            <div key={look}>
              <Img src={src} style={{ ...cover, ...wipe(progress, true) }} />
              <Img src={src} style={{ ...cover, ...wipe(progress, false) }} />
            </div>
          );
        })}
      </AbsoluteFill>
      {frame >= KEYS_AT ? (
        <DotInAt at={KEYS_AT}>
          <PlateShot
            plates={[
              { src: p("shortcuts-sheet", "sheet"), from: 0 },
              { src: p("rebind", "rebinding"), from: KEYS_AT + 30 },
              { src: p("rebind", "rebound"), from: KEYS_AT + 62 },
            ]}
            keys={[
              { at: KEYS_AT / B, view: { x: 384, y: 96, w: 600 } },
              { at: frames / B, view: { x: 388, y: 110, w: 540 } },
            ]}
          />
          <div style={{ position: "absolute", right: 130, top: 300, opacity: ramp(frame, KEYS_AT + 30, 6) }}>
            <Keycap label="x" size={300} bright press={pressAt(frame, KEYS_AT + 62, 3, 12)} />
          </div>
        </DotInAt>
      ) : null}
      <Say text="any look. every key." from={KEYS_AT + 66} size={92} />
    </AbsoluteFill>
  );
}

const NOTCH_W = 1536;

function islandAt(frame: number): IslandState {
  const seconds = 76 + frame / 60;
  return {
    p: 2 * ramp(frame, 4, 10, ease.inOut),
    hide: 0,
    progress: seconds / 222,
    played: clock(seconds),
    left: `-${clock(222 - seconds)}`,
    bars: [0, 1, 2, 3].map(
      (i) => 0.12 + 0.88 * (0.6 * (0.5 + 0.5 * Math.sin(frame * (0.33 + i * 0.07) + i * 1.9)) + 0.4 * hash(Math.floor(frame / 3) * 4 + i)),
    ),
    lyrics: ramp(frame, 1.4 * B, 10, ease.inOut),
    title: "static mirror at night",
    artist: "orchard static",
  };
}

const PHONE_H = 1240;
const PHONE_W = Math.round((PHONE_H * 390) / 844);

const POINT_AT = 30;

function PhonePart() {
  const frame = useCurrentFrame();
  const arrive = ramp(frame, 0, 18);
  const drawn = ramp(frame, 6, 12, ease.inOut);
  const travel = ramp(frame, POINT_AT - 14, 14, ease.inOut);
  const lit = ramp(frame, POINT_AT, 10);
  const bar = p("devices", "handed-off");
  const along = (t: number): { x: number; y: number } => {
    const u = 1 - t;
    return {
      x: u * u * u * 1000 + 3 * u * u * t * 1120 + 3 * u * t * t * 1100 + t * t * t * 1232,
      y: u * u * u * 398 + 3 * u * u * t * 398 + 3 * u * t * t * 982 + t * t * t * 982,
    };
  };
  return (
    <AbsoluteFill style={{ background: "#060606" }}>
      <Img src={bar} style={{ position: "absolute", width: 1, height: 1, opacity: 0 }} />
      <div style={{ position: "absolute", left: 96, top: 300, border: "1px solid #2a2a2a", opacity: arrive }}>
        <Lifted src={bar} box={{ x: 0, y: 745, w: 300, h: 65 }} width={900} />
      </div>
      <svg aria-hidden width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
        <path
          d="M 1000 398 C 1120 398, 1100 982, 1232 982"
          fill="none"
          stroke="var(--color-muted-foreground)"
          strokeWidth={3}
          strokeDasharray={700}
          strokeDashoffset={700 * (1 - drawn)}
        />
      </svg>
      <div
        style={{
          position: "absolute",
          left: 1210,
          top: -150,
          width: PHONE_W,
          height: PHONE_H,
          overflow: "hidden",
          borderRadius: 60,
          border: "4px solid #303030",
          background: "#101010",
          transform: `translateY(${lerp(160, 0, arrive)}px)`,
          boxShadow: `0 60px 160px rgb(0 0 0 / 0.9), 0 0 ${80 * lit}px rgb(255 255 255 / ${0.14 * lit})`,
        }}
      >
        <Img src={p("devices", "phone-before")} style={cover} />
        <Img src={p("devices", "phone-after")} style={{ ...cover, opacity: frame >= POINT_AT ? 1 : 0 }} />
      </div>
      {travel > 0 && frame < POINT_AT + 8
        ? [0, 0.04, 0.08, 0.12, 0.16].map((lag, i) => {
            const at = along(Math.max(0, travel - lag));
            const size = 18 - i * 3;
            return (
              <div
                key={lag}
                style={{
                  position: "absolute",
                  left: at.x - size / 2,
                  top: at.y - size / 2,
                  width: size,
                  height: size,
                  background: GOLD,
                  opacity: (1 - i * 0.2) * (1 - ramp(frame, POINT_AT, 8)),
                  boxShadow: i === 0 ? `0 0 26px ${GOLD}` : undefined,
                }}
              />
            );
          })
        : null}
    </AbsoluteFill>
  );
}

function NotchPart() {
  const frame = useCurrentFrame();
  const scale = lerp(1.62, 1.44, ramp(frame, 0, 40)) + 0.0006 * frame;
  return (
    <AbsoluteFill style={{ background: "#070707" }}>
      <div style={{ position: "absolute", inset: 0, transform: `translateY(90px) scale(${scale})`, transformOrigin: "50% 0" }}>
        <div style={{ position: "absolute", left: (1920 - NOTCH_W) / 2, top: 0 }}>
          <NotchIsland state={islandAt(frame)} width={NOTCH_W} />
        </div>
      </div>
    </AbsoluteFill>
  );
}

const COMMAND_LANDS = typingFrames("/lodesong pause", 0, 3).map((at) => 10 + Math.round(at * 0.8));
const TERMINAL_ENTER = 78;

function TerminalPart({ frames }: ShotProps) {
  const frame = useCurrentFrame();
  const scale = lerp(1.12, 1.2, ramp(frame, 0, frames, ease.inOut));
  return (
    <AbsoluteFill style={{ background: "#070707" }}>
      <div
        style={{
          position: "absolute",
          left: 210,
          top: 190,
          width: 1500,
          height: 500,
          transform: `scale(${scale})`,
          background: "#111",
          border: "1px solid #2a2a2a",
          boxShadow: "0 50px 140px rgb(0 0 0 / 0.7)",
        }}
      >
        <TerminalMock
          frame={frame}
          landings={COMMAND_LANDS}
          enter={TERMINAL_ENTER}
          seconds={Math.min(78 + frame / 60, 78 + TERMINAL_ENTER / 60)}
        />
      </div>
    </AbsoluteFill>
  );
}

const PARTS: readonly { id: string; from: number; frames: number; component: ComponentType<ShotProps> }[] = [
  { id: "phone", from: 0, frames: 105, component: PhonePart },
  { id: "notch", from: 105, frames: 120, component: NotchPart },
  { id: "terminal", from: 225, frames: 135, component: TerminalPart },
];

/** One song, three more places: the phone, the notch, the terminal, each condensing out of the last. */
function EverywhereShot() {
  return (
    <AbsoluteFill>
      {PARTS.map((part, i) => {
        const Part = part.component;
        const last = i === PARTS.length - 1;
        const body = <Part frames={part.frames} />;
        return (
          <Sequence key={part.id} from={part.from} durationInFrames={part.frames + (last ? 0 : LAP)} premountFor={30}>
            {i === 0 ? body : <DotIn>{body}</DotIn>}
          </Sequence>
        );
      })}
      <Say text="one session. everywhere." from={POINT_AT} size={92} x={96} y={560} scrim={false} to={98} />
    </AbsoluteFill>
  );
}

const DOCKER = FILM.end.docker.join("\n");
const TYPED_BY = 58;

function ServerShot() {
  const frame = useCurrentFrame();
  const count = Math.round(DOCKER.length * ramp(frame, 4, TYPED_BY - 4, (t) => t));
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <div
        style={{
          position: "absolute",
          left: 178,
          top: 300,
          fontFamily: "var(--font-mono)",
          fontSize: 44,
          lineHeight: 1.7,
          color: "#e8e8e8",
          whiteSpace: "pre",
        }}
      >
        <span style={{ color: "#6f6f6f" }}>$ </span>
        {DOCKER.slice(0, count)}
        <Caret frame={frame} typing={count < DOCKER.length} size={44} color={GOLD} />
      </div>
      <Say text="your server." from={TYPED_BY + 2} x={178} y={690} size={170} scrim={false} />
    </AbsoluteFill>
  );
}

function Line({ at, size, style, children }: { at: number; size: number; style?: CSSProperties; children: ReactNode }) {
  const frame = useCurrentFrame();
  const rise = ramp(frame, at, 18);
  return (
    <div style={{ overflow: "hidden", paddingBottom: size * 0.2, ...style }}>
      <div
        data-legible={rise >= 1 ? "" : undefined}
        style={{ fontSize: size, lineHeight: 1.1, transform: `translateY(${lerp(120, 0, rise)}%)`, whiteSpace: "nowrap" }}
      >
        {children}
      </div>
    </div>
  );
}

/** The name condenses out of dots, the line and the address land under it, and it folds back into the gold point the film opened on. */
function EndShot({ frames }: ShotProps) {
  const frame = useCurrentFrame();
  const fold = ramp(frame, frames - 22, 14, ease.in);
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
          transform: `scale(${1 + 0.03 * ramp(frame, 0, frames, (t) => t)})`,
          ...dotMask(Math.min(ramp(frame, 0, 16, ease.inOut), 1 - fold)),
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 44 }}>
          <svg aria-hidden width={150} height={150} viewBox="8 8 48 48" style={{ color: "var(--foreground)" }}>
            <path d="M8 8h48v16H29v10H8zM8 40h27V30h21v26H8z" fill="currentColor" />
          </svg>
          <div
            data-legible=""
            style={{
              fontFamily: "var(--font-mono)",
              fontWeight: 500,
              fontSize: 208,
              letterSpacing: "-0.04em",
              lineHeight: 1,
              color: "#fff",
            }}
          >
            lodesong
          </div>
        </div>
        <Line at={12} size={62} style={{ marginTop: 56, color: "#fff", letterSpacing: "-0.03em", fontWeight: 500 }}>
          your music. <span style={{ color: "#8f8f8f" }}>your server.</span>
        </Line>
        <Line at={22} size={38} style={{ marginTop: 40, fontFamily: "var(--font-mono)", color: "#cfcfcf" }}>
          {FILM.end.url}
        </Line>
      </AbsoluteFill>
      <div
        style={{
          position: "absolute",
          left: 951,
          top: 531,
          width: 18,
          height: 18,
          background: GOLD,
          opacity: fold,
          boxShadow: `0 0 ${40 * fold}px ${GOLD}`,
        }}
      />
    </AbsoluteFill>
  );
}

interface Shot {
  id: string;
  beats: number;
  component: ComponentType<ShotProps>;
  /** a hard cut: the shot does not condense out of the one before it */
  hard?: boolean;
}

const SHOTS: readonly Shot[] = [
  { id: "wall", beats: 8, component: WallShot, hard: true },
  { id: "search", beats: 8, component: SearchShot },
  { id: "lyrics", beats: 8, component: LyricsShot, hard: true },
  { id: "moments", beats: 8, component: MomentsShot },
  { id: "mixes", beats: 8, component: MixesShot },
  { id: "stats", beats: 8, component: StatsShot },
  { id: "custom", beats: 8, component: CustomShot },
  { id: "everywhere", beats: 12, component: EverywhereShot },
  { id: "server", beats: 4, component: ServerShot },
  { id: "end", beats: 4, component: EndShot, hard: true },
];

export const ANTHEM_FRAMES = SHOTS.reduce((sum, shot) => sum + shot.beats, 0) * B;

export function Anthem({ probe, audio = "audio/anthem.wav" }: { probe?: boolean; audio?: string | null }) {
  let at = 0;
  return (
    <Shell audio={audio ?? undefined} probe={probe} grainOutAt={ANTHEM_FRAMES - 12}>
      {SHOTS.map((shot, i) => {
        const from = at * B;
        at += shot.beats;
        const Scene = shot.component;
        const frames = shot.beats * B;
        const next = SHOTS[i + 1];
        const lapped = next && !next.hard ? LAP : 0;
        const body = <Scene frames={frames} />;
        return (
          <Sequence
            key={shot.id}
            from={from}
            durationInFrames={frames + lapped}
            premountFor={60}
            styleWhilePremounted={{ display: "flex", opacity: 0.004 }}
            name={shot.id}
          >
            {shot.hard ? body : <DotIn>{body}</DotIn>}
          </Sequence>
        );
      })}
    </Shell>
  );
}
