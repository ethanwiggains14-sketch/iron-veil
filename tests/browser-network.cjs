// Real persisted room, two browsers, real canvas attack-move, 600ms response delays.
// Fixture edits are local SQLite only; there is no public debug endpoint.
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=require('C:/Users/ewigg/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
const createDB=require('../scripts/local-db.cjs');
(async()=>{
 const base=process.argv[2]||'http://127.0.0.1:4173',dbPath=process.argv[3]||path.join(__dirname,'../.local/network-qa.sqlite');
 const api=async(action,input={},token='')=>{const r=await fetch(base+'/api/rooms/'+action,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(input)});assert.equal(r.status,200);return r.json();};
 const host=await api('create',{ai:0}),code=host.code,guest=await api('join',{code});await api('start',{code},host.token);
 const m=await import('../worker/multiplayer.mjs'),DB=createDB(dbPath),data=await m.decode(DB.sqlite.prepare('SELECT payload FROM rooms WHERE code=?').get(code).payload),g=m.hydrate(data);
 g.entities=g.entities.filter(e=>e.type==='hq');const troops=[g._spawn('unit','rifleman',0,67.5,54.5,{hp:2000,maxHp:2000}),g._spawn('unit','rifleman',1,82.5,54.5,{hp:2000,maxHp:2000})];
 for(let y=48;y<62;y++)for(let x=60;x<90;x++)g.tiles[y][x]={type:'grass',elevation:0};g._pathRevision++;g._updateFog();data.meta.lastSeen=[Date.now(),Date.now()];data.meta.lastTick=Date.now();DB.sqlite.prepare('UPDATE rooms SET payload=? WHERE code=?').run(await m.encode(m.persist(g,data.meta)),code);DB.sqlite.close();
 const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}:{})}),contexts=await Promise.all([0,1].map(()=>browser.newContext({viewport:{width:1440,height:1000}}))),pages=[],errors=[];
 try{
  for(let i=0;i<2;i++){
   await contexts[i].addInitScript(session=>localStorage.setItem('iron-veil-room-v1',JSON.stringify(session)),{...([host,guest][i]),backend:''});
   const p=await contexts[i].newPage();pages.push(p);p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(20000);
   await p.route('**/api/rooms/tick',async route=>{const response=await route.fetch();await new Promise(resolve=>setTimeout(resolve,600));await route.fulfill({response});});
   await p.goto(base);await p.waitForFunction(()=>ironVeil.online.active&&document.querySelector('#menuOverlay').hidden);
   assert.equal(await p.evaluate(id=>!!ironVeil.game.getEntity(id),troops[1-i].id),false,'distant army starts hidden');
   await p.click('#hideTutorial');await p.evaluate(id=>{ironVeil.renderer.centerOn(75,54.5);ironVeil.renderer.camera.zoom=1;ironVeil.select([id]);},troops[i].id);
   await p.click('[data-action="attack"]');const box=await p.locator('#battlefield').boundingBox(),pos=await p.evaluate(()=>ironVeil.renderer.worldToScreen(75,54.5));await p.mouse.click(box.x+pos.x,box.y+pos.y);
  }
  await Promise.all(pages.map((p,i)=>p.waitForFunction(id=>{const e=ironVeil.game.getEntity(id);return e&&e.owner===1&&ironVeil.game.isVisible(e)&&ironVeil.renderer._canDraw(e);},troops[1-i].id)));
  console.log('PASS both clients render newly sighted hostile troops through fog under 600ms latency');
  await Promise.all(pages.map((p,i)=>p.waitForFunction(ids=>ids.every(id=>ironVeil.game.getEntity(id)?.hp<1990),troops.map(t=>t.id))));
  console.log('PASS both human armies fire and take replicated damage during preparation');
  const t=await pages[0].evaluate(()=>ironVeil.game.time),start=Date.now();await pages[0].waitForTimeout(3200);const delta=await pages[0].evaluate(t=>ironVeil.game.time-t,t),wall=(Date.now()-start)/1000;assert.ok(delta>wall*.65&&delta<wall*1.35,{delta,wall});
  assert.ok(await pages[0].evaluate(()=>ironVeil.game._onlineInterval>400));console.log('PASS game clock keeps real-time pace instead of slowing down with polling latency');
  const dir=path.join(__dirname,'../qa-screenshots');fs.mkdirSync(dir,{recursive:true});await pages[0].screenshot({path:path.join(dir,'network-host-battle.png')});await pages[1].screenshot({path:path.join(dir,'network-guest-battle.png')});assert.deepEqual(errors,[]);
  console.log(JSON.stringify({ok:true,scenarios:3,errors,gameSeconds:delta,wallSeconds:wall}));
 }finally{await browser.close();await api('leave',{code},guest.token);}
})().catch(e=>{console.error(e);process.exitCode=1;});
