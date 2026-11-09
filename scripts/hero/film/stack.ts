import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFixture } from "../fixture";
import { startWords } from "./words";

export type FilmPorts = { mock: number; fixture: number; words: number; app: number };

export const MAIN_PORTS: FilmPorts = { mock: 4700, fixture: 4701, words: 4702, app: 4703 };
export const LONG_PORTS: FilmPorts = { mock: 4710, fixture: 4711, words: 4712, app: 4713 };

const TOKEN = "e2e-lyterion-token-0123456789";

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

/** The hero stack plus what the film needs: word-timed lyrics, the AI prompt, follows and releases. */
export async function startFilmStack(ports: FilmPorts, tracks: number): Promise<() => void> {
  const data = mkdtempSync(join(tmpdir(), "lodesong-film-"));
  const mockUrl = `http://127.0.0.1:${ports.mock}`;
  const kill: (() => void)[] = [];
  const stopAll = (): void => {
    for (const stop of kill) stop();
  };
  const mock = Bun.spawn(["bun", "test/mock/server.ts"], {
    env: { ...process.env, MOCK_PORT: String(ports.mock), MOCK_TRACKS: String(tracks) },
    stdout: "ignore",
    stderr: "ignore",
  });
  kill.push(() => mock.kill());
  try {
    await until(`${mockUrl}/rest/ping`);
    const fixture = startFixture(ports.fixture, mockUrl);
    kill.push(() => fixture.stop());
    const words = startWords(ports.words, `http://127.0.0.1:${ports.fixture}`);
    kill.push(() => words.stop());
    const wordsUrl = `http://127.0.0.1:${ports.words}`;
    const app = Bun.spawn(["./dist/lodesong"], {
      env: {
        ...process.env,
        PORT: String(ports.app),
        NAVIDROME_URL: wordsUrl,
        DATA_DIR: data,
        UPLOAD_DIR: join(data, "uploads"),
        LRCLIB_URL: `${wordsUrl}/lrclib`,
        GROQ_API_KEY: "film-groq-key",
        GROQ_URL: `${mockUrl}/groq`,
        LYTERION_URL: `${mockUrl}/lyterion`,
        LYTERION_TOKEN: TOKEN,
        MUSICBRAINZ_URL: `${mockUrl}/musicbrainz`,
        LYRICS_BACKFILL: "off",
        UPDATE_CHECK: "off",
      },
      stdout: "ignore",
      stderr: "ignore",
    });
    kill.push(() => app.kill());
    await until(`http://127.0.0.1:${ports.app}/healthz`);
  } catch (error) {
    stopAll();
    throw error;
  }
  return stopAll;
}
