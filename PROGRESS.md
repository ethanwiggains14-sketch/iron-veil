# Iron Veil v1.8

Continues the original game. Multiplayer equality, elapsed-time catch-up, compact checkpoints, current fog, packet ordering and adaptive interpolation are implemented.

Validation: 104 simulation/API tests, 14 solo browser checks, seven room-lifecycle checks, three delayed-network battle checks and three static Pages / separate-server checks pass locally.

GitHub Pages serves the browser assets. Friend matches require the Codespaces or Node server documented in GITHUB.md. Existing saves and all game systems are preserved.

Remaining optional work: prolonged matches on both players’ networks; network latency still affects command arrival.
