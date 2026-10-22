/* End-to-end gameplay regression checks. Run a local server, then:
 * node tests/browser-gameplay.cjs http://127.0.0.1:4173
 * Inputs use the real command UI and canvas. The debug accessor only freezes/
 * advances time, reads state, and prepares explicitly marked advanced fixtures.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
let playwright;
try { playwright = require('playwright'); }
catch { playwright = require('C:/Users/ewigg/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'); }
const URL = process.argv[2] || 'http://127.0.0.1:4173';
const SAVE = 'iron-veil-operation-v1';
const PREF = 'iron-veil-preferences-v1';
const shots = path.join(__dirname, '../qa-screenshots');
const passed = [];
let activePage;

async function stage(name, run) {
  await run(); passed.push(name); console.log('PASS ' + name);
}
async function freeze(page) {
  await page.evaluate(() => {
    const g = ironVeil.game; g.paused = true; g._ai = () => {};
    // A resumed save may run one live frame and issue a raid before this helper
    // executes. Clear those orders for controlled UI scenarios as well.
    for (const e of g.entities.filter(e => e.owner === 1 && e.kind !== 'building' && e.hp > 0)) g._assign(e, { type: 'idle' });
  });
}
async function step(page, seconds) {
  await page.evaluate(seconds => {
    const game = ironVeil.game; game.paused = false;
    for (let elapsed = 0; elapsed < seconds && game.winner === null; elapsed += .1) game.update(Math.min(.1, seconds - elapsed));
    game.paused = true;
  }, seconds);
  await page.waitForTimeout(350);
}
async function clickWorld(page, point, options = {}) {
  const screen = await page.evaluate(({ x, y }) => {
    const r = ironVeil.renderer; r.centerOn(x, y);
    return r.worldToScreen(x, y, r.layer === 'surface' ? undefined : 0);
  }, point);
  const bounds = await page.locator('#battlefield').boundingBox();
  assert.ok(bounds, 'battlefield has bounds');
  if (options.touch) await page.touchscreen.tap(bounds.x + screen.x, bounds.y + screen.y);
  else await page.mouse.click(bounds.x + screen.x, bounds.y + screen.y, options);
}
async function selectEntity(page, id) {
  const screen = await page.evaluate(id => {
    const e = ironVeil.game.getEntity(id), r = ironVeil.renderer;
    r.centerOn(e.x, e.y);
    const p = r.worldToScreen(e.x, e.y, r.layer === 'surface' ? undefined : 0);
    p.y -= (e.kind === 'building' ? 14 : 6 + r.aircraftAltitude(e)) * r.camera.zoom;
    return p;
  }, id);
  const bounds = await page.locator('#battlefield').boundingBox();
  await page.mouse.click(bounds.x + screen.x, bounds.y + screen.y);
  assert.ok(await page.evaluate(id => ironVeil.selection.includes(id), id), 'canvas selects entity ' + id);
}
async function newOperation(page) {
  if (await page.locator('#resultOverlay').isVisible()) await page.locator('#newOperation').click();
  else if (!(await page.locator('#menuOverlay').isVisible())) await page.locator('#menuButton').click();
  await page.selectOption('#difficultySelect', 'relaxed');
  await page.locator('#startButton').click();
  await page.locator('#menuOverlay').waitFor({ state: 'hidden' });
  await freeze(page);
  if (await page.locator('#hideTutorial').isVisible()) await page.locator('#hideTutorial').click();
}
async function buildViaUI(page, type, options = {}) {
  const point = await page.evaluate(type => {
    const g = ironVeil.game, hq = g.entities.find(e => e.owner === 0 && e.type === 'hq');
    const points = [];
    for (let y = 1; y < g.height - 1; y++) for (let x = 1; x < g.width - 1; x++) {
      if (g.canPlace(type, x + .5, y + .5, 0).ok) points.push({ x: x + .5, y: y + .5 });
    }
    points.sort((a, b) => Math.hypot(a.x - hq.x, a.y - hq.y) - Math.hypot(b.x - hq.x, b.y - hq.y));
    return points[0];
  }, type);
  assert.ok(point, 'valid placement found for ' + type);
  const before = await page.evaluate(() => ironVeil.game.nextId);
  await page.locator('[data-tab="build"]').click();
  await page.locator(`[data-catalog="build"][data-type="${type}"]`).click();
  await clickWorld(page, point, options);
  const id = await page.evaluate(({ type, before }) => ironVeil.game.entities.find(e => e.type === type && e.id >= before)?.id, { type, before });
  assert.ok(id, 'canvas placement starts ' + type + ': ' + await page.locator('#toastStack').innerText());
  assert.equal(await page.evaluate(id => ironVeil.game.getEntity(id).progress, id), 0, 'building starts unfinished');
  await step(page, 65);
  assert.equal(await page.evaluate(id => ironVeil.game.getEntity(id).progress, id), 1, type + ' is built by assigned people');
  return id;
}

(async () => {
  fs.mkdirSync(shots, { recursive: true });
  const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  const browser = await playwright.chromium.launch({ headless: true, ...(fs.existsSync(edge) ? { executablePath: edge } : {}) });
  const errors = [];
  const watch = page => {
    activePage = page;
    page.on('pageerror', error => errors.push(String(error)));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  };
  try {
    const context = await browser.newContext({ viewport: { width: 1536, height: 960 }, deviceScaleFactor: 1 });
    await context.addInitScript(() => { Math.random = () => .41807; });
    const page = await context.newPage(); watch(page);
    await page.goto(URL, { waitUntil: 'networkidle' });
    let factory, power, barracks, tank;
    await stage('deploy and preserve paused state through F1 manual', async () => {
      await newOperation(page);
      await page.keyboard.press('F1');
      await page.locator('#helpOverlay').waitFor({ state: 'visible' });
      await page.keyboard.press('F1');
      await page.locator('#helpOverlay').waitFor({ state: 'hidden' });
      assert.equal(await page.evaluate(() => ironVeil.game.paused), true);
      // F1 correctly restores the pause overlay; resume then freeze without a modal.
      await page.locator('#resumeButton').click(); await freeze(page);
    });
    await stage('construct factory, power plant, and barracks with automatic material imports', async () => {
      await page.evaluate(() => { ironVeil.game.teams[0].metal = 0; });
      await page.locator('[data-action="selectEngineers"]').click();
      factory = await buildViaUI(page, 'factory');
      assert.ok(await page.evaluate(() => ironVeil.game.events.some(e => /imported materials/.test(e.text))), 'missing material imports are recorded');
      power = await buildViaUI(page, 'power');
      const cap = await page.evaluate(() => ironVeil.game.population(0).cap);
      barracks = await buildViaUI(page, 'barracks');
      assert.equal(await page.evaluate(() => ironVeil.game.population(0).cap), cap + 12);
    });
    await stage('train from the selected barracks and upgrade personnel and building', async () => {
      await selectEntity(page, barracks);
      await page.locator('[data-action="recruitTab"]').click();
      const before = await page.evaluate(() => ironVeil.game.nextId);
      await page.locator('[data-catalog="recruit"][data-type="rifleman"]').click();
      assert.equal(await page.evaluate(id => ironVeil.game.getEntity(id).queue[0]?.type, barracks), 'rifleman');
      await step(page, 10);
      const soldier = await page.evaluate(before => ironVeil.game.entities.find(e => e.id >= before && e.type === 'rifleman')?.id, before);
      assert.ok(soldier, 'trained rifleman appears');
      await selectEntity(page, soldier);
      await page.locator('[data-action="upgrade"]').click();
      assert.equal(await page.evaluate(id => ironVeil.game.getEntity(id).level, soldier), 2);
      await selectEntity(page, barracks);
      const cap = await page.evaluate(() => ironVeil.game.population(0).cap);
      await page.locator('[data-action="upgrade"]').click();
      assert.equal(await page.evaluate(id => ironVeil.game.getEntity(id).level, barracks), 2);
      assert.ok(await page.evaluate(cap => ironVeil.game.population(0).cap > cap, cap), 'upgrading barracks expands housing');
    });
    await stage('machine assembly stalls without people and resumes after assigning engineers', async () => {
      // Controlled labor-shortage fixture: personnel remain alive but begin far from production.
      await page.evaluate(() => {
        const g = ironVeil.game; Object.assign(g.teams[0], { money: 6000, metal: 600, fuel: 400, crystal: 200 });
        const factory = g.entities.find(e => e.owner === 0 && e.type === 'factory'), candidates = [];
        for (let y = 2; y < g.height - 2; y++) for (let x = 2; x < g.width - 2; x++) {
          const distance = Math.hypot(x + .5 - factory.x, y + .5 - factory.y);
          if (distance > 15 && distance < 20 && g._passable(x, y, { kind: 'unit', type: 'engineer', layer: 'surface' })) candidates.push({ x: x + .5, y: y + .5 });
        }
        const hq = g._buildings(0, 'hq')[0]; candidates.sort((a, b) => Math.hypot(a.x - hq.x, a.y - hq.y) - Math.hypot(b.x - hq.x, b.y - hq.y));
        if (!candidates.length) throw Error('Labor fixture needs accessible terrain away from its factory');
        const p = candidates[0];
        for (const e of g.entities.filter(e => e.owner === 0 && e.kind === 'unit')) { e.x = p.x; e.y = p.y; g._assign(e, { type: 'idle' }); }
        g._updateFog();
      });
      await selectEntity(page, factory);
      await page.locator('[data-action="machinesTab"]').click();
      await page.locator('[data-catalog="machines"][data-type="tank"]').click();
      await step(page, 5);
      assert.equal(await page.evaluate(id => ironVeil.game.getEntity(id).queue[0]?.progress, factory), 0, 'unattended machine production is paused');
      assert.match(await page.locator('#selectionContent').innerText(), /worker|personnel|assembly/i, 'selected producer explains the shortage');
      await page.locator('[data-action="assignAssembly"]').click();
      await step(page, 65);
      tank = await page.evaluate(() => ironVeil.game.entities.find(e => e.owner === 0 && e.type === 'tank')?.id);
      assert.ok(tank, 'assigned engineers finish the tank');
    });
    await stage('uncrewed machine cannot move; Crew enables movement and Disembark stops it', async () => {
      await selectEntity(page, tank);
      const original = await page.evaluate(id => ({ x: ironVeil.game.getEntity(id).x, y: ironVeil.game.getEntity(id).y }), tank);
      const destination = { x: original.x + 5, y: original.y - 5 };
      await page.keyboard.press('m'); await clickWorld(page, destination);
      await step(page, 2);
      assert.deepEqual(await page.evaluate(id => ({ x: ironVeil.game.getEntity(id).x, y: ironVeil.game.getEntity(id).y }), tank), original);
      await page.locator('[data-action="crew"]').click();
      assert.equal(await page.evaluate(id => ironVeil.game.getEntity(id).crew.length, tank), 2);
      await page.keyboard.press('m'); await clickWorld(page, destination);
      await step(page, 14);
      assert.ok(await page.evaluate(({ id, original }) => Math.hypot(ironVeil.game.getEntity(id).x - original.x, ironVeil.game.getEntity(id).y - original.y) > 1, { id: tank, original }), 'crewed tank travels');
      await page.locator('[data-action="uncrew"]').click();
      assert.equal(await page.evaluate(id => ironVeil.game.getEntity(id).crew.length, tank), 0);
      await page.locator('[data-action="crew"]').click();
      await page.locator('[data-action="upgrade"]').click();
      assert.equal(await page.evaluate(id => ironVeil.game.getEntity(id).level, tank), 2);
    });
    await stage('save and load preserve army, crew, construction, levels, and treasury', async () => {
      await page.locator('#saveButton').click();
      const saved = await page.evaluate(key => JSON.parse(JSON.parse(localStorage.getItem(key)).game), SAVE);
      await page.evaluate(() => { ironVeil.game.teams[0].money = 1; });
      await page.locator('#menuButton').click();
      await page.locator('#loadButton').click();
      await page.locator('#menuOverlay').waitFor({ state: 'hidden' }); await freeze(page);
      const restored = await page.evaluate(() => JSON.parse(ironVeil.game.serialize()));
      // Loading resumes live play; the restored enemy AI can queue/build during
      // the browser frame before the harness freezes it again.
      assert.equal(restored.entities.filter(e => e.owner === 0).length, saved.entities.filter(e => e.owner === 0).length);
      assert.deepEqual(restored.entities.find(e => e.id === tank).crew, saved.entities.find(e => e.id === tank).crew);
      assert.equal(restored.entities.find(e => e.id === tank).level, 2);
      assert.ok(Math.abs(restored.teams[0].money - saved.teams[0].money) < 5);
      assert.ok(Math.abs(restored.time - saved.time) < 1);
      for (const id of [factory, power, barracks]) assert.equal(restored.entities.find(e => e.id === id).progress, 1);
    });
    await stage('targeted reconnaissance uses canvas and minimap destinations', async () => {
      // Existing pathfinders may legitimately become vehicle crew. Recruit a
      // fresh one through the personnel UI instead of depending on crew choice.
      await selectEntity(page, barracks);
      await page.locator('[data-action="recruitTab"]').click();
      const before = await page.evaluate(() => ironVeil.game.nextId);
      await page.locator('[data-catalog="recruit"][data-type="scout"]').click();
      await step(page, 10);
      const scout = await page.evaluate(before => ironVeil.game.entities.find(e => e.id >= before && e.owner === 0 && e.type === 'scout' && !e.boardedIn)?.id, before);
      assert.ok(scout, 'a freshly recruited pathfinder is available for reconnaissance');
      await selectEntity(page, scout);
      const point = await page.evaluate(id => { const e = ironVeil.game.getEntity(id); return { x: e.x + 8, y: e.y - 2 }; }, scout);
      await page.locator('#selectionActions [data-action="scan"]').click();
      await clickWorld(page, point);
      let scan = await page.evaluate(() => ironVeil.game.scans.at(-1));
      assert.ok(scan && Math.hypot(scan.x - point.x, scan.y - point.y) < .15, 'pathfinder scan targets the canvas destination');
      // Advanced technology fixture gives the UI a completed orbital station.
      await page.evaluate(() => { ironVeil.game._spawn('building', 'uplink', 0, 18.5, 29.5); ironVeil.game._updateFog(); ironVeil.select([]); });
      await page.locator('[data-tab="intel"]').click();
      await page.locator('#catalog [data-action="scan"]').click();
      const mini = await page.locator('#minimap').boundingBox();
      const mapTarget = await page.evaluate(() => { const g = ironVeil.game, hq = g._buildings(1, 'hq')[0]; return { x: hq.x, y: hq.y, width: g.width, height: g.height }; });
      await page.mouse.click(mini.x + mini.width * mapTarget.x / mapTarget.width, mini.y + mini.height * mapTarget.y / mapTarget.height);
      scan = await page.evaluate(() => ironVeil.game.scans.at(-1));
      assert.ok(Math.hypot(scan.x - mapTarget.x, scan.y - mapTarget.y) < .5, 'satellite sweep targets the minimap destination');
      assert.ok(await page.evaluate(p => ironVeil.game.canSee(p.x, p.y), mapTarget), 'recon reveals enemy surface headquarters');
      assert.equal(await page.evaluate(p => ironVeil.game.canSee(p.x, p.y, 'underground'), mapTarget), false, 'surface scans do not reveal subsurface');
    });
    await stage('aircraft can be selected in flight, return to runway, refuel, and disembark', async () => {
      const fighter = await page.evaluate(() => {
        const g = ironVeil.game, points = [];
        for (let y = 1; y < g.height - 1; y++) for (let x = 1; x < g.width - 1; x++) if (g.canPlace('airfield', x + .5, y + .5).ok) points.push({ x: x + .5, y: y + .5 });
        if (!points.length) throw Error('Aircraft fixture needs a valid runway footprint');
        const p = points[0], field = g._spawn('building', 'airfield', 0, p.x, p.y);
        const plane = g._spawn('machine', 'fighter', 0, field.x + 2, field.y, { landed: true, fuel: 100 });
        g._spawn('unit', 'pilot', 0, field.x + 3, field.y);
        g._updateFog(); return plane.id;
      });
      await selectEntity(page, fighter);
      await page.locator('[data-action="crew"]').click();
      const departure = await page.evaluate(id => { const e = ironVeil.game.getEntity(id); return { x: e.x, y: e.y }; }, fighter);
      await page.keyboard.press('m'); await clickWorld(page, { x: departure.x - 8, y: departure.y - 3 });
      await step(page, 3);
      assert.equal(await page.evaluate(id => ironVeil.game.getEntity(id).landed, fighter), false);
      await selectEntity(page, fighter); // Uses the visible elevated aircraft body.
      assert.match(await page.locator('#selectionContent').innerText(), /AIRBORNE/);
      await page.locator('[data-action="uncrew"]').click();
      assert.equal(await page.evaluate(id => ironVeil.game.getEntity(id).crew.length, fighter), 1, 'crew cannot disembark in flight');
      await page.locator('[data-action="land"]').click();
      assert.equal(await page.evaluate(id => ironVeil.game.getEntity(id).returning, fighter), true);
      await step(page, 20);
      assert.equal(await page.evaluate(id => ironVeil.game.getEntity(id).landed, fighter), true, JSON.stringify(await page.evaluate(id => { const g=ironVeil.game,e=g.getEntity(id);return { aircraft:e,runways:g.entities.filter(b=>b.owner===0&&b.type==='airfield') }; }, fighter)));
      assert.equal(await page.evaluate(id => ironVeil.game.getEntity(id).fuel, fighter), 100);
      assert.match(await page.locator('#selectionContent').innerText(), /ON RUNWAY/);
      await page.locator('[data-action="uncrew"]').click();
      assert.equal(await page.evaluate(id => ironVeil.game.getEntity(id).crew.length, fighter), 0);
    });
    await stage('undercover enemy selection presents the same information as friendly infantry', async () => {
      const fixture = await page.evaluate(() => {
        const g = ironVeil.game;
        const friendly = g._spawn('unit', 'rifleman', 0, 7.5, 25.5);
        const spy = g._spawn('unit', 'spy', 1, 9.5, 24.5, { disguised: true, exposed: false, task: { type: 'infiltrate', targetId: g.entities.find(e => e.owner === 0 && e.type === 'hq').id } });
        spy.disguised = true; spy.exposed = false; // _spawn initializes operatives undisguised.
        g._updateFog(); return { friendly: friendly.id, spy: spy.id };
      });
      await selectEntity(page, fixture.friendly);
      const friendly = { info: await page.locator('#selectionContent').innerText(), actions: await page.locator('#selectionActions').innerText() };
      await selectEntity(page, fixture.spy);
      assert.equal(await page.locator('#selectionContent').innerText(), friendly.info, 'selection stats and status do not leak the disguise');
      assert.equal(await page.locator('#selectionActions').innerText(), friendly.actions, 'action list does not leak the disguise');
    });
    await stage('compact desktop retains command panels and battlefield', async () => {
      await page.setViewportSize({ width: 1024, height: 768 }); await page.waitForTimeout(350);
      const canvas = await page.locator('#battlefield').boundingBox();
      assert.ok(canvas.width > 500 && canvas.height > 450);
      assert.ok(await page.locator('[data-tab="build"]').isVisible());
      await page.screenshot({ path: path.join(shots, '05-gameplay-compact-desktop.png') });
      await page.setViewportSize({ width: 1536, height: 960 }); await page.waitForTimeout(200);
    });
    await stage('crewed drill burrows, mines, moves beneath the enemy, and wins with a timed charge', async () => {
      const mining = await page.evaluate(() => {
        const g = ironVeil.game, hq = g._buildings(0, 'hq')[0], deposits = [];
        for (let y = 0; y < g.height; y++) for (let x = 0; x < g.width; x++) if (g.tiles[y][x].resource?.type === 'metal') deposits.push({ x: x + .5, y: y + .5 });
        deposits.sort((a, b) => Math.hypot(a.x - hq.x, a.y - hq.y) - Math.hypot(b.x - hq.x, b.y - hq.y));
        const p = deposits[0], d = g._spawn('machine', 'drill', 0, p.x, p.y - 1);
        g._spawn('unit', 'pilot', 0, p.x - 1, p.y - 1); g._spawn('unit', 'pilot', 0, p.x, p.y - 2);
        g._updateFog(); return { id: d.id, deposit: p };
      });
      const drill = mining.id;
      await page.locator('[data-layer="surface"]').click();
      await selectEntity(page, drill);
      await page.locator('[data-action="crew"]').click();
      assert.equal(await page.evaluate(id => ironVeil.game.getEntity(id).crew.length, drill), 2);
      await page.locator('[data-action="burrow"]').click();
      assert.equal(await page.evaluate(() => ironVeil.renderer.layer), 'underground');
      const metal = await page.evaluate(() => ironVeil.game.teams[0].metal);
      await clickWorld(page, mining.deposit, { button: 'right' });
      await step(page, 5);
      assert.ok(await page.evaluate(metal => ironVeil.game.teams[0].metal > metal, metal), 'drill extracts underground resources');
      const hq = await page.evaluate(() => { const hq = ironVeil.game.entities.find(e => e.owner === 1 && e.type === 'hq'); hq.hp = 450; return { x: hq.x, y: hq.y, id: hq.id }; });
      await page.keyboard.press('m'); await clickWorld(page, { x: hq.x - 1, y: hq.y + 1 });
      const crossingTime = await page.evaluate(({ id, hq }) => { const g = ironVeil.game, d = g.getEntity(id); return Math.hypot(d.x - hq.x, d.y - hq.y) / g.getDef(d).speed * 1.5 + 10; }, { id: drill, hq });
      await step(page, crossingTime);
      assert.ok(await page.evaluate(({ id, hq }) => { const d = ironVeil.game.getEntity(id); return Math.hypot(d.x - hq.x, d.y - hq.y) < 2.5; }, { id: drill, hq }), 'drill crosses the theater underground');
      await page.evaluate(() => {
        const g = ironVeil.game;
        // The stronger AI now recruits mechanics. Isolate charge damage from
        // autonomous repair during the fuse; repair behavior has separate tests.
        for (const e of g._living(1).filter(e => e.type === 'mechanic')) g._kill(e);
        g._buildings(1, 'hq')[0].hp = 450;
      });
      await page.locator('[data-action="bomb"]').click();
      assert.equal(await page.evaluate(() => ironVeil.game.charges.length), 1);
      assert.equal(await page.evaluate(() => ironVeil.game.winner), null, 'charge fuse is not instantaneous');
      await page.keyboard.press('m'); await clickWorld(page, { x: hq.x - 9, y: hq.y + 5 });
      await step(page, 12);
      await page.locator('#resultOverlay').waitFor({ state: 'visible' });
      assert.equal(await page.evaluate(() => ironVeil.game.winner), 0);
      assert.match(await page.locator('#resultTitle').innerText(), /front is yours/i);
      await page.screenshot({ path: path.join(shots, '06-gameplay-victory.png') });
    });
    await stage('headquarters loss triggers defeat and permits a fresh operation', async () => {
      await newOperation(page);
      await page.evaluate(() => {
        const g = ironVeil.game, hq = g.entities.find(e => e.owner === 0 && e.type === 'hq');
        g.preparationDuration = 0; hq.hp = 1; g._spawn('unit', 'sapper', 1, hq.x - 3, hq.y, { task: { type: 'attack', targetId: hq.id, x: hq.x, y: hq.y } });
        g._updateFog();
      });
      await step(page, 1);
      await page.locator('#resultOverlay').waitFor({ state: 'visible' });
      assert.equal(await page.evaluate(() => ironVeil.game.winner), 1);
      assert.match(await page.locator('#resultTitle').innerText(), /command has fallen/i);
      await newOperation(page);
      assert.equal(await page.evaluate(() => ironVeil.game.winner), null);
    });
    await stage('malformed save reports recovery without destroying the running operation', async () => {
      const before = await page.evaluate(() => ironVeil.game.seed);
      await page.evaluate(key => localStorage.setItem(key, JSON.stringify({ version: 1, game: '{}' })), SAVE);
      await page.locator('#menuButton').click(); await page.locator('#loadButton').click();
      assert.match(await page.locator('#menuMessage').innerText(), /Unable to restore/i);
      assert.equal(await page.evaluate(() => ironVeil.game.seed), before);
      await page.locator('#continueButton').click();
    });
    await stage('malformed preferences recover and phone layout supports deployment and construction', async () => {
      const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
      await mobile.addInitScript(key => { localStorage.setItem(key, 'null'); Math.random = () => .41807; }, PREF);
      const phone = await mobile.newPage(); watch(phone);
      await phone.goto(URL, { waitUntil: 'networkidle' }); await newOperation(phone);
      const canvas = await phone.locator('#battlefield').boundingBox();
      assert.ok(canvas.width >= 380 && canvas.height > 300, 'phone battlefield remains usable');
      await buildViaUI(phone, 'barracks', { touch: true });
      assert.ok(await phone.locator('#selectionActions').isVisible());
      assert.ok(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'phone page does not overflow horizontally');
      await phone.screenshot({ path: path.join(shots, '07-gameplay-phone.png') });
      await mobile.close(); activePage = page;
    });
    assert.deepEqual(errors, [], 'no uncaught browser or console errors');
    console.log(JSON.stringify({ ok: true, checks: passed.length, passed, browser: await browser.version(), errors, screenshots: shots }, null, 2));
  } catch (error) {
    await activePage?.screenshot({ path: path.join(shots, 'gameplay-failure.png') }).catch(() => {});
    throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
