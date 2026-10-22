'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('C:/Users/ewigg/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}),errors=[],results=[];
 const dir=path.join(__dirname,'../qa-screenshots');fs.mkdirSync(dir,{recursive:true});
 try{
  for(const [dpr,biome] of [[1,'temperate'],[2,'desert'],[3,'tundra']]){
   const page=await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:dpr});page.on('pageerror',e=>errors.push(e.message));
   await page.setContent('<body style="margin:0"><canvas style="width:1280px;height:800px"></canvas></body>');
   for(const file of ['data.js','engine.js','renderer.js'])await page.addScriptTag({path:path.join(__dirname,'../dist',file)});
   const stats=await page.evaluate(async({biome,dpr})=>{
    const g=new RTSGame({seed:41807,opponents:3,biome}),r=new RTSRenderer(document.querySelector('canvas'),g);window.fixture={g,r};const hq=g._buildings(0,'hq')[0];r.centerOn(hq.x,hq.y);r.selection.add(hq.id);const warm=async()=>{for(let i=0;i<80;i++){r.render(i/60);await new Promise(resolve=>requestAnimationFrame(resolve));}};await warm();
    const canvasWidth=r.canvas.width;r.resize();if(r.canvas.width!==canvasWidth||r.dpr!==dpr)throw Error('DPR backing size');
    const tree=r._treeSprite(0,false,1.25);if(tree.width<100*r.camera.zoom*r.dpr*1.25)throw Error('undersampled foliage');
    const before=r._fogCache;r.render(2);if(r._fogCache!==before)throw Error('fog unnecessarily rebuilt');g._updateFog();r.render(2.1);if(r._fogCache===before)throw Error('stale fog');
    const local=[...r._chunks.entries()].find(([,c])=>c.layer==='surface'&&c.x===Math.floor(r._raw(hq.x,hq.y).x/256)&&c.y===Math.floor(r._raw(hq.x,hq.y).y/256));if(!local)throw Error('missing terrain chunk');const distant=r._makeChunk(15,10,1),farKey=r._chunkKey(15,10,1),x=Math.floor(hq.x),y=Math.floor(hq.y);g.tiles[y][x].cleared=true;g.tiles[y][x].type='sand';(g._terrainChanges||=[]).push({x:x+.5,y:y+.5});r._patchTerrain();if(r._chunks.has(local[0])||r._chunks.get(farKey)!==distant)throw Error('incorrect local terrain invalidation');await warm();
    if(r._chunkBytes>96*1024*1024)throw Error('chunk budget exceeded');
    const fonts=[],text=r.ctx.fillText;r.ctx.fillText=function(...args){fonts.push(this.font);return text.apply(this,args);};r.camera.zoom=.35;r._drawEntityInfo(r.ctx,hq,{x:200,y:200});const f1=fonts.filter(f=>f.includes('600'))[0];fonts.length=0;r.camera.zoom=2.1;r._drawEntityInfo(r.ctx,hq,{x:200,y:200});const f2=fonts.filter(f=>f.includes('600'))[0];r.ctx.fillText=text;if(f1!==f2)throw Error('zoom-scaled labels');r.camera.zoom=1;r.centerOn(hq.x,hq.y);await warm();
    r.setQuality('detailed');r.camera.zoom=2.1;r.centerOn(hq.x,hq.y);await warm();let builds=0;const make=r._makeChunk.bind(r);r._makeChunk=(...args)=>{builds++;return make(...args);};r.render(3);r.render(3.1);if(builds)throw Error('high-DPI cache thrashing');if(r._chunkBytes>128*1024*1024)throw Error('detailed memory budget');r._makeChunk=make;r.setQuality('balanced');r.camera.zoom=1;r.centerOn(hq.x,hq.y);await warm();
    return {dpr,biome,chunkMiB:+(r._chunkBytes/1024/1024).toFixed(1),treeWidth:tree.width,labelFont:f1};
   },{dpr,biome});results.push(stats);
   await page.screenshot({path:path.join(dir,`fidelity-${biome}-dpr${dpr}.png`)});
   await page.evaluate(async()=>{const {g,r}=fixture;r.layer='underground';for(let i=0;i<45;i++){r.render(i/60);await new Promise(resolve=>requestAnimationFrame(resolve));}});
   await page.screenshot({path:path.join(dir,`fidelity-underground-dpr${dpr}.png`)});
   await page.close();
  }
  const page=await browser.newPage({viewport:{width:1365,height:900}});page.on('pageerror',e=>errors.push(e.message));await page.goto(process.argv[2]||'http://127.0.0.1:4173');await page.selectOption('#graphicsSelect','performance');assert.equal(await page.evaluate(()=>ironVeil.renderer.quality),'performance');await page.reload();assert.equal(await page.locator('#graphicsSelect').inputValue(),'performance');await page.click('#startButton');await page.evaluate(()=>{ironVeil.game.paused=true;window.sameGame=ironVeil.game;});await page.click('#menuButton');await page.selectOption('#graphicsSelect','detailed');assert.equal(await page.evaluate(()=>ironVeil.game===sameGame&&ironVeil.renderer.quality==='detailed'),true);await page.close();
  assert.deepEqual(errors,[]);console.log(JSON.stringify({ok:true,checks:['native DPR 1/2/3','zoom-aware trees','bounded chunks','local terrain invalidation','fog reuse and invalidation','fixed-size labels','three biomes and underground','live graphics settings and persistence'],results,errors},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
