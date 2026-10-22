# Iron Veil v1.9 — long-match reliability

Continues the original project, preserving all existing game systems, saves, ownership and fog.

- [x] Audited long-match simulation, persistence, transport and actual Codespaces hosting. Observed host stopping due to inactivity.
- [x] Retired-casualty pruning, serialized room requests, gzip snapshots and bounded simulation catch-up.
- [x] Persistent pending orders, exactly-once acknowledgement, transient proxy handling, reconnect backoff and bounded batches.
- [x] Paused matches poll slowly; room status shows retained orders and catch-up.
- [x] Real connected match diagnostics register activity with Codespaces; idle lobbies and disconnected matches do not generate activity. No billing or account timeout changes.
- [x] 111 simulation/API tests, seven browser lifecycle checks and three delayed-network battle checks passed locally.
- [x] Developed 380-entity four-faction match with 2,000 retired casualties: lost acknowledgement, proxy 404, reload, queued purchase and actual server restart recovered without duplicate purchase. Initial one-minute run: 60.984 game seconds / 60.756 wall seconds, no browser errors.
- [x] Extended five-minute developed-match run: 300.966 game seconds / 300.768 wall seconds, p95 local round-trip 187 ms (includes 120 ms injected latency), no browser errors. Active-match diagnostics verified.
- [x] Published Node v1.9 on the existing Codespace and preserved its database. Six concurrent live requests pass with unique persisted revisions, gzip and exact Pages CORS.
- [x] Direct public v1.9 client: two unsigned-in browsers see and damage one another (31.817 game seconds / 30.446 wall seconds, no errors). A paid upgrade with a deliberately lost reply survives proxy 404 and reload, then reconnects and applies exactly once.
- [ ] Pages release workflow 39825321483 is queued during GitHub Actions degraded performance. After completion, verify v1.9 at the Pages URL and run the two-browser battle/reload acceptance.

Play: https://ethanwiggains14-sketch.github.io/iron-veil/
Friend server: https://congenial-space-funicular-wvxjqj6v9qgxfg947-4173.app.github.dev/
Owner resume: https://github.com/codespaces/congenial-space-funicular-wvxjqj6v9qgxfg947

Known limits: no game can guarantee Internet or hosting uptime. Codespaces has a 12-hour maximum running lifetime and account usage limits. Restarting a Codespace resets its game port to Private; restore Ports → 4173 → Port Visibility → Public after restart. This was observed and restored during release verification. Rooms expire after 30 inactive minutes or six hours total. Keep the same browser storage to reconnect. Public hosting and the original private publication use independent rooms. Tests use independent browser contexts, not both players' physical networks.

Next: check https://github.com/ethanwiggains14-sketch/iron-veil/actions/runs/39825321483 and complete Pages browser acceptance once GitHub finishes deployment. The original private publication is updated and its live battle test passes. Optional future work is persistent dedicated hosting if Codespaces limits are unsuitable; no new service or paid usage has been enabled. Preserve existing files and server-authoritative state.
