/* Room transport. Simulation and ownership validation run on the server. */
(()=>{'use strict';
 const KEY='iron-veil-room-v1';
 const unbits=(value,w,h)=>{const b=atob(value);return Array.from({length:h},(_,y)=>Array.from({length:w},(_,x)=>!!(b.charCodeAt((y*w+x)>>3)&1<<((y*w+x)&7))));};
 class OnlineMatch{
  constructor(callbacks){
   this.callbacks=callbacks;this.session=null;this.queue=[];this.nextSeq=1;this.lastResult=0;this.connected=false;this.timer=null;this.generation=0;this.busy=false;this.revision=-1;this.rtt=0;this.backend='';this.failures=0;this.lastSuccess=0;this.flight=null;
   try{this.backend=OnlineMatch.endpoint(localStorage.getItem('iron-veil-server')||'');}catch{}
   this.wake=()=>{if(this.active&&!this.busy)this.schedule(0);};
   globalThis.addEventListener?.('online',this.wake);globalThis.addEventListener?.('focus',this.wake);
   globalThis.document?.addEventListener('visibilitychange',()=>{if(!document.hidden)this.wake();});
  }
  static endpoint(value){if(!value.trim())return '';const u=new URL(value);if(u.username||u.password||u.search||u.hash||!(u.protocol==='https:'||u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname)))throw Error('Use an HTTPS server URL (or localhost for development).');return u.origin;}
  configure(value){if(this.active)throw Error('Leave the current room before changing servers.');this.backend=OnlineMatch.endpoint(value);localStorage.setItem('iron-veil-server',this.backend);}
  get active(){return !!this.session;}
  async request(action,input={}){
   const started=performance.now(),endpoint=this.session?.backend??this.backend;
   const response=await fetch(endpoint+'/api/rooms/'+action,{method:'POST',credentials:endpoint?'omit':'same-origin',headers:{'Content-Type':'application/json',...(this.session?.token?{Authorization:'Bearer '+this.session.token}:{})},body:JSON.stringify({...input,...(this.session?{code:this.session.code}: {})}),signal:AbortSignal.timeout(10000)});
   let result;try{result=await response.json();}catch{throw Error('Game server unavailable. If using Codespaces, reopen the game Codespace. Your room is retained while reconnecting.');}
   this.rtt=Math.round(performance.now()-started);
   if(!response.ok){const e=Error(result.error||'Connection failed.');e.status=response.status;e.permanent=result.code==='ROOM_EXPIRED'||result.code==='SESSION_INVALID'||(response.status===404&&result.error==='Room not found or expired.')||(response.status===401&&result.error==='Your room session is invalid. Rejoin with the room code.');throw e;}
   if(!result||!['waiting','playing','finished','closed'].includes(result.status)||!Number.isSafeInteger(result.seq))throw Error('Invalid server reply. Reconnecting without discarding your room.');
   return result;
  }
  remember(){try{if(this.session)localStorage.setItem(KEY,JSON.stringify({...this.session,pending:this.queue,nextSeq:this.nextSeq,lastResult:this.lastResult}));else localStorage.removeItem(KEY);}catch{}}
  adopt(result){this.session={code:result.code,token:result.token,seat:result.seat,backend:this.backend};this.queue=[];this.nextSeq=(result.seq||0)+1;this.lastResult=result.seq||0;this.revision=-1;this.connected=true;this.generation++;this.accept(result);try{localStorage.removeItem(KEY+'.join');}catch{}this.schedule();}
  async create(biome,ai,humans=2){if(this.active)throw Error('Leave the current room first.');this.adopt(await this.request('create',{biome,ai,humans}));}
  async join(code){
   if(this.active)throw Error('Leave the current room first.');code=code.trim().toUpperCase();
   let pending;try{pending=JSON.parse(localStorage.getItem(KEY+'.join')||'null');}catch{}
   if(pending?.code!==code||pending?.backend!==this.backend||!/^[a-f0-9]{48}$/.test(pending?.claim||''))pending={code,backend:this.backend,claim:Array.from(crypto.getRandomValues(new Uint8Array(24)),x=>x.toString(16).padStart(2,'0')).join('')};
   try{localStorage.setItem(KEY+'.join',JSON.stringify(pending));}catch{}
   this.adopt(await this.request('join',{code,claim:pending.claim}));
  }
  async resume(){
   let saved;try{saved=JSON.parse(localStorage.getItem(KEY)||'null');if(!saved?.token||!saved?.code){const pending=JSON.parse(localStorage.getItem(KEY+'.join')||'null');if(pending?.code&&pending.backend===this.backend)await this.join(pending.code);return;}this.session={code:saved.code,token:saved.token,seat:saved.seat,backend:OnlineMatch.endpoint(saved.backend||'')};}catch{return;}
   this.queue=Array.isArray(saved.pending)?saved.pending.filter(c=>Number.isSafeInteger(c.seq)&&c.seq>0&&typeof c.method==='string'&&Array.isArray(c.args)&&JSON.stringify(c.args).length<=8000).slice(0,64):[];
   this.nextSeq=Math.max(1,Number(saved.nextSeq)||1,...this.queue.map(c=>c.seq+1));this.lastResult=Number(saved.lastResult)||0;const generation=++this.generation;
   try{const result=await this.request('tick');if(generation!==this.generation)return;this.accept(result);this.schedule(0);}catch(e){if(generation!==this.generation)return;this.failure(e);if(this.active)this.schedule(1000);}
  }
  async start(){const generation=this.generation,result=await this.request('start');if(generation===this.generation)this.accept(result);}
  async leave(){if(!this.active)return;const generation=this.generation;await this.request('leave');if(generation!==this.generation)return;this.stop();this.callbacks.closed();}
  stop(){this.generation++;clearTimeout(this.timer);this.session=null;this.queue=[];this.connected=false;this.playing=false;this.revision=-1;this.busy=false;this.flight=null;this.remember();}
  send(method,args){
   if(!this.active)return {ok:false,message:'Join a room first.'};
   if(!Array.isArray(args)||JSON.stringify(args).length>8000)return {ok:false,message:'Order too large. Select a smaller group.'};
   if(this.queue.length>=64)return {ok:false,message:'Waiting for pending orders. Please try again shortly.'};
   this.queue.push({seq:this.nextSeq++,method,args});this.remember();if(!this.busy)this.schedule(0);
   return {ok:true,message:this.connected?'Order sent.':'Order queued — will send after reconnection.'};
  }
  batch(){const out=[];for(const cmd of this.queue.slice(0,8)){if(JSON.stringify([...out,cmd]).length>16000)break;out.push(cmd);}return out;}
  accept(result){
   if(Number.isFinite(result.revision)&&result.revision<=this.revision)return;
   if(Number.isFinite(result.revision))this.revision=result.revision;
   this.pollInterval=Math.max(250,Math.min(500,Number(result.pollInterval)||250));this.connected=true;this.failures=0;this.lastSuccess=Date.now();this.playing=result.status==='playing';this.waitingForConnection=!!result.waitingForConnection;this.queue=this.queue.filter(c=>c.seq>result.seq);this.nextSeq=Math.max(this.nextSeq,result.seq+1);
   for(const answer of result.results||[])if(answer.seq>this.lastResult){this.lastResult=answer.seq;this.callbacks.result(answer);}
   this.remember();this.callbacks.room({...result,rtt:this.rtt,pendingOrders:this.queue.length});if(result.state)this.callbacks.state(result.state,result);
   if(result.status==='closed'){this.stop();this.callbacks.closed();}
  }
  failure(e){
   this.connected=false;this.failures++;
   if(e.permanent){const message=e.message;this.stop();this.callbacks.closed();this.callbacks.status(message);return;}
   const age=this.lastSuccess?Math.round((Date.now()-this.lastSuccess)/1000):0;
   this.callbacks.status('Reconnecting'+(age?' · '+age+'s since update':'')+' · '+this.queue.length+' orders retained'+(this.failures>=3?'. If using Codespaces, reopen the game Codespace.':''));
  }
  schedule(delay=250){
   clearTimeout(this.timer);if(!this.active||this.busy)return;const generation=this.generation;
   this.timer=setTimeout(async()=>{
    const flight={};this.flight=flight;this.busy=true;const started=performance.now();
    try{const result=await this.request('tick',{commands:this.batch()});if(generation!==this.generation)return;this.accept(result);}catch(e){if(generation!==this.generation)return;this.failure(e);}finally{if(this.flight===flight){this.flight=null;this.busy=false;}}
    if(generation===this.generation&&this.active){const interval=globalThis.document?.hidden?1500:this.waitingForConnection?1000:this.playing?this.pollInterval||250:1000;this.schedule(this.connected?(this.queue.length&&!this.waitingForConnection?0:Math.max(50,interval-(performance.now()-started))):Math.min(5000,500*2**Math.min(4,this.failures))*(.8+Math.random()*.4));}
   },delay);
  }
  static position(e,now=performance.now()){const p=e._interpolation;if(!p)return {x:e.x,y:e.y};const t=Math.max(0,Math.min(1,(now-p.start)/p.duration));return {x:p.x+(e.x-p.x)*t,y:p.y+(e.y-p.y)*t};}
  static apply(game,state){
   const previous=new Map(game.entities.map(e=>[e.id,e]));const now=performance.now(),gap=game._onlineReceived?now-game._onlineReceived:200;game._onlineReceived=now;game._onlineInterval=Math.max(100,Math.min(1800,(game._onlineInterval||gap)*.4+gap*.6));
   for(const e of state.entities){const old=previous.get(e.id);if(old&&e.kind!=='building'&&e.layer===old.layer&&Math.hypot(e.x-old.x,e.y-old.y)<12){const from=OnlineMatch.position(old,now);e._interpolation={...from,start:now,duration:game._onlineInterval};}if(old&&e.owner===0&&e.kind==='building'&&e.hp<old.hp&&(game._onlineAlert||0)<state.time){game._onlineAlert=state.time+8;game._event(game.getDef(e).name+' is under attack!','danger');}}
   state.teams.forEach((t,i)=>{if(t.eliminated&&!game.teams[i]?.eliminated)game._event(i===0?'Your faction has been eliminated.':'Rival headquarters eliminated. '+state.teams.filter(t=>!t.eliminated).length+' factions remain.',i===0?'danger':'success');});
   Object.assign(game,{playerSeats:state.playerSeats,humanCount:state.humanCount,entities:state.entities,teams:state.teams,time:state.time,winner:state.winner,preparationDuration:state.preparationDuration,charges:state.charges,effects:state.effects,tunnels:state.tunnels,visible:unbits(state.visible,game.width,game.height),undergroundVisible:unbits(state.undergroundVisible,game.width,game.height),explored:unbits(state.explored,game.width,game.height)});
   if(state.playerSeats)game.factionName=owner=>{const seat=state.playerSeats[owner];return seat<state.humanCount?'PLAYER '+(seat+1)+(owner===0?' (YOU)':''):'AI '+(seat-state.humanCount+1);};
   game._visibility[0]=game.visible;game._underVisibility[0]=game.undergroundVisible;
   for(const patch of state.terrain){const tile=game.tiles[patch.y]?.[patch.x];if(!tile)continue;if(patch.cleared&&!tile.cleared){tile.cleared=true;tile.type=patch.type;(game._terrainChanges||=[]).push({x:patch.x+.5,y:patch.y+.5});}if(tile.resource&&Number.isFinite(patch.amount))tile.resource.amount=patch.amount;}
   game._pathRevision++;game.paused=true;
  }
 }
 globalThis.OnlineMatch=OnlineMatch;
})();
