'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'dist'),port=Number(process.env.PORT||4173),host=process.env.HOST||'127.0.0.1';
const createDB=require('./scripts/local-db.cjs');fs.mkdirSync(path.join(__dirname,'.local'),{recursive:true});
const DB=createDB(process.env.IRON_VEIL_TEST_DB||path.join(__dirname,'.local/rooms.sqlite')),online=import('./worker/multiplayer.mjs');
const allowed=new Set((process.env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean));
if(process.env.CODESPACE_NAME)allowed.add('https://'+process.env.CODESPACE_NAME+'-'+port+'.'+(process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN||'app.github.dev'));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json'};
const server=http.createServer(async(req,res)=>{
 let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400);res.end();return;}
 if(pathname.startsWith('/api/rooms/')){
  const origin=req.headers.origin,sameOrigin=!origin||origin==='http://'+req.headers.host||origin==='https://'+req.headers.host;
  if(!sameOrigin&&!allowed.has(origin)){res.writeHead(403);res.end('Server does not allow this website origin.');return;}
  const cors=origin?{'Access-Control-Allow-Origin':origin,'Vary':'Origin'}:{};
  if(req.method==='OPTIONS'){res.writeHead(204,{...cors,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Max-Age':'600'});res.end();return;}
  try{
   const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>20000){res.writeHead(413,cors);res.end();return;}chunks.push(chunk);}
   // Origin checked above. Keep the shared Worker strict by default.
   const headers={...req.headers};delete headers.origin;delete headers['cf-connecting-ip'];headers['cf-connecting-ip']=req.socket.remoteAddress||'local';
   const request=new Request('http://'+req.headers.host+req.url,{method:req.method,headers,...(req.method==='POST'?{body:Buffer.concat(chunks)}:{})});
   const response=await(await online).multiplayer(request,{DB});res.writeHead(response.status,{...Object.fromEntries(response.headers),...cors});res.end(Buffer.from(await response.arrayBuffer()));
  }catch(e){console.error(e.message);res.writeHead(500,cors);res.end('Server error');}return;
 }
 const target=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
 if(!target.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 fs.readFile(target,(err,data)=>{if(err){res.writeHead(404);res.end('Not found');return;}res.writeHead(200,{'Content-Type':types[path.extname(target)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);});
});
server.listen(port,host,()=>console.log('Local: http://localhost:'+port+' (listening on '+host+')'));
