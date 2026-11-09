import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { FILM } from "../../copy";
import { ease, hash, lerp, ramp } from "../../design/motion";
import { Caret } from "../../design/typing";
import { revealed } from "./reveal";
import { DitherCover } from "../../ui/dither-cover";

const MONO = "var(--font-mono)";
const RULE = "1px solid color-mix(in oklch, var(--foreground) 24%, transparent)";
const AREA: CSSProperties = { position: "absolute", left: 96, right: 96, top: 96, height: 600 };

interface MockProps {
  featureId: string;
  frames: number;
}

function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ background: "color-mix(in oklch, var(--card) 92%, black)", border: RULE, boxShadow: "0 30px 90px rgb(0 0 0 / 0.6)", ...style }}>
      {children}
    </div>
  );
}

function Dots() {
  return (
    <div style={{ display: "flex", gap: 10, padding: "16px 22px", borderBottom: RULE }}>
      {[0, 1, 2].map((dot) => (
        <i key={dot} style={{ width: 14, height: 14, borderRadius: 7, background: "color-mix(in oklch, var(--foreground) 30%, transparent)" }} />
      ))}
    </div>
  );
}

interface TermProps {
  title: string;
  lines: readonly { text: string; typed?: boolean; muted?: boolean; gold?: boolean }[];
  frame: number;
  frames: number;
  size?: number;
  style?: CSSProperties;
}

