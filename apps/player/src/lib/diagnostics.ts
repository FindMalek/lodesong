import { findings, redactText, redactUrl, type StreamProbe, summarizeResponse } from "./diagnostics-format";
import { appliedGain, currentSong, player } from "./player";
import { getSetting } from "./settings";
import { qualityOf } from "./subsonic";

const TYPES = ['audio/ogg; codecs="opus"', "audio/mpeg", "audio/mp4", "audio/flac", 'audio/mp4; codecs="alac"'];
const SETTINGS = ["streamQuality", "normalization", "preamp", "crossfade", "eqOn", "eqGains"] as const;

async function probeStream(src: string | null): Promise<StreamProbe> {
  if (!src) return { skipped: "no source" };
  if (/^(blob|data):/.test(src)) return { skipped: "played from a blob" };
  try {
    const response = await fetch(src, { headers: { range: "bytes=0-1" }, cache: "no-store", signal: AbortSignal.timeout(8000) });
    void response.body?.cancel();
    return summarizeResponse(response);
  } catch (error) {
    return { error: redactText(String(error)) };
  }
}

async function status(url: string): Promise<number | string> {
  try {
    return (await fetch(url, { method: "HEAD", cache: "no-store", signal: AbortSignal.timeout(5000) })).status;
  } catch (error) {
    return redactText(String(error));
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

const plain = (value: number): number | string => (Number.isFinite(value) ? value : String(value));

export async function audioDiagnostics(): Promise<Record<string, unknown>> {
  const state = player.getState();
  const song = currentSong(state);
  const snapshot = player.audioSnapshot();
  const decks = snapshot.decks.map((deck) => ({
    ...deck,
    src: deck.src && redactUrl(deck.src),
    sizedFrom: deck.sizedFrom && redactUrl(deck.sizedFrom),
    error: deck.error && { code: deck.error.code, message: redactText(deck.error.message) },
    currentTime: plain(deck.currentTime),
    duration: plain(deck.duration),
  }));
  const active = snapshot.decks.find((deck) => deck.active);
  const [graphPeak, probe, levelsFile, serviceWorker] = await Promise.all([
    player.outputPeak(600),
    probeStream(active?.sizedFrom ?? active?.src ?? null),
    status("/worklets/levels.js"),
    worker(),
  ]);
  const settings = Object.fromEntries(SETTINGS.map((name) => [name, getSetting(name)]));
  const report = {
    at: new Date().toISOString(),
    page: { userAgent: navigator.userAgent, visibility: document.visibilityState, secure: isSecureContext },
    song: song ? { id: song.id, title: song.title, duration: song.duration ?? null, replayGain: song.replayGain ?? null } : null,
    stream: song ? { setting: getSetting("streamQuality"), playing: qualityOf(song.id) } : null,
    canPlayType: Object.fromEntries(TYPES.map((type) => [type, new Audio().canPlayType(type)])),
    player: {
      playing: state.playing,
      buffering: state.buffering,
      error: state.error,
      volume: state.volume,
      muted: state.muted,
      outputDevice: state.outputDevice ? "set" : "default",
    },
    normalization: { applied: appliedGain(), settings: { mode: getSetting("normalization"), preamp: getSetting("preamp") } },
    decks,
    context: snapshot.context,
    gains: { master: snapshot.master, volume: snapshot.volume },
    graphPeak,
    levels: { worklet: snapshot.levels, file: levelsFile },
    events: snapshot.events.map((event) => ({ ...event, detail: event.detail && redactText(event.detail) })),
    probe,
    serviceWorker,
    settings,
  };
  return { ...report, findings: findings({ decks, context: snapshot.context, master: snapshot.master, graphPeak, probe }) };
}
