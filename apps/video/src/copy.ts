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

export const ALBUM_MINUTES = Math.round(FIXTURE.tracks.reduce((sum, [, seconds]) => sum + seconds, 0) / 60);
