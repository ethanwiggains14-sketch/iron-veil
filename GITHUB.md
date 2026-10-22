# Play Iron Veil through GitHub

The same game supports GitHub Pages for the browser and a Node 24 server for friend matches. No paid libraries or API keys are required. GitHub Pages is static hosting: it cannot run the room simulation or SQLite database itself.

## Published links

- [GitHub Pages game](https://ethanwiggains14-sketch.github.io/iron-veil/)
- [Friend-match server](https://congenial-space-funicular-wvxjqj6v9qgxfg947-4173.app.github.dev/)
- [Resume the owner’s Codespace](https://github.com/codespaces/congenial-space-funicular-wvxjqj6v9qgxfg947)

Pages deployment and all 104 tests passed on GitHub on October 22, 2026. Two independent, unsigned-in browsers played through the Pages URL using this server: both armies saw and damaged one another during preparation, with no browser errors (31.088 game seconds / 30.23 wall seconds). The server port is Public and runs only the game service. Keep the Codespace running for matches; no billing settings were changed.

## GitHub Pages

1. Put this project in `ethanwiggains14-sketch/iron-veil` on branch `main`.
2. In the repository, open **Settings → Pages → Source → GitHub Actions**.
3. Run **Actions → Publish game to GitHub Pages**, or push a change to `main`.
4. The workflow runs the simulation/API tests and publishes only the eight browser assets. Open the resulting Pages link to play solo immediately.

Published project URL: `https://ethanwiggains14-sketch.github.io/iron-veil/`.

## Friend matches using GitHub Codespaces

1. In the repository, choose **Code → Codespaces → Create codespace on main**. The included development container uses Node 24, starts `npm start`, and forwards port **4173**. If the server is stopped, run `npm start` in its terminal.
2. Open **Ports**. For port 4173, choose **Port Visibility → Public** so your friend can reach the game. This exposes the game service; room ownership still requires its random room code and private player token.
3. Copy port 4173's **Forwarded Address**. The simplest option is for both players to open that address and use **Host friend match / Join** as usual.
4. To play in the GitHub Pages page instead, both players open **Multiplayer server / GitHub play** in the game menu, paste that same forwarded address and choose **Use this server**. Host a room and share its code. The Codespaces configuration permits only your Pages origin, plus its own forwarded game address.
5. Keep the Codespace running during the match. Stopping it disconnects players. Rooms persist in `.local/rooms.sqlite` within that Codespace; the normal room expiry still applies. Reconnecting uses the browser's stored player token.

Codespaces availability and included usage depend on the GitHub account. This project does not enable paid usage or change billing. A Codespace is an on-demand development host, not an always-on hosting guarantee.

## Dedicated server or LAN

Use Node **24 or later**. There are no npm dependencies to install.

```sh
HOST=0.0.0.0 PORT=4173 ALLOWED_ORIGINS=https://ethanwiggains14-sketch.github.io npm start
```

PowerShell:

```powershell
$env:HOST='0.0.0.0'
$env:PORT='4173'
$env:ALLOWED_ORIGINS='https://ethanwiggains14-sketch.github.io'
npm start
```

Use an HTTPS reverse proxy for public Internet hosting. The browser accepts an HTTPS multiplayer URL, or HTTP localhost for local testing. Both players must use the same server; room codes do not transfer between independent hosts. `ALLOWED_ORIGINS` accepts comma-separated exact website origins, never a wildcard. It does not expose room data without the room's player token.

The original private Sites publication stays independent and keeps its existing audience. Do not paste the private Site URL as a GitHub Pages backend: its sign-in boundary intentionally prevents that cross-origin setup. No Site credentials, personal room databases or `.openai` hosting identity belong in the public repository.

## Development checks

```sh
npm test
npm run build:pages
npm start
```

`tests/browser-network.cjs` is the local SQLite battle regression: two clients approach through fog, exchange damage during preparation and preserve real-time simulation with 600 ms delayed replies. `tests/browser-online.cjs` checks room lifecycle, ownership, orders and reconnects. Browser tests need Playwright and a compatible browser; simulation/API tests use only Node.

Official reference: [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages), [Codespaces port sharing](https://docs.github.com/en/codespaces/developing-in-a-codespace/forwarding-ports-in-your-codespace).
