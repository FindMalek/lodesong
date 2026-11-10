import { equalPower, fitFade, SKIP_FADE_SECONDS } from "./crossfade";
import { BANDS, FLAT, headroom } from "./eq";

// Two decks for gapless playback: the idle one preloads the next song and starts a few ms before the end, each with
// its own 5 ms gain ramp so the handover never clicks. With the EQ off its filters are unplugged to save CPU.

const LEAD_SECONDS = 0.03;
const RAMP_SECONDS = 0.005;
const ARM_SECONDS = 0.6;

// iOS mutes Web Audio while the ringer switch is on silent unless the page says it is playback (Safari 16.4+
// `navigator.audioSession`); elsewhere there is nothing to set.
export function markPlaybackSession(nav: object = navigator): void {
  const session = (nav as { audioSession?: { type: string } }).audioSession;
  if (!session || session.type === "playback") return;
  try {
    session.type = "playback";
  } catch {
    // A browser that exposes it read-only: nothing to do.
  }
}

/** WebKit plays a stream of unknown length (a transcode relayed without Content-Length) but sends it through Web Audio as silence. */
export function silencesUnsized(ua: string): boolean {
  return /AppleWebKit/.test(ua) && !/Chrome\/|Chromium\/|Edg\/|OPR\//.test(ua);
}

const BLOB_TYPES: Record<string, string> = { opus: "audio/ogg", mp3: "audio/mpeg" };
const DOWNLOAD_MS = 60_000;
const MAX_DOWNLOAD_BYTES = 64 * 1024 * 1024;
const LOGGED = [
  "loadstart",
  "loadedmetadata",
  "durationchange",
  "canplay",
  "playing",
  "pause",
  "waiting",
  "stalled",
  "emptied",
  "abort",
  "error",
  "ended",
];
const LOG_SIZE = 20;
const downloadable = (url: string): boolean => {
  if (!silencesUnsized(navigator.userAgent)) return false;
  const parsed = new URL(url, location.href);
  return parsed.pathname === "/rest/stream" && parsed.searchParams.get("format") !== "raw";
};
export const finite = (value: number, fallback = 1): number => (Number.isFinite(value) ? value : fallback);

export interface MediaEvent {
  ms: number;
  deck: number;
  name: string;
  detail?: string;
}

export interface DeckEvents {
  playing: () => void;
  pause: () => void;
  waiting: () => void;
  canPlay: () => void;
  progress: () => void;
  duration: (seconds: number) => void;
  time: (seconds: number) => void;
  seeked: (seconds: number) => void;
  ended: () => void;
  handover: () => void;
  error: () => void;
  sizing: () => void;
  failed: () => void;
}

interface Deck {
  element: HTMLAudioElement;
  gain: GainNode | null;
  songId: string | null;
  factor: number;
  fade: number;
  object: string | null;
  sized: string | null;
  abort: AbortController | null;
  sizing: boolean;
  sizeError: string | null;
  wantsPlay: boolean;
  start: (() => void) | null;
}

/** The levels worklet (packages/shared/src/levels-worklet.ts), served by our server: the CSP allows no blob: scripts. */
const LEVELS_WORKLET = "/worklets/levels.js";

export class Decks {
  private readonly decks: [Deck, Deck];
  private active = 0;
  private context: AudioContext | null = null;
  private meter: { node: AudioWorkletNode; sink: GainNode } | null = null;
  private paths: { dry: GainNode; wet: GainNode; out: GainNode } | null = null;
  private eqConnected = false;
  private eqUnplug: ReturnType<typeof setTimeout> | undefined;
  private onLevels: ((levels: number[]) => void) | null = null;
  private master: GainNode | null = null;
  private bus: GainNode | null = null;
  private filters: BiquadFilterNode[] = [];
  private eq = { on: false, gains: FLAT };
  private timer: ReturnType<typeof setTimeout> | undefined;
  private sinkId = "";
  private volume = 1;
  private tailUntil = 0;
  private armed: Deck | null = null;
  private fadesSkips = false;

  private readonly log: MediaEvent[] = [];
  private unsized = false;

