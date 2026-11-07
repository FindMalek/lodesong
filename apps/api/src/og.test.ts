import { afterAll, expect, test } from "bun:test";
import { createApi } from "./api";
import { CoverCache } from "./covers";
import { openLibraryDb } from "./db";
import { LyricsService } from "./lyrics";
import { LoginLimiter } from "./rate-limit";
import { SessionStore } from "./sessions";

const NAME = `"><script>alert(1)</script> & 'x'`;
const navidrome = Bun.serve({
  port: 0,
  fetch: (request) => {
    const endpoint = new URL(request.url).pathname;
    const playlist = { name: NAME, songCount: 3, coverArt: "pl-1" };
    return Response.json({ "subsonic-response": { status: "ok", ...(endpoint.includes("getPlaylist") ? { playlist } : {}) } });
  },
});
afterAll(() => navidrome.stop());

const api = createApi({
  upstreams: [{ id: "home", url: `http://127.0.0.1:${navidrome.port}` }],
  indexes: new Map(),
  library: openLibraryDb(":memory:"),
  lyrics: new LyricsService(openLibraryDb(":memory:"), ""),
  covers: new CoverCache(`${process.env.TMPDIR ?? "/tmp"}/kp-covers-${crypto.randomUUID()}`, 1_000_000),
  sessions: new SessionStore(":memory:", "secret", 60_000),
  limiter: new LoginLimiter(),
  idleSeconds: 60,
  trustProxy: false,
});

const share = (headers: Record<string, string> = {}) =>
  api.shareHead(Object.assign(new Request("https://music.example/playlist/pl-1?x=1", { headers }), { params: { id: "pl-1" } }), "playlist");

test("a crawler gets the generic card, a signed-in browser the escaped playlist", async () => {
  const bot = await share({ "user-agent": "Slackbot-LinkExpanding 1.0" });
  expect(bot).toContain('property="og:title" content="lodesong"');
  expect(bot).toContain('content="https://music.example/og.png"');
  expect(bot).toContain('property="og:url" content="https://music.example/playlist/pl-1"');
  expect(bot).toContain('name="twitter:card" content="summary_large_image"');
  expect(bot).not.toContain("3 songs");
  expect(bot).not.toContain("pl-1/600");

  const login = await api.login(
    new Request("http://app/auth/login", {
      method: "POST",
      headers: { "x-lodesong": "1", "content-type": "application/json" },
      body: JSON.stringify({ user: "demo", password: "demo", server: "home" }),
    }),
    { requestIP: () => ({ address: "127.0.0.1" }) } as unknown as Parameters<typeof api.login>[1],
  );
  const cookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";
  const member = await share({ cookie });
  expect(member).toContain("playlist · 3 songs");
  expect(member).toContain("https://music.example/cover/pl-1/600");
  expect(member).toContain("&#34;&#62;&#60;script&#62;alert(1)&#60;/script&#62; &#38; &#39;x&#39;");
  expect(member).not.toContain("<script");
});
