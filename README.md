# IRON VEIL — Below the Front

A military real-time strategy game. Build and defend your headquarters, develop a combined-arms force, scout the map, and be the last commander standing. Play solo against 1–3 AI commanders, or host an online match for yourself and a friend with 0–2 additional AI rivals.

## Play now

- [Play on GitHub Pages](https://ethanwiggains14-sketch.github.io/iron-veil/) for solo games. For multiplayer, open **Multiplayer server / GitHub play**, paste the server address below and choose **Use this server** on both players' browsers.
- [Open the friend-match server](https://congenial-space-funicular-wvxjqj6v9qgxfg947-4173.app.github.dev/) to host or join directly. Share that link and the room code with your friend; no private Site viewer invitation is needed. GitHub may show a one-time development-port notice.
- The owner must keep [the game Codespace](https://github.com/codespaces/congenial-space-funicular-wvxjqj6v9qgxfg947) running during matches. Resume it there if the server link is unavailable. Codespaces has account usage limits and can stop when idle; it is not permanent hosting. No billing changes were made.

Server address: `https://congenial-space-funicular-wvxjqj6v9qgxfg947-4173.app.github.dev/`. Full hosting instructions: [GITHUB.md](GITHUB.md).

## Long-match connection recovery — v1.9

Large battles now discard retired casualties from room checkpoints, serialize simultaneous room requests on the Node server, compress network snapshots and spread expensive simulation catch-up across requests. The room panel reports remaining catch-up and pending orders. Existing rooms, fog, ownership, saves and all gameplay systems are preserved.

Unacknowledged orders survive temporary outages and page reloads. Commands retry with their original sequence numbers, so a lost reply cannot buy an upgrade twice. Reconnection distinguishes an unavailable hosting proxy from an expired room; it backs off during failures and wakes when the network or tab returns. A paused room no longer floods the server while retaining queued orders. Keep using the same browser and do not clear its site storage.

The GitHub server reports actual connected match activity once per minute. This lets Codespaces recognize real gameplay instead of silently stopping its otherwise quiet forwarded port. Idle lobbies and disconnected matches do not generate activity. Codespaces still has account usage and session-lifetime limits; it is not permanent hosting. If it stops, reopen the owner's Codespace and allow both browsers to reconnect. See [GITHUB.md](GITHUB.md).

## Multiplayer reliability and GitHub — v1.8

Both human players now fight equally during the ten-minute AI preparation period. Current sight is refreshed before room snapshots, and transient combat effects survive the next player's poll. New tests bring two actual browser-controlled armies through fog and verify mutual visibility and damage with delayed network replies.

The room server advances all elapsed time during ordinary network delays, instead of discarding everything above 0.6 seconds. Compact seeded-map checkpoints avoid repeatedly encoding unchanged terrain, while preserving resource depletion, partial clearing and existing live rooms. Orders send promptly, snapshots cannot roll backward when responses arrive out of order, and movement interpolation adapts to the measured update interval. Selection uses the displayed troop position. Network round-trip time is shown in the room panel; Internet latency still affects command arrival.

GitHub Pages and Codespaces configuration are included. Pages hosts the game assets; friend matches use a running Codespaces or dedicated Node server, selectable in the menu under **Multiplayer server / GitHub play**. See [GITHUB.md](GITHUB.md) for setup and sharing. The original private game link and existing friend access remain unchanged.

## Architecture and formation update — v1.7

The building overhaul is the focus of this update. Every tier uses a complete, coherent model: pitched roofs fit barracks and quarters, workshops have loading bays and supported cranes, and industrial plants use grounded tanks, chimneys and equipment. Upgrades strengthen or expand the structure while keeping its roof, walls and equipment connected. All 23 structures and 69 tiers were reviewed. Building footprints and gameplay costs are unchanged.

- **Upgrade whole walls:** drag over wall and gate segments, then choose **Upgrade wall group** or press **U**. The panel shows the complete price for one tier on every eligible segment. If nearby troops are inside the rectangle, start dragging on a wall to select just the fortifications. Maximum-tier and unfinished segments are skipped. Insufficient funds cancel the entire purchase; nothing is partially upgraded. Groups support up to 128 selections. Other multi-selections use the same single-payment upgrade system.
- **Automatic formations:** select a group and issue **Move**, **Attack-move**, or an attack on a visible enemy. Durable, healthy troops and armor lead; vulnerable long-range weapons and support occupy rear rows. Faster followers pace themselves to the group, while ranged units fire from behind the frontline. Facing follows the destination. Air, naval, surface and underground forces form separately. Terrain, combat and casualties may loosen the ranks; individual orders or Stop override the formation, and followers are released if their leader dies, stops or cannot find a route. Reissue a group order to form up again. Roaming and resource/work orders retain their existing behavior.
- **Skyguard anti-air tank:** find it under **Machines → Ground armor**, or search **Skyguard**. Requires a vehicle factory, weapons armory and recon station; needs assembly workers and **two crew**. Price: 320 credits, 110 alloy, 55 fuel and 10 crystal before imports. Its radar-guided twin guns prioritize aircraft at 9 tiles, including switching away from infantry when aircraft appear. It has 480 HP and 20% base armor; 18 base damage, 0.45-second reload and 1.8× aircraft damage. Ground armor takes 55% damage before armor and structures 35%, so it complements the Vanguard rather than replacing it. Normal tier upgrades apply, and AI recruits it after spotting hostile aircraft.
- **Animation:** gates ease open, construction uses staged frames and scaffolding, working cranes move their trolleys, mine wheels turn, ships leave expanding wakes and tracked vehicles shed dust with moving track links. Infantry walk cycles follow actual motion. The Skyguard uses short alternating tracers and aerial impact puffs. Static architecture remains cached, with lightweight animation drawn separately.

Existing solo saves and friend matches are preserved. Refresh the hosted page for the new art and controls. The preceding terrain sizes, preparation window, economy, staffing and HQ weapons remain in place. This remains a procedural Canvas isometric game, with the existing graphics settings available for slower devices.

## Command and military update — v1.6

- **Headquarters air defense:** the roof gun automatically prioritizes visible aircraft within 10 tiles. It deals 36 base damage (64.8 against aircraft), reloading every 1.5 seconds before bonuses. HQ tier upgrades improve damage, range and reload as well as durability; the comparison panel shows exact changes. The gun defeats an isolated bomber but can be overwhelmed by a substantial force. Dedicated defenses still matter.
- **Roam freely:** drag-select troops or crewed machines, then choose **Roam freely**. They choose destinations, engage visible threats and continue exploring afterward. **Stop**, movement or other manual orders override roaming. Ships remain on water and aircraft retain fuel/runway requirements.
- **Automatic staffing:** select a completed barracks and turn **Auto staffing: ON**. It queues engineers for unfinished structures and machine assembly, then recruits and sends crew to empty machinery. Personnel physically travel to the job. Shipyards, factories and runways use the same system. Normal training costs, technology and housing limits apply; the status reports blocked recruitment. It reserves queued/in-transit recruits across all enabled barracks and leaves your manually assigned troops alone. Turning it off stops new recruitment; already paid recruits finish their assignments.
- **Tank roof gunner:** select a tank and choose **Add roof gunner** to send a nearby idle combat soldier, or right-click a friendly tank with a selected combat soldier. The additional rider fires a rapid anti-infantry weapon independently of the tank’s slower cannon, which favors armor and structures. The tank still requires two internal crew. **Unload roof gunner** dismounts the soldier; riders are exposed to enemy fire and can be injured when the tank is destroyed.
- **Stronger AI:** reconnaissance informs counter-unit recruitment; larger forces assemble before attacking, damaged units retreat, and aircraft seek ground support before assaulting an HQ. Rivals expand housing, production and defenses, support their forces with medics/mechanics and buy upgrades. They retain fog restrictions, normal production queues and the ten-minute preparation period.
- **Military art and menu access:** barracks have pitched roofs; factories show assembly equipment; shipyards have slipways and cranes; power, research and weapons structures have equipment tied to their jobs. HQ guns turn and recoil, tanks show their roof soldier, and infantry wear fatigues, armor, helmets and packs. The entire pregame menu scrolls with the mouse wheel, including at compact desktop and phone sizes.

These controls work in solo and online matches. Existing saves remain compatible. The art continues the procedural isometric Canvas style and retains the performance/cache settings. Start a new operation for a full ten-minute preparation period and the revised AI opening.

## Friend matches and battlefield update — v1.5

Open the hosted game, choose **Play with a friend → Host friend match**, and send your friend the displayed ten-character code. They open the same game link, enter the code and choose **Join**. The host chooses **Start friend match** once both players are present. Both people need access to the private Site; the room code selects a match, not Site access.

Online games run on the server with separate player ownership and fog. The host selects the biome and 0–2 AI rivals; online difficulty is Regular and preparation lasts ten minutes. Both human players start with equal resources. Refreshing reconnects the same browser to its seat. Menus do not pause online games; if an active human disconnects for more than 12 seconds, the shared simulation pauses until reconnection. Leave room / surrender eliminates your faction. Only the final surviving headquarters wins, even if the first faction eliminated is the host. A defeated player may inspect the battlefield while remaining factions fight.

Online rooms expire after 30 minutes without activity and have a six-hour maximum lifespan. Keep the browser's local storage to reconnect. Online progress is stored by the server; the solo save/load and speed controls are disabled during online matches. The downloadable HTML remains fully playable solo but cannot host network rooms. Online simulation speed depends on network/server response time; this version supports two humans, with up to two AI opponents.

New maps are **144 × 108 (15,552 tiles)**: 44% fewer tiles than the prior expansive maps while retaining long strategic routes and large oceans. Temperate maps have western seas, wooded river valleys and crossings; desert maps have a central lake, rocky mesas and a southern land route; tundra maps have branching fjords, snowy peninsulas and causeways. Seeds vary coastlines, ridges, forests and islands. Existing 192×144, 96×72 and 56×44 saves retain their original maps.

To remove a structure, select an owned building and choose **Demolish · no refund**, then confirm the inline action. Headquarters cannot be demolished. Demolition cancels its queue, releases perched soldiers safely and frees its occupied terrain. It pays no refund. This also works for unfinished buildings.

The earlier update sections below document retained mechanics; this section supersedes their old map-size and single-player-only descriptions.

The AI expands its economy, recruits specialists, assigns construction and assembly labor, crews vehicles, attacks by land/air/water, and uses counterintelligence and underground drills. It buys upgrades and reconnaissance as the match develops. Every difficulty provides ten minutes of preparation; harder AI mobilizes more frequently afterward.

## Graphics and performance update

- Terrain now uses visible, resolution-aware cached sections instead of enlarging one low-resolution map image. Tree sprites and static structures match camera zoom and display density; labels and health bars keep a readable screen size.
- Brighter neutral building materials, consistent contact/cast shadows, blended terrain colors, quieter geological texture and seamless fog improve clarity without changing reconnaissance rules or gameplay.
- Open the operation menu and choose **Graphics**: **Balanced** (default), **Detailed** (extra terrain resolution), or **Performance** (lighter graphics and a 30 FPS cap). Changes apply immediately to the current operation and persist between visits. Existing saves work without starting over.
- Gate occupancy is indexed for pathfinding. Large squad route requests are spread across simulation steps. The minimap uses a compact pixel buffer; fog, wall connections and static building art are reused. Cosmetic effects and terrain/sprite memory have explicit limits; hidden tabs skip rendering and autosaves are scheduled in idle time when supported.
- Terrain cache budgets are 32 / 96 / 128 MiB in Performance / Balanced / Detailed, plus the small overview fallback, sprites and viewport buffers. Very large high-DPI viewports may reduce terrain sampling slightly to fit their visible working set. New areas briefly show the overview while sharper sections are prepared. Normal operation targets display density up to DPR 3; Performance caps it at 1.5.

This remains a procedural Canvas 2D game, with antialiased vector models and smoothly filtered sprites. It does not use a 3D engine, TAA, shadow maps or SSAO; the corresponding improvements use cached artwork, geometric cast shadows and local contact shading.

## Frontier update

- Select **Fortified wall**, then drag across the battlefield. Release to buy the full connected line. The preview shows all segments and the complete price including imports; a blocked or unaffordable stroke buys nothing. Up to 128 tiles per stroke. Workers build the line in sequence; completed adjacent walls form straight, corner, T and cross junctions.
- Select a completed wall and **Add troop perch · 120 credits**. **Station nearby troop** sends the nearest idle combat soldier; alternatively select a soldier and right-click the empty perch. One occupant gains +2 range, +3 vision and 25 percentage points of armor. **Unload perch** releases them. Wall destruction ejects and injures the occupant. Garrison and work queues survive saves.
- **Heavy vehicle gate** has a three-tile footprint and opens for all friendly ground troops and machinery, blocking hostile ground forces. Press **R while placing** to rotate the model. Connect walls to its ends. Upgrades reinforce gates and walls.
- **Forward vision beacon** costs 75 credits / 10 alloy, is built by workers on scouted land anywhere, and keeps a 12-tile surface vision radius without troops. Tiers II / III extend it to 13 / 14. Destruction removes current vision. Underground detection still requires seismic equipment.
- **Terrain pioneer**: recruit, select, choose **Clear area**, then drag up to 20 × 20 explored tiles. Workers physically travel and clear trees, loose rocks and brush. Forest / rock / marsh movement penalties are removed; terrain elevation, ore deposits, water and buildings remain. Upgrades accelerate clearance. Several pioneers share work.
- Search across **all structures, troops and machines** from any tab. Role filters and category headings organize economy, defense, support, recon, armor, aircraft, navy and underground equipment. Cards show concise roles, outputs, prices and unlocks.
- Every new map is **192 × 144 (27,648 tiles)**, four times the previous area. Every difficulty gives **10 minutes** before hostile offensives. Starting a new operation applies these changes; existing saved maps and preparation durations remain intact.
- Building models include additional windows, utilities, stairs, materials and tier detail. Walls join continuously; perches show their soldier and heavy gate doors retract for friendly traffic.

## Fortifications and free-for-all update

- Choose **Rival commanders: 1 / 2 / 3** in the operation menu for two, three or four factions. Each rival has its own workers, economy, crews, upgrades, reconnaissance memory and raid schedule. Scouts and satellites observe headquarters and nearby strength; distance, defense, damage and aging intelligence influence target choice. AI factions can attack each other. Unobserved strength changes do not leak into target scoring.
- Capturing a base means **destroying its HQ**. The defeated faction is eliminated; the attacker receives **1,000 credits, 250 alloy, 120 fuel and 60 crystal**, once. You win after every rival HQ falls; losing yours ends your operation.
- **Fortified walls** block ground movement and direct hostile fire. **Armored gates** let friendly ground units pass. Drag connected lines; place gates between them. Artillery and aircraft can shoot over them and tunneling machines can pass beneath. Every upgrade increases HP by 30% of base HP and armor by 4 percentage points, with visible reinforcement.
- **Field mechanics** are dedicated unarmed repair specialists. They automatically repair friendly completed structures and machines within 12 tiles, or follow a right-click repair order. Base rate 32 HP/s; tier II 40, tier III 48. Repairs cost 0.045 credits/HP. Mechanics do not build, gather, heal people or crew machinery.
- **Alloy works** produces 2 alloy/s after a depot. **Crystal processor** produces 0.8 crystal/s after a lab. Refineries make 1.4 fuel/s; HQ/depot/power generate credits. These producers do not need deposits. Build cards, overhead signs, selection panels and the **Resource guide** show output and unlocks. Tiers II/III yield 1.5×/2× output.
- **Watchman seismic rover** needs one crew, a factory and radar. **HQ patrol** burrows and scouts a 10-tile radius around your HQ, expanding to 14/18 at tiers II/III. Stop/move orders cancel the patrol. The rover also has short-range local underground detection.
- **Badger tunnel interceptor** needs two crew, a factory and lab. Burrow to detect and shoot underground machines. Drills and Badgers can **Lay proximity mine** for 60 credits, 15 fuel and 8 crystal. Mines arm after 2 seconds, then wait indefinitely for an enemy underground machine within 0.95 tiles. Surface units and friendly machines do not trigger them.
- **Countermine stations** disarm detected enemy charges within 8/10/12 tiles; beacon or rover detection is required. They also reduce bomb damage to nearby structures by 50/60/70%, even if the charge was not detected. Engineers can still disarm detected charges within 3.2 tiles.
- Daylight terrain, turquoise coastlines, richer foliage, lighter geological layers, improved material shading, panel seams, roof vents, vehicle camouflage, tracks, aircraft paneling and ship railings improve the existing isometric renderer. Four faction colors identify forces. No external art downloads are needed.

Existing two-faction saves remain supported; start a new operation to change the number of rivals. Use the friend panel for online multiplayer.

## Larger battlefields and combat update

New operations use 192×144 battlefields (27,648 tiles, four times the previous map area), with broad oceans, coastlines, islands, varied woodland/ridges, larger resource reserves and three river crossings. Temperate, desert and tundra theaters retain their terrain tradeoffs. Existing 56×44 and 96×72 saves keep their original geography; start a new operation for the larger maps.

The preparation countdown gives **10 minutes on every difficulty** before enemy land, air, naval, spy and drill offensives begin. This is simulation time: pause stops the countdown and speed controls accelerate it. Enemy territory remains defended.

Idle troops and attack-moving forces pursue visible enemies within their sight. Available forces within 24 tiles of an attacked friendly structure respond to the attacker if it is visible and reachable. Guards return to their post after combat; attack-moving squads resume their route. Explicit movement, construction, gathering, repair and infiltration retain priority. Manual orders override automatic reactions. Hidden spies and subterranean units retain their detection rules.

Select a force to see its next upgrade's cost and key before/after values. **See all upgrade benefits** opens a paused comparison of every changed stat, including specialist bonuses, production, housing and income. Values identify base stats and explain external modifiers. All 23 structures have distinct tier II and III additions: fortified entrances, extra floors, cranes, towers, dishes and industrial equipment. Gunfire uses brief muzzle flashes, short moving tracers, arcing shells, rocket smoke, dusty impacts and recoil.

## Play

Open the delivered `IRON-VEIL.html` in a current desktop browser, or open `dist/index.html` from the source archive. The game runs locally without installation, external assets, an account, or a build step. Choose a battlefield and difficulty, then select **Deploy task force**. Use the in-game **?** button for the field manual.

For a local web preview of the source, use Node 24+ and run `node server.cjs`, then open `http://127.0.0.1:4173`. This includes a SQLite-backed room server for local testing. Run `node export.cjs <output-file.html>` to regenerate the portable solo game from the same source. `npm run build` (or `npm run build:pages`) prepares the static GitHub Pages files. `npm start` runs the authoritative Node/SQLite multiplayer service. No client secrets or paid third-party multiplayer broker are required.

Mouse and keyboard are recommended. Headphones are optional; gameplay information is visual.

## Command controls

| Input | Action |
| --- | --- |
| Left click | Select a unit, machine, or building |
| Left drag | Select a squad; draw walls or clear an area when that mode is active |
| Right click | Give a contextual move, attack, gather, build, or repair order |
| Mouse wheel | Zoom the battlefield; scroll menus and panels |
| R | Rotate a heavy gate during placement; otherwise toggle ranges |
| Arrow keys / middle-button drag | Pan the battlefield |
| H | Center on headquarters |
| A | Arm an attack-move order |
| M | Arm a move order |
| S | Stop selected units |
| U | Upgrade the selection |
| Q | Aim a recon sweep; click the battlefield or minimap |
| 1 / 2 | Surface / subsurface view |
| Ctrl + 3–9 | Store the selected squad as a control group |
| 3–9 | Recall a control group |
| Space | Pause or resume |
| Ctrl + S | Save the operation |
| F1 | Open the field manual |

The command panel also provides buttons for orders and specialist abilities. The tactical map recenters the main view when clicked.

## Your first operation

1. Keep combat engineers near construction. Ordinary soldiers can build too; engineers are faster and several workers combine their effort.
2. Recruit more rifle infantry and a medic from the **Personnel** tab. Watch the personnel count: both recruits in a queue and vehicle crews require housing.
3. Expand your economy with logistics, quarters, a refinery, and a power plant. Right-click a resource deposit with workers to gather it.
4. Build a vehicle factory, then fabricate a tank or APC. Machinery needs people for assembly. Keep idle people nearby or select the factory and use **Assign assembly crew**. Select the completed machine and board the required crew before using it.
5. Scout the route to the enemy. Advance through cover, protect your support personnel, and use artillery or armor against defended positions.
6. Build a weapons armory for specialist troops, a recon station for espionage and detection, and a laboratory for advanced machinery.
7. Defend your headquarters throughout the attack. Losing it ends the operation, even if the rest of the army survives.

## Economy and personnel

**Credits** pay wages, construction, manufacturing, and upgrades. **Alloy**, **fuel**, and **crystal** supply the material costs. If you lack a material, the purchase automatically imports the missing amount for additional credits: 4 per alloy, 6 per fuel, and 12 per crystal. A quote does not spend anything; a successful order does.

Headquarters and logistics provide a starting income. Refineries produce fuel, deposits support manual gathering, and extraction mines automate production. Advanced machinery and research open the underground economy. Spend credits on additional production and housing before committing everything to a frontal attack.

Headquarters, barracks, and field quarters provide housing. Boarding a machine does not free a person's bed. A queued recruit reserves housing immediately. Upgrades improve your forces and infrastructure through three levels.

The 15 personnel types are terrain pioneer, field mechanic, combat engineer, rifle infantry, field medic, pathfinder, marksman, heavy gunner, anti-armor team, field general, undercover operative, private investigator, demolitions sapper, vehicle specialist, and amphibious marine. Their cards describe their abilities and unlock requirements.

## Combined arms and terrain

The 12 machines are the Watchman seismic rover, Badger tunnel interceptor, Vanguard tank, Skyguard anti-air tank, Guardian APC, siege artillery, Atlas harvester, Kestrel interceptor, Wraith bomber, river patrol boat, Aegis frigate, and Mole siege drill. Every machine needs its full crew. Vehicle specialists improve crew performance, but other personnel can operate machinery too.

An airfield includes the takeoff and landing strip needed for aircraft; keep it operational. Aircraft must land at a friendly operational runway to board or unload crew. They return automatically when fuel runs low; **Return to runway** orders an early return. A shipyard must be placed on a shoreline. Ships use waterways and can fire onto adjacent land. Amphibious marines can cross water independently. Aircraft traverse ground obstacles.

Forests provide infantry cover but slow movement. Marshes hinder heavy forces, open plains favor mobility, and rocky elevations improve firing positions. River crossings concentrate an army into exposed choke points. Temperate, desert, and tundra battlefields offer different terrain mixes. Fog of war makes reconnaissance useful even when you know the general direction of the enemy base.

## Espionage and the underground front

The **recon station** unlocks operatives, private investigators, and seismic beacons. Operatives infiltrate enemy buildings and blend in with the opposing forces. Investigators perform probabilistic checks; a missed check is not proof that an area is clear. Their base chance is 46% per sweep.

The **satellite uplink** provides broad surface reconnaissance. Choose a sweep or press **Q**, then click the battlefield or minimap. Scouts can target within 15 tiles; uplinks can target anywhere for 55 credits. Surface scans do not reveal subterranean threats. A **seismic beacon** is the dedicated detector for hostile underground drills and planted charges; its coverage is 10/13/16 tiles across its three tiers. Overlapping coverage protects a larger base.

An exposed operative must return within four tiles of a friendly recon station before taking on a new disguise. Detected underground charges can be disarmed before detonation by bringing an engineer within 3.2 tiles of the charge location on the surface. A beacon or crewed seismic machine must detect the charge first.

The **laboratory** and **vehicle factory** unlock the Mole siege drill. Board two people, select the drill, and use its burrow ability to enter the underground layer. Give movement or gathering orders there, then plant a timed charge near the enemy infrastructure. Surface and underground share the same map coordinates. Use the layer buttons to inspect both fronts.

## Structures

The 23 structures are forward vision beacon, heavy vehicle gate, fortified wall, armored gate, alloy works, crystal processor, countermine station, command headquarters, barracks, field quarters, logistics depot, fuel refinery, deep extraction mine, power plant, vehicle factory, weapons armory, recon station, airfield and runway, naval shipyard, subsurface laboratory, satellite uplink, seismic beacon, and Sentinel gun tower. The construction catalog displays requirements and affordability before placement. Expand from completed friendly structures; some sites also require suitable terrain or a nearby deposit.

## Saves and technical notes

The **Save** button and **Ctrl + S** store the current operation in the browser's local storage. **Resume saved operation** restores it from the operation menu. Saves belong to that browser and the address used to open the game; clearing site data removes them. This version does not synchronize saves between devices.

The source consists of plain HTML, CSS, and JavaScript in `dist/`. `data.js` defines the roster, `engine.js` runs the simulation, `renderer.js` draws the isometric battlefield, and `app.js` provides the command interface. There are no runtime package dependencies.

For the automated simulation checks, install Node.js and run:

```text
node --test tests/*.test.cjs
```

The optional browser smoke test uses Playwright and a locally available Chromium or Microsoft Edge browser. It accepts the served game URL:

```text
node tests/browser-smoke.cjs http://127.0.0.1:4173
node tests/browser-gameplay.cjs http://127.0.0.1:4173
node tests/renderer-regression.cjs
node tests/browser-update.cjs http://127.0.0.1:4173
node tests/browser-expansion.cjs http://127.0.0.1:4173
node tests/visual-upgrades.cjs
node tests/browser-architecture.cjs http://127.0.0.1:4173
node tests/browser-online.cjs http://127.0.0.1:4173
```

The browser test writes temporary screenshots to `qa-screenshots/` for visual inspection.

`PROGRESS.md` records the original requirements audit, development checklist, test results, known limitations, and an exact continuation checkpoint.