  constructor(private readonly events: DeckEvents) {
    this.decks = [this.createDeck(0), this.createDeck(1)];
  }

  private createDeck(index: number): Deck {
    const element = new Audio();
    element.preload = "auto";
    const deck: Deck = {
      element,
      gain: null,
      songId: null,
      factor: 1,
      fade: 0,
      object: null,
      sized: null,
      abort: null,
      sizing: false,
      sizeError: null,
      wantsPlay: false,
      start: null,
    };
    for (const name of LOGGED)
      element.addEventListener(name, () => {
        const error = element.error;
        const detail =
          name === "error"
            ? `code ${error?.code ?? "?"} ${error?.message ?? ""}`.trim()
            : name === "durationchange"
              ? String(element.duration)
              : undefined;
        this.log.push({ ms: Math.round(performance.now()), deck: index, name, detail });
        if (this.log.length > LOG_SIZE) this.log.shift();
      });
    element.addEventListener("durationchange", () => void this.size(deck));
    const on = (name: string, handler: () => void) =>
      element.addEventListener(name, () => {
        if (this.playing.element === element) handler();
      });
    on("playing", this.events.playing);
    on("pause", this.events.pause);
    on("waiting", this.events.waiting);
    on("canplay", this.events.canPlay);
    on("progress", this.events.progress);
    on("suspend", this.events.progress);
    on("canplaythrough", this.events.progress);
    on("durationchange", () => this.events.duration(Number.isFinite(element.duration) ? element.duration : 0));
    on("seeked", () => this.events.seeked(element.currentTime));
    on("error", this.events.error);
    on("timeupdate", () => {
      this.events.time(element.currentTime);
      this.armHandover();
    });
    on("ended", () => {
      clearTimeout(this.timer);
      if (!this.handover()) this.events.ended();
    });
    return deck;
  }

  private get playing(): Deck {
    return this.decks[this.active] as Deck;
  }

  private get idle(): Deck {
    return this.decks[1 - this.active] as Deck;
  }

  get element(): HTMLAudioElement {
    return this.playing.element;
  }

  // Measured in an AudioWorklet: a page timer drops to once a second whenever the window is covered.
  async levels(listener: ((levels: number[]) => void) | null): Promise<void> {
    this.onLevels = listener;
    if (!listener) {
      this.meter?.node.disconnect();
      this.meter?.sink.disconnect();
      this.meter = null;
      return;
    }
    const context = this.context;
    const out = this.paths?.out;
    if (!context || !out || this.meter) return;
    await context.audioWorklet.addModule(LEVELS_WORKLET);
    if (!this.onLevels || this.meter) return;
    const node = new AudioWorkletNode(context, "keep-levels", { numberOfOutputs: 1 });
    // Silent, but connected to the output so the browser keeps running it.
    const sink = context.createGain();
    sink.gain.value = 0;
    out.connect(node).connect(sink).connect(context.destination);
    node.port.onmessage = (event: MessageEvent<number[]>) => this.onLevels?.(event.data);
    this.meter = { node, sink };
  }

  ensureGraph(): void {
    markPlaybackSession();
    if (this.context) return;
    try {
      const context = new AudioContext();
      const master = context.createGain();
      master.connect(context.destination);
      const bus = context.createGain();
      this.filters = BANDS.map((frequency, index) => {
        const filter = context.createBiquadFilter();
        filter.type = index === 0 ? "lowshelf" : index === BANDS.length - 1 ? "highshelf" : "peaking";
        filter.frequency.value = frequency;
        filter.Q.value = 1.1;
        return filter;
      });
      this.bus = bus;
      const out = context.createGain();
      out.connect(master);
      const dry = context.createGain();
      const wet = context.createGain();
      wet.gain.value = 0;
      bus.connect(dry).connect(out);
      this.filters
        .reduce((from, to) => {
          from.connect(to);
          return to;
        })
        .connect(wet)
        .connect(out);
      this.paths = { dry, wet, out };
      for (const deck of this.decks) {
        deck.gain = context.createGain();
        context.createMediaElementSource(deck.element).connect(deck.gain).connect(bus);
        this.setGain(deck, deck === this.playing ? deck.factor : 0);
        deck.element.volume = 1;
      }
      this.context = context;
      this.master = master;
      if (this.onLevels) void this.levels(this.onLevels);
      this.applyEq();
      this.applyVolume();
      void this.setSink(this.sinkId);
    } catch {
      this.context = null;
    }
    void this.context?.resume();
  }

