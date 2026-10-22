/* IRON VEIL — command interface. Solo simulation and server-authoritative online command interface. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const D = globalThis.RTS_DATA;
  const canvas = $('battlefield');
  const SAVE_KEY = 'iron-veil-operation-v1';
  const PREF_KEY = 'iron-veil-preferences-v1';
  const format = n => Math.max(0, Math.floor(Number(n) || 0)).toLocaleString('en-US');
  const clock = t => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const biomeNames = {temperate:'BLACK HOLLOW', desert:'SCORCHED REACH', tundra:'WHITE DIVIDE'};
  const biomeNotes = {temperate:'144 × 108 tiles · Western ocean, wooded valleys and a winding inland river. Three crossings create competing approaches.',desert:'144 × 108 tiles · Central inland sea, northern coast, rocky mesas and a southern land route. Control the lake shores or flank around them.',tundra:'144 × 108 tiles · Branching fjords split snowy peninsulas. Causeways, forest pockets and narrow sea lanes reward combined arms.'};
  const prepDurations={relaxed:600,standard:600,veteran:600};
  const statNumber=n=>Number(n.toFixed(2)).toLocaleString('en-US');
  function difficultyBrief(){const seconds=prepDurations[$('difficultySelect').value]||600;$('difficultyDescription').textContent=`${seconds/60} minutes to prepare before enemy raids mobilize. Build your economy, defenses and crews. Enemy territory is still defended.`;}
  let onlineGame=false,roomStatus='',demolitionId=null;
  let game = new RTSGame({seed:41807,difficulty:'standard',biome:'temperate'});
  let renderer = new RTSRenderer(canvas,game);
  let gateAxis='x';
  let started = false, speed = 1, tab = 'build', placement = null, orderMode = null;
  let selection = new Set(), pointer = null, pointerXY = {x:0,y:0}, keys = new Set(), scanSourceIds = [];
  let groups = {}, modalPause = false, uiTimer = 0, mapTimer = 0, saveTimer = 0;
  let lastFrame = performance.now(), resultShown = false, catalogSignature = '', selectionSignature = '';
  let audioCtx = null, lastDangerEvent = null, lastSeenEvent = null;
  let preferences = {};
  try { preferences = JSON.parse(localStorage.getItem(PREF_KEY)||'{}'); } catch {}
  if(!preferences||typeof preferences!=='object'||Array.isArray(preferences))preferences={};
  renderer.setQuality(preferences.graphics||'balanced');
  $('graphicsSelect').value=renderer.quality;
  $('graphicsSelect').onchange=()=>{renderer.setQuality($('graphicsSelect').value);preferences.graphics=renderer.quality;try{localStorage.setItem(PREF_KEY,JSON.stringify(preferences));}catch{}};
  game.paused = true;
  renderer.selection = selection;
  renderer.layer = 'surface';
  globalThis.ironVeil = {get game(){return game},get renderer(){return renderer},get selection(){return [...selection]},startOperation,select:ids=>{selection=new Set(ids);renderer.selection=selection;selectionSignature='';refreshUI()},setTab};

  const online=new OnlineMatch({
    status(message){$('onlineStatus').textContent=message;roomStatus=message;if(onlineGame)$('status').textContent='RECONNECTING';},
    room(room){$('roomDetails').hidden=false;$('activeRoomCode').textContent=room.code;$('startRoom').hidden=room.seat!==0||!room.joined||room.status!=='waiting';$('hostRoom').disabled=true;$('joinRoom').disabled=true;roomStatus=room.waitingForConnection?'Waiting for disconnected player — match paused':room.status==='waiting'?(room.joined?'Your friend joined. Host can start the match.':'Waiting for your friend. Share this code.'):'Online match · '+room.code+' · '+room.rtt+' ms'+(room.rtt>800?' · slow network':'');$('onlineStatus').textContent=roomStatus;},
    result(answer){toast(answer.message,answer.ok?'success':'danger');if(answer.ok&&answer.entityId)setSelection([answer.entityId]);},
    state(state,room){
      const first=!onlineGame;if(first){startOperation({online:true,seed:state.seed,biome:state.biome,opponents:state.opponents});onlineGame=true;for(const method of ['build','buildWallLine','clearArea','train','produce','upgrade','upgradeGroup','command','crew','uncrew','ability','demolish'])game[method]=(...args)=>online.send(method,args);}
      OnlineMatch.apply(game,state);if(first)home();syncPause();if(state.winner!==null||state.teams[0].eliminated)showResult();
    },
    closed(){onlineGame=false;$('roomDetails').hidden=true;$('hostRoom').disabled=false;$('joinRoom').disabled=false;['pauseButton','speedButton','saveButton'].forEach(id=>$(id).disabled=false);$('onlineStatus').textContent='Room left. Create or join another match.';if(started){started=false;game.paused=true;$('resultOverlay').hidden=true;showMenu();}}
  });
  globalThis.ironVeil.online=online;
  const onlineAction=fn=>async()=>{try{await fn();}catch(e){$('onlineStatus').textContent=e.message;toast(e.message,'danger');}};
  $('serverUrl').value=online.backend;
  $('saveServer').onclick=onlineAction(async()=>{online.configure($('serverUrl').value);$('serverUrl').value=online.backend;$('onlineStatus').textContent=online.backend?'Server set. Share this server URL and room code with your friend.':'Using this website’s room server.';});
  if(location.hostname.endsWith('.github.io'))$('onlineStatus').textContent='Solo play is ready. For friend matches, set your multiplayer server URL above.';
  $('hostRoom').onclick=onlineAction(()=>online.create($('biomeSelect').value,Number($('onlineAI').value)));
  $('joinRoom').onclick=onlineAction(()=>online.join($('roomCode').value.trim().toUpperCase()));
  $('startRoom').onclick=onlineAction(()=>online.start());
  $('leaveRoom').onclick=onlineAction(()=>online.leave());
  $('copyRoom').onclick=onlineAction(async()=>{try{await navigator.clipboard.writeText(online.session.code);$('onlineStatus').textContent='Code copied. Send it to your friend.';}catch{$('onlineStatus').textContent='Select and copy the room code shown above.';}});

  // Compact line illustrations used consistently by production cards and selection portraits.
  function icon(type) {
    const common = 'viewBox="0 0 48 38" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
    const paths = {
      hq:'<path d="M6 31V16l18-9 18 9v15H6Z M24 7V2h10l-2 4H24 M6 16l18 8 18-8 M24 24v7 M14 20v6 M33 20v6"/>',
      barracks:'<path d="m5 18 19-9 19 9v13H5V18Z M5 18h38 M11 23h5v8 M22 23h5v8 M33 23h4v5 M17 9l7-4 7 4"/>',
      housing:'<path d="m5 19 10-9 10 9v13H5V19Z m20-4 9-8 9 8v17H25 M10 32V22h8v10 M30 18h8 M30 23h8 M30 28h8"/>',
      depot:'<path d="M6 29V15l17-8 19 8v14H6Z M6 15h36 M12 29V19h24v10 M15 22h18 M15 25h18"/>',
      refinery:'<path d="M6 31V20l10-5v16 M16 24l12-7 14 7v7H16 M32 19V6h7v16 M32 11h7 M6 31h36 M20 25h7 M31 26h6"/>',
      mine:'<path d="m5 31 7-19h25l7 19H5Z M16 31V19h16v12 M18 6l20 8 M20 3l-4 10 M19 25h10"/>',
      power:'<path d="M7 30V17h11v13 M30 30V10h10v20 M7 30h33 M25 3l-8 13h9l-5 12 12-16h-9l1-9Z"/>',
      factory:'<path d="M5 31V17l11-7v11l12-8v8l14-8v18H5Z M8 15V6h6v6 M11 26h5 M23 26h5 M35 26h3"/>',
      armory:'<path d="M7 31V15l17-8 17 8v16H7Z M15 31V19h18v12 M17 15h14 M19 22h10 M21 26h6"/>',
      radar:'<path d="m12 8 23 18M12 8c-10 17 6 31 23 18 M24 18l10-9 M30 31l-6-12-6 12 M10 32h29 M37 6l3-3 M39 12h5"/>',
      airfield:'<path d="m8 34 8-28h17l8 28H8Z M24 8v5 M24 19v5 M24 30v3 M14 18l10-4 10 4 M24 10v9"/>',
      shipyard:'<path d="M5 31h38 M8 28V5h6v23 M12 7h29 M34 7v12 M30 19h8 M18 24h23l-5 5H22l-4-5Z M10 12l10-5"/>',
      lab:'<path d="M18 5h12 M20 5v12L10 31h28L28 17V5 M16 24h16 M23 19h3 M20 28h1 M28 28h1"/>',
      uplink:'<path d="m13 13 9 9 12-12-9-9-12 12Z M12 5 4 13l8 8 8-8 M30 15l8 8 8-8-8-8 M21 24c-2 5 1 9 6 9 M24 25c0 3 1 4 4 4"/>',
      sensor:'<path d="M20 6h8v10h-8V6Z M24 16v16 M6 22h36 M13 12a11 11 0 0 0 0 12 M35 12a11 11 0 0 1 0 12 M16 27l-4 5 M32 27l4 5 M19 31h10"/>',
      turret:'<path d="M12 31h24l-3-12H15l-3 12Z M17 19V12h14v7 M24 12V4h15 M39 2v4 M8 31h32"/>',
      engineer:'<path d="M18 12a6 6 0 0 1 12 0 M16 13h16 M18 13v3a6 6 0 0 0 12 0v-3 M12 34V25l8-4 4 5 4-5 8 4v9 M30 25l7 7 M34 23l4 4"/>',
      rifleman:'<path d="M17 12a7 7 0 0 1 14 0 M15 13h18 M18 13v3a6 6 0 0 0 12 0v-3 M12 34V25l8-4 4 5 4-5 8 4v9 M10 30h24l5-4 M30 27v6"/>',
      medic:'<path d="M17 12a7 7 0 0 1 14 0 M15 13h18 M18 13v3a6 6 0 0 0 12 0v-3 M12 34V25l8-4 4 5 4-5 8 4v9 M24 28v7 M20.5 31.5h7"/>',
      general:'<path d="m15 10 9-5 9 5-3 3H18l-3-3Z M18 13v3a6 6 0 0 0 12 0v-3 M11 34V25l9-4 4 6 4-6 9 4v9 M24 27v7 M14 26h5 M29 26h5"/>',
      spy:'<path d="m14 12 4-8h12l4 8 M10 13h28 M18 13v3a6 6 0 0 0 12 0v-3 M11 34V25l9-4 4 8 4-8 9 4v9 M20 15h2 M26 15h2"/>',
      investigator:'<path d="m13 12 5-8h12l4 8 M10 13h28 M18 13v3a6 6 0 0 0 12 0v-3 M11 34V25l9-4 4 8 3-7 M34 22a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z M38 31l5 5"/>',
      sniper:'<path d="M18 13a6 6 0 0 1 12 0v3a6 6 0 0 1-12 0v-3Z M12 34V25l8-4 4 6 4-6 8 4v9 M5 29h38 M27 25h9 M32 25v4 M21 29l-3 5"/>',
      rocketeer:'<path d="M18 13a6 6 0 0 1 12 0v3a6 6 0 0 1-12 0v-3Z M12 34V25l8-4 4 6 4-6 8 4v9 M8 26l28-9 4 3-30 10-2-4Z"/>',
      flaktank:'<path d="M8 25h30a5 5 0 0 1 0 10H8a5 5 0 0 1 0-10Z M13 25l3-9h16l4 9 M21 16l9-12 M27 17L36 5 M15 16V8h5 M11 30h24"/>',
      tank:'<path d="M8 25h30a5 5 0 0 1 0 10H8a5 5 0 0 1 0-10Z M10 25l5-10h17l6 10 M19 15V9h13v6 M29 10h15 M11 30h24"/>',
      apc:'<path d="M6 28V18l9-6h16l10 9v7H6Z M7 28a4 4 0 1 0 8 0 M19 28a4 4 0 1 0 8 0 M31 28a4 4 0 1 0 8 0 M22 12V7h13 M13 18h9 M28 17h5"/>',
      artillery:'<path d="M8 26h29a4 4 0 0 1 0 8H8a4 4 0 0 1 0-8Z M13 26l4-9h13l7 9 M22 19 38 5l4 3-16 15 M10 30h24"/>',
      harvester:'<path d="M8 25h25v8H8V25Z M11 25V12h10v13 M21 19h12l8 7 M14 15h4v5h-4 M36 20l8 12h-9 M11 29h19"/>',
      fighter:'<path d="M24 3 28 15l16 9v4l-16-4 1 8 6 3H13l6-3 1-8-16 4v-4l16-9 4-12Z"/>',
      bomber:'<path d="M24 4 29 17l15 9v6l-17-5v7h-6v-7L4 32v-6l15-9 5-13Z M12 25v6 M36 25v6"/>',
      patrolboat:'<path d="M4 24h40l-8 10H13L4 24Z M17 24V12h13v12 M23 12V4 M21 6h12 M30 19h10 M10 34h28"/>',
      frigate:'<path d="M3 24h42l-9 10H12L3 24Z M12 24V16h9V9h9v15 M26 9V3 M30 18h10 M9 20h7 M13 29h20"/>',
      wall:'<path d="M5 33V13h38v20M5 23h38M17 13v10M31 13v10M11 23v10M25 23v10M38 23v10"/>',
      gate:'<path d="M6 34V11h7v23M35 34V11h7v23M13 15h22v16H13M19 15v16M29 15v16"/>',
      mechanic:'<path d="m10 36 20-20M27 9a9 9 0 0 0 12 12l-6-6 1-6M8 30l7 7M8 37l-3-3"/>',
      smelter:'<path d="M6 35V19l11 5V14l12 9V7h6v28ZM10 30h24M16 10l3-5M23 13l3-5"/>',
      crystalworks:'<path d="m15 7-5 16 14 17 14-17-5-16ZM15 7l9 33 9-33M10 23h28"/>',
      countermine:'<path d="m24 6 15 6v12L24 39 9 24V12ZM15 23h18M24 15v16"/>',
      seismicrover:'<path d="M7 29h31v7H7ZM12 29V17h22v12M23 17V7M17 10q6-6 12 0M13 7q10-10 20 0"/>',
      interceptor:'<path d="M5 28h34v8H5ZM12 28V16h20v12M24 16V9h19M9 32h25"/>',
      drill:'<path d="M7 25h25a4 4 0 0 1 0 8H7a4 4 0 0 1 0-8Z M9 25V14h17v11 M26 16h8l10 5-10 4h-8 M32 16l-2 9 M36 18l-2 6 M12 17h8v5h-8"/>'
    };
    const path = paths[type] || paths[{heavygate:'gate',minibeacon:'sensor',pioneer:'engineer'}[type]] || paths.rifleman;
    return `<svg ${common}>${path}</svg>`;
  }
  function playTone(type='click') {
    try {
      if (!audioCtx) audioCtx=new (window.AudioContext||window.webkitAudioContext)();
      if (audioCtx.state==='suspended') audioCtx.resume();
      const osc=audioCtx.createOscillator(), gain=audioCtx.createGain();
      osc.type='sine';osc.frequency.setValueAtTime(type==='danger'?180:type==='success'?700:420,audioCtx.currentTime);
      gain.gain.setValueAtTime(.025,audioCtx.currentTime);gain.gain.exponentialRampToValueAtTime(.0001,audioCtx.currentTime+.1);
      osc.connect(gain).connect(audioCtx.destination);osc.start();osc.stop(audioCtx.currentTime+.12);
    }catch{}
  }
  function toast(message,tone='info') {
    if(!message)return;
    const el=document.createElement('div');el.className=`toast ${tone}`;el.textContent=message;$('toastStack').prepend(el);
    while($('toastStack').children.length>3)$('toastStack').lastChild.remove();
    setTimeout(()=>el.remove(),5500);
    playTone(tone);
  }
  function report(result,fallback='Order received.') {
    if(result && result.ok===false){toast(result.message||'That order cannot be completed.','danger');return false;}
    toast(result?.message||fallback,'success');refreshUI(true);return true;
  }
  const ownSelected = () => [...selection].map(id=>game.getEntity(id)).filter(e=>e&&e.hp>0&&e.owner===0&&!e.boardedIn);
  const selectedEntities = () => [...selection].map(id=>game.getEntity(id)).filter(e=>e&&e.hp>0);
  const underCover = e => e.owner!==0&&(e.coverOwner===undefined||e.coverOwner===0)&&e.type==='spy'&&e.disguised&&!e.exposed;
  const commandSelected = () => selectedEntities().filter(e=>!e.boardedIn&&(e.owner===0||underCover(e)));
  const humanIds = () => ownSelected().filter(e=>e.kind==='unit').map(e=>e.id);
  function setSelection(ids){demolitionId=null;selection=new Set(ids);renderer.selection=selection;selectionSignature='';refreshUI();}
  function home() {
    const hq=game.entities.find(e=>e.type==='hq'&&e.owner===0&&e.hp>0);
    renderer.centerOn(hq?.x||9,hq?.y||32);
  }
  function setLayer(layer) {
    renderer.layer=layer;
    document.querySelectorAll('[data-layer]').forEach(b=>b.classList.toggle('active',b.dataset.layer===layer));
    $('minimapLayer').textContent=layer==='surface'?'SFC':'SUB';
    setSelection([]);cancelOrder();
    toast(layer==='underground'?'Subsurface view. Crew a drill and burrow to mine or plant charges. Seismic beacons and Watchman patrols reveal underground threats.':'Surface command restored.');
  }
  function setTab(next) {
    tab=next;$('catalogSearch').value='';$('catalogFilter').value='all';document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
    catalogSignature='';refreshCatalog();
  }
  function showMenu() {
    modalPause=game.paused;game.paused=true;keys.clear();
    $('menuOverlay').hidden=false;$('closeMenu').hidden=!started;$('continueButton').hidden=!started;
    $('startButton').innerHTML=started?'Start a new operation <span>↗</span>':'Deploy task force <span>↗</span>';
    $('menuMessage').textContent=started?'Starting a new operation replaces the current battlefield. A save is kept separately.':'';
    try{$('loadButton').hidden=!localStorage.getItem(SAVE_KEY)}catch{$('loadButton').hidden=true}
    $('pauseOverlay').hidden=true;
  }
  function closeMenu(){if(!started)return;$('menuOverlay').hidden=true;game.paused=modalPause;syncPause();canvas.focus();}
  function startOperation(options={}) {
    if(online.active&&!options.online){toast('Leave the current online room before starting a solo operation.','danger');return;}
    if(!options.online)onlineGame=false;
    const biome=options.biome||$('biomeSelect').value, difficulty=options.difficulty||$('difficultySelect').value;
    const seed=options.seed??Math.floor(Math.random()*9999999);
    game=new RTSGame({mapSize:options.mapSize,seed,difficulty,biome,opponents:options.opponents||Number($('opponentsSelect').value)});
    renderer.setGame(game);renderer.layer='surface';renderer.selection=new Set();
    selection=renderer.selection;groups={};speed=1;started=true;resultShown=false;saveTimer=0;
    game.paused=false;modalPause=false;cancelOrder();lastDangerEvent=null;lastSeenEvent=null;
    document.querySelectorAll('[data-layer]').forEach(b=>b.classList.toggle('active',b.dataset.layer==='surface'));
    $('minimapLayer').textContent='SFC';$('menuOverlay').hidden=true;$('resultOverlay').hidden=true;$('helpOverlay').hidden=true;
    $('operationName').textContent=biomeNames[biome]||biomeNames.temperate;$('biomeLabel').textContent=`${biome.toUpperCase()} THEATER`;
    $('speedButton').textContent='1×';$('tutorial').hidden=!!preferences.hideTutorial;
    home();setTab('build');syncPause();refreshUI(true);canvas.focus();playTone('success');
    toast('Welcome, Commander. Your engineers are ready. Build a factory, recruit a force, and protect your headquarters.');
  }
  function saveGame(silent=false) {
    if(!started||onlineGame)return false;
    try {
      const data=game.serialize();
      localStorage.setItem(SAVE_KEY,JSON.stringify({version:1,game:data,camera:renderer.camera,layer:renderer.layer,speed,biome:$('biomeSelect').value,savedAt:Date.now()}));
      if(!silent)toast('Operation saved on this device.','success');
      return true;
    }catch(err){if(!silent)toast('This browser could not save the operation. '+err.message,'danger');return false;}
  }
  function loadGame() {
    if(online.active){toast('Leave the online room before loading a solo save.','danger');return;}
    try {
      const raw=JSON.parse(localStorage.getItem(SAVE_KEY)||'null');if(!raw||raw.version!==1)throw Error('No compatible save found.');
      const restored=RTSGame.deserialize(raw.game);
      game=restored;renderer.setGame(game);selection=new Set();renderer.selection=selection;
      renderer.layer=raw.layer==='underground'?'underground':'surface';
      if(raw.camera&&['x','y','zoom'].every(k=>Number.isFinite(raw.camera[k]))){renderer.camera.x=Math.max(-10000,Math.min(10000,raw.camera.x));renderer.camera.y=Math.max(-10000,Math.min(10000,raw.camera.y));renderer.camera.zoom=Math.max(.2,Math.min(2.1,raw.camera.zoom));}
      speed=[1,1.5,2].includes(raw.speed)?raw.speed:1;started=true;resultShown=false;game.paused=false;cancelOrder();
      $('menuOverlay').hidden=true;$('helpOverlay').hidden=true;$('resultOverlay').hidden=true;
      const biome=game.biome||raw.biome||'temperate';$('biomeSelect').value=biome;$('operationName').textContent=biomeNames[biome]||biomeNames.temperate;$('biomeLabel').textContent=`${biome.toUpperCase()} THEATER`;
      $('speedButton').textContent=speed+'×';$('minimapLayer').textContent=renderer.layer==='surface'?'SFC':'SUB';
      document.querySelectorAll('[data-layer]').forEach(b=>b.classList.toggle('active',b.dataset.layer===renderer.layer));
      $('tutorial').hidden=!!preferences.hideTutorial;syncPause();refreshUI(true);toast('Saved operation restored.','success');canvas.focus();
    }catch(err){$('menuMessage').textContent='Unable to restore this save: '+err.message;toast('Save could not be loaded.','danger');}
  }
  function syncPause(){
    if(onlineGame){['pauseButton','speedButton','saveButton'].forEach(id=>$(id).disabled=true);$('pauseOverlay').hidden=true;$('status').textContent=game.winner!==null?'MATCH COMPLETE':game.teams[0].eliminated?'FACTION ELIMINATED':!online.connected?'RECONNECTING':'ONLINE · '+online.session.code;return;}
    $('pauseButton').textContent=game.paused?'▶':'Ⅱ';$('pauseButton').setAttribute('aria-label',game.paused?'Resume game':'Pause game');
    const modalOpen=!$('menuOverlay').hidden||!$('helpOverlay').hidden||!$('resultOverlay').hidden;
    $('pauseOverlay').hidden=!started||!game.paused||modalOpen||game.winner!==null;
    $('status').textContent=game.winner!==null?'OPERATION COMPLETE':!started?'AWAITING ORDERS':game.paused?'TACTICAL PAUSE':'OPERATION LIVE';
  }
  function togglePause(){if(onlineGame){toast('Online matches cannot be paused by one player.');return;}if(!started||game.winner!==null)return;game.paused=!game.paused;keys.clear();syncPause();}
  function cancelOrder(){placement=null;orderMode=null;renderer.placement=null;renderer.wallPreview=null;renderer.areaPreview=null;renderer.dragRect=null;$('placementNotice').hidden=true;canvas.style.cursor='default';catalogSignature='';}
  function setOrder(mode) {
    if(!commandSelected().length){toast('Select a friendly squad or crewed machine first.','danger');return;}
    cancelOrder();orderMode=mode;canvas.style.cursor='crosshair';
    $('placementNotice').textContent=mode==='attack'?'ATTACK-MOVE · Click a destination or enemy · Esc cancels':'MOVE · Click a destination · Esc cancels';
    $('placementNotice').className='placement-notice';$('placementNotice').hidden=false;
  }
  function beginBuild(type) {
    if(renderer.layer!=='surface')setLayer('surface');
    const def=D.buildings[type], missing=game.requirements(def,0);
    if(missing.length){toast('Requires '+missing.join(', ')+'.','danger');return;}
    const quote=game.quote(def.cost,0);if(!quote.affordable){toast('Insufficient credits, including material imports.','danger');return;}
    cancelOrder();placement=type;canvas.style.cursor='crosshair';
    $('placementNotice').textContent=`PLACE ${def.name.toUpperCase()} · Click terrain near your base · Esc cancels`;
    $('placementNotice').className='placement-notice';$('placementNotice').hidden=false;
    const world=renderer.screenToWorld(pointerXY.x,pointerXY.y);updatePlacement(world);refreshCatalog();
  }
  function updatePlacement(world) {
    if(!placement)return;
    if(placement==='wall'){const plan=game.planWalls(pointer?.world||world,world);renderer.placement=null;renderer.wallPreview=plan;$('placementNotice').className='placement-notice'+(plan.ok?'':' error');$('placementNotice').textContent='DRAG WALL LINE · '+plan.message+' · release to build · Esc cancels';return;}
    const x=Math.floor(world.x)+.5,y=Math.floor(world.y)+.5;
    const check=game.canPlace(placement,x,y,0);
    renderer.placement={type:placement,x,y,valid:check.ok,gateAxis};
    $('placementNotice').className='placement-notice'+(check.ok?'':' error');
    $('placementNotice').textContent=check.ok?`PLACE ${D.buildings[placement].name.toUpperCase()} · ${placement==='heavygate'?'R rotates · ':placement==='minibeacon'?'Scout any land · ':''}Click to confirm · Esc cancels`:check.message||'Choose a clear position near your base.';
  }
  function train(type) {
    const b=ownSelected().find(e=>e.kind==='building');
    // Let the engine choose a valid producer rather than sending a mismatched selection.
    const producer=D.units[type]?.producer;
    const id=b&&producer&&(b.type===producer||(Array.isArray(producer)&&producer.includes(b.type)))?b.id:undefined;
    report(game.train(type,id));
  }
  function produce(type){const b=ownSelected().find(e=>e.kind==='building'&&e.type===D.machines[type]?.producer);const result=game.produce(type,b?.id);if(report(result)&&result.entity)setSelection([result.entity.id]);}
  function upgradeSelection(){
    const selected=ownSelected();if(!selected.length){if(commandSelected().length)toast('Order acknowledged.');return;}
    if(selected.length===1){report(game.upgrade(selected[0].id));return;}
    report(game.upgradeGroup(selected.map(e=>e.id)));
  }
  function doAbility(name){
    if(name==='scan'){beginScan();return;}
    const ids=[...selection];
    if(name==='stop'){report(game.ability(ids,'stop'));cancelOrder();return;}
    report(game.ability(ids,name));
    if(name==='burrow'||name==='patrol'){
      const selected=selectedEntities().find(e=>game.getDef(e).domain==='underground');
      if(selected){renderer.layer=selected.layer;document.querySelectorAll('[data-layer]').forEach(b=>b.classList.toggle('active',b.dataset.layer===renderer.layer));$('minimapLayer').textContent=renderer.layer==='surface'?'SFC':'SUB';}
    }
  }
  function beginScan(){
    const station=game.entities.find(e=>e.owner===0&&e.type==='uplink'&&e.hp>0&&e.progress>=1);
    const scout=ownSelected().find(e=>e.type==='scout')||game.entities.find(e=>e.owner===0&&e.type==='scout'&&e.hp>0&&!e.boardedIn);
    const source=station||scout;
    if(!source){toast('Recruit a pathfinder or build a satellite uplink first.','danger');return;}
    if((source.scanReady||0)>game.time){toast(`Scan cooling down: ${Math.ceil(source.scanReady-game.time)} seconds.`,'danger');return;}
    if(renderer.layer!=='surface')setLayer('surface');
    cancelOrder();scanSourceIds=station?[]:[scout.id];orderMode='scan';canvas.style.cursor='crosshair';
    $('placementNotice').className='placement-notice';$('placementNotice').textContent=station?'SATELLITE SWEEP · Click battlefield or minimap · 55 credits · Esc cancels':'RECON SWEEP · Click within 15 tiles of your pathfinder · Esc cancels';$('placementNotice').hidden=false;
  }
  function scanAt(world){if(report(game.ability(scanSourceIds,'scan',world)))cancelOrder();}

  const resourceName=k=>({money:'Credits',metal:'Alloy',fuel:'Fuel',crystal:'Crystal'}[k]||k);
  function productionLabel(type,def){const output=def.output|| (def.income?{money:def.income}:type==='refinery'?{fuel:1.4}:null);return output?'<span class="output-badge">'+Object.entries(output).map(([k,n])=>resourceName(k).toUpperCase()+' +'+n+'/s').join(' · ')+'</span>':type==='mine'?'<span class="output-badge">EXTRACTS NEARBY DEPOSIT</span>':'';}
  function resourceGuide(){
    if($('helpOverlay').hidden)modalPause=game.paused;game.paused=true;keys.clear();$('helpOverlay').hidden=false;document.querySelectorAll('[data-manual]').forEach(b=>b.classList.remove('active'));$('manualTitle').textContent='Resource production';
    const rates={money:0,metal:0,fuel:0,crystal:0};for(const b of game._buildings(0))for(const [k,n] of Object.entries(game.productionOutput(b)))rates[k]+=n;
    $('manualContent').innerHTML='<h3>Build a self-sufficient base.</h3><p>These buildings produce continuously. Tier II gives 1.5× output; tier III gives 2×. Income below excludes gathering, imports, espionage and capture rewards.</p><table><thead><tr><th>Resource</th><th>Producer · tier I</th><th>Unlock</th><th>Your income</th></tr></thead><tbody>'+[['money','HQ +6/s · Logistics depot +3/s · Power plant +4/s','HQ / Depot for power'],['metal','Alloy works +2/s','Logistics depot'],['fuel','Fuel refinery +1.4/s','Logistics depot'],['crystal','Crystal processor +0.8/s','Subsurface laboratory']].map(([k,producer,unlock])=>`<tr><td>${resourceName(k)}</td><td>${producer}</td><td>${unlock}</td><td>+${statNumber(rates[k])}/s</td></tr>`).join('')+'</tbody></table><h4>Extraction and imports</h4><p>Deep extraction mines require a factory and a deposit within 5 tiles. They extract alloy or fuel at 2.6/s, crystal at 0.75/s (1.5/s with a laboratory). Selection shows the current deposit and output. Depleted deposits stop producing. People, harvesters and drills can gather deposits too; mechanics cannot.</p><p>If a purchase lacks materials, credits automatically import alloy at 4 credits, fuel at 6 and crystal at 12 per unit. The displayed purchase price includes imports.</p><h4>Capture reward</h4><p>Destroying a rival HQ eliminates that faction and pays the attacker 1,000 credits, 250 alloy, 120 fuel and 60 crystal, once per base. Win by capturing all rival HQs.</p>';syncPause();
  }
  const categories={economy:['depot','smelter','refinery','crystalworks','mine','power','harvester'],defense:['wall','gate','heavygate','turret','countermine'],support:['barracks','housing','engineer','mechanic','pioneer','medic','pilot'],production:['factory','armory','airfield','shipyard','lab'],recon:['minibeacon','radar','uplink','sensor','scout','spy','investigator'],underground:['drill','seismicrover','interceptor'],navy:['patrolboat','frigate'],air:['fighter','bomber']};
  const categoryNames={economy:'Economy & resources',defense:'Walls & defense',support:'Personnel & support',production:'Production & technology',recon:'Recon & intelligence',infantry:'Combat infantry',underground:'Underground machines',navy:'Naval fleet',air:'Aircraft',armor:'Ground armor'};
  const categoryOf=(type,kind)=>Object.keys(categories).find(k=>categories[k].includes(type))||(kind==='recruit'?'infantry':'armor');
  function refreshCatalog() {
    if(!D)return;
    let items=[],heading='';
    if(tab==='build'){items=Object.entries(D.buildings).filter(([k])=>k!=='hq').map(([type,def])=>({type,def,kind:'build'}));heading='BASE INFRASTRUCTURE';}
    if(tab==='recruit'){items=Object.entries(D.units).map(([type,def])=>({type,def,kind:'recruit'}));heading='PERSONNEL RECRUITMENT';}
    if(tab==='machines'){items=Object.entries(D.machines).map(([type,def])=>({type,def,kind:'machines'}));heading='MECHANIZED OPERATIONS';}
    if(tab==='intel'){
      items=['scout','spy','investigator'].filter(k=>D.units[k]).map(type=>({type,def:D.units[type],kind:'recruit'}));
      items.push(...['minibeacon','radar','sensor','countermine','uplink','lab'].filter(k=>D.buildings[k]).map(type=>({type,def:D.buildings[type],kind:'build'})));heading='INTELLIGENCE NETWORK';
    }
    const query=$('catalogSearch').value.trim().toLowerCase(),filter=$('catalogFilter').value;
    if(query||filter!=='all'){items=[...Object.entries(D.buildings).filter(([k])=>k!=='hq').map(([type,def])=>({type,def,kind:'build'})),...Object.entries(D.units).map(([type,def])=>({type,def,kind:'recruit'})),...Object.entries(D.machines).map(([type,def])=>({type,def,kind:'machines'}))].filter(({type,def,kind})=>(filter==='all'||categoryOf(type,kind)===filter)&&(!query||(def.name+' '+def.description+' '+categoryNames[categoryOf(type,kind)]).toLowerCase().includes(query)));heading='CATALOG SEARCH';}
    items.sort((a,b)=>Object.keys(categoryNames).indexOf(categoryOf(a.type,a.kind))-Object.keys(categoryNames).indexOf(categoryOf(b.type,b.kind)));
    let previousGroup='';const cards=items.map(({type,def,kind})=>{const group=categoryOf(type,kind),header=group!==previousGroup?'<div class="catalog-group">'+categoryNames[group]+'</div>':'';previousGroup=group;
      const unmet=game.requirements(def,0),q=game.quote(def.cost,0);
      const tag=kind==='machines'?`${def.crew||1} CREW`:kind==='recruit'?'PERSONNEL':def.housing?`+${def.housing} BEDS`:def.buildTime?`${def.buildTime}s`:'';
      const costText=Object.entries(def.cost||{}).filter(([,v])=>v).map(([k,v])=>`${format(v)} ${k==='metal'?'alloy':k==='money'?'credits':k}`).join(' · ');
      const tooltip=[def.name,def.description,costText,unmet.length?'Requires: '+unmet.join(', '):'',q.imports?`Including ${format(q.imports)} credits for missing materials.`:'',kind==='machines'?`Requires ${def.crew||1} personnel aboard. Select completed machine and press Crew.`:''].filter(Boolean).join('\n');
      return header+`<button class="catalog-card ${unmet.length?'locked':''} ${placement===type?'active':''}" data-catalog="${kind}" data-type="${type}" title="${esc(tooltip)}" aria-label="${esc(def.name)}"><span class="card-icon">${icon(type)}</span><span class="card-tag ${unmet.length?'lock':''}">${unmet.length?'LOCKED':tag}</span><strong>${esc(def.name)}</strong>${productionLabel(type,def)}<span class="card-role">${esc(def.description.split('. ')[0])}</span><span class="card-price ${q.affordable?'':'danger-text'}">◈ ${format(Math.ceil(q.money))}${q.imports?'<small class="import-premium">incl. import</small>':''}</span>${unmet.length?`<span class="card-lock">${esc(unmet.join(' + '))}</span>`:''}</button>`;
    }).join('');
    const intel=tab==='intel'?`<div class="intel-overview"><span class="eyebrow">KNOW THE BATTLEFIELD</span><strong>Information is a weapon.</strong>Scouts reveal terrain. Undercover operatives infiltrate the enemy. Investigators expose disguised spies. Seismic beacons and crewed Watchman patrols reveal underground threats.<button data-action="scan">◎ Satellite / recon sweep</button></div>`:'';
    const html=(tab==='build'?'<button class="resource-guide-card" data-action="resourceGuide">◈ Resource production guide <span>See buildings, unlocks and live income ↗</span></button>':'')+intel+(cards||'<p class="catalog-empty">No matches. Try a role such as repair, fuel, walls or recon.</p>');
    if(html!==catalogSignature){const scroll=$('catalog').scrollTop;$('catalog').innerHTML=html;$('catalog').scrollTop=scroll;catalogSignature=html;}
    $('catalogTitle').textContent=heading;$('catalogCount').textContent=`${items.length} AVAILABLE TYPES`;
  }
  function perceived(e){return renderer.perceivedEntity?renderer.perceivedEntity(e):underCover(e)?{...e,type:'rifleman',owner:0,hp:D.units.rifleman.hp*(e.hp/e.maxHp),maxHp:D.units.rifleman.hp,task:{type:'idle'},disguised:false}:e;}
  function upgradePreview(e){
    const p=D.upgradeProfile(e,game.getEntity(e.garrisonedIn));if(!p)return '';
    const summary=p.rows.slice(0,3).map(r=>`<div><span>${esc(r.label)}</span><b>${statNumber(r.current)}${p.from<3?` <i>→</i> ${statNumber(r.next)}`:''} <small>${esc(r.unit)}</small></b></div>`).join('');
    return `<div class="upgrade-preview"><div class="upgrade-heading">${p.from<3?`NEXT UPGRADE · TIER ${p.from} → ${p.to} <span>◈ ${p.cost}</span>`:'TIER III · MAXIMUM LEVEL'}</div>${summary}<button data-action="upgradeDetails">${p.from<3?'See all upgrade benefits':'View current tier stats'} <span>↗</span></button></div>`;
  }
  function showUpgradeDetails(){
    const selected=selectedEntities().map(perceived),e=selected[0];if(!e)return;
    const def=game.getDef(e),p=D.upgradeProfile(e,game.getEntity(e.garrisonedIn));if(!p)return;
    if($('helpOverlay').hidden)modalPause=game.paused;
    game.paused=true;keys.clear();$('helpOverlay').hidden=false;
    document.querySelectorAll('[data-manual]').forEach(b=>b.classList.remove('active'));
    $('manualTitle').textContent=def.name+' · upgrades';
    $('manualContent').innerHTML=`<h3>${p.from<3?`Tier ${p.from} → Tier ${p.to}`:'Tier III · maximum level'}</h3><p class="upgrade-cost">${p.from<3?`◈ ${p.cost} credits · no materials required. Review these changes, then return to command and choose Upgrade.`:'This force has reached its maximum tier. Current values are shown below.'}</p><table data-upgrade-table><thead><tr><th>Benefit</th><th>Current</th>${p.from<3?'<th>After upgrade</th>':''}</tr></thead><tbody>${p.rows.map(r=>`<tr><td>${esc(r.label)}</td><td>${statNumber(r.current)}${r.unit.startsWith('%')?'':' '}${esc(r.unit)}</td>${p.from<3?`<td class="friendly-text">${statNumber(r.next)}${r.unit.startsWith('%')?'':' '}${esc(r.unit)}</td>`:''}</tr>`).join('')}</tbody></table><h4>How these numbers work</h4>${p.notes.map(note=>`<p>${esc(note)}</p>`).join('')}`;
    $('manualContent').scrollTop=0;syncPause();
  }
  function refreshSelection() {
    for(const id of selection){const e=game.getEntity(id);if(!e||e.hp<=0||e.boardedIn||!game.isVisible(e))selection.delete(id);}
    const actual=selectedEntities(),selected=actual.map(perceived);
    let html='',actions='';
    const btn=(act,label,key='',extra='')=>`<button data-action="${act}" ${extra}>${label}${key?` <kbd>${key}</kbd>`:''}</button>`;
    if(!selected.length){
      html='<div class="selection-empty"><div class="selection-symbol">⌖</div><div><span class="eyebrow">YOUR ORDERS, COMMANDER</span><h3>Build your next advantage.</h3><p>Select a unit or building to command it.<br>Drag a box to gather a squad.</p></div></div>';
      actions=btn('selectArmy','Select combat force')+btn('selectEngineers','Select engineers')+btn('home','Headquarters','H');
    }else if(selected.length===1){
      const e=selected[0],real=actual[0],def=game.getDef(e)||{},friendly=e.owner===0;
      const hp=Math.max(0,Math.ceil(e.hp)),pct=Math.round(e.hp/e.maxHp*100);
      let status=e.kind==='building'?(e.progress<1?'UNDER CONSTRUCTION':'OPERATIONAL'):e.kind==='machine'?`${(e.crew||[]).length} / ${def.crew||1} CREW`:e.autoReason==='defend'?'DEFENDING BASE':e.autoTargetId?'ENGAGING CONTACT':e.task?.type?.toUpperCase()||'READY';
      const construction=e.progress<1?` · ${Math.floor(e.progress*100)}%`:'';
      const isUndercover=e.type==='spy'&&e.disguised&&!e.exposed;
      html=`<div class="selected-header"><div class="portrait">${icon(e.type)}</div><div class="selected-title"><span class="eyebrow">${friendly?'ATLAS COMMAND':game.factionName(e.owner)+' / HOSTILE'} / ${e.kind.toUpperCase()}</span><h3>${esc(def.name||e.type)}</h3><p><span class="mini-health"><i style="width:${pct}%"></i></span>${hp} / ${Math.ceil(e.maxHp)} HP</p></div><span class="level-tag">TIER ${e.level||1}</span></div><div class="selection-meta"><span>${status}${construction}</span>${def.damage?`<span>ATK ${statNumber(def.damage*(1+((e.level||1)-1)*.25))}</span>`:''}${def.range?`<span>RNG ${statNumber(def.range+((e.level||1)-1)*.25)}</span>`:''}${isUndercover?'<span class="friendly-text">DISGUISED</span>':''}</div><p class="selected-description">${esc(def.description||'')}</p>`;
      if(friendly&&e.kind==='building'){const output=game.productionOutput(real),text=Object.entries(output).map(([k,n])=>resourceName(k)+' +'+statNumber(n)+'/s').join(' · ');if(text||e.type==='mine')html+=`<div class="production-status">${text||'NO OUTPUT · no deposit in range / construction incomplete'}</div>`;}
      if(e.type==='wall'&&e.perch)html+=`<div class="production-status">PERCH · ${e.garrisonId?esc(game.getDef(game.getEntity(e.garrisonId)).name):'EMPTY'} · +2 range / +3 vision / 25% armor</div>`;
      if(e.type==='seismicrover')html+=`<div class="production-status">${e.patrolling?'HQ PATROL ACTIVE':'PATROL AVAILABLE'} · ${10+(e.level-1)*4}-tile HQ radius · requires crew</div>`;
      if(def.domain==='air')html+=`<div class="selection-meta"><span>FUEL ${Math.ceil(e.fuel??100)}%</span><span>${e.landed?'ON RUNWAY':e.returning?'RETURNING TO RUNWAY':'AIRBORNE'}</span></div>`;
      if(friendly&&e.type==='barracks')html+=`<div class="production-status">AUTO STAFFING ${e.autoStaff?'ON · '+esc(e.staffStatus||'Monitoring demand'):'OFF'}<br>Trains engineers for construction / assembly, then crew for unstaffed machines. Normal prices and housing apply.</div>`;
      if(e.type==='tank')html+=`<div class="production-status">ROOF GUNNER ${e.garrisonId?'ABOARD · rapid anti-infantry fire':'EMPTY · one additional combat soldier'}<br>Separate from the two internal crew. Cannon favors armor and buildings.</div>`;
      if(e.queue?.length){const q=e.queue[0],qdef=(D.units[q.type]||D.machines[q.type]||{});html+=`<div class="queue-strip ${e.needsWorkers?'danger-text':''}">${e.needsWorkers?'ASSEMBLY PAUSED · Assign nearby workers':'QUEUE '+e.queue.length+' · '+esc(qdef.name||q.type)+' '+Math.floor((q.progress||0)*100)+'%'}<div class="queue-progress"><i style="width:${Math.min(100,(q.progress||0)*100)}%"></i></div></div>`;}
      if(friendly){
        if(e.progress>=1)html+=upgradePreview(e);
        if(e.kind==='building'){
          if(e.type==='barracks'&&e.progress>=1)actions+=btn('autostaff',e.autoStaff?'Auto staffing: ON':'Auto staffing: OFF');
          if(e.type!=='hq')actions+=btn('demolish',demolitionId===e.id?'Confirm demolition · no refund':'Demolish · no refund');
          if(e.progress<1){actions+=btn('assignWorkers','Assign engineers');}
          else{if(['hq','barracks','armory'].includes(e.type))actions+=btn('recruitTab','Recruit');if(['factory','airfield','shipyard'].includes(e.type))actions+=btn('machinesTab','Build machines')+btn('assignAssembly','Assign assembly crew');if(e.type==='uplink'||e.type==='radar')actions+=btn('scan','Recon sweep');}
        }else{actions+=(['mechanic','pioneer'].includes(e.type)?btn('move','Move','M'):btn('attack','Attack-move','A'))+btn('stop','Stop','S');}
        if(e.type==='wall'&&e.progress>=1)actions+=e.perch?(e.garrisonId?btn('leavePerch','Unload perch'):btn('garrison','Station nearby troop')):btn('perch','Add troop perch · ◈120');
        if(e.kind!=='building')actions+=btn('roam','Roam freely');
        if(e.type==='tank')actions+=e.garrisonId?btn('leavePerch','Unload roof gunner'):btn('mount','Add roof gunner');
        if(e.type==='pioneer')actions+=btn('clear','Clear area');
        if(e.kind==='machine'){
          if((e.crew||[]).length<(def.crew||1))actions+=btn('crew',`Crew (${(e.crew||[]).length}/${def.crew||1})`);
          else actions+=btn('uncrew','Disembark');
          if(def.domain==='air'&&!e.landed)actions+=btn('land','Return to runway');
          if(def.domain==='underground'){actions+=btn('burrow',e.layer==='underground'?'Surface':'Burrow');if(e.type==='seismicrover')actions+=btn('patrol','HQ patrol · '+(10+(e.level-1)*4)+' tiles');if(e.layer==='underground'&&['drill','interceptor'].includes(e.type))actions+=btn('minecharge','Lay proximity mine');if(e.layer==='underground'&&e.type==='drill')actions+=btn('bomb','Plant timed charge','','class="gold"');}
        }
        if(e.type==='general')actions+=btn('rally','Rally');
        if(e.type==='investigator')actions+=btn('investigate','Investigate');
        if(e.type==='scout')actions+=btn('scan','Recon sweep');
        if(e.type==='spy')actions+=btn('infiltrate','Infiltrate');
        if((e.level||1)<3&&e.progress>=1)actions+=btn('upgrade',`Upgrade ◈${D.upgradeProfile(e).cost}`,'U','class="gold" title="Apply the stat changes shown above. See all upgrade benefits for the full breakdown."');
      }
    }else{
      const counts={};for(const e of selected){const name=game.getDef(e)?.name||e.type;counts[name]=(counts[name]||0)+1;}
      const hp=selected.reduce((s,e)=>s+Math.max(0,e.hp),0),maxHp=selected.reduce((s,e)=>s+e.maxHp,0);
      html=`<div class="selected-header"><div class="portrait">${icon('general')}</div><div class="selected-title"><span class="eyebrow">ATLAS / TASK FORCE</span><h3>${selected.length} ${selected.every(e=>e.kind==='building')?'structures':'units'} selected</h3><p>${Math.round(hp/maxHp*100)}% COMBINED STRENGTH</p></div></div><div class="unit-chips">${Object.entries(counts).map(([k,v])=>`<span class="unit-chip">${v} ${esc(k)}</span>`).join('')}</div>`;
      const walls=selected.every(e=>['wall','gate','heavygate'].includes(e.type)),mobile=selected.some(e=>e.kind!=='building'),quote=game.upgradeQuote(selected.map(e=>e.id));
      html+=walls?'<div class="production-status">FORTIFICATION GROUP · '+quote.count+' eligible segments<br>Upgrade total: ◈ '+quote.money+' credits. Each gains health and armor; maximum-tier and unfinished segments are skipped.</div>':mobile?'<div class="production-status">AUTOMATIC FORMATION · durable units lead; fragile ranged units and support follow. Issue Move or Attack-move to form up.</div>':'';
      actions=(mobile?btn('attack','Attack-move','A')+btn('move','Move','M')+btn('stop','Stop','S')+btn('roam','Roam freely'):'')+btn('upgrade',(walls?'Upgrade wall group':'Upgrade selection')+' · ◈'+quote.money,'U','class="gold" '+(!quote.count?'disabled':'')+' title="One tier per eligible selection. The complete price is required; no partial purchases."');
      if(selected.some(e=>e.type==='general'))actions+=btn('rally','Rally');
      if(selected.some(e=>e.type==='pioneer'))actions+=btn('clear','Clear area');
      if(selected.some(e=>e.type==='investigator'))actions+=btn('investigate','Investigate');
    }
    const sig=html+actions;
    if(sig!==selectionSignature){$('selectionContent').innerHTML=html;$('selectionActions').innerHTML=actions;selectionSignature=sig;}
  }
  function refreshUI(force=false) {
    if(force){catalogSignature='';selectionSignature='';}
    const team=game.teams[0],pop=game.population(0);
    for(const key of ['money','metal','fuel','crystal'])$(key).textContent=format(team[key]);
    $('population').textContent=`${pop.used} / ${pop.cap}`;$('population').classList.toggle('danger-text',pop.used>=pop.cap);
    $('clock').textContent=clock(game.time);
    const factionColors=['#73ead1','#ff8262','#83bbff','#f5cf72'];$('factionRoster').innerHTML=game.teams.map((t,i)=>`<span style="--faction:${factionColors[i]}" class="${t.eliminated?'eliminated':''}">${game.factionName(i)} ${t.eliminated?'×':i===0?'YOU':'●'}</span>`).join('');
    const income={money:0,metal:0,fuel:0,crystal:0};for(const b of game._buildings(0))for(const [k,n] of Object.entries(game.productionOutput(b)))income[k]+=n;for(const [k,n] of Object.entries(income))$(k).parentElement.parentElement.title=resourceName(k)+' · automatic building income +'+statNumber(n)+'/sec. See Resource guide for producers and unlocks.';
    const preparation=game.preparationRemaining?.()||0;
    $('preparationTimer').hidden=preparation<=0||game.winner!==null;
    $('preparationTimer').textContent=`PREP WINDOW ${clock(Math.ceil(preparation))} · before enemy raids`;
    const hq=game.entities.find(e=>e.owner===0&&e.type==='hq');const hp=hq?Math.max(0,hq.hp/hq.maxHp):0;
    $('hqBar').style.width=`${hp*100}%`;$('hqPercent').textContent=`${Math.ceil(hp*100)}%`;$('hqBar').style.background=hp<.35?'var(--red)':'var(--accent)';
    refreshCatalog();refreshSelection();
    const events=(game.events||[]).slice(0,3);
    $('eventLog').innerHTML=events.map(e=>`<div class="event ${e.tone||''}"><time>${clock(e.time||0)}</time><span>${esc(e.text)}</span></div>`).join('')||'<div class="event"><time>00:00</time><span>All stations ready. Awaiting your command.</span></div>';
    if(started&&events[0]&&events[0].id!==lastSeenEvent){lastSeenEvent=events[0].id;if(events[0].tone==='danger'&&events[0].id!==lastDangerEvent){lastDangerEvent=events[0].id;toast(events[0].text,'danger');}}
    const own=game.entities.filter(e=>e.owner===0&&e.hp>0);
    document.querySelector('[data-tip="build"]').classList.toggle('done',own.some(e=>e.type==='factory'&&e.progress>=1));
    document.querySelector('[data-tip="recruit"]').classList.toggle('done',own.filter(e=>e.kind==='unit').length>=12);
    document.querySelector('[data-tip="machines"]').classList.toggle('done',own.some(e=>e.kind==='machine'&&!['seismicrover','harvester'].includes(e.type)&&e.crew?.length>0));
    document.querySelector('[data-tip="attack"]').classList.toggle('done',game.entities.some(e=>e.owner!==0&&e.type==='hq'&&game.isVisible(e)));
  }

  function handleAction(action) {
    const selected=ownSelected();
    switch(action){
      case 'home':home();break;
      case 'selectArmy':setSelection(game.entities.filter(e=>(e.owner===0||underCover(e))&&e.hp>0&&!e.boardedIn&&e.layer===renderer.layer&&(e.kind==='unit'&&!['engineer','pioneer','mechanic','spy','investigator','pilot'].includes(perceived(e).type)||e.kind==='machine'&&!['seismicrover','harvester'].includes(e.type)&&e.crew?.length>0)).map(e=>e.id));break;
      case 'selectEngineers':{const engineers=game.entities.filter(e=>e.owner===0&&e.type==='engineer'&&e.hp>0&&!e.boardedIn);setSelection(engineers.map(e=>e.id));if(engineers[0])renderer.centerOn(engineers[0].x,engineers[0].y);break;}
      case 'recruitTab':setTab('recruit');break;
      case 'machinesTab':setTab('machines');break;
      case 'attack':setOrder('attack');break;
      case 'move':setOrder('move');break;
      case 'upgrade':upgradeSelection();break;
      case 'upgradeDetails':showUpgradeDetails();break;
      case 'resourceGuide':resourceGuide();break;
      case 'clear':cancelOrder();orderMode='clear';canvas.style.cursor='crosshair';$('placementNotice').textContent='CLEAR AREA · Drag over explored terrain · up to 20 × 20 tiles · Esc cancels';$('placementNotice').hidden=false;break;
      case 'roam':case 'mount':case 'autostaff':case 'perch':case 'garrison':case 'leavePerch':case 'patrol':case 'minecharge':case 'stop':case 'rally':case 'scan':case 'investigate':case 'burrow':case 'bomb':case 'land':doAbility(action);break;
      case 'demolish':{const b=selected[0];if(b){if(demolitionId!==b.id){demolitionId=b.id;selectionSignature='';refreshSelection();return;}demolitionId=null;report(game.demolish(b.id));}break;}
      case 'crew':if(selected[0])report(game.crew(selected[0].id,humanIds()));break;
      case 'uncrew':if(selected[0])report(game.uncrew(selected[0].id));break;
      case 'assignWorkers':{const target=selected.find(e=>e.kind==='building');if(target){const engineers=game.entities.filter(e=>e.owner===0&&e.type==='engineer'&&!e.boardedIn&&e.hp>0);report(game.command(engineers.map(e=>e.id),target.x,target.y,{mode:'build',targetId:target.id}));}break;}
      case 'assignAssembly':{const target=selected.find(e=>e.kind==='building');if(target){const pool=game.entities.filter(e=>e.owner===0&&e.kind==='unit'&&e.hp>0&&!e.boardedIn&&e.layer==='surface'&&(e.task.type==='idle'||e.task.type==='gather'||e.task.type==='build'&&e.task.targetId===target.id));pool.sort((a,b)=>(a.type==='engineer'?-100:0)+Math.hypot(a.x-target.x,a.y-target.y)-(b.type==='engineer'?-100:0)-Math.hypot(b.x-target.x,b.y-target.y));if(!pool.length)toast('No available workers. Move a squad to this structure and right-click it to assign them.','danger');else report(game.command(pool.slice(0,3).map(e=>e.id),target.x,target.y,{mode:'build',targetId:target.id}));}break;}
      case 'infiltrate':cancelOrder();orderMode='infiltrate';canvas.style.cursor='crosshair';$('placementNotice').textContent='INFILTRATE · Click a visible enemy structure';$('placementNotice').hidden=false;break;
    }
  }

  function hitTest(x,y) {
    const candidates=game.entities.filter(e=>e.hp>0&&!e.boardedIn&&!e.garrisonedIn&&e.layer===renderer.layer&&game.isVisible(e));
    let best=null,bestScore=Infinity;
    for(const e of candidates){const pos=OnlineMatch.position(e),elevation=game.tiles[Math.floor(pos.y)]?.[Math.floor(pos.x)]?.elevation||0;const p=renderer.worldToScreen(pos.x,pos.y,renderer.layer==='surface'?elevation:0);const zoom=renderer.camera.zoom||1;
      const def=game.getDef(e)||{};const radius=e.kind==='building'?Math.max(24,22*(def.size||2)*zoom):Math.max(13,14*zoom);
      const altitude=def.domain==='air'?(renderer.aircraftAltitude?renderer.aircraftAltitude(e):24):0;
      const dy=y-(p.y-(e.kind==='building'?14:altitude+6)*zoom);const dist=Math.hypot(x-p.x,dy);const score=dist/(e.kind==='building'?1.5:1);
      if(dist<radius&&score<bestScore){best=e;bestScore=score;}
    }return best;
  }
  function commandAt(world,target,mode='move') {
    const units=commandSelected().filter(e=>e.kind!=='building');if(!units.length){toast('Select personnel or a crewed machine to issue an order.','danger');return;}
    const ids=units.map(e=>e.id),opts={mode};
    if(target){opts.targetId=target.id;
      if(target.owner===0&&(target.type==='wall'&&target.perch||target.type==='tank')&&!target.garrisonId&&units.some(e=>game._canGarrison(e,target))){report(game.command(ids,world.x,world.y,{mode:'garrison',targetId:target.id}));return;}
      if(target.owner===0&&target.kind!=='unit'&&target.progress>=1&&target.hp<target.maxHp&&units.every(e=>e.type==='mechanic')){report(game.command(ids,world.x,world.y,{mode:'repair',targetId:target.id}));return;}
      if(target.owner!==0&&!(target.type==='spy'&&target.disguised&&!target.exposed))opts.mode=units.every(e=>e.type==='spy')?'infiltrate':'attack';
      else if(target.owner===0&&target.kind==='machine'&&(target.crew||[]).length<(game.getDef(target)?.crew||1)&&units.some(e=>e.kind==='unit')){report(game.crew(target.id,units.filter(e=>e.kind==='unit').map(e=>e.id)));return;}
      else if(target.owner===0&&target.kind==='building'&&(target.progress<1||['factory','airfield','shipyard'].includes(target.type)&&target.queue?.length))opts.mode='build';
      else if(target.owner===0&&target.hp<target.maxHp)opts.mode='repair';
    }else{
      const tile=game.tiles[Math.floor(world.y)]?.[Math.floor(world.x)];
      if(tile?.resource&&tile.resource.amount>0&&mode==='move'&&!units.every(e=>e.type==='mechanic'))opts.mode='gather';
    }
    const result=game.command(ids,world.x,world.y,opts);
    if(result?.ok===false)toast(result.message,'danger');else playTone();
    renderer.orderMarker={x:world.x,y:world.y,life:1,mode:opts.mode};refreshUI();
  }
  function point(e){const r=canvas.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};}
  canvas.addEventListener('pointerdown',e=>{
    if(!started||game.winner!==null&&!$('resultOverlay').hidden)return;
    if(e.button>2)return;
    canvas.focus();const p=point(e);pointerXY=p;
    pointer={...p,world:renderer.screenToWorld(p.x,p.y),lastX:p.x,lastY:p.y,button:e.button,shift:e.shiftKey,moved:false,type:e.pointerType};
    canvas.setPointerCapture(e.pointerId);e.preventDefault();
  });
  canvas.addEventListener('pointermove',e=>{
    const p=point(e);pointerXY=p;const world=renderer.screenToWorld(p.x,p.y);
    if(placement)updatePlacement(world);
    if(orderMode==='clear'&&pointer?.button===0)renderer.areaPreview={from:pointer.world,to:world};
    if(pointer){
      if(Math.hypot(p.x-pointer.x,p.y-pointer.y)>5)pointer.moved=true;
      if(pointer.moved){
        if(pointer.button===1||pointer.button===2){renderer.pan(p.x-pointer.lastX,p.y-pointer.lastY);}
        else if(!placement&&!orderMode)renderer.dragRect={x:Math.min(pointer.x,p.x),y:Math.min(pointer.y,p.y),w:Math.abs(p.x-pointer.x),h:Math.abs(p.y-pointer.y)};
      }
      pointer.lastX=p.x;pointer.lastY=p.y;
    }else renderer.hoverId=hitTest(p.x,p.y)?.id||null;
    const tx=Math.floor(world.x),ty=Math.floor(world.y),tile=game.tiles[ty]?.[tx];
    if(tile&&game.canSee(tx,ty,renderer.layer)){
      const effects={forest:'Cover reduces incoming fire',water:'Naval units only',rock:'High ground favors ranged attacks',marsh:'Movement slowed',sand:'Exposed terrain',snow:'Open snowfield',grass:'Open terrain',bridge:'Strategic crossing'};
      $('terrainHint').textContent=`${renderer.layer==='underground'?'SUBSURFACE':tile.type.toUpperCase()} / ${tx},${ty} · ${renderer.layer==='surface'?effects[tile.type]||'Open terrain':'Drills can cross beneath surface obstacles'}${tile.elevation?' · Elevation '+tile.elevation:''}${tile.resource?.amount>0?' · '+tile.resource.type.toUpperCase()+' '+format(tile.resource.amount):''}`;
    }else $('terrainHint').textContent=renderer.layer==='underground'?'SUBSURFACE · Hostile tunnels require seismic detection':'UNEXPLORED TERRITORY';
  });
  canvas.addEventListener('pointerup',e=>{
    if(!pointer)return;const down=pointer;pointer=null;renderer.dragRect=null;
    const p=point(e),world=renderer.screenToWorld(p.x,p.y);const target=hitTest(p.x,p.y);
    if(down.button===1||down.button===2&&down.moved)return;
    if(down.button===2){if(placement||orderMode)cancelOrder();else commandAt(world,target);return;}
    if(placement){const type=placement;const x=Math.floor(world.x)+.5,y=Math.floor(world.y)+.5;const res=type==='wall'?game.buildWallLine(down.world,world,humanIds(),0):game.build(type,x,y,humanIds(),0,{gateAxis});if(report(res)){cancelOrder();if(res.entity)setSelection([res.entity.id]);else if(res.entities?.length)setSelection([res.entities[0].id]);}return;}
    if(orderMode==='clear'){if(report(game.clearArea(humanIds(),down.world,world)))cancelOrder();renderer.areaPreview=null;return;}
    if(orderMode==='scan'){scanAt(world);return;}
    if(orderMode){commandAt(world,target,orderMode);cancelOrder();return;}
    if(down.moved){
      const rect={left:Math.min(down.x,p.x),right:Math.max(down.x,p.x),top:Math.min(down.y,p.y),bottom:Math.max(down.y,p.y)};
      const ids=game.entities.filter(en=>{
        if(!(en.owner===0||underCover(en))||en.hp<=0||en.boardedIn||en.garrisonedIn||(en.kind==='building'&&!['wall','gate','heavygate'].includes(en.type))||en.layer!==renderer.layer)return false;
        const pos=OnlineMatch.position(en),tile=game.tiles[Math.floor(pos.y)]?.[Math.floor(pos.x)];const s=renderer.worldToScreen(pos.x,pos.y,renderer.layer==='surface'?tile?.elevation||0:0);
        return s.x>=rect.left&&s.x<=rect.right&&s.y>=rect.top&&s.y<=rect.bottom;
      }).map(en=>en.id);
      const start=hitTest(down.x,down.y),wallDrag=start?.owner===0&&['wall','gate','heavygate'].includes(start.type),mobiles=ids.filter(id=>game.getEntity(id).kind!=='building'),picked=wallDrag?ids.filter(id=>game.getEntity(id).kind==='building'):mobiles.length?mobiles:ids;
      setSelection(down.shift?[...selection,...picked]:picked);
    }else if(target){
      if(down.type==='touch'&&selection.size&&target.owner!==0)commandAt(world,target);
      else if(down.shift){const next=new Set(selection);next.has(target.id)?next.delete(target.id):next.add(target.id);setSelection([...next]);}
      else setSelection([target.id]);
    }else if(down.type==='touch'&&selection.size){commandAt(world,null);}
    else setSelection([]);
  });
  canvas.addEventListener('pointercancel',()=>{pointer=null;cancelOrder();});
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  canvas.addEventListener('wheel',e=>{e.preventDefault();const p=point(e);renderer.zoomAt(Math.exp(-e.deltaY*.0012),p.x,p.y);},{passive:false});
  canvas.addEventListener('dblclick',e=>{const p=point(e),target=hitTest(p.x,p.y);if(target&&(target.owner===0||underCover(target))&&target.kind!=='building')setSelection(game.entities.filter(en=>(en.owner===0||underCover(en))&&perceived(en).type===perceived(target).type&&!en.boardedIn&&en.hp>0&&en.layer===renderer.layer).map(en=>en.id));});
  $('minimap').addEventListener('pointerdown',e=>{const r=e.currentTarget.getBoundingClientRect(),world={x:(e.clientX-r.left)/r.width*game.width,y:(e.clientY-r.top)/r.height*game.height};if(orderMode==='scan')scanAt(world);else renderer.centerOn(world.x,world.y);});
  document.addEventListener('keydown',e=>{
    if(['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName))return;
    if(e.key==='F1'){e.preventDefault();$('helpOverlay').hidden?showHelp():closeHelp();return;}
    if(e.key==='Escape'){
      if(!$('helpOverlay').hidden)closeHelp();else if(!$('menuOverlay').hidden)closeMenu();else if(placement||orderMode)cancelOrder();else if(selection.size)setSelection([]);else if(started)togglePause();return;
    }
    if(!started||!$('menuOverlay').hidden||!$('helpOverlay').hidden||!$('resultOverlay').hidden)return;
    const k=e.key.toLowerCase();
    if((e.ctrlKey||e.metaKey)&&k==='s'){e.preventDefault();saveGame();return;}
    if((e.ctrlKey||e.metaKey)&&/^[3-9]$/.test(k)){e.preventDefault();groups[k]=[...selection];toast(`Control group ${k} assigned.`);return;}
    if(/^[3-9]$/.test(k)&&groups[k]){setSelection(groups[k]);const u=ownSelected()[0];if(u)renderer.centerOn(u.x,u.y);return;}
    if(k.startsWith('arrow')){keys.add(k);e.preventDefault();return;}
    if(e.repeat)return;
    if(k===' '){e.preventDefault();togglePause();}
    if(k==='a')setOrder('attack');if(k==='m')setOrder('move');if(k==='s')doAbility('stop');if(k==='u')upgradeSelection();if(k==='h')home();if(k==='q')beginScan();
    if(k==='1')setLayer('surface');if(k==='2')setLayer('underground');if(k==='r'){if(placement==='heavygate'){gateAxis=gateAxis==='x'?'y':'x';updatePlacement(renderer.screenToWorld(pointerXY.x,pointerXY.y));}else $('rangeButton').click();}
    if(k==='+'||k==='=')$('zoomIn').click();if(k==='-')$('zoomOut').click();
  });
  $('catalogSearch').addEventListener('input',()=>{catalogSignature='';refreshCatalog();});
  $('catalogFilter').addEventListener('change',()=>{catalogSignature='';refreshCatalog();});
  $('catalogReset').addEventListener('click',()=>setTab(tab));
  document.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur',()=>{keys.clear();pointer=null;renderer.dragRect=null;renderer.wallPreview=null;renderer.areaPreview=null;});
  document.addEventListener('visibilitychange',()=>{if(!onlineGame&&document.hidden&&started&&!game.paused&&game.winner===null){game.paused=true;syncPause();saveGame(true);}lastFrame=performance.now();});
  window.addEventListener('beforeunload',()=>{if(started&&game.winner===null)saveGame(true)});
  document.addEventListener('click',e=>{
    const catalog=e.target.closest('[data-catalog]');if(catalog){if(!started)return;const kind=catalog.dataset.catalog,type=catalog.dataset.type;if(kind==='build')beginBuild(type);if(kind==='recruit')train(type);if(kind==='machines')produce(type);return;}
    const action=e.target.closest('[data-action]');if(action){handleAction(action.dataset.action);return;}
    const tabEl=e.target.closest('[data-tab]');if(tabEl)setTab(tabEl.dataset.tab);
    const layer=e.target.closest('[data-layer]');if(layer)setLayer(layer.dataset.layer);
    const man=e.target.closest('[data-manual]');if(man)renderManual(man.dataset.manual);
    const tip=e.target.closest('[data-tip]');if(tip){const key=tip.dataset.tip;if(key==='attack'){toast('Scout across the eastern half of the theater. Select your force, press A, then click toward the enemy. Keep defenders at headquarters.');}else{setTab(key);const texts={build:'Select a structure, then click clear terrain near your base. Engineers build automatically; extra workers speed construction.',recruit:'Recruit personnel from the command panel. Build barracks or quarters if you need more housing.',machines:'Construct a factory, then order armor. Select the completed vehicle and press Crew before moving it.'};toast(texts[key]);}}
  });
  $('startButton').onclick=()=>startOperation();$('continueButton').onclick=closeMenu;$('closeMenu').onclick=closeMenu;$('loadButton').onclick=loadGame;
  $('biomeSelect').onchange=()=>{$('biomeDescription').textContent=biomeNotes[$('biomeSelect').value];};
  $('difficultySelect').onchange=difficultyBrief;difficultyBrief();$('biomeDescription').textContent=biomeNotes[$('biomeSelect').value];
  $('menuButton').onclick=showMenu;$('saveButton').onclick=()=>saveGame();$('pauseButton').onclick=togglePause;$('resumeButton').onclick=togglePause;
  $('centerButton').onclick=home;$('zoomIn').onclick=()=>renderer.zoomAt(1.2,canvas.clientWidth/2,canvas.clientHeight/2);$('zoomOut').onclick=()=>renderer.zoomAt(1/1.2,canvas.clientWidth/2,canvas.clientHeight/2);
  $('rangeButton').onclick=()=>{renderer.showRanges=!renderer.showRanges;$('rangeButton').classList.toggle('active',renderer.showRanges);};
  $('speedButton').onclick=()=>{if(onlineGame)return;speed=({1:1.5,1.5:2,2:1})[speed]||1;$('speedButton').textContent=speed+'×';};
  $('hideTutorial').onclick=()=>{$('tutorial').hidden=true;preferences.hideTutorial=true;try{localStorage.setItem(PREF_KEY,JSON.stringify(preferences))}catch{}};
  $('newOperation').onclick=()=>{$('resultOverlay').hidden=true;showMenu();};$('inspectBattle').onclick=()=>{$('resultOverlay').hidden=true;game.paused=true;syncPause();};

  const manual = {
    basics:`<h3>The headquarters is the objective.</h3><p>Defend your headquarters and eliminate every rival. Only the final surviving faction wins; your own HQ loss eliminates you. Each HQ has an upgradeable air-defense roof gun. Recruit units, expand production, and build a force that can survive the approach.</p><table><tr><td>Select / group</td><td>Click a unit; drag a box for a squad. Shift-click adds or removes units. Double-click selects every friendly unit of that type. Drag over walls and gates to select their segments (start the drag on a wall to exclude nearby troops), then Upgrade wall group (U) pays the displayed total to upgrade them together.</td></tr><tr><td>Give orders</td><td>Right-click terrain to move, an enemy to attack, a deposit to gather, a construction site to build, or a damaged friendly structure to repair.</td></tr><tr><td>Attack-move</td><td>Press A, then click a destination. Your force engages contacts along the way. Group movement forms durable troops and armor in front, with fragile ranged weapons and support behind. Fast units pace themselves to the formation. Terrain and combat can loosen the ranks. M issues a normal move; S stops.</td></tr><tr><td>Roam freely</td><td>Drag-select troops or crewed machines and choose Roam freely. They pick their own routes, engage visible threats and continue exploring. Stop or another order cancels roaming.</td></tr><tr><td>Auto staffing</td><td>Select barracks and turn Auto staffing ON. They train engineers for construction and machine assembly, then vehicle specialists for empty crew seats, and dispatch them automatically. Normal prices and housing apply; already queued recruits finish if switched off.</td></tr><tr><td>Tank roof gunner</td><td>Select a combat soldier and right-click a tank, or select a tank and Add roof gunner. One extra soldier fires rapid rounds at infantry while the cannon prioritizes armor. The tank still needs two internal crew. Unload roof gunner releases the rider.</td></tr><tr><td>Camera</td><td>Arrow keys pan. Drag with the middle or right mouse button. Mouse wheel or + / − zooms. H returns to headquarters. Click the minimap to jump.</td></tr><tr><td>Layers / ranges</td><td>1 is the surface. 2 is the subsurface. R toggles weapon ranges.</td></tr><tr><td>Control groups</td><td>Ctrl+3 through Ctrl+9 stores your selection. Press the number to recall that group.</td></tr><tr><td>Pause / save</td><td>Space pauses. Ctrl+S saves. An autosave is stored every minute. Resume it from the operation menu.</td></tr><tr><td>Touch screens</td><td>Tap to select; tap open terrain to move. Use Attack-move for explicit targeting and the + / − camera buttons to zoom.</td></tr></table>`,
    economy:`<h3>People power the war machine.</h3><p>Credits buy personnel, structures, upgrades, and missing resources. Alloy builds your base, fuel equips heavy machinery, and crystals enable advanced technology. Headquarters and economic structures generate resources over time; personnel can also gather marked deposits.</p><h4>Guaranteed production</h4><p>Credits: HQ, logistics depot and power plant. Alloy: Alloy works (+2/s). Fuel: Fuel refinery (+1.4/s). Crystal: Crystal processor (+0.8/s, requires laboratory). These work without deposits; upgrades increase output. Open Resource guide in Build for live rates and unlocks.</p><h4>Automatic imports</h4><p>A shortage never requires a separate market screen. When you order something, available resources are used first. Missing alloy costs 4 credits per unit, fuel 6, and crystals 12. The command card shows the total credits required, including imports.</p><h4>Workers and construction</h4><p>Choose a building and place it on clear terrain within your base’s construction radius. Any selected personnel except dedicated field mechanics can build. Engineers work faster, and more workers add their effort. Without a selected squad, available engineers are assigned automatically. Right-click an unfinished structure to add workers; moving them away suspends their contribution.</p><h4>Walls and repairs</h4><p>Drag a wall line to preview its total price and queue all segments. Corners connect automatically. Buy a 120-credit perch on a completed wall, then station a nearby soldier or right-click the wall with a selected combat troop. One occupant gains +2 weapon range, +3 vision and 25% armor. Choose Unload perch to release them. Heavy vehicle gates provide a three-tile friendly-only opening; R rotates them while placing. Use fortified walls and friendly-access gates to block ground forces and direct enemy fire. Artillery and aircraft fire over walls; tunnels pass below. Upgrades increase durability and add visible reinforcement. Field mechanics automatically repair machines and structures within 12 tiles, or right-click a damaged friendly target. They are unarmed and do not gather, build or crew.</p><h4>Clear terrain and establish vision</h4><p>Recruit a Terrain pioneer, select it, choose Clear area, then drag a rectangle of up to 20 × 20 explored tiles. Clearing takes real work and removes scenery and rough-terrain penalties while keeping ore deposits, elevation, buildings and water. A Forward vision beacon can be built on scouted land anywhere; it maintains vision after troops leave, until destroyed.</p><h4>Housing and upgrades</h4><p>Every person needs housing, including vehicle crews. Barracks and quarters increase capacity; recruitment queues reserve beds. Upgrade a selected unit or building with U or its Upgrade button, up to tier III. The selection card previews current and upgraded values. Choose See all upgrade benefits for the full cost and stat comparison before spending. For example, a tier I headquarters upgrade raises maximum health from 2,600 to 3,380, beds from 14 to 21 and income from 6 to 9 credits per second. Every building also gains new structural details at tiers II and III.</p><h4>Progression</h4><p>A factory opens mechanized warfare. A factory opens extraction mines; a research laboratory opens drills and improves crystal extraction. An airfield includes the runway required for aircraft. Shipyards need a shoreline. Build a seismic beacon before the enemy can exploit the underground.</p>`,
    combat:`<h3>A combined-arms force beats a single weapon.</h3><p>Infantry are flexible, inexpensive, and able to construct or repair. Machines deliver power but need living crews. Medics preserve the force, generals strengthen it, and scouts provide the vision needed to use long-range weapons.</p><table>${Object.entries(D.units).map(([k,d])=>`<tr><td>${esc(d.name)}</td><td>${esc(d.description)}</td></tr>`).join('')}</table><h4>Crew every machine</h4><p>Select a finished vehicle and choose Crew to load nearby available personnel. You can also select people and right-click a friendly machine. A vehicle cannot move or fire until all required seats are filled. Disembark releases the crew; those soldiers remain part of your housing count while aboard. Aircraft can board or unload only at a friendly operational runway. Use Return to runway to land; low fuel also triggers an automatic return.</p><table>${Object.entries(D.machines).map(([k,d])=>`<tr><td>${esc(d.name)} · ${d.crew} crew</td><td>${esc(d.description)}</td></tr>`).join('')}</table><h4>Automatic engagement and base defense</h4><p>Idle forces and attack-moving squads pursue visible enemies within their own sight. Nearby available troops respond when a friendly building is attacked. After the threat ends, guards return to their post and attack-moving squads continue their route. Explicit movement, construction, mining, repairs and infiltration keep priority. Disguised spies and undetected underground forces are not revealed by these reactions.</p><h4>Preparation window</h4><p>New operations allow 10 minutes before AI offensives begin. Both human players can engage each other immediately in friend matches. The countdown uses game time, so pause stops it and faster game speed advances it faster. Enemy territory remains defended during preparation.</p><h4>Use the ground</h4><p>Forests absorb incoming fire. Elevation gives ranged weapons an advantage. Marshes slow movement. Water blocks land forces, so bridges become chokepoints; ships operate on oceans, coastal waters and rivers, while aircraft cross terrain freely. Keep fragile support units behind the line.</p>`,
    covert:`<h3>A second front, beneath the first.</h3><p>The subsurface shares the surface map’s coordinates. After constructing a factory and laboratory, manufacture a tunneling drill and provide its crew. Select it and choose Burrow, then use the Subsurface view to travel beneath rivers, forests, and enemy defenses.</p><h4>Mine or sabotage</h4><p>Send a drill to underground deposits to gather resources, or approach the enemy headquarters and use Plant charge. Charges have a fuse, giving a prepared opponent time to react. The drill can surface for a surprise attack. Drills need crews just like any other machine. When a beacon detects a charge, bring an engineer within 3.2 tiles of its surface location before the fuse expires to disarm it.</p><h4>Seismic defense</h4><p>Seismic beacons and crewed Watchman rovers reveal hostile underground machines and charges. Watchman HQ Patrol monitors a 10-tile HQ radius, upgraded to 14 or 18. Badger interceptors detect nearby machines and shoot them underground. A countermine station automatically disarms detected charges within 8 / 10 / 12 tiles and reduces bomb damage to nearby structures by 50 / 60 / 70%. Drill and Badger proximity mines arm in 2 seconds and wait until an enemy underground machine crosses; surface troops, friendly machines and time alone never trigger them. Surface radar, scouts, and satellite sweeps cannot reveal the underground. Build overlapping beacons near critical infrastructure and respond to seismic warnings.</p><h4>Undercover operations</h4><p>Spies move disguised as friendly infantry among an opponent’s soldiers. Select an operative, choose Infiltrate, and target a visible hostile structure to steal credits and obtain intelligence. Investigators are the counter: they periodically check nearby suspicious personnel, and the Investigate order triggers a focused check. Detection is probabilistic; upgrades improve your odds. Once exposed, an operative must return within four tiles of a friendly recon station before infiltrating again.</p><h4>Reconnaissance</h4><p>Scouts and radar extend vision. Satellite uplinks enable broader surface reconnaissance. Choose Recon sweep or press Q, then click the battlefield or minimap to aim it. Pathfinder scans reach 15 tiles; uplinks scan anywhere for 55 credits. Fog hides current enemy movement, while explored terrain remains on your tactical map. Revealing a base does not make it permanently visible.</p>`
  };
  function renderManual(which='basics'){$('manualTitle').textContent='Every advantage is earned.';$('manualContent').innerHTML=manual[which]||manual.basics;$('manualContent').scrollTop=0;document.querySelectorAll('[data-manual]').forEach(b=>b.classList.toggle('active',b.dataset.manual===which));}
  function showHelp(){modalPause=game.paused;game.paused=true;keys.clear();$('helpOverlay').hidden=false;renderManual('basics');syncPause();}
  function closeHelp(){$('helpOverlay').hidden=true;if(started&&$('menuOverlay').hidden)game.paused=modalPause;syncPause();canvas.focus();}
  $('helpButton').onclick=showHelp;$('closeHelp').onclick=closeHelp;$('manualDone').onclick=closeHelp;
  function showResult(){
    if(resultShown)return;resultShown=true;game.paused=true;
    const won=game.winner===0;$('resultTitle').textContent=won?'The front is yours.':'Command has fallen.';
    $('resultIcon').textContent=won?'✦':'⌖';$('resultIcon').style.color=won?'var(--accent)':'var(--red)';
    $('resultDescription').textContent=won?'Every rival headquarters has fallen. You are the last commander standing.':'Your headquarters was destroyed and your faction is eliminated. A commander wins only when every other headquarters has fallen.';
    const survivors=game.entities.filter(e=>e.owner===0&&e.kind==='unit'&&e.hp>0).length;
    const destroyed=game.entities.filter(e=>e.owner!==0&&e.hp<=0).length;
    $('resultStats').innerHTML=`<span><b>${clock(game.time)}</b>OPERATION TIME</span><span><b>${survivors}</b>SURVIVORS</span><span><b>${destroyed}</b>HOSTILES DOWN</span>`;
    $('resultOverlay').hidden=false;syncPause();
  }
  let lastDraw=0,autoSavePending=false;
  function scheduleAutoSave(){if(autoSavePending)return;autoSavePending=true;const operation=game;const run=()=>{autoSavePending=false;if(game===operation&&started&&game.winner===null)saveGame(true);};if(window.requestIdleCallback)requestIdleCallback(run,{timeout:3000});else setTimeout(run,100);}
  function frame(now){
    if(document.hidden){lastFrame=now;requestAnimationFrame(frame);return;}
    const interval=!$('menuOverlay').hidden||!$('helpOverlay').hidden?100:renderer.quality==='performance'||game.paused&&!onlineGame?1000/30:0;
    if(now-lastDraw<interval-1){requestAnimationFrame(frame);return;}lastDraw=now;
    const dt=Math.min(.05,Math.max(0,(now-lastFrame)/1000));lastFrame=now;
    if(started&&$('menuOverlay').hidden&&$('helpOverlay').hidden){
      const pan=480*dt;
      if(keys.has('arrowleft'))renderer.pan(pan,0);if(keys.has('arrowright'))renderer.pan(-pan,0);if(keys.has('arrowup'))renderer.pan(0,pan);if(keys.has('arrowdown'))renderer.pan(0,-pan);
      if(!onlineGame&&!game.paused&&game.winner===null){game.update(dt*speed);saveTimer+=dt;if(saveTimer>=60){saveTimer=0;scheduleAutoSave()}}
      if(game.winner!==null||game.teams[0].eliminated)showResult();
    }
    if(onlineGame)for(const fx of game.effects)fx.life=Math.max(0,fx.life-dt);
    renderer.render(now/1000);
    if(renderer.orderMarker){renderer.orderMarker.life-=dt;const mark=renderer.orderMarker;if(mark.life<=0)renderer.orderMarker=null;else{const ctx=canvas.getContext('2d'),tile=game.tiles[Math.floor(mark.y)]?.[Math.floor(mark.x)],p=renderer.worldToScreen(mark.x,mark.y,renderer.layer==='surface'?tile?.elevation||0:0),dpr=renderer.dpr||Math.min(2,window.devicePixelRatio||1);ctx.save();ctx.setTransform(dpr,0,0,dpr,0,0);ctx.strokeStyle=mark.mode==='attack'?'#e5a481':'#c7e0a8';ctx.globalAlpha=mark.life;ctx.lineWidth=1.5;ctx.beginPath();ctx.ellipse(p.x,p.y,25*(1.3-mark.life*.3),12*(1.3-mark.life*.3),0,0,Math.PI*2);ctx.stroke();ctx.restore();}}
    uiTimer+=dt;mapTimer+=dt;if(uiTimer>=.3){uiTimer=0;refreshUI();}if(mapTimer>=.25){mapTimer=0;renderer.drawMinimap($('minimap'));}
    requestAnimationFrame(frame);
  }
  new ResizeObserver(()=>renderer.resize()).observe(canvas.parentElement);
  renderer.resize();home();refreshUI(true);showMenu();requestAnimationFrame(frame);if(location.protocol==='http:'||location.protocol==='https:')online.resume();else{$('hostRoom').disabled=true;$('joinRoom').disabled=true;$('onlineStatus').textContent='Online play is available at the hosted game link. This portable copy supports solo play.';}
})();
