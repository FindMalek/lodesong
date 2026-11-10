# Public demo

One permanent instance anyone can open, press play and see Stats and mixes with real-looking data. There is no login:
the player signs every visitor in as the `demo` account. Nothing a visitor does survives the nightly reset.

**Status: live at https://demo.lodesong.findmalek.engineer** (`PUBLIC_DEMO_HOST`), hosted on the owner's Dokploy
server; DNS is a CNAME to `home.findmalek.engineer`. The site's "try the live demo" buttons point here by default (`DEMO_URL` on Vercel overrides it).

## How it works

- **Library:** the same [generated demo library](demo-library.md) the PR [previews](previews.md) use, baked into the
  `lodesong-demo` Navidrome image. No real music.
- **Player:** `ghcr.io/findmalek/lodesong:latest` with `PUBLIC_DEMO=on` and `DEMO_SEED=on` (six months of generated
  listening for the `demo` account). It has no uploads, no feedback, no AI key, no lyrics lookups, no update check.
- **No login:** with `PUBLIC_DEMO=on` and `DEMO_USER` / `DEMO_PASSWORD` set, `/api/health` says `demo: true` and the
  sign-in screen calls `POST /auth/demo`, which opens an ordinary session for that account (same cookie, same CSRF
  header) and returns no password. The route answers 404 when `PUBLIC_DEMO` is off or no demo account is set. It is
  rate limited per address (the one the proxy appended to `X-Forwarded-For`) and in total, keeps at most 500 demo
  sessions (the longest unused go first), and `/auth/login` is closed, so wrong passwords can't lock visitors out. If
  the Navidrome is down the visitor sees the usual error with a "try again" button. A thin strip says "public demo,
  resets every night"; there is no log out button. This starts once a release with it is deployed (the nightly run
  uses `:latest`); until then the form and `demo` / `demo` still work.
- **Warning:** `DEMO_USER` is signed in for anyone who opens the site. Give it a throwaway account, never an admin or
  your own. It is separate from `INDEX_USER` on purpose: setting `PUBLIC_DEMO=on` on a real server doesn't hand its
  index account to the public.
- **`PUBLIC_DEMO=on`** also makes nobody an admin (no doctor, no index rebuilds, no lyrics writes), refuses to make API
  and terminal tokens, and refuses `deletePlaylist`. There is no shared playback session, play queue sync or "playing
  elsewhere", and a visitor sees and ends only their own session. Everyone is the same `demo` account, so a visitor can
  star songs, make a playlist, change or empty a playlist and change settings; the nightly reset puts it all back.
- **Reset:** the **Public demo** workflow (`.github/workflows/public-demo.yml`) runs every night at 03:15 UTC. It
  redeploys the Navidrome from its image (library and account back to the baked state) and the player with no volume
  (sessions, settings, history and search index start empty, then the history is seeded again).
- **Network:** the Navidrome stays tailnet-only; only the player host is public. The player is the only thing that talks
  to it, over Dokploy's internal network.

## What is left

These need the owner's server, DNS or repo settings, so they are not done in code:

1. Run the **Demo** workflow once so `ghcr.io/findmalek/lodesong-demo` and the `lodesong-demo` app exist
   (see [previews](previews.md#setup-once)).
2. Pick the host, e.g. `demo.<site domain>`, and point its DNS at the server's public address. The preview hosts
   (`demo.<PREVIEW_DOMAIN>`) are tailnet-only and stay that way, so the public one needs its own name.
3. Set the repo variable `PUBLIC_DEMO_HOST` to that host (the existing `DEPLOY_ENABLED`, `DOKPLOY_PUBLIC_URL`,
   `PREVIEW_DOMAIN` and the `DOKPLOY_API_KEY` secret are reused). Check the Dokploy certificate resolver used in
   `ensureDomain` (`scripts/deploy/dokploy.mjs`) can issue a certificate for a public name; it is set to `vercel`.
4. Run **Public demo** from the Actions tab once, then check the next morning that a star or playlist made the day
   before is gone. If Dokploy keeps the old container filesystem on redeploy, add a volume-less "stop, start" or
   delete-and-recreate step to `publicDemoUp`.
5. The site's demo buttons already point at `https://demo.lodesong.findmalek.engineer`; set `DEMO_URL` on Vercel only to
   change that.
6. Consider putting a rate limit or Cloudflare in front: the host is public and everyone is signed in as `demo`.

## Trying it locally

```bash
PUBLIC_DEMO=on DEMO_SEED=on INDEX_USER=demo INDEX_PASSWORD=demo DEMO_USER=demo DEMO_PASSWORD=demo NAVIDROME_URL=http://127.0.0.1:4533 bun run start
```

with `compose.demo.yaml` running ([demo library](demo-library.md)).
