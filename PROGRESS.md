# Iron Veil v1.8 — published October 22, 2026

Continues the original game; all existing systems and saves are preserved.

- [x] Equal human combat during AI preparation; mutual visibility and damage verified.
- [x] Elapsed-time catch-up, compact checkpoints, current fog, projectile persistence, packet ordering and adaptive interpolation.
- [x] Configurable server, GitHub Pages workflow, Node/SQLite server and Codespaces configuration.
- [x] Public source imported; Pages deployed; game server started with its game port shared.
- [x] 104 simulation/API tests locally and on GitHub; 14 solo browser checks; seven room-lifecycle checks; three delayed-network checks; three separate-server checks.
- [x] Live Pages solo smoke and two-player Pages-to-Codespaces battle: mutual sight/damage, no browser errors, 31.088 game seconds / 30.23 wall seconds.

Play: https://ethanwiggains14-sketch.github.io/iron-veil/
Friend server: https://congenial-space-funicular-wvxjqj6v9qgxfg947-4173.app.github.dev/
Owner resume: https://github.com/codespaces/congenial-space-funicular-wvxjqj6v9qgxfg947

Known limits: Pages is static; friend matches require the running server. Codespaces may stop when idle and is subject to account usage allowances. Network latency still affects command arrival. No billing changes were made. GitHub may display a one-time development-port notice when opening the direct server link. The original private publication remains independent.

Next optional work: prolonged real-device matches to tune balance and measure frame times on both players' hardware. See GITHUB.md for restart/hosting instructions. Preserve authoritative ownership, fog privacy and legacy saves when changing networking.