  private setGain(deck: Deck, value: number): void {
    if (!deck.gain) return;
    deck.gain.gain.cancelScheduledValues(0);
    deck.gain.gain.value = finite(value);
  }

  /** Move to `at` once the length is known. A seek made before that wins over it. */
  private startAt(deck: Deck, at: number): void {
    this.cancelStart(deck);
    const start = () => {
      deck.start = null;
      deck.element.currentTime = at;
    };
    deck.start = start;
    deck.element.addEventListener("loadedmetadata", start, { once: true });
  }

  private cancelStart(deck: Deck): void {
    if (deck.start) deck.element.removeEventListener("loadedmetadata", deck.start);
    deck.start = null;
  }

  private source(deck: Deck, url: string): void {
    this.release(deck);
    deck.sized = null;
    deck.sizeError = null;
    if (this.unsized && downloadable(url)) void this.download(deck, url, 0);
    else deck.element.src = url;
  }

  private release(deck: Deck): void {
    this.cancelStart(deck);
    deck.abort?.abort();
    deck.abort = null;
    deck.sizing = false;
    if (deck.object) URL.revokeObjectURL(deck.object);
    deck.object = null;
  }

  // The first stream of unknown length WebKit meets: later songs go straight to `download`.
  private size(deck: Deck): void {
    const url = deck.element.getAttribute("src");
    if (deck.element.duration !== Number.POSITIVE_INFINITY || !url || url === deck.sized || !downloadable(url)) return;
    this.unsized = true;
    void this.download(deck, url, deck.element.currentTime);
  }

  // WebKit gives a stream with no length silence in Web Audio, so it is downloaded whole and played from a blob, which
  // has a length. A download that fails or runs out of time goes to the player's retry and is named in the report.
  private async download(deck: Deck, url: string, at: number): Promise<void> {
    const { element, songId } = deck;
    const control = new AbortController();
    const timer = setTimeout(() => control.abort(new DOMException("download", "TimeoutError")), DOWNLOAD_MS);
    element.removeAttribute("src");
    element.load();
    deck.abort = control;
    deck.sizing = true;
    deck.sized = url;
    if (deck === this.playing) this.events.sizing();
    try {
      const response = await fetch(url, { signal: control.signal });
      if (!response.ok) throw new DOMException("status", "NetworkError");
      if (Number(response.headers.get("content-length")) > MAX_DOWNLOAD_BYTES) {
        void response.body?.cancel();
        deck.sizing = false;
        deck.sizeError = "too large to hold";
        element.src = url;
        return;
      }
      const blob = await response.blob();
      if (control.signal.aborted || deck.songId !== songId) return;
      const format = new URL(url, location.href).searchParams.get("format") ?? "";
      deck.object = URL.createObjectURL(new Blob([blob], { type: BLOB_TYPES[format] ?? blob.type }));
      deck.sizing = false;
      deck.abort = null;
      element.src = deck.object;
      if (at) this.startAt(deck, at);
      if (deck.wantsPlay && deck === this.playing) void element.play().catch((error) => this.rejected(error));
    } catch (error) {
      if (control.signal.aborted && (control.signal.reason as DOMException | undefined)?.name !== "TimeoutError") return;
      deck.sizing = false;
      deck.sizeError = error instanceof Error ? error.name : "Error";
      this.log.push({ ms: Math.round(performance.now()), deck: this.decks.indexOf(deck), name: "download failed", detail: deck.sizeError });
      if (deck === this.playing) this.events.failed();
    } finally {
      clearTimeout(timer);
    }
  }

  setFadesSkips(on: boolean): void {
    this.fadesSkips = on;
  }

  setEq(on: boolean, gains: number[]): void {
    this.eq = { on, gains };
    this.applyEq();
  }

