const test=require('node:test'),assert=require('node:assert/strict'),createDB=require('../scripts/local-db.cjs');
require('../dist/data.js');require('../dist/engine.js');
const modules=()=>import('../worker/multiplayer.mjs');
function apiFor(m,DB){return async(action,body={},token='')=>{const response=await m.multiplayer(new Request('http://localhost/api/rooms/'+action,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(body)}),{DB});assert.equal(response.status,200,await response.clone().text());return response.json();};}
test('both human armies see, acquire and damage each other away from HQ during preparation after every checkpoint',async()=>{
 const m=await modules();let g=new RTSGame({seed:41807,opponents:1});g.humanOwners=[0,1];g.onlineExplored=[g.explored,g._blankGrid()];
 const a=g._spawn('unit','rifleman',0,70,54),b=g._spawn('unit','rifleman',1,73,54);for(let y=50;y<59;y++)for(let x=66;x<79;x++)g.tiles[y][x]={type:'grass',elevation:0};g._updateFog();
 for(let i=0;i<10;i++){g=m.hydrate(await m.decode(await m.encode(m.persist(g,{}))));g.paused=false;g.update(.2);for(const owner of [0,1]){const s=m.view(g,owner);assert.ok(s.entities.some(e=>e.id===(owner? a.id:b.id)&&e.owner===1),'enemy visible and hostile in both perspectives');}}
 assert.ok(g.getEntity(a.id).hp<a.hp,'guest fires during preparation');assert.ok(g.getEntity(b.id).hp<b.hp,'host fires');assert.ok(g.time<600);
 // Enemy contacts disappear when outside current sight, without exposing their new location.
 g.getEntity(b.id).x=110;g._updateFog();assert.ok(!m.view(g,0).entities.some(e=>e.id===b.id));
});
test('slow requests preserve wall-clock progress and do not give one player twice the simulation speed',async()=>{
 const m=await modules(),DB=createDB(),api=apiFor(m,DB);try{const host=await api('create'),guest=await api('join',{code:host.code});await api('start',{code:host.code},host.token);
 let data=await m.decode(DB.sqlite.prepare('SELECT payload FROM rooms WHERE code=?').get(host.code).payload),before=data.game.time;data.meta.lastTick=Date.now()-2400;data.meta.lastSeen=[Date.now(),Date.now()];DB.sqlite.prepare('UPDATE rooms SET payload=? WHERE code=?').run(await m.encode(data),host.code);
 const results=await Promise.all([host,guest].map(p=>api('tick',{code:host.code},p.token)));const time=Math.max(...results.map(r=>r.state.time));assert.ok(time-before>=2.35,'2.4s elapsed must not collapse to 0.6s');assert.ok(time-before<3,'concurrent polls must not double count time');
 }finally{DB.sqlite.close();}
});
test('compact checkpoints preserve resources, partial clearing, fog, paths and effects without changing another room',async()=>{
 const m=await modules(),g=new RTSGame({seed:41807,opponents:3});g.onlineExplored=[g.explored,g._blankGrid()];const initial=JSON.stringify(g.tiles);const t=g.tiles.flat().find(t=>t.resource);t.resource.amount-=123;g.tiles[30][30].clearWork=1.7;g._effect('shot',10,10,{owner:0,life:.6});
 const payload=m.persist(g,{});assert.equal(payload.game.tiles,undefined);assert.ok(JSON.stringify(payload).length<60000);const restored=m.hydrate(await m.decode(await m.encode(payload)));assert.deepEqual(restored.tiles,g.tiles);assert.equal(restored.tiles[30][30].clearWork,1.7);assert.equal(restored.effects.length,g.effects.length);
 const other=new RTSGame({seed:41807,opponents:3});other.onlineExplored=[other.explored,other._blankGrid()];assert.equal(JSON.stringify(m.hydrate(m.persist(other,{})).tiles),initial);
 const legacy={game:JSON.parse(g.serialize()),runtime:payload.runtime,meta:{}};assert.deepEqual(m.hydrate(legacy).tiles,g.tiles,'existing live rooms remain readable');
});
test('browser transport rejects stale responses and interpolates continuously over slow snapshot intervals',()=>{
 global.localStorage={getItem:()=>null,setItem(){},removeItem(){}};require('../dist/online.js');const states=[],client=new OnlineMatch({room(){},state:s=>states.push(s),result(){},closed(){}});client.session={code:'A'};
 client.accept({revision:8,seq:3,status:'playing',state:{time:8}});client.accept({revision:7,seq:2,status:'playing',state:{time:7}});assert.equal(states.length,1);assert.equal(client.nextSeq,4);
 const e={x:10,y:5,_interpolation:{x:0,y:5,start:0,duration:1200}};assert.equal(OnlineMatch.position(e,600).x,5);assert.equal(OnlineMatch.position(e,1200).x,10);assert.equal(OnlineMatch.position(e,2400).x,10);
 assert.throws(()=>client.configure('https://example.com'));assert.equal(OnlineMatch.endpoint('https://example.com/path'),'https://example.com');assert.throws(()=>OnlineMatch.endpoint('https://user:secret@example.com'));assert.throws(()=>OnlineMatch.endpoint('http://untrusted.example'));
});
