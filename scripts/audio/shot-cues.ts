import type { UiEvent, UiKind } from "../../apps/video/src/audio-plan";
import type { ShotCue } from "../../apps/video/src/captures/types";
import { type ShotId, shotOf } from "../../apps/video/src/scenes/timelines";

// bun scripts/audio/shot-cues.ts   reads every S<n>_CUES a shot exports and writes the hero UI manifest the score plays
const OUT = "apps/video/src/audio-shot-cues.json";
const SCENES = "../../apps/video/src/scenes/";
const MODULES = [
  "shot-cold-open",
  "shot-find-line",
  "shot-play-line",
  "shot-lyrics",
  "shot-queue",
  "shot-mixes",
  "shot-mood",
  "shot-session",
  "shot-shells",
  "shot-notch",
  "shot-import",
  "shot-themes",
  "s10-plan",
  "s11-plan",
  "s12-plan",
];

const SKIPPED_PINGS = /(?:your (?:music|server)|bell on the ignite)/;

/** what a shot cue sounds like: structural kinds (risers, rests, swells) are the score's own transitions */
function uiKind(cue: ShotCue): UiKind | undefined {
  const { kind, label } = cue;
  if (kind === "typed") return "type";
  if (kind === "click") return "click";
  if (kind === "key") return label.startsWith("type:") ? "type" : /click/.test(label) ? "click" : "key";
  if (kind === "kick") return /ignite/.test(label) ? "ignite" : undefined;
  if (kind === "hit") return "flash";
  if (kind === "whoosh") return "seek";
  if (kind === "pluck") return /tile|aura/.test(label) ? "tile" : "line";
  if (kind === "ping") {
    if (/^sung:/.test(label)) return "line";
    if (SKIPPED_PINGS.test(label)) return undefined;
    return /ignites/.test(label) ? "ignite" : "chip";
  }
  if (kind === "tick") {
    if (/hairline|underline|draws/.test(label)) return "draw";
    if (/seek/.test(label)) return "seek";
    if (/(?:^word |row \d|undo)/.test(label)) return "row";
    if (/^key /.test(label)) return "type";
    return "chip";
  }
  return undefined;
}

const events: UiEvent[] = [];
const found: string[] = [];
for (const name of MODULES) {
  const module = (await import(`${SCENES}${name}`).catch(() => ({}))) as Record<string, unknown>;
  for (const [key, value] of Object.entries(module)) {
    if (!/^(?:S\d+|NOTCH|IMPORT|THEMES)_CUES$/.test(key) || !Array.isArray(value)) continue;
    found.push(key);
    for (const cue of value as ShotCue[]) {
      const kind = uiKind(cue);
      if (kind) events.push({ frame: shotOf(cue.shot as ShotId).start + cue.at, kind, label: cue.label });
    }
  }
}
events.sort((a, b) => a.frame - b.frame);
await Bun.write(OUT, `${JSON.stringify(events, null, 1)}\n`);
console.log(`${events.length} cues from ${found.sort().join(" ")} -> ${OUT}`);
