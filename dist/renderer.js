/* IRON VEIL — procedural isometric battlefield renderer. No external assets. */
(function (global) {
  'use strict';
  const TW=52, TH=28, LIFT=11, BLUE='#73ead1', RED='#ff8262';
  const FACTIONS=['#73ead1','#ff8262','#83bbff','#f5cf72'];
  const COL={grass:'#73934e',forest:'#51763e',sand:'#c4aa72',marsh:'#648b66',water:'#2e8fa3',rock:'#8c9582',snow:'#d0dbcd',bridge:'#a99c78'};
  const shade=(hex,n)=>{let v=parseInt(hex.slice(1),16);return '#'+[v>>16,(v>>8)&255,v&255].map(x=>Math.max(0,Math.min(255,Math.round(x+n))).toString(16).padStart(2,'0')).join('');};
  const hash=(x,y,s=0)=>{let n=Math.sin(x*127.1+y*311.7+s*74.73)*43758.5453123;return n-Math.floor(n);};
  function poly(c,p,fill,stroke,width=1){c.beginPath();p.forEach((v,i)=>i?c.lineTo(v[0],v[1]):c.moveTo(v[0],v[1]));c.closePath();if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=width;c.stroke();}}
  function line(c,points,color,w=1){c.beginPath();points.forEach((p,i)=>i?c.lineTo(p[0],p[1]):c.moveTo(p[0],p[1]));c.strokeStyle=color;c.lineWidth=w;c.stroke();}
  function ellipse(c,x,y,rx,ry,fill,stroke,w=1){c.beginPath();c.ellipse(x,y,Math.max(.1,rx),Math.max(.1,ry),0,0,Math.PI*2);if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=w;c.stroke();}}
  function round(c,x,y,w,h,r,fill,stroke){c.beginPath();if(c.roundRect)c.roundRect(x,y,w,h,r);else c.rect(x,y,w,h);if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=1;c.stroke();}}
  function proj(x,y,z=0){return [(x-y)*26,(x+y)*14-z];}
  class RTSRenderer {
    constructor(canvas,game){
      this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:false});this.game=game;
      this.layer='surface';this.selection=new Set();this.hoverId=null;this.placement=null;this.dragRect=null;this.showRanges=false;
      this.camera={x:0,y:0,zoom:1};this.width=1;this.height=1;this.dpr=1;this._scenery=[];this._sprites=new Map();this._time=0;
      this.quality='balanced';this._chunks=new Map();this._chunkBytes=0;this._buildingSprites=new Map();this._buildingBytes=0;this.resize();this._makeTerrain();this.centerOn(14,29);
    }
    resize(){const r=this.canvas.getBoundingClientRect();this.width=Math.max(1,r.width||this.canvas.clientWidth||1000);this.height=Math.max(1,r.height||this.canvas.clientHeight||700);this._deviceDpr=global.devicePixelRatio||1;this.dpr=Math.min(this.quality==='performance'?1.5:3,this._deviceDpr);const w=Math.round(this.width*this.dpr),h=Math.round(this.height*this.dpr);if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;}}
    setQuality(value){this.quality=['balanced','detailed','performance'].includes(value)?value:'balanced';this._sprites.clear();this._buildingSprites.clear();this._buildingBytes=0;this.resize();}
    _density(multiplier=1){const target=this.camera.zoom*this.dpr*multiplier;return Math.max(.25,Math.ceil(target*2)/2);}
    _tileBounds(left,top,right,bottom){const g=this.game,points=[[left,top],[right,top],[left,bottom+90],[right,bottom+90]].map(([x,y])=>({x:(x/26+y/14)/2,y:(y/14-x/26)/2}));return {x0:Math.max(0,Math.floor(Math.min(...points.map(p=>p.x)))-2),x1:Math.min(g.width-1,Math.ceil(Math.max(...points.map(p=>p.x)))+2),y0:Math.max(0,Math.floor(Math.min(...points.map(p=>p.y)))-2),y1:Math.min(g.height-1,Math.ceil(Math.max(...points.map(p=>p.y)))+2)};}
    setGame(game){this.game=game;this.selection.clear();this.placement=null;this.wallPreview=null;this.areaPreview=null;this._makeTerrain();this.centerOn(14,29);}
    _elevation(x,y){return this.layer==='underground'?0:(this.game.tiles?.[Math.floor(y)]?.[Math.floor(x)]?.elevation||0);}
    worldToScreen(x,y,elevation){let z=elevation==null?this._elevation(x,y):elevation;return{x:this.camera.x+(x-y)*26*this.camera.zoom,y:this.camera.y+((x+y)*14-z*LIFT)*this.camera.zoom};}
    screenToWorld(sx,sy){let a=(sx-this.camera.x)/this.camera.zoom/26,b=(sy-this.camera.y)/this.camera.zoom/14;let x=(a+b)/2,y=(b-a)/2;if(this.layer==='surface'){let bx=Math.floor(x),by=Math.floor(y),best=null;for(let iy=-1;iy<=3;iy++)for(let ix=-1;ix<=3;ix++){let tx=bx+ix,ty=by+iy,t=this.game.tiles?.[ty]?.[tx];if(!t)continue;let z=(t.elevation||0)*LIFT/14,xx=(a+b+z)/2,yy=(b-a+z)/2;if(xx>=tx-.00001&&xx<tx+1&&yy>=ty-.00001&&yy<ty+1&&(!best||tx+ty>best.depth))best={x:xx,y:yy,depth:tx+ty};}if(best){x=best.x;y=best.y;}}return{x,y};}
    centerOn(x,y){this.camera.x=this.width*.5-(x-y)*26*this.camera.zoom;this.camera.y=this.height*.51-((x+y)*14-this._elevation(x,y)*LIFT)*this.camera.zoom;}
    pan(dx,dy){this.camera.x+=dx;this.camera.y+=dy;}
    zoomAt(factor,x=this.width/2,y=this.height/2){let old=this.camera.zoom,now=Math.max(.2,Math.min(2.1,old*factor)),ratio=now/old;this.camera.x=x-(x-this.camera.x)*ratio;this.camera.y=y-(y-this.camera.y)*ratio;this.camera.zoom=now;}
    _raw(x,y,elevation){return{x:(x-y)*26,y:(x+y)*14-(elevation==null?this._elevation(x,y):elevation)*LIFT};}
    _tilePoly(x,y,z=0){return[proj(x,y,z),proj(x+1,y,z),proj(x+1,y+1,z),proj(x,y+1,z)];}
    _makeTerrain(){
      const g=this.game;this._seenTerrainChanges=(g._terrainChanges||[]).length;this._scenery=[];this._water=[];this._undergroundDeposits=[];this._chunks.clear();this._chunkBytes=0;this._buildingSprites.clear();this._buildingBytes=0;this._wallLinks=null;this._motionCache=new Map();this._gateMotion=new Map();if(!g?.tiles)return;
      this._origin={x:-g.height*26-90,y:-100};let w=(g.width+g.height)*26+180,h=(g.width+g.height)*14+220;
      // Keep two inexpensive overview fallbacks (<24 MiB together). Visible
      // terrain is replaced incrementally by bounded, density-aware chunks.
      this._terrainSize={width:w,height:h};this._terrainScale=Math.min(1,3072/w,3072/h,Math.sqrt(3000000/(w*h)));
      this._ground=document.createElement('canvas');this._ground.width=Math.floor(w*this._terrainScale);this._ground.height=Math.floor(h*this._terrainScale);
      this._below=document.createElement('canvas');this._below.width=this._ground.width;this._below.height=this._ground.height;
      const c=this._ground.getContext('2d'),u=this._below.getContext('2d');for(const context of [c,u]){context.scale(this._ground.width/w,this._ground.height/h);context.translate(-this._origin.x,-this._origin.y);}
      for(let sum=0;sum<g.width+g.height;sum++)for(let y=0;y<g.height;y++){const x=sum-y;if(x>=0&&x<g.width)this._paintTerrainTile(c,u,x,y,true);}
      this._scenery.sort((a,b)=>(a.x+a.y)-(b.x+b.y));
    }
    _paintTerrainTile(c,u,x,y,collect=false){const g=this.game;let t=g.tiles[y][x],z=(t.elevation||0)*LIFT,type=t.type||'grass',p=this._tilePoly(x,y,z),waterDepth=type==='water'?this._waterDepth(x,y):0,base=shade(type==='water'?['#65b9af','#419fa8','#2c829d','#246b91'][waterDepth-1]:COL[type]||COL.grass,Math.sin(x*.15+y*.06)*3+Math.cos(y*.13-x*.04)*3+hash(x,y)*2-1);
        if(c){
        // Elevation escarpments catch light on their exposed stone strata.
        let east=(g.tiles[y]?.[x+1]?.elevation||0)*LIFT,south=(g.tiles[y+1]?.[x]?.elevation||0)*LIFT;
        if(z>east||x===g.width-1){poly(c,[p[1],p[2],[p[2][0],p[2][1]+Math.max(12,z-east)],[p[1][0],p[1][1]+Math.max(12,z-east)]],shade(base,-27),'#1c302b',.5);}
        if(z>south||y===g.height-1){poly(c,[p[2],p[3],[p[3][0],p[3][1]+Math.max(12,z-south)],[p[2][0],p[2][1]+Math.max(12,z-south)]],shade(base,-13),'#22352d',.5);for(let k=5;k<z-south;k+=6)line(c,[[p[3][0],p[3][1]+k],[p[2][0],p[2][1]+k]],'rgba(14,26,24,.28)',.6);}
        poly(c,p,base,base,.6);
        // Broad material transitions are baked once; silhouette detail stays on units.
        if(!['water','bridge','rock'].includes(type))for(const [nx,ny,a,b] of [[x,y-1,0,1],[x-1,y,3,0]]){const n=g.tiles[ny]?.[nx];if(!n||n.type===type||['water','bridge','rock'].includes(n.type)||n.elevation!==t.elevation)continue;const center=proj(x+.5,y+.5,z),mid=[(p[a][0]+p[b][0])/2,(p[a][1]+p[b][1])/2],blend=c.createLinearGradient(mid[0],mid[1],center[0],center[1]);blend.addColorStop(0,(COL[n.type]||COL.grass)+'70');blend.addColorStop(1,base+'00');poly(c,[p[a],p[b],center],blend);}
        if(type!=='water'&&type!=='bridge'){for(let n=0;n<7;n++){const a=hash(x+n*7,y,3),b=hash(x,y+n*9,5),v=proj(x+a,y+b,z+.1);c.fillStyle=shade(base,hash(x+n,y+n)*38-15);c.fillRect(v[0],v[1],1+hash(n,x)*2,.7);}if(['grass','forest','marsh'].includes(type))for(let n=0;n<2;n++){const v=proj(x+hash(x,n+y),y+hash(y,n+x,1),z);line(c,[[v[0]-2,v[1]],[v[0]-1,v[1]-3],[v[0],v[1]],[v[0]+2,v[1]-2]],shade(base,12),.65);}}

        const cx=(x-y)*26,cy=(x+y+1)*14-z;
        if(type==='water'){
          if(collect)this._water.push({x:cx,y:cy,tx:x,ty:y,r:hash(x,y),depth:waterDepth,ocean:!!t.ocean});
          for(let k=0;k<3;k++){let dx=(hash(x,y,k+4)-.5)*27,dy=(hash(x,y,k+9)-.5)*12;line(c,[[cx+dx-5,cy+dy],[cx+dx+3,cy+dy-1],[cx+dx+7,cy+dy-1]],waterDepth===1?'#57827a':'#315a67',.6);}
          const neighbors=[[x,y-1,0,1],[x+1,y,1,2],[x,y+1,2,3],[x-1,y,3,0]];
          for(const [nx,ny,a,b] of neighbors){const neighbor=g.tiles[ny]?.[nx];if(neighbor&&neighbor.type!=='water'&&neighbor.type!=='bridge'){line(c,[p[a],p[b]],'rgba(173,197,164,.44)',2.3);const aa=p[a].map((v,i)=>v*.82+[cx,cy][i]*.18),bb=p[b].map((v,i)=>v*.82+[cx,cy][i]*.18);line(c,[aa,bb],'rgba(137,186,169,.22)',1.1);}}
        }else if(type==='bridge'){
          for(let k=.1;k<1;k+=.16){let a=proj(x+k,y+.02,z+.5),b=proj(x+k,y+.98,z+.5);line(c,[a,b],'#443f33',1.3);}
          line(c,[p[0],p[1]],'#a79b70',2.1);line(c,[p[2],p[3]],'#8e825d',2.1);
        }else{
          for(let k=0;k<7;k++){let a=x+.08+hash(x,y,k+20)*.84,b=y+.08+hash(x,y,k+40)*.84,v=proj(a,b,z+.2);let bright=hash(x,y,k+60)>.6;line(c,[[v[0]-1,v[1]],[v[0]+(bright?2:1),v[1]-.4]],shade(base,bright?14:-10),.7);}
          if(type==='marsh'){for(let k=0;k<3;k++){let v=proj(x+.2+hash(x,y,k)*.6,y+.2+hash(y,x,k+2)*.6,z);ellipse(c,v[0],v[1],5,1.8,'#243e3b');line(c,[[v[0],v[1]],[v[0]+1,v[1]-4]],'#70826b',.7);}}
          if(!t.cleared&&type==='forest'&&hash(x,y)>.12){for(let k=0;k<(hash(y,x)>.5?2:1);k++){let xx=x+.2+hash(x,y,k+5)*.6,yy=y+.2+hash(x,y,k+8)*.6;if(collect)this._scenery.push({type:'tree',x:xx,y:yy,z,variant:Math.floor(hash(x,y,k+2)*6),size:.7+hash(x,y,k+3)*.55,snow:g.biome==='tundra'||type==='snow'});let v=proj(xx,yy,z);ellipse(c,v[0]+10,v[1]+3,15,5,'rgba(5,17,13,.23)');}}
          if(!t.cleared&&type==='rock'&&hash(x,y)>.3)if(collect)this._scenery.push({type:'rock',x:x+.5,y:y+.5,z,variant:Math.floor(hash(y,x)*6),size:.6+hash(x,y)*.9});
          if(!t.cleared&&type==='snow'&&hash(x,y)>.82)if(collect)this._scenery.push({type:'tree',x:x+.5,y:y+.5,z,variant:Math.floor(hash(y,x)*6),size:.8,snow:true});
        }
        if(t.resource&&t.resource.amount>0){if(collect)this._scenery.push({type:'resource',resource:t.resource.type,x:x+.5,y:y+.5,z,variant:Math.floor(hash(x,y)*6),size:1});}
        }
        if(u){
        // Cutaway geological plan underneath the same surface coordinates.
        let underground=shade('#697266',Math.sin(x*.08+y*.26)*7+hash(x,y)*4-2);poly(u,this._tilePoly(x,y),underground,shade(underground,-2),.5);
        for(let k=0;k<3;k++){const a=proj(x+hash(x,y,k+5),y+hash(y,x,k+9));ellipse(u,a[0],a[1],1+hash(x,k)*2,.5,shade(underground,hash(k,y)*12-5));}
        if(hash(x,y)>.83){let a=proj(x+hash(x,y,5)*.5,y+.1),b=proj(x+.3+hash(x,y,7)*.4,y+.4),d=proj(x+.2+hash(x,y,8)*.6,y+.85);line(u,[a,b,d],'#465147',.65);line(u,[[a[0]+1,a[1]], [b[0]+1,b[1]]],'rgba(170,180,149,.14)',.5);}
        }
        if(collect&&t.resource)this._undergroundDeposits.push({x,y});
    }
    _chunkKey(x,y,density){return this.layer+':'+x+':'+y+':'+density;}
    _makeChunk(x,y,density){
      const size=256,gutter=4,left=x*size-gutter,top=y*size-gutter,extent=size+gutter*2,a=document.createElement('canvas');a.width=a.height=Math.ceil(extent*density);const c=a.getContext('2d');c.setTransform(a.width/extent,0,0,a.height/extent,-left*a.width/extent,-top*a.height/extent);const b=this._tileBounds(left-30,top-30,left+extent+30,top+extent+30);
      for(let sum=b.x0+b.y0;sum<=b.x1+b.y1;sum++)for(let yy=b.y0;yy<=b.y1;yy++){const xx=sum-yy;if(xx>=b.x0&&xx<=b.x1)this._paintTerrainTile(this.layer==='surface'?c:null,this.layer==='underground'?c:null,xx,yy);}
      const chunk={canvas:a,x,y,density,layer:this.layer,bytes:a.width*a.height*4,used:this._cacheTick||0};this._chunks.set(this._chunkKey(x,y,density),chunk);this._chunkBytes+=chunk.bytes;return chunk;
    }
    _drawTerrain(c){
      const z=this.camera.zoom,size=256,left=-this.camera.x/z,top=-this.camera.y/z,right=left+this.width/z,bottom=top+this.height/z,limit=(this.quality==='performance'?32:this.quality==='detailed'?128:96)*1024*1024;
      let density=this._density(this.quality==='performance'?.75:this.quality==='detailed'?1.25:1);
      // The small overview remains available immediately while sharper chunks arrive.
      c.drawImage(this.layer==='underground'?this._below:this._ground,this._origin.x,this._origin.y,this._terrainSize.width,this._terrainSize.height);
      const needed=[];for(let y=Math.floor(top/size);y<=Math.floor(bottom/size);y++)for(let x=Math.floor(left/size);x<=Math.floor(right/size);x++){if(x*size>this._origin.x+this._terrainSize.width||(x+1)*size<this._origin.x||y*size>this._origin.y+this._terrainSize.height||(y+1)*size<this._origin.y)continue;needed.push({x,y,d:Math.hypot((x+.5)*size-(left+right)/2,(y+.5)*size-(top+bottom)/2)});}
      // A very large high-DPI viewport must fit its entire visible working set.
      // Reduce density slightly before allowing eviction/rebuild thrashing.
      const workingSet=(Math.ceil(this.width/z/size)+1)*(Math.ceil(this.height/z/size)+1);
      density=Math.min(density,Math.max(.25,Math.floor(Math.sqrt(limit/(workingSet*264*264*4))*2)/2));
      this._terrainDensity=density;needed.sort((a,b)=>a.d-b.d);const deadline=performance.now()+(this.quality==='performance'?2:4);let built=0;
      for(const p of needed){let chunk=this._chunks.get(this._chunkKey(p.x,p.y,density));if(!chunk&&built<2&&performance.now()<deadline){chunk=this._makeChunk(p.x,p.y,density);built++;}if(!chunk){for(const old of this._chunks.values())if(old.layer===this.layer&&old.x===p.x&&old.y===p.y&&(!chunk||Math.abs(old.density-density)<Math.abs(chunk.density-density)))chunk=old;}
       if(chunk){chunk.used=this._cacheTick;const a=chunk.canvas,scale=a.width/264;/* Crop gutters; adjacent chunks share exactly the same world boundary. */c.drawImage(a,4*scale,4*scale,256*scale,256*scale,p.x*size,p.y*size,size,size);}}
      if(this._chunkBytes>limit){const oldest=[...this._chunks.entries()].sort((a,b)=>a[1].used-b[1].used);for(const [key,item] of oldest){if(this._chunkBytes<=limit)break;this._chunks.delete(key);this._chunkBytes-=item.bytes;item.canvas.width=item.canvas.height=0;}}
    }
    _onscreen(p,margin=130){let x=this.camera.x+p.x*this.camera.zoom,y=this.camera.y+p.y*this.camera.zoom;return x>-margin&&y>-margin&&x<this.width+margin&&y<this.height+margin;}
    _visible(x,y){let xx=Math.floor(x),yy=Math.floor(y);return this.layer==='underground'?(this.game.undergroundVisible?.[yy]?.[xx]??true):(this.game.visible?.[yy]?.[xx]??true);}
    _explored(x,y){return this.game.explored?.[Math.floor(y)]?.[Math.floor(x)]??true;}
    _definition(e){try{return this.game.getDef(e)||{};}catch(_){let d=global.RTS_DATA||{};return(e.kind==='building'?d.buildings:e.kind==='machine'?d.machines:d.units)?.[e.type]||{};}}
    perceivedEntity(e){
      if(e?.owner===0||e.type!=='spy'||!e.disguised||e.exposed)return e;
      const hp=global.RTS_DATA?.units?.rifleman?.hp||115,maxHp=Math.round(hp*(1+((e.level||1)-1)*.3));
      return {...e,type:'rifleman',owner:e.coverOwner??0,disguised:false,maxHp,hp:maxHp*Math.max(0,Math.min(1,e.hp/(e.maxHp||e.hp))),task:{type:e.path?.length?'move':'idle'},path:[]};
    }
    aircraftAltitude(e){
      if(this._definition(e).domain!=='air')return 0;
      let landed=e.landed;
      if(typeof landed!=='boolean'){const atRunway=(this.game.entities||[]).some(b=>b.type==='airfield'&&b.owner===e.owner&&b.hp>0&&b.progress>=1&&Math.hypot(e.x-b.x,e.y-b.y)<3);landed=atRunway&&(e.returning||e.task?.type==='idle'||!(e.crew?.length));}
      return landed?0:24+Math.sin(this._time*2+e.id)*2;
    }
    _canDraw(e){if(!e||e.hp<=0||e.boardedIn!=null||e.garrisonedIn!=null)return false;if((e.layer||'surface')!==this.layer)return false;if(e.owner===0)return true;try{return this.game.isVisible(e);}catch(_){return this._visible(e.x,e.y);}}
    render(time=0){
      if(!this._ground)return;if(this._deviceDpr!==(global.devicePixelRatio||1))this.resize();this._cacheTick=(this._cacheTick||0)+1;this._patchTerrain();this._time=time;const c=this.ctx,g=this.game,z=this.camera.zoom;
      c.setTransform(this.dpr,0,0,this.dpr,0,0);c.fillStyle=this.layer==='surface'?'#9db7b3':'#273a37';c.fillRect(0,0,this.width,this.height);
      let sky=c.createRadialGradient(this.width*.47,this.height*.4,10,this.width*.5,this.height*.5,this.width*.7);sky.addColorStop(0,this.layer==='surface'?'#b1c5b6':'#40564b');sky.addColorStop(1,this.layer==='surface'?'#7b9da3':'#273a37');c.fillStyle=sky;c.fillRect(0,0,this.width,this.height);
      c.save();c.translate(this.camera.x,this.camera.y);c.scale(z,z);c.imageSmoothingEnabled=true;
      this._drawTerrain(c);
      if(this.layer==='surface')this._drawWater(c,time);else{this._drawUndergroundDeposits(c);this._drawTunnels(c);}
      this._drawFog(c);
      if(this.showRanges)this._drawRanges(c);
      let things=[],footprints=(g.entities||[]).filter(e=>e.kind==='building'&&e.hp>0).map(e=>({x:e.x,y:e.y,r:(Number(this._definition(e).size)||2)*.5+.1}));
      if(this.layer==='surface')for(let s of this._scenery){if(s.type!=='resource'&&g.tiles[Math.floor(s.y)]?.[Math.floor(s.x)]?.cleared)continue;if(s.type==='resource'&&!(g.tiles?.[Math.floor(s.y)]?.[Math.floor(s.x)]?.resource?.amount>0))continue;let p={x:(s.x-s.y)*26,y:(s.x+s.y)*14-s.z};if(!this._onscreen(p,100)||footprints.some(b=>Math.abs(s.x-b.x)<b.r&&Math.abs(s.y-b.y)<b.r))continue;things.push({scenery:s,depth:s.x+s.y,p});}
      for(let e of g.entities||[]){if(!this._canDraw(e))continue;const pos=e._interpolation&&global.OnlineMatch?global.OnlineMatch.position(e):e;let p=this._raw(pos.x,pos.y);if(!this._onscreen(p,180))continue;things.push({entity:e,depth:pos.x+pos.y+(e.kind==='building'?.05:0),p});}
      things.sort((a,b)=>a.depth-b.depth);
      for(let item of things){c.save();c.translate(item.p.x,item.p.y);if(item.scenery){let s=item.scenery;let seen=this._visible(s.x,s.y);c.globalAlpha=seen?1:this._explored(s.x,s.y)?.38:.09;this._drawScenery(c,s);}else this._drawEntity(c,item.entity);c.restore();}
      this._drawEffects(c,time);
      if(this.layer==='underground')this._drawCharges(c,time);
      if(this.placement)this._drawPlacement(c);if(this.wallPreview)this._drawWallPreview(c);if(this.areaPreview)this._drawAreaPreview(c);
      // Screen-space information remains crisp at every camera distance.
      c.restore();
      for(let item of things)if(item.entity)this._drawEntityInfo(c,item.entity,{x:this.camera.x+item.p.x*z,y:this.camera.y+item.p.y*z});
      this._drawVignette(c);
      if(this.dragRect){let r=this.dragRect;c.fillStyle='rgba(102,235,210,.08)';c.strokeStyle='#86eed7';c.lineWidth=1;c.fillRect(r.x,r.y,r.w,r.h);c.strokeRect(r.x+.5,r.y+.5,r.w,r.h);}
      if(this.layer==='underground'){c.save();c.fillStyle='#a3b89c';c.font='10px "IBM Plex Mono", monospace';c.letterSpacing='2px';c.fillText('SUBSURFACE // GEOLOGICAL OVERLAY',28,this.height-28);c.restore();}
    }
    _waterDepth(x,y){const tile=this.game.tiles[y]?.[x];if(Number.isFinite(tile?.depth))return Math.max(1,Math.min(4,Math.round(tile.depth)));for(let radius=1;radius<4;radius++)for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){const n=this.game.tiles[y+dy]?.[x+dx];if(n&&n.type!=='water'&&n.type!=='bridge')return radius;}return 4;}
    _drawWater(c,time){for(let q of this._water){if(q.r>.34||!this._onscreen(q,30)||!this._visible(q.tx,q.ty))continue;let wave=time*(q.ocean?.55:.8)+q.r*40,alpha=(Math.sin(wave)+1)*.08,drift=Math.sin(time*.4+q.r*9)*3,y=q.y+Math.sin(wave)*1.4;line(c,[[q.x-12+drift,y+.5],[q.x-5+drift,y-1],[q.x+3+drift,y-1.1],[q.x+9+drift,y-2]],`rgba(174,208,197,${alpha})`,q.ocean?1.2:.8);if(q.depth===1)line(c,[[q.x-7,y+4],[q.x+2,y+2.4]],`rgba(204,219,188,${alpha*.8})`,1);}}
    _drawFog(c){
      if(this.layer==='underground'||!this.game.visible)return;
      const g=this.game,z=this.camera.zoom,key=[this.camera.x,this.camera.y,z,this.width,this.height,this.dpr,this._seenTerrainChanges].join(','),old=this._fogCache;
      if(!old||old.key!==key||old.visible!==g.visible||old.explored!==g.explored){const a=old?.canvas||document.createElement('canvas'),density=this.dpr;a.width=Math.round(this.width*density);a.height=Math.round(this.height*density);const context=a.getContext('2d');context.setTransform(z*density,0,0,z*density,this.camera.x*density,this.camera.y*density);this._paintFog(context);this._fogCache={canvas:a,key,visible:g.visible,explored:g.explored};}
      c.drawImage(this._fogCache.canvas,-this.camera.x/z,-this.camera.y/z,this.width/z,this.height/z);
    }
    _paintFog(c){
      if(this.layer==='underground')return;const g=this.game;if(!g.visible)return;
      const z=this.camera.zoom,b=this._tileBounds((-this.camera.x-70)/z,(-this.camera.y-70)/z,(this.width-this.camera.x+70)/z,(this.height-this.camera.y+70)/z);
      const append=points=>{let area=0;for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];area+=a[0]*b[1]-b[0]*a[1];}if(area<0)points=points.slice().reverse();c.moveTo(points[0][0],points[0][1]);for(let i=1;i<points.length;i++)c.lineTo(points[i][0],points[i][1]);c.closePath();};
      // A single coverage path per visibility state eliminates the bright seams
      // caused by alpha-blending the antialiased edge of every individual tile.
      for(const explored of [false,true]){c.beginPath();for(let y=b.y0;y<=b.y1;y++)for(let x=b.x0;x<=b.x1;x++){
       if(g.visible[y]?.[x]||!!g.explored?.[y]?.[x]!==explored)continue;const p=this._raw(x+.5,y+.5);if(!this._onscreen(p,50))continue;const e=(g.tiles[y][x].elevation||0)*LIFT,q=this._tilePoly(x,y,e-.1),east=(g.tiles[y]?.[x+1]?.elevation||0)*LIFT,south=(g.tiles[y+1]?.[x]?.elevation||0)*LIFT;append(q);if(e>east)append([q[1],q[2],[q[2][0],q[2][1]+e-east],[q[1][0],q[1][1]+e-east]]);if(e>south)append([q[2],q[3],[q[3][0],q[3][1]+e-south],[q[2][0],q[2][1]+e-south]]);
      }c.fillStyle=explored?'rgba(30,55,55,.38)':'rgba(24,45,53,.70)';c.fill();}
    }
    _drawVignette(c){let gradient=c.createRadialGradient(this.width*.52,this.height*.44,this.height*.25,this.width*.5,this.height*.5,Math.max(this.width,this.height)*.65);gradient.addColorStop(0,'rgba(1,9,12,0)');gradient.addColorStop(1,'rgba(26,51,49,.07)');c.fillStyle=gradient;c.fillRect(0,0,this.width,this.height);}
    _sensorRadius(e){return (this._definition(e).undergroundSight||10)+((e.level||1)-1)*3;}
    _drawRanges(c){for(let id of this.selection){let e=this.game.getEntity?.(id);if(!e||e.hp<=0||e.progress<1||((e.layer||'surface')!==this.layer&&!(this.layer==='underground'&&['sensor','countermine'].includes(e.type))))continue;e=this.perceivedEntity(e);let d=this._definition(e),r=e.type==='sensor'?this._sensorRadius(e):d.range||d.sight||d.vision||7,p=this._raw(e.x,e.y);if(e.type==='seismicrover'&&e.patrolling){const hq=this.game._buildings(e.owner,'hq')[0];if(hq){r=10+(e.level-1)*4;p=this._raw(hq.x,hq.y,0);}}if(e.type==='countermine')r=8+(e.level-1)*2;c.save();c.setLineDash([5,7]);ellipse(c,p.x,p.y,r*26*Math.SQRT2,r*14*Math.SQRT2,'rgba(91,223,196,.025)','rgba(109,233,207,.30)',1/this.camera.zoom);c.restore();}}
    _treeSprite(variant,snow,size=1){const density=this._density(size);let key='tree'+variant+snow+':'+density;if(this._sprites.has(key))return this._sprites.get(key);let a=document.createElement('canvas');a.width=Math.ceil(100*density);a.height=Math.ceil(112*density);let c=a.getContext('2d');c.scale(a.width/100,a.height/112);c.translate(50,102);line(c,[[0,0],[-1,-30]],'#4e4a36',3.5);line(c,[[-1,-18],[-8,-29]],'#414333',2);
      let evergreen=variant<4,base=snow?'#8a9f85':['#47783e','#578546','#3b6c3c','#6b9149','#739247','#53813f'][variant];
      if(evergreen){for(let k=0;k<4;k++){let y=-13-k*12,w=22-k*4;poly(c,[[-w,y],[0,y-30],[w-3,y+2],[5,y+7]],shade(base,k*4-8),'rgba(15,38,26,.3)',.6);poly(c,[[-w,y],[0,y-30],[-2,y+2]],shade(base,k*4+3));if(snow)poly(c,[[-w+2,y-2],[0,y-30],[w-6,y-1],[4,y-4],[-3,y+1]],'#bdc7ba');}}
      else{for(let k=0;k<9;k++){let ang=k*2.4,r=9+hash(k,variant)*10,x=Math.cos(ang)*r*.8,y=-35+Math.sin(ang)*r*.6;ellipse(c,x,y,11+hash(k,4)*5,12+hash(k,8)*4,shade(base,hash(k,variant)*24-12));}ellipse(c,-5,-43,9,8,shade(base,18));}
      for(let i=0;i<55;i++){const x=(hash(i,variant,7)-.5)*38,y=-20-hash(i,variant,8)*41;if(evergreen&&Math.abs(x)>(65+y)*.55+3)continue;ellipse(c,x,y,1.4+hash(i,7)*1.6,.7+hash(i,5)*1.3,snow?shade('#d7e0cf',hash(i,9)*25-12):shade(base,hash(i,variant,12)*32+4));}
      line(c,[[-1,-2],[-1,-18]],'#8b7952',.8);this._sprites.set(key,a);let bytes=0;for(const item of this._sprites.values())bytes+=item.width*item.height*4;const limit=(this.quality==='performance'?8:32)*1024*1024;while(bytes>limit&&this._sprites.size>1){const first=this._sprites.keys().next().value,item=this._sprites.get(first);this._sprites.delete(first);bytes-=item.width*item.height*4;}return a;}
    _drawScenery(c,s){if(s.type==='tree'){let a=this._treeSprite(s.variant,s.snow,s.size);c.drawImage(a,-50*s.size,-102*s.size,100*s.size,112*s.size);}else if(s.type==='rock'){
        let k=s.size;poly(c,[[-15*k,1],[-9*k,-12*k],[3*k,-19*k],[14*k,-9*k],[17*k,3],[1,9*k]],'#56645c','#293d33',.8);poly(c,[[-15*k,1],[-9*k,-12*k],[3*k,-19*k],[2,-3*k]],'#6c786a');poly(c,[[3*k,-19*k],[14*k,-9*k],[17*k,3],[2,-3*k]],'#48574e');line(c,[[-9*k,-12*k],[3*k,-19*k],[14*k,-9*k]],'#89917d',.8);
      }else if(s.type==='resource'){
        if(s.resource==='crystal'){for(let i=0;i<4;i++){let x=(i-1.5)*6,y=(i%2)*3;poly(c,[[x-4,y],[x-3,y-12-i%2*7],[x+1,y-18-i%2*5],[x+5,y-4],[x+2,y+3]],'#60858a','#94cfca',.6);poly(c,[[x+1,y-18-i%2*5],[x+5,y-4],[x+2,y+3],[x,y-2]],'#3e5f65');}}
        else if(s.resource==='fuel'){ellipse(c,0,0,17,7,'#272e25','#576544',1);ellipse(c,-4,-2,8,3,'#3e4230');line(c,[[-8,1],[6,-2]],'#73764e',1.5);}
        else{for(let i=0;i<3;i++){let x=(i-1)*9,y=i%2*4;poly(c,[[x-9,y],[x-6,y-8],[x+2,y-12],[x+8,y-3],[x+5,y+4]],i%2?'#807d64':'#686d5c','#9b9980',.5);}}
      }}
    _box(c,x,y,w,d,h,z,base,roof){
      let q=[proj(x-w/2,y-d/2,z),proj(x+w/2,y-d/2,z),proj(x+w/2,y+d/2,z),proj(x-w/2,y+d/2,z)],t=q.map(p=>[p[0],p[1]-h]);
      const face=c.createLinearGradient(t[3][0],t[3][1],q[2][0],q[2][1]);face.addColorStop(0,shade(base,7));face.addColorStop(.7,shade(base,-8));face.addColorStop(1,shade(base,-22));
      poly(c,[q[3],q[2],t[2],t[3]],face,'rgba(10,24,25,.7)',.7);poly(c,[q[2],q[1],t[1],t[2]],shade(base,-25),'rgba(10,24,25,.8)',.7);poly(c,t,roof||shade(base,13),'rgba(221,230,206,.55)',.8);
      if(h>12&&w>.45&&d>.45){for(let i=1;i<=3;i++){const a=i/4;line(c,[[q[3][0]+(q[2][0]-q[3][0])*a,q[3][1]+(q[2][1]-q[3][1])*a-2],[t[3][0]+(t[2][0]-t[3][0])*a,t[3][1]+(t[2][1]-t[3][1])*a+2]],shade(base,-17),.6);}line(c,[[q[3][0],q[3][1]-4],[q[2][0],q[2][1]-4],[q[1][0],q[1][1]-4]],shade(base,-29),2);for(const v of [t[1],t[2],t[3]]){c.fillStyle=shade(base,28);c.fillRect(v[0]-1,v[1]+3,1,1.5);}line(c,[t[3],t[0],t[1]],'#d3d5b4',.7);}
      if(h>15&&w>.6&&d>.6){for(let n=0;n<12;n++){const a=hash(n,x+w,2),b=hash(n,y+d,3),v=proj(x+(a-.5)*w*.9,y+(b-.5)*d*.9,z+h+.1);line(c,[[v[0],v[1]],[v[0]+2,v[1]-.4]],shade(roof||base,hash(n,h)*18-9),.5);}const vent=proj(x-w*.22,y-d*.2,z+h+.4);for(let n=0;n<4;n++)line(c,[[vent[0]+n*1.5,vent[1]+n*.8],[vent[0]+n*1.5+5,vent[1]+n*.8-2.5]],shade(base,-25),.75);}
      return{q,t};
    }
    _pad(c,size,color){poly(c,[proj(-size/2,-size/2,1),proj(size/2,-size/2,1),proj(size/2,size/2,1),proj(-size/2,size/2,1)],'#4b5650','#6a776b',1);let s=size/2;for(let k=-s+.1;k<s;k+=.35){line(c,[proj(k,s-.04,1),proj(k+.13,s-.04,1)],color,2.1);} }
    _motion(e){
      const map=this._motionCache||(this._motionCache=new Map()),now=this._time||0;let m=map.get(e.id);
      if(!m){m={x:e.x,y:e.y,time:now,changedAt:now,velocity:0,phase:0,activeUntil:-1,heading:e.angle||0};map.set(e.id,m);if(map.size>2048)map.delete(map.keys().next().value);}
      const dt=Math.max(0,Math.min(.1,now-m.time)),dx=e.x-m.x,dy=e.y-m.y,d=Math.hypot(dx,dy);if(d>.002&&d<4){m.velocity=Math.min(8,d/Math.max(.016,now-m.changedAt));m.changedAt=now;m.activeUntil=now+.3;m.heading=Math.atan2(dy,dx);}if(now<m.activeUntil)m.phase+=m.velocity*dt*7;m.x=e.x;m.y=e.y;m.time=now;
      return {moving:now<m.activeUntil,phase:m.phase,heading:m.heading};
    }
    _drawEntity(c,e){
      e=this.perceivedEntity(e);
      let selected=this.selection.has(e.id),hover=this.hoverId===e.id,friend=e.owner===0||e.disguised&&!e.exposed,color=FACTIONS[e.owner]||RED,d=this._definition(e),construction=e.kind==='building'&&e.progress<1;
      if(e.kind==='building'){
        let size=Number(d.size)||2;if(e.type!=='wall'){const h=e.type==='hq'?65:35,foot=[proj(-size/2,-size/2),proj(size/2,-size/2),proj(size/2,size/2),proj(-size/2,size/2)];poly(c,[foot[1],foot[2],foot[3],[foot[3][0]+h*.65,foot[3][1]+h*.24],[foot[2][0]+h*.65,foot[2][1]+h*.24],[foot[1][0]+h*.65,foot[1][1]+h*.24]],'rgba(30,43,39,.18)');ellipse(c,1,3,24*size,10*size,'rgba(27,38,31,.17)');}else{poly(c,[proj(-.5,-.5),proj(.5,-.5),proj(.5,.5),proj(-.5,.5)].map(([x,y])=>[x+9,y+4]),'rgba(30,43,39,.22)');}
        if(selected||hover)this._selection(c,size*.6,color,true);
        if(construction){this._drawConstruction(c,e,d,color);return;}this._drawBuilding(c,e,d,color);if(e.type==='hq')this._drawHQGun(c,e,color);
      }else if(e.kind==='machine'){
        if(selected||hover)this._selection(c,d.domain==='sea'?1.25:.8,color);c.save();this._recoil(c,e,2.5);this._drawMachine(c,e,d,color);c.restore();
      }else{
        if(selected||hover)this._selection(c,.4,color);c.save();this._recoil(c,e,1.4);this._drawUnit(c,e,d,color);c.restore();
      }
      if(selected&&e.task&&['move','attack','gather','build','repair','roam','staff'].includes(e.task.type)&&e.task.x!=null){let t=this._raw(e.task.x,e.task.y),p=this._raw(e.x,e.y);c.save();c.setLineDash([3,5]);line(c,[[0,0],[t.x-p.x,t.y-p.y]],'rgba(122,236,206,.27)',.8);c.restore();ellipse(c,t.x-p.x,t.y-p.y,5,2.7,null,'rgba(122,236,206,.6)',1);}
    }
    _selection(c,size,color,square=false){if(square){let q=[proj(-size,-size,2),proj(size,-size,2),proj(size,size,2),proj(-size,size,2)];poly(c,q,null,color,1.25);for(let p of q)ellipse(c,p[0],p[1],2.1,1.3,color);}else{ellipse(c,0,1,26*size,14*size,color===BLUE?'rgba(91,230,199,.08)':'rgba(255,111,82,.08)',color,1.1);}}
    _drawBuilding(c,e,d,col){
      const live=['gate','heavygate','turret'].includes(e.type)||e.garrisonId;
      if(live)this._paintBuilding(c,e,d,col);
      else{
        const density=this._density(),links=e.type==='wall'?JSON.stringify(this._wallConnections(e)):'',key=[e.type,e.owner,e.level,col,density,e.perch,links].join(':'),cache=this._buildingSprites;
        let item=cache.get(key);if(!item){const half=Math.max(70,(d.size||2)*30+12),top=160,bottom=Math.max(55,(d.size||2)*16+10),a=document.createElement('canvas');a.width=Math.ceil(half*2*density);a.height=Math.ceil((top+bottom)*density);const context=a.getContext('2d');context.setTransform(density,0,0,density,half*density,top*density);this._paintBuilding(context,e,d,col);item={canvas:a,half,top,bottom,bytes:a.width*a.height*4};cache.set(key,item);this._buildingBytes+=item.bytes;
          const limit=(this.quality==='performance'?12:32)*1024*1024;while(this._buildingBytes>limit&&cache.size>1){const first=cache.keys().next().value,discard=cache.get(first);cache.delete(first);this._buildingBytes-=discard.bytes;}}
        else{cache.delete(key);cache.set(key,item);}c.drawImage(item.canvas,-item.half,-item.top,item.half*2,item.top+item.bottom);
      }
      this._buildingActivity(c,e,d,col);
    }
    _paintBuilding(c,e,d,col){
      if(e.type==='wall'){this._drawFortification(c,e,col);return;}
      this._pad(c,(d.size||2)+.12,col);
      if(['gate','heavygate'].includes(e.type)){this._drawFortification(c,e,col);return;}
      this._architecture(c,e,d,col);
    }
    _architecture(c,e,d,col){
      // Each tier is a complete structure. Roofs are created once at the actual
      // wall height; annexes and machinery have explicit, grounded supports.
      const l=e.level||1,type=e.type,concrete='#b9b5a1',trim='#d9d5bd',steel='#637565',roof='#708579',glass='#365c65',jobs=[];
      const add=(x,y,draw)=>jobs.push({depth:x+y,draw});
      const box=(x,y,w,dep,h,z=2,base=concrete,top=trim)=>this._box(c,x,y,w,dep,h,z,base,top);
      const pane=(x,y,z,w,h,side=false,color=glass)=>{const p=side?[proj(x,y-w/2,z),proj(x,y+w/2,z),proj(x,y+w/2,z+h),proj(x,y-w/2,z+h)]:[proj(x-w/2,y,z),proj(x+w/2,y,z),proj(x+w/2,y,z+h),proj(x-w/2,y,z+h)];poly(c,p,color,'#9ba99a',.65);line(c,[p[3],p[2]],'#c4d5cb',.7);};
      const vent=(x,y,z,w=.32,dep=.4)=>{box(x,y,w,dep,4,z,steel,'#95a492');for(let k=0;k<4;k++)line(c,[proj(x-w*.4,y-dep*.35+k*dep*.23,z+4.2),proj(x+w*.4,y-dep*.35+k*dep*.23,z+4.2)],'#31483c',.7);};
      const shell=(x,y,w,dep,h,style='flat',bay=false,base=concrete)=>add(x,y,()=>{
        box(x,y,w,dep,3,1,'#7d8777','#b4bba4');box(x,y,w,dep,h,4,base,trim);const z=h+4;
        // Front door and windows sit on the wall plane, not in screen space.
        const front=y+dep/2+.006,doorW=bay?w*.56:Math.min(.32,w*.3),doorH=bay?Math.min(18,h-3):Math.min(13,h-2);
        pane(x,front,4,doorW,doorH,false,'#34453c');for(let a=6;a<doorH+4;a+=3)line(c,[proj(x-doorW*.48,front,a),proj(x+doorW*.48,front,a)],bay?'#87927f':'#526457',.65);
        if(!bay&&w>.7)for(const dx of [-w*.31,w*.31])pane(x+dx,front,Math.min(h-4,13),w*.17,5);
        for(let j=0;j<Math.floor(dep/.45);j++)pane(x+w/2+.006,y-dep*.3+j*.43,Math.min(h-4,13),.2,5,true);
        line(c,[proj(x-w*.44,front,h*.72),proj(x+w*.44,front,h*.72)],col,1.5);
        box(x,front+.1,doorW+.12,.2,2,1,'#9ca48f','#d0d1b7');const lamp=proj(x+doorW*.65,front,doorH+5);ellipse(c,lamp[0],lamp[1],1.3,1,'#ffe1a5');
        if(style==='gable'){
          const a=x-w*.53,b=x+w*.53,back=y-dep*.53,f=y+dep*.53,ridge=z+8;
          poly(c,[proj(a,f,z),proj(b,f,z),proj(x,f,ridge)],shade(base,-9),trim,.7);
          poly(c,[proj(a,back,z),proj(x,back,ridge),proj(x,f,ridge),proj(a,f,z)],'#819284','#afbb9e',.7);
          poly(c,[proj(x,back,ridge),proj(b,back,z),proj(b,f,z),proj(x,f,ridge)],'#526d60','#a4b69f',.7);
          for(let k=back+.12;k<f;k+=.22)line(c,[proj(a,k,z+.4),proj(x,k,ridge+.4),proj(b,k,z+.4)],'#a0b09a',.65);
          if(l>=2){box(x,y-dep*.25,.2,.22,5,ridge-1,steel,trim);if(l===3)line(c,[proj(x,y-dep*.25,ridge+4),proj(x,y-dep*.25,ridge+13)],'#bfcab3',1);}
        }else{
          box(x,y,w+.05,dep+.05,2,z,steel,'#b1b9a2');
          for(const k of [-1,1]){box(x+k*w*.48,y,.045,dep,2,z+2,trim,trim);box(x,y+k*dep*.48,w,.045,2,z+2,trim,trim);}
          if(l>=2)vent(x-w*.22,y-dep*.18,z+2);if(l>=3)vent(x+w*.2,y-dep*.18,z+2);
        }
      });
      const crate=(x,y,w=.28,h=7)=>add(x,y,()=>{box(x,y,w,w,h,2,'#889172','#bcc09e');for(const side of [-.25,.25])line(c,[proj(x-w*.5,y+side*w,2+h),proj(x+w*.5,y+side*w,2+h)],'#4e634d',.9);});
      const cylinder=(x,y,h,r=.25,base='#a5af9a')=>add(x,y,()=>{const p=proj(x,y,3),rx=r*30,ry=r*15;ellipse(c,p[0],p[1],rx+2,ry+1,'#657a68');const gr=c.createLinearGradient(p[0]-rx,0,p[0]+rx,0);gr.addColorStop(0,shade(base,-20));gr.addColorStop(.35,shade(base,18));gr.addColorStop(1,shade(base,-13));c.fillStyle=gr;c.fillRect(p[0]-rx,p[1]-h,rx*2,h);ellipse(c,p[0],p[1]-h,rx,ry,trim,'#798b74',.7);for(const z of [h*.2,h*.8])ellipse(c,p[0],p[1]-z,rx,ry,null,'#738571',.7);});
      const crane=(x1,x2,y,z)=>add((x1+x2)/2,y,()=>{for(const x of [x1,x2]){box(x,y,.14,.22,z-3,3,'#b9a465','#d6c586');line(c,[proj(x-.06,y,8),proj(x+.06,y,z-3)],'#6c7054',.7);}box((x1+x2)/2,y,x2-x1+.2,.22,5,z,'#c7b574','#e1d397');for(let x=x1;x<x2-.15;x+=.25)line(c,[proj(x,y+.12,z+1),proj(x+.16,y+.12,z+4)],'#797650',.7);});
      switch(type){
        case 'hq':{
          const h=48+(l-1)*4;shell(0,-.16,1.52,1.5,h);shell(-1.03,.1,.5,1.58,23+(l-1)*2);shell(1.03,.1,.5,1.58,23+(l-1)*2);
          add(0,-.1,()=>box(0,0,1.05,.85,6,h+6,steel,'#a3b29a'));
          if(l>=2)for(const x of [-1.03,1.03])add(x,.93,()=>box(x,.93,.5,.12,18,2,'#84917b',trim));
          break;
        }
        case 'barracks':case 'housing':{
          const count=type==='housing'?3:2,w=type==='housing'?.49:.72;
          for(let n=0;n<count;n++)shell((n-(count-1)/2)*(w+.1),-.08,w,1.48,16+(l-1)*5,'gable');
          if(l>=2)crate(-.7,.83,.23,5);if(l===3)crate(.7,.83,.23,8);add(-.88,.8,()=>{line(c,[proj(-.88,.8,2),proj(-.88,.8,31)],trim,1.3);const p=proj(-.88,.8,31);poly(c,[p,[p[0]+12,p[1]+3],[p[0],p[1]+8]],col);});break;
        }
        case 'factory':
          shell(-.15,-.25,2.15,1.8,28+(l-1)*4,'gable',true);shell(1.07,-.4,.42,1.45,18+(l-1)*2);
          for(let i=0;i<l;i++)crate(-.9+i*.38,1.12,.3,7);crane(-.5,1.15,.92,34+l*3);break;
        case 'depot':
          shell(-.22,-.18,1.12,1.48,18+(l-1)*3,'gable',true);for(let n=0;n<2+l;n++)crate(.58,(n-1.5)*.37,.32,9+(n%2)*3);break;
        case 'armory':
          shell(0,-.1,1.42,1.36,19+(l-1)*3,'flat',true,'#9ca68d');for(const x of [-.83,.83])add(x,.18,()=>box(x,.18,.16,1.38,13+l*3,2,'#8e9a82',trim));
          for(let k=0;k<l+1;k++)crate(-.45+k*.31,.82,.23,5);break;
        case 'lab':case 'crystalworks':
          shell(-.1,-.16,1.45,1.25,22+(l-1)*3,'flat',false,'#c0c8bb');shell(.57,.67,.48,.44,13+(l-1)*2,'flat',type==='crystalworks');
          if(type==='crystalworks'){for(let k=0;k<l+1;k++)crate(-.65+k*.28,.72,.22,6);add(-.1,-.16,()=>{const z=28+(l-1)*3;box(-.1,-.16,.54,.45,6,z,'#648b89','#9ab8ac');for(const x of [-.25,0,.15])pane(x,.07,z+1,.08,3,false,'#a6d1c6');});}
          else add(-.57,.65,()=>box(-.57,.65,.4,.35,12,2,'#859785','#becab6'));break;
        case 'power':
          shell(-.23,-.24,1.25,1.15,19+(l-1)*2,'gable',true);for(let k=0;k<l+1;k++){const x=-.64+k*.38;add(x,.65,()=>{box(x,.65,.27,.38,9,2,steel,'#bbc5aa');for(const y of [.54,.76]){const p=proj(x,y,13);line(c,[p,[p[0],p[1]-9]],'#c9bea0',1.6);for(let z=3;z<9;z+=3)ellipse(c,p[0],p[1]-z,2,1,'#d0d8bd');}});}add(.67,-.48,()=>{box(.67,-.48,.23,.23,34+l*3,2,'#7e8a74',trim);});break;
        case 'refinery':
          cylinder(-.46,-.4,26+(l-1)*3,.3);cylinder(.43,-.4,30+(l-1)*7,.29);shell(-.15,.57,1.35,.42,11+(l-1)*2,'flat',true);
          add(.15,.35,()=>{line(c,[proj(-.46,.04,9),proj(.43,.04,9),proj(.43,-.4,9),proj(.43,-.4,26)],'#baa56e',3);if(l>=2){for(let z=8;z<34;z+=7)line(c,[proj(.72,-.4,z),proj(.72,-.15,z)],'#c8ccae',.9);line(c,[proj(.72,-.4,3),proj(.72,-.4,35)],'#b4bca0',1);}});break;
        case 'smelter':
          shell(-.12,-.04,1.38,1.3,20+(l-1)*3,'flat',true,'#aa9e82');for(const x of [-.55,.45])add(x,-.53,()=>box(x,-.53,.23,.23,35+l*5,2,'#817e68','#bdbba1'));
          add(0,.64,()=>pane(0,.64,6,.47,7,false,'#c87936'));for(let k=0;k<l+1;k++)crate(-.55+k*.36,.83,.25,4);break;
        case 'mine':
          shell(-.58,.05,.55,1.15,16+(l-1)*3,'gable');add(.32,0,()=>{const p=proj(.32,0,2);ellipse(c,p[0],p[1],17,9,'#263c35','#9fa88d',3);});
          crane(-.05,.73,-.1,39+l*5);add(.35,-.09,()=>{for(const z of [9,23]){line(c,[proj(-.05,-.1,z),proj(.73,-.1,z+14)],'#a3aa88',1.5);line(c,[proj(.73,-.1,z),proj(-.05,-.1,z+14)],'#a3aa88',1.5);}line(c,[proj(.32,-.1,44+l*5),proj(.32,-.1,3)],'#514e3b',1.1);});for(let k=0;k<l;k++)crate(-.1+k*.3,.77,.24,5);break;
        case 'radar':case 'uplink':
          shell(-.18,.05,1.25,1.23,18+(l-1)*2,'flat');add(0,-.1,()=>box(0,-.1,.28,.28,12,24+(l-1)*2,'#809583','#bdcbb4'));
          for(let k=0;k<l;k++)add(.7,-.5+k*.45,()=>box(.7,-.5+k*.45,.28,.32,12,2,steel,trim));break;
        case 'countermine':
          shell(-.45,-.2,.55,1.15,17+(l-1)*2,'flat');add(.34,.2,()=>{box(.34,.2,.88,1.12,9+l*2,2,'#8b9a83',trim);const p=proj(.34,.2,12+l*2);ellipse(c,p[0],p[1],12,6,'#425c50','#becbb0',2);for(let i=0;i<l+3;i++){const a=i*Math.PI*2/(l+3);line(c,[[p[0]+Math.cos(a)*5,p[1]+Math.sin(a)*2.5],[p[0]+Math.cos(a)*10,p[1]+Math.sin(a)*5]],'#b1c0a5',1.4);}});break;
        case 'airfield':{
          poly(c,[proj(-.45,-1.85,2),proj(.45,-1.85,2),proj(.45,1.85,2),proj(-.45,1.85,2)],'#4e5c55','#c9ccb2',1);
          for(let y=-1.65;y<1.8;y+=.45)line(c,[proj(0,y,3),proj(0,y+.22,3)],'#e4e2c8',1.7);
          for(const y of [-1.65,1.65])for(const x of [-.28,-.1,.1,.28])line(c,[proj(x,y,3),proj(x,y+.15,3)],trim,1.4);
          shell(-1.12,.15,1.02,1.9,20+(l-1)*3,'gable',true);shell(1.22,-1.05,.55,.65,27+(l-1)*5,'flat');
          add(1.22,-1.05,()=>{const z=33+(l-1)*5;box(1.22,-1.05,.7,.8,7,z,steel,trim);pane(1.22,-.644,z+1,.55,4);pane(1.575,-1.05,z+1,.58,4,true);});for(let i=0;i<l;i++)cylinder(1.23,.1+i*.5,12,.2);break;
        }
        case 'shipyard':
          poly(c,[proj(-.1,-1.2,2),proj(1.15,-1.2,2),proj(1.15,1.3,2),proj(-.1,1.3,2)],'#426c70','#83a6a0',1);
          shell(-.75,-.25,.78,1.72,21+(l-1)*3,'gable',true);for(const x of [.02,1.12])add(x,.15,()=>box(x,.15,.18,2.7,4,2,'#a4a993',trim));crane(.03,1.1,-.35,42+l*5);
          for(let k=0;k<l;k++)crate(-.75, .86+k*.13,.24,5);break;
        case 'minibeacon':case 'sensor':
          box(0,0,.59,.59,9+l*2,2,'#91a38b',trim);for(const x of [-.35,.35])box(x,0,.14,.7,3,2,steel,trim);
          box(0,0,.08,.08,25+l*4,11+l*2,steel,trim);for(const dx of [-.23,.23])line(c,[proj(dx,.18,4),proj(0,0,25)],'#a4b7a0',1.4);
          if(type==='minibeacon')for(const x of [-.33,.33]){poly(c,[proj(x-.13,-.27,16),proj(x+.13,-.27,16),proj(x+.13,.27,13),proj(x-.13,.27,13)],'#3b5d68','#a9c5bc',.6);}
          else {const p=proj(0,0,36+l*6);ellipse(c,p[0],p[1],7+l,3,'#a6b99f',col,1);}break;
        case 'turret':{
          box(0,0,.85,.85,11+l*2,2,'#a7ad96',trim);const z=15+l*2,p=proj(0,0,z),a=e.angle||0,dx=(Math.cos(a)-Math.sin(a))*.8,dy=(Math.cos(a)+Math.sin(a))*.43;
          ellipse(c,p[0],p[1],12,6,steel,trim,1);box(0,0,.43,.42,7,z,'#7d9275','#b5c2a4');const kick=Math.max(0,1-(this.game.time-(e.firedAt??-10))/.18)*3;
          for(const side of l===1?[0]:[-1,1]){const x=-dy*side*3,y=-z-5+dx*side*3;line(c,[[x,y],[x+dx*(25-kick),y+dy*(25-kick)]],'#2e4536',4);line(c,[[x,y-1],[x+dx*(25-kick),y+dy*(25-kick)-1]],trim,1.3);}if(l===3){box(-.25,-.2,.22,.22,5,z+7,steel,trim);}break;
        }
      }
      jobs.sort((a,b)=>a.depth-b.depth);for(const job of jobs)job.draw();
      if(l>1){const p=proj((d.size||2)*.37,(d.size||2)*.37,3);for(let k=0;k<l-1;k++)line(c,[[p[0]-5,p[1]-3-k*4],[p[0],p[1]-6-k*4],[p[0]+5,p[1]-3-k*4]],'#dec887',1.4);}
    }
    _buildingActivity(c,e,d,col){
      const l=e.level||1,type=e.type,t=this._time||0;
      if(['radar','uplink'].includes(type)){
        const p=proj(0,-.1,37+(l-1)*2),a=t*.32+(e.id||0)*.1,w=type==='uplink'?19+l*2:15+l*2;
        c.save();c.translate(p[0],p[1]);c.rotate(Math.sin(a)*.22-.3);ellipse(c,0,-3,w,9,'#c8d3bd','#eff0da',1);ellipse(c,0,-3,w-3,6,'#8ba89b','#627f74',.7);for(let x=-w+5;x<w;x+=6)line(c,[[x,-8],[x,3]],'#c0d0ba',.6);line(c,[[0,-3],[5,-20]],'#d3dcc8',1.5);ellipse(c,5,-20,2,1.5,col);c.restore();
      }
      if(type==='mine'){const p=proj(.32,-.1,44+l*5),a=t*1.4;c.save();c.translate(...p);ellipse(c,0,0,9,7,'#364e40','#c3b67e',2);for(let k=0;k<4;k++){const ang=a+k*Math.PI/2;line(c,[[0,0],[Math.cos(ang)*8,Math.sin(ang)*6]],'#b2bda1',1.4);}c.restore();}
      if(['factory','shipyard'].includes(type)&&e.queue?.length){const ship=type==='shipyard',x=ship?.56+Math.sin(t*.7)*.3:.3+Math.sin(t*.65)*.5,y=ship?-.35:.92,z=ship?42+l*5:34+l*3;this._box(c,x,y,.2,.26,5,z-5,'#657360','#b9c0a2');const a=proj(x,y,z-5),b=proj(x,y,12+Math.sin(t*.9)*3);line(c,[a,b],'#414b3a',1);line(c,[b,[b[0]+3,b[1]+3],[b[0]+5,b[1]]],'#c0bd91',1.5);}
      if(type==='shipyard')for(let i=0;i<3;i++){const y=-.85+((t*.15+i*.65)%1.95);c.save();c.globalAlpha=.28;line(c,[proj(.22,y,3),proj(.9,y+.04,3)],'#d2e2d2',.7);c.restore();}
      if(type==='power')this._smoke(c,.67,-.48,38+l*3,e.id||0);if(type==='smelter')for(const x of [-.55,.45])this._smoke(c,x,-.53,39+l*5,(e.id||0)+x);
      if(type==='sensor'){c.save();c.globalAlpha=.13*(1-(t*.4%1));const v=t*.4%1;ellipse(c,0,0,12+v*22,6+v*11,null,col,1);c.restore();}
      if(type==='airfield')for(let i=0;i<8;i++){const p=proj(.57,-1.65+i*.46,3);ellipse(c,p[0],p[1],1.4,1,Math.floor(t*2)%8===i?'#fff1bb':'#9dbba3');}
      if(e.queue?.length){const p=proj((d.size||2)*.3,(d.size||2)*.35,13);ellipse(c,p[0],p[1],1.7,1.3,Math.sin(t*4)>0?'#ffd58e':'#77896e');}
    }

    _wallConnections(e){
      const revision=this.game._pathRevision,entities=this.game.entities;if(!this._wallLinks||this._wallLinks.revision!==revision||this._wallLinks.entities!==entities||this._wallLinks.length!==entities.length)this._wallLinks={revision,entities,length:entities.length,links:new Map(),walls:entities.filter(b=>b.hp>0&&['wall','gate','heavygate'].includes(b.type))};
      const key=[e.id,e.x,e.y,e.owner].join(':'),cache=this._wallLinks;if(!cache.links.has(key))cache.links.set(key,[[-1,0],[1,0],[0,-1],[0,1]].filter(([dx,dy])=>cache.walls.some(b=>b.id!==e.id&&b.owner===e.owner&&Math.abs(b.x-e.x-dx)<this._definition(b).size*.5+.01&&Math.abs(b.y-e.y-dy)<this._definition(b).size*.5+.01)));return cache.links.get(key);
    }
    _drawFortification(c,e,col){
      const height=20+(e.level-1)*7,arms=this._wallConnections(e),axis=e.gateAxis?e.gateAxis==='y':arms.some(([dx,dy])=>dy!==0),wall=e.type==='wall';
      if(wall){
        const links=arms.length?arms:[[-1,0],[1,0]];
        for(const [dx,dy] of links){this._box(c,dx*.26,dy*.26,dx?.53:.52,dy?.53:.52,3,0,'#828c78','#adb29a');this._box(c,dx*.26,dy*.26,dx?.53:.34,dy?.53:.34,height,2,'#afa98f','#e1d9b7');this._box(c,dx*.26,dy*.26,dx?.55:.41,dy?.55:.41,3,height+2,'#9b9c83','#eee7ca');for(let row=6;row<height;row+=7)line(c,[proj(dx*.04-dy*.17,dy*.04+dx*.17,row),proj(dx*.51-dy*.17,dy*.51+dx*.17,row)],'#797e6b',.7);}
        this._box(c,0,0,.41,.41,height+3,2,'#b1ad94','#e8e1c4');
        if(e.level>1)for(const [dx,dy] of links)this._box(c,dx*.22,dy*.22,.21,.21,height*.65,2,'#788b7c','#b4bea5');
        if(e.level>=3&&!e.perch){for(const [dx,dy] of links){line(c,[proj(0,0,height+9),proj(dx*.5,dy*.5,height+9)],'#526557',1);const p=proj(dx*.3,dy*.3,height+9);line(c,[[p[0]-3,p[1]-3],[p[0]+3,p[1]+3]],'#526557',.8);}}
        if(e.perch){this._box(c,0,0,.92,.92,4,height+5,'#6e8171','#c2bb8f');for(const [x,y] of [[-.42,-.42],[.42,-.42],[-.42,.42],[.42,.42]])line(c,[proj(x,y,height+9),proj(x,y,height+23)],'#bbc5ad',1.4);line(c,[proj(-.42,-.42,height+23),proj(.42,-.42,height+23),proj(.42,.42,height+23)],'#d8d7b9',1.5);for(const x of [-.15,.15])line(c,[proj(x,.5,2),proj(x,.5,height+9)],'#6b7662',1.5);for(let z=4;z<height+9;z+=5)line(c,[proj(-.15,.5,z),proj(.15,.5,z)],'#c4bf99',1.2);const u=this.game.getEntity(e.garrisonId);if(u&&u.hp>0){c.save();c.translate(0,-height-10);this._drawUnit(c,u,this.game.getDef(u),col);c.restore();}line(c,[proj(-.42,.42,height+23),proj(.42,.42,height+23)],'#d8d7b9',1.5);}
      }else{
        const large=e.type==='heavygate',half=large?1.35:.43,h=large?height+26:height+9,span=large?2.7:.86,depth=large?.55:.3;
        for(const k of [-half,half]){this._box(c,axis?0:k,axis?k:0,depth,depth,h,2,'#a5ad99','#e1ddc0');const p=proj(axis?0:k,axis?k:0,h+5);ellipse(c,p[0],p[1],2,2,col);}
        this._box(c,0,0,axis?depth:span,axis?span:depth,5,h+2,'#7b8e7e','#dbdcbf');
        const near=this.game.entities.some(u=>u.hp>0&&u.owner===e.owner&&u.kind!=='building'&&u.layer==='surface'&&!u.boardedIn&&!u.garrisonedIn&&Math.hypot(u.x-e.x,u.y-e.y)<(large?3:1.6));
        const states=this._gateMotion||(this._gateMotion=new Map()),key=e.id??'preview',now=this._time||0;let state=states.get(key);if(!state){state={open:near?1:0,time:now};states.set(key,state);if(states.size>512)states.delete(states.keys().next().value);}const dt=Math.max(0,Math.min(.1,now-state.time));state.open+=(Number(near)-state.open)*Math.min(1,dt*6);state.time=now;
        const gateHeight=3+(h-8)*(1-state.open),bottom=h-3-gateHeight;this._box(c,0,0,axis?.2:span-.35,axis?span-.35:.2,gateHeight,bottom,'#647f71','#b6c9ab');
        for(let k=-half+.35;k<half;k+=.3)line(c,[proj(axis?0:k,axis?k:0,bottom+1),proj(axis?0:k,axis?k:0,h-4)],'#b4bfa5',1.2);
        for(const k of [-half,half])for(let z=8;z<h-2;z+=9)line(c,[proj((axis?.3:k)-.1,(axis?k:.3),z),proj((axis?.3:k)+.1,(axis?k:.3),z+3)],'#e0bf72',2);
      }
    }
    _patchTerrain(){const changes=this.game._terrainChanges||[],c=this._ground.getContext('2d');for(;this._seenTerrainChanges<changes.length;this._seenTerrainChanges++){const p=changes[this._seenTerrainChanges],x=Math.floor(p.x),y=Math.floor(p.y),q=this._raw(x+.5,y+.5);this._paintTerrainTile(c,null,x,y);for(const [key,item] of this._chunks){if(item.layer==='surface'&&q.x+65>=item.x*256&&q.x-65<=(item.x+1)*256&&q.y+100>=item.y*256&&q.y-100<=(item.y+1)*256){this._chunks.delete(key);this._chunkBytes-=item.bytes;}}}}
    _drawWallPreview(c){for(const p of this.wallPreview.cells){const point=this._raw(p.x,p.y),col=p.existing?'#b3c6bb':p.ok&&this.wallPreview.quote?.affordable?'#8ae4ad':'#ff947f';c.save();c.translate(point.x,point.y);c.globalAlpha=.55;this._box(c,0,0,.94,.94,9,1,col);c.globalAlpha=1;this._selection(c,.48,col,true);c.restore();}}
    _drawAreaPreview(c){const {from,to}=this.areaPreview,x0=Math.floor(Math.min(from.x,to.x)),y0=Math.floor(Math.min(from.y,to.y)),x1=Math.floor(Math.max(from.x,to.x))+1,y1=Math.floor(Math.max(from.y,to.y))+1,ok=x1-x0<=20&&y1-y0<=20;poly(c,[this._raw(x0,y0),this._raw(x1,y0),this._raw(x1,y1),this._raw(x0,y1)].map(p=>[p.x,p.y]),ok?'rgba(240,205,116,.18)':'rgba(250,90,60,.2)',ok?'#efd28a':'#ff947f',1.5);}
    _drawHQGun(c,e,col){
      const level=e.level||1,z=68+(level-1)*4,a=e.angle||0,dx=(Math.cos(a)-Math.sin(a))*.78,dy=(Math.cos(a)+Math.sin(a))*.42,recoil=this.game.time-(e.firedAt??-10)<.13?3:0;
      this._box(c,0,0,.68,.65,8,z-8,'#526658','#8b9f86');ellipse(c,0,-z,16,8,'#677c65','#bbc4a4',1);this._box(c,0,0,.45,.4,7,z,'#71896b','#b3c19c');
      for(const side of [-1,1]){const ox=-dy*side*3,oy=dx*side*3-z-6,len=26+level*3-recoil;line(c,[[ox,oy],[ox+dx*len,oy+dy*len]],'#28392f',4.5);line(c,[[ox,oy-1],[ox+dx*len,oy+dy*len-1]],'#b8c4a6',1.8);const end=[ox+dx*len,oy+dy*len];ellipse(c,end[0],end[1],2.5,2,'#25392e');}
      if(level>=2){this._box(c,-.35,.1,.24,.32,9,z-3,'#a3ab83');this._box(c,.35,.1,.24,.32,9,z-3,'#a3ab83');}if(level>=3){const p=proj(-.3,-.3,z+10);ellipse(c,p[0],p[1],7,3.5,'#c2ccae',col,1);line(c,[p,[p[0],p[1]-9]],'#b9c9af',1);}
    }
    _antenna(c,x,y,z,col,h=28){let p=proj(x,y,z);line(c,[p,[p[0],p[1]-h]],'#b1bfa9',1.3);line(c,[[p[0]-6,p[1]-h+7],[p[0]+6,p[1]-h+7]],'#a3b5a0',1.1);ellipse(c,p[0],p[1]-h,1.8,1.8,Math.sin(this._time*3)>-.2?col:'#45665d');}
    _smoke(c,x,y,z,seed){c.save();let p=proj(x,y,z);for(let i=0;i<4;i++){let t=(this._time*.18+i*.24+seed*.13)%1;c.globalAlpha=.14*(1-t);ellipse(c,p[0]+t*15,p[1]-t*37,3+t*9,3+t*7,'#bac7af');}c.restore();}
    _drawConstruction(c,e,d,col){
      const size=Number(d.size)||2,p=e.progress||0,height=e.type==='hq'?60:e.type==='factory'?44:34,half=size*.4;this._pad(c,size+.12,col);
      this._box(c,0,0,size*.82,size*.82,3,1,'#9b9c86','#c6c6ac');
      if(p>.65){c.save();c.globalAlpha=Math.min(1,(p-.65)/.35);this._drawBuilding(c,e,d,col);c.restore();}
      const z=Math.max(5,height*Math.min(1,p*1.5));for(const [x,y] of [[-half,-half],[half,-half],[-half,half],[half,half]]){this._box(c,x,y,.07,.07,z,3,'#859780','#c1cbb0');}
      for(const y of [-half,half]){line(c,[proj(-half,y,z+3),proj(half,y,z+3)],'#b5ac7d',2);line(c,[proj(-half,y,5),proj(half,y,z+3)],'#879b80',1);}
      for(let k=0;k<3;k++)this._box(c,-half,.15+k*.25,.22,.2,4,2,'#aaa174','#d1c497');
      const working=this.game.entities.some(u=>u.hp>0&&u.owner===e.owner&&u.task?.type==='build'&&u.task.targetId===e.id&&Math.hypot(u.x-e.x,u.y-e.y)<size*.5+2);
      if(working){const t=this._time*2,f=t%1,a=proj(half,half,z*.55);for(let k=0;k<4;k++){const angle=k*1.7,tau=(f+k*.17)%1;c.save();c.globalAlpha=1-tau;line(c,[[a[0],a[1]],[a[0]+Math.cos(angle)*tau*10,a[1]-tau*6+tau*tau*10]],'#f0cc7c',.9);c.restore();}}
    }
    _drawUnit(c,e,d,col){
      const motion=this._motion(e);let t=e.type,moving=motion.moving&&!e.garrisonedIn,walk=moving?Math.sin(motion.phase)*2.5:0;c.save();if(moving)c.translate(0,-Math.abs(Math.sin(motion.phase))*.65);
      ellipse(c,1,1,5,2.5,'rgba(2,14,15,.42)');let suit=t==='spy'?'#7e897b':t==='medic'?'#8e9b77':['engineer','mechanic','pioneer'].includes(t)?'#7c8c67':t==='investigator'?'#8e8b79':t==='general'?'#607b66':this.game.biome==='desert'?'#ad9d78':this.game.biome==='tundra'?'#acb7a6':'#7f9270';
      line(c,[[-2,-5],[-2-walk*.5,-2],[-2-walk,1]],'#253b33',2.3);line(c,[[2,-5],[2+walk*.5,-2],[2+walk,1]],'#253b33',2.3);
      c.fillStyle=suit;c.fillRect(-3,-12,6,8);line(c,[[-3,-10],[-5,-5+walk*.3]],suit,2);line(c,[[3,-10],[5,-6-walk*.3]],suit,2);
      ellipse(c,0,-14,2.8,3,'#b6b29a');ellipse(c,0,-16,3.7,2.4,t==='general'?'#334e43':this.game.biome==='desert'?'#b3a477':'#677b55');line(c,[[-2.8,-16.2],[2.8,-16.2]],col,1.3);
      c.fillStyle='#475c3c';c.fillRect(-2,-11,4,4);c.fillStyle='#b1bd87';c.fillRect(-2,-10,1,2);c.fillRect(1,-10,1,2);line(c,[[-2,-4],[2,-4]],'#443d2d',1);line(c,[[-3,-.3],[-1,-.3]],'#1f302b',2);line(c,[[1,-.3],[3,-.3]],'#1f302b',2);line(c,[[-1,-14],[1,-14]],'#e0bf8d',1);
      // Camouflage fatigues, shoulder patches, plate carrier and field pack.
      for(const [x,y] of [[-2,-11],[1,-8],[-2,-6]]){c.fillStyle='#46573d';c.fillRect(x,y,2,1.5);}round(c,-6,-12,3,6,1,'#536447','#98a07c');line(c,[[-2,-12],[2,-12]],'#b8b291',.8);c.fillStyle=col;c.fillRect(-4,-11,1.5,2);line(c,[[-2,-17],[2,-17]],'#98a581',.8);line(c,[[-2.5,-14],[-2.5,-12.5],[1.8,-12.5]],'#465641',.65);
      if(t==='pioneer'){round(c,3,-8,8,4,1,'#e2b360','#434d40');line(c,[[10,-6],[16,-6]],'#d9d8b5',2);for(let x=10;x<16;x+=2)line(c,[[x,-7],[x+1,-4]],'#abb69e',.7);if(e.task?.type==='clear')for(let k=0;k<3;k++)ellipse(c,12+Math.sin(this._time*9+k)*5,-5+k*2,1,.7,'#dbc68d');}
      else if(t==='mechanic'){line(c,[[3,-7],[8,-12]],'#d8e1d1',1.8);ellipse(c,8,-12,2,2,null,'#d8e1d1',1.4);round(c,-8,-9,5,7,1,'#b08d47','#ddbd72');if(e.task?.type==='repair'){const p=(this._time*7)%1;line(c,[[8,-11],[8+p*6,-11-p*6]],'#ffe5a0',1);}}
      else if(t==='medic'){c.fillStyle='#e8e7c7';c.fillRect(-2,-10,4,5);line(c,[[-1.5,-7.5],[1.5,-7.5]],'#c67f6e',1.2);line(c,[[0,-9],[0,-6]],'#c67f6e',1.2);}
      else if(t==='rocketeer'||t==='heavy'){line(c,[[2,-12],[9,-9]],'#273a32',t==='rocketeer'?4.4:3);line(c,[[7,-10],[11,-9]],'#a5b39a',1.5);}
      else if(t==='engineer'||t==='sapper'){line(c,[[4,-8],[8,-13]],'#b7bfa2',1.5);line(c,[[6,-14],[10,-12]],'#c6b57b',2);c.fillStyle='#8a7950';c.fillRect(-6,-10,3,6);}
      else if(t==='general'){line(c,[[4,-9],[9,-10]],'#bcceaf',1.4);line(c,[[-5,-12],[-5,-3]],'#d8bf77',1);}
      else if(t==='investigator'){ellipse(c,6,-8,2.7,2.2,null,'#c1c7a5',1.1);line(c,[[7,-6],[9,-3]],'#b6c2a7',1.2);}
      else if(t!=='pilot'){line(c,[[1,-8],[t==='sniper'?12:9,-6]],'#233b32',2);line(c,[[8,-6],[t==='sniper'?14:11,-5]],'#acb8a1',1);}
      if(t==='scout'){line(c,[[-4,-11],[-4,-20]],'#a4b59a',.8);ellipse(c,-4,-20,1,1,col);}
      if(e.disguised&&e.owner===0){ellipse(c,0,-24,4,3.1,'#172d2d',col,.8);line(c,[[-2,-24],[2,-24]],col,1);}
      if((e.level||1)>1){c.fillStyle='#e2ce91';c.fillRect(-1.5,-12,3,1.3);}c.restore();
    }
    _drawMachine(c,e,d,col){
      const motion=this._motion(e);let angle=Number.isFinite(e.angle)?e.angle:0,ca=Math.cos(angle),sa=Math.sin(angle),air=d.domain==='air',sea=d.domain==='sea',offset=air?this.aircraftAltitude(e):0;
      const v=(x,y,z=0)=>{let a=x*ca-y*sa,b=x*sa+y*ca;return[(a-b)*24,(a+b)*13-z-offset];};
      const box=(x,y,w,dep,h,z,base)=>{let q=[v(x-w/2,y-dep/2,z),v(x+w/2,y-dep/2,z),v(x+w/2,y+dep/2,z),v(x-w/2,y+dep/2,z)],top=q.map(a=>[a[0],a[1]-h]);let faces=q.map((p,i)=>({p:[p,q[(i+1)%4],top[(i+1)%4],top[i]],depth:(p[1]+q[(i+1)%4][1])/2})).sort((a,b)=>a.depth-b.depth);for(let f of faces){const light=c.createLinearGradient(0,f.p[2][1],0,f.p[0][1]);light.addColorStop(0,shade(base,-1));light.addColorStop(1,shade(base,-28));poly(c,f.p,light,'#324c43',.5);}poly(c,top,shade(base,12),'#8ca18c',.6);};
      let body=['#95a778','#bb9f79','#859fa8','#b7b17c'][e.owner]||'#95a778',dark='#2c4036';ellipse(c,air&&offset?10:3,air&&offset?10:2,sea?30:22,sea?12:8,'rgba(1,14,15,.36)');
      if(e.type==='fighter'||e.type==='bomber'){
        let big=e.type==='bomber'?1.3:1;if(!offset)for(let side of [-1,1]){let wheel=v(-.25,side*.5,1);ellipse(c,wheel[0],wheel[1],3,2,'#162c28','#7d9180',.7);}let hull=[[1.45,0],[-.5,-.17],[-.8,-.6],[-1,-.6],[-.9,0],[-1,.6],[-.8,.6],[-.5,.17]].map(p=>v(p[0]*big,p[1]*big,4));poly(c,hull,'#a8b5a6','#d0d6bb',.8);
        poly(c,[[.3,-.1],[-.5,-1.3],[-.95,-1.3],[-.55,0],[-.95,1.3],[-.5,1.3],[.3,.1]].map(p=>v(p[0]*big,p[1]*big,5)),body,'#bbccb0',.7);
        poly(c,[[.7,0],[.28,-.13],[-.1,0],[.28,.13]].map(p=>v(p[0],p[1],8)),'#263e45',col,.7);
        for(const side of [-1,1]){line(c,[v(.1,side*.22,6),v(-.7,side*1.05,6)],shade(body,-24),.7);for(let n=0;n<4;n++){const p=v(-.45+n*.08,side*.55,7);ellipse(c,p[0],p[1],.6,.6,'#dce1ce');}const p=v(-.8,side*1.15,6);ellipse(c,p[0],p[1],1.4,1,side<0?'#ef765b':'#7dd9a5');}
        for(let k of [-1,1]){line(c,[v(-.3,k*.7,2),v(-.8,k*.7,2)],'#c3cab0',3);let a=v(-.8,k*.13,4);ellipse(c,a[0],a[1],2,1.5,e.crew?.length? '#e4b77b':'#304940');}line(c,[v(-.6,0,6),v(-.8,0,17)],'#a9bcaa',2.5);
      }else if(sea){
        let big=e.type==='frigate'?1.7:1.1;poly(c,[[1.5,0],[.7,-.4],[-1.3,-.4],[-1.45,0],[-1.3,.4],[.7,.4]].map(p=>v(p[0]*big,p[1],2)),dark,'#536e65',1);
        poly(c,[[1.5,0],[.65,-.37],[-1.25,-.37],[-1.35,0],[-1.25,.37],[.65,.37]].map(p=>v(p[0]*big,p[1],7)),body,'#b1bdab',.8);box(-.1,0,.65,.5,13,7,'#a0b09c');box(-.25,0,.45,.4,4,20,'#687f71');line(c,[v(-.3,0,23),v(-.3,0,39)],'#c4ceba',1.2);line(c,[v(-.3,-.3,32),v(-.3,.3,32)],'#b7c6ae',1);
        for(const side of [-1,1]){line(c,[v(-big*1.1,side*.34,11),v(big*.6,side*.34,11)],'#c9d5c3',.7);for(let x=-big;x<big*.6;x+=.3)line(c,[v(x,side*.34,7),v(x,side*.34,11)],'#bcccb9',.6);}for(let x=-.3;x<.3;x+=.15)line(c,[v(x,.26,17),v(x+.08,.26,17)],'#305264',2);
        for(let x of [big*.75,-big*.8]){box(x,0,.34,.3,5,8,'#78917c');line(c,[v(x,0,14),v(x+.45,0,14)],'#b8c3ad',2.6);}if(motion.moving){for(let k=0;k<3;k++){const f=(this._time*.8+k*.33)%1,p=v(-big*1.4-f*.8,0,1);c.save();c.globalAlpha=(1-f)*.35;ellipse(c,p[0],p[1],8+f*17,3+f*6,null,'#c9e0d6',1);c.restore();}}
      }else{
        let drill=e.type==='drill',long=e.type==='artillery';box(-.05,-.35,1.15,.18,6,1,dark);box(-.05,.35,1.15,.18,6,1,dark);
        for(let x=-.45;x<.6;x+=.22)for(let y of [-.45,.45]){let p=v(x,y,3);ellipse(c,p[0],p[1],2.2,2,'#5d7160','#21392f',.8);}
        box(-.05,0,1.08,.67,7,7,body);
        if(e.type==='tank'||long){box(-.1,0,.6,.48,7,14,body);line(c,[v(.05,0,23),v(long?1.5:1.2,0,long?34:23)],dark,long?5.5:4.8);line(c,[v(.05,0,24),v(long?1.5:1.2,0,long?35:24)],'#a8b79c',2.3);let p=v(-.2,0,23);ellipse(c,p[0],p[1],4.5,2.5,'#49674e',col,.7);}
        else if(e.type==='flaktank'){box(-.15,0,.65,.53,9,14,body);const kick=Math.max(0,1-(this.game.time-(e.firedAt??-10))/.12)*.13;
          for(const side of [-.2,.2]){box(.05,side,.3,.17,8,20,'#748667');line(c,[v(.18,side,27),v(1.02-kick,side,38)],dark,4);line(c,[v(.18,side,28),v(1.02-kick,side,39)],'#c5ceb5',1.5);}
          line(c,[v(-.4,0,24),v(-.4,0,37)],'#b7c5a8',2);const radar=v(-.4,0,37);ellipse(c,radar[0],radar[1],7,4,'#b8c8af',col,1);line(c,[[radar[0]-5,radar[1]],[radar[0]+5,radar[1]]],'#628070',.8);
        }
        else if(e.type==='apc'){box(-.2,0,.8,.6,9,14,body);for(let y of [-.3,.3])for(let x of [-.4,-.1,.2])line(c,[v(x,y,19),v(x+.1,y,19)],'#283c35',2.2);line(c,[v(.25,0,25),v(.65,0,25)],'#a8bb9d',2.4);}
        else if(e.type==='harvester'){box(-.3,0,.48,.5,13,14,'#a19362');box(.3,0,.5,.56,6,14,'#6e7862');let a=v(-.1,0,27),b=v(.6,0,36),q=v(1,0,5);line(c,[a,b,q],'#d0b775',3);box(1,0,.32,.8,4,2,'#9e9868');}
        else if(e.type==='seismicrover'){box(-.25,0,.6,.55,9,14,'#b3b88a');line(c,[v(-.2,0,23),v(-.2,0,39)],'#d5dfc6',2);const p=v(-.2,0,37);ellipse(c,p[0],p[1],11,5,'#b9cec0',col,1.5);line(c,[[p[0]-10,p[1]],[p[0]+10,p[1]]],'#73948d',1);line(c,[v(.3,-.25,17),v(.3,.25,17)],'#405d61',4);}
        else if(e.type==='interceptor'){box(-.1,0,.65,.5,10,14,body);for(const y of [-.14,.14]){line(c,[v(.2,y,25),v(1.05,y,25)],'#334e49',4);line(c,[v(.2,y,26),v(1.05,y,26)],'#cad9be',1.4);}box(-.4,0,.25,.3,5,25,'#c0ccb0');}
        else if(drill){box(-.25,0,.6,.52,11,14,'#7a8f7a');let a=v(.45,0,15),b=v(1.3,0,15);poly(c,[[a[0]-8,a[1]-8],b,[a[0]+8,a[1]+5]],'#b2b399','#e0d5a3',.8);for(let k=.52;k<1.15;k+=.15){let p=v(k,0,15),w=(1.3-k)*8;line(c,[[p[0]-w,p[1]-w],[p[0]+w,p[1]+w]],'#5b7060',1.8);}if(this.layer==='underground'){let p=v(1.3,0,15);ellipse(c,p[0],p[1],7,4,'rgba(244,209,122,.18)');}}
        else box(0,0,.7,.5,8,14,body);
        // Welded armor panels, camouflage patches, grilles and track links.
        for(const [x,y] of [[-.37,.21],[.15,-.2],[-.1,.26]])poly(c,[v(x-.12,y-.08,15),v(x+.08,y-.09,15),v(x+.16,y+.06,15),v(x-.12,y+.08,15)],shade(body,-24));
        for(let n=0;n<5;n++)line(c,[v(-.5+n*.055,-.19,16),v(-.5+n*.055,.12,16)],'#3c5145',.7);
        for(let x=-.55;x<.6;x+=.12)for(const y of [-.45,.45]){const shift=motion.moving?(motion.phase*.06)%.12:0;line(c,[v(x+shift,y-.04,7),v(x+shift,y+.04,7)],'#b3baa0',.7);}
        for(const y of [-.3,.3]){const p=v(-.48,y,15);ellipse(c,p[0],p[1],.8,.8,'#e0dcc0');}if(motion.moving){for(let k=0;k<3;k++){const f=(this._time*.9+k*.33)%1,p=v(-.65-f*.4,k%2?.3:-.3,4+f*5);c.save();c.globalAlpha=(1-f)*.16;ellipse(c,p[0],p[1],3+f*6,2+f*3,'#c7b88e');c.restore();}}
        for(let y of [-.3,.3]){let a=v(.49,y,12);ellipse(c,a[0],a[1],1.5,1.2,e.crew?.length?'#e3dfaf':'#526857');}line(c,[v(-.4,-.25,23),v(-.4,-.25,35)],'#c2cbae',.7);let p=v(-.4,-.25,35);ellipse(c,p[0],p[1],1,1,col);
      }
      if(e.type==='tank'&&e.garrisonId){const rider=this.game.getEntity(e.garrisonId);if(rider&&rider.hp>0){const p=v(-.2,.02,27);c.save();c.translate(p[0],p[1]);this._drawUnit(c,rider,this.game.getDef(rider),col);const aim=rider.angle??angle,dx=(Math.cos(aim)-Math.sin(aim))*11,dy=(Math.cos(aim)+Math.sin(aim))*6;line(c,[[0,-9],[dx,dy-9]],'#283a2d',3);line(c,[[0,-10],[dx,dy-10]],'#b4bda1',1);c.restore();}}
      if((e.crew?.length||0)<(d.crew||1)){let p=v(0,0,air?18:39);round(c,p[0]-6,p[1]-7,12,11,2,'#172b28','#b29e69');c.fillStyle='#d8c58c';c.font='bold 8px sans-serif';c.textAlign='center';c.fillText('!',p[0],p[1]+1);}
    }
    _drawEntityInfo(c,e,p){
      e=this.perceivedEntity(e);
      let selected=this.selection.has(e.id),hover=this.hoverId===e.id,d=this._definition(e),damaged=e.hp<(e.maxHp||d.hp||e.hp)*.98,construct=e.kind==='building'&&e.progress<1;
      if(e.owner===0&&e.kind==='building'&&e.progress>=1&&this.camera.zoom>.65){const out=this.game.productionOutput?.(e)||{},labels=Object.entries(out).map(([k,n])=>({money:'◈',metal:'ALLOY',fuel:'FUEL',crystal:'CRYSTAL'}[k])+' +'+Number(n.toFixed(1))+'/s');if(labels.length){c.save();c.font='bold 10px monospace';c.textAlign='center';const label=labels.join(' · '),w=c.measureText(label).width;round(c,p.x-w/2-5,p.y+13,w+10,14,3,'rgba(28,48,38,.9)','#9ab789');c.fillStyle='#e7f5c2';c.fillText(label,p.x,p.y+23);c.restore();}}
      if(!selected&&!hover&&!damaged&&!construct)return;let height=e.kind==='building'?(e.type==='hq'?80:62):e.kind==='machine'?(d.domain==='air'?38+this.aircraftAltitude(e):46):27,width=e.kind==='building'?55:e.kind==='machine'?35:23;
      let x=p.x,y=p.y-height*this.camera.zoom,col=FACTIONS[e.owner]||RED;
      c.save();c.translate(Math.round(x*this.dpr)/this.dpr,Math.round(y*this.dpr)/this.dpr);
      if(selected||hover){let name=d.name||e.type;let label=name.toUpperCase()+(e.level>1?'  '+['','I','II','III'][Math.min(3,e.level)]:'' );c.font='600 11px "IBM Plex Mono", monospace';c.textAlign='center';let tw=c.measureText(label).width;round(c,-tw/2-6,-16,tw+12,15,3,'rgba(8,23,26,.9)','rgba(130,177,158,.27)');c.fillStyle='#dbe9d9';c.fillText(label,0,-5);}
      round(c,-width/2,0,width,4,1,'#102820');c.fillStyle=construct?'#ddc784':col;c.fillRect(-width/2+.5,.5,(width-1)*Math.max(0,Math.min(1,construct?e.progress:e.hp/(e.maxHp||d.hp||e.hp))),3);
      if(construct){c.font='8px monospace';c.textAlign='center';c.fillStyle='#ddcf9e';c.fillText('CONSTRUCTING '+Math.floor(e.progress*100)+'%',0,15);}
      if(e.queue?.length){c.fillStyle='#1b322e';c.fillRect(-width/2,6,width,2);c.fillStyle='#e1cb89';c.fillRect(-width/2,6,width*Math.min(1,e.queue[0].progress||0),2);}
      c.restore();
    }
    _recoil(c,e,amount){const elapsed=this.game.time-e.firedAt;if(Number.isFinite(elapsed)&&elapsed>=0&&elapsed<.18){const force=amount*(1-elapsed/.18),a=e.angle||0;c.translate(-Math.cos(a)*force,-Math.sin(a)*force*.55);}}
    _drawShot(c,fx,p,q,t){
      const flak=fx.weapon==='flaktank',rocket=['rocketeer','frigate'].includes(fx.weapon),shell=['tank','artillery'].includes(fx.weapon),bomb=fx.weapon==='bomber',heavy=rocket||shell||bomb;
      const sx=p.x,sy=p.y-(fx.sourceHeight??(fx.sourceAir?38:fx.heavy?22:12)),ex=q.x,ey=q.y-(fx.targetHeight??(fx.targetAir?34:7)),dx=ex-sx,dy=ey-sy,length=Math.max(1,Math.hypot(dx,dy)),ux=dx/length,uy=dy/length;
      const travelEnd=heavy?.62:.34,u=Math.min(1,t/travelEnd),arc=shell?(fx.weapon==='artillery'?50:16):bomb?8:0;
      const pos=v=>({x:sx+dx*v,y:sy+dy*v-Math.sin(v*Math.PI)*arc});
      c.save();
      if(t<.17&&!bomb){
        const f=1-t/.17,r=(heavy?10:5)*f;
        const glow=c.createRadialGradient(sx,sy,0,sx,sy,r*2);glow.addColorStop(0,'rgba(255,245,207,.9)');glow.addColorStop(.35,'rgba(255,187,92,.6)');glow.addColorStop(1,'rgba(237,130,49,0)');ellipse(c,sx,sy,r*2,r*1.4,glow);
        poly(c,[[sx-uy*r*.35,sy+ux*r*.35],[sx+ux*r*1.8-uy*r*.25,sy+uy*r*1.8+ux*r*.25],[sx+ux*r*1.15,sy+uy*r*1.15],[sx+ux*r*1.7+uy*r*.35,sy+uy*r*1.7-ux*r*.35],[sx+uy*r*.3,sy-ux*r*.3]],'#ffdf9a');
      }
      if(t<travelEnd){
        const head=pos(u),tail=pos(Math.max(0,u-(heavy?8:11)/length));
        if(rocket){for(let i=1;i<6;i++){const v=Math.max(0,u-i*.035),pt=pos(v);c.globalAlpha=(1-i/6)*.22;ellipse(c,pt.x,pt.y,1.8+i*.45,1.3+i*.35,'#b5ae9a');}c.globalAlpha=1;line(c,[[tail.x,tail.y],[head.x,head.y]],'#cfaa74',2);ellipse(c,head.x,head.y,2.5,1.7,'#d8d1b5');}
        else if(bomb)ellipse(c,head.x,head.y,3,4.5,'#3d423a','#b9b59d',.7);
        else{line(c,[[tail.x,tail.y],[head.x,head.y]],shell?'#d7c49c':'rgba(244,220,162,.8)',shell?2.2:1.1);if(flak){const second=pos(Math.max(0,u-.13));line(c,[[second.x-ux*5-uy*2,second.y-uy*5+ux*2],[second.x-uy*2,second.y+ux*2]],'#f4d49a',1.5);}ellipse(c,head.x,head.y,shell?2.3:1.3,shell?1.6:.8,'#fff0c8');}
      }
      // Short-lived expanding dust, irregular fragments and drifting smoke replace laser-like beams.
      if(t>=travelEnd&&this._visible(fx.tx,fx.ty)){
        const impact=(t-travelEnd)/(1-travelEnd),size=flak?9:heavy?15:5;
        for(let i=0;i<5;i++){const seed=hash(fx.x,fx.ty,i),angle=seed*Math.PI*2,distance=(4+seed*size)*impact;c.globalAlpha=(1-impact)*.28;ellipse(c,ex+Math.cos(angle)*distance+impact*3,ey+Math.sin(angle)*distance*.5-impact*8,1+impact*(size*.45),.8+impact*(size*.3),fx.targetAir?'#72817a':'#b2a58a');}
        if(impact<.45){c.globalAlpha=1-impact/.45;for(let i=0;i<4;i++){const a=i*2.3+hash(fx.x,fx.y)*2;line(c,[[ex+Math.cos(a)*impact*size,ey+Math.sin(a)*impact*size*.6],[ex+Math.cos(a)*(impact*size+2),ey+Math.sin(a)*(impact*size+2)*.6]],'#d9bc7e',.8);}}
      }
      if(heavy&&!bomb){c.globalAlpha=(1-t)*.13;for(let i=0;i<3;i++)ellipse(c,sx+t*(6+i*4),sy-t*(10+i*5),2+t*(3+i),2+t*(2+i),'#bdb6a0');}
      c.restore();
    }
    _drawEffects(c,time){
      for(let fx of (this.game.effects||[]).slice(-(this.quality==='performance'?96:256))){if(fx.layer&&fx.layer!==this.layer)continue;if(!this._visible(fx.x,fx.y))continue;let p=this._raw(fx.x,fx.y),life=fx.maxLife||1,t=1-Math.max(0,Math.min(1,(fx.life??life)/life));
        if(!this._onscreen(p,100)&&!(fx.tx!=null&&this._onscreen(this._raw(fx.tx,fx.ty),100)))continue;
        if(fx.type==='shot'){if(fx.tx==null)continue;this._drawShot(c,fx,p,this._raw(fx.tx,fx.ty),t);}
        else if(fx.type==='explosion'){let r=6+t*25;c.save();if(t<.4){c.globalAlpha=(1-t/.4)*.35;ellipse(c,p.x,p.y,8+t*75,4+t*38,null,'#d4c79f',1.8);c.globalAlpha=1;}for(let k=0;k<8;k++){let a=k*2.4+hash(fx.x,fx.y),drift=t*(15+hash(k,fx.x)*14),x=p.x+Math.cos(a)*drift+t*6,y=p.y-7+Math.sin(a)*drift*.55-t*12;c.globalAlpha=(1-t)*.48;ellipse(c,x,y,3+t*11,2+t*8,t<.18?'#d9aa6b':'#7f7e6c');}if(t<.4){let grad=c.createRadialGradient(p.x,p.y-9,0,p.x,p.y-9,r);grad.addColorStop(0,'rgba(255,236,182,.9)');grad.addColorStop(.35,'rgba(231,148,64,.7)');grad.addColorStop(1,'rgba(125,74,43,0)');c.globalAlpha=1-t/.4;ellipse(c,p.x,p.y-9,r,r*.75,grad);}c.globalAlpha=1-t;for(let k=0;k<7;k++){let a=k*2.4;ellipse(c,p.x+Math.cos(a)*t*32,p.y-10+Math.sin(a)*t*17-t*16+t*t*22,1.5,1,'#bda775');}c.restore();}
        else if(fx.type==='heal'){c.globalAlpha=1-t;c.fillStyle='#9ee5bb';c.fillRect(p.x-1.5,p.y-25-t*12,3,9);c.fillRect(p.x-4.5,p.y-22-t*12,9,3);c.globalAlpha=1;}
        else if(fx.type==='ping'||fx.type==='scan'){c.globalAlpha=1-t;ellipse(c,p.x,p.y,20+t*100,10+t*54,null,BLUE,1.3);ellipse(c,p.x,p.y,8+t*60,4+t*30,null,'#9aebd5',.7);line(c,[[p.x,p.y-10],[p.x,p.y-28-t*8]],BLUE,1);c.globalAlpha=1;}
        else if(fx.type==='dust'){c.globalAlpha=(1-t)*.3;ellipse(c,p.x+t*5,p.y-t*12,5+t*9,3+t*6,'#c3bd91');c.globalAlpha=1;}
      }
    }
    _drawUndergroundDeposits(c){
      for(const {x,y} of this._undergroundDeposits||[]){const resource=this.game.tiles[y]?.[x]?.resource;if(!(resource?.amount>0))continue;let q=proj(x+.5,y+.5);if(!this._onscreen({x:q[0],y:q[1]},40))continue;let ore=resource.type==='crystal'?'#598e94':resource.type==='fuel'?'#696940':'#746a4e';poly(c,[[q[0]-12,q[1]-3],[q[0]-1,q[1]-9],[q[0]+13,q[1]-1],[q[0]+8,q[1]+6],[q[0]-7,q[1]+5]],ore);for(let k=0;k<4;k++){let v=proj(x+hash(x,y,k),y+hash(y,x,k+4));ellipse(c,v[0],v[1],2,1.5,shade(ore,30));}}
    }
    _drawTunnels(c){
      let tunnels=this.game.tunnels||[];if(Array.isArray(tunnels)){for(let a of tunnels){if(Array.isArray(a)){for(let i=1;i<a.length;i++){let p=this._raw(a[i-1].x,a[i-1].y,0),q=this._raw(a[i].x,a[i].y,0);line(c,[[p.x,p.y],[q.x,q.y]],'#574e39',13);line(c,[[p.x,p.y],[q.x,q.y]],'#827455',1);}}else if(a&&typeof a.x==='number'){let p=this._raw(a.x,a.y,0);ellipse(c,p.x,p.y,17,9,'#554e3a','#827455',1);}}}
      for(let e of this.game.entities||[])if(e.hp>0&&e.kind==='building'&&e.owner===0&&['mine','sensor','hq','factory'].includes(e.type)){let p=this._raw(e.x,e.y,0);c.save();c.globalAlpha=.35;c.setLineDash([3,4]);poly(c,[[-28,0],[0,-15],[28,0],[0,15]].map(q=>[q[0]+p.x,q[1]+p.y]),'#3f5b4c','#a7b892',1);c.restore();c.font='8px monospace';c.textAlign='center';c.fillStyle='#8b9d85';c.fillText((this._definition(e).name||e.type).toUpperCase(),p.x,p.y+4);if(e.type==='sensor'&&e.progress>=1){const radius=this._sensorRadius(e);ellipse(c,p.x,p.y,radius*26*Math.SQRT2,radius*14*Math.SQRT2,null,'rgba(124,204,160,.22)',1);}}
    }
    _drawCharges(c,time){for(let e of this.game.charges||[]){if(e.owner!==0&&!this._visible(e.x,e.y))continue;let p=this._raw(e.x,e.y,0);let blink=Math.sin(time*8)>0;c.fillStyle=blink?'#f2b67e':'#764a3d';c.fillRect(p.x-4,p.y-4,8,6);ellipse(c,p.x,p.y,15,8,null,'#cd8a66',1);c.font='9px monospace';c.textAlign='center';c.fillStyle='#eec69c';c.fillText(e.kind==='proximity'?'PROXIMITY MINE':'TIMED CHARGE',p.x,p.y-10);}}
    _drawPlacement(c){let a=this.placement,def=global.RTS_DATA?.buildings?.[a.type]||{},s=Number(def.size)||2,p=this._raw(a.x,a.y),col=a.valid?BLUE:RED;c.save();c.translate(p.x,p.y);c.globalAlpha=.5;if(a.type==='heavygate')this._drawFortification(c,{type:'heavygate',x:a.x,y:a.y,level:1,owner:0,gateAxis:a.gateAxis},col);else this._box(c,0,0,s,s,30,2,a.valid?'#65bd9e':'#c27559');c.globalAlpha=1;this._selection(c,s*.53,col,true);c.setLineDash([4,5]);ellipse(c,0,0,36*s,19*s,null,a.valid?'rgba(115,234,209,.3)':'rgba(255,130,98,.3)',1);c.restore();}
    drawMinimap(canvas){
      if(!canvas||!this.game?.tiles)return;let r=canvas.getBoundingClientRect(),w=r.width||canvas.clientWidth||220,h=r.height||canvas.clientHeight||155,dpr=Math.min(2,global.devicePixelRatio||1);if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}let c=canvas.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);c.fillStyle='#0b1a1d';c.fillRect(0,0,w,h);let g=this.game,dx=w/g.width,dy=h/g.height;
      // One compact pixel buffer replaces tens of thousands of canvas draw calls.
      if(!this._mini||this._mini.width!==g.width||this._mini.height!==g.height){this._mini=document.createElement('canvas');this._mini.width=g.width;this._mini.height=g.height;this._miniPixels=this._mini.getContext('2d').createImageData(g.width,g.height);}
      const pixels=this._miniPixels.data,palette=this._miniPalette||(this._miniPalette=new Map());
      const rgb=color=>{if(!palette.has(color)){const n=parseInt(color.slice(1),16);palette.set(color,[n>>16,n>>8&255,n&255]);}return palette.get(color);};
      const colors={};for(const [type,color] of Object.entries(COL))colors[type]=[rgb(color),rgb(shade(color,-24))];
      const unknown=rgb('#172b2c'),underground=rgb('#2c3a30'),deposit=rgb('#6c7050');let offset=0;
      for(let y=0;y<g.height;y++)for(let x=0;x<g.width;x++){const tile=g.tiles[y][x],seen=g.visible?.[y]?.[x]??true,explored=g.explored?.[y]?.[x]??true,col=this.layer==='underground'?(tile.resource?.amount>0?deposit:underground):seen?(colors[tile.type]||colors.grass)[0]:explored?(colors[tile.type]||colors.grass)[1]:unknown;pixels[offset++]=col[0];pixels[offset++]=col[1];pixels[offset++]=col[2];pixels[offset++]=255;}
      this._mini.getContext('2d').putImageData(this._miniPixels,0,0);c.imageSmoothingEnabled=false;c.drawImage(this._mini,0,0,w,h);c.imageSmoothingEnabled=true;
      for(let e of g.entities||[]){if(!this._canDraw(e))continue;let size=e.kind==='building'?3.6:e.kind==='machine'?2.7:1.8;c.fillStyle=FACTIONS[this.perceivedEntity(e).owner]||RED;c.fillRect(e.x*dx-size/2,e.y*dy-size/2,size,size);if(e.type==='hq'){c.strokeStyle='#e2d7a5';c.lineWidth=1;c.strokeRect(e.x*dx-4,e.y*dy-4,8,8);}}
      let corners=[[0,0],[this.width,0],[this.width,this.height],[0,this.height]].map(p=>this.screenToWorld(p[0],p[1])).map(p=>[p.x*dx,p.y*dy]);poly(c,corners,'rgba(183,228,200,.035)','rgba(208,231,205,.75)',.8);
      if(this.layer==='underground'){c.fillStyle='#b9c7a5';c.font='8px monospace';c.fillText('SUBSURFACE',7,12);}
    }
  }
  global.RTSRenderer=RTSRenderer;
})(globalThis);
