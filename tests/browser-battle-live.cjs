// Unmodified live room: march both starting armies into contact and verify combat.
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=require('C:/Users/ewigg/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}:{})}),contexts=await Promise.all([0,1].map(()=>browser.newContext({viewport:{width:1440,height:1000}}))),pages=await Promise.all(contexts.map(c=>c.newPage())),errors=[];
 try{
  for(const p of pages){p.setDefaultTimeout(45000);p.on('pageerror',e=>errors.push(e.message));await p.goto(process.argv[2]||'http://127.0.0.1:4173');}
  await pages[0].selectOption('#onlineAI','0');await pages[0].click('#hostRoom');await pages[0].waitForFunction(()=>document.querySelector('#activeRoomCode').textContent.length===10);const code=await pages[0].locator('#activeRoomCode').textContent();await pages[1].fill('#roomCode',code);await pages[1].click('#joinRoom');await pages[0].locator('#startRoom').waitFor({state:'visible'});await pages[0].click('#startRoom');await Promise.all(pages.map(p=>p.waitForFunction(()=>ironVeil.online.active&&document.querySelector('#menuOverlay').hidden)));
  const armies=await Promise.all(pages.map(p=>p.evaluate(()=>ironVeil.game.entities.filter(e=>e.owner===0&&e.type==='rifleman').map(e=>({id:e.id,hp:e.hp})))));
  for(const p of pages){await p.click('#hideTutorial');await p.evaluate(()=>{const g=ironVeil.game;ironVeil.select(g.entities.filter(e=>e.owner===0&&e.type==='rifleman').map(e=>e.id));ironVeil.renderer.centerOn(72,54);ironVeil.renderer.camera.zoom=.75;});await p.click('[data-action="attack"]');const box=await p.locator('#battlefield').boundingBox(),pos=await p.evaluate(()=>ironVeil.renderer.worldToScreen(72,54));await p.mouse.click(box.x+pos.x,box.y+pos.y);}
  console.log('Both starting armies are marching toward the central crossing.');
  const begin=Date.now(),seen=[false,false],hurt=[false,false];let elapsed=0;
  while(Date.now()-begin<180000&&!hurt.every(Boolean)){
   for(let i=0;i<2;i++){const result=await pages[i].evaluate(({ours,theirs})=>{const g=ironVeil.game;return {seen:theirs.some(u=>{const e=g.getEntity(u.id);return e?.owner===1&&g.isVisible(e)&&ironVeil.renderer._canDraw(e);}),hurt:ours.some(u=>!g.getEntity(u.id)||g.getEntity(u.id).hp<u.hp),time:g.time,rtt:ironVeil.online.rtt};},{ours:armies[i],theirs:armies[1-i]});seen[i]||=result.seen;hurt[i]||=result.hurt;elapsed=result.time;}
   await pages[0].waitForTimeout(500);
  }
  assert.ok(seen.every(Boolean),'both players must see opposing troops');assert.ok(hurt.every(Boolean),'both armies must inflict damage');assert.ok(elapsed<600,'human battle occurs during AI preparation');assert.deepEqual(errors,[]);
  const dir=path.join(__dirname,'../qa-screenshots');fs.mkdirSync(dir,{recursive:true});await pages[0].screenshot({path:path.join(dir,'live-network-battle.png')});console.log(JSON.stringify({ok:true,mutualVisibility:seen,mutualDamage:hurt,gameSeconds:elapsed,wallSeconds:(Date.now()-begin)/1000,errors}));
  for(const p of pages){await p.click('#menuButton');await p.click('#leaveRoom');}
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
