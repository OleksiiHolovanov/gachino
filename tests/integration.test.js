'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'gachino-test-'));
process.env.GACHINO_DATA_FILE=path.join(temp,'test.json');
const {server}=require('../server');
let base,cookie;
async function req(endpoint,body,opts={}){
 const result=await fetch(base+endpoint,{method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(opts.headers||{}),...(cookie?{'Cookie':cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});
 const setCookie=result.headers.get('set-cookie');if(setCookie)cookie=setCookie.split(';')[0];
 const contentType=result.headers.get('content-type')||'';
 return {status:result.status,data:contentType.includes('json')?await result.json():await result.text()};
}
test('Full casino flow over HTTP',async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port;
 try{
   let r=await req('/api/bootstrap');assert.equal(r.status,200);assert.equal(r.data.games.length,12);assert.equal(r.data.player,null);
   r=await req('/api/auth/register',{name:'GachiTester',password:'strong-demo-password'});assert.equal(r.status,200);assert.equal(r.data.player.credits,5000);assert.ok(cookie);
   r=await req('/api/me');assert.equal(r.data.player.name,'GachiTester');
   r=await req('/api/bonus/daily',{});assert.equal(r.data.player.credits,5500);
   r=await req('/api/bonus/daily',{});assert.equal(r.status,400);
   r=await req('/api/bonus/promo',{code:'GACHINO'});assert.equal(r.data.player.credits,6250);
   r=await req('/api/bonus/promo',{code:'GACHINO'});assert.equal(r.status,400);
   r=await req('/api/favorite',{gameId:'iron-fortune'});assert.ok(r.data.player.favorites.includes('iron-fortune'));
   r=await req('/api/spin',{gameId:'iron-fortune',bet:20});assert.equal(r.status,200);assert.equal(r.data.player.spins,1);assert.equal(r.data.grid.length,3);assert.equal(r.data.grid[0].length,5);assert.ok(Number.isInteger(r.data.player.credits));
   r=await req('/api/spin',{gameId:'iron-fortune',bet:-20});assert.equal(r.status,400);
   r=await req('/api/spin',{gameId:'nonexistent',bet:20});assert.equal(r.status,400);
   r=await req('/api/history');assert.equal(r.status,200);assert.ok(r.data.history.length>=3);
   r=await req('/api/leaderboard');assert.equal(r.status,200);assert.equal(r.data.leaderboard[0].name,'GachiTester');
   r=await req('/api/settings/limit',{limit:1000});assert.equal(r.status,200);
   r=await req('/api/settings/cooloff',{hours:1});assert.equal(r.status,200);
   r=await req('/api/spin',{gameId:'iron-fortune',bet:20});assert.equal(r.status,403);
   r=await req('/api/auth/logout',{});assert.equal(r.status,200);
   r=await req('/api/me');assert.equal(r.status,401);
   r=await req('/api/auth/login',{name:'GachiTester',password:'strong-demo-password'});assert.equal(r.status,200);
   r=await req('/api/me');assert.equal(r.data.player.name,'GachiTester');
   r=await req('/');assert.equal(r.status,200);assert.ok(r.data.includes('GACHINO'));
   r=await req('/app.js');assert.equal(r.status,200);assert.ok(r.data.includes('spinGame'));
 }finally{await new Promise(resolve=>server.close(resolve));fs.rmSync(temp,{recursive:true,force:true});}
});
