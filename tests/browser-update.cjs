/* Browser acceptance checks for the larger-world, combat-readability update.
 * Run against server.cjs: node tests/browser-update.cjs http://127.0.0.1:4173
 * Real menu/canvas/action inputs are used. The debug API only freezes time,
 * reads state, and creates explicitly marked specialist inspection fixtures.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
let playwright;
try { playwright = require('playwright'); }
catch { playwright = require('C:/Users/ewigg/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'); }
const URL = process.argv[2] || 'http://127.0.0.1:4173';
const screenshots = path.join(__dirname, '../qa-screenshots');
const passed = [];
let activePage;
async function stage(name, run) { await run(); passed.push(name); console.log('PASS ' + name); }
async function freeze(page) { await page.evaluate(() => { ironVeil.game.paused = true; ironVeil.game._ai = () => {}; }); }
async function advance(page, seconds) {
  await page.evaluate(seconds => { const g = ironVeil.game; g.paused = false; for (let t = 0; t < seconds; t += .1) g.update(Math.min(.1, seconds - t)); g.paused = true; }, seconds);
  await page.waitForTimeout(400);
}
async function deploy(page, difficulty = 'standard', biome = 'temperate') {
  await page.selectOption('#difficultySelect', difficulty);
  await page.selectOption('#biomeSelect', biome);
  await page.locator('#startButton').click();
  await page.locator('#menuOverlay').waitFor({ state: 'hidden' });
  await freeze(page);
  if (await page.locator('#hideTutorial').isVisible()) await page.locator('#hideTutorial').click();
}
async function select(page, id) {
  const position = await page.evaluate(id => {
    const g = ironVeil.game, r = ironVeil.renderer, e = g.getEntity(id);
    r.centerOn(e.x, e.y);
    const p = r.worldToScreen(e.x, e.y);
    p.y -= (e.kind === 'building' ? 14 : 6 + r.aircraftAltitude(e)) * r.camera.zoom;
    return p;
  }, id);
  const rect = await page.locator('#battlefield').boundingBox();
  await page.mouse.click(rect.x + position.x, rect.y + position.y);
  assert.ok(await page.evaluate(id => ironVeil.selection.includes(id), id), 'real canvas selects entity');
}
async function closeDetails(page) {
  await page.locator('#manualDone').click();
  if (await page.locator('#resumeButton').isVisible()) await page.locator('#resumeButton').click();
  await freeze(page);
}

(async () => {
  fs.mkdirSync(screenshots, { recursive: true });
  const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  const browser = await playwright.chromium.launch({ headless: true, ...(fs.existsSync(edge) ? { executablePath: edge } : {}) });
  const errors = [];
  function watch(page) {
    activePage = page;
    page.on('pageerror', error => errors.push(String(error)));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  }
  try {
    const context = await browser.newContext({ viewport: { width: 1536, height: 960 }, deviceScaleFactor: 1 });
    await context.addInitScript(() => { Math.random = () => .41807; });
    const page = await context.newPage(); watch(page);
    await page.goto(URL, { waitUntil: 'networkidle' });
    await stage('deployment explains the extended preparation window for every difficulty', async () => {
      for (const [difficulty, minutes] of [['relaxed', 10], ['standard', 10], ['veteran', 10]]) {
        await page.selectOption('#difficultySelect', difficulty);
        const text = await page.locator('#difficultyDescription').innerText();
        assert.match(text, new RegExp(`${minutes}(:00|\\s*(minutes?|min))`), difficulty + ' preparation is explained');
      }
      await deploy(page);
      assert.ok(await page.locator('#preparationTimer').isVisible());
      const remaining = await page.evaluate(() => ironVeil.game.preparationRemaining());
      assert.ok(remaining > 598 && remaining <= 600, 'standard starts with ten preparation minutes');
    });
    await stage('expanded map renders broad oceans, coastlines and varied terrain', async () => {
      const map = await page.evaluate(() => {
        const g = ironVeil.game, tiles = g.tiles.flat();
        return { width: g.width, height: g.height, types: [...new Set(tiles.map(t => t.type))], water: tiles.filter(t => t.type === 'water').length,
          oceanRows: g.tiles.filter(row => row.filter(t => t.type === 'water').length > g.width * .45).length,
          elevations: [...new Set(tiles.map(t => t.elevation))], hqs: g._living().filter(e => e.type === 'hq').map(e => ({ x: e.x, y: e.y })) };
      });
      assert.ok(map.width >= 96 && map.height >= 72);
      assert.ok(map.water > map.width * map.height * .2, 'substantial ocean water');
      assert.ok(map.oceanRows >= 8, 'wide ocean bands, beyond the former narrow rivers');
      assert.ok(map.types.length >= 6 && map.elevations.length >= 3);
      assert.ok(Math.hypot(map.hqs[0].x - map.hqs[1].x, map.hqs[0].y - map.hqs[1].y) > 65, 'larger strategic separation');
      await page.screenshot({ path: path.join(screenshots, '08-expanded-world.png') });
    });
    await stage('upgrade preview and full comparison explain benefits before actual purchase', async () => {
      const hq = await page.evaluate(() => ironVeil.game._buildings(0, 'hq')[0].id);
      await select(page, hq);
      assert.ok(await page.locator('.upgrade-preview').isVisible());
      const preview = await page.locator('.upgrade-preview').innerText();
      assert.match(preview, /2[,.]?600/); assert.match(preview, /3[,.]?380/);
      await page.locator('[data-action="upgradeDetails"]').click();
      await page.locator('#helpOverlay').waitFor({ state: 'visible' });
      const details = await page.locator('table[data-upgrade-table]').innerText();
      assert.match(details, /2[,.]?600/); assert.match(details, /3[,.]?380/);
      assert.match(details, /housing|beds|capacity/i); assert.match(details, /14/); assert.match(details, /21/);
      assert.match(details, /credit|income/i);
      await page.screenshot({ path: path.join(screenshots, '09-upgrade-comparison.png') });
      await closeDetails(page);
      const before = await page.evaluate(id => { const g = ironVeil.game, e = g.getEntity(id); return { money: g.teams[0].money, cost: Math.ceil((g.getDef(e).cost.money * .65 + 40) * e.level), cap: g.population().cap }; }, hq);
      await page.locator('[data-action="upgrade"]').click();
      const after = await page.evaluate(id => { const g = ironVeil.game, e = g.getEntity(id); return { money: g.teams[0].money, hp: e.maxHp, level: e.level, cap: g.population().cap }; }, hq);
      assert.equal(after.level, 2); assert.equal(after.hp, 3380);
      assert.equal(after.money, before.money - before.cost, 'paid exactly the advertised upgrade cost');
      assert.equal(after.cap, before.cap + 7, 'advertised housing benefit takes effect');
      await page.screenshot({ path: path.join(screenshots, '10-headquarters-tier-two.png') });
      await page.locator('[data-action="upgrade"]').click();
      assert.equal(await page.evaluate(id => ironVeil.game.getEntity(id).level, hq), 3);
      assert.equal(await page.locator('[data-action="upgrade"]').count(), 0, 'tier three cannot be charged another upgrade');
      await page.screenshot({ path: path.join(screenshots, '11-headquarters-tier-three.png') });
    });
    await stage('specialist and sensor comparisons expose their actual role bonuses', async () => {
      // Inspection fixtures isolate specialist cards from their production prerequisites.
      const fixture = await page.evaluate(() => {
        const g = ironVeil.game, hq = g._buildings(0, 'hq')[0];
        const investigator = g._spawn('unit', 'investigator', 0, hq.x + 6, hq.y - 4), sensor = g._spawn('building', 'sensor', 0, hq.x + 7, hq.y);
        g._updateFog(); return { investigator: investigator.id, sensor: sensor.id };
      });
      await select(page, fixture.investigator);
      await page.locator('[data-action="upgradeDetails"]').click();
      const investigator = await page.locator('table[data-upgrade-table]').innerText();
      assert.match(investigator, /46%/); assert.match(investigator, /62%/);
      await closeDetails(page); await select(page, fixture.sensor);
      await page.locator('[data-action="upgradeDetails"]').click();
      const sensor = await page.locator('table[data-upgrade-table]').innerText();
      assert.match(sensor, /underground|seismic|detection/i); assert.match(sensor, /10/); assert.match(sensor, /13/);
      await closeDetails(page);
    });
    await stage('preparation countdown updates in simulation time and clears when combat opens', async () => {
      const before = await page.evaluate(() => ironVeil.game.preparationRemaining());
      const text = await page.locator('#preparationTimer').innerText();
      await advance(page, 12);
      const after = await page.evaluate(() => ironVeil.game.preparationRemaining());
      assert.ok(Math.abs(before - after - 12) < .001);
      assert.notEqual(await page.locator('#preparationTimer').innerText(), text);
      await advance(page, after + .1);
      assert.equal(await page.evaluate(() => ironVeil.game.preparationRemaining()), 0);
      assert.equal(await page.locator('#preparationTimer').isVisible(), false);
    });
    await stage('phone shows preparation, upgrade information and purchase actions without overflow', async () => {
      const phoneContext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
      const phone = await phoneContext.newPage(); watch(phone);
      await phone.goto(URL, { waitUntil: 'networkidle' }); await deploy(phone, 'relaxed', 'tundra');
      assert.ok(await phone.locator('#preparationTimer').isVisible());
      const barracks = await phone.evaluate(() => ironVeil.game._buildings(0, 'barracks')[0].id);
      await select(phone, barracks);
      assert.ok(await phone.locator('.upgrade-preview').isVisible());
      assert.ok(await phone.locator('[data-action="upgrade"]').isVisible());
      assert.ok(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await phone.locator('[data-action="upgradeDetails"]').click();
      assert.ok(await phone.locator('table[data-upgrade-table]').isVisible());
      assert.ok(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await phone.screenshot({ path: path.join(screenshots, '12-phone-upgrade-comparison.png') });
      await closeDetails(phone);
      await phone.locator('[data-action="upgrade"]').click();
      assert.equal(await phone.evaluate(id => ironVeil.game.getEntity(id).level, barracks), 2);
      await phone.screenshot({ path: path.join(screenshots, '13-phone-upgraded-base.png') });
      await phoneContext.close(); activePage = page;
    });
    assert.deepEqual(errors, [], 'no page or console errors');
    console.log(JSON.stringify({ ok: true, checks: passed.length, passed, browser: await browser.version(), errors, screenshots }, null, 2));
  } catch (error) {
    await activePage?.screenshot({ path: path.join(screenshots, 'update-failure.png') }).catch(() => {}); throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