/** A terminal that types its input lines and prints its output lines as the host plays. */
function Term({ title, lines, frame, frames, size = 38, style }: TermProps) {
  const step = (frames * 0.8) / Math.max(1, lines.length);
  return (
    <Card style={{ overflow: "hidden", ...style }}>
      <Dots />
      <div style={{ padding: "8px 30px 0", fontFamily: MONO, fontSize: 24, color: "var(--muted-foreground)" }}>{title}</div>
      <div style={{ padding: "18px 30px 34px", fontFamily: MONO, fontSize: size, lineHeight: 1.5, whiteSpace: "pre" }}>
        {lines.map((line, i) => {
          const from = Math.round(i * step);
          const shown = line.typed ? revealed(frame, from, step * 0.85, line.text.length) : frame >= from + 3 ? line.text.length : 0;
          if (shown === 0 && !line.typed) return <div key={line.text} style={{ height: size * 1.5 }} />;
          const last = i === lines.length - 1 || frame < Math.round((i + 1) * step);
          return (
            <div key={line.text} style={{ color: line.gold ? "var(--ignite)" : line.muted ? "var(--muted-foreground)" : "var(--foreground)" }}>
              {line.typed ? <span style={{ color: "var(--ignite)" }}>{"$ "}</span> : null}
              {line.text.slice(0, shown)}
              {line.typed && last && shown > 0 ? <Caret frame={frame} typing={shown < line.text.length} size={size} /> : null}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function Waveform({ seed, width, fill, color }: { seed: number; width: number; fill: number; color: string }) {
  const count = Math.floor(width / 10);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, height: 110, width }}>
      {Array.from({ length: count }, (_, i) => (
        <i
          key={`${seed}-${i}`}
          style={{
            width: 6,
            height: 14 + hash(i * 1.7 + seed) * 92 * (0.5 + 0.5 * Math.sin(i / 9)) ** 2,
            background: i / count < fill ? color : "color-mix(in oklch, var(--foreground) 22%, transparent)",
          }}
        />
      ))}
    </div>
  );
}

function Decks({ frame, frames }: { frame: number } & MockProps) {
  const seam = frames * 0.52;
  const a = ramp(frame, 0, seam, (t) => t);
  const b = ramp(frame, seam, frames - seam, (t) => t);
  const rows = [
    { name: "deck a", seed: 3, fill: a, live: frame < seam },
    { name: "deck b", seed: 11, fill: b, live: frame >= seam },
  ];
  return (
    <div style={{ ...AREA, display: "flex", flexDirection: "column", gap: 44, justifyContent: "center" }}>
      {rows.map((row) => (
        <div key={row.name} style={{ display: "flex", alignItems: "center", gap: 36 }}>
          <div style={{ width: 190, fontFamily: MONO, fontSize: 38, color: row.live ? "var(--ignite)" : "var(--muted-foreground)" }}>{row.name}</div>
          <Waveform seed={row.seed} width={1400} fill={row.fill} color={row.live ? "var(--ignite)" : "var(--foreground)"} />
        </div>
      ))}
      <div style={{ fontFamily: MONO, fontSize: 40, color: "var(--ignite)", opacity: ramp(frame, seam - 4, 6), marginLeft: 226 }}>
        next song already decoded, 0 ms gap
      </div>
    </div>
  );
}

function Mini({ frame }: { frame: number } & MockProps) {
  const rise = ease.out(Math.min(1, frame / 14));
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: 96, top: 96, width: 1180, height: 640, border: RULE, opacity: 0.45, background: "var(--card)" }}>
        <Dots />
        <div style={{ padding: 40, fontFamily: MONO, fontSize: 30, color: "var(--muted-foreground)", lineHeight: 1.8 }}>
          {["any other window", "docs, editor, browser", "the mini player stays on top"].map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
      </div>
      <Card
        style={{
          position: "absolute",
          right: 130,
          top: 150 - (1 - rise) * 70,
          width: 700,
          padding: 26,
          display: "flex",
          gap: 26,
          alignItems: "center",
          opacity: rise,
          borderColor: "var(--ignite)",
        }}
      >
        <DitherCover id="mini-cover" size={132} time={frame / 60} color="var(--ignite)" />
        <div style={{ flex: 1, fontFamily: MONO }}>
          <div style={{ fontSize: 34 }}>signal violet pt. 2</div>
          <div style={{ fontSize: 26, color: "var(--muted-foreground)", marginTop: 6 }}>satellite garden</div>
          <div style={{ height: 6, background: "color-mix(in oklch, var(--foreground) 20%, transparent)", marginTop: 18 }}>
            <div style={{ height: 6, width: `${30 + frame * 0.4}%`, background: "var(--ignite)" }} />
          </div>
        </div>
        <div style={{ fontFamily: MONO, fontSize: 28, color: "var(--ignite)" }}>pinned</div>
      </Card>
    </AbsoluteFill>
  );
}

function Terminal({ featureId, frame, frames }: { frame: number } & MockProps) {
  const claude = featureId === "term-claude";
  return (
    <div style={{ ...AREA, display: "flex", alignItems: "center" }}>
      <Term
        title={claude ? "claude code" : "opencode"}
        frame={frame}
        frames={frames}
        style={{ width: 1500 }}
        lines={[
          { text: claude ? "/lodesong pause" : "lodesong now", typed: true },
          { text: claude ? "paused: signal violet pt. 2, satellite garden" : "signal violet pt. 2, satellite garden, 1:14", gold: true },
          { text: claude ? "/lodesong next" : "lodesong next", typed: true },
          { text: "playing: static echo at night", gold: true },
        ]}
      />
    </div>
  );
}

function Budget({ frame }: { frame: number } & MockProps) {
  const fill = ease.out(Math.min(1, frame / 30));
  return (
    <div style={{ ...AREA, display: "flex", flexDirection: "column", justifyContent: "center", fontFamily: MONO }}>
      <div style={{ fontSize: 250, fontWeight: 500, color: "var(--ignite)", letterSpacing: "-0.05em", lineHeight: 1 }}>{`${Math.round(161 * fill)} KB`}</div>
      <div style={{ fontSize: 44, color: "var(--foreground)", marginTop: 12 }}>the first screen, gzipped</div>
      <div style={{ height: 14, width: 1500, marginTop: 40, background: "color-mix(in oklch, var(--foreground) 16%, transparent)" }}>
        <div style={{ height: 14, width: 1500 * 0.16 * fill, background: "var(--ignite)" }} />
      </div>
    </div>
  );
}

function Docker({ featureId, frame, frames }: { frame: number } & MockProps) {
  const env = featureId === "env";
  const lines = env
    ? [{ text: "NAVIDROME_URL=http://host.docker.internal:4533", typed: true }, { text: "one env var. that is the whole setup.", gold: true }]
    : FILM.end.docker.map((text) => ({ text, typed: true }));
  return (
    <div style={{ ...AREA, display: "flex", alignItems: "center" }}>
      <Term title={env ? "env" : "terminal"} frame={frame} frames={frames} lines={lines} style={{ width: 1560 }} size={env ? 42 : 36} />
    </div>
  );
}

const COMPOSE = [
  "services:",
  "  player:",
  "    image: ghcr.io/findmalek/lodesong:latest",
  "    environment:",
  "      NAVIDROME_URL: http://navidrome:4533",
  "    ports: [\"8080:8080\"]",
];

function Compose({ frame, frames }: { frame: number } & MockProps) {
  return (
    <div style={{ ...AREA, display: "flex", alignItems: "center" }}>
      <Term title="compose.yaml" frame={frame} frames={frames} style={{ width: 1500 }} size={36} lines={COMPOSE.map((text) => ({ text, typed: true }))} />
    </div>
  );
}

function Agent({ frame, frames }: { frame: number } & MockProps) {
  return (
    <div style={{ ...AREA, display: "flex", alignItems: "center" }}>
      <Term
        title="coding agent"
        frame={frame}
        frames={frames}
        style={{ width: 1500 }}
        lines={[
          { text: "set up lodesong with my navidrome", typed: true },
          { text: "reads the guide, writes compose.yaml", muted: true },
          { text: "checks NAVIDROME_URL answers", muted: true },
          { text: "lodesong is up on :8080", gold: true },
        ]}
      />
    </div>
  );
}

function Node({ label, x, on }: { label: string; x: number; on: number }) {
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: 250,
        width: 330,
        height: 150,
        border: `2px solid ${on > 0.5 ? "var(--ignite)" : "color-mix(in oklch, var(--foreground) 30%, transparent)"}`,
        background: "var(--card)",
        display: "grid",
        placeItems: "center",
        fontFamily: MONO,
        fontSize: 38,
        opacity: 0.35 + 0.65 * on,
      }}
    >
      {label}
    </div>
  );
}

