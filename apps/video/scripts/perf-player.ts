import { Player, type PlayerRef } from "@remotion/player";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import "../src/index.css";
import { FPS } from "../src/design/beat";
import { Film, HERO_SCENES } from "../src/scenes/film";
import { HERO } from "../src/scenes/timelines";

// Entry of the playback bench (scripts/perf.ts play): the hero in the same <Player> Studio uses, driven by window.playRange.

export interface PlayStats {
  samples: { frame: number; ms: number }[];
}

declare global {
  interface Window {
    playRange: (from: number, to: number) => Promise<PlayStats>;
  }
}

function Hero() {
  return createElement(Film, { plan: HERO, scenes: HERO_SCENES, audio: "audio/hero.wav", grainOut: true });
}

let player: PlayerRef | null = null;

const nextFrame = (): Promise<number> => new Promise((done) => requestAnimationFrame(done));

async function settle(count: number): Promise<void> {
  for (let i = 0; i < count; i += 1) await nextFrame();
}

window.playRange = async (from, to) => {
  if (!player) throw new Error("player not mounted");
  player.pause();
  player.seekTo(from);
  await settle(90);
  const samples: PlayStats["samples"] = [];
  let last = await nextFrame();
  player.play();
  while (player.getCurrentFrame() < to) {
    const now = await nextFrame();
    samples.push({ frame: player.getCurrentFrame(), ms: now - last });
    last = now;
  }
  player.pause();
  return { samples };
};

const host = document.createElement("div");
host.style.cssText = "position:fixed;inset:0;background:#000";
document.body.append(host);
createRoot(host).render(
  createElement(Player, {
    ref: (ref: PlayerRef | null) => {
      player = ref;
    },
    component: Hero,
    durationInFrames: HERO.frames,
    fps: FPS,
    compositionWidth: 1920,
    compositionHeight: 1080,
    style: { width: 1920, height: 1080 },
    controls: false,
    initiallyMuted: true,
    acknowledgeRemotionLicense: true,
  }),
);
