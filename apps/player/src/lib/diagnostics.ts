import { buildReport, describeError, isFailed, type StreamProbe, safe, summarizeResponse } from "./diagnostics-format";
import { appliedGain, currentSong, player } from "./player";
import { getSetting } from "./settings";
import { qualityOf } from "./subsonic";

const TYPES = ['audio/ogg; codecs="opus"', "audio/mpeg", "audio/mp4", "audio/flac", 'audio/mp4; codecs="alac"'];
const SETTINGS = ["streamQuality", "normalization", "preamp", "crossfade", "eqOn", "eqGains"] as const;
const PROBE_MS = 4000;

async function probeStream(src: string | null): Promise<StreamProbe> {
  if (!src) return { skipped: "no source" };
  if (/^(blob|data):/.test(src)) return { skipped: "played from a blob" };
  try {
    const response = await fetch(src, { headers: { range: "bytes=0-1" }, cache: "no-store", signal: AbortSignal.timeout(PROBE_MS) });
    void response.body?.cancel();
    return summarizeResponse(response);
  } catch (error) {
    return { error: describeError(error) };
  }
}

async function status(url: string): Promise<number | string> {
  try {
    return (await fetch(url, { method: "HEAD", cache: "no-store", signal: AbortSignal.timeout(PROBE_MS) })).status;
  } catch (error) {
    return describeError(error);
  }
}

async function worker(): Promise<Record<string, unknown>> {
  if (!("serviceWorker" in navigator)) return { supported: false };
  const registration = await navigator.serviceWorker.getRegistration().catch(() => undefined);
  return {
    supported: true,
    controlled: !!navigator.serviceWorker.controller,
    active: registration?.active?.state ?? null,
    waiting: !!registration?.waiting,
  };
}

/** Every part is gathered on its own: one that throws is named in the report and the rest still arrive. */
export async function audioDiagnostics(): Promise<Record<string, unknown>> {
  const snapshot = await safe(() => player.audioSnapshot());
  const active = isFailed(snapshot) ? undefined : snapshot.decks.find((deck) => deck.active);
  const [graphPeak, probe, levelsFile, serviceWorker] = await Promise.all([
    safe(() => player.outputPeak(600)),
    safe(() => probeStream(active?.sizedFrom ?? active?.src ?? null)),
    safe(() => status("/worklets/levels.js")),
    safe(worker),
  ]);
  const state = player.getState();
  const song = currentSong(state);
  return buildReport({
    at: new Date().toISOString(),
    page: await safe(() => ({ userAgent: navigator.userAgent, visibility: document.visibilityState, secure: isSecureContext })),
    song: await safe(
      () => song && { id: song.id, title: song.title, duration: song.duration ?? null, replayGain: song.replayGain ?? null },
    ),
    stream: await safe(() => song && { setting: getSetting("streamQuality"), playing: qualityOf(song.id) }),
    canPlayType: await safe(() => Object.fromEntries(TYPES.map((type) => [type, new Audio().canPlayType(type)]))),
    player: await safe(() => ({
      playing: state.playing,
      buffering: state.buffering,
      error: state.error,
      volume: state.volume,
      muted: state.muted,
      outputDevice: state.outputDevice ? "set" : "default",
    })),
    normalization: await safe(() => ({
      applied: appliedGain(),
      settings: { mode: getSetting("normalization"), preamp: getSetting("preamp") },
    })),
    snapshot,
    graphPeak,
    probe,
    levelsFile,
    serviceWorker,
    settings: await safe(() => Object.fromEntries(SETTINGS.map((name) => [name, getSetting(name)]))),
  });
}
