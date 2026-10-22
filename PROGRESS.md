# Iron Veil v1.9 — long-match reliability

Continues the original project, preserving all existing game systems, saves, ownership and fog.

- [x] Audited long-match simulation, persistence, transport and actual Codespaces hosting. Observed host stopping due to inactivity.
- [x] Retired-casualty pruning, serialized room requests, gzip snapshots and bounded simulation catch-up.
- [x] Persistent pending orders, exactly-once acknowledgement, transient proxy handling, reconnect backoff and bounded batches.
- [x] Paused matches poll slowly; room status shows retained orders and catch-up.
- [x] Real connected match diagnostics register activity with Codespaces; idle lobbies and disconnected matches do not generate activity. No billing or account timeout changes.
- [x] 111 simulation/API tests, seven browser lifecycle checks and three delayed-network battle checks passed locally.
- [x] Developed 380-entity four-faction match with 2,000 retired casualties: lost acknowledgement, proxy 404, reload, queued purchase and actual server restart recovered without duplicate purchase. Initial one-minute run: 60.984 game seconds / 60.756 wall seconds, no browser errors.
- [ ] Extended five-minute run and publication acceptance.

Play: https://ethanwiggains14-sketch.github.io/iron-veil/
Friend server: https://congenial-space-funicular-wvxjqj6v9qgxfg947-4173.app.github.dev/
Owner resume: https://github.com/codespaces/congenial-space-funicular-wvxjqj6v9qgxfg947

Known limits: no game can guarantee Internet or hosting uptime. Codespaces has a 12-hour maximum running lifetime and account usage limits. Rooms expire after 30 inactive minutes or six hours total. Keep the same browser storage to reconnect. Public hosting and the original private publication use independent rooms. Tests use independent browser contexts, not both players' physical networks.

Next: verify both deployed hosts, then record acceptance results. Optional future work is persistent dedicated hosting if Codespaces limits are unsuitable; no new service or paid usage has been enabled. Preserve existing files and server-authoritative state.
