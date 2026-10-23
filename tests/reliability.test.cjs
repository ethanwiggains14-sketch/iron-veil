const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),createDB=require('../scripts/local-db.cjs');
require('../dist/data.js');require('../dist/engine.js');
test('host reports only actual connected match traffic, at most once per minute, without credentials',()=>{
 let now=0;const logs=[],report=require('../scripts/server-activity.cjs')({now:()=>now,log:s=>logs.push(s)}),body=state=>Buffer.from(JSON.stringify(state));
 report(true,body({status:'waiting'}),4);report(true,body({status:'playing',waitingForConnection:true}),4);report(false,body({error:'bad session'}),4);assert.equal(logs.length,0);
 report(true,body({status:'playing',waitingForConnection:false,token:'secret',code:'private'}),4);assert.equal(logs.length,1);assert.doesNotMatch(logs[0],/secret|private/);
 now=59000;report(true,body({status:'playing'}),4);assert.equal(logs.length,1);now=61000;report(true,body({status:'playing',waitingForConnection:true}),4);assert.equal(logs.length,1);report(true,body({status:'playing'}),4);assert.equal(logs.length,2);
});
function clientHarness(){const storage=new Map(),messages=[],context={crypto,performance,URL,AbortSignal,Response,Date,Math,setTimeout:()=>1,clearTimeout(){},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}};vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../dist/online.js'),'utf8'),context);const create=()=>new context.OnlineMatch({room(){},state(){},result:r=>messages.push(r),closed:()=>messages.push('closed'),status:s=>messages.push(s)});return {context,storage,messages,create};}
test('pending paid orders survive a lost reply and reload, then server acknowledgement removes them',async()=>{
 const h=clientHarness(),a=h.create();a.adopt({code:'ABCDEF1234',token:'test-token',seat:0,status:'playing',seq:0,revision:1});
 assert.equal(a.send('upgrade',[4]).ok,true);a.failure(Error('offline'));assert.equal(a.send('train',['rifleman',5]).ok,true);
 const b=h.create();h.context.fetch=async()=>Response.json({status:'playing',seq:1,revision:4,results:[{seq:1,ok:true,message:'Upgraded'}]});await b.resume();
 assert.equal(b.active,true);assert.equal(b.queue.length,1);assert.equal(b.queue[0].seq,2);assert.equal(b.nextSeq,3);
 b.accept({status:'playing',seq:2,revision:5});assert.equal(b.queue.length,0);assert.equal(JSON.parse(h.storage.get('iron-veil-room-v1')).pending.length,0);a.stop();b.stop();
});
test('proxy 404 or sign-in responses retain the room; only authoritative expiry clears it',async()=>{
 const h=clientHarness(),a=h.create();a.adopt({code:'ABCDEF1234',token:'test-token',status:'playing',seq:0});
 for(const response of [new Response('<h1>Codespace stopped</h1>',{status:404}),Response.json({error:'proxy unavailable'},{status:404}),new Response('<h1>Sign in</h1>',{status:200})]){h.context.fetch=async()=>response;try{await a.request('tick');assert.fail('expected failure');}catch(e){a.failure(e);}assert.equal(a.active,true);}
 h.context.fetch=async()=>Response.json({error:'Room not found or expired.',code:'ROOM_EXPIRED'},{status:404});try{await a.request('tick');}catch(e){a.failure(e);}assert.equal(a.active,false);assert.match(h.messages.at(-1),/expired/);
});
test('large command batches stay under server body limits and refuse oversized single orders',()=>{
 const h=clientHarness(),a=h.create();a.adopt({code:'ABCDEF1234',token:'test-token',status:'playing',seq:0});for(let i=0;i<8;i++)assert.equal(a.send('train',['x'.repeat(7900)]).ok,true);assert.ok(JSON.stringify({code:a.session.code,commands:a.batch()}).length<20000);assert.equal(a.batch().length,2);assert.equal(a.send('train',['x'.repeat(8100)]).ok,false);a.stop();
});
test('pending orders do not hammer a paused room while the other player reconnects',async()=>{
 const h=clientHarness(),a=h.create();a.adopt({code:'ABCDEF1234',token:'test-token',status:'playing',seq:0});a.send('train',['rifleman']);let tick;h.context.setTimeout=fn=>{tick=fn;return 1;};h.context.fetch=async()=>Response.json({status:'playing',seq:0,revision:1,waitingForConnection:true});a.schedule(0);let delay;a.schedule=ms=>{delay=ms;};await tick();assert.equal(a.queue.length,1);assert.ok(delay>=900,delay);a.stop();
});
test('old matches shed thousands of casualties while retaining live crews, targets and visual effects',async()=>{
 const m=await import('../worker/multiplayer.mjs'),g=new RTSGame({seed:41807});g.onlineExplored=[g.explored,g._blankGrid()];const tank=g._spawn('machine','tank',0,25,25),crew=g._spawn('unit','pilot',0,25,25,{boardedIn:tank.id});tank.crew=[crew.id];const dead=g._spawn('unit','rifleman',1,26,25,{hp:0});tank.task={type:'attack',targetId:dead.id};for(let i=0;i<2000;i++)g._spawn('unit','rifleman',1,20,20,{hp:0});g._effect('explosion',26,25,{life:1});
 const empty=btoa(String.fromCharCode(...new Uint8Array(Math.ceil(g.width*g.height/8))));
 const legacy={game:JSON.parse(g.serialize()),runtime:{explored:[empty,empty],effects:g.effects},meta:{}};
 const restored=m.hydrate(legacy);assert.ok(restored.entities.length<40);assert.ok(restored.getEntity(crew.id));assert.deepEqual(restored.getEntity(tank.id).crew,[crew.id]);assert.doesNotThrow(()=>restored.update(.2));assert.ok(restored.effects.length);const payload=m.persist(restored,{});assert.ok(JSON.stringify(payload).length<50000);
});
test('bounded catch-up carries simulation debt across requests without duplicating elapsed time',async t=>{
 const m=await import('../worker/multiplayer.mjs'),DB=createDB();const api=async(action,input={},token='')=>{const r=await m.multiplayer(new Request('http://localhost/api/rooms/'+action,{method:'POST',headers:{Authorization:'Bearer '+token},body:JSON.stringify(input)}),{DB});assert.equal(r.status,200);return r.json();};
 try{const host=await api('create'),guest=await api('join',{code:host.code});await api('start',{code:host.code},host.token);const data=await m.decode(DB.sqlite.prepare('SELECT payload FROM rooms WHERE code=?').get(host.code).payload),before=data.game.time;data.meta.lastTick=Date.now()-4000;data.meta.lastSeen=[Date.now(),Date.now()];DB.sqlite.prepare('UPDATE rooms SET payload=? WHERE code=?').run(await m.encode(data),host.code);
 let clock=0;t.mock.method(performance,'now',()=>clock+=100);let r=await api('tick',{code:host.code},host.token);assert.ok(r.lagSeconds>3);assert.ok(r.state.time-before<.2);t.mock.restoreAll();for(let i=0;i<12&&r.lagSeconds>.1;i++)r=await api('tick',{code:host.code},i%2?host.token:guest.token);assert.ok(r.state.time-before>=4);assert.ok(r.state.time-before<5);assert.ok(r.lagSeconds<=.1);
 }finally{DB.sqlite.close();}
});

