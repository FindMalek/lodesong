import { SearchIcon } from "lucide-react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { FILM } from "../copy";
import { beat, FPS } from "../design/beat";
import { Camera, camAt, Layer } from "../design/camera";
import { Caption } from "../design/caption";
import { DitherWipe } from "../design/dither-wipe";
import { Label } from "../design/kinetic";
import { ramp } from "../design/motion";
import { Caret, typedCount, typingFrames } from "../design/typing";
import { DitherCover } from "../ui/dither-cover";
import { Keycap, pressAt } from "../ui/keycap";
import { KEYS } from "./timelines";

const LANDINGS = typingFrames(FILM.keys.query, beat(KEYS.type), 3);
const CHORD_AT = beat(KEYS.chord);
const ENTER_AT = beat(KEYS.enter);
const CUT = beat(KEYS.cut);

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
        left: 620,
        top: 230,
        width: 1130,
        background: "var(--background)",
        border: "1px solid color-mix(in oklch, var(--foreground) 28%, transparent)",
        boxShadow: "0 60px 140px rgb(0 0 0 / 0.65)",
        ...reveal(open),
      }}
    >
      <div style={{ height: 104, display: "flex", alignItems: "center", gap: 22, padding: "0 32px", borderBottom: "1px solid var(--border)" }}>
        <SearchIcon size={40} style={{ opacity: 0.6 }} />
        <div data-legible="" style={{ fontSize: 46, fontWeight: 500, letterSpacing: "-0.02em" }}>
          {typed}
          <Caret frame={frame} typing={frame < ENTER_AT} size={46} />
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
              height: 132,
              padding: "0 32px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              gap: 8,
              borderBottom: index < 2 ? "1px solid var(--border)" : "none",
              background: inverse > 0.5 ? "var(--foreground)" : chosen ? "var(--card)" : "transparent",
              color: inverse > 0.5 ? "var(--background)" : "var(--foreground)",
              boxShadow: chosen ? "inset 4px 0 0 var(--foreground)" : "none",
              opacity: rise,
              transform: `translateY(${(1 - rise) * 24}px)`,
            }}
          >
            <div data-legible="" style={{ fontSize: 44, fontWeight: 500, letterSpacing: "-0.02em" }}>
              {row.line.split(FILM.keys.query).map((part, i, all) => (
                <span key={part + String(i)}>
                  {part}
                  {i < all.length - 1 ? <span style={{ textDecoration: "underline", textUnderlineOffset: 8 }}>{FILM.keys.query}</span> : null}
                </span>
              ))}
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 28, opacity: 0.7 }}>
              {row.song} · {row.at}
            </div>
            {chosen ? (
              <div
                data-legible=""
                style={{
                  position: "absolute",
                  right: 32,
                  top: 46,
                  fontFamily: "var(--font-mono)",
                  fontSize: 28,
                  opacity: played,
                  color: "var(--foreground)",
                  background: "var(--background)",
                  border: "1px solid var(--foreground)",
                  padding: "6px 14px",
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
      <div style={{ position: "absolute", left: 860, top: 120, display: "flex", alignItems: "center", gap: 28 }}>
        <Keycap label="?" size={96} press={press} bright legible />
        <Label style={{ color: "var(--foreground)", fontSize: 30 }}>all keyboard shortcuts</Label>
      </div>
      {FILM.keys.sheet.map(([keys, action], index) => {
        const col = index % 2;
        const row = Math.floor(index / 2);
        const t = ramp(frame, beat(KEYS.rows) + beat(0.125) * index, beat(0.75));
        return (
          <div
            key={action}
            style={{
              position: "absolute",
              left: 860 + col * 450,
              top: 270 + row * 128,
              width: 420,
              height: 100,
              display: "flex",
              alignItems: "center",
              gap: 20,
              borderTop: "1px solid var(--border)",
              opacity: t,
              transform: `translateY(${(1 - t) * 26}px)`,
            }}
          >
            <div style={{ display: "flex", gap: 10, minWidth: 124 }}>
              {keys.map((key) => (
                <Keycap key={key} label={key} size={72} wide={key.length > 1} legible />
              ))}
            </div>
            <div data-legible="" style={{ fontSize: 30, color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>
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
  const time = frame / FPS;
  const first = frame < CUT;
  const chord = pressAt(frame, CHORD_AT, beat(0.125), beat(0.25));
  const cam = camAt(frame, [
    { at: 0, scale: 1.0, x: -20 },
    { at: KEYS.cut, scale: 1.05, x: 20 },
    { at: KEYS.cut, scale: 1.03, x: 0 },
    { at: KEYS.end, scale: 1.0, x: -10 },
  ]);
  return (
    <AbsoluteFill>
      <Camera cam={cam}>
        <Layer z={-380}>
          <AbsoluteFill style={{ opacity: 0.1, maskImage: "radial-gradient(circle at 60% 50%, black 0, transparent 640px)" }}>
            <div style={{ position: "absolute", left: "50%", top: "50%", marginLeft: -540, marginTop: -540 }}>
              <DitherCover id="keys-field" size={1080} time={time * 0.5} />
            </div>
          </AbsoluteFill>
        </Layer>
        {first ? (
          <>
            <Layer z={110}>
              <div style={{ position: "absolute", left: 200, top: 400, display: "flex", gap: 24 }}>
                <Keycap label="⌘" size={150} press={chord} bright />
                <Keycap label="k" size={150} press={chord} bright />
              </div>
              <div style={{ position: "absolute", left: 200, top: 620, opacity: ramp(frame, CHORD_AT, beat(0.5)) }}>
                <Label style={{ color: "var(--foreground)" }}>search, by title or lyric</Label>
              </div>
            </Layer>
            <Layer z={40}>
              <Palette frame={frame} />
            </Layer>
          </>
        ) : (
          <Layer z={60}>
            <Caption lines={FILM.keys.caption} from={CUT + beat(0.25)} font={150} style={{ left: 168, top: 400 }} />
            <Sheet frame={frame} />
          </Layer>
        )}
      </Camera>
      <DitherWipe />
      <DitherWipe from={CUT} />
    </AbsoluteFill>
  );
}

