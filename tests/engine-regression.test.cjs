'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
require('../dist/data.js');
require('../dist/engine.js');
const {RTSGame}=globalThis;
function game(){const g=new RTSGame({mapSize:'classic',seed:12345});g._ai=()=>{};return g;}
function advance(g,n){for(let i=0;i<Math.ceil(n/.1);i++)g.update(.1);}
function rich(g,owner=0){Object.assign(g.teams[owner],{money:100000,metal:10000,fuel:10000,crystal:10000});}
function removePeople(g,owner=0){g.entities=g.entities.filter(e=>e.owner!==owner||e.kind!=='unit');}
function flat(g){for(const row of g.tiles)for(const t of row){t.type='grass';t.elevation=0;}}
function aircraft(g){const field=g._spawn('building','airfield',0,17.5,30.5),plane=g._spawn('machine','fighter',0,17.5,32.5),pilot=g._spawn('unit','pilot',0,17.5,33.5);assert.equal(g.crew(plane.id,[pilot.id]).ok,true);return {field,plane,pilot};}

test('save validation rejects malformed operation state before a broken match is loaded',()=>{
 const g=game(),base=JSON.parse(g.serialize());
 const corruptions=[s=>delete s.time,s=>delete s.nextId,s=>s.nextId=1,s=>s.teams[0]={},s=>s.teams[1].money=-1,s=>delete s.explored,s=>s.explored[0][0]='yes',s=>s.tiles[1][1].elevation='high',s=>s.tiles[1][1].resource={type:'metal',amount:-1},s=>s.entities[0].id=s.entities[1].id,s=>s.entities[0].x=99,s=>s.entities[0].task={type:'move'},s=>s.entities[0].task={type:'gather',x:NaN,y:4},s=>s.entities[0].queue=[{kind:'unit',type:'rifleman',progress:0}],s=>s.entities[0].crew=[9000],s=>s.charges=[{id:8000,x:5,y:5,owner:1,layer:'underground',explodeAt:4,damage:'bad',radius:4}],s=>s.scans=[{x:5,y:5,owner:1,radius:3}],s=>s.nextEventId=1];
 for(const change of corruptions){const s=structuredClone(base);change(s);assert.throws(()=>RTSGame.deserialize(JSON.stringify(s)),/Invalid|incompatible/,String(change));}
 assert.equal(g.serialize(),JSON.stringify(base),'validation cannot modify the running operation');
});

test('valid version three save preserves production, crew, charges and pending flight orders',()=>{
 const g=game();rich(g);const {plane,pilot}=aircraft(g);g.produce('fighter');
 g.command([plane.id],35,30,{mode:'move'});advance(g,1);plane.fuel=19;advance(g,.1);
 const drill=g._spawn('machine','drill',0,13,30),crew=[g._spawn('unit','pilot',0,13,30),g._spawn('unit','pilot',0,13,30)];
 g.crew(drill.id,crew.map(u=>u.id));g.ability([drill.id],'burrow');g.ability([drill.id],'bomb');
 const state=JSON.parse(g.serialize());delete state.entities.find(e=>e.id===plane.id).landed;const restored=RTSGame.deserialize(JSON.stringify(state));restored._ai=()=>{};
 assert.equal(restored.getEntity(pilot.id).boardedIn,plane.id);assert.equal(restored.getEntity(plane.id).returning,true);assert.equal(restored.charges.length,1);assert.ok(restored.entities.some(e=>e.queue.length));advance(restored,1);assert.ok(Number.isFinite(restored.time));
 const broken=structuredClone(state);broken.entities.find(e=>e.id===pilot.id).boardedIn=drill.id;assert.throws(()=>RTSGame.deserialize(JSON.stringify(broken)),/crew assignment/);
});

test('exposed operatives must return to friendly recon before restoring their disguise',()=>{
 const g=game(),hq=g._buildings(1,'hq')[0],spy=g._spawn('unit','spy',0,hq.x-2,hq.y),investigator=g._spawn('unit','investigator',1,hq.x-1,hq.y);
 g.command([spy.id],hq.x,hq.y,{mode:'infiltrate',targetId:hq.id});g._random=()=>0;g._investigate(investigator);
 assert.equal(g.command([spy.id],hq.x,hq.y,{mode:'infiltrate',targetId:hq.id}).ok,false);assert.equal(spy.exposed,true);assert.equal(spy.disguised,false);
 const radar=g._spawn('building','radar',0,15,32);spy.x=radar.x+2;spy.y=radar.y;
 assert.equal(g.command([spy.id],hq.x,hq.y,{mode:'infiltrate',targetId:hq.id}).ok,true);assert.equal(spy.exposed,false);assert.equal(spy.disguised,true);
});

test('orders to a disguised enemy preserve its cover and only temporarily distract it',()=>{
 const g=game(),hq=g._buildings(0,'hq')[0],spy=g._spawn('unit','spy',1,14,30);spy.disguised=true;g._assign(spy,{type:'infiltrate',targetId:hq.id,x:hq.x,y:hq.y});
 assert.equal(g.command([spy.id],18,30,{mode:'attack'}).ok,true);assert.equal(spy.task.type,'move');assert.equal(spy.exposed,false);assert.equal(spy.disguised,true);assert.equal(spy.coverTask.type,'infiltrate');advance(g,3.2);assert.equal(spy.task.type,'infiltrate');
 assert.equal(g.ability([spy.id],'stop').ok,true);assert.equal(spy.task.type,'idle');assert.equal(spy.disguised,true);
});

