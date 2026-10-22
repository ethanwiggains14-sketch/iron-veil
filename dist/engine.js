(function(global){
'use strict';
const D=global.RTS_DATA, clamp=(v,a,b)=>Math.max(a,Math.min(b,v)), dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const MATERIAL_PRICE={metal:4,fuel:6,crystal:12}, SAVE_VERSION=3;
class RTSGame {
 constructor(options={}) {
  this.width=options.mapSize==='classic'?96:options.mapSize==='expansive'?192:144;this.height=options.mapSize==='classic'?72:options.mapSize==='expansive'?144:108;this.seed=(Number(options.seed)||12345)>>>0;this._rng=this.seed;
  this.difficulty=['relaxed','standard','veteran','hard'].includes(options.difficulty)?options.difficulty:'standard';
  this.biome=options.biome==='arctic'?'tundra':['temperate','desert','tundra'].includes(options.biome)?options.biome:'temperate';
  this.time=0;this.paused=false;this.winner=null;this.entities=[];this.effects=[];this.events=[];this.charges=[];this.tunnels=[];this.scans=[];this.nextId=1;this.nextEventId=1;
  this.teams=Array.from({length:1+clamp(Math.floor(Number(options.opponents)||1),1,3)},(_,i)=>({money:i?1500:1800,metal:300,fuel:i?160:150,crystal:i?60:70}));
  this.aiStates={};this.intel={};
  this.preparationDuration=600;
  this._fogTimer=0;this._aiTimer=0;this._economyTimer=0;this._aiStage=0;this._aiWave=0;this._nextRaid=this.preparationDuration;
  this._pathRevision=0;this._generateMap();this._initializeBases();this._updateFog();
  this._event('Command online. Defend your HQ. Build an economy, recruit crews and destroy the enemy command center.','success');
  this._event('Select engineers and right-click deposits to gather. Build near your outpost; missing materials are imported automatically.');
  this._event('Preparation window: '+Math.round(this.preparationDuration/60)+' minutes before hostile offensives. Enemy patrols still defend their territory.');
 }
 preparationRemaining(){return Math.max(0,this.preparationDuration-this.time);}
 _random(){let n=this._rng|0;n^=n<<13;n^=n>>>17;n^=n<<5;this._rng=n>>>0;return this._rng/4294967296;}
 _generateMap(){
  const ground=this.biome==='desert'?'sand':this.biome==='tundra'?'snow':'grass',phase=this._random()*Math.PI*2,riverPhase=this._random()*Math.PI*2;
  this.tiles=Array.from({length:this.height},(_,y)=>Array.from({length:this.width},(_,x)=>{
   const nx=x*96/this.width,ny=y*72/this.height,noise=this._random(),hill=(Math.sin(x*.19+y*.13+phase)+Math.cos(y*.23-x*.09+phase))*.5;
   const woodland=Math.sin(x*.27+phase)*Math.cos(y*.22-phase),north=9+Math.sin(nx*.11+phase)*3+Math.sin(nx*.25)*1.5,south=62+Math.sin(nx*.11-phase)*3;
   const river=47.5+Math.sin(ny*.12+riverPhase)*4,coast=2+Math.max(0,Math.sin(ny*.18+phase))*1.7;
   let type=ground,elevation=hill>.62?2:hill>.08?1:0;
   if(this.biome!=='desert'&&(woodland>.28&&noise<.8||noise<.04))type='forest';else if(hill>.55&&noise>.55)type='rock';else if(elevation===0&&woodland<-.35&&noise>.5)type='marsh';
   const ocean=ny<north||ny>south||nx<coast||nx>95-coast;
   if(ocean||Math.abs(nx-river)<2.2){type='water';elevation=0;}
   // Navigable straits, coastal islands and three permanent land crossings.
   if(ocean&&((nx-27)**2/20+(ny-4)**2/5<1||(nx-68)**2/20+(ny-67)**2/5<1)){type=ground;elevation=1;}
   if(!ocean&&type==='water'&&[24,36,48].some(crossing=>Math.abs(ny-crossing)<=1))type='bridge';
   return {type,elevation,...(type==='water'?{ocean}: {})};
  }));
  if(this.width===144)this._diversifyGeography(ground,phase,riverPhase);
  // Large theaters preserve connected coasts and guaranteed resources at every starting camp.
  for(const p of this._basePositions()){const bx=Math.floor(p.x),by=Math.floor(p.y),r=this.width>96?12:9;for(let y=by-r;y<=by+r;y++)for(let x=bx-r;x<=bx+r;x++)if(x>=3&&x<this.width-3&&this._inside(x,y)&&Math.hypot(x-bx,y-by)<r)this.tiles[y][x]={type:ground,elevation:0};}
  for(let i=0;i<Math.round(this.width*this.height/240);i++){const x=3+Math.floor(this._random()*(this.width-6)),y=12+Math.floor(this._random()*(this.height-24)),t=this.tiles[y][x];if(t.type!=='water'&&t.type!=='bridge'&&!this._basePositions().some(p=>Math.hypot(x-p.x,y-p.y)<10)){t.type='rock';t.resource={type:['metal','fuel','crystal'][i%3],amount:3200};}}
  for(const p of this._basePositions())for(const [dx,dy,type] of [[4,-5,'metal'],[-3,-5,'fuel'],[6,3,'crystal']]){const x=Math.floor(p.x+dx),y=Math.floor(p.y+dy);this.tiles[y][x]={type:'rock',elevation:0,resource:{type,amount:3200}};}
  for(let y=0;y<this.height;y++)for(let x=0;x<this.width;x++)if(this.tiles[y][x].type==='water'){
   let depth=4;for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++)if(this._inside(x+dx,y+dy)&&this.tiles[y+dy][x+dx].type!=='water')depth=Math.min(depth,Math.max(Math.abs(dx),Math.abs(dy)));this.tiles[y][x].depth=Math.max(1,depth);
  }
  this.visible=this._blankGrid();this.explored=this._blankGrid();this.undergroundVisible=this._blankGrid();this._visibility=this.teams.map(()=>this._blankGrid());this._underVisibility=this.teams.map(()=>this._blankGrid());
 }
 _diversifyGeography(ground,phase,riverPhase){
  // Different macro geography, not a palette swap. Seeded phases vary every coast,
  // inlet, ridge and island; the three theaters use distinct strategic topologies.
  for(let y=0;y<this.height;y++)for(let x=0;x<this.width;x++){
   const nx=x*96/this.width,ny=y*72/this.height,n=this._random(),ridge=Math.sin(nx*.22+ny*.11+phase)+Math.cos(ny*.21-nx*.08),wave=Math.sin(nx*.13+phase)*3;
   let water=false,ocean=false,type=ground,elevation=ridge>.9?2:ridge>-.2?1:0;
   if(this.biome==='temperate'){
    ocean=nx<8+Math.sin(ny*.15+phase)*3||ny<7+wave||ny>65+Math.sin(nx*.1+phase)*3;
    const river=47+Math.sin(ny*.12+riverPhase)*9+(ny-36)*.12;water=ocean||Math.abs(nx-river)<2.1;
    if(!water&&(Math.sin(nx*.25+phase)*Math.cos(ny*.26)>.18||n<.05))type='forest';
    if(!water&&Math.abs(nx-river)<4.5&&ridge<.3)type='marsh';
    if(!ocean&&water&&[19,37,54].some(c=>Math.abs(ny-c)<1.1))type='bridge';
   }else if(this.biome==='desert'){
    const lake=((nx-49-Math.sin(phase)*5)/17)**2+((ny-35-Math.cos(phase)*3)/14)**2;
    ocean=ny<10+wave||nx>88+Math.sin(ny*.16+phase)*3;water=ocean||lake<1+Math.sin(nx*.25+ny*.14)*.12;
    if(!water){type=ridge>.6&&n>.25?'rock':'sand';elevation=ridge>.65?2:1;if(ny>48&&Math.sin(nx*.15+phase)>.6&&n<.2)type='marsh';}
   }else{
    const fjord=34+Math.sin(nx*.11+riverPhase)*6;
    ocean=ny<8+wave||ny>64+Math.cos(nx*.12)*3||nx>89+Math.sin(ny*.13)*2;
    water=ocean||Math.abs(ny-fjord)<3.2||(nx>30&&nx<36&&ny<fjord)||(nx>64&&nx<70&&ny>fjord);
    if(!ocean&&water&&((nx>44&&nx<47)||(nx>76&&nx<79)||(ny>17&&ny<19)||(ny>54&&ny<56)))type='bridge';
    if(!water&&Math.sin(nx*.27+phase)*Math.cos(ny*.19)>.4)type='forest';
    if(!water&&ridge>1.3&&n>.35)type='rock';
    if(!water&&Math.abs(ny-fjord)<5.5&&ridge<0)type='marsh';
   }
   if(water&&type!=='bridge'){type='water';elevation=0;}
   if(ocean&&Math.sin(nx*.19+phase)+Math.cos(ny*.4+riverPhase)>1.84&&nx>13&&nx<84){type=ground;elevation=1;}
   this.tiles[y][x]={type,elevation,...(type==='water'?{ocean}: {})};
  }
  // Preserve land access between all camps without erasing their water geography.
  const bases=this._basePositions(),routeY=this.biome==='desert'?this.height*.79:this.height*.5;
  const carve=(a,b)=>{const steps=Math.ceil(Math.hypot(b.x-a.x,b.y-a.y));for(let i=0;i<=steps;i++){const x=Math.floor(a.x+(b.x-a.x)*i/Math.max(1,steps)),y=Math.floor(a.y+(b.y-a.y)*i/Math.max(1,steps));for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const t=this.tiles[y+dy]?.[x+dx];if(t?.type==='water'){t.type='bridge';t.elevation=0;delete t.ocean;}}}};
  for(const p of bases){carve(p,{x:p.x,y:routeY});carve({x:p.x,y:routeY},{x:this.width/2,y:routeY});}
 }
 _blankGrid(){return Array.from({length:this.height},()=>Array(this.width).fill(false));}
 _inside(x,y){return x>=0&&y>=0&&x<this.width&&y<this.height;}
 _basePositions(){const bases=this.teams.map((_,owner)=>this.entities.find(e=>e.type==='hq'&&e.owner===owner));if(bases.every(Boolean))return bases.map(e=>({x:e.x,y:e.y}));const big=this.width>96,positions=this.teams.length===2?(big?[{x:18.5,y:64.5},{x:173.5,y:79.5}]:[{x:9.5,y:32.5},{x:86.5,y:39.5}]):(big?[{x:22.5,y:38.5},{x:169.5,y:105.5},{x:22.5,y:105.5},{x:169.5,y:38.5}]:[{x:12.5,y:19.5},{x:83.5,y:53.5},{x:12.5,y:53.5},{x:83.5,y:19.5}]).slice(0,this.teams.length);return this.width===144?positions.map(p=>({x:Math.floor(p.x*.75)+.5,y:Math.floor(p.y*.75)+.5})):positions;}

 _initializeBases(){
  for(let owner=0;owner<this.teams.length;owner++){
   const pos=this._basePositions()[owner],mx=pos.x,my=pos.y,s=mx>this.width/2?-1:1;
   this._spawn('building','hq',owner,mx,my);
   this._spawn('building','barracks',owner,mx+s*4,my+3);
   this._spawn('building','depot',owner,mx-s*4,my+2);
   ['engineer','engineer','rifleman','rifleman','rifleman','rifleman','medic','scout'].forEach((type,i)=>this._spawn('unit',type,owner,mx+(i%4-1.5)*1.05,my-2.8-Math.floor(i/4)*1.1));
  }
 }
 _spawn(kind,type,owner,x,y,extra={}){
  const def=kind==='unit'?D.units[type]:kind==='machine'?D.machines[type]:D.buildings[type];if(!def)throw new Error('Unknown entity '+type);
  const e={id:this.nextId++,kind,type,owner,x,y,hp:def.hp,maxHp:def.hp,layer:'surface',level:1,angle:0,progress:1,task:{type:'idle'},crew:[],queue:[],cooldown:0,path:[],...extra};
  if(type==='spy'){e.disguised=false;e.exposed=false;}
  if(def.domain==='air'){e.fuel=100;e.landed=!!this._atRunway(e);}
  this.entities.push(e);if(kind==='building')this._pathRevision++;return e;
 }
 getEntity(id){return this.entities.find(e=>e.id===Number(id));}
 getDef(entity){if(!entity)return null;return (entity.kind==='unit'?D.units:entity.kind==='machine'?D.machines:D.buildings)[entity.type];}
 _living(owner){return this.entities.filter(e=>e.hp>0&&(owner==null||e.owner===owner));}
 _buildings(owner,type){return this.entities.filter(e=>e.hp>0&&e.kind==='building'&&e.owner===owner&&e.progress>=1&&(!type||e.type===type));}
 _has(owner,type){return this._buildings(owner,type).length>0;}
 _event(text,tone='info'){this.events.unshift({id:this.nextEventId++,time:this.time,text,tone});if(this.events.length>60)this.events.length=60;}
 _effect(type,x,y,extra={}){const life=type==='explosion'?.85:type==='ping'?2:.5;this.effects.push({type,x,y,life,maxLife:life,...extra});}
 _result(ok,message,entity){if(!ok&&message&&!this._aiSilent)this._event(message,'danger');return entity?{ok,message,entity}:{ok,message};}
 population(owner=0){
  let used=0,cap=0;for(const e of this.entities){if(e.hp<=0||e.owner!==owner)continue;if(e.kind==='unit')used++;if(e.kind==='building'){if(e.progress>=1)cap+=Math.floor((this.getDef(e).housing||0)*(1+(e.level-1)*.5));used+=(e.queue||[]).filter(q=>q.kind==='unit').length;}}
  return {used,cap};
 }
 quote(cost={},owner=0){const t=this.teams[owner],out={money:Number(cost.money)||0,metal:0,fuel:0,crystal:0,imports:0,affordable:false};if(!t)return out;for(const k of ['metal','fuel','crystal']){const n=Math.max(0,Number(cost[k])||0);out[k]=Math.min(Math.max(0,t[k]),n);out.imports+=Math.max(0,n-out[k])*MATERIAL_PRICE[k];}out.money+=out.imports;out.affordable=t.money+1e-6>=out.money;return out;}
 _spend(cost,owner=0){const q=this.quote(cost,owner);if(!q.affordable)return false;const t=this.teams[owner];for(const k of ['money','metal','fuel','crystal'])t[k]=Math.max(0,t[k]-q[k]);return q;}
 requirements(def,owner=0){if(!def)return ['Unknown technology'];return (def.requires||[]).filter(k=>!this._has(owner,k)).map(k=>D.buildings[k]?.name||k);}
 _placement(type,x,y,owner=0,options={}){
  const def=D.buildings[type];if(!def)return {ok:false,message:'Unknown building.'};
  if(!Number.isFinite(x)||!Number.isFinite(y))return {ok:false,message:'Choose a location on the battlefield.'};
  x=Math.floor(x)+.5;y=Math.floor(y)+.5;const r=def.size*.5;
  if(x-r<1||y-r<1||x+r>this.width-1||y+r>this.height-1)return {ok:false,message:'The building must fit inside the battlefield.'};
  if(type==='hq'&&this._living(owner).some(e=>e.type==='hq'))return {ok:false,message:'You already have a command headquarters.'};
  const missing=this.requirements(def,owner);if(missing.length)return {ok:false,message:'Requires '+missing.join(', ')+'.'};
  if(type!=='minibeacon'&&!options.connected&&!this._buildings(owner).some(b=>dist(b,{x,y})<=12+(this.getDef(b).size||1)*.5))return {ok:false,message:'Build within 12 tiles of a completed friendly structure.'};
  if(owner===0&&!this.canSee(x,y))return {ok:false,message:'Scout this location before constructing.'};
  let low=3,high=0;for(let yy=Math.floor(y-r+.1);yy<=Math.floor(y+r-.1);yy++)for(let xx=Math.floor(x-r+.1);xx<=Math.floor(x+r-.1);xx++){const t=this.tiles[yy]?.[xx];if(!t||t.type==='water'||t.type==='bridge')return {ok:false,message:type==='shipyard'?'Place the shipyard on land directly beside water.':'Buildings need solid land.'};low=Math.min(low,t.elevation);high=Math.max(high,t.elevation);}
  if(high-low>(type==='airfield'?1:2))return {ok:false,message:'This slope is too steep. Find more level ground.'};
  if(this.entities.some(e=>e.hp>0&&e.kind==='building'&&Math.abs(e.x-x)<(this.getDef(e).size+def.size)/2+(['wall','gate','heavygate'].includes(type)&&['wall','gate','heavygate'].includes(e.type)?0:.15)&&Math.abs(e.y-y)<(this.getDef(e).size+def.size)/2+(['wall','gate','heavygate'].includes(type)&&['wall','gate','heavygate'].includes(e.type)?0:.15)))return {ok:false,message:'Another structure occupies this footprint.'};
  if(this.entities.some(e=>e.hp>0&&e.kind!=='building'&&!e.boardedIn&&e.layer==='surface'&&this.getDef(e).domain!=='air'&&Math.abs(e.x-x)<r+.25&&Math.abs(e.y-y)<r+.25))return {ok:false,message:'Move ground forces clear of this building footprint before construction.'};
  if(type==='shipyard'&&!this._nearestWater(x,y,r+2))return {ok:false,message:'A shipyard must be beside the coast or river.'};
  if(type==='mine'&&!this._nearestDeposit(x,y,5))return {ok:false,message:'Place the mine within 5 tiles of a resource deposit.'};
  return {ok:true,message:'Ready to build.',x,y};
 }
 canPlace(type,x,y,owner=0){return this._placement(type,x,y,owner);}
 build(type,x,y,workerIds=[],owner=0,options={}){
  if(this.winner!==null)return this._result(false,'The battle is over. Start a new operation.');
  const p=this._placement(type,x,y,owner);if(!p.ok)return this._result(false,p.message);
  const def=D.buildings[type],workers=this._availableWorkers(owner,workerIds,{x:p.x,y:p.y});if(!workers.length)return this._result(false,'Construction needs at least one available person or crewed harvester.');
  const spent=this._spend(def.cost,owner);if(!spent)return this._result(false,'Not enough credits, including the cost of missing materials.');
  const e=this._spawn('building',type,owner,p.x,p.y,{progress:0,hp:def.hp*.25,constructionWork:0,...(type==='heavygate'?{gateAxis:options.gateAxis==='y'?'y':'x'}:{})});
  for(const w of workers)this._assign(w,{type:'build',targetId:e.id,x:e.x,y:e.y});
  if(owner===0)this._event(def.name+' construction started'+(spent.imports?' · imported materials '+Math.ceil(spent.imports)+' credits':'')+'.');
  return this._result(true,def.name+' under construction.',e);
 }
 _availableWorkers(owner,ids,point){
  const pool=this._living(owner).filter(e=>!e.boardedIn&&!e.garrisonedIn&&e.layer==='surface'&&(e.kind==='unit'&&e.type!=='mechanic'||e.type==='harvester'&&this._crewReady(e)));
  if(ids?.length)return pool.filter(e=>ids.includes(e.id));
  let chosen=pool.filter(e=>e.type==='engineer'&&(e.task.type==='idle'||e.task.type==='gather'));
  if(!chosen.length)chosen=pool.filter(e=>e.task.type==='idle');
  return chosen.sort((a,b)=>dist(a,point)-dist(b,point)).slice(0,3);
 }
 _queueProduction(kind,type,buildingId,owner=0){
  if(this.winner!==null)return this._result(false,'The battle is over.');
  const def=(kind==='unit'?D.units:D.machines)[type];if(!def)return this._result(false,'Unknown production order.');
  const missing=this.requirements(def,owner);if(missing.length)return this._result(false,'Requires '+missing.join(', ')+'.');
  const producer=def.producer||(kind==='unit'?'barracks':'factory');
  let b=buildingId?this.getEntity(buildingId):this._buildings(owner,producer).sort((a,b)=>a.queue.length-b.queue.length)[0];
  if(!b||b.hp<=0||b.owner!==owner||b.type!==producer||b.progress<1)return this._result(false,'A completed '+D.buildings[producer].name+' is required.');
  if(b.queue.length>=8)return this._result(false,'Production queue is full (8 orders).');
  if(kind==='unit'){const p=this.population(owner);if(p.used>=p.cap)return this._result(false,'Housing full. Build barracks or field quarters before recruiting.');}
  if(!this._spend(def.cost,owner))return this._result(false,'Insufficient credits to fund this order and its imported materials.');
  b.queue.push({kind,type,progress:0});if(owner===0)this._event(def.name+' queued.');return this._result(true,def.name+' queued.',b);
 }
 train(type,buildingId){return this._queueProduction('unit',type,buildingId,0);}
 produce(type,buildingId){return this._queueProduction('machine',type,buildingId,0);}
 upgrade(id,owner=0){
  const e=this.getEntity(id);if(!e||e.hp<=0||e.owner!==owner)return this._result(false,'Select one of your surviving forces.');
  if(e.level>=3)return this._result(false,'Already at maximum level.');if(e.progress<1)return this._result(false,'Finish construction before upgrading.');
  const def=this.getDef(e),cost={money:Math.ceil((def.cost.money*.65+40)*e.level)};
  if(!this._spend(cost,e.owner))return this._result(false,'Upgrade requires '+cost.money+' credits.');
  e.level++;const oldMax=e.maxHp;e.maxHp=Math.round(def.hp*(1+(e.level-1)*.3));e.hp=Math.min(e.maxHp,e.hp+e.maxHp-oldMax);this._fogTimer=0;
  if(owner===0)this._event(def.name+' upgraded to level '+e.level+'. Health, effectiveness and specialist abilities improved.','success');return this._result(true,'Upgrade complete.',e);
 }
 upgradeQuote(ids,owner=0){
  const all=[...new Set(Array.isArray(ids)?ids:[])].map(id=>this.getEntity(id)),eligible=all.filter(e=>e&&e.hp>0&&e.owner===owner&&e.level<3&&e.progress>=1);
  const money=eligible.reduce((n,e)=>n+Math.ceil((this.getDef(e).cost.money*.65+40)*e.level),0);
  return {ids:eligible.map(e=>e.id),count:eligible.length,skipped:all.length-eligible.length,money,affordable:!!eligible.length&&this.teams[owner].money>=money};
 }
 upgradeGroup(ids,owner=0){
  if(this.winner!==null||this.teams[owner].eliminated)return this._result(false,'Your command is no longer active.');
  if(!Array.isArray(ids)||ids.length>128)return this._result(false,'Select up to 128 forces at once.');const q=this.upgradeQuote(ids,owner);
  if(!q.count)return this._result(false,'No completed, upgradeable friendly forces selected.');
  if(!q.affordable)return this._result(false,'Group upgrade needs '+q.money+' credits. Nothing was spent.');
  this.teams[owner].money-=q.money;
  for(const id of q.ids){const e=this.getEntity(id),old=e.maxHp;e.level++;e.maxHp=Math.round(this.getDef(e).hp*(1+(e.level-1)*.3));e.hp=Math.min(e.maxHp,e.hp+e.maxHp-old);}
  this._fogTimer=0;const message=q.count+' selected forces upgraded for '+q.money+' credits.'+(q.skipped?' '+q.skipped+' unfinished, maximum-tier or ineligible selections skipped.':'');if(owner===0)this._event(message,'success');return this._result(true,message);
 }
 _formationPlan(selected,x,y,mode,target){
  const plans=new Map();if(!['move','attack'].includes(mode)||selected.length<2)return plans;
  const eligible=selected.filter(e=>e.owner===0&&!e.boardedIn&&!e.garrisonedIn&&(e.kind!=='machine'||this._crewReady(e))&&(mode!=='attack'||e.type!=='mechanic'));
  for(const domain of ['land','sea','air','underground']){
   const members=eligible.filter(e=>this._domain(e)===domain);if(members.length<2)continue;
   const center=members.reduce((a,e)=>({x:a.x+e.x/members.length,y:a.y+e.y/members.length}),{x:0,y:0}),len=Math.hypot(x-center.x,y-center.y),dx=len>.05?(x-center.x)/len:Math.cos(members[0].angle||0),dy=len>.05?(y-center.y)/len:Math.sin(members[0].angle||0);
   const score=e=>{const d=this.getDef(e);return (!d.damage||['medic','general','engineer','pilot','spy','investigator','pioneer'].includes(e.type)?.18:1)*e.hp/(1-Math.min(.65,(d.armor||0)+(e.level-1)*.04))/(1+Math.max(0,(d.range||0)-5)*.3);};
   const rear=e=>{const d=this.getDef(e);return !d.damage||['medic','general','engineer','pilot','spy','investigator','pioneer'].includes(e.type)||(d.range||0)>=6&&e.hp/(1-(d.armor||0))<380;};
   members.sort((a,b)=>Number(rear(a))-Number(rear(b))||score(b)-score(a)||a.id-b.id);const leader=members[0],cols=Math.max(2,Math.ceil(Math.sqrt(members.length))),frontSlots=Math.min(cols,members.filter(e=>!rear(e)).length||1),spacing=members.some(e=>e.kind==='machine')?1.65:1.05,rows=1+Math.ceil((members.length-frontSlots)/cols),speed=Math.min(...members.map(e=>this.getDef(e).speed*(1+(e.level-1)*.08))),frontRange=Math.max(2.5,Math.min(5,...members.filter(e=>this.getDef(e).damage).map(e=>this.getDef(e).range||3)));
   for(let i=0;i<members.length;i++){
    const e=members[i],row=i<frontSlots?0:1+Math.floor((i-frontSlots)/cols),column=i<frontSlots?i:(i-frontSlots)%cols,side=column===0?0:(column%2?1:-1)*Math.ceil(column/2)*spacing,back=row*spacing;
    let tx=clamp(x+dx*((rows-1)*spacing*.5-back)-dy*side,.5,this.width-.5),ty=clamp(y+dy*((rows-1)*spacing*.5-back)+dx*side,.5,this.height-.5);
    if(!target&&!this._passable(Math.floor(tx),Math.floor(ty),e)){
     let found=false;for(let r=1;r<=4&&!found;r++)for(let k=0;k<12;k++){const a=k*Math.PI/6,nx=clamp(tx+Math.cos(a)*r,.5,this.width-.5),ny=clamp(ty+Math.sin(a)*r,.5,this.height-.5);if(this._passable(Math.floor(nx),Math.floor(ny),e)){tx=nx;ty=ny;found=true;break;}}
    }
    plans.set(e.id,{x:tx,y:ty,formation:{leaderId:leader.id,dx,dy,back,side,speed,frontRange,expires:this.time+180}});
   }
  }return plans;
 }
 _formationLeader(e){
  const f=e.formation;if(!f)return null;const leader=this.getEntity(f.leaderId);
  if(!leader||leader.hp<=0||leader.owner!==e.owner||leader.layer!==e.layer||leader.boardedIn||leader.returning||f.expires<this.time||!leader.formation){delete e.formation;return null;}
  if(leader._pathTarget&&!leader.path.length&&!leader.autoTargetId&&!leader.task.targetId&&['move','attack'].includes(leader.task.type)&&dist(leader,leader.task)>3){delete e.formation;return null;}return leader;
 }
 _formationSpeed(e,speed){
  const leader=this._formationLeader(e);if(!leader)return speed;const f=e.formation;if(leader.id!==e.id){const ahead=(e.x-leader.x)*f.dx+(e.y-leader.y)*f.dy+f.back;if(ahead>.75)return 0;if(ahead>0)return Math.min(speed,f.speed)*.65;}
  return Math.min(speed,e.formation.speed);
 }
 _formationCombatAdvance(e,target,dt){
  const leader=this._formationLeader(e);if(leader?.id!==e.id||!this._canTarget(e,target)||this._domain(e)==='air'||this.getDef(target).domain==='air')return;
  const range=e.formation.frontRange+this._targetRadius(target);if(dist(e,target)>range)this._moveToward(e,target.x,target.y,dt,range*.92);
 }

 demolish(id,owner=0){
  const b=this.getEntity(id);if(!b||b.hp<=0||b.kind!=='building'||b.owner!==owner)return this._result(false,'Select one of your buildings.');
  if(b.type==='hq')return this._result(false,'Your headquarters cannot be demolished.');if(this.teams[owner].eliminated||this.winner!==null)return this._result(false,'Your command is no longer active.');
  if(b.garrisonId){const u=this.getEntity(b.garrisonId);if(u)this._leavePerch(u,true);delete b.garrisonId;}
  b.hp=0;b.queue=[];for(const u of this.entities)if(u.hp>0&&u.task?.targetId===b.id){if(u.task.type==='build')this._nextConstruction(u);else this._assign(u,{type:'idle'});}
  this._pathRevision++;this._fogTimer=0;this._updateFog();this._effect('dust',b.x,b.y,{owner});this._event(this.getDef(b).name+' demolished. No refund.');return this._result(true,'Building removed. Its construction and production costs are not refunded.');
 }
 _assign(e,task){delete e.formation;delete e.staffTarget;delete e.staffRole;delete e.roamNext;delete e.buildQueue;delete e.clearQueue;delete e.patrolling;e.task={...task};delete e.autoTargetId;delete e.autoOrigin;delete e.autoReason;delete e.autoUntil;e._threatCheck=0;if(e.returning&&this.getDef(e).domain==='air')e.resumeTask={...task};e.path=[];e._pathTarget=null;e._pathWait=0;}
 command(ids,x,y,options={}){
  if(!Number.isFinite(x)||!Number.isFinite(y)||!this._inside(x,y))return this._result(false,'Choose a point inside the battlefield.');
  const mode=options.mode||'move',target=this.getEntity(options.targetId),selected=(ids||[]).map(id=>this.getEntity(id)).filter(e=>e&&e.hp>0&&(e.owner===0||e.type==='spy'&&(e.coverOwner===undefined||e.coverOwner===0)&&e.disguised&&!e.exposed&&['move','attack'].includes(mode))&&!e.boardedIn&&e.kind!=='building');
  if(!selected.length)return this._result(false,'Select people or crewed machines first.');
  let count=0,skipped=0,rejection='';const plans=this._formationPlan(selected,x,y,mode,target);
  for(let i=0;i<selected.length;i++){
   const e=selected[i];if(e.garrisonedIn&&!this._leavePerch(e))continue;if(e.type==='mechanic'&&['build','gather','infiltrate','attack'].includes(mode)){skipped++;continue;}if(e.kind==='machine'&&!this._crewReady(e)){skipped++;continue;}
   if(mode==='garrison'&&(!target||!this._canGarrison(e,target))){skipped++;continue;}
   if(mode==='infiltrate'&&e.type!=='spy'){skipped++;continue;}
   if(mode==='gather'&&e.kind==='machine'&&!['harvester','drill'].includes(e.type)){skipped++;continue;}
   if(['build','repair'].includes(mode)&&e.kind==='machine'&&e.type!=='harvester'){skipped++;continue;}
   if(mode==='build'&&(!target||target.owner!==e.owner||target.kind!=='building'))continue;
   if(mode==='repair'&&(!target||target.owner!==e.owner||e.type==='mechanic'&&(target.kind==='unit'||target.progress<1)))continue;
   if(mode==='attack'&&target&&target.owner!==e.owner&&!this.isVisible(target))continue;
   if(mode==='infiltrate'){if(!target||target.owner===e.owner||target.kind!=='building'){skipped++;continue;}if(e.exposed&&!this._buildings(e.owner,'radar').some(b=>dist(e,b)<4)){skipped++;rejection='This operative is exposed. Return within 4 tiles of a friendly recon station before infiltrating again.';continue;}e.disguised=true;e.exposed=false;e.coverOwner=target.owner;}
   if(mode==='attack'&&e.type==='spy'&&e.owner===0){e.disguised=false;e.exposed=true;}
   const plan=plans.get(e.id);let tx=plan&&!target?plan.x:x,ty=plan&&!target?plan.y:y;
   if(e.owner!==0){if(!e.coverTask)e.coverTask={...e.task};e.coverUntil=this.time+3;}
   this._assign(e,{type:e.owner===0?mode:'move',x:tx,y:ty,...(target&&e.owner===0?{targetId:target.id}:{})});if(plan)e.formation=plan.formation;count++;
  }
  if(!count)return this._result(false,rejection||(skipped?'Those units cannot perform this order. Machines need a full crew.':'No eligible units.'));
  return this._result(true,count+' unit'+(count===1?'':'s')+' ordered'+(skipped?' · '+skipped+' need crew or a different role':'')+'.');
 }
 _roam(e,dt){
  if(!e.roamNext||this.time>=e.roamNext||dist(e,e.task)<1){for(let i=0;i<24;i++){const x=1+Math.floor(this._random()*(this.width-2)),y=1+Math.floor(this._random()*(this.height-2));if(this._passable(x,y,e)&&Math.hypot(e.x-x,e.y-y)>5){e.task={type:'roam',x:x+.5,y:y+.5};e.path=[];e._pathTarget=null;break;}}e.roamNext=this.time+45;}
  if(this._moveToward(e,e.task.x,e.task.y,dt,.7))e.roamNext=0;else if(!e.path.length&&e._pathTarget)e.roamNext=Math.min(e.roamNext,this.time+2);
 }
 _dispatchStaff(u,target,role){this._assign(u,{type:'staff',targetId:target.id,x:target.x,y:target.y});u.staffTarget=target.id;u.staffRole=role;}
 _autoStaff(owner){
  const bars=this._buildings(owner,'barracks').filter(b=>b.autoStaff);if(!bars.length)return;
  const living=this._living(owner),demand=[];for(const b of living.filter(e=>e.kind==='building')){
   if(b.progress<1||b.queue[0]?.kind==='machine'){const workers=b.progress<1?living.filter(u=>u.kind==='unit'&&!u.boardedIn&&!u.garrisonedIn&&u.task.type==='build'&&u.task.targetId===b.id):this._assemblyWorkers(b);
    const assigned=new Set([...workers.map(u=>u.id),...living.filter(u=>u.staffTarget===b.id&&u.staffRole==='worker').map(u=>u.id)]);demand.push({target:b,role:'worker',type:'engineer',need:Math.max(0,2-assigned.size)});}
  }
  for(const m of living.filter(e=>e.kind==='machine'&&e.layer==='surface'&&(this.getDef(e).domain!=='air'||this._atRunway(e)&&e.landed!==false))){this._crewReady(m);const enroute=living.filter(u=>u.staffTarget===m.id&&u.staffRole==='crew').length;demand.push({target:m,role:'crew',type:this._has(owner,'factory')?'pilot':'rifleman',need:Math.max(0,this.getDef(m).crew-m.crew.length-enroute)});}
  let budget=2;for(const b of bars)b.staffStatus='Monitoring demand';
  for(const request of demand){const reserved=this._buildings(owner,'barracks').reduce((n,b)=>n+b.queue.filter(q=>q.staffTarget===request.target.id&&q.staffRole===request.role).length,0);let need=request.need-reserved;
   while(need>0&&budget>0){const barracks=bars.filter(b=>b.queue.length<4).sort((a,b)=>a.queue.length-b.queue.length||dist(a,request.target)-dist(b,request.target))[0];if(!barracks)break;
    const result=this._queueProduction('unit',request.type,barracks.id,owner);if(!result.ok){barracks.staffStatus=this.population(owner).used>=this.population(owner).cap?'Housing full':'Waiting for credits / materials';break;}
    Object.assign(barracks.queue[barracks.queue.length-1],{staffTarget:request.target.id,staffRole:request.role});barracks.staffStatus='Sending '+(request.role==='worker'?'engineers':'crew')+' to '+this.getDef(request.target).name;need--;budget--;
   }
  }
 }
 _updateStaff(u,dt){
  const target=this.getEntity(u.staffTarget);if(!target||target.hp<=0||target.owner!==u.owner){this._assign(u,{type:'idle'});return;}
  if(u.staffRole==='worker'){
   if(target.progress>=1&&!target.queue.some(q=>q.kind==='machine')){this._assign(u,{type:'idle'});return;}
   const reach=this._targetRadius(target)+1.4;if(dist(u,target)>reach){this._moveToward(u,target.x,target.y,dt,reach);return;}
   this._assign(u,{type:'build',targetId:target.id,x:target.x,y:target.y});u.staffTarget=target.id;u.staffRole='worker';return;
  }
  if(target.kind!=='machine'||target.layer!=='surface'||this._crewReady(target)){this._assign(u,{type:'idle'});return;}
  const domain=this.getDef(target).domain;if(domain==='air'&&(!this._atRunway(target)||target.landed===false))return;
  const reach=domain==='sea'?4.5:2.5;if(dist(u,target)>reach){this._moveToward(u,target.x,target.y,dt,reach);return;}
  this._assign(u,{type:'idle'});u.boardedIn=target.id;u.x=target.x;u.y=target.y;u.layer=target.layer;target.crew.push(u.id);
 }
 _crewReady(e){const def=this.getDef(e);if(e.kind!=='machine')return true;e.crew=e.crew.filter(id=>{const u=this.getEntity(id);return u&&u.hp>0&&u.boardedIn===e.id;});return e.crew.length>=def.crew;}
 _atRunway(e){return this._buildings(e.owner,'airfield').find(b=>dist(e,b)<3);}
 crew(machineId,unitIds=[]){
  const m=this.getEntity(machineId);if(!m||m.kind!=='machine'||m.owner!==0||m.hp<=0)return this._result(false,'Select a friendly machine.');if(m.layer==='underground')return this._result(false,'Surface the drill before boarding.');
  const def=this.getDef(m);if(def.domain==='air'&&(!this._atRunway(m)||m.landed===false))return this._result(false,'Aircraft crew can board only after landing at an operational friendly runway.');this._crewReady(m);const missing=def.crew-m.crew.length;if(missing<=0)return this._result(false,'This machine already has a full crew.');
  let pool=this._living(m.owner).filter(e=>e.kind==='unit'&&e.type!=='mechanic'&&!e.boardedIn&&!e.garrisonedIn&&e.layer==='surface'&&dist(e,m)<=14);
  if(unitIds.length)pool=pool.filter(e=>unitIds.includes(e.id));else pool=pool.filter(e=>e.task.type==='idle');const priority=e=>e.type==='pilot'?-100:['engineer','medic','spy','investigator','general'].includes(e.type)?30:0;pool.sort((a,b)=>priority(a)+dist(a,m)-priority(b)-dist(b,m));
  for(const u of pool.slice(0,missing)){u.boardedIn=m.id;u.x=m.x;u.y=m.y;u.layer=m.layer;u.task={type:'idle'};m.crew.push(u.id);}
  const ready=this._crewReady(m);if(!ready)return this._result(false,def.name+' has '+m.crew.length+'/'+def.crew+' crew. Move more people within 14 tiles.');
  this._event(def.name+' fully crewed and operational.','success');return this._result(true,'Crew aboard. Machine operational.',m);
 }
 uncrew(machineId){const m=this.getEntity(machineId);if(!m||m.kind!=='machine'||m.owner!==0||m.hp<=0)return this._result(false,'Select a friendly machine.');if(m.layer==='underground')return this._result(false,'Surface the drill before disembarking.');if(this.getDef(m).domain==='air'&&(!this._atRunway(m)||m.landed===false))return this._result(false,'Land at an operational friendly runway before disembarking aircraft crew.');const ids=[...m.crew];for(const id of ids){const u=this.getEntity(id);if(u&&u.hp>0){delete u.boardedIn;u.layer='surface';const p=this._spawnPoint(m,'unit',u.type);u.x=p.x;u.y=p.y;u.task={type:'idle'};}}m.crew=[];m.returning=false;delete m.resumeTask;this._assign(m,{type:'idle'});return this._result(true,ids.length+' crew disembarked.');}
 ability(ids,name,point={}){
  const all=(ids||[]).map(id=>this.getEntity(id)).filter(e=>e&&e.hp>0&&(e.owner===0||name==='stop'&&e.type==='spy'&&(e.coverOwner===undefined||e.coverOwner===0)&&e.disguised&&!e.exposed)&&!e.boardedIn);
  if(name==='stop'){for(const e of all){if(e.owner!==0){if(!e.coverTask)e.coverTask={...e.task};e.coverUntil=this.time+3;}this._assign(e,{type:'idle'});}return this._result(!!all.length,'Orders cleared.');}
  if(name==='roam'){let n=0;for(const e of all){if(e.kind==='building'||e.kind==='machine'&&!this._crewReady(e))continue;if(e.garrisonedIn&&!this._leavePerch(e))continue;this._assign(e,{type:'roam',x:e.x,y:e.y});n++;}return this._result(!!n,n+' forces roaming. They choose routes, engage visible threats and resume exploring. Stop or give another order to cancel.');}
  if(name==='autostaff'){const bars=all.filter(e=>e.type==='barracks'&&e.progress>=1);for(const b of bars){b.autoStaff=!b.autoStaff;b.staffStatus=b.autoStaff?'Monitoring demand':'Off';}return this._result(!!bars.length,bars.length?'Automatic staffing '+(bars[0].autoStaff?'enabled. Normal costs and housing apply.':'disabled. Already paid recruits finish their assignments.'):'Select completed barracks.');}
  if(name==='mount'){const tank=all.find(e=>e.type==='tank');if(!tank)return this._result(false,'Select a friendly tank.');const unit=this._living(tank.owner).filter(u=>this._canGarrison(u,tank)&&u.task.type==='idle'&&dist(u,tank)<=14).sort((a,b)=>dist(a,tank)-dist(b,tank))[0];if(!unit)return this._result(false,'Bring an idle combat soldier within 14 tiles of an empty tank roof.');this._assign(unit,{type:'garrison',targetId:tank.id,x:tank.x,y:tank.y});return this._result(true,'Soldier moving to the roof gun. Internal crew remain separate.');}
  if(name==='land'){const planes=all.filter(e=>this.getDef(e).domain==='air'&&this._crewReady(e));let n=0;for(const e of planes){if(!this._buildings(e.owner,'airfield').length)continue;e.returning=true;e.resumeTask={type:'idle'};e.path=[];e._pathTarget=null;n++;}return this._result(!!n,n?'Aircraft returning to an operational runway.':'Select crewed aircraft and keep a friendly runway operational.');}
  if(name==='scan'){
   const station=this._buildings(0,'uplink')[0],scout=all.find(e=>e.type==='scout')||(!all.length?this._living(0).find(e=>e.type==='scout'&&!e.boardedIn):null);const source=station||scout;
   if(!source)return this._result(false,'Select a pathfinder or build a satellite uplink.');if((source.scanReady||0)>this.time)return this._result(false,'Scan cooling down: '+Math.ceil(source.scanReady-this.time)+' seconds.');
   const x=Number.isFinite(point.x)?clamp(point.x,.5,this.width-.5):source.x,y=Number.isFinite(point.y)?clamp(point.y,.5,this.height-.5):source.y;
   if(!station&&Math.hypot(x-source.x,y-source.y)>15)return this._result(false,'Pathfinder scans reach 15 tiles. An uplink can scan anywhere.');
   if(station&&!this._spend({money:55},0))return this._result(false,'Satellite sweep costs 55 credits.');
   source.scanReady=this.time+(station?28:35);this.scans.push({x,y,radius:station?12+station.level*2:9,expires:this.time+12,owner:0});this._effect('ping',x,y,{radius:station?14:9,owner:0});this._updateFog();return this._result(true,'Surface reconnaissance active for 12 seconds.');
  }
  if(name==='investigate'){const investigators=all.filter(e=>e.type==='investigator');if(!investigators.length)return this._result(false,'Select a private investigator.');let sweeps=0,found=0;for(const p of investigators){if((p.investigateReady||0)>this.time)continue;p.investigateReady=this.time+8;sweeps++;found+=this._investigate(p);}if(!sweeps)return this._result(false,'Investigators are preparing their next sweep.');this._event(found?'Counterintelligence exposed '+found+' hostile operative'+(found===1?'':'s')+'.':'Investigation completed. No operative identified this sweep.',found?'success':'info');return this._result(true,found?'Hostile disguise exposed.':'No operative identified. Detection is probabilistic.');}
  if(name==='rally'){const general=all.find(e=>e.type==='general');if(!general)return this._result(false,'Select a field general to rally your army.');if((general.rallyReady||0)>this.time)return this._result(false,'Rally is still cooling down.');general.rallyReady=this.time+35;for(const e of this._living(0))if(dist(e,general)<10)e.rallyUntil=this.time+15;this._effect('ping',general.x,general.y,{owner:0,radius:10});return this._result(true,'Nearby forces rallied: +35% damage and +15% speed for 15 seconds.');}
  if(name==='burrow'){const drills=all.filter(e=>this.getDef(e).domain==='underground'&&this._crewReady(e));if(!drills.length)return this._result(false,'Select a fully crewed underground machine.');let n=0;for(const e of drills){if(e.layer==='underground'&&!this._passable(Math.floor(e.x),Math.floor(e.y),{...e,layer:'surface'}))continue;e.layer=e.layer==='surface'?'underground':'surface';for(const id of e.crew){const u=this.getEntity(id);if(u)u.layer=e.layer;}this._assign(e,{type:'idle'});this._effect('dust',e.x,e.y,{layer:e.layer,owner:e.owner});n++;}if(!n)return this._result(false,'Move beneath clear land before surfacing.');return this._result(true,n+' drill'+(n>1?'s':'')+' changed depth. Switch the map layer to follow.');}
  if(name==='patrol'){const rovers=all.filter(e=>e.type==='seismicrover'&&this._crewReady(e));for(const e of rovers)this._startPatrol(e);this._updateFog();return this._result(!!rovers.length,'HQ seismic patrol active. Coverage is 10 / 14 / 18 tiles by tier.');}
  if(name==='minecharge'){let n=0;for(const e of all)if(['drill','interceptor'].includes(e.type)&&e.layer==='underground'&&this._crewReady(e)&&this._layMine(e))n++;return this._result(!!n,n?'Proximity charge placed. Arms in 2 seconds; triggers only on an enemy underground machine.':'Needs a crewed underground drill or interceptor, 60 credits, 15 fuel, 8 crystal and a 12-second cooldown.');}
  if(name==='perch'){const wall=all.find(e=>e.type==='wall'&&e.progress>=1);if(!wall||wall.perch)return this._result(false,'Select a completed wall without a perch.');if(!this._spend({money:120},wall.owner))return this._result(false,'A troop perch costs 120 credits.');wall.perch=true;return this._result(true,'Perch ready. Station one troop for +2 weapon range, +3 vision and 25% protection.');}
  if(name==='garrison'){const wall=all.find(e=>e.type==='wall'&&e.perch);if(!wall)return this._result(false,'Select a wall with a perch.');const troop=this._living(wall.owner).filter(e=>this._canGarrison(e,wall)&&e.task.type==='idle'&&dist(e,wall)<=12).sort((a,b)=>dist(a,wall)-dist(b,wall))[0];if(!troop)return this._result(false,'Move an available combat troop within 12 tiles. One troop per perch.');this._assign(troop,{type:'garrison',targetId:wall.id});return this._result(true,'Troop moving to the wall perch.');}
  if(name==='leavePerch'){let n=0;for(const wall of all)if(wall.garrisonId){const u=this.getEntity(wall.garrisonId);if(u&&this._leavePerch(u))n++;}return this._result(!!n,n?'Gunner dismounted.':'No occupied wall perch or tank roof selected, or no clear exit.');}
  if(name==='bomb'){const drills=all.filter(e=>e.type==='drill'&&e.layer==='underground'&&this._crewReady(e));if(!drills.length)return this._result(false,'Select a fully crewed underground Mole drill.');let n=0;for(const e of drills){if((e.bombReady||0)>this.time)continue;if(!this._spend({money:100,fuel:25,crystal:10},e.owner))continue;e.bombReady=this.time+25;this.charges.push({id:this.nextId++,x:e.x,y:e.y,owner:e.owner,explodeAt:this.time+10,damage:1000*(1+(e.level-1)*.2),radius:4,layer:'underground'});n++;}return this._result(!!n,n?'Charge armed. Detonation in 10 seconds—move your drill clear!':'Charges need 100 credits, 25 fuel and 10 crystal, with a 25 second cooldown.');}
  return this._result(false,'Unknown tactical ability.');
 }
 _investigate(p){let found=0;for(const e of this._living())if(e.owner!==p.owner&&e.type==='spy'&&e.disguised&&!e.exposed&&dist(e,p)<=7+p.level&&this._random()<Math.min(.9,.46+(p.level-1)*.16)){e.exposed=true;e.disguised=false;found++;this._effect('ping',e.x,e.y,{owner:p.owner,radius:2});if(p.owner===0)this._event('Undercover operative exposed near your '+D.units[p.type].name+'!','danger');}return found;}
 canSee(x,y,layer='surface'){const xx=Math.floor(x),yy=Math.floor(y);if(!this._inside(xx,yy))return false;return !!(layer==='underground'?this.undergroundVisible:this.visible)[yy]?.[xx];}
 isVisible(e){if(!e||e.hp<=0)return false;if(e.owner===0)return true;return this.canSee(e.x,e.y,e.layer);}
 _teamCanSee(owner,x,y,layer='surface'){const xx=Math.floor(x),yy=Math.floor(y);return this._inside(xx,yy)&&!!(layer==='underground'?this._underVisibility[owner]:this._visibility[owner])[yy]?.[xx];}
 _reveal(grid,x,y,r){for(let yy=Math.max(0,Math.floor(y-r));yy<=Math.min(this.height-1,Math.ceil(y+r));yy++)for(let xx=Math.max(0,Math.floor(x-r));xx<=Math.min(this.width-1,Math.ceil(x+r));xx++)if((xx+.5-x)**2+(yy+.5-y)**2<=r*r)grid[yy][xx]=true;}
 _updateFog(){
  this._visibility=this.teams.map(()=>this._blankGrid());this._underVisibility=this.teams.map(()=>this._blankGrid());
  for(const e of this.entities){if(e.hp<=0||e.boardedIn||e.progress<1)continue;const def=this.getDef(e);if(e.layer==='surface')this._reveal(this._visibility[e.owner],e.x,e.y,(def.sight||6)+(e.level-1)+(e.garrisonedIn?3:0));if(e.layer==='underground'&&def.undergroundSight&&this._crewReady(e))this._reveal(this._underVisibility[e.owner],e.x,e.y,def.undergroundSight+e.level-1);if(e.patrolling&&this._crewReady(e)){const hq=this._buildings(e.owner,'hq')[0];if(hq&&dist(e,hq)<=10+(e.level-1)*4)this._reveal(this._underVisibility[e.owner],hq.x,hq.y,10+(e.level-1)*4);}if(e.type==='sensor')this._reveal(this._underVisibility[e.owner],e.x,e.y,def.undergroundSight+(e.level-1)*3);}
  for(const s of this.scans)if(s.expires>this.time)this._reveal(this._visibility[s.owner],s.x,s.y,s.radius);
  this.visible=this._visibility[0];this.undergroundVisible=this._underVisibility[0];for(let y=0;y<this.height;y++)for(let x=0;x<this.width;x++)if(this.visible[y][x])this.explored[y][x]=true;
 }
 _nearestDeposit(x,y,r=5){let best=null,bd=Infinity;for(let yy=Math.max(0,Math.floor(y-r));yy<=Math.min(this.height-1,Math.ceil(y+r));yy++)for(let xx=Math.max(0,Math.floor(x-r));xx<=Math.min(this.width-1,Math.ceil(x+r));xx++){const res=this.tiles[yy][xx].resource,dd=Math.hypot(xx+.5-x,yy+.5-y);if(res&&res.amount>0&&dd<=r&&dd<bd){best={x:xx+.5,y:yy+.5,resource:res};bd=dd;}}return best;}
 _nearestWater(x,y,r=6){let best=null,bd=Infinity;for(let yy=Math.max(0,Math.floor(y-r));yy<=Math.min(this.height-1,Math.ceil(y+r));yy++)for(let xx=Math.max(0,Math.floor(x-r));xx<=Math.min(this.width-1,Math.ceil(x+r));xx++){const dd=Math.hypot(xx+.5-x,yy+.5-y);if(this.tiles[yy][xx].type==='water'&&dd<=r&&dd<bd){best={x:xx+.5,y:yy+.5};bd=dd;}}return best;}
 _domain(e){const d=this.getDef(e);return e.layer==='underground'?'underground':d.domain==='underground'?'land':d.domain||'land';}
 _passable(x,y,e){
  if(!this._inside(x,y))return false;const domain=this._domain(e),t=this.tiles[y][x];if(domain==='air'||domain==='underground')return true;
  if(domain==='sea')return t.type==='water'||t.type==='bridge';if(t.type==='water'&&!this.getDef(e).amphibious)return false;
  if(this._blocksRevision!==this._pathRevision){
   this._blocks=this._blankGrid();this._gateOwners=new Uint8Array(this.width*this.height);
   for(const b of this.entities){if(b.hp<=0||b.kind!=='building')continue;const gate=['gate','heavygate'].includes(b.type);if((gate||b.type==='wall')&&b.progress<1)continue;
    const r=this.getDef(b).size*.5,edge=gate?r:r-.05;
    for(let yy=Math.max(0,Math.floor(b.y-r));yy<=Math.min(this.height-1,Math.ceil(b.y+r));yy++)for(let xx=Math.max(0,Math.floor(b.x-r));xx<=Math.min(this.width-1,Math.ceil(b.x+r));xx++)if(Math.abs(xx+.5-b.x)<edge&&Math.abs(yy+.5-b.y)<edge){if(gate)this._gateOwners[yy*this.width+xx]|=1<<b.owner;else this._blocks[yy][xx]=true;}
   }this._blocksRevision=this._pathRevision;
  }
  return !this._blocks[y][x]&&!(this._gateOwners[y*this.width+x]&~(1<<e.owner));
 }
 _path(e,x,y){
  const domain=this._domain(e);if(domain==='air'||domain==='underground')return [{x:clamp(x,.5,this.width-.5),y:clamp(y,.5,this.height-.5)}];
  const sx=clamp(Math.floor(e.x),0,this.width-1),sy=clamp(Math.floor(e.y),0,this.height-1);let gx=clamp(Math.floor(x),0,this.width-1),gy=clamp(Math.floor(y),0,this.height-1);
  if(!this._passable(gx,gy,e)){let found=null,best=Infinity;for(let radius=1;radius<=7&&!found;radius++)for(let yy=gy-radius;yy<=gy+radius;yy++)for(let xx=gx-radius;xx<=gx+radius;xx++)if(this._passable(xx,yy,e)){const score=Math.hypot(xx-gx,yy-gy)+Math.hypot(xx-sx,yy-sy)*.03;if(score<best){best=score;found={x:xx,y:yy};}}if(!found)return [];gx=found.x;gy=found.y;}
  if(sx===gx&&sy===gy)return [{x:gx+.5,y:gy+.5}];
  const n=this.width*this.height,start=sy*this.width+sx,goal=gy*this.width+gx,g=new Float64Array(n).fill(Infinity),came=new Int32Array(n).fill(-1),closed=new Uint8Array(n),open=[];g[start]=0;const heuristic=(id)=>Math.hypot(id%this.width-gx,Math.floor(id/this.width)-gy);
  // A binary priority queue keeps long cross-continent routes responsive on the larger theater.
  const push=(id,f)=>{const entry={id,f};let i=open.length;open.push(entry);while(i){const p=(i-1)>>1;if(open[p].f<=f)break;open[i]=open[p];i=p;}open[i]=entry;};
  const pop=()=>{const first=open[0],last=open.pop();if(open.length){let i=0;while(i*2+1<open.length){let child=i*2+1;if(child+1<open.length&&open[child+1].f<open[child].f)child++;if(open[child].f>=last.f)break;open[i]=open[child];i=child;}open[i]=last;}return first.id;};push(start,heuristic(start));
  while(open.length){const cur=pop();if(closed[cur])continue;if(cur===goal){const route=[];let k=goal;while(k!==start&&k>=0){route.push({x:k%this.width+.5,y:Math.floor(k/this.width)+.5});k=came[k];}return route.reverse();}closed[cur]=1;const cx=cur%this.width,cy=Math.floor(cur/this.width);
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dy)continue;const nx=cx+dx,ny=cy+dy;if(!this._passable(nx,ny,e))continue;if(dx&&dy&&(!this._passable(cx+dx,cy,e)||!this._passable(cx,cy+dy,e)))continue;const id=ny*this.width+nx;if(closed[id])continue;const tile=this.tiles[ny][nx],speed=D.terrains[tile.type].speed,ng=g[cur]+(dx&&dy?1.414:1)/speed+Math.abs(tile.elevation-this.tiles[cy][cx].elevation)*.18;if(ng<g[id]){came[id]=cur;g[id]=ng;push(id,ng+heuristic(id));}}
  }return [];
 }
 _moveToward(e,x,y,dt,stop=0){
  if(Math.hypot(e.x-x,e.y-y)<=stop)return true;
  const goal=Math.floor(x)+','+Math.floor(y);e._pathWait=Math.max(0,(e._pathWait||0)-dt);
  if(e._pathTarget!==goal||e._pathRev!==this._pathRevision||(!e.path.length&&e._pathWait<=0)){
   // Spread a large squad's route requests over simulation steps instead of one long frame.
   // Direct path queries remain synchronous for placement and validation.
   if(this._pathBudget===0)return false;if(Number.isFinite(this._pathBudget))this._pathBudget--;
   e.path=this._path(e,x,y);e._pathTarget=goal;e._pathRev=this._pathRevision;e._pathWait=1.3;
  }
  if(!e.path.length)return false;
  const def=this.getDef(e),tile=this.tiles[clamp(Math.floor(e.y),0,this.height-1)][clamp(Math.floor(e.x),0,this.width-1)],domain=this._domain(e);let speed=def.speed*(1+(e.level-1)*.08)*(e.rallyUntil>this.time?1.15:1);
  if(domain==='land')speed*=D.terrains[tile.type].speed*(tile.type==='marsh'&&e.kind==='machine'?.7:1);if(def.amphibious&&tile.type==='water')speed*=.55;if(domain==='underground')speed*=.85;
  speed=this._formationSpeed(e,speed);let remaining=speed*dt;while(remaining>0&&e.path.length){const p=e.path[0],dx=p.x-e.x,dy=p.y-e.y,d=Math.hypot(dx,dy);if(d<.02){e.path.shift();continue;}e.angle=Math.atan2(dy,dx);const step=Math.min(d,remaining);e.x+=dx/d*step;e.y+=dy/d*step;remaining-=step;if(step>=d-.001)e.path.shift();}
  if(e.garrisonId){const rider=this.getEntity(e.garrisonId);if(rider){rider.x=e.x;rider.y=e.y;}}
  for(const id of e.crew||[]){const u=this.getEntity(id);if(u){u.x=e.x;u.y=e.y;u.layer=e.layer;}}
  if(e.layer==='underground'&&e.owner===0){const cell=Math.floor(e.x)+','+Math.floor(e.y);if(e._tunnelCell!==cell){e._tunnelCell=cell;this.tunnels.push({x:Math.floor(e.x)+.5,y:Math.floor(e.y)+.5});if(this.tunnels.length>1200)this.tunnels.shift();}}
  return Math.hypot(e.x-x,e.y-y)<=Math.max(stop,.65);
 }
 _spawnPoint(b,kind,type){const dummy={kind,type,owner:b.owner,layer:'surface',id:-1},def=this.getDef(dummy),size=this.getDef(b).size||1;if(def.domain==='sea')return this._nearestWater(b.x,b.y,8)||{x:b.x,y:b.y};if(def.domain==='air')return {x:b.x+(this.nextId%3-1)*.6,y:b.y+size*.5};for(let r=size*.5+.8;r<9;r+=.8)for(let i=0;i<12;i++){const a=(i+this.nextId%12)*Math.PI/6,p={x:clamp(b.x+Math.cos(a)*r,.5,this.width-.5),y:clamp(b.y+Math.sin(a)*r,.5,this.height-.5)};if(this._passable(Math.floor(p.x),Math.floor(p.y),dummy)&&!this.entities.some(u=>u.hp>0&&!u.boardedIn&&u.kind!=='building'&&dist(u,p)<.7))return p;}return {x:b.x,y:b.y};}
 update(dt){
  if(this.paused||this.winner!==null||!Number.isFinite(dt)||dt<=0)return;
  let remaining=Math.min(dt,20);while(remaining>0&&this.winner===null){const step=Math.min(.1,remaining);this._step(step);remaining-=step;}
 }
 _step(dt){
  this._pathBudget=6;
  this.time+=dt;this._fogTimer-=dt;this._aiTimer-=dt;this._economyTimer+=dt;
  for(const ef of this.effects)ef.life-=dt;this.effects=this.effects.filter(ef=>ef.life>0);this.scans=this.scans.filter(s=>s.expires>this.time);
  if(this._fogTimer<=0){this._updateFog();this._fogTimer=.45;}
  if(this._economyTimer>=1){this._economy(this._economyTimer);this._economyTimer=0;}
  for(const e of this.entities){if(e.hp<=0||e.boardedIn)continue;e.cooldown=Math.max(0,(e.cooldown||0)-dt);if(e.kind==='building'){this._updateBuilding(e,dt);continue;}if(e.kind==='machine'&&!this._crewReady(e)){if(this.getDef(e).domain==='air')this._updateAircraft(e,dt,false);continue;}this._updateMobile(e,dt);}
  this._updateCharges();if(this._aiTimer<=0){this._aiSilent=true;try{this._ai();}finally{this._aiSilent=false;}this._aiTimer=3;}
  for(let owner=0;owner<this.teams.length;owner++)if(!this._living(owner).some(e=>e.type==='hq'))this._eliminate(owner);this._checkVictory();
 }
 _economy(dt){
  for(const b of this.entities){if(b.hp<=0||b.kind!=='building'||b.progress<1)continue;const d=this.getDef(b),t=this.teams[b.owner],scale=1+(b.level-1)*.5;if(d.income)t.money+=d.income*scale*dt;
   if(d.output)for(const [k,rate] of Object.entries(d.output))t[k]+=rate*scale*dt;
   if(b.type==='refinery')t.fuel+=1.4*scale*dt;
   if(b.type==='mine'){const deposit=this._nearestDeposit(b.x,b.y,5);if(deposit){const k=deposit.resource.type,amount=Math.min(deposit.resource.amount,(k==='crystal'?.75:2.6)*scale*(k==='crystal'&&this._has(b.owner,'lab')?2:1)*dt);deposit.resource.amount-=amount;t[k]+=amount;b.miningResource=k;}}
  }
  // AI uses the same economy and queues; difficulty grants a transparent, modest income bonus.
  for(let owner=0;owner<this.teams.length;owner++)if(!this.teams[owner].eliminated)this._autoStaff(owner);
  const aiBonus=this.difficulty==='relaxed'?.6:this.difficulty==='hard'||this.difficulty==='veteran'?4:1.8;for(let owner=1;owner<this.teams.length;owner++)if(!this.teams[owner].eliminated&&!this.humanOwners?.includes(owner))this.teams[owner].money+=aiBonus*dt;
 }
 _updateBuilding(b,dt){
  const def=this.getDef(b);
  if(b.progress<1){let work=0;for(const e of this.entities)if(e.hp>0&&!e.boardedIn&&e.layer==='surface'&&e.owner===b.owner&&(e.kind==='unit'&&e.type!=='mechanic'||e.type==='harvester'&&this._crewReady(e))&&e.task.type==='build'&&e.task.targetId===b.id&&dist(e,b)<def.size*.5+1.7)work+=(this.getDef(e).buildRate||1)*(1+(e.level-1)*.25);if(work){const prior=b.progress;b.progress=Math.min(1,b.progress+work*dt/(def.buildTime*3));b.hp=Math.min(b.maxHp,b.hp+(b.progress-prior)*b.maxHp*.75);}if(b.progress>=1){b.hp=b.maxHp;for(const e of this.entities)if(e.task.targetId===b.id&&e.task.type==='build')this._nextConstruction(e);this._pathRevision++;if(b.owner===0)this._event(def.name+' operational.','success');}return;}
  if(def.damage)this._combat(b,dt);
  if(!b.queue.length){b.needsWorkers=false;return;}const q=b.queue[0],pd=q.kind==='unit'?D.units[q.type]:D.machines[q.type];let rate=(1+(b.level-1)*.4)*(1+this._buildings(b.owner,'power').reduce((n,p)=>n+p.level*.12,0));
  if(q.kind==='machine'){const nearby=this._assemblyWorkers(b);const work=nearby.reduce((n,u)=>n+(this.getDef(u).buildRate||1)*(1+(u.level-1)*.25),0);b.needsWorkers=work===0;if(!work)return;rate*=Math.min(2.2,.35+work*.18);}else b.needsWorkers=false;
  q.progress+=dt*rate/(pd.trainTime||pd.buildTime||12);if(q.progress>=1){const p=this._spawnPoint(b,q.kind,q.type),created=this._spawn(q.kind,q.type,b.owner,p.x,p.y);b.queue.shift();if(q.staffTarget){const target=this.getEntity(q.staffTarget);if(target&&target.hp>0&&target.owner===created.owner)this._dispatchStaff(created,target,q.staffRole);}if(b.owner===0)this._event(pd.name+(q.kind==='machine'?' assembled. Board '+pd.crew+' crew to activate.':' ready for orders.'),'success');else if(q.kind==='machine')this._crewAI(created);}
 }
 _assemblyWorkers(b){const producers=this._buildings(b.owner).filter(p=>p.queue[0]?.kind==='machine');return this._living(b.owner).filter(u=>{if(u.kind!=='unit'||u.type==='mechanic'||u.boardedIn||u.garrisonedIn||u.layer!=='surface'||dist(u,b)>=7)return false;if(u.task.type==='build')return u.task.targetId===b.id;if(u.task.type!=='idle')return false;return producers.slice().sort((a,c)=>dist(u,a)-dist(u,c)||a.id-c.id)[0]?.id===b.id;});}
 _updateMobile(e,dt){
  if(e.garrisonedIn){const wall=this.getEntity(e.garrisonedIn);if(!wall||wall.hp<=0){this._leavePerch(e);return;}e.x=wall.x;e.y=wall.y;this._combat(e,dt);return;}
  if(e.task.type==='garrison'){const wall=this.getEntity(e.task.targetId);if(!this._canGarrison(e,wall)){this._assign(e,{type:'idle'});return;}if(dist(e,wall)>1.8){this._moveToward(e,wall.x,wall.y,dt,1.6);return;}this._assign(e,{type:'idle'});e.garrisonedIn=wall.id;wall.garrisonId=e.id;e.x=wall.x;e.y=wall.y;this._fogTimer=0;return;}

  if(e.coverTask&&(e.exposed||this.time>=(e.coverUntil||0))){const task=e.coverTask;delete e.coverTask;delete e.coverUntil;this._assign(e,task);}
  const d=this.getDef(e);
  if(e.task.type==='staff'){this._updateStaff(e,dt);return;}
  if(e.task.type==='clear'){this._clearTerrain(e,dt);return;}
  if(e.type==='mechanic'&&e.task.type==='idle'){const damaged=this._living(e.owner).filter(t=>t.kind!=='unit'&&t.progress>=1&&t.layer===e.layer&&t.hp<t.maxHp&&dist(e,t)<=12).sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp||dist(e,a)-dist(e,b))[0];if(damaged)this._assign(e,{type:'repair',targetId:damaged.id});}
  if(e.patrolling){const hq=this._buildings(e.owner,'hq')[0];if(hq){const radius=10+(e.level-1)*4,a=(e.patrolLeg||0)*Math.PI/4,point={x:clamp(hq.x+Math.cos(a)*radius*.65,.5,this.width-.5),y:clamp(hq.y+Math.sin(a)*radius*.65,.5,this.height-.5)};if(this._moveToward(e,point.x,point.y,dt,.6))e.patrolLeg=(e.patrolLeg||0)+1;return;}delete e.patrolling;}
  if(e.type==='medic'){e.healClock=(e.healClock||0)-dt;if(e.healClock<=0){const patients=this._living(e.owner).filter(u=>u.kind==='unit'&&!u.boardedIn&&u.hp<u.maxHp&&u.layer===e.layer&&dist(u,e)<5).sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp);if(patients[0]){patients[0].hp=Math.min(patients[0].maxHp,patients[0].hp+d.heal*(1+(e.level-1)*.3));this._effect('heal',patients[0].x,patients[0].y,{owner:e.owner});}e.healClock=1;}}
  if(e.type==='investigator'&&(e.investigateReady||0)<=this.time){e.investigateReady=this.time+8;this._investigate(e);}
  this._acquireThreat(e);
  if(d.domain==='air'){if(!this._updateAircraft(e,dt))return;}
  if(this._respondToThreat(e,dt))return;
  const task=e.task||{type:'idle'},target=this.getEntity(task.targetId);
  if(task.targetId&&(!target||target.hp<=0)){if(task.type==='build')this._nextConstruction(e);else this._assign(e,{type:'idle'});return;}
  let fighting=false;if(task.type==='attack'||task.type==='idle'||e.lastHitAt>this.time-3)fighting=this._combat(e,dt,target&&task.type==='attack'?target:null);
  if(fighting&&task.type!=='move'){if(target)this._formationCombatAdvance(e,target,dt);return;}
  if(task.type==='roam'){this._roam(e,dt);return;}
  if(task.type==='idle')return;
  if(task.type==='move'||task.type==='attack'){if(target){const range=task.type==='move'?(d.domain==='air'&&target.type==='airfield'?1:1.5+this._targetRadius(target)):(d.range||1)+this._targetRadius(target);if(dist(e,target)>range*.9)this._moveToward(e,target.x,target.y,dt,range*.85);else if(task.type==='move')this._assign(e,{type:'idle'});}else if(this._moveToward(e,task.x,task.y,dt,.55))this._assign(e,{type:'idle'});return;}
  if(task.type==='build'||task.type==='repair'){
   if(!target)return;const reach=this._targetRadius(target)+1.5;if(dist(e,target)>reach){this._moveToward(e,target.x,target.y,dt,reach);return;}
   if(task.type==='build'){if(target.progress>=1&&!target.queue?.length)this._assign(e,{type:'idle'});return;}
   if(target.hp>=target.maxHp){this._assign(e,{type:'idle'});return;}const heal=(d.repairRate||(d.buildRate||1)*9)*(1+(e.level-1)*.25)*dt,cost=heal*.045;if(this.teams[e.owner].money>=cost){this.teams[e.owner].money-=cost;target.hp=Math.min(target.maxHp,target.hp+heal);}return;
  }
  if(task.type==='gather'){
   const tx=clamp(Math.floor(task.x),0,this.width-1),ty=clamp(Math.floor(task.y),0,this.height-1),res=this.tiles[ty][tx].resource;
   if(!res||res.amount<=0){this._assign(e,{type:'idle'});if(e.owner===0)this._event('Deposit exhausted. Select another resource pocket.');return;}
   if(dist(e,{x:tx+.5,y:ty+.5})>1.3){this._moveToward(e,tx+.5,ty+.5,dt,1.2);return;}
   const logistics=1+this._buildings(e.owner,'depot').reduce((n,b)=>n+b.level*.15,0),rate=(d.gatherRate||(e.type==='engineer'?2.2:1))*logistics*(1+(e.level-1)*.2),amount=Math.min(res.amount,rate*dt);res.amount-=amount;this.teams[e.owner][res.type]+=amount;
   e.gatherClock=(e.gatherClock||0)+dt;if(e.gatherClock>1){e.gatherClock=0;this._effect('dust',e.x,e.y,{layer:e.layer,owner:e.owner});}return;
  }
  if(task.type==='infiltrate'){
   if(e.type!=='spy'||!target)return;const reach=this._targetRadius(target)+1.3;if(dist(e,target)>reach){this._moveToward(e,target.x,target.y,dt,reach);return;}
   if(e.exposed){this._assign(e,{type:'idle'});return;}e.disguised=true;e.spyClock=(e.spyClock||0)+dt;if(e.spyClock>=5){e.spyClock=0;const stolen=Math.min(this.teams[target.owner].money,25+e.level*10);this.teams[target.owner].money-=stolen;this.teams[e.owner].money+=stolen;this.scans.push({x:target.x,y:target.y,radius:8,owner:e.owner,expires:this.time+6});if(e.owner===0&&(e.spyMessageAt||0)<this.time){this._event('Operative infiltrated '+this.getDef(target).name+'. Intelligence and credits flowing.','success');e.spyMessageAt=this.time+30;}}return;
  }
 }
 _updateAircraft(e,dt,canFly=true){
  const fields=this._buildings(e.owner,'airfield'),nearest=fields.sort((a,b)=>dist(e,a)-dist(e,b))[0],atRunway=nearest&&dist(e,nearest)<3;
  if(atRunway&&(e.returning||e.task.type==='idle'&&!e.autoTargetId||!canFly))e.landed=true;
  if(atRunway&&e.landed){
   e.fuel=Math.min(100,(e.fuel??100)+dt*18);
   if(e.returning&&e.fuel>=95){e.returning=false;const resume=e.resumeTask||{type:'idle'};delete e.resumeTask;this._assign(e,resume);}
   if(!canFly||e.returning||e.task.type==='idle'&&!e.autoTargetId||e.fuel<95)return false;
   e.landed=false;
  }else {e.landed=false;e.fuel=Math.max(0,(e.fuel??100)-dt*(fields.length?.55:.7));}
  if(e.fuel<=0){e.hp-=dt*15;if(e.hp<=0)this._kill(e);return false;}
  if(e.fuel<20&&nearest&&!e.returning){e.returning=true;e.resumeTask={...e.task};if(e.owner===0)this._event(this.getDef(e).name+' returning to runway to refuel.');}
  if(!canFly)return false;
  if(e.returning){if(nearest)this._moveToward(e,nearest.x,nearest.y,dt,1);return false;}return true;
 }
 _targetRadius(e){return e.kind==='building'?this.getDef(e).size*.5:.35;}
 _acquireThreat(e){
  const d=this.getDef(e),task=e.task;
  if(!d.damage||e.type==='spy'||e.boardedIn||e.returning||e.kind==='machine'&&!this._crewReady(e)||!(task.type==='idle'||task.type==='roam'||task.type==='attack'&&!task.targetId))return;
  if(this.time<(e._threatCheck||0))return;e._threatCheck=this.time+.5;
  if(e.type==='flaktank'&&e.autoTargetId&&this.getDef(this.getEntity(e.autoTargetId)||e).domain!=='air'&&this.entities.some(t=>this.getDef(t).domain==='air'&&this._canTarget(e,t)&&dist(e,t)<=(d.sight||6)+e.level-1))delete e.autoTargetId;
  if(e.autoTargetId)return;
  const sight=(d.sight||6)+e.level-1,origin=e.autoOrigin||{x:e.x,y:e.y};
  const attacked=this._living(e.owner).filter(b=>b.kind==='building'&&b.lastAttackerId&&b.lastHitAt>=this.time-8&&dist(e,b)<24);
  const threats=attacked.map(b=>this.getEntity(b.lastAttackerId)).filter(t=>this._canTarget(e,t));
  const nearby=this.entities.filter(t=>this._canTarget(e,t)&&dist(e,t)<=sight+this._targetRadius(t));
  const priority=t=>(threats.includes(t)?-100:0)+(e.type==='flaktank'&&this.getDef(t).domain==='air'?-200:0);
  const candidates=[...new Set([...threats,...nearby])].sort((a,b)=>priority(a)+dist(e,a)-priority(b)-dist(e,b));
  for(const target of candidates){
   // A ship or infantry squad must have a legal route; a visible contact across water is not an order to get stuck.
   const range=d.range+(e.level-1)*.25+this._targetRadius(target);
   if(dist(e,target)>range&&this._domain(e)!=='air'&&this._domain(e)!=='underground'&&!this._path(e,target.x,target.y).length)continue;
   e.autoTargetId=target.id;e.autoOrigin=origin;e.autoReason=threats.includes(target)?'defend':'engage';e.autoUntil=this.time+24;e.path=[];e._pathTarget=null;break;
  }
 }
 _respondToThreat(e,dt){
  if(e.autoTargetId){
   const target=this.getEntity(e.autoTargetId),d=this.getDef(e),leash=e.autoReason==='defend'?32:Math.max(12,(d.sight||6)*2);
   if(!this._canTarget(e,target)||this.time>e.autoUntil||dist(e,e.autoOrigin)>leash){delete e.autoTargetId;e.path=[];e._pathTarget=null;}
   else {if(this._combat(e,dt,target)){this._formationCombatAdvance(e,target,dt);e.autoUntil=this.time+12;return true;}const tile=this.tiles[Math.floor(e.y)][Math.floor(e.x)],range=d.range+(e.level-1)*.25+(e.layer==='surface'&&this._domain(e)!=='air'?tile.elevation*.55:0)+this._targetRadius(target);this._moveToward(e,target.x,target.y,dt,range*.9);return true;}
  }
  if(e.autoOrigin){if(e.task.type==='idle'&&dist(e,e.autoOrigin)>.7){this._moveToward(e,e.autoOrigin.x,e.autoOrigin.y,dt,.6);return true;}delete e.autoOrigin;delete e.autoReason;delete e.autoUntil;e.path=[];e._pathTarget=null;}
  return false;
 }
 _canTarget(attacker,target){
  if(!target||target.hp<=0||target.owner===attacker.owner||target.boardedIn)return false;
  if(attacker.garrisonedIn&&this.getEntity(attacker.garrisonedIn)?.type==='tank'&&(target.kind!=='unit'||target.garrisonedIn))return false;
  if(target.type==='spy'&&target.disguised&&!target.exposed)return false;
  if(attacker.layer!==target.layer)return false;
  const ad=this.getDef(attacker),td=this.getDef(target);if(td.domain==='air'&&!ad.antiAir)return false;
  if(target.layer==='underground'&&!this._teamCanSee(attacker.owner,target.x,target.y,'underground'))return false;
  return this._teamCanSee(attacker.owner,target.x,target.y,target.layer);
 }
 _combat(e,dt,explicit=null){
  if(e.owner!==0&&!this.humanOwners?.includes(e.owner)&&this.preparationRemaining()>0&&!this._buildings(e.owner,'hq').some(h=>dist(e,h)<18))return false;
  const rider=e.garrisonedIn&&this.getEntity(e.garrisonedIn)?.type==='tank',base=this.getDef(e),d=rider?{...base,damage:10,range:5.2,reload:.28,splash:0,antiArmor:1,antiBuilding:1,antiAir:false}:base;if(!d.damage||e.type==='spy'&&e.disguised&&!e.exposed||d.domain==='air'&&e.landed)return false;if(e.kind==='machine'&&!this._crewReady(e))return false;
  const tile=this.tiles[clamp(Math.floor(e.y),0,this.height-1)][clamp(Math.floor(e.x),0,this.width-1)],range=d.range+(e.garrisonedIn&&!rider?2:0)+(e.layer==='surface'&&this._domain(e)!=='air'?tile.elevation*.55:0)+(e.level-1)*.25;
  let target=explicit&&this._canTarget(e,explicit)?explicit:null;
  if(!target){const candidates=this.entities.filter(t=>this._canTarget(e,t)&&dist(e,t)<=range+this._targetRadius(t));const priority=t=>['hq','flaktank'].includes(e.type)?(this.getDef(t).domain==='air'?-30:0):e.type==='tank'?(t.kind==='unit'?25:0):(t.kind==='building'?2:0);candidates.sort((a,b)=>priority(a)+dist(e,a)-priority(b)-dist(e,b));target=candidates[0];}
  if(target){const blocker=this._lineBlocker(e,target);if(blocker)target=blocker;}
  if(target&&dist(e,target)>range+this._targetRadius(target))target=this.entities.filter(t=>['wall','gate','heavygate'].includes(t.type)&&this._canTarget(e,t)&&dist(e,t)<=range+this._targetRadius(t)).sort((a,b)=>dist(e,a)-dist(e,b))[0];
  if(!target||dist(e,target)>range+this._targetRadius(target))return false;
  e.angle=Math.atan2(target.y-e.y,target.x-e.x);if(e.cooldown>0)return true;
  const pilotBonus=e.crew.reduce((n,id)=>n+(this.getEntity(id)?.type==='pilot'?.15:0),0);e.cooldown=(d.reload||1)/(1+(e.level-1)*.12+pilotBonus);
  let damage=d.damage*(1+(e.level-1)*.25);if(target.kind==='machine'&&(e.type!=='flaktank'||this.getDef(target).domain!=='air'))damage*=d.antiArmor||1;if(target.kind==='building')damage*=d.antiBuilding||1;
  if(e.rallyUntil>this.time)damage*=1.35;if(this._living(e.owner).some(u=>u.type==='general'&&!u.boardedIn&&dist(u,e)<8))damage*=1.2;
  damage*=1+this._buildings(e.owner,'armory').reduce((n,b)=>n+b.level*.08,0);if(d.airSuperiority&&this.getDef(target).domain==='air')damage*=1.8;
  this._dealDamage(e,target,damage);e.firedAt=this.time;this._effect('shot',e.x,e.y,{tx:target.x,ty:target.y,owner:e.owner,layer:e.layer,weapon:rider?'rifleman':e.type,sourceHeight:rider?38:e.type==='flaktank'?31:e.type==='hq'?78+(e.level-1)*4:e.garrisonedIn?42+((this.getEntity(e.garrisonedIn)?.level||1)-1)*7:undefined,targetHeight:target.garrisonedIn?(this.getEntity(target.garrisonedIn)?.type==='tank'?35:38+((this.getEntity(target.garrisonedIn)?.level||1)-1)*7):undefined,sourceAir:d.domain==='air',targetAir:this.getDef(target).domain==='air',heavy:e.kind==='machine'||e.kind==='building',life:.65,maxLife:.65});
  if(d.splash){for(const t of this.entities)if(t.id!==target.id&&t.hp>0&&t.owner!==e.owner&&!t.boardedIn&&t.layer===target.layer&&dist(t,target)<d.splash)this._dealDamage(e,t,damage*.4);this._effect('explosion',target.x,target.y,{owner:e.owner,layer:e.layer,radius:d.splash});}
  return true;
 }
 _dealDamage(attacker,target,damage){
  if(!target||target.hp<=0)return;const def=this.getDef(target),tile=this.tiles[clamp(Math.floor(target.y),0,this.height-1)][clamp(Math.floor(target.x),0,this.width-1)];let reduction=(def.armor||0)+(target.garrisonedIn?(this.getEntity(target.garrisonedIn)?.type==='tank'?.1:.25):0);if(target.kind==='unit')reduction+=D.terrains[tile.type].cover;reduction=Math.min(.65,reduction+(target.level-1)*.04);target.hp-=Math.max(1,damage*(1-reduction));target.lastHitAt=this.time;
  if(attacker&&target.kind==='building')target.lastAttackerId=attacker.id;
  if(target.owner===0&&target.kind==='building'&&(target.lastAlert||-100)<this.time-14){target.lastAlert=this.time;this._event(this.getDef(target).name+' is under attack! Available nearby troops are responding.','danger');}
  if(target.hp<=0)this._kill(target,attacker);
 }
 _kill(e,attacker){
  if(e.garrisonedIn){const wall=this.getEntity(e.garrisonedIn);if(wall)delete wall.garrisonId;delete e.garrisonedIn;}
  e.hp=0;if(e.garrisonId){const u=this.getEntity(e.garrisonId);delete e.garrisonId;if(u&&u.hp>0){this._leavePerch(u,true);u.hp=Math.max(0,u.hp-u.maxHp*.4);if(u.hp<=0)this._kill(u,attacker);}}this._effect('explosion',e.x,e.y,{layer:e.layer,owner:e.owner,radius:e.kind==='building'?3:e.kind==='machine'?1.5:.5});
  if(e.kind==='building'){this._pathRevision++;if(e.owner===0)this._event(this.getDef(e).name+' destroyed.','danger');}
  if(e.kind==='machine')for(const id of e.crew){const u=this.getEntity(id);if(u){u.hp=0;delete u.boardedIn;}}e.crew=[];
  if(e.type==='hq'){this._eliminate(e.owner,attacker?.owner);this._checkVictory();}
 }
 _startPatrol(e){if(!this._buildings(e.owner,'hq').length)return;this._assign(e,{type:'idle'});e.layer='underground';e.patrolling=true;e.patrolLeg=0;for(const id of e.crew)this.getEntity(id).layer='underground';}
 _layMine(e){if((e.mineReady||0)>this.time||!this._spend({money:60,fuel:15,crystal:8},e.owner))return false;e.mineReady=this.time+12;this.charges.push({id:this.nextId++,kind:'proximity',x:e.x,y:e.y,owner:e.owner,armedAt:this.time+2,explodeAt:0,damage:650,radius:2.2,layer:'underground'});return true;}
 _lineBlocker(e,target){
  if(e.layer!=='surface'||this.getDef(e).domain==='air'||this.getDef(target).domain==='air'||e.garrisonedIn||['artillery','turret'].includes(e.type))return null;
  const dx=target.x-e.x,dy=target.y-e.y;let best=null,bestT=Infinity;
  for(const b of this.entities){if(b.hp<=0||b.owner===e.owner||!['wall','gate','heavygate'].includes(b.type))continue;const r=this.getDef(b).size*.5;let lo=0,hi=1;
   for(const [p,delta,center] of [[e.x,dx,b.x],[e.y,dy,b.y]]){if(Math.abs(delta)<1e-8){if(p<center-r||p>center+r){hi=-1;break;}}else{const a=(center-r-p)/delta,z=(center+r-p)/delta;lo=Math.max(lo,Math.min(a,z));hi=Math.min(hi,Math.max(a,z));}}
   if(lo<=hi&&hi>0&&lo<bestT){best=b;bestT=lo;}
  }return best;
 }
 clearArea(ids,from,to){
  if(this.winner!==null)return this._result(false,'The battle is over.');
  if(!from||!to||![from.x,from.y,to.x,to.y].every(Number.isFinite))return this._result(false,'Select an area on land.');
  const x0=Math.floor(Math.min(from.x,to.x)),y0=Math.floor(Math.min(from.y,to.y)),x1=Math.floor(Math.max(from.x,to.x)),y1=Math.floor(Math.max(from.y,to.y));
  if(x1-x0>=20||y1-y0>=20||!this._inside(x0,y0)||!this._inside(x1,y1))return this._result(false,'Clear an area up to 20 × 20 tiles at a time.');
  const workers=(ids||[]).map(id=>this.getEntity(id)).filter(e=>e&&e.hp>0&&e.owner===0&&e.type==='pioneer'&&!e.boardedIn&&e.layer==='surface'),cells=[];
  if(!workers.length)return this._result(false,'Select terrain pioneers to clear this area.');
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const t=this.tiles[y][x];if(this.explored[y][x]&&!t.cleared&&!['water','bridge'].includes(t.type)&&!this._living().some(b=>b.kind==='building'&&Math.abs(b.x-x-.5)<this.getDef(b).size*.5&&Math.abs(b.y-y-.5)<this.getDef(b).size*.5))cells.push({x:x+.5,y:y+.5});}
  if(!cells.length)return this._result(false,'No explored natural terrain to clear here.');
  for(const e of workers){this._assign(e,{type:'clear'});e.clearQueue=cells.slice().sort((a,b)=>dist(e,a)-dist(e,b));}
  return this._result(true,'Clearing '+cells.length+' tiles. Water, elevation, deposits and buildings are preserved.');
 }
 _clearTerrain(e,dt){
  const buildings=this._living().filter(b=>b.kind==='building');const cells=(e.clearQueue||[]).filter(p=>{const t=this.tiles[Math.floor(p.y)]?.[Math.floor(p.x)];return t&&!t.cleared&&!['water','bridge'].includes(t.type)&&!buildings.some(b=>Math.abs(b.x-p.x)<this.getDef(b).size*.5&&Math.abs(b.y-p.y)<this.getDef(b).size*.5);});e.clearQueue=cells;
  if(!cells.length){this._assign(e,{type:'idle'});return;}const p=cells[0],t=this.tiles[Math.floor(p.y)][Math.floor(p.x)];if(dist(e,p)>1.6){this._moveToward(e,p.x,p.y,dt,1.4);return;}
  t.clearWork=(t.clearWork||0)+dt*(this.getDef(e).clearRate||1)*(1+(e.level-1)*.25);
  if(t.clearWork>=(t.type==='rock'?5:3)){delete t.clearWork;t.cleared=true;t.type=this.biome==='desert'?'sand':this.biome==='tundra'?'snow':'grass';this._pathRevision++;(this._terrainChanges||(this._terrainChanges=[])).push(p);this._effect('dust',p.x,p.y,{owner:e.owner});}
 }
 wallLine(from,to){
  if(!from||!to||![from.x,from.y,to.x,to.y].every(Number.isFinite))return [];
  let x=Math.floor(from.x),y=Math.floor(from.y),tx=Math.floor(to.x),ty=Math.floor(to.y),dx=Math.abs(tx-x),dy=Math.abs(ty-y),sx=Math.sign(tx-x),sy=Math.sign(ty-y),ix=0,iy=0,points=[{x:x+.5,y:y+.5}];
  if(dx+dy>127)return [];
  while(ix<dx||iy<dy){if(ix<dx&&(iy===dy||(ix+.5)/Math.max(1,dx)<=(iy+.5)/Math.max(1,dy))){x+=sx;ix++;}else{y+=sy;iy++;}points.push({x:x+.5,y:y+.5});}return points;
 }
 planWalls(from,to,owner=0){
  const line=this.wallLine(from,to);if(!line.length)return {ok:false,message:'Keep each wall stroke within 128 tiles.',cells:[]};
  const connected=line.some(p=>this._buildings(owner).some(b=>dist(b,p)<=12+this.getDef(b).size*.5)),cells=line.map(p=>{const existing=this._living(owner).find(b=>['wall','gate','heavygate'].includes(b.type)&&Math.abs(b.x-p.x)<this.getDef(b).size*.5&&Math.abs(b.y-p.y)<this.getDef(b).size*.5);return {...p,existing:!!existing,...(existing?{ok:true}:this._placement('wall',p.x,p.y,owner,{connected}))};}),fresh=cells.filter(p=>!p.existing),cost={money:35*fresh.length,metal:20*fresh.length},quote=this.quote(cost,owner),bad=cells.find(p=>!p.ok);
  return {ok:!bad&&fresh.length>0&&quote.affordable,message:bad?bad.message:!fresh.length?'This line is already fortified.':!quote.affordable?'Insufficient credits for the entire wall line.':fresh.length+' segments · '+Math.ceil(quote.money)+' credits'+(quote.imports?' including imports':''),cells,cost,quote,count:fresh.length};
 }
 buildWallLine(from,to,workerIds=[],owner=0){
  if(this.winner!==null)return this._result(false,'The battle is over.');const plan=this.planWalls(from,to,owner);if(!plan.ok)return this._result(false,plan.message);const workers=this._availableWorkers(owner,workerIds,from);if(!workers.length)return this._result(false,'Wall construction needs available workers.');if(!this._spend(plan.cost,owner))return this._result(false,'Insufficient credits for the entire line.');
  const d=D.buildings.wall,sites=plan.cells.filter(p=>!p.existing).map(p=>this._spawn('building','wall',owner,p.x,p.y,{progress:0,hp:d.hp*.25}));
  for(const w of workers){this._assign(w,{type:'idle'});w.buildQueue=sites.map(b=>b.id);this._nextConstruction(w);}this._event(sites.length+' wall segments ordered. Workers will build the line in sequence.','success');return {ok:true,message:sites.length+' wall segments queued.',entities:sites};
 }
 _nextConstruction(e){const pending=(e.buildQueue||[]).filter(id=>{const b=this.getEntity(id);return b&&b.hp>0&&b.owner===e.owner&&b.progress<1;});const next=this.getEntity(pending.shift());this._assign(e,next?{type:'build',targetId:next.id,x:next.x,y:next.y}:{type:'idle'});if(pending.length)e.buildQueue=pending;}
 _canGarrison(u,w){return !!(u&&w&&u.hp>0&&w.hp>0&&(w.type==='wall'&&w.perch||w.type==='tank')&&w.progress>=1&&!w.garrisonId&&u.kind==='unit'&&this.getDef(u).damage&&u.type!=='spy'&&u.owner===w.owner&&!u.boardedIn&&!u.garrisonedIn&&u.layer==='surface');}
 _leavePerch(u,force=false){const wall=this.getEntity(u.garrisonedIn);if(!wall){delete u.garrisonedIn;return true;}const pos=this._spawnPoint(wall,'unit',u.type);if(!force&&!this._passable(Math.floor(pos.x),Math.floor(pos.y),u))return false;delete wall.garrisonId;delete u.garrisonedIn;u.x=pos.x;u.y=pos.y;this._assign(u,{type:'idle'});return true;}
 productionOutput(b){
  if(!b||b.kind!=='building'||b.hp<=0||b.progress<1)return {};const d=this.getDef(b),scale=1+(b.level-1)*.5,out={};if(d.income)out.money=d.income*scale;if(d.output)for(const [k,n] of Object.entries(d.output))out[k]=n*scale;if(b.type==='refinery')out.fuel=1.4*scale;
  if(b.type==='mine'){const dep=this._nearestDeposit(b.x,b.y,5);if(dep){const k=dep.resource.type;out[k]=(k==='crystal'?.75:2.6)*scale*(k==='crystal'&&this._has(b.owner,'lab')?2:1);}}return out;
 }
 _updateCharges(){
  for(const c of this.charges){if(c.exploded)continue;
   for(let defender=0;defender<this.teams.length;defender++){if(defender===c.owner||!this._teamCanSee(defender,c.x,c.y,'underground'))continue;
    if(defender===0&&!c.warned){c.warned=true;this._event('SEISMIC ALERT — hostile charge detected! An engineer within 3 tiles or a nearby countermine station can disarm it.','danger');}
    const disarm=this._living(defender).some(e=>e.type==='engineer'&&!e.boardedIn&&dist(e,c)<3.2)||this._buildings(defender,'countermine').some(b=>dist(b,c)<=8+(b.level-1)*2);
    if(disarm){c.exploded=true;if(defender===0)this._event('Underground defense disarmed a hostile charge.','success');break;}
   }
   if(c.exploded)continue;
   if(c.kind==='proximity'){if(this.time<c.armedAt||!this.entities.some(e=>e.hp>0&&e.owner!==c.owner&&e.kind==='machine'&&e.layer==='underground'&&dist(e,c)<.95))continue;}else if(this.time<c.explodeAt)continue;
   c.exploded=true;this._effect('explosion',c.x,c.y,{owner:c.owner,radius:c.radius,life:1.5,maxLife:1.5,layer:'underground'});if(c.kind!=='proximity')this._effect('explosion',c.x,c.y,{owner:c.owner,radius:c.radius,life:1.5,maxLife:1.5,layer:'surface'});
   for(const e of this.entities)if(e.hp>0&&!e.boardedIn&&dist(e,c)<c.radius+this._targetRadius(e)&&(c.kind!=='proximity'||e.kind==='machine'&&e.layer==='underground'&&e.owner!==c.owner)){
    const shield=e.kind==='building'?this._buildings(e.owner,'countermine').filter(b=>dist(b,e)<=8+(b.level-1)*2).reduce((n,b)=>Math.max(n,.5+(b.level-1)*.1),0):0;
    this._dealDamage({owner:c.owner},e,c.damage*Math.max(.45,1-dist(e,c)/(c.radius*2))*(1-shield));
   }
   if(c.owner===0)this._event(c.kind==='proximity'?'Proximity mine intercepted an underground machine.':'Subterranean charge detonated.','success');
  }this.charges=this.charges.filter(c=>!c.exploded);
 }
 _crewAI(m){const owner=m.owner;if(m.layer==='underground'||this.getDef(m).domain==='air'&&(!this._atRunway(m)||m.landed===false))return;this._crewReady(m);const needed=this.getDef(m).crew-m.crew.length,pool=this._living(owner).filter(e=>e.kind==='unit'&&!e.boardedIn&&!e.garrisonedIn&&e.layer==='surface'&&e.task.type==='idle'&&!['engineer','pioneer','mechanic','medic','spy','investigator','general','scout'].includes(e.type)&&dist(e,m)<15).sort((a,b)=>(a.type==='pilot'?-100:0)+dist(a,m)-(b.type==='pilot'?-100:0)-dist(b,m));for(const u of pool.slice(0,needed)){u.boardedIn=m.id;u.x=m.x;u.y=m.y;u.layer=m.layer;u.task={type:'idle'};m.crew.push(u.id);}}
 _aiNavalOrder(ship,enemyHQ){const owner=ship.owner;if(!enemyHQ)return;
  const radius=this.getDef(ship).range,candidates=this._living(enemyHQ.owner).filter(e=>!e.boardedIn&&e.layer==='surface'&&(e.id===enemyHQ.id||this._teamCanSee(owner,e.x,e.y))).sort((a,b)=>(a.type==='hq'?-100:0)+dist(ship,a)-(b.type==='hq'?-100:0)-dist(ship,b));let destination=null;
  for(const target of candidates){let score=Infinity;const reach=Math.max(.5,radius+this._targetRadius(target)-.8);for(let y=Math.max(0,Math.floor(target.y-reach));y<Math.min(this.height,Math.ceil(target.y+reach));y++)for(let x=Math.max(0,Math.floor(target.x-reach));x<Math.min(this.width,Math.ceil(target.x+reach));x++){const p={x:x+.5,y:y+.5};if(this._passable(x,y,ship)&&dist(p,target)<=reach&&dist(p,ship)<score){destination=p;score=dist(p,ship);}}if(destination)break;}
  if(!destination){const patrols=[{x:27,y:31},{x:9,y:41},{x:27,y:13}],p=patrols[(ship.navalPatrol||0)%patrols.length];ship.navalPatrol=(ship.navalPatrol||0)+1;destination=this._nearestWater(p.x,p.y,6);}
  if(destination)this._assign(ship,{type:'attack',x:destination.x,y:destination.y});
 }
 _aiAirOrder(plane,enemyHQ){
  const visible=this._living().filter(e=>this._canTarget(plane,e)),air=visible.filter(e=>this.getDef(e).domain==='air').sort((a,b)=>dist(a,plane)-dist(b,plane));let target=air[0];
  if(!target)target=visible.filter(e=>e.kind==='building'&&e.type!=='hq'&&dist(e,enemyHQ)>12).sort((a,b)=>a.hp-b.hp)[0];
  const support=this._living(plane.owner).filter(e=>e.kind!=='building'&&!e.boardedIn&&this.getDef(e).damage&&this.getDef(e).domain!=='air'&&dist(e,enemyHQ)<20);
  if(!target&&support.length>=5)target=enemyHQ;
  if(target)this._assign(plane,{type:'attack',targetId:target.id,x:target.x,y:target.y});
 }
 _aiStrategic(hq,enemyHQ,engineers){const owner=hq.owner;
  const machines=this._living(owner).filter(e=>e.kind==='machine');for(const m of machines)if(!this._crewReady(m))this._crewAI(m);
  for(const [producer,domain,limit] of [['airfield','air',2],['shipyard','sea',2]]){const b=this._buildings(owner,producer)[0];if(!b||b.queue.length||machines.filter(m=>this.getDef(m).domain===domain).length>=limit||this.teams[owner].money<650)continue;const type=domain==='air'?(this._has(owner,'armory')&&machines.some(m=>m.type==='fighter')?'bomber':'fighter'):(this._has(owner,'lab')&&this.time>420?'frigate':'patrolboat');this._queueProduction('machine',type,b.id,owner);}
  // One person can support only their assigned assembly line. Keep workers on it until its queue empties.
  for(const b of this._buildings(owner).filter(b=>b.queue[0]?.kind==='machine'))if(!this._assemblyWorkers(b).length){const worker=engineers.filter(u=>['idle','gather'].includes(u.task.type)).sort((a,c)=>dist(a,b)-dist(c,b))[0];if(worker)this._assign(worker,{type:'build',targetId:b.id,x:b.x,y:b.y});}
  for(const m of machines){if(!this._crewReady(m))continue;const domain=this.getDef(m).domain;if(m.type==='seismicrover'&&!m.patrolling)this._startPatrol(m);if(m.type==='interceptor'&&m.task.type==='idle'){m.layer='underground';for(const id of m.crew)this.getEntity(id).layer=m.layer;const threat=this._living().filter(e=>e.owner!==owner&&e.layer==='underground'&&this._teamCanSee(owner,e.x,e.y,'underground')).sort((a,b)=>dist(a,hq)-dist(b,hq))[0];if(threat)this._assign(m,{type:'attack',targetId:threat.id});else if(dist(m,hq)>5)this._assign(m,{type:'move',x:hq.x+3,y:hq.y});else if(!this.charges.some(c=>c.owner===owner&&c.kind==='proximity'&&dist(c,m)<3))this._layMine(m);}if(enemyHQ&&this.preparationRemaining()===0&&domain==='sea'&&m.task.type==='idle')this._aiNavalOrder(m,enemyHQ);if(enemyHQ&&this.preparationRemaining()===0&&domain==='air'&&m.task.type==='idle'&&!m.returning&&m.fuel>=95)this._aiAirOrder(m,enemyHQ);if(m.type==='drill'&&m.task.type==='idle'){if(enemyHQ&&this.preparationRemaining()===0&&m.aiBomb&&(m.bombReady||0)<=this.time)this._assign(m,{type:'move',x:enemyHQ.x,y:enemyHQ.y});else if(!m.aiBomb){const deposit=this._nearestDeposit(m.x,m.y,20);if(deposit){m.layer='underground';for(const id of m.crew)this.getEntity(id).layer=m.layer;this._assign(m,{type:'gather',x:deposit.x,y:deposit.y});}}}}
  for(const p of this._living(owner).filter(e=>e.type==='investigator'&&!e.boardedIn))if(p.task.type==='idle'&&dist(p,hq)>5)this._assign(p,{type:'move',x:hq.x-2.5,y:hq.y+2.5});
  const uplink=this._buildings(owner,'uplink')[0];if(enemyHQ&&uplink&&(uplink.scanReady||0)<=this.time&&this._spend({money:55},owner)){uplink.scanReady=this.time+45;this.scans.push({owner,x:enemyHQ.x,y:enemyHQ.y,radius:12+uplink.level*2,expires:this.time+12});}
  if(this.time>180&&this.time>=(this._aiUpgradeReady||0)&&this.teams[owner].money>900){const priority={hq:0,armory:1,housing:2,depot:3,power:4,turret:5,factory:6},candidates=this._buildings(owner).filter(b=>b.level<3).sort((a,b)=>a.level-b.level||(priority[a.type]??20)-(priority[b.type]??20));const target=candidates[0]||machines.find(m=>m.level<3);if(target&&this.upgrade(target.id,owner).ok)this._aiUpgradeReady=this.time+35;}
 }
 _aiBuild(type,owner=1,limit=1){
  if(this._living(owner).filter(e=>e.kind==='building'&&e.type===type).length>=limit)return true;if(this.requirements(D.buildings[type],owner).length)return false;const hq=this._buildings(owner,'hq')[0];if(!hq)return false;
  const workers=this._availableWorkers(owner,[],hq).filter(e=>e.type==='engineer');if(!workers.length)return false;for(let attempt=0;attempt<100;attempt++){const radius=attempt<45?19:32,x=clamp(hq.x+(this._random()-.5)*radius,3,this.width-3),y=clamp(hq.y+(this._random()-.5)*radius,3,this.height-3);const p=this._placement(type,x,y,owner);if(p.ok&&this.quote(D.buildings[type].cost,owner).affordable)return this.build(type,x,y,workers.map(u=>u.id),owner).ok;}return false;
 }
 _aiTactics(owner,hq){
  const units=this._living(owner).filter(e=>e.kind!=='building'&&!e.boardedIn&&!e.garrisonedIn&&e.layer==='surface'),state=this.aiStates[owner]||(this.aiStates[owner]={});
  for(const e of units){if(e.kind==='machine'&&!this._crewReady(e)||!this.getDef(e).damage||['engineer','spy','investigator','scout'].includes(e.type))continue;
   if(e.hp<e.maxHp*.28&&dist(e,hq)>8&&!(e.retreatUntil>this.time)){if(this.getDef(e).domain==='air'){e.returning=true;e.resumeTask={type:'idle'};}else this._assign(e,{type:'move',x:clamp(hq.x+3,1,this.width-1),y:clamp(hq.y+3,1,this.height-1)});e.retreatUntil=this.time+25;}
   if(e.type==='general'&&(e.rallyReady||0)<=this.time&&e.autoTargetId){e.rallyReady=this.time+35;for(const u of units)if(dist(e,u)<10)u.rallyUntil=this.time+15;}
  }
  const intruders=this._living().filter(e=>e.owner!==owner&&e.kind!=='building'&&dist(e,hq)<19&&this._teamCanSee(owner,e.x,e.y,e.layer)&&!(e.type==='spy'&&e.disguised&&!e.exposed));
  if(intruders.length){const threat=intruders.sort((a,b)=>dist(a,hq)-dist(b,hq))[0];for(const u of units.filter(e=>this.getDef(e).damage&&dist(e,hq)<27&&['idle','attack','roam'].includes(e.task.type)&&this._canTarget(e,threat)).slice(0,12))this._assign(u,{type:'attack',targetId:threat.id,x:threat.x,y:threat.y});}
  const raid=state.raid;if(raid){const group=raid.ids.map(id=>this.getEntity(id)).filter(e=>e&&e.hp>0&&!e.boardedIn&&!(e.retreatUntil>this.time));if(this.teams[raid.owner]?.eliminated||!group.length){delete state.raid;return;}
   if(this.preparationRemaining()===0&&!intruders.length&&(this.time>=raid.launchAt||group.filter(e=>dist(e,raid.rally)<6).length>=Math.ceil(group.length*.7))){
    for(const e of group){if(e.type==='drill'){e.layer='underground';for(const id of e.crew)this.getEntity(id).layer=e.layer;e.aiBomb=true;this._assign(e,{type:'move',x:raid.x,y:raid.y});}else this._assign(e,{type:'attack',x:raid.x,y:raid.y,...(['tank','artillery','bomber'].includes(e.type)?{targetId:raid.targetId}:{})});}delete state.raid;
   }
  }
 }
 _aiFor(owner){
  if(this.winner!==null)return;const hq=this._buildings(owner,'hq')[0];if(!hq)return;this._observeRivals(owner);this._reconAI(owner);const enemyHQ=this._chooseTarget(owner);
  const engineers=this._living(owner).filter(e=>e.type==='engineer'&&!e.boardedIn),queuedType=type=>this._buildings(owner).reduce((n,b)=>n+b.queue.filter(q=>q.kind==='unit'&&q.type===type).length,0),desiredEngineers=3+(this._has(owner,'factory')?2:0)+(this._has(owner,'airfield')?1:0)+(this._has(owner,'shipyard')?1:0);if(engineers.length+queuedType('engineer')<desiredEngineers)this._queueProduction('unit','engineer',undefined,owner);
  for(const site of this._living(owner).filter(e=>e.kind==='building'&&e.progress<1))if(!engineers.some(e=>e.task.type==='build'&&e.task.targetId===site.id)){const worker=engineers.find(e=>['idle','gather'].includes(e.task.type));if(worker)this._assign(worker,{type:'build',targetId:site.id,x:site.x,y:site.y});}
  const schedule=[['power',12],['armory',28],['factory',48],['smelter',60],['refinery',70],['housing',85],['mine',95],['radar',110],['turret',125],['lab',155],['sensor',180],['crystalworks',190],['countermine',205],['shipyard',210],['airfield',240],['uplink',300]];
  for(const [type,time]of schedule)if(this.time>time&&!this._living(owner).some(e=>e.type===type)){if(this._aiBuild(type,owner))break;}
  const capacity=this.population(owner);if(capacity.used>=capacity.cap*.8&&this.teams[owner].money>300)this._aiBuild('housing',owner,this.difficulty==='relaxed'?2:4);
  if(this.time>260&&this.teams[owner].money>500)this._aiBuild('barracks',owner,this.difficulty==='hard'||this.difficulty==='veteran'?3:2);
  if(this.time>220&&this.teams[owner].money>500)this._aiBuild('turret',owner,this.difficulty==='relaxed'?2:3);
  this._aiTactics(owner,hq);
  // Idle engineers repair priority infrastructure and otherwise mine the nearest deposit.
  for(const eng of engineers)if(eng.task.type==='idle'){
   const damaged=this._buildings(owner).filter(b=>b.hp<b.maxHp*.8).sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp)[0];if(damaged)this._assign(eng,{type:'repair',targetId:damaged.id});else {const dep=this._nearestDeposit(eng.x,eng.y,15);if(dep)this._assign(eng,{type:'gather',x:dep.x,y:dep.y});}
  }
  const army=this._living(owner).filter(e=>e.kind==='unit'),barracks=this._buildings(owner,'barracks').sort((a,b)=>a.queue.length-b.queue.length)[0],maxArmy=this.difficulty==='relaxed'?24:this.difficulty==='hard'||this.difficulty==='veteran'?54:42;
  if(barracks&&barracks.queue.length<2){const crewDeficit=this._living(owner).filter(e=>e.kind==='machine').reduce((n,m)=>n+Math.max(0,this.getDef(m).crew-m.crew.length),0),pendingPilots=army.filter(e=>e.type==='pilot'&&!e.boardedIn).length+queuedType('pilot');let type=null;if(this._has(owner,'radar')&&!army.some(e=>e.type==='investigator')&&!queuedType('investigator'))type='investigator';else if(!army.some(e=>e.type==='scout')&&!queuedType('scout'))type='scout';else if(!army.some(e=>e.type==='mechanic')&&!queuedType('mechanic'))type='mechanic';else if(this._has(owner,'factory')&&crewDeficit>pendingPilots)type='pilot';else if(army.length<maxArmy){type='rifleman';if(this._has(owner,'armory')){const known=Object.values(this.intel[owner]||{}).filter(t=>this.time-t.seenAt<120),air=known.reduce((n,t)=>n+(t.air||0),0),armor=known.reduce((n,t)=>n+(t.armor||0),0),count=k=>army.filter(u=>u.type===k).length+queuedType(k);
   if(count('medic')<Math.max(1,Math.floor(army.length/10)))type='medic';else if(count('rocketeer')<Math.min(8,2+air*2+armor))type='rocketeer';else if(army.length>14&&!count('general'))type='general';else{const choices=['heavy','rifleman','sapper','sniper','rocketeer'];type=choices[Math.floor(this._random()*choices.length)];}}if(type==='rifleman'&&this._has(owner,'radar')&&this.time>180&&this._random()<.18)type='spy';}if(type)this._queueProduction('unit',type,barracks.id,owner);}
  if(this._has(owner,'factory')){const f=this._buildings(owner,'factory')[0],machines=this._living(owner).filter(e=>e.kind==='machine'&&!['air','sea'].includes(this.getDef(e).domain));if(!f.queue.length&&machines.length<Math.min(6,1+Math.floor(this.time/90))&&this.teams[owner].money>650){let type=this._has(owner,'armory')&&this._random()<.3?'artillery':'tank';if(this._has(owner,'lab')&&this.time>230&&this._random()<.3)type='drill';if(this._has(owner,'radar')&&!machines.some(m=>m.type==='seismicrover'))type='seismicrover';else if(this._has(owner,'lab')&&!machines.some(m=>m.type==='interceptor'))type='interceptor';if(this._has(owner,'radar')&&this._has(owner,'armory')&&Object.values(this.intel[owner]||{}).some(t=>t.air>0&&this.time-t.seenAt<150)&&!machines.some(m=>m.type==='flaktank'))type='flaktank';this._queueProduction('machine',type,f.id,owner);}}
  this._aiStrategic(hq,enemyHQ,engineers);
  if(enemyHQ&&this.preparationRemaining()===0&&this.time>this._nextRaid){
   const troops=this._living(owner).filter(e=>!e.boardedIn&&e.kind!=='building'&&!['engineer','mechanic','scout','spy','investigator','harvester','seismicrover','interceptor'].includes(e.type)&&!['sea','air'].includes(this.getDef(e).domain)&&(e.kind!=='machine'||this._crewReady(e)));
   if(troops.length>=6){this._aiWave++;const attackers=troops.filter(e=>(e.task.type==='idle'||e.task.type==='gather')&&e.hp>=e.maxHp*.55&&!(e.retreatUntil>this.time)&&!e.garrisonedIn).slice(0,Math.min(troops.length,this.difficulty==='relaxed'?10:10+this._aiWave*3));if(attackers.length>=6){const angle=Math.atan2(enemyHQ.y-hq.y,enemyHQ.x-hq.x),rally={x:clamp(hq.x+Math.cos(angle)*8,2,this.width-2),y:clamp(hq.y+Math.sin(angle)*8,2,this.height-2)},state=this.aiStates[owner]||(this.aiStates[owner]={});state.raid={x:enemyHQ.x,y:enemyHQ.y,targetId:enemyHQ.id,owner:enemyHQ.owner,rally,launchAt:this.time+24,ids:attackers.map(e=>e.id)};for(const e of attackers)this._assign(e,{type:'attack',x:rally.x,y:rally.y});if(enemyHQ.owner===0)this._event(this.factionName(owner)+' is forming a combined-arms attack group.','danger');}}

   this._nextRaid=this.time+(this.difficulty==='relaxed'?105:this.difficulty==='hard'||this.difficulty==='veteran'?48:65);
  }
  for(const e of this._living(owner)){
   if(enemyHQ&&this.preparationRemaining()===0&&e.type==='spy'&&e.task.type==='idle'){if(e.exposed){const radar=this._buildings(owner,'radar')[0];if(!radar)continue;if(dist(e,radar)>=4){this._assign(e,{type:'move',x:radar.x,y:radar.y});continue;}e.exposed=false;}e.disguised=true;e.coverOwner=enemyHQ.owner;this._assign(e,{type:'infiltrate',targetId:enemyHQ.id,x:enemyHQ.x,y:enemyHQ.y});}
   if(enemyHQ&&this.preparationRemaining()===0&&e.type==='drill'&&e.aiBomb&&e.layer==='underground'&&dist(e,enemyHQ)<3&&(e.bombReady||0)<this.time&&this._crewReady(e)){if(this._spend({money:100,fuel:25,crystal:10},owner)){e.bombReady=this.time+35;this.charges.push({id:this.nextId++,x:e.x,y:e.y,owner,explodeAt:this.time+12,damage:900,radius:4,layer:'underground'});this._assign(e,{type:'move',x:clamp(e.x+6,.5,this.width-.5),y:clamp(e.y+2,.5,this.height-.5)});}}
  }
 }
 factionName(owner){return ['ATLAS','EMBER','COBALT','SABLE'][owner]||'Unknown';}
 _eliminate(owner,captor){
  const team=this.teams[owner];if(team.eliminated)return;team.eliminated=true;
  if(Number.isInteger(captor)&&captor!==owner&&this.teams[captor]&&!this.teams[captor].eliminated){team.capturedBy=captor;const reward={money:1000,metal:250,fuel:120,crystal:60};for(const [k,n] of Object.entries(reward))this.teams[captor][k]+=n;this._event(this.factionName(captor)+' captured '+this.factionName(owner)+' headquarters: +1,000 credits, 250 alloy, 120 fuel, 60 crystal.',captor===0?'success':'info');}
  for(const e of this.entities)if(e.owner===owner){e.hp=0;e.crew=[];e.queue=[];delete e.boardedIn;delete e.garrisonedIn;delete e.garrisonId;delete e.buildQueue;delete e.clearQueue;delete e.patrolling;}this.charges=this.charges.filter(c=>c.owner!==owner);this.scans=this.scans.filter(c=>c.owner!==owner);this._pathRevision++;
 }
 _checkVictory(){
  if(this.winner!==null)return;const alive=this.teams.map((t,i)=>!t.eliminated?i:null).filter(i=>i!==null);
  if(alive.length===1)this.winner=alive[0];
  if(this.winner!==null)this._event(this.winner===0?'VICTORY — all rival headquarters captured.':'DEFEAT — your command headquarters has fallen.',this.winner===0?'success':'danger');
 }
 _observeRivals(owner){
  const memory=this.intel[owner]||(this.intel[owner]={});
  for(const hq of this._living().filter(e=>e.type==='hq'&&e.owner!==owner))if(this._teamCanSee(owner,hq.x,hq.y)){
   const seen=this._living(hq.owner).filter(e=>!e.boardedIn&&dist(e,hq)<16&&this._teamCanSee(owner,e.x,e.y,e.layer));
   memory[hq.owner]={id:hq.id,owner:hq.owner,x:hq.x,y:hq.y,hp:hq.hp,maxHp:hq.maxHp,strength:seen.reduce((n,e)=>n+(this.getDef(e).damage||0)*(e.kind==='machine'?2:1)*(e.hp/e.maxHp),0),seenAt:this.time,air:seen.filter(e=>this.getDef(e).domain==='air').length,armor:seen.filter(e=>e.kind==='machine'&&['land','underground'].includes(this.getDef(e).domain)).length,infantry:seen.filter(e=>e.kind==='unit').length};
  }
 }
 _chooseTarget(owner){
  const hq=this._buildings(owner,'hq')[0];if(!hq)return null;const candidates=Object.values(this.intel[owner]||{}).filter(t=>t.owner!==owner&&!this.teams[t.owner]?.eliminated);
  candidates.sort((a,b)=>this._targetScore(a,hq)-this._targetScore(b,hq));const best=candidates[0];if(!best)return null;
  const state=this.aiStates[owner]||(this.aiStates[owner]={});state.targetOwner=best.owner;return {...best,type:'hq',kind:'building',layer:'surface',level:1,progress:1};
 }
 _targetScore(t,hq){return t.hp/t.maxHp*180+t.strength*.8+dist(t,hq)*1.5+Math.min(180,Math.max(0,this.time-t.seenAt)*.4);}
 _reconAI(owner){
  if(this.time<60)return;
  const rivals=this._basePositions().map((p,i)=>({...p,owner:i})).filter(p=>p.owner!==owner&&!this.teams[p.owner].eliminated),memory=this.intel[owner]||{};rivals.sort((a,b)=>(memory[a.owner]?.seenAt??-1e6)-(memory[b.owner]?.seenAt??-1e6));
  const target=rivals[0];if(!target)return;
  for(const scout of this._living(owner).filter(e=>e.type==='scout'&&!e.boardedIn))if(scout.task.type==='idle'||this.time>=(scout.reconReady||0)){this._assign(scout,{type:'move',x:target.x+(target.x>this.width/2?-6:6),y:target.y});scout.reconReady=this.time+25;}
  const uplink=this._buildings(owner,'uplink')[0];if(uplink&&(uplink.scanReady||0)<=this.time&&this._spend({money:55},owner)){uplink.scanReady=this.time+45;this.scans.push({owner,x:target.x,y:target.y,radius:12+uplink.level*2,expires:this.time+12});}
 }
 _ai(){
  for(let owner=1;owner<this.teams.length;owner++){if(this.teams[owner].eliminated||this.humanOwners?.includes(owner))continue;
   const state=this.aiStates[owner]||(this.aiStates[owner]={wave:0,nextRaid:this.preparationDuration,upgradeReady:0});
   const saved=[this._aiWave,this._nextRaid,this._aiUpgradeReady];if(owner!==1){this._aiWave=state.wave||0;this._nextRaid=state.nextRaid??this.preparationDuration;this._aiUpgradeReady=state.upgradeReady||0;}
   this._aiFor(owner);Object.assign(state,{wave:this._aiWave,nextRaid:this._nextRaid,upgradeReady:this._aiUpgradeReady||0});if(owner!==1)[this._aiWave,this._nextRaid,this._aiUpgradeReady]=saved;
  }
 }
 serialize(){
  const state={version:SAVE_VERSION,aiStates:this.aiStates,intel:this.intel,preparationDuration:this.preparationDuration,width:this.width,height:this.height,seed:this.seed,rng:this._rng,difficulty:this.difficulty,biome:this.biome,time:this.time,paused:this.paused,winner:this.winner,tiles:this.tiles,entities:this.entities,teams:this.teams,explored:this.explored,events:this.events,charges:this.charges,tunnels:this.tunnels,scans:this.scans,nextId:this.nextId,nextEventId:this.nextEventId,aiWave:this._aiWave,nextRaid:this._nextRaid,aiUpgradeReady:this._aiUpgradeReady||0};return JSON.stringify(state);
 }
 static deserialize(str){
  let s;try{s=JSON.parse(str);}catch(e){throw new Error('That save is not valid JSON.');}
  const fail=section=>{throw new Error('Invalid '+section+' in save.');},finite=Number.isFinite,integer=n=>Number.isSafeInteger(n)&&n>=0,point=p=>p&&finite(p.x)&&finite(p.y)&&p.x>=0&&p.x<s.width&&p.y>=0&&p.y<s.height,record=o=>o&&typeof o==='object'&&!Array.isArray(o),has=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
  if(!record(s)||s.version!==SAVE_VERSION||!((s.width===56&&s.height===44)||(s.width===96&&s.height===72)||(s.width===192&&s.height===144)||(s.width===144&&s.height===108))||!Array.isArray(s.entities)||s.entities.length>20000||!Array.isArray(s.teams)||(s.teams.length<2||s.teams.length>4))throw new Error('This save is incompatible or incomplete.');
  if(!finite(s.time)||s.time<0||!integer(s.seed)||!integer(s.rng)||s.rng>4294967295||!(s.winner===null||integer(s.winner)&&s.winner<s.teams.length)||typeof s.paused!=='boolean'||!['relaxed','standard','hard','veteran'].includes(s.difficulty)||!['temperate','desert','tundra'].includes(s.biome)||!integer(s.nextId)||s.nextId<1||!integer(s.nextEventId)||s.nextEventId<1)fail('operation state');
  if(s.preparationDuration!==undefined&&(!finite(s.preparationDuration)||s.preparationDuration<0||s.preparationDuration>600))fail('preparation duration');
  if(s.aiWave!==undefined&&!integer(s.aiWave)||s.nextRaid!==undefined&&(!finite(s.nextRaid)||s.nextRaid<0)||s.aiUpgradeReady!==undefined&&(!finite(s.aiUpgradeReady)||s.aiUpgradeReady<0))fail('AI state');
  for(const bank of s.teams)if(!record(bank)||bank.eliminated!==undefined&&typeof bank.eliminated!=='boolean'||bank.capturedBy!==undefined&&(!integer(bank.capturedBy)||bank.capturedBy>=s.teams.length)||['money','metal','fuel','crystal'].some(k=>!finite(bank[k])||bank[k]<0))fail('resource bank');
  if(!Array.isArray(s.tiles)||s.tiles.length!==s.height||!Array.isArray(s.explored)||s.explored.length!==s.height)fail('map dimensions');
  for(const row of s.tiles){if(!Array.isArray(row)||row.length!==s.width)fail('map dimensions');for(const t of row){if(!record(t)||!has(D.terrains,t.type)||!integer(t.elevation)||t.elevation>3)fail('terrain');if(t.cleared!==undefined&&typeof t.cleared!=='boolean'||t.clearWork!==undefined&&(!finite(t.clearWork)||t.clearWork<0))fail('terrain clearance');if(t.resource&&(!record(t.resource)||!['metal','fuel','crystal'].includes(t.resource.type)||!finite(t.resource.amount)||t.resource.amount<0))fail('resource deposit');}}
  for(const row of s.explored)if(!Array.isArray(row)||row.length!==s.width||row.some(v=>typeof v!=='boolean'))fail('exploration grid');
  for(const e of s.entities){const f=e?.formation;if(f!==undefined&&(!record(f)||!integer(f.leaderId)||f.leaderId<1||!['dx','dy','back','side','speed','frontRange','expires'].every(k=>finite(f[k]))||Math.abs(f.dx)>1.001||Math.abs(f.dy)>1.001||f.back<0||f.back>256||Math.abs(f.side)>256||f.speed<=0||f.speed>20||f.frontRange<0||f.frontRange>20||f.expires<0))throw Error('Invalid formation.');}
  const ids=new Map(),taskTypes=['idle','move','attack','build','gather','repair','infiltrate','garrison','clear','roam','staff'];
  const validTask=t=>{if(!record(t)||!taskTypes.includes(t.type))return false;if(t.targetId!==undefined&&(!integer(t.targetId)||t.targetId<1))return false;if(['build','repair','infiltrate','garrison','staff'].includes(t.type)&&!t.targetId)return false;if(['move','gather','roam'].includes(t.type)||t.type==='attack'&&!t.targetId)return point(t);return ['x','y'].every(k=>t[k]===undefined||finite(t[k])&&t[k]>=0&&t[k]<(k==='x'?s.width:s.height));};
  const numericFields=['angle','cooldown','scanReady','investigateReady','rallyReady','rallyUntil','bombReady','spyClock','spyMessageAt','healClock','gatherClock','lastHitAt','lastAlert','constructionWork','coverUntil','navalPatrol','mineReady','patrolLeg','reconReady','roamNext','retreatUntil'];
  for(const e of s.entities){
   if(!record(e))fail('force data');const defs=e.kind==='unit'?D.units:e.kind==='machine'?D.machines:e.kind==='building'?D.buildings:null,def=defs&&has(defs,e.type)?defs[e.type]:null;
   if(!def||!integer(e.id)||e.id<1||ids.has(e.id)||!point(e)||!(integer(e.owner)&&e.owner<s.teams.length)||!finite(e.hp)||e.hp<0||!finite(e.maxHp)||e.maxHp<=0||e.hp>e.maxHp+.001||!integer(e.level)||e.level<1||e.level>3||!finite(e.progress)||e.progress<0||e.progress>1||!['surface','underground'].includes(e.layer)||!validTask(e.task)||numericFields.some(k=>e[k]!==undefined&&!finite(e[k])))fail('force data');
   if(['disguised','exposed','returning','landed','aiBomb','needsWorkers','patrolling','perch','autoStaff'].some(k=>e[k]!==undefined&&typeof e[k]!=='boolean')||e.resumeTask!==undefined&&!validTask(e.resumeTask)||e.coverTask!==undefined&&!validTask(e.coverTask))fail('force orders');
   if(def.domain==='air'&&(!finite(e.fuel)||e.fuel<0||e.fuel>100))fail('aircraft fuel');
   if(!Array.isArray(e.crew)||new Set(e.crew).size!==e.crew.length||e.crew.some(id=>!integer(id)||id<1)||e.crew.length>(def.crew||0)||!Array.isArray(e.queue)||e.queue.length>8||e.kind!=='building'&&e.queue.length)fail('crew or production data');
   for(const q of e.queue){const qd=q&&q.kind==='unit'?D.units[q.type]:q&&q.kind==='machine'?D.machines[q.type]:null;if(!qd||qd.producer!==e.type||!finite(q.progress)||q.progress<0||q.progress>=1)fail('production queue');}
   if(e.boardedIn!==undefined&&(!integer(e.boardedIn)||e.boardedIn<1||e.kind!=='unit'))fail('crew assignment');ids.set(e.id,e);
  }
  for(const e of s.entities){
   if(e.formation&&(!ids.has(e.formation.leaderId)||ids.get(e.formation.leaderId).owner!==e.owner||ids.get(e.formation.leaderId).kind==='building'||e.kind==='building'))fail('formation leader');
   if(e.task.type==='clear'&&(e.type!=='pioneer'||!e.clearQueue)||e.clearQueue!==undefined&&(e.type!=='pioneer'||!Array.isArray(e.clearQueue)||e.clearQueue.length>400||e.clearQueue.some(p=>!point(p))))fail('clearance queue');
   if(e.perch&&e.type!=='wall')fail('wall perch');
   if(e.autoStaff!==undefined&&e.type!=='barracks')fail('staffing source');
   for(const q of e.queue)if(q.staffTarget!==undefined&&(!integer(q.staffTarget)||!ids.has(q.staffTarget)||ids.get(q.staffTarget).owner!==e.owner||q.kind!=='unit'||!['worker','crew'].includes(q.staffRole)))fail('staffing queue');
   if(e.task.type==='staff'&&(e.task.targetId!==e.staffTarget||!['worker','crew'].includes(e.staffRole)))fail('staffing task');
   if(e.buildQueue!==undefined&&(!Array.isArray(e.buildQueue)||e.buildQueue.length>128||e.buildQueue.some(id=>!integer(id)||!ids.has(id)||ids.get(id).kind!=='building'||ids.get(id).owner!==e.owner)))fail('wall construction queue');
   if(e.gateAxis!==undefined&&!['x','y'].includes(e.gateAxis))fail('gate orientation');
   if(e.garrisonedIn!==undefined){const w=ids.get(e.garrisonedIn);if(!w||!(w.type==='wall'&&w.perch||w.type==='tank')||w.hp<=0||w.garrisonId!==e.id||w.owner!==e.owner||e.kind!=='unit'||e.hp<=0||e.boardedIn||e.layer!=='surface')fail('wall garrison');}
   if(e.garrisonId!==undefined){const u=ids.get(e.garrisonId);if(!u||!(e.type==='wall'&&e.perch||e.type==='tank')||e.hp<=0||u.hp<=0||u.owner!==e.owner||u.garrisonedIn!==e.id)fail('wall garrison');}
   if(e.staffTarget!==undefined&&(!integer(e.staffTarget)||!ids.has(e.staffTarget)||ids.get(e.staffTarget).owner!==e.owner||!['worker','crew'].includes(e.staffRole)))fail('staffing assignment');
   if(e.task.targetId&&!ids.has(e.task.targetId)||e.resumeTask?.targetId&&!ids.has(e.resumeTask.targetId)||e.coverTask?.targetId&&!ids.has(e.coverTask.targetId))fail('order target');
   for(const id of e.crew){const u=ids.get(id);if(!u||u.kind!=='unit'||u.hp<=0||e.hp<=0||u.owner!==e.owner||u.boardedIn!==e.id)fail('crew assignment');}
   if(e.boardedIn!==undefined){const m=ids.get(e.boardedIn);if(!m||m.kind!=='machine'||m.hp<=0||e.hp<=0||m.owner!==e.owner||!m.crew.includes(e.id))fail('crew assignment');}
   if(e.hp>0&&e.layer==='underground'&&(e.kind==='machine'?D.machines[e.type].domain:null)!=='underground'&&!e.boardedIn)fail('force depth');
  }
  for(const key of ['events','charges','tunnels','scans'])if(s[key]!==undefined&&(!Array.isArray(s[key])||s[key].length>20000))fail(key);
  if(s.aiStates!==undefined){if(!record(s.aiStates))fail('AI state');for(const [owner,a] of Object.entries(s.aiStates))if(!integer(Number(owner))||Number(owner)>=s.teams.length||!record(a)||['wave','nextRaid','upgradeReady'].some(k=>a[k]!==undefined&&(!finite(a[k])||a[k]<0))||a.targetOwner!==undefined&&(!integer(a.targetOwner)||a.targetOwner>=s.teams.length))fail('AI state');}
  for(const a of Object.values(s.aiStates||{}))if(a.raid&&(!record(a.raid)||!point(a.raid)||!point(a.raid.rally)||!integer(a.raid.owner)||a.raid.owner>=s.teams.length||!ids.has(a.raid.targetId)||!finite(a.raid.launchAt)||!Array.isArray(a.raid.ids)||a.raid.ids.length>128||a.raid.ids.some(id=>!ids.has(id))))fail('AI rally');
  if(s.intel!==undefined){if(!record(s.intel))fail('reconnaissance memory');for(const [owner,m] of Object.entries(s.intel)){if(!integer(Number(owner))||Number(owner)>=s.teams.length||!record(m))fail('reconnaissance memory');for(const t of Object.values(m))if(!record(t)||!point(t)||!integer(t.owner)||t.owner>=s.teams.length||!ids.has(t.id)||['hp','maxHp','strength','seenAt'].some(k=>!finite(t[k])||t[k]<0)||t.maxHp<=0)fail('reconnaissance memory');}}
  for(const e of s.entities)if(e.coverOwner!==undefined&&(!integer(e.coverOwner)||e.coverOwner>=s.teams.length)||e.patrolling&&(e.type!=='seismicrover'||e.layer!=='underground'||e.crew.length<1))fail('specialist orders');
  const chargeIds=new Set();for(const c of s.charges||[]){if(!point(c)||!integer(c.id)||c.id<1||ids.has(c.id)||chargeIds.has(c.id)||!(integer(c.owner)&&c.owner<s.teams.length)||c.layer!=='underground'||!finite(c.explodeAt)||c.explodeAt<0||!finite(c.damage)||c.damage<=0||!finite(c.radius)||c.radius<=0)fail('underground charge');if(c.kind!==undefined&&c.kind!=='proximity'||c.kind==='proximity'&&(!finite(c.armedAt)||c.armedAt<0))fail('proximity charge');chargeIds.add(c.id);}
  if(s.nextId<=Math.max(0,...ids.keys(),...chargeIds))fail('entity counter');
  const eventIds=new Set();for(const event of s.events||[]){if(!record(event)||!integer(event.id)||event.id<1||eventIds.has(event.id)||!finite(event.time)||event.time<0||typeof event.text!=='string'||!['info','success','danger'].includes(event.tone))fail('event log');eventIds.add(event.id);}
  if(s.nextEventId<=Math.max(0,...eventIds))fail('event counter');
  for(const t of s.tunnels||[])if(!point(t))fail('tunnel');
  for(const scan of s.scans||[])if(!point(scan)||!(integer(scan.owner)&&scan.owner<s.teams.length)||!finite(scan.radius)||scan.radius<=0||!finite(scan.expires)||scan.expires<0)fail('reconnaissance scan');
  const g=new RTSGame({mapSize:s.width<=96?'classic':s.width===192?'expansive':undefined,seed:s.seed,difficulty:s.difficulty,biome:s.biome,opponents:s.teams.length-1});Object.assign(g,{width:s.width,height:s.height,aiStates:s.aiStates||{},intel:s.intel||{},preparationDuration:s.preparationDuration??(s.width===56?0:g.preparationDuration),_rng:s.rng,time:s.time,paused:!!s.paused,winner:s.winner,tiles:s.tiles,entities:s.entities,teams:s.teams,explored:s.explored,events:s.events||[],charges:s.charges||[],tunnels:s.tunnels||[],scans:s.scans||[],nextId:s.nextId,nextEventId:s.nextEventId,_aiWave:s.aiWave||0,_nextRaid:s.nextRaid??s.time+60,_aiUpgradeReady:s.aiUpgradeReady||0});
  for(const e of g.entities){e.path=[];e._pathTarget=null;e._pathRev=-1;e._pathWait=0;delete e._tunnelCell;delete e.autoTargetId;delete e.autoOrigin;delete e.autoReason;delete e._threatCheck;if(g.getDef(e).domain==='air'&&e.landed===undefined)e.landed=!!g._atRunway(e)&&(e.task.type==='idle'||e.returning||!g._crewReady(e));if(e.boardedIn){const m=g.getEntity(e.boardedIn);e.x=m.x;e.y=m.y;e.layer=m.layer;}}g.effects=[];g._updateFog();g._event('Operation restored.','success');return g;
 }
}
global.RTSGame=RTSGame;
})(globalThis);
