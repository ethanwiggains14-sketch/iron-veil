'use strict';
// Real match diagnostics also register activity with Codespaces. Never generate
// synthetic requests or timer output: idle or disconnected rooms must go idle.
module.exports=function activityReporter({now=Date.now,log=console.log}={}){
 let last=-Infinity;
 return function report(ok,body,duration){
  if(!ok||now()-last<60000)return;
  try{
   const state=JSON.parse(body.toString());
   if(state.status!=='playing'||state.waitingForConnection)return;
   last=now();
   log('Multiplayer active | simulation '+Math.round(duration)+' ms | snapshot '+Math.round(body.length/1024)+' KiB | catch-up '+(state.lagSeconds||0)+' s');
  }catch{}
 };
};