function Privacy({ frame, frames }: { frame: number } & MockProps) {
  const t = (i: number) => ramp(frame, i * frames * 0.14, 12);
  const link = (x: number, i: number) => (
    <div style={{ position: "absolute", left: x, top: 322, width: 120 * t(i), height: 5, background: "var(--ignite)", boxShadow: "0 0 16px var(--ignite)" }} />
  );
  return (
    <div style={AREA}>
      <Node label="your files" x={20} on={t(0)} />
      <Node label="navidrome" x={500} on={t(1)} />
      <Node label="lodesong" x={980} on={t(2)} />
      <Node label="your browser" x={1460} on={t(3)} />
      {link(350, 1)}
      {link(830, 2)}
      {link(1310, 3)}
      <div style={{ position: "absolute", left: 500, top: 460, fontFamily: MONO, fontSize: 40, color: "var(--ignite)", opacity: t(4) }}>
        lodesong only talks to navidrome. it never reads your files.
      </div>
    </div>
  );
}

function Security({ frame, frames }: { frame: number } & MockProps) {
  const rows = ["httpOnly session cookie", "tokens never in the browser", "csp on every page", "a fixed, safe proxy upstream"];
  return (
    <div style={{ ...AREA, display: "flex", flexDirection: "column", justifyContent: "center", gap: 26 }}>
      {rows.map((row, i) => {
        const on = ramp(frame, i * frames * 0.16, 10);
        return (
          <div key={row} style={{ display: "flex", gap: 28, fontFamily: MONO, fontSize: 52, opacity: 0.3 + 0.7 * on }}>
            <span style={{ color: "var(--ignite)", width: 56 }}>{on > 0.6 ? "ok" : ".."}</span>
            {row}
          </div>
        );
      })}
    </div>
  );
}

