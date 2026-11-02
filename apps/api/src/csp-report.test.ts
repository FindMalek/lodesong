import { expect, test } from "bun:test";
import { createCspReporter } from "./csp-report";

const post = (body: unknown) => new Request("http://x/api/csp-report", { method: "POST", body: JSON.stringify(body) });

test("logs both report formats and drops the flood past the per-minute cap", async () => {
  const lines: string[] = [];
  const report = createCspReporter(
    (line) => lines.push(line),
    () => 0,
  );

  expect(
    (
      await report(
        post({ "csp-report": { "violated-directive": "img-src", "blocked-uri": "https://evil.test/a.png", "document-uri": "http://x/" } }),
      )
    ).status,
  ).toBe(204);
  await report(
    post([{ type: "csp-violation", body: { effectiveDirective: "script-src", blockedURL: "inline", documentURL: "http://x/" } }]),
  );
  expect(lines).toEqual([
    "csp violation: img-src blocked https://evil.test/a.png on http://x/",
    "csp violation: script-src blocked inline on http://x/",
  ]);

  for (let i = 0; i < 40; i++) await report(post({ "csp-report": { "violated-directive": "img-src" } }));
  expect(lines).toHaveLength(30);
  expect((await report(new Request("http://x", { method: "POST", body: "not json" }))).status).toBe(204);
});

test("rejects a huge or malformed body", async () => {
  const report = createCspReporter(
    () => {},
    () => 0,
  );
  expect((await report(new Request("http://x", { method: "POST", body: "{".repeat(9000) }))).status).toBe(413);
  expect((await report(new Request("http://x", { method: "POST", body: "nope" }))).status).toBe(400);
});
