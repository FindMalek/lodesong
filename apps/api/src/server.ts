import { join } from "node:path";
import { MAX_DEVICE_MESSAGE_BYTES } from "@lodesong/shared/devices";
import { LEVELS_WORKLET_SOURCE } from "@lodesong/shared/levels-worklet";
import { createApi } from "./api";
import { ArtistGenres } from "./artist-genres";
import { syncFeatures } from "./audiomuse";
import { LyricsBackfill, serviceAccount } from "./backfill";
import { createCache } from "./cache";
import { compressed } from "./compress";
import { config } from "./config";
import { CoverCache } from "./covers";
import { createCspReporter } from "./csp-report";
import { openLibraryDb } from "./db";
import { DeviceHub } from "./devices";
import { FollowSync } from "./follow-sync";
import { font } from "./fonts";
import { HealthCheck, UpdateCheck, VERSION } from "./health";
import { LrcWriter } from "./lrc-writer";
import { LyricsService } from "./lyrics";
import { cardImage, type ShareKind } from "./og";
import { pwaRoutes } from "./pwa";
import { LoginLimiter } from "./rate-limit";
import { lyterionHandOff, MusicBrainz, ReleaseWatch } from "./releases";
import { IndexSync } from "./search-index";
import { SessionStore } from "./sessions";
import { MAX_UPLOAD_BYTES } from "./upload";

// Dead-code eliminated per build: the executable only contains the static server, dev only the bundler route.
const { webRoutes, pageWith } = process.env.NODE_ENV === "production" ? await import("./static") : await import("./dev");

const idleSeconds = config.sessionIdleDays * 86_400;
const sessions = new SessionStore(join(config.dataDir, "sessions.db"), config.sessionSecret, idleSeconds * 1000);
setInterval(() => sessions.purgeIdle(), 3_600_000).unref();

const library = openLibraryDb(join(config.dataDir, "library.db"));
const lyrics = new LyricsService(library, config.lrclibUrl);
const indexes = new Map(
  config.upstreams.map((upstream) => [
    upstream.id,
    new IndexSync(library, upstream, serviceAccount(sessions, upstream, { user: config.indexUser, password: config.indexPassword })),
  ]),
);
for (const index of indexes.values()) index.start();
if (config.demoSeed && config.indexUser && config.indexPassword) {
  const [first] = config.upstreams;
  const { indexUser, indexPassword } = config;
  if (first) void import("./demo-seed").then((demo) => demo.seedDemoHistory(library, first, indexUser, indexPassword));
}
const { audiomuseUrl } = config;
if (audiomuseUrl) {
  const pull = () => {
    for (const upstream of config.upstreams) void syncFeatures(library, upstream.id, audiomuseUrl).catch(() => null);
  };
  setTimeout(pull, 60_000).unref();
  setInterval(pull, 6 * 3_600_000).unref();
}
const lrc = config.lrcDir ? new LrcWriter(library, config.lrcDir) : null;
if (lrc) lyrics.onLrclib = (server, song, text) => lrc.write(server, song, text);
const backfills = new Map(
  config.lyricsBackfill && config.lrclibUrl
    ? config.upstreams.map((upstream) => [
        upstream.id,
        new LyricsBackfill(
          library,
          lyrics,
          upstream,
          serviceAccount(sessions, upstream, { user: config.indexUser, password: config.indexPassword }),
        ),
      ])
    : [],
);
for (const backfill of backfills.values()) backfill.start();
const musicbrainz = config.musicbrainzUrl ? new MusicBrainz(config.musicbrainzUrl) : null;
const artistGenres = musicbrainz ? new ArtistGenres(library, musicbrainz) : null;
const releases = musicbrainz
  ? new ReleaseWatch(library, musicbrainz, {
      autoGet: config.releasesAutoGet,
      handOff: config.lyterion ? lyterionHandOff(config.lyterion) : null,
    })
  : null;
releases?.start();
const followSync = config.lyterion ? new FollowSync(library, config.lyterion, () => sessions.adminAccounts()) : null;
followSync?.start();
const covers = new CoverCache(join(config.dataDir, "covers"), config.coverCacheMb * 1024 * 1024);
const api = createApi({
  upstreams: config.upstreams,
  covers,
  lyrics,
  indexes,
  library,
  sessions,
  limiter: new LoginLimiter(),
  idleSeconds,
  trustProxy: config.trustProxy,
  publicDemo: config.publicDemo,
  updates: new UpdateCheck(config.updateCheck),
  backfills,
  lrc,
  uploadDir: config.uploadDir,
  lyterion: config.lyterion,
  releases,
  artistGenres,
  followSync,
  devices: config.oneSession ? new DeviceHub() : null,
  groq: config.groq,
  audiomuseUrl: config.audiomuseUrl,
  feedback: config.feedback,
  cache: createCache(config.redisUrl),
});
const health = new HealthCheck(config.upstreams);

