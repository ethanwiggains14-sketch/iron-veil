/* Real-browser smoke checks. Usage: node tests/browser-smoke.cjs http://127.0.0.1:PORT */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
let playwright;
try { playwright = require('playwright'); }
catch { playwright = require('C:/Users/ewigg/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'); }

(async () => {
  const screenshots = path.join(__dirname, '../qa-screenshots');
  fs.mkdirSync(screenshots, { recursive: true });
  const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  const browser = await playwright.chromium.launch({ headless: true, ...(fs.existsSync(edge) ? { executablePath: edge } : {}) });
  const context = await browser.newContext({ viewport: { width: 1536, height: 960 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  try {
    await page.goto(process.argv[2] || 'http://127.0.0.1:4173', { waitUntil: 'networkidle' });
    await page.locator('#startButton').waitFor({ state: 'visible' });
    await page.screenshot({ path: path.join(screenshots, '01-briefing.png') });
    await page.selectOption('#difficultySelect', 'relaxed');
    await page.locator('#startButton').click();
    await page.locator('#menuOverlay').waitFor({ state: 'hidden' });
    await page.waitForTimeout(1200);
    assert.ok(await page.locator('#battlefield').isVisible(), 'battlefield is visible after deployment');
    const canvas = await page.locator('#battlefield').evaluate(node => ({ width: node.width, height: node.height }));
    assert.ok(canvas.width > 500 && canvas.height > 300, 'renderer sizes its canvas');
    assert.match(await page.locator('#population').innerText(), /\d+\s*\/\s*\d+/);

    for (const tab of ['build', 'recruit', 'machines', 'intel']) {
      await page.locator(`[data-tab="${tab}"]`).click();
      assert.ok((await page.locator('#catalog').innerText()).trim().length > 20, `${tab} catalog populates`);
    }
    await page.locator('[data-tab="build"]').click();
    await page.screenshot({ path: path.join(screenshots, '02-battlefield.png') });

    await page.locator('#helpButton').click();
    await page.locator('#helpOverlay').waitFor({ state: 'visible' });
    for (const tab of ['basics', 'economy', 'combat', 'covert']) {
      await page.locator(`[data-manual="${tab}"]`).click();
      assert.ok((await page.locator('#manualContent').innerText()).trim().length > 50, `${tab} manual has content`);
    }
    await page.locator('#manualDone').click();
    await page.locator('#helpOverlay').waitFor({ state: 'hidden' });

    await page.locator('[data-layer="underground"]').click();
    await page.screenshot({ path: path.join(screenshots, '03-subsurface.png') });
    await page.locator('[data-layer="surface"]').click();
    await page.locator('#pauseButton').click();
    await page.locator('#pauseOverlay').waitFor({ state: 'visible' });
    await page.locator('#resumeButton').click();
    await page.locator('#pauseOverlay').waitFor({ state: 'hidden' });
    await page.locator('#saveButton').click();
    assert.ok(await page.evaluate(() => Object.keys(localStorage).length > 0), 'save writes browser storage');
    await page.locator('#menuButton').click();
    await page.locator('#loadButton').waitFor({ state: 'visible' });
    await page.locator('#loadButton').click();
    await page.locator('#menuOverlay').waitFor({ state: 'hidden' });
    assert.equal(errors.length, 0, 'no page or console errors: ' + errors.join('\n'));

    await page.setViewportSize({ width: 1280, height: 720 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(screenshots, '04-compact-desktop.png') });
    const bounds = await page.locator('#battlefield').boundingBox();
    assert.ok(bounds && bounds.width > 300 && bounds.height > 250, 'compact desktop retains a playable battlefield');
    console.log(JSON.stringify({ ok: true, browser: await browser.version(), canvas, errors, screenshots }, null, 2));
  } catch (error) {
    await page.screenshot({ path: path.join(screenshots, 'failure.png') }).catch(() => {});
    throw error;
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
