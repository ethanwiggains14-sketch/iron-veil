/* Pixel and canvas checks for information privacy, sensor coverage and depleted ore. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
let playwright;
try{playwright=require('playwright');}catch{playwright=require('C:/Users/ewigg/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');}
(async()=>{
  const edge='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  const browser=await playwright.chromium.launch({headless:true,...(fs.existsSync(edge)?{executablePath:edge}:{})});
  const page=await browser.newPage({viewport:{width:1000,height:700}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.setContent('<canvas id="world" style="width:1000px;height:700px"></canvas><canvas id="map" style="width:560px;height:440px"></canvas>');
    for(const file of ['data.js','engine.js','renderer.js'])await page.addScriptTag({path:path.join(__dirname,'../dist',file)});
    const result=await page.evaluate(()=>{
      const g=new RTSGame({seed:12345}),canvas=document.querySelector('#world'),r=new RTSRenderer(canvas,g),ctx=r.ctx;
      const spy=g._spawn('unit','spy',1,12,32);spy.disguised=true;spy.hp=35;spy.task={type:'infiltrate',targetId:1,x:9,y:32};
      const view=r.perceivedEntity(spy),sourceUnchanged=spy.type==='spy'&&spy.owner===1&&spy.hp===35&&spy.task.type==='infiltrate';
      r.selection=new Set([spy.id]);
      function portrait(e){ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,1000,700);ctx.save();ctx.translate(500,350);r._drawEntity(ctx,e);ctx.restore();r._drawEntityInfo(ctx,e,{x:500,y:350});return canvas.toDataURL();}
      const rifleman={...spy,type:'rifleman',owner:0,disguised:false,hp:57.5,maxHp:115,task:{type:'idle'}};
      const maskedPixelsMatch=portrait(spy)===portrait(rifleman);
      const texts=[],originalText=ctx.fillText;
      ctx.fillText=function(text,...args){texts.push(text);return originalText.call(this,text,...args);};
      r._drawEntityInfo(ctx,spy,{x:500,y:350});ctx.fillText=originalText;
      spy.exposed=true;const exposedIdentity=r.perceivedEntity(spy)===spy;spy.exposed=false;
      const ourSpy={...spy,owner:0},friendlyIdentity=r.perceivedEntity(ourSpy)===ourSpy;

      const sensor=g._spawn('building','sensor',0,18,30),coverage=[];
      r.selection=new Set([sensor.id]);r.layer='underground';
      const originalEllipse=ctx.ellipse;
      for(const level of [1,2,3]){
        sensor.level=level;const selected=[],overlay=[];
        ctx.ellipse=function(...args){selected.push(args);return originalEllipse.apply(this,args);};r._drawRanges(ctx);
        ctx.ellipse=function(...args){overlay.push(args);return originalEllipse.apply(this,args);};r._drawTunnels(ctx);
        coverage.push({level,range:r._sensorRadius(sensor),selected:selected.map(a=>[a[2],a[3]]),overlay:overlay.map(a=>[a[2],a[3]])});
      }
      sensor.progress=.5;let unfinishedRingCount=0;ctx.ellipse=function(...args){unfinishedRingCount++;return originalEllipse.apply(this,args);};r._drawRanges(ctx);r._drawTunnels(ctx);ctx.ellipse=originalEllipse;

      g.entities=[];g.tunnels=[];r.selection.clear();r.showRanges=false;
      let ore;for(let y=0;y<g.height&&!ore;y++)for(let x=0;x<g.width&&!ore;x++)if(g.tiles[y][x].resource?.amount>0)ore={x,y,deposit:g.tiles[y][x].resource};
      if(!ore)throw Error('Generated map has no ore deposit');r.centerOn(ore.x+.5,ore.y+.5);
      const cachedBelow=r._below,deposit=ore.deposit,map=document.querySelector('#map');
      r.render(0);const groundBefore=canvas.toDataURL();r.drawMinimap(map);const mapBefore=map.toDataURL();
      deposit.amount=0;r.render(0);r.drawMinimap(map);
      const undergroundDepletionChanged=groundBefore!==canvas.toDataURL(),minimapDepletionChanged=mapBefore!==map.toDataURL(),cachePreserved=cachedBelow===r._below;

      const field=g._spawn('building','airfield',0,10,30),plane=g._spawn('machine','fighter',0,10,30);
      plane.landed=true;const landedAltitude=r.aircraftAltitude(plane);plane.landed=false;const flyingAltitude=r.aircraftAltitude(plane);
      delete plane.landed;const legacyParkedAltitude=r.aircraftAltitude(plane);plane.crew=[123];plane.task={type:'move',x:18,y:30};const legacyMovingAltitude=r.aircraftAltitude(plane);
      return {sourceUnchanged,view:{type:view.type,owner:view.owner,hp:view.hp,maxHp:view.maxHp,task:view.task},maskedPixelsMatch,texts,exposedIdentity,friendlyIdentity,coverage,unfinishedRingCount,undergroundDepletionChanged,minimapDepletionChanged,cachePreserved,landedAltitude,flyingAltitude,legacyParkedAltitude,legacyMovingAltitude};
    });
    assert.deepEqual(result.view,{type:'rifleman',owner:0,hp:57.5,maxHp:115,task:{type:'idle'}});
    for(const key of ['sourceUnchanged','maskedPixelsMatch','exposedIdentity','friendlyIdentity','undergroundDepletionChanged','minimapDepletionChanged','cachePreserved'])assert.equal(result[key],true,key);
    assert.deepEqual(result.texts,['RIFLE INFANTRY']);
    for(const row of result.coverage){const radius=10+(row.level-1)*3;assert.equal(row.range,radius);for(const kind of ['selected','overlay']){assert.equal(row[kind].length,1);assert.ok(Math.abs(row[kind][0][0]-radius*26*Math.SQRT2)<.0001);assert.ok(Math.abs(row[kind][0][1]-radius*14*Math.SQRT2)<.0001);}}
    assert.equal(result.unfinishedRingCount,0);
    assert.equal(result.landedAltitude,0);assert.equal(result.legacyParkedAltitude,0);assert.ok(result.flyingAltitude>=22&&result.flyingAltitude<=26);assert.ok(result.legacyMovingAltitude>=22&&result.legacyMovingAltitude<=26);
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({ok:true,checks:['disguised spy pixel parity and private labels','normalized health without simulation mutation','exposed and friendly spy identities retained','10/13/16 tile sensor coverage and construction gating','depleted ore disappears on battlefield and minimap without recaching','landed/airborne aircraft'],browser:await browser.version()},null,2));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
