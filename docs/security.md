# Security

lodesong is a thin client in front of your Navidrome. The server in this repo (`apps/api/src`) is the only thing that
talks to Navidrome, and the browser never sees a credential.

## How login works

1. The login form posts the username and password to `/auth/login`.
2. The server computes a Subsonic token (`md5(password + salt)`), checks it against Navidrome with `ping`, and throws
   the password away.
3. It stores a session in SQLite (`$DATA_DIR/sessions.db`):
   - the session key is a random 256-bit value; only its SHA-256 is stored
   - the Subsonic token and salt are encrypted with AES-256-GCM, keyed from `SESSION_SECRET` (or a random secret
     generated once in `$DATA_DIR/session.secret`)
4. The browser gets an `HttpOnly; SameSite=Lax` cookie (plus `Secure` behind HTTPS). JavaScript can't read it.
5. Every `/rest/*` call goes through the server's proxy, which adds the session's credentials upstream.

Sessions expire after `SESSION_IDLE_DAYS` (default 30) without use. You can list and sign out your other devices from
the user menu (sessions). Rotating `SESSION_SECRET` signs everyone out.

## What the proxy enforces

- **Fixed upstream.** Navidrome's address comes only from `NAVIDROME_URL` or the `NAVIDROME_SERVERS` allowlist, never
  from the request, so the server can't be used as an open proxy (SSRF).
- **Allowlisted endpoints.** Only the Subsonic endpoints the app uses are forwarded (`ENDPOINTS` in `apps/api/src/api.ts`).
  Admin endpoints like `deleteUser` or `createUser` return 404.
- **No client credentials.** `u`, `p`, `t`, `s`, `apiKey`, `c` and `v` are stripped from every request and set by the
  server.
- **CSRF.** Every call except media (`stream`, `download`, `getCoverArt`, `getAvatar`, which are read-only and loaded by
  `<img>`/`<audio>`) must carry `x-lodesong: 1`. Another site can't send that header without a CORS preflight, which
  the server never allows.
- **Login backoff.** After three failures, each failed attempt doubles the wait (1 s, 2 s, 4 s … 15 min), per client IP
  and per username. Set `TRUST_PROXY=1` behind a reverse proxy so the real client IP is used.

## In the browser

- No tokens in `localStorage`, URLs or browser history. Only the username is remembered, to draw the shell instantly.
  Stream and cover URLs carry no credentials, which also makes them cacheable.
- Content Security Policy in `index.html`: `default-src 'self'`. Scripts only from this origin plus one inline boot
  script, allowed by its SHA-256 (`bun scripts/csp.ts` prints it; a unit test fails if it drifts). Styles allow inline
  because components position popovers with `style` attributes.
- The production server also sends the CSP as a header, with `frame-ancestors 'none'` and `X-Frame-Options: DENY`
  (no clickjacking), plus `Permissions-Policy` (camera, geolocation, payment and usb off; only microphone on).
- Violations are reported to `POST /api/csp-report` (header `report-uri` and `Reporting-Endpoints`). The server logs
  one line per violation (`csp violation: <directive> blocked <uri> on <page>`), capped at 30 a minute and 8 KB a
  report. Production should log none; the dev bundler's inline script is expected to trip it in dev only.
- `Referrer-Policy: no-referrer` and `X-Content-Type-Options: nosniff` on the page and every API response.
- Logging out (or signing in as someone else) deletes the server session, the cookie, the saved queue, the cached
  library data (IndexedDB) and the offline audio and covers (service worker caches).

## API tokens

- **Terminal now-playing token.** A session of its own with the agent `terminal · now playing`. It can only reach
  `/api/remote/*` (what is playing, play/pause/skip), never the rest of your data, and it never counts as the cookie.
- **API token.** A session with the agent `api token`: it authenticates `/api/*` with `Authorization: Bearer`, so treat
  it like your password for lodesong data. It can't use the Subsonic proxy or the sessions list.
- **Expiry and rotation.** Both expire after `SESSION_IDLE_DAYS` without use, like any session. Revoke one from the
  sessions list (user menu), where each shows its agent, when it was created and when it was last seen. Rotating
  `SESSION_SECRET` revokes all of them.
- Minting needs a signed-in browser session and the CSRF header; a token can't mint another token.

## Automated checks

- CodeQL (`security-extended`) runs on every pull request, on main and weekly (`.github/workflows/codeql.yml`).
- `bun audit --audit-level=high` fails the `dependencies` workflow on a high or critical advisory, and the dependency
  review action blocks a pull request that adds one. Dependabot opens weekly update pull requests for npm, GitHub
  Actions and the Dockerfile.
- Transitive advisories we can't wait for upstream on are pinned with `overrides` in the root `package.json`.

## Threat model

| threat | covered by |
|---|---|
| XSS steals credentials | nothing to steal: httpOnly cookie, no tokens in JS-reachable storage; strict CSP limits XSS itself |
| a leaked URL (history, logs, screenshots) | URLs carry no credentials |
| stolen database or backup | session keys are hashed; Subsonic tokens are encrypted with a secret that isn't in the database |
| CSRF from another site | `SameSite=Lax` cookie + required custom header on every state-changing call |
| password guessing | per-IP and per-user exponential backoff |
| using the server to reach other hosts | upstream fixed by config, endpoint allowlist |
| clickjacking | `frame-ancestors 'none'` + `X-Frame-Options: DENY` |
| a malicious upload (path traversal, executables) | extension allowlist (audio, images, `.lrc`), no `..` or hidden path parts, never overwrites, written only under `UPLOAD_DIR` (off unless set), admins only |
| a guessed listen-together code | random code, joining needs a signed-in session on the same server and a same-origin WebSocket (no CSRF header on sockets) |
| a leaked terminal or API token | the terminal token is limited to now-playing, tokens expire when idle and can be revoked in the sessions list |
| feedback leaking data to GitHub | off unless configured; sends only the text, page path, version, username and an optional screenshot you attach; rate limited per session |
| a session on a lost device | idle expiry, revoke from the sessions list, or rotate `SESSION_SECRET` |

Navidrome itself still accepts the Subsonic token for as long as the password is unchanged; change
your Navidrome password to invalidate every token at once.

Found something? Open a private security advisory on GitHub rather than an issue.
