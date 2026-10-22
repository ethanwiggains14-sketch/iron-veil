/* Headless behavioral checks for IRON VEIL. Run: node --test tests/simulation.test.cjs */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.existsSync(path.join(__dirname, '../dist/engine.js')) ? '../dist' : '..';
require(path.join(__dirname, source, 'data.js'));
require(path.join(__dirname, source, 'engine.js'));
const { RTSGame, RTS_DATA } = globalThis;

function fresh(options = {}) {
  return new RTSGame({mapSize:'classic', seed: 12345, difficulty: 'standard', biome: 'temperate', ...options });
}
function advance(game, seconds, dt = 0.1) {
  for (let i = 0; i < Math.ceil(seconds / dt); i++) game.update(dt);
}
function living(game, owner) {
  return game.entities.filter(e => e.hp > 0 && (owner === undefined || e.owner === owner));
}
function resources(game, owner = 0) {
  return Object.fromEntries(['money', 'metal', 'fuel', 'crystal'].map(k => [k, game.teams[owner][k]]));
}
function rich(game, owner = 0) {
  Object.assign(game.teams[owner], { money: 100000, metal: 100000, fuel: 100000, crystal: 100000 });
}
function clearPeople(game, owner = 0) {
  game.entities = game.entities.filter(e => e.owner !== owner || e.kind !== 'unit');
}
function flat(game, x = 9, y = 32, radius = 7) {
  for (let ty = Math.max(0, y - radius); ty <= Math.min(game.height - 1, y + radius); ty++) {
    for (let tx = Math.max(0, x - radius); tx <= Math.min(game.width - 1, x + radius); tx++) {
      game.tiles[ty][tx].type = 'grass';
      game.tiles[ty][tx].elevation = 0;
    }
  }
}
function placement(game, type) {
  for (let y = 1; y < game.height - 1; y++) {
    for (let x = 1; x < game.width - 1; x++) if (game.canPlace(type, x + 0.5, y + 0.5).ok) return { x: x + 0.5, y: y + 0.5 };
  }
  assert.fail('No valid test placement for ' + type);
}

test('the roster, map and initial game satisfy the playable scenario contract', () => {
  const game = fresh();
  assert.ok(Object.keys(RTS_DATA.units).length >= 10, 'at least ten distinct personnel classes');
  assert.ok(Object.keys(RTS_DATA.buildings).length >= 10, 'at least ten distinct structures');
  assert.ok(Object.keys(RTS_DATA.machines).length >= 8, 'land, air, sea and underground machinery');
  assert.equal(game.width, 96);
  assert.equal(game.height, 72);
  assert.equal(game.tiles.length, game.height);
  assert.ok(game.tiles.every(row => row.length === game.width));
  assert.ok(game.visible.every(row => row.length === game.width));
  assert.ok(new Set(game.tiles.flat().map(t => t.type)).size >= 5, 'varied terrain exists');
  assert.ok(new Set(game.tiles.flat().map(t => t.elevation)).size >= 3, 'multiple elevations exist');
  assert.equal(game.winner, null);
  for (const owner of [0, 1]) {
    const army = living(game, owner);
    assert.ok(army.some(e => e.kind === 'building' && /headquarter|command|hq/i.test(e.type + ' ' + game.getDef(e).name)), 'each side has a command headquarters');
    assert.ok(army.some(e => e.kind === 'unit'), 'each side has personnel');
    assert.ok(game.population(owner).used <= game.population(owner).cap, 'initial housing fits personnel');
    for (const entity of army) {
      assert.equal(game.getEntity(entity.id), entity);
      assert.ok(Number.isFinite(entity.hp) && entity.hp > 0);
      assert.ok(entity.x >= 0 && entity.x < game.width && entity.y >= 0 && entity.y < game.height);
    }
  }
});

test('seeded terrain is reproducible', () => {
  assert.deepEqual(fresh().tiles, fresh().tiles);
  assert.notDeepEqual(fresh({ seed: 98765 }).tiles, fresh().tiles);
});