  private applyEq(): void {
    const { on, gains } = this.eq;
    const time = this.context?.currentTime ?? 0;
    for (const [index, filter] of this.filters.entries()) filter.gain.setTargetAtTime(on ? (gains[index] ?? 0) : 0, time, 0.01);
    this.bus?.gain.setTargetAtTime(on ? headroom(gains) : 1, time, 0.01);
    const paths = this.paths;
    const first = this.filters[0];
    if (!paths || !this.bus || !first) return;
    clearTimeout(this.eqUnplug);
    if (on && !this.eqConnected) {
      this.bus.connect(first);
      this.eqConnected = true;
    }
    paths.wet.gain.setTargetAtTime(on ? 1 : 0, time, 0.01);
    paths.dry.gain.setTargetAtTime(on ? 0 : 1, time, 0.01);
    if (!on && this.eqConnected)
      this.eqUnplug = setTimeout(() => {
        if (this.eq.on || !this.bus) return;
        this.bus.disconnect(first);
        this.eqConnected = false;
      }, 100);
  }

  setVolume(volume: number): void {
    this.volume = volume;
    this.applyVolume();
  }

  private applyVolume(): void {
    if (this.master) this.master.gain.value = this.volume;
    else for (const deck of this.decks) deck.element.volume = this.volume;
  }

  setFactor(factor: number): void {
    this.playing.factor = finite(factor);
    this.setGain(this.playing, this.playing.factor);
  }

