const test=require('node:test'),assert=require('node:assert/strict');require('../dist/data.js');require('../dist/engine.js');
function arena(){const g=new RTSGame({mapSize:'classic',opponents:3});g._ai=()=>{};g.entities=g.entities.filter(e=>e.type==='hq');for(const row of g.tiles)for(const tile of row){tile.type='grass';tile.elevation=0;}g._pathRevision++;return g;}
test('gate occupancy index updates after construction and destruction for every faction',()=>{
 const g=arena(),gate=g._spawn('building','heavygate',2,30.5,30.5,{progress:.99});
 const people=g.teams.map((_,owner)=>g._spawn('unit','rifleman',owner,25,30));
 for(const e of people)assert.equal(g._passable(30,30,e),true);
 const worker=g._spawn('unit','engineer',2,30,32);g._assign(worker,{type:'build',targetId:gate.id});g._updateBuilding(gate,10);assert.equal(gate.progress,1);
 for(const e of people)assert.equal(g._passable(30,30,e),e.owner===2);
 g._kill(gate,{owner:0});for(const e of people)assert.equal(g._passable(30,30,e),true);
 const restored=RTSGame.deserialize(g.serialize());assert.equal(restored._passable(30,30,restored.getEntity(people[0].id)),true);
});
test('a large squad spreads route planning across steps and every soldier eventually moves',()=>{
 const g=arena(),army=Array.from({length:36},(_,i)=>g._spawn('unit','rifleman',0,20+i%6,25+Math.floor(i/6)));
 for(const u of army)g._assign(u,{type:'move',x:50,y:25});
 let count=0;const path=g._path.bind(g);g._path=(...args)=>{count++;return path(...args);};
 g.update(.05);assert.ok(count>0&&count<=6,'route planning is bounded per simulation step');
 for(let i=0;i<25;i++)g.update(.05);assert.ok(army.every(u=>u._pathTarget==='50,25'&&u.x>20),'deferred orders are not lost');
 assert.doesNotThrow(()=>RTSGame.deserialize(g.serialize()));
});
