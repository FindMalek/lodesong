export const COPY = {
  headline: ["your music.", "your server."],
  label: "self-hosted music player",
  key: "y",
  keyLabel: "synced lyrics",
  cover: { track: "signal violet pt. 2", artist: "satellite garden" },
  lyrics: [
    "i count the satellites",
    "say it slowly orbit",
    "the quiet between neon",
    "i keep the lights on",
    "hold the signal violet",
    "static echo at night",
    "we were never lost",
    "just out of range",
  ],
} as const;

export const FIXTURE = {
  album: { title: "Quiet Hours II", artist: "Satellite Garden", year: 2015, format: "FLAC" },
  nav: ["home", "albums", "artists", "songs", "liked songs", "history", "folders"],
  playlists: ["daily mix 1", "daily mix 2", "daily mix 3", "discover weekly", "daylist", "late night drive"],
  tracks: [
    ["Signal Violet Pt. 2", 222],
    ["Static Echo at Night", 198],
    ["Morning Lantern (Reprise)", 251],
    ["North Echo (Reprise)", 187],
    ["Silver Atlas Again", 234],
    ["Neon Atlas", 205],
    ["Fever Ember", 176],
    ["Morning Violet (Reprise)", 263],
  ],
} as const;

export function clock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

export const FILM = {
  mixes: {
    caption: ["mixes from", "what you play."],
    source: "what you play",
    artists: ["satellite garden", "north echo", "silver atlas"],
    row: ["discover weekly", "daily mix 2", "daily mix 1", "daily mix 3", "daylist"],
  },
  session: {
    caption: ["one session.", "every device."],
    devices: ["chrome on mac", "iphone"],
    playingOn: "playing on",
    chips: ["web", "macos", "ios", "android", "desktop"],
  },
  keys: {
    caption: ["keyboard", "first."],
    query: "lights on",
    results: [
      { line: "i keep the lights on", song: "signal violet pt. 2", at: "1:14" },
      { line: "leave the lights on", song: "static echo at night", at: "0:58" },
      { line: "lights on the atlas", song: "silver atlas again", at: "2:21" },
    ],
    play: "play from this line",
    sheet: [
      [["space"], "play / pause"],
      [["n"], "next song"],
      [["p"], "previous song"],
      [["f"], "like the song"],
      [["s"], "shuffle"],
      [["r"], "repeat"],
      [["b"], "save a moment"],
      [["g", "q"], "open the queue"],
      [["g", "h"], "go to home"],
      [["⌘", "k"], "search"],
    ],
  },
  terminal: {
    caption: ["now playing", "in your terminal."],
    command: "/lodesong next",
    now: [
      { track: "signal violet pt. 2", artist: "satellite garden", line: "i keep the lights on", at: 0 },
      { track: "static echo at night", artist: "satellite garden", line: "hold the signal violet", at: 3 },
    ],
  },
  end: {
    url: "github.com/FindMalek/lodesong",
    docker: ["docker run -p 8080:8080 -v lodesong-data:/data \\", "  -e NAVIDROME_URL=http://navidrome:4533 ghcr.io/findmalek/lodesong"],
  },
} as const;

export const ALBUM_MINUTES = Math.round(FIXTURE.tracks.reduce((sum, [, seconds]) => sum + seconds, 0) / 60);
