'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
let pw;try{pw=require('playwright');}catch{pw=require('C:/Users/ewigg/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');}
(async()=>{
 const browser=await pw.chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}),page=await browser.newPage({viewport:{width:1800,height:1700}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.setContent('<body style="margin:0;background:#172426"><canvas id="world" style="width:1800px;height:1700px"></canvas></body>');
  for(const file of ['data.js','engine.js','renderer.js'])await page.addScriptTag({path:path.join(__dirname,'../dist',file)});
  const result=await page.evaluate(()=>{
   const canvas=document.querySelector('canvas'),g=new RTSGame({seed:41807}),r=new RTSRenderer(canvas,g),c=r.ctx;window.visual={g,r};
   const cacheBytes=(r._ground.width*r._ground.height+r._below.width*r._below.height)*4;
   c.setTransform(1,0,0,1,0,0);c.fillStyle='#172426';c.fillRect(0,0,1800,1700);const changes=[];
   Object.entries(RTS_DATA.buildings).forEach(([type,d],index)=>{
    const x=(index%4)*450,y=Math.floor(index/4)*270;c.fillStyle='#b5cbb4';c.font='15px sans-serif';c.textAlign='left';c.fillText(d.name,x+15,y+25);
    const crops=[];
    for(let level=1;level<=3;level++){
     const e={id:100,kind:'building',type,level,owner:0,progress:1,hp:d.hp,maxHp:d.hp,queue:[],angle:0};
     c.save();c.translate(x+75+(level-1)*145,y+180);c.scale(.84,.84);r._drawBuilding(c,e,d,'#73ead1');c.restore();c.fillStyle='#9dac99';c.font='11px monospace';c.textAlign='center';c.fillText('TIER '+level,x+75+(level-1)*145,y+225);
     const bytes=c.getImageData(x+(level-1)*145,y+35,145,180).data;let hash=2166136261;for(const n of bytes)hash=Math.imul(hash^n,16777619);crops.push(hash);
    }
    changes.push({type,distinct:new Set(crops).size});
   });return {changes,cacheBytes};
  });
  for(const entry of result.changes)assert.equal(entry.distinct,3,entry.type+' has distinct models at every tier');assert.ok(result.cacheBytes<26*1024*1024,'large-map terrain caches are bounded');
  const dir=path.join(__dirname,'../qa-screenshots');fs.mkdirSync(dir,{recursive:true});await page.screenshot({path:path.join(dir,'14-building-tiers.png')});
  const shots=await page.evaluate(()=>{
   const {g,r}=visual,c=r.ctx;g.visible=g.tiles.map(row=>row.map(()=>true));c.setTransform(1,0,0,1,0,0);c.fillStyle='#25372e';c.fillRect(0,0,1800,1700);
   const weapons=['rifleman','heavy','tank','artillery','rocketeer','frigate','bomber'];
   const frames=[];
   weapons.forEach((weapon,row)=>[.06,.22,.48,.8].forEach((t,column)=>{
    const x=column*440+30,y=row*145+75,fx={weapon,heavy:!['rifleman','heavy','rocketeer'].includes(weapon),sourceAir:weapon==='bomber',x:10,y:30,tx:14,ty:30};
    c.save();c.translate(x,y);r._drawShot(c,fx,{x:0,y:0},{x:260,y:10},t);c.restore();c.fillStyle='#d2dcc7';c.font='12px monospace';c.textAlign='left';c.fillText(weapon+' · '+Math.round(t*100)+'%',x,y+50);
    const bytes=c.getImageData(x,y-65,300,100).data;let hash=0;for(const n of bytes)hash=(Math.imul(hash,31)+n)|0;frames.push(hash);
   }));return {unique:new Set(frames).size};
  });assert.ok(shots.unique>20,'projectile type and elapsed time change the effect');await page.screenshot({path:path.join(dir,'15-firing-effects.png')});
  const perf=await page.evaluate(()=>{const {g,r}=visual;g.explored=g.visible;g._visibility[0]=g.visible;r.camera.zoom=.38;r.centerOn(48,36);r.render(1);const start=performance.now();for(let i=0;i<20;i++)r.render(i*.03);return {averageFrameMs:(performance.now()-start)/20};});
  await page.screenshot({path:path.join(dir,'16-ocean-theater.png')});assert.deepEqual(errors,[]);console.log(JSON.stringify({ok:true,buildings:result.changes.length,tiers:result.changes.length*3,cacheMiB:result.cacheBytes/1024/1024,shotFrames:28,...perf,errors},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