test('resource imports cost money without mutating the bank during quotation', () => {
  const game = fresh();
  Object.assign(game.teams[0], { money: 10000, metal: 10, fuel: 2, crystal: 0 });
  const before = resources(game);
  const quote = game.quote({ money: 100, metal: 14, fuel: 5, crystal: 3 });
  assert.equal(quote.imports, 70, '4 metal × 4 + 3 fuel × 6 + 3 crystal × 12');
  assert.equal(quote.money, 170);
  assert.equal(quote.metal, 10);
  assert.equal(quote.fuel, 2);
  assert.equal(quote.crystal, 0);
  assert.equal(quote.affordable, true);
  assert.deepEqual(resources(game), before);
  game.teams[0].money = 169;
  assert.equal(game.quote({ money: 100, metal: 14, fuel: 5, crystal: 3 }).affordable, false);
});

test('unaffordable orders do not change the bank or production queues', () => {
  const game = fresh();
  Object.assign(game.teams[0], { money: 0, metal: 0, fuel: 0, crystal: 0 });
  const before = resources(game);
  const count = game.entities.length;
  const queues = game.entities.map(e => JSON.stringify(e.queue || []));
  for (const type of Object.keys(RTS_DATA.units)) assert.equal(game.train(type).ok, false);
  for (const type of Object.keys(RTS_DATA.machines)) assert.equal(game.produce(type).ok, false);
  assert.deepEqual(resources(game), before);
  assert.equal(game.entities.length, count);
  assert.deepEqual(game.entities.map(e => JSON.stringify(e.queue || [])), queues);
});

test('headquarters destruction resolves both victory and defeat', () => {
  for (const loser of [0, 1]) {
    const game = fresh();
    const hq = living(game, loser).find(e => e.kind === 'building' && /headquarter|command|hq/i.test(e.type + ' ' + game.getDef(e).name));
    assert.ok(hq);
    hq.hp = 0;
    advance(game, 0.2);
    assert.equal(game.winner, 1 - loser);
  }
});

test('queued recruits reserve housing and a full camp cannot recruit again', () => {
  const game = fresh();
  rich(game);
  const initial = game.population();
  for (let i = initial.used; i < initial.cap - 1; i++) game._spawn('unit', 'rifleman', 0, 9, 32);
  assert.equal(game.population().used, initial.cap - 1);
  assert.equal(game.train('rifleman').ok, true);
  assert.equal(game.population().used, initial.cap, 'queued recruit reserves its bed immediately');
  const bank = resources(game);
  assert.equal(game.train('rifleman').ok, false);
  assert.deepEqual(resources(game), bank, 'failed housing check cannot charge credits');
});

test('an empty construction site never builds itself', () => {
  const game = fresh();
  rich(game);
  const spot = placement(game, 'housing');
  const result = game.build('housing', spot.x, spot.y);
  assert.equal(result.ok, true);
  clearPeople(game);
  const before = result.entity.progress;
  advance(game, 6);
  assert.equal(result.entity.progress, before);
  const anotherSpot = placement(game, 'housing');
  const bank = resources(game);
  assert.equal(game.build('housing', anotherSpot.x, anotherSpot.y).ok, false, 'new construction rejects an entirely unmanned base');
  assert.deepEqual(resources(game), bank);
});

test('engineers and additional personnel accelerate construction', () => {
  function progress(type, count) {
    const game = fresh();
    clearPeople(game);
    flat(game);
    const site = game._spawn('building', 'housing', 0, 15, 32, { progress: 0.01 });
    const workers = Array.from({ length: count }, (_, i) => game._spawn('unit', type, 0, 14 + i * 0.1, 32));
    const result = game.command(workers.map(e => e.id), site.x, site.y, { mode: 'build', targetId: site.id });
    assert.equal(result.ok, true);
    advance(game, 1);
    return site.progress - 0.01;
  }
  const oneRifleman = progress('rifleman', 1);
  const oneEngineer = progress('engineer', 1);
  const twoRiflemen = progress('rifleman', 2);
  assert.ok(oneRifleman > 0, 'ordinary personnel can build');
  assert.ok(oneEngineer > oneRifleman * 2.4, 'engineer is substantially faster');
  assert.ok(twoRiflemen > oneRifleman * 1.7, 'worker effort combines');
});

