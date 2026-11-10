import { expect, test } from "bun:test";
import { readConfig } from "./settings";

test("one env var is enough: everything else has a working default", () => {
  const { config, errors } = readConfig({ NAVIDROME_URL: "http://navidrome:4533/" });
  expect(errors).toEqual([]);
  expect(config.upstreams).toEqual([{ id: "default", url: "http://navidrome:4533" }]);
  expect([config.port, config.lyricsBackfill, config.trustProxy, config.updateCheck]).toEqual([8080, true, false, false]);
});

test("several servers come from NAVIDROME_SERVERS, and bad entries are named", () => {
  expect(readConfig({ NAVIDROME_SERVERS: "home=http://a:4533, friend=https://b.example.com/" }).config.upstreams).toEqual([
    { id: "home", url: "http://a:4533" },
    { id: "friend", url: "https://b.example.com" },
  ]);
  expect(readConfig({ NAVIDROME_SERVERS: "home=ftp://a,home=http://b,http://c" }).errors).toEqual([
    'NAVIDROME_SERVERS: "home=ftp://a" isn\'t id=http(s)://host',
    'NAVIDROME_SERVERS: "http://c" isn\'t id=http(s)://host',
  ]);
});

test("every bad value is reported at once, each naming its variable", () => {
  const { errors } = readConfig({
    NAVIDROME_URL: "navidrome:4533",
    PORT: "eighty",
    COVER_CACHE_MB: "-1",
    TRUST_PROXY: "maybe",
    INDEX_USER: "bot",
  });
  expect(errors.map((error) => error.split(" ")[0])).toEqual(["NAVIDROME_URL", "INDEX_USER", "PORT", "COVER_CACHE_MB", "TRUST_PROXY"]);
});

test("DEMO_SEED needs the account it seeds", () => {
  expect(readConfig({ DEMO_SEED: "on" }).errors.map((error) => error.split(" ")[0])).toEqual(["DEMO_SEED=on"]);
  const ok = readConfig({ DEMO_SEED: "on", INDEX_USER: "demo", INDEX_PASSWORD: "demo" });
  expect(ok.errors).toEqual([]);
  expect(ok.config.demoSeed).toBe(true);
  expect(readConfig({}).config.demoSeed).toBe(false);
});

test("AUDIOMUSE_URL is optional and must be a URL", () => {
  expect(readConfig({}).config.audiomuseUrl).toBeNull();
  expect(readConfig({ AUDIOMUSE_URL: "http://audiomuse:8000/" }).config.audiomuseUrl).toBe("http://audiomuse:8000");
  expect(readConfig({ AUDIOMUSE_URL: "audiomuse" }).errors.map((error) => error.split(" ")[0])).toEqual(["AUDIOMUSE_URL"]);
});

test("PUBLIC_URL loses a trailing slash, and a value that passes a regex but is not an origin is an error", () => {
  expect(readConfig({ PUBLIC_URL: "https://tunes.example/" }).config.publicUrl).toBe("https://tunes.example");
  expect(readConfig({}).config.publicUrl).toBeNull();
  for (const bad of ["https://x.example:99999", "http://[::1", "https://user:pw@evil.example", "https://x.example/app"]) {
    const { errors } = readConfig({ PUBLIC_URL: bad });
    expect(errors.map((error) => error.split(" ")[0])).toEqual(["PUBLIC_URL"]);
  }
});

test("SHARE_PURGE is off unless asked for", () => {
  expect(readConfig({}).config.purgeShares).toBe(false);
  expect(readConfig({ SHARE_PURGE: "on" }).config.purgeShares).toBe(true);
  expect(readConfig({ SHARE_PURGE: "yes" }).errors.map((error) => error.split(" ")[0])).toEqual(["SHARE_PURGE"]);
});

test("only a public demo with its own account signs visitors in; the index account never does", () => {
  const index = { INDEX_USER: "admin", INDEX_PASSWORD: "secret" };
  expect(readConfig({ PUBLIC_DEMO: "on", ...index }).config.demoAccount).toBeNull();
  expect(readConfig({ ...index }).config.demoAccount).toBeNull();
  expect(readConfig({ PUBLIC_DEMO: "on", DEMO_USER: "demo", DEMO_PASSWORD: "pw", ...index }).config.demoAccount).toEqual({
    user: "demo",
    password: "pw",
  });
  expect(readConfig({ DEMO_USER: "demo", DEMO_PASSWORD: "pw" }).config.demoAccount).toBeNull();
  expect(readConfig({ DEMO_USER: "demo", DEMO_PASSWORD: "pw" }).errors.map((error) => error.split(" ")[0])).toEqual(["DEMO_USER"]);
  expect(readConfig({ PUBLIC_DEMO: "on", DEMO_USER: "demo" }).errors.map((error) => error.split(" ")[0])).toEqual(["DEMO_USER"]);
});
