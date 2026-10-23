// Authoritative, revision-checked room simulation. No client-supplied game state.
import '../dist/data.js';
import '../dist/engine.js';
const Game=globalThis.RTSGame;
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const random=(n=24)=>Array.from(crypto.getRandomValues(new Uint8Array(n)),x=>x.toString(16).padStart(2,'0')).join('');
const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),x=>x.toString(16).padStart(2,'0')).join('');
export async function encode(value){return new Uint8Array(await new Response(new Blob([JSON.stringify(value)]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());}
export async function decode(value){return JSON.parse(await new Response(new Blob([new Uint8Array(value)]).stream().pipeThrough(new DecompressionStream('gzip'))).text());}
function bits(grid){const bytes=new Uint8Array(Math.ceil(grid.length*grid[0].length/8));let n=0;for(const row of grid)for(const v of row){if(v)bytes[n>>3]|=1<<(n&7);n++;}return btoa(String.fromCharCode(...bytes));}
function unbits(value,w,h){const b=atob(value);return Array.from({length:h},(_,y)=>Array.from({length:w},(_,x)=>!!(b.charCodeAt((y*w+x)>>3)&1<<((y*w+x)&7))));}
// Immutable seeded terrain is shared only as a baseline, never as mutable room state.
const maps=new Map();
function baseTiles(g){const key=[g.seed,g.biome,g.width,g.height,g.teams.length].join(':');if(!maps.has(key)){const fresh=new Game({seed:g.seed,biome:g.biome,opponents:g.teams.length-1,mapSize:g.width===96?'classic':g.width===192?'expansive':undefined});if(maps.size>=6)maps.delete(maps.keys().next().value);maps.set(key,fresh.tiles);}return maps.get(key);}
function tileChanges(g){const base=baseTiles(g),changes=[];for(let y=0;y<g.height;y++)for(let x=0;x<g.width;x++){const a=g.tiles[y][x],b=base[y]?.[x];if(!b||a.type!==b.type||a.elevation!==b.elevation||a.cleared!==b.cleared||a.clearWork!==b.clearWork||a.resource?.amount!==b.resource?.amount||a.resource?.type!==b.resource?.type)changes.push({x,y,tile:a});}return changes;}
export function persist(g,meta){
 // Casualties have already released crews, perches and HQ ownership in _kill.
 // Their visual effects are independent; retaining corpses makes every future scan grow.
 g.entities=g.entities.filter(e=>e.hp>0);
 const game={};for(const key of ['aiStates','intel','preparationDuration','width','height','seed','difficulty','biome','time','paused','winner','entities','teams','events','charges','tunnels','scans','nextId','nextEventId'])game[key]=g[key];
 Object.assign(game,{version:3,rng:g._rng,aiWave:g._aiWave,nextRaid:g._nextRaid,aiUpgradeReady:g._aiUpgradeReady||0,tilePatches:tileChanges(g)});
 return {game:structuredClone(game),runtime:{fog:g._fogTimer,ai:g._aiTimer,economy:g._economyTimer,revision:g._pathRevision,explored:g.onlineExplored.map(bits),effects:g.effects},meta};
}
export function hydrate(data){const s=data.game,r=data.runtime,g=Object.assign(Object.create(Game.prototype),s,{_rng:s.rng,_aiWave:s.aiWave,_nextRaid:s.nextRaid,_aiUpgradeReady:s.aiUpgradeReady,_fogTimer:r.fog,_aiTimer:r.ai,_economyTimer:r.economy,_pathRevision:r.revision,_terrainChanges:[],effects:r.effects||[],humanOwners:Array.from({length:data.meta.humanCount||2},(_,i)=>i)});
 g.entities=g.entities.filter(e=>e.hp>0);
 if(!s.tiles){g.tiles=baseTiles(g).map(row=>row.map(t=>({...t,...(t.resource?{resource:{...t.resource}}:{})})));for(const p of s.tilePatches||[])g.tiles[p.y][p.x]=structuredClone(p.tile);}
 g.onlineExplored=r.explored.map(b=>unbits(b,g.width,g.height));g.explored=g.onlineExplored[0];g._updateFog();return g;}
function observe(g){for(let owner=0;owner<g.humanOwners.length;owner++)for(let y=0;y<g.height;y++)for(let x=0;x<g.width;x++)if(g._visibility[owner][y][x])g.onlineExplored[owner][y][x]=true;}
export function asPlayer(g,owner,action){
 if(owner===0)return action();const swap=n=>n===0?owner:n===owner?0:n,originalExplored=g.explored;
 const flip=()=>{[g.teams[0],g.teams[owner]]=[g.teams[owner],g.teams[0]];for(const e of [...g.entities,...g.charges,...g.scans]){e.owner=swap(e.owner);if(e.coverOwner!==undefined)e.coverOwner=swap(e.coverOwner);}for(const team of g.teams)if(team.capturedBy!==undefined)team.capturedBy=swap(team.capturedBy);[g._visibility[0],g._visibility[owner]]=[g._visibility[owner],g._visibility[0]];[g._underVisibility[0],g._underVisibility[owner]]=[g._underVisibility[owner],g._underVisibility[0]];g.visible=g._visibility[0];g.undergroundVisible=g._underVisibility[0];if(g.winner!==null)g.winner=swap(g.winner);g._blocksRevision=-1;};
 flip();g.explored=g.onlineExplored[owner];try{return action();}finally{flip();g.explored=originalExplored;}
}
export function order(g,owner,command){
 if(g.teams[owner].eliminated||g.winner!==null)return {ok:false,message:'Your faction is no longer active.'};
 const {method,args=[]}=command;if(!Array.isArray(args)||args.length>7)return {ok:false,message:'Invalid order.'};
 const methods=['build','buildWallLine','clearArea','train','produce','upgrade','upgradeGroup','command','crew','uncrew','ability','demolish'];
 if(!methods.includes(method))return {ok:false,message:'Unknown order.'};
 if(JSON.stringify(args).length>8000)return {ok:false,message:'Order too large.'};
 // Never accept an owner override, arbitrary option keys, or unbounded ID lists.
 const ids=a=>Array.isArray(a)?a.slice(0,128).filter(Number.isSafeInteger):[],point=p=>({x:Number(p?.x),y:Number(p?.y)});
 let clean;
 if(method==='build')clean=[String(args[0]),Number(args[1]),Number(args[2]),ids(args[3]),0,{gateAxis:args[5]?.gateAxis==='y'?'y':'x'}];
 else if(method==='buildWallLine')clean=[point(args[0]),point(args[1]),ids(args[2]),0];
 else if(method==='clearArea')clean=[ids(args[0]),point(args[1]),point(args[2])];
 else if(method==='command'){const opt=args[3]||{},modes=['move','attack','gather','build','repair','garrison','infiltrate'];if(!modes.includes(opt.mode||'move'))return {ok:false,message:'Invalid command.'};clean=[ids(args[0]),Number(args[1]),Number(args[2]),{mode:opt.mode||'move',targetId:Number(opt.targetId)}];}
 else if(method==='upgradeGroup')clean=[ids(args[0])];
 else if(method==='ability')clean=[ids(args[0]),String(args[1]),point(args[2])];
 else if(method==='crew')clean=[Number(args[0]),ids(args[1])];
 else if(['train','produce'].includes(method))clean=[String(args[0]),args[1]==null?undefined:Number(args[1])];
 else clean=[Number(args[0])];
 try{return asPlayer(g,owner,()=>{if(method==='build'&&!g.canSee(clean[1],clean[2]))return {ok:false,message:'Scout this location first.'};const result=Game.prototype[method].apply(g,clean);return {ok:!!result.ok,message:result.message,entityId:result.entity?.id};});}catch{return {ok:false,message:'Invalid order parameters.'};}
}
export function view(g,owner,observed=false){
 if(!observed)observe(g);const map=n=>n===0?owner:n===owner?0:n,teams=g.teams.map((t,i)=>({...(i===owner?t:{money:0,metal:0,fuel:0,crystal:0,eliminated:!!t.eliminated}),...(t.capturedBy===undefined?{}:{capturedBy:map(t.capturedBy)})}));[teams[0],teams[owner]]=[teams[owner],teams[0]];
 const entities=g.entities.filter(e=>e.hp>0&&(e.owner===owner||!e.boardedIn&&g._teamCanSee(owner,e.x,e.y,e.layer))).map(e=>{const copy={...e,owner:map(e.owner),path:[]};if(copy.coverOwner!==undefined)copy.coverOwner=map(copy.coverOwner);if(e.owner!==owner){delete copy.formation;delete copy.lastAttackerId;delete copy.autoTargetId;copy.task={type:e.path?.length?'move':'idle'};copy.queue=[];copy.crew=[];if(e.type==='spy'&&e.disguised&&!e.exposed){const maxHp=Math.round(RTS_DATA.units.rifleman.hp*(1+(e.level-1)*.3));Object.assign(copy,{type:'rifleman',owner:map(e.coverOwner??owner),maxHp,hp:maxHp*e.hp/e.maxHp,disguised:false});}}return copy;});
 const terrain=tileChanges(g).filter(p=>g.onlineExplored[owner][p.y][p.x]).map(({x,y,tile:t})=>({x,y,type:t.type,elevation:t.elevation,cleared:!!t.cleared,...(t.resource?{amount:t.resource.amount}: {})}));
 return {playerSeats:g.teams.map((_,i)=>map(i)),humanCount:g.humanOwners.length,seed:g.seed,biome:g.biome,width:g.width,height:g.height,opponents:g.teams.length-1,time:g.time,winner:g.winner===null?null:map(g.winner),preparationDuration:g.preparationDuration,teams,entities,visible:bits(g._visibility[owner]),undergroundVisible:bits(g._underVisibility[owner]),explored:bits(g.onlineExplored[owner]),terrain,charges:g.charges.filter(c=>c.owner===owner||g._teamCanSee(owner,c.x,c.y,'underground')).map(c=>({...c,owner:map(c.owner)})),tunnels:[],effects:g.effects.filter(e=>g._teamCanSee(owner,e.x,e.y,e.layer)).map(e=>({...e,owner:map(e.owner)}))};
}
// Credentials stay inside the private room payload. Legacy two-seat rows remain valid.
function normalizeSeats(meta,room){
 meta.humanCount=meta.humanCount||2;
 meta.seatHashes=meta.seatHashes||[room.host_hash,room.guest_hash];
 for(let i=0;i<meta.humanCount;i++){meta.seatHashes[i]??=null;meta.lastSeen[i]??=0;meta.lastSeq[i]??=0;meta.results[i]??=[];}
 meta.joined=meta.seatHashes.every(Boolean);
}
function lobby(meta,now,g){
 return {humanCount:meta.humanCount,joined:meta.joined,pollInterval:Math.max(250,meta.humanCount*125),players:meta.seatHashes.map((hash,seat)=>({seat,occupied:!!hash,connected:!!hash&&now-meta.lastSeen[seat]<=12000,eliminated:!!g?.teams[seat]?.eliminated}))};
}
export async function multiplayer(request,env){
 try{
  if(!env.DB)return json({error:'Online rooms are not available on this server.'},503);
  if(request.method!=='POST')return json({error:'Use POST.'},405);
  const url=new URL(request.url),origin=request.headers.get('Origin');if(origin&&origin!==url.origin)return json({error:'Cross-origin requests are not allowed.'},403);
  const raw=await request.text();if(raw.length>20000)return json({error:'Request too large.'},413);let input;try{input=JSON.parse(raw);}catch{return json({error:'Invalid JSON.'},400);}if(!input||typeof input!=='object')return json({error:'Invalid request.'},400);
  const action=url.pathname.split('/').pop(),now=Date.now(),db=env.DB;
  if(action==='create'){
   const creator=await digest(request.headers.get('CF-Connecting-IP')||'local');const recent=await db.prepare('SELECT COUNT(*) AS n FROM rooms WHERE creator=? AND created>?').bind(creator,now-3600000).first();if(recent.n>=10)return json({error:'Room creation limit reached. Reuse your existing room or try later.'},429);
   await db.prepare('DELETE FROM rooms WHERE expires<?').bind(now).run();
   const humanCount=Math.max(2,Math.min(4,Math.floor(Number(input.humans)||2)));
   const token=random(),hostHash=await digest(token),code=random(5).toUpperCase(),g=new Game({seed:crypto.getRandomValues(new Uint32Array(1))[0],biome:['temperate','desert','tundra'].includes(input.biome)?input.biome:'temperate',difficulty:'standard',opponents:humanCount-1+Math.max(0,Math.min(4-humanCount,Math.floor(Number(input.ai)||0)))});
   g.humanOwners=Array.from({length:humanCount},(_,i)=>i);for(const i of g.humanOwners)g.teams[i]={...g.teams[0]};g.onlineExplored=g.humanOwners.map(i=>i===0?g.explored:g._blankGrid());observe(g);const meta={status:'waiting',humanCount,seatHashes:[hostHash,...Array(humanCount-1).fill(null)],joined:false,lastSeen:g.humanOwners.map(i=>i===0?now:0),lastSeq:Array(humanCount).fill(0),results:g.humanOwners.map(()=>[]),lastTick:now};
   await db.prepare('INSERT INTO rooms (code,host_hash,guest_hash,creator,created,expires,revision,payload) VALUES (?,?,NULL,?,?,?,0,?)').bind(code,hostHash,creator,now,now+1800000,await encode(persist(g,meta))).run();return json({code,token,seat:0,status:'waiting',...lobby(meta,now,g),seq:0});
  }
  const code=String(input.code||'').trim().toUpperCase();if(!/^[A-F0-9]{10}$/.test(code))return json({error:'Enter the ten-character room code.'},400);
  const bearer=request.headers.get('Authorization')?.replace(/^Bearer /,'')||'',hash=bearer?await digest(bearer):'';
  const claim=action==='join'&&/^[a-f0-9]{48}$/.test(input.claim||'')?input.claim:null,claimHash=claim?await digest(claim):null;
  for(let attempt=0;attempt<8;attempt++){
   const room=await db.prepare('SELECT * FROM rooms WHERE code=?').bind(code).first();if(!room||room.expires<now)return json({error:'Room not found or expired.',code:'ROOM_EXPIRED'},404);
   const data=await decode(room.payload),meta=data.meta;normalizeSeats(meta,room);
   let seat=hash?meta.seatHashes.indexOf(hash):-1,token=null,leftLobby=false;
   if(action==='join'){
    // The same high-entropy claim recovers a lost join acknowledgement without consuming another seat.
    seat=claimHash?meta.seatHashes.indexOf(claimHash):-1;
    if(seat<0){
     if(meta.status!=='waiting')return json({error:'This room has already started or closed.'},409);
     seat=meta.seatHashes.findIndex((h,i)=>i>0&&!h);
     if(seat<0)return json({error:'This room is full.'},409);
     token=claim||random();meta.seatHashes[seat]=claimHash||await digest(token);
    }else token=claim;
    meta.joined=meta.seatHashes.every(Boolean);
   }else if(seat<0)return json({error:'Your room session is invalid. Rejoin with the room code.',code:'SESSION_INVALID'},401);
   const g=hydrate(data);meta.lastSeen[seat]=now;
   if(action==='start'){
    if(seat!==0)return json({error:'Only the host can start the match.'},403);
    if(meta.status==='waiting'){
     if(!meta.joined||meta.lastSeen.some(t=>now-t>12000))return json({error:'Wait for every reserved human seat to join and reconnect.'},409);
     meta.status='playing';meta.lastTick=now;
    }
   }
   if(action==='leave'){
    if(meta.status==='waiting'){
     if(seat===0)meta.status='closed';
     else {meta.seatHashes[seat]=null;meta.lastSeen[seat]=0;meta.lastSeq[seat]=0;meta.results[seat]=[];meta.joined=false;leftLobby=true;}
    }else if(meta.status==='playing'&&!g.teams[seat].eliminated){const hq=g._buildings(seat,'hq')[0];if(hq)g._kill(hq);}
   }
   if(!['join','start','leave','tick'].includes(action))return json({error:'Unknown room action.'},404);
   const waitingForConnection=meta.status==='playing'&&g.humanOwners.some(i=>!g.teams[i].eliminated&&now-meta.lastSeen[i]>12000);
   if(meta.status==='playing'&&!waitingForConnection){
    g.paused=false;
    // Bound catch-up CPU, not ordinary game speed. Carry unfinished time to later polls.
    let debt=Math.min(12,(meta.simDebt||0)+Math.max(0,(now-meta.lastTick)/1000));
    const deadline=performance.now()+45;
    do{const step=Math.min(.1,debt);g.update(step);debt-=step;}while(debt>1e-6&&g.winner===null&&performance.now()<deadline);
    meta.simDebt=g.winner===null?Math.max(0,debt):0;
   }else meta.simDebt=0;
   // A concurrent request may have started earlier than the latest committed tick.
   meta.lastTick=Math.max(meta.lastTick,now);
   const commands=Array.isArray(input.commands)?input.commands.slice(0,8):[];
   if(meta.status==='playing'&&!waitingForConnection)for(const cmd of commands){if(!Number.isSafeInteger(cmd.seq)||cmd.seq<=meta.lastSeq[seat])continue;if(cmd.seq!==meta.lastSeq[seat]+1)break;const result=order(g,seat,cmd);meta.lastSeq[seat]=cmd.seq;meta.results[seat].push({seq:cmd.seq,...result});meta.results[seat]=meta.results[seat].slice(-16);}
   if(g.winner!==null)meta.status='finished';g._updateFog();observe(g);
   const updated=await db.prepare('UPDATE rooms SET guest_hash=?,expires=?,revision=revision+1,payload=? WHERE code=? AND revision=?').bind(meta.seatHashes[1],Math.min(room.created+21600000,now+1800000),await encode(persist(g,meta)),code,room.revision).run();
   if(!updated.meta.changes)continue;
   return json({code,seat,...(token?{token}:{}),status:leftLobby?'closed':meta.status,...lobby(meta,now,g),waitingForConnection,lagSeconds:Math.round((meta.simDebt||0)*10)/10,seq:meta.lastSeq[seat],results:meta.results[seat],revision:room.revision+1,...(meta.status==='playing'||meta.status==='finished'?{state:view(g,seat,true)}:{})});
  }
  return json({error:'Room is busy; retrying is safe.'},409);
 }catch(error){console.error('Multiplayer request failed',error?.message);return json({error:'The room server could not complete this request. Please retry.'},500);}
}
