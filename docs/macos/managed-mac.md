# The Mac app on a Mac you can't install software on

For a work Mac (MDM, no admin rights) and for a server the Mac can't reach from the network it is on. Everything here
works without admin rights and without asking IT. Written so you can hand this page to a coding agent on the Mac and
let it do the steps.

## 1. Install without admin or notarization

A release download is quarantined and Gatekeeper rejects an app that isn't notarized. An app you built on the same Mac
is never quarantined, so build it and keep it in a folder you own.

```sh
git clone https://github.com/FindMalek/lodesong && cd lodesong/apps/macos
./build.sh                                   # → dist/lodesong.app, ad-hoc signed
ditto dist/lodesong.app ~/Documents/lodesong.app
xattr -cr ~/Documents/lodesong.app
open ~/Documents/lodesong.app
```

Needs Xcode's command line tools (`xcode-select -p`). On a new Xcode `build.sh` can stop at `cp: ...Release/Lodesong: No
such file` because the binary moved to `.build/out/Products/Release/Lodesong`: copy that file to
`dist/lodesong.app/Contents/MacOS/lodesong` and run the rest of the script by hand.

Pin it to the Dock: drag `~/Documents/lodesong.app` onto it, or

```sh
defaults write com.apple.dock persistent-apps -array-add '<dict><key>tile-data</key><dict><key>file-data</key><dict><key>_CFURLString</key><string>file:///Users/YOU/Documents/lodesong.app/</string><key>_CFURLStringType</key><integer>15</integer></dict></dict></dict>' && killall Dock
```

## 2. Updates

The app updates itself: it downloads `lodesong-macos.zip` from the latest release with `URLSession`, unzips it with
`ditto` (neither adds the quarantine flag), and swaps itself in place when you pick **lodesong → Restart to Update**
(or **Settings → Updates**). The folder must be one you can write to, so `~/Documents` or `~/Applications` work and no
admin is needed. A swap can only fail if your endpoint tool blocks a new unsigned binary; then rebuild (step 1).

## 3. The window stays gray: the server doesn't answer

A gray window with no player means the page didn't load. Check from a terminal:

```sh
curl -sS -m 10 -o /dev/null -w "%{http_code}\n" https://YOUR-SERVER
```

A timeout while the same address works from your phone on mobile data is **no NAT loopback** (hairpin NAT): the
router won't send a request for its own public address back into the LAN. You can't fix the router (ISP boxes often
lock it), so give the Mac a second way in that doesn't go through the public address.

### The fix: a tailnet-only twin and a local proxy

1. **Tailscale without admin rights.** Run the daemon in user space with a SOCKS5 proxy on `127.0.0.1:1055`:

   ```sh
   ~/.local/bin/tailscaled --tun=userspace-networking --socks5-server=localhost:1055 \
     --socket=$HOME/.local/state/tailscale/tailscaled.sock --statedir=$HOME/.local/state/tailscale &
   ~/.local/bin/tailscale --socket=$HOME/.local/state/tailscale/tailscaled.sock up
   ```

   (Download the static binaries from <https://pkgs.tailscale.com/stable/#static>. `up` prints a login link once.)

2. **A twin hostname on your server that only the tailnet can reach.** The proxy looks the name up on its own, so
   `server.example.com` can't be reused: it resolves to the public address the Mac can't reach. Make a second name, for
   example `server-ts.example.com`:
   - DNS: an `A` record to the server's **tailnet IP** (`tailscale ip -4` on the server).
   - Your reverse proxy: a route for that host to the same service, limited to `100.64.0.0/10` (tailnet addresses), with
     a certificate from a **DNS challenge** (a public HTTP challenge can't reach a tailnet address). A Traefik example:

     ```yaml
     http:
       routers:
         lodesong-tailnet:
           rule: Host(`server-ts.example.com`)
           entryPoints: [websecure]
           middlewares: [tailnet-only]
           service: lodesong-tailnet
           tls: { certResolver: dns }
       middlewares:
         tailnet-only:
           ipAllowList: { sourceRange: ["100.64.0.0/10", "fd7a:115c:a1e0::/48"] }
       services:
         lodesong-tailnet:
           loadBalancer:
             servers: [{ url: "http://lodesong:8080" }]
             passHostHeader: true
     ```

   Check it from the Mac before touching the app:

   ```sh
   curl -sS -m 15 -o /dev/null -w "%{http_code}\n" --socks5-hostname localhost:1055 https://server-ts.example.com   # 200
   ```

3. **Point the app at it.** **Settings (⌘,) → Server → Change Server…** to `https://server-ts.example.com`, then turn on
   **Reach it through a local SOCKS proxy** (port `1055`) and restart the app. Only that host goes through the proxy;
   everything else is untouched. You sign in once more, the new address has its own session.

   Without the UI: `defaults write engineer.findmalek.lodesong localProxy -bool YES`, `localProxyPort -int 1055`, and set
   the server through the app (it stores a URL, not a string).

### Does it work on any network?

Yes, in a cafe too: Tailscale connects out from anywhere and the name only exists on your tailnet, so there is no
switching between home and away. What can break it:

- **The daemon isn't running** (it doesn't survive a reboot or login by itself). Start it again, or run it from a login
  item. The window is gray until it is up, and the proxy is read at launch, so restart the app after starting it.
- **A network that blocks Tailscale**, rare; it falls back to relays over port 443.
- **The public address** (`server.example.com`) works in a cafe without Tailscale but not at home, which is why the
  app should use the twin.

### Checklist for an agent

1. `curl` the configured server: timeout? → hairpin, continue. A `200` → the gray window is something else, see
   [troubleshooting](../troubleshooting.md).
2. `nc -z localhost 1055` and `tailscale ... status`: daemon up? Start it if not.
3. `curl --socks5-hostname localhost:1055 https://<twin>` must be `200` and the page title `lodesong`.
4. Settings → Server → twin address, proxy on, port 1055, restart the app.
5. Confirm: `lsof -nP -iTCP:1055 | grep ESTABLISHED` shows the app's web content process connected.
