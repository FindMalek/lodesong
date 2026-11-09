import { staticFile } from "remotion";
import compact from "../../../../docs/macos/compact.png";
import open from "../../../../docs/macos/open.png";
import { ease, lerp, ramp } from "../design/motion";
import { RealCrop } from "./s8-real-crop";

const ASSET = { w: 1280, h: 520 };
const COMPACT = { x0: 336, x1: 944, h: 76 };
const OPEN = { x0: 132, x1: 1148, h: 492 };
const COVER_BOX = { x: 219, y: 74, w: 154, h: 154 };
const PLATE = { w: 1440, h: 810 };
const GREY = "#9a9a9a";

interface NotchIslandProps {
  /** 0 is the compact island, 1 the open one */
  open: number;
  /** drawn width of the whole 1280 px asset */
  width: number;
  title: string;
  artist: string;
  played: string;
  left: string;
  /** 0 to 1 */
  progress: number;
}

function Cover({ size, radius }: { size: number; radius: number }) {
  return (
    <div style={{ width: size, height: size, borderRadius: radius, overflow: "hidden" }}>
      <RealCrop src={staticFile("film/queue/queue.png")} box={COVER_BOX} plate={PLATE} width={size} />
    </div>
  );
}

const patch = (x: number, y: number, w: number, h: number) => ({
  position: "absolute" as const,
  left: x,
  top: y,
  width: w,
  height: h,
  background: "#000",
});

export function NotchIsland({ open: p, width, title, artist, played, left, progress }: NotchIslandProps) {
  const k = width / ASSET.w;
  const reveal = ramp(p, 0.18, 0.5, ease.inOut);
  const radius = lerp(26, 40, p);
  const clip = `inset(0px ${lerp(ASSET.w - COMPACT.x1, ASSET.w - OPEN.x1, p)}px ${lerp(ASSET.h - COMPACT.h, ASSET.h - OPEN.h, p)}px ${lerp(COMPACT.x0, OPEN.x0, p)}px round 0 0 ${radius}px ${radius}px)`;
  const layer = { position: "absolute" as const, inset: 0, width: ASSET.w, height: ASSET.h };
  return (
    <div style={{ position: "relative", width: ASSET.w, height: ASSET.h, transform: `scale(${k})`, transformOrigin: "0 0" }}>
      {reveal < 1 ? (
        <div
          style={{
            ...layer,
            opacity: 1 - reveal,
            clipPath: `inset(0 ${ASSET.w - COMPACT.x1}px ${ASSET.h - COMPACT.h}px ${COMPACT.x0}px round 0 0 26px 26px)`,
          }}
        >
          <img src={compact} alt="" style={{ width: ASSET.w, height: 140, display: "block" }} />
          <div style={patch(346, 6, 64, 64)} />
          <div style={{ position: "absolute", left: 352, top: 12 }}>
            <Cover size={52} radius={12} />
          </div>
        </div>
      ) : null}
      <div style={{ ...layer, opacity: reveal, clipPath: clip }}>
        <img src={open} alt="" style={{ width: ASSET.w, height: ASSET.h, display: "block" }} />
        <div style={patch(160, 56, 112, 112)} />
        <div style={{ position: "absolute", left: 168, top: 64 }}>
          <Cover size={96} radius={20} />
        </div>
        <div style={patch(280, 72, 560, 84)} />
        <div
          style={{
            position: "absolute",
            left: 288,
            top: 76,
            fontFamily: "var(--font-sans)",
            fontWeight: 650,
            fontSize: 28,
            color: "#f2f2f2",
            whiteSpace: "nowrap",
          }}
        >
          {title}
        </div>
        <div
          style={{
            position: "absolute",
            left: 288,
            top: 114,
            fontFamily: "var(--font-sans)",
            fontWeight: 500,
            fontSize: 24,
            color: GREY,
            whiteSpace: "nowrap",
          }}
        >
          {artist}
        </div>
        <div
          style={{
            position: "absolute",
            left: 168 + 944 * 0.28,
            top: 291,
            width: 944 * (progress - 0.28),
            height: 11,
            background: "#fff",
            display: progress > 0.28 ? "block" : "none",
          }}
        />
        <div style={patch(160, 306, 90, 30)} />
        <div
          style={{ position: "absolute", left: 168, top: 310, fontFamily: "var(--font-sans)", fontWeight: 650, fontSize: 21, color: GREY }}
        >
          {played}
        </div>
        <div style={patch(1030, 306, 90, 30)} />
        <div
          style={{
            position: "absolute",
            right: ASSET.w - 1112,
            top: 310,
            fontFamily: "var(--font-sans)",
            fontWeight: 650,
            fontSize: 21,
            color: GREY,
          }}
        >
          {left}
        </div>
      </div>
    </div>
  );
}
