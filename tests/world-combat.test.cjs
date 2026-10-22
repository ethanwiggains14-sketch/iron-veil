'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
require('../dist/data.js');require('../dist/engine.js');
const advance=(g,t)=>{for(let i=0;i<Math.ceil(t/.1);i++)g.update(.1);};
function arena(){const g=new RTSGame({mapSize:'classic',seed:12345});g._ai=()=>{};g.entities=g.entities.filter(e=>e.kind==='building'&&e.type==='hq');for(const row of g.tiles)for(const t of row){t.type='grass';t.elevation=0;}return g;}
function pair(g){const soldier=g._spawn('unit','rifleman',0,20.5,30.5),enemy=g._spawn('unit','rifleman',1,26.3,30.5);enemy.task={type:'move',x:enemy.x,y:enemy.y};g._updateFog();return {soldier,enemy};}
test('idle infantry pursue a visible enemy outside weapon range and return after combat',()=>{
 const g=arena(),{soldier,enemy}=pair(g),origin={x:soldier.x,y:soldier.y};g._acquireThreat(soldier);assert.equal(soldier.autoTargetId,enemy.id);advance(g,1);assert.ok(soldier.x>origin.x+.1);enemy.hp=0;advance(g,5);assert.ok(Math.hypot(soldier.x-origin.x,soldier.y-origin.y)<.8);assert.equal(soldier.task.type,'idle');
});
test('attack-move resumes its destination after an opportunistic engagement',()=>{
 const g=arena(),{soldier,enemy}=pair(g);g.command([soldier.id],40.5,30.5,{mode:'attack'});advance(g,1);assert.equal(soldier.autoTargetId,enemy.id);enemy.hp=0;advance(g,8);assert.ok(soldier.x>30);assert.equal(soldier.task.x,40.5);
});
test('nearby reserves respond to a base attacker beyond their own sight',()=>{
 const g=arena(),hq=g._buildings(0,'hq')[0],reserve=g._spawn('unit','rifleman',0,23,32),enemy=g._spawn('unit','sapper',1,10,27);g._updateFog();assert.ok(Math.hypot(reserve.x-enemy.x,reserve.y-enemy.y)>6);g._dealDamage(enemy,hq,10);g._acquireThreat(reserve);assert.equal(reserve.autoTargetId,enemy.id);assert.equal(reserve.autoReason,'defend');advance(g,1);assert.ok(reserve.x<23);
});
test('explicit movement and work orders are not replaced by automatic pursuit',()=>{
 const g=arena(),{soldier,enemy}=pair(g),worker=g._spawn('unit','engineer',0,20.5,31.5);g.command([soldier.id],19,31,{mode:'move'});worker.task={type:'gather',x:20,y:32};g._updateFog();g._acquireThreat(soldier);g._acquireThreat(worker);assert.equal(soldier.autoTargetId,undefined);assert.equal(worker.autoTargetId,undefined);assert.equal(worker.task.type,'gather');
 g._assign(soldier,{type:'idle'});g._acquireThreat(soldier);assert.equal(soldier.autoTargetId,enemy.id);g.command([soldier.id],17,30);assert.equal(soldier.autoTargetId,undefined,'manual order overrides pursuit immediately');
});
test('automatic defense never reveals spies, fog-hidden contacts or underground threats',()=>{
 const g=arena(),s=g._spawn('unit','rifleman',0,20,30),spy=g._spawn('unit','spy',1,24,30);spy.disguised=true;g._updateFog();g._acquireThreat(s);assert.equal(s.autoTargetId,undefined);spy.hp=0;const hidden=g._spawn('unit','rifleman',1,27,30);g._updateFog();g._threatCheck=0;g._acquireThreat(s);assert.equal(s.autoTargetId,undefined);hidden.hp=0;g._spawn('machine','drill',1,21,30,{layer:'underground'});s._threatCheck=0;g._acquireThreat(s);assert.equal(s.autoTargetId,undefined);
});
test('uncrewed machines and disguised friendly operatives do not auto-engage',()=>{
 const g=arena(),tank=g._spawn('machine','tank',0,20,30),spy=g._spawn('unit','spy',0,20,31);spy.disguised=true;g._spawn('unit','rifleman',1,24,30);g._updateFog();g._acquireThreat(tank);g._acquireThreat(spy);assert.equal(tank.autoTargetId,undefined);assert.equal(spy.autoTargetId,undefined);
});
test('all new biomes have large oceans, reachable opposing bases and useful starting resources',()=>{
 for(const biome of ['temperate','desert','tundra'])for(const seed of [1,12345,41807,987654]){const g=new RTSGame({mapSize:'classic',seed,biome}),tiles=g.tiles.flat(),hqs=g._living().filter(e=>e.type==='hq');assert.equal(g.width*g.height,6912);assert.ok(tiles.filter(t=>t.type==='water').length>1400);assert.ok(g._path(g._living(0).find(e=>e.type==='rifleman'),hqs[1].x,hqs[1].y).length>50,biome+seed);for(const h of hqs)assert.ok(g._nearestDeposit(h.x,h.y,9));assert.ok(tiles.some(t=>t.depth===4&&t.ocean));}
});
test('preparation delays land, air, naval, spy and drill offensive orders for every difficulty',()=>{
 for(const [difficulty,duration] of [['relaxed',600],['standard',600],['veteran',600]]){
  const g=new RTSGame({mapSize:'classic',difficulty,seed:12345}),hq=g._buildings(1,'hq')[0];g.time=duration-1;g._aiBuild=()=>false;Object.assign(g.teams[1],{money:100000,metal:10000,fuel:10000,crystal:10000});
  g._spawn('building','airfield',1,80,33);g._spawn('building','shipyard',1,91,44);g._spawn('building','radar',1,80,42);
  const spy=g._spawn('unit','spy',1,84,40),plane=g._spawn('machine','fighter',1,80,33),sea=g._nearestWater(92,42,8),ship=g._spawn('machine','patrolboat',1,sea.x,sea.y),drill=g._spawn('machine','drill',1,84,39,{layer:'underground',aiBomb:true});
  for(const m of [plane,ship,drill])for(let i=0;i<g.getDef(m).crew;i++){const u=g._spawn('unit','pilot',1,m.x,m.y);u.boardedIn=m.id;u.layer=m.layer;m.crew.push(u.id);}
  g._ai();assert.equal(g.preparationRemaining(),1);assert.equal(plane.task.type,'idle');assert.equal(ship.task.type,'idle');assert.equal(spy.task.type,'idle');assert.equal(drill.task.type,'idle');assert.equal(g._aiWave,0);
  const enemyHQ=g._buildings(0,'hq')[0];g._reveal(g._visibility[1],enemyHQ.x,enemyHQ.y,18);g._observeRivals(1);for(let i=0;i<6;i++)g._spawn('unit','rifleman',1,enemyHQ.x+14,enemyHQ.y+i*.3);g.time=duration+1;g._ai();assert.equal(g.preparationRemaining(),0);assert.equal(plane.task.type,'attack');assert.equal(spy.task.type,'infiltrate');assert.equal(drill.task.type,'move');assert.ok(g._aiWave>0);assert.doesNotThrow(()=>RTSGame.deserialize(g.serialize()));
 }
});
test('new saves preserve full map and countdown; legacy 56×44 saves retain their original map',()=>{
 const g=new RTSGame({mapSize:'classic',difficulty:'relaxed'});g.time=71;let restored=RTSGame.deserialize(g.serialize());assert.equal(restored.width,96);assert.equal(restored.preparationRemaining(),529);
 const old=JSON.parse(g.serialize());old.width=56;old.height=44;delete old.preparationDuration;old.tiles=old.tiles.slice(0,44).map(r=>r.slice(0,56));old.explored=old.explored.slice(0,44).map(r=>r.slice(0,56));for(const e of old.entities)if(e.owner===1){e.x-=40;e.y-=29;}restored=RTSGame.deserialize(JSON.stringify(old));assert.equal(restored.width,56);assert.equal(restored.height,44);assert.equal(restored.preparationRemaining(),0);advance(restored,1);assert.doesNotThrow(()=>RTSGame.deserialize(restored.serialize()));
 old.width=900;assert.throws(()=>RTSGame.deserialize(JSON.stringify(old)),/incompatible/);
});
test('upgrade explanations match actual paid health, housing, income and production tiers',()=>{
 const g=arena();g.teams[0].money=100000;
 for(const type of Object.keys(RTS_DATA.buildings)){const b=g._spawn('building',type,0,25,25);for(let level=1;level<3;level++){const profile=RTS_DATA.upgradeProfile(b),bank=g.teams[0].money,cap=g.population().cap;assert.equal(g.upgrade(b.id).ok,true);assert.equal(g.teams[0].money,bank-profile.cost);assert.equal(b.maxHp,profile.rows.find(r=>r.label==='Maximum health').next);const housing=profile.rows.find(r=>r.label==='Housing capacity');if(housing)assert.equal(g.population().cap-cap,housing.next-housing.current);}assert.equal(RTS_DATA.upgradeProfile(b).cost,0);b.hp=0;}
});
