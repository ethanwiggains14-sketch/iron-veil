const test=require('node:test'),assert=require('node:assert/strict'),createDB=require('../scripts/local-db.cjs');
async function setup(t){const m=await import('../worker/multiplayer.mjs'),DB=createDB();t.after(()=>DB.sqlite.close());const api=async(action,body={},token='')=>{const r=await m.multiplayer(new Request('http://localhost/api/rooms/'+action,{method:'POST',headers:{Authorization:'Bearer '+token},body:JSON.stringify(body)}),{DB});return {http:r.status,...await r.json()};};const read=async code=>m.decode(DB.sqlite.prepare('SELECT payload FROM rooms WHERE code=?').get(code).payload),write=async(code,data)=>DB.sqlite.prepare('UPDATE rooms SET payload=? WHERE code=?').run(await m.encode(data),code);return {m,DB,api,read,write};}
test('all supported human/AI combinations have equal human banks and independent exploration',async t=>{
 const {api,read,m}=await setup(t);
 for(const [humans,ai] of [[2,0],[2,1],[2,2],[3,0],[3,1],[4,0],[4,2]]){const host=await api('create',{humans,ai});assert.equal(host.http,200);const d=await read(host.code),g=m.hydrate(d);assert.equal(g.teams.length,humans+Math.min(ai,4-humans));assert.deepEqual(g.humanOwners,Array.from({length:humans},(_,i)=>i));assert.equal(g.onlineExplored.length,humans);for(let i=1;i<humans;i++)assert.deepEqual(g.teams[i],g.teams[0]);assert.equal(host.pollInterval,humans*125);assert.ok(!JSON.stringify(host).includes('seatHashes'));}
});
test('four seats join atomically, lost join replies recover, lobby departures release only their seat',async t=>{
 const {api}=await setup(t),h=await api('create',{humans:4}),code=h.code;
 assert.equal((await api('start',{code},h.token)).http,409);
 const guests=await Promise.all([1,2,3].map(n=>api('join',{code,claim:String(n).repeat(48)})));assert.deepEqual(guests.map(p=>p.seat).sort(),[1,2,3]);assert.equal((await api('join',{code})).http,409);
 const retry=await api('join',{code,claim:guests[1].token});assert.equal(retry.seat,guests[1].seat);assert.equal(retry.token,guests[1].token);
 assert.equal((await api('start',{code},guests[2].token)).http,403);
 assert.equal((await api('leave',{code},guests[1].token)).status,'closed');assert.equal((await api('tick',{code},h.token)).status,'waiting');assert.equal((await api('tick',{code},guests[1].token)).http,401);
 const replacement=await api('join',{code});assert.equal(replacement.seat,guests[1].seat);assert.equal((await api('start',{code},h.token)).status,'playing');
 assert.equal((await api('join',{code,claim:guests[0].token})).seat,guests[0].seat);assert.equal((await api('join',{code})).http,409);
});
test('every human owns a distinct army, fog, paid order sequence and private economy',async t=>{
 const {api,read,m}=await setup(t),host=await api('create',{humans:4}),code=host.code,players=[host];for(let i=1;i<4;i++)players.push(await api('join',{code}));await api('start',{code},host.token);
 const initial=await Promise.all(players.map(p=>api('tick',{code},p.token))),ids=initial.map(r=>r.state.entities.find(e=>e.type==='hq').id);
 assert.equal(new Set(ids).size,4);assert.equal(new Set(initial.map(r=>r.state.visible)).size,4);
 for(let i=0;i<4;i++){assert.equal(initial[i].state.playerSeats[0],i);assert.equal(initial[i].state.entities.filter(e=>e.type==='hq').length,1);assert.ok(initial[i].state.teams.slice(1).every(t=>t.money===0));assert.equal(initial[i].state.humanCount,4);}
 const commands=players.map((p,i)=>[{seq:1,method:'upgrade',args:[ids[(i+1)%4],i]},{seq:2,method:'upgrade',args:[ids[i]]},{seq:3,method:'train',args:['rifleman']}]);
 for(let repeat=0;repeat<2;repeat++){const replies=await Promise.all(players.map((p,i)=>api('tick',{code,commands:commands[i]},p.token)));for(const r of replies){assert.equal(r.http,200);assert.equal(r.seq,3);assert.deepEqual(r.results.map(x=>x.ok),[false,true,true]);assert.equal(r.state.entities.find(e=>e.type==='hq').level,2);assert.equal(r.state.entities.find(e=>e.type==='barracks').queue.length,1);}}
 const d=await read(code),g=m.hydrate(d);g.time=900;for(let i=0;i<30;i++)g.update(.1);assert.deepEqual(g.humanOwners,[0,1,2,3]);assert.ok(!g.aiStates?.some?.(x=>x?.raid));assert.ok(!JSON.stringify(initial).includes('seatHashes'));
});
test('third/fourth human reconnects pause safely; eliminated humans do not block final-survivor victory',async t=>{
 const {api,read,write}=await setup(t),host=await api('create',{humans:4}),code=host.code,players=[host];for(let i=1;i<4;i++)players.push(await api('join',{code}));await api('start',{code},host.token);
 for(const i of [2,3]){const d=await read(code),time=d.game.time;d.meta.lastSeen[i]=Date.now()-20000;d.meta.lastTick=Date.now()-1000;await write(code,d);const paused=await api('tick',{code},host.token);assert.equal(paused.waitingForConnection,true);assert.equal(paused.state.time,time);assert.equal((await api('tick',{code},players[i].token)).waitingForConnection,false);}
 assert.equal((await api('leave',{code},host.token)).status,'playing');assert.equal((await api('leave',{code},players[1].token)).status,'playing');let d=await read(code);d.meta.lastSeen[0]=0;d.meta.lastSeen[1]=0;await write(code,d);assert.equal((await api('tick',{code},players[2].token)).waitingForConnection,false);
 assert.equal((await api('leave',{code},players[2].token)).status,'finished');const winner=await api('tick',{code},players[3].token);assert.equal(winner.state.winner,0);assert.equal(winner.state.teams.filter(t=>!t.eliminated).length,1);
});
test('legacy two-human rooms retain credentials, exploration and pending order acknowledgements',async t=>{
 const {api,read,write}=await setup(t),h=await api('create',{ai:2}),code=h.code,p=await api('join',{code});await api('start',{code},h.token);const d=await read(code);delete d.meta.humanCount;delete d.meta.seatHashes;await write(code,d);const r=await api('tick',{code},p.token);assert.equal(r.http,200);assert.equal(r.seat,1);assert.equal(r.humanCount,2);assert.equal(r.state.teams.length,4);assert.equal((await api('join',{code})).http,409);
});
