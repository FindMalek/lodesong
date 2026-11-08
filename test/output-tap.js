// Taps what reaches a context's speakers, for e2e/audio.ts and the macOS harness. window.__tap: sink "none" | "spy"
// (records setSinkId), gate (suspended until a trusted tap, like WebKit). Any sink but "real" is silent: no engine's sinkId is trusted.
(() => {
  const { sink = "real", gate = false } = window.__tap ?? {};
  const quiet = sink !== "real";
  const Native = window.AudioContext;
  const sinkCalls = [];
  let Context = Native;
  if (sink === "none") {
    Context = class extends Native {
      constructor(options) {
        super({ ...options, sinkId: { type: "none" } });
      }
    };
    Context.prototype.setSinkId = async () => undefined;
  } else if (sink === "spy" && Native.prototype.setSinkId) {
    Context = class extends Native {
      constructor(options) {
        super({ ...options, sinkId: { type: "none" } });
      }
    };
    // The default device ("") stays "none" so a runner without a sound card does not stall.
    Context.prototype.setSinkId = function (id) {
      sinkCalls.push(typeof id === "string" ? id : JSON.stringify(id));
      return Native.prototype.setSinkId.call(this, id === "" ? { type: "none" } : id);
    };
  }
  if (gate) {
    let tapping = false;
    for (const type of ["click", "touchend", "keydown"])
      window.addEventListener(
        type,
        (event) => {
          if (!event.isTrusted) return;
          tapping = true;
          setTimeout(() => (tapping = false), 0);
        },
        { capture: true, passive: true },
      );
    Context = class extends Context {
      constructor(options) {
        super(options);
        this.suspend().catch(() => undefined);
      }
      resume() {
        return tapping ? super.resume() : new Promise(() => undefined);
      }
    };
  }
  if (Context !== Native) window.AudioContext = Context;
  const contexts = new Set();
  const elements = new Set();
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    elements.add(this);
    return play.call(this);
  };
  const analysers = new Map();
  const connect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (...args) {
    contexts.add(this.context);
    if (args[0] === this.context.destination) {
      let analyser = analysers.get(this.context);
      if (!analyser) {
        analyser = this.context.createAnalyser();
        const mute = this.context.createGain();
        mute.gain.value = 0;
        connect.call(analyser, mute);
        connect.call(mute, this.context.destination);
        analysers.set(this.context, analyser);
      }
      connect.call(this, analyser);
      if (quiet) return args[0];
    }
    return connect.apply(this, args);
  };
  const disconnect = AudioNode.prototype.disconnect;
  AudioNode.prototype.disconnect = function (...args) {
    const analyser = analysers.get(this.context);
    if (analyser && (args.length === 0 || args[0] === this.context.destination)) {
      try {
        disconnect.call(this, analyser);
      } catch {}
      if (quiet && args.length) return;
    }
    return disconnect.apply(this, args);
  };
  window.__output = {
    sinkCalls: () => sinkCalls,
    playhead: () => Math.max(0, ...[...elements].filter((element) => !element.paused).map((element) => element.currentTime)),
    silencedElement: () => [...elements].some((element) => !element.paused && (element.muted || element.volume < 1)),
    level: () => {
      let loudest = 0;
      for (const analyser of analysers.values()) {
        const samples = new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(samples);
        loudest = Math.max(loudest, Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length));
      }
      return loudest;
    },
    states: () => [...contexts].map((context) => context.state),
  };
})();