  async setSink(id: string): Promise<void> {
    this.sinkId = id;
    const target = (this.context ?? null) as { setSinkId?: (id: string) => Promise<void> } | null;
    if (target?.setSinkId) await target.setSinkId(id);
    else
      await Promise.all(
        this.decks.map((deck) => (deck.element as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }).setSinkId?.(id)),
      );
  }

  load(songId: string, url: string, requested: number, startAt: number, autoplay: boolean): void {
    const factor = finite(requested);
    clearTimeout(this.timer);
    this.armed = null;
    let faded = false;
    if (this.idle.songId === songId && (this.idle.element.src || this.idle.sizing) && !this.idle.element.error) {
      const from = this.playing;
      from.wantsPlay = false;
      this.active = 1 - this.active;
      const to = this.playing;
      if (this.fadesSkips && autoplay && !from.element.paused && from.gain && to.gain && this.context) {
        const { incoming, outgoing } = equalPower(factor, from.factor);
        const time = this.context.currentTime;
        from.gain.gain.cancelScheduledValues(time);
        from.gain.gain.setValueCurveAtTime(outgoing, time, SKIP_FADE_SECONDS);
        to.gain.gain.cancelScheduledValues(time);
        to.gain.gain.setValueCurveAtTime(incoming, time, SKIP_FADE_SECONDS);
        this.parkAfter(from, SKIP_FADE_SECONDS * 1000 + 50);
        faded = true;
      } else from.element.pause();
    } else {
      this.playing.element.pause();
      this.playing.songId = songId;
      this.source(this.playing, url);
    }
    const deck = this.playing;
    deck.factor = factor;
    if (!faded) {
      this.setGain(deck, factor);
      this.setGain(this.idle, 0);
    }
    this.events.duration(Number.isFinite(deck.element.duration) ? deck.element.duration : 0);
    this.cancelStart(deck);
    if (startAt) {
      if (deck.element.readyState >= HTMLMediaElement.HAVE_METADATA) deck.element.currentTime = startAt;
      else this.startAt(deck, startAt);
    } else if (deck.element.currentTime) deck.element.currentTime = 0;
    if (autoplay) void this.play();
  }

  preload(songId: string | null, url: string | null, factor: number, startAt = 0, fade = 0): void {
    const wait = this.tailUntil - performance.now();
    if (wait > 0) {
      setTimeout(() => this.preload(songId, url, factor, startAt, fade), wait);
      return;
    }
    const idle = this.idle;
    if (idle.songId === songId) {
      idle.factor = finite(factor);
      idle.fade = fade;
      if (idle.element.readyState < HTMLMediaElement.HAVE_METADATA) {
        if (startAt) this.startAt(idle, startAt);
        else this.cancelStart(idle);
      } else if (Math.abs(idle.element.currentTime - startAt) > 0.01) idle.element.currentTime = startAt;
      return;
    }
    clearTimeout(this.timer);
    this.armed = null;
    idle.element.pause();
    idle.songId = songId;
    idle.factor = finite(factor);
    idle.fade = fade;
    if (url) {
      this.source(idle, url);
      idle.element.load();
      if (startAt) this.startAt(idle, startAt);
    } else {
      this.release(idle);
      idle.element.removeAttribute("src");
    }
  }

  reload(url: string, startAt: number): void {
    const deck = this.playing;
    this.source(deck, url);
    this.startAt(deck, startAt);
    void this.play().catch((error) => this.rejected(error));
  }

  private rejected(error: unknown): void {
    if (error instanceof DOMException && error.name !== "NotSupportedError") return;
    if (this.playing.element.error) this.events.error();
  }

  get errorCode(): number | null {
    return this.playing.element.error?.code ?? null;
  }

  fade(volume: number, seconds: number): Promise<void> {
    if (!this.master || !this.context) {
      this.setVolume(volume);
      return Promise.resolve();
    }
    const time = this.context.currentTime;
    this.master.gain.cancelScheduledValues(time);
    this.master.gain.setValueAtTime(this.master.gain.value, time);
    this.master.gain.linearRampToValueAtTime(volume, time + seconds);
    return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
  }

  // Called from taps and key presses (iOS also suspends the context for a call or lock): a context started after a
  // network wait is no gesture and stays silent on iOS.
  unlock(): void {
    this.ensureGraph();
    if (this.context && this.context.state !== "running") void this.context.resume().catch(() => undefined);
  }

  async play(): Promise<void> {
    this.ensureGraph();
    // Not awaited: a suspended context's resume() can stay pending until the next gesture.
    if (this.context && this.context.state !== "running") void this.context.resume().catch(() => undefined);
    const deck = this.playing;
    deck.wantsPlay = true;
    if (deck.sizing) return;
    try {
      await deck.element.play();
    } catch (error) {
      if (!(deck.sizing && error instanceof DOMException && error.name === "AbortError")) throw error;
    }
  }

  pause(): void {
    clearTimeout(this.timer);
    this.armed = null;
    this.playing.wantsPlay = false;
    this.playing.element.pause();
  }

  seek(seconds: number): void {
    clearTimeout(this.timer);
    this.armed = null;
    this.cancelStart(this.playing);
    this.playing.element.currentTime = seconds;
  }

  stop(): void {
    clearTimeout(this.timer);
    for (const deck of this.decks) {
      deck.element.pause();
      this.release(deck);
      deck.wantsPlay = false;
      deck.element.removeAttribute("src");
      deck.songId = null;
    }
  }

  tick(): void {
    this.armHandover();
  }

  private fadeNow(): number {
    return fitFade(this.idle.fade, this.playing.element.duration, this.idle.element.duration || Number.POSITIVE_INFINITY);
  }

  private armHandover(): void {
    const element = this.playing.element;
    const remaining = element.duration - element.currentTime;
    const fade = this.fadeNow();
    if (element.paused || !Number.isFinite(remaining) || remaining > ARM_SECONDS + fade || !this.idle.songId || this.armed === this.playing)
      return;
    clearTimeout(this.timer);
    this.armed = this.playing;
    const expected = this.playing;
    this.timer = setTimeout(
      () => {
        if (this.playing === expected && !this.handover()) this.armed = null;
      },
      Math.max(0, (remaining - LEAD_SECONDS - fade) * 1000),
    );
  }

  private parkAfter(from: Deck, milliseconds: number): void {
    this.tailUntil = performance.now() + milliseconds;
    setTimeout(() => {
      if (from !== this.playing) from.element.pause();
    }, milliseconds);
    from.songId = null;
  }

  private handover(): boolean {
    const from = this.playing;
    const to = this.idle;
    if (!to.songId || to.element.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) return false;
    const time = this.context?.currentTime ?? 0;
    const left = from.element.duration - from.element.currentTime;
    const fade = this.context && left > 0.05 ? Math.min(this.fadeNow(), left) : 0;
    if (to.gain && from.gain) {
      to.gain.gain.cancelScheduledValues(time);
      from.gain.gain.cancelScheduledValues(time);
      if (fade > RAMP_SECONDS) {
        const { incoming, outgoing } = equalPower(to.factor, from.factor);
        to.gain.gain.setValueCurveAtTime(incoming, time, fade);
        from.gain.gain.setValueCurveAtTime(outgoing, time, fade);
      } else {
        to.gain.gain.setValueAtTime(0, time);
        to.gain.gain.linearRampToValueAtTime(to.factor, time + RAMP_SECONDS);
        from.gain.gain.setValueAtTime(from.factor, time + LEAD_SECONDS);
        from.gain.gain.linearRampToValueAtTime(0, time + LEAD_SECONDS + RAMP_SECONDS);
      }
    }
    this.armed = null;
    this.active = 1 - this.active;
    from.wantsPlay = false;
    to.wantsPlay = true;
    void to.element.play().catch((error) => this.rejected(error));
    this.parkAfter(from, fade > RAMP_SECONDS ? fade * 1000 + 50 : (LEAD_SECONDS + RAMP_SECONDS) * 1000 + 50);
    this.events.handover();
    return true;
  }

  buffered(): number {
    const element = this.playing.element;
    for (let i = 0; i < element.buffered.length; i += 1)
      if (element.buffered.start(i) <= element.currentTime + 0.5) {
        const end = element.buffered.end(i);
        if (end >= element.currentTime) return end;
      }
    return 0;
  }

  // `HAVE_ENOUGH_DATA` alone isn't enough: it's the browser's guess at the current rate, which another download changes.
  bufferedAhead(seconds: number): boolean {
    const element = this.playing.element;
    if (element.networkState === HTMLMediaElement.NETWORK_IDLE && element.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) return true;
    const end = this.buffered();
    return end - element.currentTime >= seconds || (element.duration > 0 && end >= element.duration - 0.5);
  }

  get preloadedId(): string | null {
    return this.idle.songId;
  }

  snapshot() {
    const context = this.context as (AudioContext & { outputLatency?: number }) | null;
    return {
      decks: this.decks.map((deck, index) => {
        const { element } = deck;
        return {
          index,
          active: deck === this.playing,
          songId: deck.songId,
          src: element.getAttribute("src"),
          fromBlob: !!deck.object,
          sizedFrom: deck.sized,
          downloading: deck.sizing,
          downloadError: deck.sizeError,
          readyState: element.readyState,
          networkState: element.networkState,
          error: element.error ? { code: element.error.code, message: element.error.message } : null,
          currentTime: element.currentTime,
          duration: element.duration,
          paused: element.paused,
          muted: element.muted,
          volume: element.volume,
          gain: deck.gain?.gain.value ?? null,
          factor: deck.factor,
        };
      }),
      context: context && {
        state: context.state,
        sampleRate: context.sampleRate,
        baseLatency: context.baseLatency,
        outputLatency: context.outputLatency ?? null,
        sinkId: this.sinkId,
        hasSetSinkId: "setSinkId" in context,
      },
      master: this.master?.gain.value ?? null,
      volume: this.volume,
      levels: this.meter ? "running" : this.onLevels ? "starting" : "off",
      events: [...this.log],
    };
  }

  /** The loudest sample leaving the graph (before the master gain) over `milliseconds`; null without a graph. */
  async outputPeak(milliseconds: number): Promise<number | null> {
    const context = this.context;
    const out = this.paths?.out;
    if (!context || !out) return null;
    const analyser = context.createAnalyser();
    const mute = context.createGain();
    mute.gain.value = 0;
    let linked = false;
    try {
      out.connect(analyser).connect(mute).connect(context.destination);
      linked = true;
      const samples = new Float32Array(analyser.fftSize);
      let peak = 0;
      for (const end = performance.now() + milliseconds; performance.now() < end; ) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        analyser.getFloatTimeDomainData(samples);
        for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
      }
      return peak;
    } finally {
      if (linked) {
        out.disconnect(analyser);
        mute.disconnect();
      }
    }
  }
}