// Join claims survive a response lost before the browser ever had a seat token.
test('interrupted fourth-player join resumes the same claim after reload',async()=>{
 const h=clientHarness(),a=h.create();let calls=0,claim;
 h.context.fetch=async(_url,options)=>{const body=JSON.parse(options.body);claim??=body.claim;assert.equal(body.claim,claim);assert.match(claim,/^[a-f0-9]{48}$/);if(++calls===1)throw Error('lost acknowledgement');return Response.json({code:body.code,token:claim,seat:3,status:'waiting',seq:0,pollInterval:500});};
 await assert.rejects(a.join('ABCDEF1234'));assert.ok(h.storage.has('iron-veil-room-v1.join'));const b=h.create();await b.resume();assert.equal(b.session.seat,3);assert.equal(b.pollInterval,500);assert.equal(h.storage.has('iron-veil-room-v1.join'),false);b.stop();
});
test('four-human rooms use a bounded polling interval while queued orders remain immediate',async()=>{
 const h=clientHarness(),a=h.create();a.adopt({code:'ABCDEF1234',token:'token',seat:3,status:'playing',seq:0,pollInterval:500});let tick;h.context.setTimeout=fn=>{tick=fn;return 1;};h.context.fetch=async()=>Response.json({status:'playing',seq:0,revision:1,pollInterval:500});a.schedule(0);let delay;a.schedule=ms=>{delay=ms;};await tick();assert.ok(delay>=450&&delay<=500,delay);a.send('train',['rifleman']);assert.equal(delay,0);a.stop();
});