test('aircraft launch and land at operational runways, with no airborne crew teleportation',()=>{
 const g=game(),{field,plane,pilot}=aircraft(g);assert.equal(plane.landed,true);g.command([plane.id],30,30,{mode:'move'});advance(g,2);
 assert.equal(plane.landed,false);assert.equal(g.uncrew(plane.id).ok,false);assert.equal(pilot.boardedIn,plane.id);
 g.command([plane.id],field.x,field.y,{mode:'move',targetId:field.id});advance(g,5);assert.equal(plane.landed,true);assert.equal(g.uncrew(plane.id).ok,true);
 const detached=g._spawn('machine','fighter',0,35,30);assert.equal(g.crew(detached.id,[pilot.id]).ok,false);
 field.hp=0;assert.equal(g.crew(plane.id,[pilot.id]).ok,false,'destroyed runway is unusable');
});

test('low fuel triggers runway refueling and resumes the most recent flight order',()=>{
 const g=game(),{plane}=aircraft(g);g.command([plane.id],35,30,{mode:'move'});advance(g,2);plane.fuel=19;advance(g,.2);assert.equal(plane.returning,true);
 g.command([plane.id],22,17,{mode:'move'});assert.equal(plane.resumeTask.x,22);advance(g,12);assert.equal(plane.returning,false);assert.ok(plane.fuel>80);assert.ok(plane.y<25,'new destination survives refueling');
});

test('empty aircraft away from a runway still consume fuel and crash when stranded',()=>{
 const g=game(),plane=g._spawn('machine','fighter',0,20,20);plane.fuel=.1;const start={x:plane.x,y:plane.y};advance(g,2);assert.equal(plane.fuel,0);assert.ok(plane.hp<plane.maxHp);assert.equal(plane.x,start.x);assert.equal(plane.y,start.y);advance(g,24);assert.equal(plane.hp,0);
});

test('return to runway ability lands aircraft and leaves them ready to disembark',()=>{
 const g=game(),{plane}=aircraft(g);g.command([plane.id],35,30,{mode:'move'});advance(g,2);assert.equal(g.ability([plane.id],'land').ok,true);advance(g,8);assert.equal(plane.landed,true);assert.equal(plane.task.type,'idle');assert.equal(g.uncrew(plane.id).ok,true);
});

test('machinery assembly consumes available labor, never miners or another producer workers',()=>{
 const g=game();removePeople(g);flat(g);rich(g);const a=g._spawn('building','factory',0,16,25),b=g._spawn('building','factory',0,22,25),worker=g._spawn('unit','engineer',0,18,25);
 g.produce('tank',a.id);g.produce('tank',b.id);g.tiles[25][18].resource={type:'metal',amount:1000};g.command([worker.id],18.5,25.5,{mode:'gather'});advance(g,2);assert.equal(a.queue[0].progress,0);assert.equal(b.queue[0].progress,0);
 g.ability([worker.id],'stop');assert.deepEqual(g._assemblyWorkers(a).map(e=>e.id),[worker.id]);assert.deepEqual(g._assemblyWorkers(b),[]);advance(g,1);assert.ok(a.queue[0].progress>0);assert.equal(b.queue[0].progress,0);
 const firstProgress=a.queue[0].progress;g.command([worker.id],b.x,b.y,{mode:'build',targetId:b.id});advance(g,3);assert.equal(a.queue[0].progress,firstProgress);assert.ok(b.queue[0].progress>0);assert.equal(worker.task.targetId,b.id);
 advance(g,40);assert.equal(b.queue.length,0);assert.equal(worker.task.type,'idle','assembly assignment clears after its last order completes');
});

test('an uncrewed harvester cannot advance a construction assignment',()=>{
 const g=game();removePeople(g);flat(g);const site=g._spawn('building','housing',0,16,25,{progress:.1}),harvester=g._spawn('machine','harvester',0,14,25);g._assign(harvester,{type:'build',targetId:site.id});advance(g,1);assert.equal(site.progress,.1);
 const operator=g._spawn('unit','pilot',0,14,25);g.crew(harvester.id,[operator.id]);advance(g,1);assert.ok(site.progress>.1);
});

test('automatic crew assignment leaves active builders and resource workers on their jobs',()=>{
 const g=game();removePeople(g);const tank=g._spawn('machine','tank',0,15,30),builder=g._spawn('unit','engineer',0,14,30),miner=g._spawn('unit','rifleman',0,14,30);g._assign(builder,{type:'build',targetId:g._buildings(0,'hq')[0].id});g._assign(miner,{type:'gather',x:13.5,y:28.5});
 assert.equal(g.crew(tank.id).ok,false);assert.equal(tank.crew.length,0);assert.equal(builder.task.type,'build');assert.equal(miner.task.type,'gather');assert.equal(g.crew(tank.id,[builder.id,miner.id]).ok,true,'explicitly selected crew can be reassigned intentionally');
});