test('production observes completed technology requirements', () => {
  const game = fresh();
  rich(game);
  assert.equal(game.produce('tank').ok, false, 'tank requires factory');
  assert.equal(game.produce('fighter').ok, false, 'aircraft require airfield runway');
  assert.equal(game.produce('drill').ok, false, 'drills require machinery and laboratory');
  const factory = game._spawn('building', 'factory', 0, 15, 30, { progress: 0.5 });
  assert.equal(game.produce('tank', factory.id).ok, false, 'unfinished factory is unusable');
  factory.progress = 1;
  assert.equal(game.produce('tank', factory.id).ok, true);
  assert.equal(game.produce('drill', factory.id).ok, false, 'factory alone does not unlock drills');
  game._spawn('building', 'lab', 0, 17, 30, { progress: 1 });
  assert.equal(game.produce('drill', factory.id).ok, true);
});

test('machine construction needs living assembly workers', () => {
  const game = fresh();
  rich(game);
  clearPeople(game);
  flat(game);
  const factory = game._spawn('building', 'factory', 0, 15, 32, { progress: 1 });
  assert.equal(game.produce('apc', factory.id).ok, true);
  advance(game, 20);
  assert.equal(living(game, 0).filter(e => e.kind === 'machine' && e.type === 'apc').length, 0);
  game._spawn('unit', 'engineer', 0, 14, 32);
  advance(game, 40);
  assert.equal(living(game, 0).filter(e => e.kind === 'machine' && e.type === 'apc').length, 1, 'workers complete the vehicle');
});

test('crew seats are unique, capacity-limited and returned on disembarkation', () => {
  const game = fresh();
  clearPeople(game);
  flat(game);
  const tank = game._spawn('machine', 'tank', 0, 15, 32);
  const people = Array.from({ length: 3 }, (_, i) => game._spawn('unit', 'rifleman', 0, 14 + i * 0.1, 32));
  const initialPopulation = game.population().used;
  game.crew(tank.id, [people[0].id, people[0].id, people[1].id, people[2].id]);
  assert.equal(tank.crew.length, RTS_DATA.machines.tank.crew);
  assert.equal(new Set(tank.crew).size, tank.crew.length);
  for (const id of tank.crew) assert.equal(game.getEntity(id).boardedIn, tank.id);
  assert.equal(game.population().used, initialPopulation, 'boarding does not free housing');
  game.uncrew(tank.id);
  assert.equal(tank.crew.length, 0);
  assert.ok(people.every(e => !e.boardedIn));
  assert.equal(game.population().used, initialPopulation);
});

test('uncrewed machinery cannot execute movement; a complete crew enables it', () => {
  const game = fresh();
  clearPeople(game);
  flat(game, 15, 32, 8);
  const tank = game._spawn('machine', 'tank', 0, 15, 32);
  const start = { x: tank.x, y: tank.y };
  game.command([tank.id], 20, 32, { mode: 'move' });
  advance(game, 2);
  assert.equal(tank.x, start.x);
  assert.equal(tank.y, start.y);
  const a = game._spawn('unit', 'rifleman', 0, 15, 32);
  const b = game._spawn('unit', 'pilot', 0, 15, 32);
  assert.equal(game.crew(tank.id, [a.id, b.id]).ok, true);
  game.command([tank.id], 20, 32, { mode: 'move' });
  advance(game, 2);
  assert.ok(Math.hypot(tank.x - start.x, tank.y - start.y) > 0.5);
});

test('upgrades spend resources and improve entities, and level three is the cap', () => {
  const game = fresh();
  rich(game);
  for (const [kind, type] of [['unit', 'rifleman'], ['building', 'barracks'], ['machine', 'tank']]) {
    const entity = game._spawn(kind, type, 0, 15, 32, { progress: 1 });
    const originalHP = entity.maxHp;
    const money = game.teams[0].money;
    assert.equal(game.upgrade(entity.id).ok, true);
    assert.equal(entity.level, 2);
    assert.ok(entity.maxHp > originalHP);
    assert.ok(game.teams[0].money < money);
    assert.equal(game.upgrade(entity.id).ok, true);
    assert.equal(entity.level, 3);
    const bank = resources(game);
    assert.equal(game.upgrade(entity.id).ok, false);
    assert.deepEqual(resources(game), bank);
  }
});

