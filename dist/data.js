(function(global){
'use strict';
const c=(money,metal=0,fuel=0,crystal=0)=>({money,metal,fuel,crystal});
const units={
 pioneer:{name:'Terrain pioneer',icon:'TP',description:'Unarmed terrain clearance specialist. Drag a selected area to remove trees, rocks and brush, improving movement. Preserves water, elevation, ore deposits and buildings. Also builds at twice infantry speed.',cost:c(90,12),hp:100,damage:0,range:0,speed:2.6,sight:7,clearRate:1,buildRate:2,trainTime:10,producer:'barracks'},
 mechanic:{name:'Field mechanic',icon:'FX',description:'Unarmed repair specialist. Automatically repairs friendly machines and completed structures within 12 tiles. Repairs 32 HP/sec for 0.045 credits per HP. Does not build, gather or crew.',cost:c(95,12),hp:100,damage:0,range:0,speed:2.6,sight:7,repairRate:32,trainTime:9,producer:'barracks'},
 engineer:{name:'Combat engineer',icon:'EN',description:'Builds 3× faster, gathers efficiently and repairs vehicles. Any soldier can build; engineers excel.',cost:c(60,8),hp:90,damage:7,range:3.4,speed:2.4,buildRate:3,sight:7,trainTime:7,producer:'barracks'},
 rifleman:{name:'Rifle infantry',icon:'RF',description:'Affordable frontline infantry. Takes cover in forests and can help build or crew any machine.',cost:c(45,5),hp:115,damage:15,range:4.2,speed:2.2,buildRate:1,sight:6,trainTime:6,producer:'barracks'},
 medic:{name:'Field medic',icon:'+',description:'Automatically heals nearby friendly people between volleys. Essential for sustained attacks.',cost:c(85,10),hp:85,damage:5,range:3,speed:2.4,buildRate:1,sight:6,heal:14,trainTime:9,producer:'barracks'},
 scout:{name:'Pathfinder',icon:'SC',description:'Fast reconnaissance specialist with exceptional vision. Can launch a short tactical scan.',cost:c(65,5),hp:75,damage:9,range:4,speed:3.4,buildRate:1,sight:11,trainTime:7,producer:'barracks'},
 sniper:{name:'Marksman',icon:'SN',description:'Long-range precision rifle. Elevated ground extends range; vulnerable in close quarters.',cost:c(105,18),hp:80,damage:43,range:7.8,speed:2,buildRate:1,sight:9,reload:2.1,trainTime:11,producer:'barracks',requires:['armory']},
 heavy:{name:'Heavy gunner',icon:'HG',description:'Armored infantry with suppressive fire. Hits nearby infantry around its primary target.',cost:c(100,24),hp:190,damage:24,range:4.6,speed:1.65,buildRate:1,sight:6,splash:.75,trainTime:11,producer:'barracks',requires:['armory']},
 rocketeer:{name:'Anti-armor team',icon:'AT',description:'Portable missiles deal triple damage to vehicles and can target aircraft.',cost:c(120,22,8),hp:95,damage:21,range:6.3,speed:1.9,buildRate:1,sight:7,antiArmor:3,antiAir:true,reload:1.7,trainTime:12,producer:'barracks',requires:['armory']},
 general:{name:'Field general',icon:'★',description:'Boosts nearby allied damage by 20%. Rally briefly amplifies the whole selected battle group.',cost:c(190,15,0,8),hp:145,damage:14,range:4.2,speed:2.1,buildRate:1,sight:8,aura:8,trainTime:16,producer:'barracks',requires:['armory']},
 spy:{name:'Undercover operative',icon:'SP',description:'Infiltrate an enemy building, blend in with enemy troops and siphon credits. Only investigators expose a disguise.',cost:c(170,8,0,12),hp:70,damage:10,range:3,speed:2.7,buildRate:1,sight:9,trainTime:15,producer:'barracks',requires:['radar']},
 investigator:{name:'Private investigator',icon:'PI',description:'Automatically checks nearby people every 8 seconds. Each sweep has a 46% chance to reveal undercover enemies.',cost:c(130,5,0,5),hp:95,damage:12,range:3.8,speed:2.5,buildRate:1,sight:7,detectChance:.46,trainTime:10,producer:'barracks',requires:['radar']},
 sapper:{name:'Demolitions sapper',icon:'DM',description:'Deals triple damage to structures. Builds twice as fast as regular infantry.',cost:c(110,15,12),hp:110,damage:18,range:3.2,speed:2.2,buildRate:2,sight:6,antiBuilding:3,trainTime:11,producer:'barracks',requires:['armory']},
 pilot:{name:'Vehicle specialist',icon:'PL',description:'Trained machine crew. Each specialist aboard improves its vehicle reload speed by 15%.',cost:c(90,5,6),hp:85,damage:7,range:3,speed:2.5,buildRate:1,sight:6,crewBonus:.15,trainTime:8,producer:'barracks',requires:['factory']},
 marine:{name:'Amphibious marine',icon:'MR',description:'Can wade and swim through rivers to flank defensive lines. Strong at close range.',cost:c(100,15,4),hp:140,damage:21,range:3.8,speed:2.3,buildRate:1,sight:7,amphibious:true,trainTime:10,producer:'barracks',requires:['armory']}
};
const machines={
 seismicrover:{name:'Watchman seismic rover',icon:'SR',description:'One crew. HQ patrol burrows and monitors a 10-tile radius around your HQ; upgrades expand it to 14 / 18. Detects enemy underground machines and charges. Unarmed.',cost:c(190,65,20,15),hp:320,damage:0,range:0,speed:2.5,crew:1,domain:'underground',sight:6,undergroundSight:4,buildTime:19,requires:['factory','radar'],producer:'factory'},
 interceptor:{name:'Badger tunnel interceptor',icon:'BI',description:'Two crew. Burrows and fires on detected underground machines. Local seismic vision: 6 tiles. Can lay machine-triggered proximity charges.',cost:c(270,100,35,20),hp:560,damage:48,range:5.5,speed:2.1,crew:2,domain:'underground',sight:7,undergroundSight:6,armor:.2,reload:1.4,buildTime:24,requires:['factory','lab'],producer:'factory'},
 tank:{name:'Vanguard tank',icon:'TK',description:'Main battle tank. Two internal crew required. Its slow cannon prioritizes armor and structures. An optional roof soldier fires a separate rapid anti-infantry gun; the exposed rider does not count as crew.',cost:c(250,100,35),hp:660,damage:57,range:6,speed:1.8,crew:2,domain:'land',sight:8,armor:.27,splash:1,buildTime:20,reload:1.7,requires:['factory'],producer:'factory'},
 flaktank:{name:'Skyguard anti-air tank',icon:'AA',description:'Tracked air-defense tank with twin rapid autocannons and targeting radar. Prioritizes aircraft: 1.8× damage, 9-tile range. Weak against heavy armor and buildings. Two crew; factory, armory and recon station required.',cost:c(320,110,55,10),hp:480,damage:18,range:9,speed:1.7,crew:2,domain:'land',sight:11,armor:.2,antiAir:true,airSuperiority:true,antiArmor:.55,antiBuilding:.35,reload:.45,buildTime:26,requires:['factory','armory','radar'],producer:'factory'},
 apc:{name:'Guardian APC',icon:'AP',description:'Fast armored escort with a rapid anti-infantry turret. One crew required.',cost:c(170,65,20),hp:400,damage:24,range:4.8,speed:2.9,crew:1,domain:'land',sight:8,armor:.18,buildTime:15,requires:['factory'],producer:'factory'},
 artillery:{name:'Siege artillery',icon:'AR',description:'Long-range siege gun excels against structures. Fragile and requires two crew.',cost:c(280,90,25),hp:290,damage:84,range:11,speed:1.25,crew:2,domain:'land',sight:7,splash:1.8,antiBuilding:1.6,reload:3,buildTime:23,requires:['factory','armory'],producer:'factory'},
 harvester:{name:'Atlas harvester',icon:'HV',description:'One operator extracts deposits 5× faster than infantry. Can also assist construction.',cost:c(155,65,15),hp:360,damage:0,range:0,speed:1.8,crew:1,domain:'land',sight:7,gatherRate:7,buildRate:4,buildTime:15,requires:['factory'],producer:'factory'},
 fighter:{name:'Kestrel interceptor',icon:'F1',description:'Rapid aircraft that crosses terrain and intercepts planes. Must return to its runway to refuel.',cost:c(290,85,65,10),hp:310,damage:42,range:7,speed:5.4,crew:1,domain:'air',sight:11,antiAir:true,airSuperiority:true,buildTime:24,requires:['airfield'],producer:'airfield'},
 bomber:{name:'Wraith bomber',icon:'B2',description:'Heavy aircraft delivers devastating splash against bases. Two crew and an operational runway required.',cost:c(390,135,85,20),hp:430,damage:105,range:5,speed:3.7,crew:2,domain:'air',sight:10,splash:2.2,antiBuilding:1.5,reload:3.5,buildTime:30,requires:['airfield','armory'],producer:'airfield'},
 patrolboat:{name:'River patrol boat',icon:'PB',description:'Fast armed boat controlling rivers and shores. Two crew required; built at a shoreline shipyard.',cost:c(185,75,25),hp:440,damage:33,range:6.5,speed:2.8,crew:2,domain:'sea',sight:10,antiAir:true,buildTime:20,requires:['shipyard'],producer:'shipyard'},
 frigate:{name:'Aegis frigate',icon:'FG',description:'Three-crew missile ship with long-range coastal bombardment and anti-air fire.',cost:c(420,180,65,25),hp:1100,damage:82,range:10,speed:1.8,crew:3,domain:'sea',sight:12,antiAir:true,splash:1.2,reload:2.5,buildTime:32,requires:['shipyard','lab'],producer:'shipyard'},
 drill:{name:'Mole siege drill',icon:'DR',description:'Two-crew subterranean transport. Burrow beneath defenses, mine deposits and plant timed base charges. Beacons and seismic rovers detect it.',cost:c(310,120,45,25),hp:460,damage:25,range:3,speed:1.65,crew:2,domain:'underground',sight:6,gatherRate:4,buildTime:26,requires:['factory','lab'],producer:'factory'}
};
const buildings={
 minibeacon:{name:'Forward vision beacon',icon:'VB',description:'Build on scouted land anywhere on the map. Provides persistent surface vision within 12 tiles without troops. Upgrades increase sight to 13 / 14. Does not detect underground threats.',cost:c(75,10),hp:250,size:1,buildTime:6,sight:12},
 heavygate:{name:'Heavy vehicle gate',icon:'HG',description:'A three-tile-wide armored gateway for every friendly ground vehicle and troop. Enemy ground forces cannot pass. Rotate its visual alignment with R while placing. Connect walls to either end.',cost:c(160,75),hp:1800,armor:.3,size:3,buildTime:15,sight:5},
 wall:{name:'Fortified wall',icon:'WL',description:'Drag a connected wall line to build several segments. Buy a 120-credit perch on a completed segment to station one troop. Adjacent segments form a barrier against ground movement and direct enemy fire. Artillery and aircraft fire over walls; underground machines pass beneath. Upgrades increase health and armor.',cost:c(35,20),hp:1100,armor:.28,size:1,buildTime:5,sight:3},
 gate:{name:'Armored gate',icon:'GA',description:'A one-tile gate lets friendly ground forces pass but blocks enemies and their direct fire. Place between wall segments. Upgrades increase health and armor.',cost:c(65,30),hp:900,armor:.22,size:1,buildTime:7,sight:4},
 smelter:{name:'Alloy works',icon:'AL',description:'Produces 2 alloy per second without a deposit. Upgrades raise output to 3 / 4 alloy per second.',cost:c(180,60),hp:850,size:2,buildTime:16,sight:5,output:{metal:2},requires:['depot']},
 crystalworks:{name:'Crystal processor',icon:'CR',description:'Produces 0.8 crystal per second without a deposit. Upgrades raise output to 1.2 / 1.6 crystal per second.',cost:c(240,85,15),hp:700,size:2,buildTime:18,sight:5,output:{crystal:.8},requires:['lab']},
 countermine:{name:'Countermine station',icon:'CM',description:'Disarms detected hostile charges within 8 tiles. Needs beacon or rover detection. Also reduces bomb damage to nearby friendly structures by 50%; upgrades give 10 / 12 tile protection and 60% / 70% reduction.',cost:c(230,80,15,20),hp:850,size:2,buildTime:18,sight:6,requires:['radar','lab']},
 hq:{name:'Command headquarters',icon:'HQ',description:'Armored command center with a roof-mounted air-defense gun: 36 damage, 10-tile range, 1.5-second reload; 1.8× damage against aircraft. Upgrades improve the gun. Produces credits and houses 14 people. Its destruction eliminates its faction. Destroy all rival headquarters to win.',cost:c(600,200),hp:2600,size:3,buildTime:35,housing:14,sight:11,income:6,damage:36,range:10,antiAir:true,airSuperiority:true,reload:1.5},
 barracks:{name:'Barracks',icon:'BR',description:'Recruits all personnel and houses 12 soldiers. Enable Auto staffing to train and dispatch engineers and vehicle crew when buildings need them. Uses normal costs and housing; manual orders stay first.',cost:c(140,65),hp:800,size:2,buildTime:13,housing:12,sight:6,producer:'unit'},
 housing:{name:'Field quarters',icon:'QT',description:'Houses 20 additional people. Higher levels expand capacity by 50% each.',cost:c(110,50),hp:600,size:2,buildTime:10,housing:20,sight:5},
 depot:{name:'Logistics depot',icon:'DP',description:'Generates 3 credits per second and improves resource gathering rates by 15% per depot level.',cost:c(145,55),hp:750,size:2,buildTime:12,sight:6,income:3},
 refinery:{name:'Fuel refinery',icon:'RF',description:'Refines 1.4 fuel per second. Fuel supports vehicles, aircraft and subterranean explosives.',cost:c(165,65),hp:700,size:2,buildTime:14,sight:5,requires:['depot']},
 mine:{name:'Deep extraction mine',icon:'MN',description:'Requires machinery and a nearby deposit. Extracts metal, fuel or crystal automatically. Labs double crystal output.',cost:c(150,65,10),hp:650,size:2,buildTime:15,sight:5,requires:['factory']},
 power:{name:'Power plant',icon:'PW',description:'Adds 4 credits per second and increases production speed by 12% per plant level.',cost:c(170,70,10),hp:650,size:2,buildTime:16,sight:5,income:4,requires:['depot']},
 factory:{name:'Vehicle factory',icon:'FC',description:'Fabricates armored vehicles, harvesters and drills. Nearby people accelerate machinery assembly.',cost:c(240,110,15),hp:1100,size:3,buildTime:20,sight:6,producer:'machine',requires:['depot']},
 armory:{name:'Weapons armory',icon:'AR',description:'Unlocks specialist infantry, artillery and bomber systems. Each level adds 8% army damage.',cost:c(180,75),hp:800,size:2,buildTime:16,sight:5,requires:['barracks']},
 radar:{name:'Recon station',icon:'RD',description:'Wide surface vision. Unlocks undercover operatives, investigators and seismic beacons.',cost:c(190,65,0,12),hp:650,size:2,buildTime:16,sight:15,requires:['power']},
 airfield:{name:'Airfield & runway',icon:'AF',description:'Integrated takeoff and landing strip. Fabricates aircraft and refuels them automatically.',cost:c(310,130,30),hp:1100,size:4,buildTime:24,sight:10,producer:'air',requires:['factory','power']},
 shipyard:{name:'Naval shipyard',icon:'SY',description:'Must be built beside water. Fabricates crewed patrol boats and frigates.',cost:c(250,100,20),hp:1000,size:3,buildTime:21,sight:9,producer:'sea',requires:['factory']},
 lab:{name:'Subsurface laboratory',icon:'LB',description:'Unlocks Mole drills, crystal mining efficiency, frigates and orbital intelligence.',cost:c(260,100,15,20),hp:750,size:2,buildTime:21,sight:6,requires:['factory','power']},
 uplink:{name:'Satellite uplink',icon:'SAT',description:'Launches wide surface satellite scans anywhere on the battlefield. Cannot reveal underground threats.',cost:c(280,90,20,35),hp:650,size:2,buildTime:22,sight:11,requires:['lab','radar']},
 sensor:{name:'Seismic beacon',icon:'SB',description:'Detects hostile underground machines and planted charges. Detects within 10 tiles; upgrades extend coverage.',cost:c(140,45,0,15),hp:500,size:1,buildTime:10,sight:5,undergroundSight:10,requires:['radar']},
 turret:{name:'Sentinel gun tower',icon:'GT',description:'Automated base defense. Attacks surface infantry, vehicles and aircraft; cannot see underground.',cost:c(170,75,5),hp:800,size:1,buildTime:13,sight:9,damage:32,range:8,antiAir:true,reload:1.2,requires:['armory']}
};
const terrains={
 grass:{name:'Grassland',description:'Fast, open ground with little protection.',speed:1,cover:0,color:'#416b50'},
 forest:{name:'Woodland',description:'30% protection for infantry, slower ground movement.',speed:.72,cover:.30,color:'#294c3c'},
 sand:{name:'Dunes',description:'Poor traction slows armor; open sight lines.',speed:.84,cover:0,color:'#a18f66'},
 marsh:{name:'Wetlands',description:'Severely slows heavy machines; infantry receive light cover.',speed:.58,cover:.12,color:'#46675f'},
 water:{name:'Deep water',description:'Ships and marines only. Aircraft fly overhead.',speed:.85,cover:0,color:'#234b60'},
 rock:{name:'Rocky upland',description:'Defensible elevation extends weapon range. Rough ground slows movement.',speed:.74,cover:.18,color:'#697775'},
 snow:{name:'Snowfield',description:'Cold terrain slows ground movement.',speed:.78,cover:.05,color:'#a7bbb6'},
 bridge:{name:'River crossing',description:'Fast exposed choke point. Ships may pass beneath.',speed:1,cover:0,color:'#8c927c'}
};
// Upgrade cards report the same additive tier scaling used by the simulation.
function upgradeProfile(entity,garrison=null){
 const d=(entity.kind==='unit'?units:entity.kind==='machine'?machines:buildings)[entity.type];
 if(!d)return null;
 const from=entity.level||1,to=Math.min(3,from+1),rows=[],notes=[];
 const add=(label,value,unit='')=>rows.push({label,current:value(from),next:value(to),unit});
 add('Maximum health',l=>Math.round(d.hp*(1+(l-1)*.3)),'HP');
 if(d.housing)add('Housing capacity',l=>Math.floor(d.housing*(1+(l-1)*.5)),'people');
 if(d.income)add('Credit income',l=>d.income*(1+(l-1)*.5),'/ sec');
 if(d.output)for(const [resource,rate] of Object.entries(d.output))add((resource==='metal'?'Alloy':'Crystal')+' output',l=>rate*(1+(l-1)*.5),'/ sec');
 if(d.clearRate)add('Terrain clearance speed',l=>d.clearRate*(1+(l-1)*.25),'× base');
 if(d.repairRate)add('Repair rate',l=>d.repairRate*(1+(l-1)*.25),'HP / sec');
 if(d.undergroundSight&&entity.kind==='machine')add('Local seismic detection',l=>d.undergroundSight+l-1,'tiles');
 if(entity.type==='seismicrover')add('HQ patrol radius',l=>10+(l-1)*4,'tiles');
 if(entity.type==='countermine'){add('Defense radius',l=>8+(l-1)*2,'tiles');add('Bomb damage prevented',l=>50+(l-1)*10,'%');}
 if(entity.type==='refinery')add('Fuel output',l=>1.4*(1+(l-1)*.5),'/ sec');
 if(entity.type==='mine'){
  add('Alloy / fuel extraction',l=>2.6*(1+(l-1)*.5),'/ sec');
  add('Crystal extraction',l=>.75*(1+(l-1)*.5),'/ sec');
  notes.push('Extracts the nearby deposit only. A completed laboratory doubles crystal output; depleted deposits stop producing.');
 }
 if(['barracks','factory','airfield','shipyard'].includes(entity.type))add(entity.type==='barracks'?'Recruitment speed':'Assembly speed',l=>1+(l-1)*.4,'× base');
 if(entity.type==='depot')add('Army gathering bonus',l=>l*15,'%');
 if(entity.type==='power')add('Army production bonus',l=>l*12,'%');
 if(entity.type==='armory')add('Army damage bonus',l=>l*8,'%');
 if(entity.type==='sensor')add('Underground detection',l=>10+(l-1)*3,'tiles');
 if(entity.type==='uplink')add('Satellite scan radius',l=>12+l*2,'tiles');
 if(d.heal)add('Medic healing',l=>d.heal*(1+(l-1)*.3),'HP / sec');
 if(entity.type==='investigator'){
  add('Discovery chance',l=>Math.min(.9,.46+(l-1)*.16)*100,'% / sweep');
  add('Investigation radius',l=>7+l,'tiles');
 }
 if(entity.type==='spy')add('Credits stolen',l=>25+l*10,'/ 5 sec');
 if(entity.type==='drill')add('Charge damage',l=>1000*(1+(l-1)*.2),'base damage');
 const rider=entity.garrisonedIn&&garrison?.type==='tank',weapon=rider?{damage:10,range:5.2,reload:.28}:d;
 if(weapon.damage){
  add(rider?'Roof gun damage':'Weapon damage',l=>weapon.damage*(1+(l-1)*.25),'base damage');
  add('Weapon range',l=>weapon.range+(l-1)*.25,'tiles');
  add('Reload interval',l=>(weapon.reload||1)/(1+(l-1)*.12),'sec');
 }
 if(['hq','flaktank'].includes(entity.type))add('Anti-air damage',l=>d.damage*(1+(l-1)*.25)*1.8,'base damage');
 if(entity.type==='tank')notes.push('A roof gunner uses an independent 10-damage, 0.28-second anti-infantry weapon at 5.2 tiles; rider tiers improve it. Internal crew are still required for the tank.');
 if(d.speed)add('Movement speed',l=>d.speed*(1+(l-1)*.08),'tiles / sec');
 if(entity.kind==='unit'&&!d.repairRate||entity.type==='harvester'){
  add('Construction / assembly work',l=>(d.buildRate||1)*(1+(l-1)*.25),'×');
  add('Repair rate',l=>(d.buildRate||1)*9*(1+(l-1)*.25),'HP / sec');
 }
 if(entity.kind==='unit'&&!d.repairRate||d.gatherRate)add('Gathering rate',l=>(d.gatherRate||(entity.type==='engineer'?2.2:1))*(1+(l-1)*.2),'/ sec');
 add('Surface vision',l=>(d.sight||6)+l-1,'tiles');
 add('Damage reduction',l=>Math.min(.65,(d.armor||0)+(l-1)*.04)*100,'%');
 if(entity.garrisonedIn)notes.push(rider?'Mounted weapon values describe the roof gun. The tank adds 10 percentage points of rider armor beyond the tier values shown. Dismount to use this soldier’s normal weapon.':'A wall perch adds 2 weapon range, 3 vision and 25 percentage points of armor beyond the tier values shown.');
 notes.push('Tier bonuses are added to base stats. Damage shown is before target armor, weapon matchups, armories, generals and rally. Range excludes elevation; movement excludes terrain. Reload excludes specialist crew.');
 if(d.producer&&entity.kind==='building')notes.push('Production still needs its normal resources and workers. Power plants multiply the production rate shown.');
 if(entity.type==='general')notes.push('The general’s 20% command aura and Rally ability stay the same at every tier.');
 if(entity.type==='pilot')notes.push('Each vehicle specialist still adds 15% reload speed aboard a machine at every tier.');
 if(entity.type==='airfield')notes.push('Runway refueling stays at 18 fuel per second. Higher tiers speed aircraft assembly.');
 if(['lab','radar'].includes(entity.type))notes.push('Technology unlocks are available at tier I. Higher tiers strengthen this structure and extend its vision; they do not unlock additional technologies.');
 if(entity.type==='depot'||entity.type==='power'||entity.type==='armory')notes.push('This is the contribution from this building. Bonuses from other completed buildings add together.');
 notes.push('Upgrading adds the gained maximum health to current health; it does not fully repair previous damage. Damage reduction from cover and tiers is capped at 65%.');
 return {from,to,cost:from<3?Math.ceil((d.cost.money*.65+40)*from):0,rows,notes};
}
global.RTS_DATA={units,machines,buildings,terrains,upgradeProfile};
})(globalThis);