function Api({ frame, frames }: { frame: number } & MockProps) {
  return (
    <div style={{ ...AREA, display: "flex", alignItems: "center" }}>
      <Term
        title="api"
        frame={frame}
        frames={frames}
        style={{ width: 1620 }}
        size={34}
        lines={[
          { text: 'curl -H "Authorization: Bearer $TOKEN" \\', typed: true },
          { text: '  "https://your-player/api/stats/forgotten?days=90"', typed: true },
          { text: '{ "songs": [ ... favourites you stopped playing ... ] }', gold: true },
        ]}
      />
    </div>
  );
}

function Tiles({ names, seed, frame, note }: { names: readonly string[]; seed: string; frame: number; note: string }) {
  return (
    <div style={{ ...AREA, display: "flex", flexDirection: "column", gap: 34, justifyContent: "center" }}>
      <div style={{ display: "flex", gap: 40 }}>
        {names.map((name, i) => (
          <div key={name} style={{ opacity: ramp(frame, i * 6, 10) }}>
            <DitherCover id={`${seed}-${name}`} size={470} develop={ramp(frame, i * 6, 24)} time={frame / 90} />
            <div style={{ fontFamily: MONO, fontSize: 40, marginTop: 14 }}>{name}</div>
          </div>
        ))}
      </div>
      <div style={{ fontFamily: MONO, fontSize: 32, color: "var(--muted-foreground)" }}>{note}</div>
    </div>
  );
}

function Feedback({ frame, frames }: { frame: number } & MockProps) {
  const text = "the sleep timer should fade out";
  const shown = revealed(frame, 4, frames * 0.5, text.length);
  const sent = ramp(frame, frames * 0.7, 8);
  return (
    <div style={{ ...AREA, display: "flex", alignItems: "center" }}>
      <Card style={{ width: 1300, padding: 40, fontFamily: MONO }}>
        <div style={{ fontSize: 30, color: "var(--muted-foreground)" }}>send feedback</div>
        <div style={{ fontSize: 46, marginTop: 24, minHeight: 130 }}>
          {text.slice(0, shown)}
          <Caret frame={frame} typing={shown < text.length} size={46} />
        </div>
        <div style={{ fontSize: 34, marginTop: 28, color: "var(--ignite)", opacity: sent }}>opened as a github issue</div>
      </Card>
    </div>
  );
}

const MOCKS: Record<string, (props: { frame: number } & MockProps) => ReactNode> = {
  decks: Decks,
  mini: Mini,
  terminal: Terminal,
  budget: Budget,
  docker: Docker,
  compose: Compose,
  agent: Agent,
  privacy: Privacy,
  security: Security,
  api: Api,
  feedback: Feedback,
  "mix-radar": (p) => <Tiles {...p} seed="radar" names={["new from satellite garden", "new from north echo", "new from silver atlas"]} note="release radar: new songs from artists you play" />,
  "mix-moods": (p) => <Tiles {...p} seed="mood" names={["focus", "late night", "energy"]} note="moods cluster your artists into mixes" />,
};

export const MOCK_IDS: readonly string[] = Object.keys(MOCKS);

/** A faithful illustration for a feature the capture rig cannot reach: on-brand, drawn in code, and tagged as such in the corner. */
export function MockHost({ mock, featureId, frames }: { mock: string; featureId: string; frames: number }) {
  const frame = useCurrentFrame();
  const Body = MOCKS[mock];
  const creep = lerp(1, 1.04, frame / frames);
  return (
    <AbsoluteFill style={{ background: "radial-gradient(ellipse 60% 70% at 62% 38%, color-mix(in oklch, var(--ignite) 14%, transparent), transparent)" }}>
      <AbsoluteFill style={{ opacity: 0.1, transform: `scale(${creep})` }}>
        <DitherCover id={`field-${mock}`} size={1080} bare time={frame / 120} />
      </AbsoluteFill>
      <AbsoluteFill style={{ transform: `scale(${creep})`, transformOrigin: "40% 40%" }}>{Body ? <Body featureId={featureId} frames={frames} frame={frame} /> : null}</AbsoluteFill>
      <div style={{ position: "absolute", right: 96, top: 54, fontFamily: MONO, fontSize: 22, letterSpacing: "0.1em", color: "var(--muted-foreground)" }}>
        ILLUSTRATION
      </div>
    </AbsoluteFill>
  );
}