test('save restoration preserves resources, terrain, entities and game clock', () => {
  const game = fresh();
  advance(game, 2);
  const saved = game.serialize();
  assert.equal(typeof saved, 'string');
  const restored = RTSGame.deserialize(saved);
  assert.ok(restored instanceof RTSGame);
  assert.equal(restored.time, game.time);
  assert.deepEqual(resources(restored), resources(game));
  assert.deepEqual(restored.tiles, game.tiles);
  assert.equal(restored.entities.length, game.entities.length);
  for (const original of game.entities) {
    const entity = restored.getEntity(original.id);
    assert.ok(entity);
    for (const field of ['type', 'owner', 'hp', 'x', 'y', 'level', 'progress', 'layer']) assert.equal(entity[field], original[field]);
  }
  advance(restored, 1);
  assert.ok(restored.time > game.time, 'loaded save continues simulating');
  assert.throws(() => RTSGame.deserialize('not valid JSON'));
  assert.throws(() => RTSGame.deserialize('{}'));
});

test('surface vision and satellite scans do not substitute for underground sensors', () => {
  const game = fresh();
  const enemyHQ = living(game, 1).find(e => e.type === 'hq');
  game._updateFog();
  assert.equal(game.isVisible(enemyHQ), false, 'distant enemy command begins under fog');
  const drill = game._spawn('machine', 'drill', 1, 9, 32, { layer: 'underground' });
  game._updateFog();
  assert.equal(game.isVisible(drill), false, 'surface base vision does not reveal a drill below it');
  const uplink = game._spawn('building', 'uplink', 0, 12, 32, { progress: 1 });
  rich(game);
  game.ability([uplink.id], 'scan', { x: drill.x, y: drill.y });
  game._updateFog();
  assert.equal(game.isVisible(drill), false, 'orbital surface scans do not detect underground machines');
  game._spawn('building', 'sensor', 0, 10, 32, { progress: 1 });
  game._updateFog();
  assert.equal(game.isVisible(drill), true, 'seismic beacon detects the nearby drill');
});

test('resource gathering produces materials and consumes a finite deposit', () => {
  const game = fresh();
  clearPeople(game);
  flat(game);
  const worker = game._spawn('unit', 'engineer', 0, 15.5, 32.5);
  game.tiles[32][15].resource = { type: 'metal', amount: 100 };
  const before = game.teams[0].metal;
  const result = game.command([worker.id], 15.5, 32.5, { mode: 'gather' });
  assert.equal(result.ok, true);
  advance(game, 3);
  assert.ok(game.teams[0].metal > before, 'gathered material enters bank');
  assert.ok(game.tiles[32][15].resource.amount < 100, 'deposit is depleted by gathering');
});

test('armies deal combat damage and medics restore wounded nearby personnel', () => {
  const game = fresh();
  clearPeople(game);
  flat(game, 15, 32, 8);
  const rifle = game._spawn('unit', 'rifleman', 0, 15, 32);
  const target = game._spawn('unit', 'rifleman', 1, 18, 32);
  const hp = target.hp;
  game.command([rifle.id], target.x, target.y, { mode: 'attack', targetId: target.id });
  advance(game, 1.5);
  assert.ok(target.hp < hp, 'attack orders produce actual damage');
  target.hp = 0;
  rifle.hp = Math.max(1, rifle.maxHp / 2);
  const wounded = rifle.hp;
  game._spawn('unit', 'medic', 0, rifle.x + 0.5, rifle.y);
  advance(game, 3);
  assert.ok(rifle.hp > wounded, 'medic restores health');
  assert.ok(rifle.hp <= rifle.maxHp, 'healing cannot exceed max HP');
});

