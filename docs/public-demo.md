# Public demo

One permanent instance anyone can open, sign in with `demo` / `demo`, press play and see Stats and mixes with
real-looking data. Nothing a visitor does survives the nightly reset.

**Status: live at https://demo.lodesong.findmalek.engineer** (`PUBLIC_DEMO_HOST`), hosted on the owner's Dokploy
server; DNS is a CNAME to `home.findmalek.engineer`. The site's "try the live demo" buttons point here by default (`DEMO_URL` on Vercel overrides it).

## How it works

- **Library:** the same [generated demo library](demo-library.md) the PR [previews](previews.md) use, baked into the
  `lodesong-demo` Navidrome image. No real music.
- **Player:** `ghcr.io/findmalek/lodesong:latest` with `PUBLIC_DEMO=on` and `DEMO_SEED=on` (six months of generated
  listening for the `demo` account). It has no uploads, no feedback, no AI key, no lyrics lookups, no update check.
- **`PUBLIC_DEMO=on`** also makes nobody an admin (no doctor, no index rebuilds, no lyrics writes), refuses to make API
  and terminal tokens, and refuses `deletePlaylist`. Everyone is the same `demo` account, so a visitor can star
  songs, make a playlist and change settings, but cannot remove what the demo ships with.
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
6. Consider putting a rate limit or Cloudflare in front: the host is public and the login is `demo` / `demo`.

## Trying it locally

```bash
PUBLIC_DEMO=on DEMO_SEED=on INDEX_USER=demo INDEX_PASSWORD=demo NAVIDROME_URL=http://127.0.0.1:4533 bun run start
```

with `compose.demo.yaml` running ([demo library](demo-library.md)).
