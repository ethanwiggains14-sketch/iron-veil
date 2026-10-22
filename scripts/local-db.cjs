'use strict';
const {DatabaseSync}=require('node:sqlite'),fs=require('node:fs'),path=require('node:path');
module.exports=function createDB(filename=':memory:'){
 const sqlite=new DatabaseSync(filename);sqlite.exec('PRAGMA journal_mode=WAL;');
 const exists=sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='rooms'").get();if(!exists)sqlite.exec(fs.readFileSync(path.join(__dirname,'../drizzle/0000_rooms.sql'),'utf8').replaceAll('--> statement-breakpoint',''));
 return {sqlite,prepare(sql){
  return {bind(...args){
   const values=args.map(a=>a===undefined?null:a);
   return {
    async first(){return sqlite.prepare(sql).get(...values)||null;},
    async run(){const r=sqlite.prepare(sql).run(...values);return {meta:{changes:Number(r.changes)}};}
   };
  }};
 }};
};