test('all theater variants survive a sustained AI simulation without invalid state', () => {
  for (const [biome, difficulty] of [['temperate', 'standard'], ['desert', 'veteran'], ['tundra', 'relaxed']]) {
    const game = fresh({ biome, difficulty });
    assert.equal(game.biome, biome, 'selected theater is retained');
    if (biome === 'tundra') assert.ok(game.tiles.flat().some(tile => tile.type === 'snow'), 'tundra generates snow');
    const initialEnemyUnits = living(game, 1).filter(e => e.kind === 'unit').length;
    const initialEnemyBuildings = living(game, 1).filter(e => e.kind === 'building').length;
    let maxEnemyUnits = initialEnemyUnits;
    let maxEnemyBuildings = initialEnemyBuildings;
    for (let tick = 0; tick < 2400 && game.winner === null; tick++) {
      game.update(0.15);
      const army = living(game, 1);
      maxEnemyUnits = Math.max(maxEnemyUnits, army.filter(e => e.kind === 'unit').length);
      maxEnemyBuildings = Math.max(maxEnemyBuildings, army.filter(e => e.kind === 'building').length);
      if (tick % 50 !== 0) continue;
      for (const owner of [0, 1]) {
        for (const [name, value] of Object.entries(resources(game, owner))) assert.ok(Number.isFinite(value) && value >= -0.000001, `${biome}: invalid ${name}=${value}`);
      }
      for (const entity of living(game)) {
        assert.ok(Number.isFinite(entity.x) && Number.isFinite(entity.y) && Number.isFinite(entity.hp), `${biome}: finite entity state`);
        assert.ok(entity.x >= 0 && entity.x < game.width && entity.y >= 0 && entity.y < game.height, `${biome}: entity stays in bounds`);
        if (entity.kind === 'machine') {
          assert.equal(new Set(entity.crew).size, entity.crew.length, 'no duplicate crew seats');
          assert.ok(entity.crew.length <= game.getDef(entity).crew);
          for (const id of entity.crew) {
            const person = game.getEntity(id);
            assert.ok(person && person.hp > 0);
            assert.equal(person.owner, entity.owner);
            assert.equal(person.boardedIn, entity.id);
          }
        }
      }
    }
    assert.ok(maxEnemyUnits > initialEnemyUnits, `${biome}: AI recruits reinforcements`);
    assert.ok(maxEnemyBuildings > initialEnemyBuildings, `${biome}: AI expands its base`);
  }
});

test('undercover infiltration survives ordinary sentries and siphons credits', () => {
  const game = fresh();
  const control = fresh();
  game._ai = control._ai = () => {};
  const headquarters = living(game, 1).find(e => e.type === 'hq');
  const spy = game._spawn('unit', 'spy', 0, headquarters.x - 2, headquarters.y);
  assert.equal(game.command([spy.id], headquarters.x, headquarters.y, { mode: 'infiltrate', targetId: headquarters.id }).ok, true);
  assert.equal(spy.disguised, true);
  advance(game, 5.5);
  advance(control, 5.5);
  assert.equal(spy.hp, spy.maxHp, 'ordinary enemy sentries do not attack a successful disguise');
  assert.ok(game.teams[0].money > control.teams[0].money, 'operative brings home credits');
  assert.ok(game.teams[1].money < control.teams[1].money, 'credits are stolen from the opposing bank');
  assert.ok(game.scans.some(scan => scan.owner === 0), 'infiltration supplies intelligence');
});

test('investigator sweeps have a chance to miss, obey cooldown, and can expose spies', () => {
  const game = fresh();
  const spy = game._spawn('unit', 'spy', 1, 12, 32);
  spy.disguised = true;
  const investigator = game._spawn('unit', 'investigator', 0, 13, 32);
  game._random = () => 0.99;
  assert.equal(game.ability([investigator.id], 'investigate').ok, true);
  assert.equal(spy.exposed, false, 'a check may miss the operative');
  assert.equal(spy.disguised, true);
  assert.equal(game.ability([investigator.id], 'investigate').ok, false, 'cooldown prevents unlimited checks in one instant');
  game.time += 8.1;
  game._random = () => 0;
  assert.equal(game.ability([investigator.id], 'investigate').ok, true);
  assert.equal(spy.exposed, true);
  assert.equal(spy.disguised, false);
  game._updateFog();
  const rifleman = living(game, 0).find(e => e.type === 'rifleman');
  assert.equal(game._canTarget(rifleman, spy), true, 'exposed infiltrator becomes a legitimate target');
});