test('construction refuses to enclose ground occupants but allows aircraft overhead and underground drills',()=>{
 const g=game();rich(g);g._spawn('building','factory',0,15,32);g._spawn('building','power',0,10,25);g._updateFog();let p;
 for(let y=3;y<g.height-3&&!p;y++)for(let x=3;x<g.width-3&&!p;x++)if(g.canPlace('airfield',x+.5,y+.5).ok)p={x:x+.5,y:y+.5};assert.ok(p);
 const occupant=g._spawn('unit','rifleman',0,p.x,p.y);assert.equal(g.canPlace('airfield',p.x,p.y).ok,false);const bank={...g.teams[0]};assert.equal(g.build('airfield',p.x,p.y).ok,false);assert.deepEqual(g.teams[0],bank);
 occupant.x=9;occupant.y=30;g._spawn('machine','fighter',0,p.x,p.y);g._spawn('machine','drill',0,p.x,p.y,{layer:'underground'});assert.equal(g.canPlace('airfield',p.x,p.y).ok,true);
});

test('AI recruits counterintelligence and investigators expose hostile undercover operatives',()=>{
 const g=game();rich(g,1);g.time=200;g._spawn('building','radar',1,42,10);const barracks=g._buildings(1,'barracks')[0];RTSGame.prototype._ai.call(g);assert.ok(barracks.queue.some(q=>q.type==='investigator'));
 advance(g,20);const investigator=g._living(1).find(e=>e.type==='investigator');assert.ok(investigator);const spy=g._spawn('unit','spy',0,investigator.x+1,investigator.y);spy.disguised=true;g._random=()=>0;investigator.investigateReady=0;advance(g,.2);assert.equal(spy.exposed,true);
 const tank=g._spawn('machine','tank',1,investigator.x,investigator.y);g._crewAI(tank);assert.equal(investigator.boardedIn,undefined,'counterintelligence is never reassigned as automatic crew');
});

test('AI naval fire approaches a reachable water firing position and damages headquarters',()=>{
 const g=game(),hq=g._buildings(0,'hq')[0],start=g._nearestWater(hq.x,hq.y+14,20);assert.ok(start,'a nearby navigable coast exists');const ship=g._spawn('machine','frigate',1,start.x,start.y);for(let i=0;i<3;i++)g._spawn('unit','pilot',1,start.x,start.y);g._crewAI(ship);assert.equal(ship.crew.length,3);const hp=hq.hp;g.preparationDuration=0;g._aiNavalOrder(ship,hq);assert.equal(ship.task.targetId,undefined,'naval route uses a water position instead of an unreachable land target');
 advance(g,60);assert.ok(hq.hp<hp,'frigate clears the nearer barracks and actually fires on headquarters');assert.ok(['water','bridge'].includes(g.tiles[Math.floor(ship.y)][Math.floor(ship.x)].type));
});

test('AI upgrades spend its own bank, respect cooldown and preserve the timer across saves',()=>{
 const g=game();rich(g,1);g.time=250;const hq=g._buildings(1,'hq')[0],target=g._buildings(0,'hq')[0],before=g.teams[1].money,playerBank={...g.teams[0]};g._aiStrategic(hq,target,g._living(1).filter(e=>e.type==='engineer'));
 assert.ok(g._living(1).some(e=>e.level===2));assert.ok(g.teams[1].money<before);assert.deepEqual(g.teams[0],playerBank);const levels=g._living(1).map(e=>e.level);g._aiStrategic(hq,target,[]);assert.deepEqual(g._living(1).map(e=>e.level),levels);const restored=RTSGame.deserialize(g.serialize());assert.equal(restored._aiUpgradeReady,g._aiUpgradeReady);
});

test('sustained AI progression uses real queues, personnel, aircraft, navy and upgrades',()=>{
 const g=new RTSGame({mapSize:'classic',seed:12345});const hq=g._buildings(0,'hq')[0];hq.hp=hq.maxHp=1000000;
 const deployed=new Set();for(let i=0;i<13500;i++){g.update(.1);for(const m of g._living(1).filter(e=>e.kind==='machine'))if(g._crewReady(m))deployed.add(g.getDef(m).domain);}assert.equal(g.winner,null);const enemy=g._living(1);assert.ok(enemy.some(e=>e.type==='investigator'));assert.ok(enemy.some(e=>e.type==='airfield'&&e.progress===1));assert.ok(enemy.some(e=>e.type==='shipyard'&&e.progress===1));
 for(const domain of ['air','sea'])assert.ok(deployed.has(domain),domain+' machinery was constructed and crewed even if later destroyed');
 assert.ok(enemy.some(e=>e.level>1),'AI reinvests spare money into upgrades');assert.ok(g.teams[1].money>=0);assert.ok(g.population(1).used<=g.population(1).cap);assert.ok(hq.hp<900000,'combined offensive produces real combat damage');assert.doesNotThrow(()=>RTSGame.deserialize(g.serialize()));
});
