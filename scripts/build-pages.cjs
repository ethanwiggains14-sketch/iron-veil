// Only public game assets enter Pages. Room databases, Site metadata and credentials never do.
const fs=require('node:fs'),path=require('node:path'),root=path.join(__dirname,'..');
const out=path.join(root,'pages');fs.mkdirSync(out,{recursive:true});
for(const file of ['index.html','style.css','favicon.svg','data.js','engine.js','renderer.js','online.js','app.js'])fs.copyFileSync(path.join(root,'dist',file),path.join(out,file));
fs.writeFileSync(path.join(out,'.nojekyll'),'');console.log('GitHub Pages assets ready in pages/. Configure the multiplayer server in the game menu.');