test('a crewed drill burrows, lays a delayed charge and damages an enemy base', () => {
  const game = fresh();
  game._ai = () => {};
  rich(game);
  const hq = living(game, 1).find(e => e.type === 'hq');
  const drill = game._spawn('machine', 'drill', 0, hq.x, hq.y);
  const crew = Array.from({ length: 2 }, () => game._spawn('unit', 'pilot', 0, hq.x, hq.y));
  assert.equal(game.crew(drill.id, crew.map(e => e.id)).ok, true);
  assert.equal(game.ability([drill.id], 'burrow').ok, true);
  assert.equal(drill.layer, 'underground');
  assert.ok(crew.every(e => e.layer === 'underground'));
  assert.equal(game.uncrew(drill.id).ok, false, 'crew cannot disembark into soil');
  const before = hq.hp;
  assert.equal(game.ability([drill.id], 'bomb').ok, true);
  assert.equal(game.charges.length, 1);
  assert.equal(game.charges[0].layer, 'underground');
  assert.equal(game.ability([drill.id], 'bomb').ok, false, 'bomb deployment is rate-limited');
  game.command([drill.id], hq.x - 10, hq.y, { mode: 'move' });
  advance(game, 8);
  assert.equal(hq.hp, before, 'charge has a real fuse');
  advance(game, 3);
  assert.ok(hq.hp < before - 500, 'charge damages surface infrastructure');
  assert.equal(game.charges.length, 0);
  assert.ok(drill.hp > 0, 'drill can escape the blast radius');
});

test('a seismic beacon plus a nearby engineer disarms a hostile charge', () => {
  const game = fresh();
  const hq = living(game, 0).find(e => e.type === 'hq');
  game._spawn('building', 'sensor', 0, hq.x + 2, hq.y, { progress: 1 });
  game._spawn('unit', 'engineer', 0, hq.x + 1, hq.y);
  game.charges.push({ id: game.nextId++, x: hq.x, y: hq.y, owner: 1, explodeAt: game.time + 10, damage: 1000, radius: 4, layer: 'underground' });
  const hp = hq.hp;
  game._updateFog();
  advance(game, 0.2);
  assert.equal(game.charges.length, 0, 'detected charge is defused');
  advance(game, 11);
  assert.equal(hq.hp, hp);
  assert.ok(game.events.some(event => /disarmed/i.test(event.text)));
});

test('a shoreline shipyard produces a boat in navigable water', () => {
  const game = fresh();
  rich(game);
  game._spawn('building', 'factory', 0, 15, 32, { progress: 1 });
  const spot = placement(game, 'shipyard');
  const shipyard = game._spawn('building', 'shipyard', 0, spot.x, spot.y, { progress: 1 });
  for (let i = 0; i < 3; i++) game._spawn('unit', 'engineer', 0, spot.x, spot.y + 2);
  assert.equal(game.produce('patrolboat', shipyard.id).ok, true);
  advance(game, 25);
  const boat = living(game, 0).find(e => e.type === 'patrolboat');
  assert.ok(boat, 'boat is assembled');
  assert.equal(game.tiles[Math.floor(boat.y)][Math.floor(boat.x)].type, 'water');
  const crew = Array.from({ length: 2 }, () => game._spawn('unit', 'marine', 0, spot.x, spot.y));
  assert.equal(game.crew(boat.id, crew.map(e => e.id)).ok, true);
  const startY = boat.y;
  assert.equal(game.command([boat.id], 0.5, 10.5, { mode: 'move' }).ok, true);
  for (let i = 0; i < 100; i++) {
    game.update(0.1);
    assert.ok(['water', 'bridge'].includes(game.tiles[Math.floor(boat.y)][Math.floor(boat.x)].type), 'ship remains in navigable water');
  }
  assert.ok(Math.abs(boat.y - startY) > 2, 'crewed boat follows the water route');
});

module.exports = { fresh, advance, living, resources };
