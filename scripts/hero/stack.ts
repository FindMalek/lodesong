import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFixture } from "./fixture";

const MOCK = 4690;
const FIXTURE = 4691;
export const APP = 4692;

async function until(url: string): Promise<void> {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (
      await fetch(url).then(
        (response) => response.ok,
        () => false,
      )
    )
      return;
    await Bun.sleep(500);
  }
  throw new Error(`${url} never came up`);
}

export async function startStack(): Promise<() => void> {
  const data = mkdtempSync(join(tmpdir(), "lodesong-hero-"));
  const mock = Bun.spawn(["bun", "test/mock/server.ts"], {
    env: { ...process.env, MOCK_PORT: String(MOCK), MOCK_TRACKS: "900" },
    stdout: "ignore",
    stderr: "ignore",
  });
  const kill: (() => void)[] = [() => mock.kill()];
  try {
    await until(`http://127.0.0.1:${MOCK}/rest/ping`);
    const fixture = startFixture(FIXTURE, `http://127.0.0.1:${MOCK}`);
    kill.push(() => fixture.stop());
    const app = launch(data);
    kill.push(() => app.kill());
    await until(`http://127.0.0.1:${APP}/healthz`);
  } catch (error) {
    for (const stop of kill) stop();
    throw error;
  }
  return () => {
    for (const stop of kill) stop();
  };
}

function launch(data: string): ReturnType<typeof Bun.spawn> {
  return Bun.spawn(["./dist/lodesong"], {
    env: {
      ...process.env,
      PORT: String(APP),
      NAVIDROME_URL: `http://127.0.0.1:${FIXTURE}`,
      DATA_DIR: data,
      UPLOAD_DIR: join(data, "uploads"),
      LRCLIB_URL: `http://127.0.0.1:${FIXTURE}/lrclib`,
      LYRICS_BACKFILL: "off",
      MUSICBRAINZ_URL: "",
      UPDATE_CHECK: "off",
    },
    stdout: "ignore",
    stderr: "ignore",
  });
}
