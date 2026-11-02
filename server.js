'use strict';
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {GAMES,SYMBOLS,LINES,spin}=require('./src/engine');
const store=require('./src/store');
store.load();

const PORT=Number(process.env.PORT||3000);
const HOST=process.env.HOST||'127.0.0.1';
const publicDir=path.resolve(__dirname,'public');
const sessionLength=7*24*60*60*1000;
const rates=new Map();
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.webp':'image/webp','.ico':'image/x-icon'};
function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));}
function error(status,message){const e=new Error(message);e.status=status;throw e;}
function hash(s){return crypto.createHash('sha256').update(s).digest('hex');}
function hashPassword(pwd){const salt=crypto.randomBytes(16).toString('hex');const val=crypto.scryptSync(pwd,salt,64).toString('hex');return salt+':'+val;}
function checkPassword(pwd,stored){if(!stored)return false;const [salt,correct]=stored.split(':');if(!salt||!correct)return false;const a=crypto.scryptSync(pwd,salt,64);const b=Buffer.from(correct,'hex');return a.length===b.length && crypto.timingSafeEqual(a,b);}
function cookies(req){return Object.fromEntries((req.headers.cookie||'').split(';').map(x=>x.trim().split('=')).filter(x=>x.length===2));}
function getPlayer(req){const token=cookies(req).gachino_session;if(!token || !/^[a-f\d]{64}$/.test(token))return null;const session=store.db().sessions[hash(token)];if(!session||session.expires<Date.now())return null;return store.db().players[session.playerId]||null;}
function requirePlayer(req){const p=getPlayer(req);if(!p)error(401,'Войдите в аккаунт или начните гостевую игру');return p;}
function issueSession(req,res,player){const raw=crypto.randomBytes(32).toString('hex');store.db().sessions[hash(raw)]={playerId:player.id,expires:Date.now()+sessionLength};store.persist();const secure=req.socket.encrypted || process.env.SECURE_COOKIES==='1';res.setHeader('Set-Cookie',`gachino_session=${raw}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(sessionLength/1000)}${secure?'; Secure':''}`);}
function clearSession(req,res){const token=cookies(req).gachino_session;if(token)delete store.db().sessions[hash(token)];store.persist();res.setHeader('Set-Cookie','gachino_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');}
function throttle(req,key,limit,interval=60000){const ip=req.socket.remoteAddress||'local';const id=ip+'|'+key;const now=Date.now();const info=rates.get(id)||{since:now,count:0};if(now-info.since>interval){info.since=now;info.count=0;}info.count++;rates.set(id,info);if(info.count>limit)error(429,'Слишком много запросов. Попробуйте позже.');if(rates.size>5000){for(const [k,v] of rates) if(now-v.since>interval) rates.delete(k);}}
function readJSON(req){return new Promise((resolve,reject)=>{if(!(req.headers['content-type']||'').startsWith('application/json'))return reject(Object.assign(new Error('Требуется application/json'),{status:415}));let raw='';req.on('data',ch=>{raw+=ch;if(raw.length>8192){req.destroy();reject(Object.assign(new Error('Слишком большой запрос'),{status:413}));}});req.on('end',()=>{try{resolve(JSON.parse(raw||'{}'));}catch{reject(Object.assign(new Error('Неверный JSON'),{status:400}));}});req.on('error',reject);});}
function checkOrigin(req){const origin=req.headers.origin;if(origin){let from;try{from=new URL(origin);}catch{error(403,'Неверный origin');}if(from.host!==req.headers.host)error(403,'Запрос с другого сайта заблокирован');}}
function addCredits(player,amount,reason,extra={}){if(!Number.isSafeInteger(amount)||amount<0)error(500,'Ошибка начисления');player.credits+=amount;store.addHistory(player.id,{type:'bonus',amount,reason,...extra});store.persist();}
const missions=[{id:'first5',title:'Разогрев',description:'Сыграть 5 спинов',target:5,field:'spins',reward:200},{id:'fighter25',title:'Железная дисциплина',description:'Сыграть 25 спинов',target:25,field:'spins',reward:600},{id:'winner5',title:'Первые победы',description:'Выиграть 5 раз',target:5,field:'sessionWins',reward:350},{id:'highroller',title:'Стальной марафон',description:'Сделать ставок на 5 000 кредитов',target:5000,field:'wagered',reward:500}];
const ranking=()=>store.leaderboard();
function basePayload(p){return {player:store.publicPlayer(p),jackpot:store.db().jackpot};}
async function api(req,res,url){
  const method=req.method;const pathname=url.pathname;
  if(method==='GET'&&pathname==='/api/health')return json(res,200,{ok:true,mode:'virtual-credits-demo',version:'1.0.0'});
  if(method==='GET'&&pathname==='/api/bootstrap')return json(res,200,{games:GAMES,symbols:SYMBOLS,lines:LINES.length,missions,leaderboard:ranking(),jackpot:store.db().jackpot,player:getPlayer(req)?store.publicPlayer(getPlayer(req)):null,mode:'demo'});
  if(method==='GET'&&pathname==='/api/me')return json(res,200,basePayload(requirePlayer(req)));
  if(method==='GET'&&pathname==='/api/history')return json(res,200,{history:store.historyFor(requirePlayer(req).id)});
  if(method==='GET'&&pathname==='/api/leaderboard')return json(res,200,{leaderboard:ranking()});
  if(method!=='POST')error(404,'Эндпоинт не найден');
  checkOrigin(req);
  const body=await readJSON(req);
  if(pathname==='/api/auth/guest'){
    throttle(req,'guest',8,60000);
    const suffix=crypto.randomInt(10000,99999);const player=store.makePlayer('GachiGuest'+suffix);
    issueSession(req,res,player);return json(res,200,basePayload(player));
  }
  if(pathname==='/api/auth/register'){
    throttle(req,'register',8,60000);
    const name=String(body.name||'').trim();const pass=String(body.password||'');
    if(!/^[\p{L}\p{N}_]{3,22}$/u.test(name))error(400,'Имя: 3–22 символа (буквы, цифры, _)');
    if(pass.length<8||pass.length>128)error(400,'Пароль: от 8 до 128 символов');
    if(Object.values(store.db().players).some(p=>p.name.toLowerCase()===name.toLowerCase()))error(409,'Имя уже занято');
    const player=store.makePlayer(name,hashPassword(pass));issueSession(req,res,player);return json(res,200,basePayload(player));
  }
  if(pathname==='/api/auth/login'){
    throttle(req,'login',12,60000);
    const name=String(body.name||'').trim();const pass=String(body.password||'');
    const player=Object.values(store.db().players).find(p=>p.name.toLowerCase()===name.toLowerCase());
    if(!player || !checkPassword(pass,player.passwordHash))error(401,'Неверное имя или пароль');
    issueSession(req,res,player);return json(res,200,basePayload(player));
  }
  if(pathname==='/api/auth/logout'){clearSession(req,res);return json(res,200,{ok:true});}
  const player=requirePlayer(req);
  if(pathname==='/api/spin'){
    throttle(req,'spin',150,60000);
    const gameId=String(body.gameId||'');const bet=Number(body.bet);
    if(!GAMES.some(g=>g.id===gameId))error(400,'Игра не найдена');
    if(!Number.isSafeInteger(bet)||bet<20||bet>1000||bet%20!==0)error(400,'Ставка: 20–1000, кратно 20');
    if(player.coolOffUntil>Date.now())error(403,'Активирован перерыв в игре');
    const free=Number(player.freeSpins[gameId]||0)>0;
    const effectiveBet=free?(player.freeSpinBets?.[gameId]||player.lastBets?.[gameId]||bet):bet;
    if(!free && player.credits<bet)error(400,'Недостаточно виртуальных кредитов');
    const today=new Date().toISOString().slice(0,10);
    if(player.dailyWager.day!==today)player.dailyWager={day:today,total:0};
    if(!free && player.dailyWager.total+bet>player.dailyLimit)error(403,'Достигнут дневной лимит ставок');
    // All randomness and payouts are determined on the server, never the browser.
    const result=spin(gameId,effectiveBet);
    if(free)player.freeSpins[gameId]--;else {player.credits-=bet;player.wagered+=bet;player.dailyWager.total+=bet;store.db().jackpot+=Math.max(1,Math.round(bet/100));}
    let jackpotWin=0;
    if(result.jackpot){jackpotWin=store.db().jackpot;store.db().jackpot=25000;}
    const totalWin=result.win+jackpotWin;
    player.credits+=totalWin;player.won+=totalWin;player.spins++;
    if(totalWin>0)player.sessionWins++;
    player.biggestWin=Math.max(player.biggestWin,totalWin);
    player.freeSpins[gameId]=(player.freeSpins[gameId]||0)+result.freeSpins;
    player.freeSpinBets=player.freeSpinBets||{};
    if(result.freeSpins && !free)player.freeSpinBets[gameId]=bet;
    if(!free)player.lastBets[gameId]=bet;
    store.addHistory(player.id,{type:'spin',gameId,bet:effectiveBet,free,amount:totalWin,lines:result.wins.length,scatters:result.scatters,jackpotWin});
    store.persist();
    return json(res,200,{...result,jackpotWin,totalWin,betApplied:effectiveBet,freeSpinUsed:free,...basePayload(player)});
  }
  if(pathname==='/api/bonus/daily'){
    if(Date.now()-player.lastDaily<24*60*60*1000)error(400,'Ежедневный бонус уже получен');
    player.lastDaily=Date.now();addCredits(player,500,'Ежедневный бонус');return json(res,200,basePayload(player));
  }
  if(pathname==='/api/bonus/promo'){
    throttle(req,'promo',20,60000);
    const code=String(body.code||'').trim().toUpperCase();if(code!=='GACHINO')error(400,'Промокод не найден');
    if(player.promoCodes.includes(code))error(400,'Промокод уже использован');
    player.promoCodes.push(code);addCredits(player,750,'Промокод GACHINO');return json(res,200,basePayload(player));
  }
  if(pathname==='/api/missions/claim'){
    const mission=missions.find(m=>m.id===body.id);if(!mission)error(404,'Миссия не найдена');
    if(player.missionsClaimed.includes(mission.id))error(400,'Награда уже получена');
    if((player[mission.field]||0)<mission.target)error(400,'Миссия ещё не выполнена');
    player.missionsClaimed.push(mission.id);addCredits(player,mission.reward,'Миссия: '+mission.title);return json(res,200,basePayload(player));
  }
  if(pathname==='/api/favorite'){
    if(!GAMES.some(g=>g.id===body.gameId))error(404,'Игра не найдена');
    const idx=player.favorites.indexOf(body.gameId);if(idx===-1)player.favorites.push(body.gameId);else player.favorites.splice(idx,1);
    store.persist();return json(res,200,basePayload(player));
  }
  if(pathname==='/api/settings/limit'){
    const limit=Number(body.limit);if(!Number.isSafeInteger(limit)||limit<1000||limit>100000)error(400,'Лимит: от 1 000 до 100 000 кредитов');
    if(limit>player.dailyLimit && Date.now()-(player.lastLimitIncrease||0)<24*60*60*1000)error(400,'Увеличение лимита возможно раз в 24 часа');
    if(limit>player.dailyLimit)player.lastLimitIncrease=Date.now();player.dailyLimit=limit;store.persist();return json(res,200,basePayload(player));
  }
  if(pathname==='/api/settings/cooloff'){
    const hours=Number(body.hours);if(![1,24,168].includes(hours))error(400,'Выберите 1, 24 или 168 часов');
    player.coolOffUntil=Math.max(player.coolOffUntil,Date.now()+hours*3600000);store.persist();return json(res,200,basePayload(player));
  }
  error(404,'Эндпоинт не найден');
}
function staticFile(req,res,url){
  if(req.method!=='GET'&&req.method!=='HEAD')return error(405,'Метод не разрешён');
  let filepath;try{filepath=decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname);}catch{error(400,'Неверный путь');}
  const full=path.resolve(publicDir,'.'+filepath);
  if(full!==publicDir&&!full.startsWith(publicDir+path.sep))error(403,'Доступ запрещён');
  fs.stat(full,(err,stat)=>{
    if(err||!stat.isFile()){res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});return res.end('404 Not Found');}
    res.writeHead(200,{'Content-Type':types[path.extname(full)]||'application/octet-stream','Content-Length':stat.size,'X-Content-Type-Options':'nosniff','Cache-Control':full.endsWith('.html')?'no-cache':'public, max-age=3600','Content-Security-Policy':"default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",'Referrer-Policy':'no-referrer','X-Frame-Options':'DENY'});
    if(req.method==='HEAD')return res.end();fs.createReadStream(full).pipe(res);
  });
}
const server=http.createServer(async(req,res)=>{
  try{const url=new URL(req.url,'http://localhost');if(url.pathname.startsWith('/api/'))await api(req,res,url);else staticFile(req,res,url);}catch(err){if(!res.headersSent)json(res,err.status||500,{error:err.status?err.message:'Ошибка сервера'});else res.end();if(!err.status)console.error(err);}
});
if(require.main===module){server.listen(PORT,HOST,()=>console.log(`Gachino demo: http://${HOST}:${PORT}`));}
module.exports={server};