const cspReport = createCspReporter();

// The player's own links, so a pasted one unfurls. Dev serves the bundler's page as is.
const shareRoutes = pageWith
  ? Object.fromEntries(
      (["album", "artist", "playlist", "song"] as ShareKind[]).map((kind) => [
        `/${kind}/:id`,
        async (request: Request & { params: { id: string } }) => pageWith(await api.shareHead(request, kind)),
      ]),
    )
  : {};

const server = Bun.serve({
  port: config.port,
  development: process.env.NODE_ENV !== "production",
  // Long streams must not be cut by the idle timeout.
  idleTimeout: 0,
  // Uploads are one file per request; a long hi-res track is over Bun's 128 MB default.
  maxRequestBodySize: MAX_UPLOAD_BYTES,
  websocket: { ...api.sockets, maxPayloadLength: MAX_DEVICE_MESSAGE_BYTES },
  routes: compressed({
    "/healthz": () => new Response("ok"),
    "/worklets/levels.js": () =>
      new Response(LEVELS_WORKLET_SOURCE, { headers: { "content-type": "text/javascript", "cache-control": "public, max-age=86400" } }),
    "/og.png": cardImage,
    "/api/csp-report": { POST: cspReport },
    "/api/health": { GET: () => health.response() },
    "/api/rpc/*": api.rpc,
    "/api": api.http,
    "/api/*": api.http,
    "/auth/login": { POST: api.login },
    "/auth/logout": { POST: api.logout },
    "/auth/session": { GET: api.current },
    "/auth/sessions": { GET: api.listSessions },
    "/auth/sessions/:id": { DELETE: api.revokeSession },
    "/auth/api-token": { POST: api.apiToken },
    "/rest/*": api.proxy,
    "/cover/:id/:size": api.cover,
    "/release-cover/:id": api.releaseCover,
    "/api/listen": { POST: api.listenCreate },
    "/api/listen/:code": { GET: api.listenSocket },
    "/api/devices": { GET: api.devicesSocket },
    "/api/remote/token": { POST: api.remoteToken },
    "/api/ai/playlist": { POST: api.aiPlaylist },
    "/api/feedback": { POST: api.sendFeedback },
    "/api/remote/now": { GET: api.remoteNow },
    "/api/remote/:action": { POST: api.remoteAction },
    "/api/lyrics/coverage": { GET: api.lyricsCoverage },
    "/api/doctor": { GET: api.doctor },
    "/api/lyrics/missing": { GET: api.lyricsMissing },
    "/api/lyrics/refetch": { POST: api.lyricsRefetch },
    "/api/lyrics/written": { DELETE: api.lyricsWritten },
    "/api/upload": { GET: api.upload, PUT: api.upload },
    "/api/upload/metadata": { POST: api.uploadMetadata, PUT: api.uploadMetadata },
    "/api/lyterion": { GET: api.lyterionSummary },
    "/api/wishlist/:step": { POST: api.wishlist },
    "/api/lyrics/:songId": { GET: api.songLyrics },
    "/api/index": { GET: api.searchIndex, POST: api.searchIndex },
    "/api/search": { GET: api.searchLibrary },
    "/api/audiomuse": { GET: api.audiomuse },
    "/api/audiomuse/sync": { POST: api.audiomuse },
    "/api/audiomuse/shuffle": { POST: api.audiomuse },
    "/api/audiomuse/features": { POST: api.audiomuse },
    "/api/audiomuse/similar/:id": { GET: api.audiomuse },
    "/api/import/match": { POST: api.importMatch },
    "/api/search/lyrics": { GET: api.searchLyrics },
    "/fonts/:name": font,
    ...pwaRoutes,
    ...shareRoutes,
    ...webRoutes,
  }),
});

console.log(`lodesong ${VERSION} on :${server.port} → ${config.upstreams.map((upstream) => `${upstream.id} ${upstream.url}`).join(", ")}`);
