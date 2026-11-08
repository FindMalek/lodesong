import { SearchIcon } from "lucide-react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { FILM } from "../copy";
import { beat, FPS } from "../design/beat";
import { Camera, camAt, Layer } from "../design/camera";
import { Caption } from "../design/caption";
import { DitherWipe } from "../design/dither-wipe";
import { Label } from "../design/kinetic";
import { ease, hash, lerp, ramp } from "../design/motion";
import { useSongSeconds } from "../design/song-clock";
import { Caret, typedCount, typingFrames } from "../design/typing";
import { APP_VIEW, AppStage, type AppView } from "../ui/app-stage";
import { Keycap, pressAt } from "../ui/keycap";
import { KEYS } from "./timelines";

const LANDINGS = typingFrames(FILM.keys.query, beat(KEYS.type), 3);
const CHORD_AT = beat(KEYS.chord);
const ENTER_AT = beat(KEYS.enter);
const CUT = beat(KEYS.cut);
const SHEET_VIEW: AppView = { scale: 1.5, cx: 640, cy: 360 };

const reveal = (t: number) => ({ clipPath: `inset(0 0 ${(1 - t) * 100}% 0)` });

function Palette({ frame }: { frame: number }) {
  const typed = FILM.keys.query.slice(0, typedCount(frame, LANDINGS));
  const open = ramp(frame, CHORD_AT, beat(0.75));
  const flash = ramp(frame, ENTER_AT, beat(0.125)) - ramp(frame, ENTER_AT + beat(0.25), beat(0.25));
  const played = ramp(frame, ENTER_AT + beat(0.25), beat(0.5));
  return (
    <div
      style={{
        position: "absolute",
        left: 640,
        top: 170,
        width: 1220,
        background: "var(--background)",
        border: "1px solid color-mix(in oklch, var(--foreground) 30%, transparent)",
        boxShadow: "0 60px 160px rgb(0 0 0 / 0.7)",
        ...reveal(open),
      }}
    >
      <div
        style={{ height: 124, display: "flex", alignItems: "center", gap: 26, padding: "0 40px", borderBottom: "1px solid var(--border)" }}
      >
        <SearchIcon size={48} style={{ opacity: 0.6 }} />
        <div data-legible="" style={{ fontSize: 56, fontWeight: 500, letterSpacing: "-0.02em" }}>
          {typed}
          <Caret frame={frame} typing={frame < ENTER_AT} size={56} />
        </div>
      </div>
      {FILM.keys.results.map((row, index) => {
        const rise = ramp(frame, beat(KEYS.type) + beat(0.25) * index, beat(0.75));
        const chosen = index === 0;
        const inverse = chosen ? flash : 0;
        return (
          <div
            key={row.line}
            style={{
              height: 156,
              padding: "0 40px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              gap: 10,
              borderBottom: index < 2 ? "1px solid var(--border)" : "none",
              background: inverse > 0.5 ? "var(--foreground)" : chosen ? "var(--card)" : "transparent",
              color: inverse > 0.5 ? "var(--background)" : "var(--foreground)",
              boxShadow: chosen ? "inset 5px 0 0 var(--foreground)" : "none",
              opacity: rise,
              transform: `translateY(${(1 - rise) * 24}px)`,
            }}
          >
            <div data-legible="" style={{ fontSize: 54, fontWeight: 500, letterSpacing: "-0.02em" }}>
              {row.line.split(FILM.keys.query).map((part, i, all) => (
                <span key={part + String(i)}>
                  {part}
                  {i < all.length - 1 ? (
                    <span style={{ textDecoration: "underline", textUnderlineOffset: 9 }}>{FILM.keys.query}</span>
                  ) : null}
                </span>
              ))}
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 32, opacity: 0.7 }}>
              {row.song} · {row.at}
            </div>
            {chosen ? (
              <div
                data-legible=""
                style={{
                  position: "absolute",
                  right: 40,
                  top: 52,
                  fontFamily: "var(--font-mono)",
                  fontSize: 32,
                  opacity: played,
                  color: "var(--foreground)",
                  background: "var(--background)",
                  border: "1px solid var(--foreground)",
                  padding: "8px 18px",
                }}
              >
                {FILM.keys.play}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function Sheet({ frame }: { frame: number }) {
  const press = pressAt(frame, beat(KEYS.sheet), beat(0.125), beat(0.25));
  return (
    <>
      <div style={{ position: "absolute", left: 820, top: 100, display: "flex", alignItems: "center", gap: 30 }}>
        <Keycap label="?" size={112} press={press} bright legible />
        <Label style={{ color: "var(--foreground)", fontSize: 34 }}>all keyboard shortcuts</Label>
      </div>
      {FILM.keys.sheet.map(([keys, action], index) => {
        const col = index % 2;
        const row = Math.floor(index / 2);
        const t = ramp(frame, beat(KEYS.rows) + beat(0.1) * index, beat(0.6));
        return (
          <div
            key={action}
            style={{
              position: "absolute",
              left: 820 + col * 500,
              top: 270 + row * 146,
              width: 470,
              height: 112,
              display: "flex",
              alignItems: "center",
              gap: 20,
              borderTop: "1px solid color-mix(in oklch, var(--foreground) 25%, transparent)",
              opacity: t,
              transform: `translateY(${(1 - t) * 26}px)`,
            }}
          >
            <div style={{ display: "flex", gap: 10, minWidth: 218 }}>
              {keys.map((key) => (
                <Keycap key={key} label={key} size={84} wide={key.length > 1} legible />
              ))}
            </div>
            <div data-legible="" style={{ fontSize: 32, color: "var(--foreground)", opacity: 0.9, whiteSpace: "nowrap" }}>
              {action}
            </div>
          </div>
        );
      })}
    </>
  );
}

export function KeysShot() {
  const frame = useCurrentFrame();
  const first = frame < CUT;
  const chord = pressAt(frame, CHORD_AT, beat(0.125), beat(0.25));
  const position = useSongSeconds();
  const bars = [0, 1, 2, 3].map((i) => 0.25 + 0.75 * hash(Math.floor(frame / beat(0.25)) + i * 13));
  const settle = ramp(frame, 0, beat(KEYS.end), ease.inOut);
  const view: AppView = {
    scale: lerp(APP_VIEW.to.scale, SHEET_VIEW.scale, settle),
    cx: lerp(APP_VIEW.to.cx, SHEET_VIEW.cx, settle),
    cy: lerp(APP_VIEW.to.cy, SHEET_VIEW.cy, settle),
  };
  const veil = lerp(0.12, 0.7, ramp(frame, CHORD_AT, beat(0.75))) + 0.22 * ramp(frame, CUT, beat(0.5));
  const cam = camAt(frame, [
    { at: 0, scale: 1.0, x: -20 },
    { at: KEYS.cut, scale: 1.04, x: 20 },
    { at: KEYS.cut, scale: 1.02, x: 0 },
    { at: KEYS.end, scale: 1.0, x: -10 },
  ]);
  return (
    <AbsoluteFill>
      <AppStage view={view} focus={3} bars={bars} position={position} time={frame / FPS} />
      <AbsoluteFill style={{ background: `rgb(4 4 4 / ${veil})` }} />
      <Camera cam={cam}>
        {first ? (
          <>
            <Layer z={110}>
              <div style={{ position: "absolute", left: 210, top: 340, display: "flex", gap: 24 }}>
                <Keycap label="⌘" size={160} press={chord} bright />
                <Keycap label="k" size={160} press={chord} bright />
              </div>
              <div style={{ position: "absolute", left: 210, top: 540, opacity: ramp(frame, CHORD_AT, beat(0.5)) }}>
                <Label style={{ color: "var(--foreground)", fontSize: 36 }}>search</Label>
              </div>
            </Layer>
            <Layer z={40}>
              <Palette frame={frame} />
            </Layer>
          </>
        ) : (
          <Layer z={60}>
            <Caption lines={FILM.keys.caption} from={CUT + beat(0.25)} font={160} style={{ left: 130, top: 400 }} />
            <Sheet frame={frame} />
          </Layer>
        )}
      </Camera>
      <DitherWipe />
      <DitherWipe from={CUT} />
    </AbsoluteFill>
  );
}
