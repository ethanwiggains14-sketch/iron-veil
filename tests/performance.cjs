'use strict';
const path=require('node:path');
const {chromium}=require('C:/Users/ewigg/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:2});
  await page.setContent('<canvas id="world" style="width:1440px;height:900px"></canvas><canvas id="mini" style="width:240px;height:160px"></canvas>');
  for(const name of ['data.js','engine.js','renderer.js'])await page.addScriptTag({path:path.resolve(process.argv[2]||path.join(__dirname,'../dist'),name)});
  const results=await page.evaluate(async()=>{
   const g=new RTSGame({seed:41807,opponents:3}),r=new RTSRenderer(document.querySelector('#world'),g);
   const measure=(fn,n=60)=>{const a=[];for(let i=0;i<n;i++){const t=performance.now();fn(i);a.push(performance.now()-t);}a.sort((a,b)=>a-b);return {medianMs:+a[Math.floor(n*.5)].toFixed(2),p95Ms:+a[Math.floor(n*.95)].toFixed(2)};};
   const out={};
   for(const zoom of [1,.38]){r.camera.zoom=zoom;r.centerOn(14,29);for(let i=0;i<90;i++){r.render(i/60);await new Promise(resolve=>requestAnimationFrame(resolve));}out['render_'+zoom]=measure(i=>r.render(i/60));}
   out.minimap=measure(()=>r.drawMinimap(document.querySelector('#mini')),30);
   const unit=g.entities.find(e=>e.owner===0&&e.kind==='unit');
   out.longPath=measure(i=>g._path(unit,120+i%5,80),10);
   out.simulation=measure(()=>g.update(.05),120);out.cacheBytes=r._chunkBytes||0;
   return out;
  });console.log(JSON.stringify(results,null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
