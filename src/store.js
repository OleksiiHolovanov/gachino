'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const dataFile=process.env.GACHINO_DATA_FILE || path.join(__dirname,'../data/casino.json');
const defaultData=()=>({players:{},sessions:{},history:[],jackpot:25000,nextHistoryId:1});
let state;
function load() {
  fs.mkdirSync(path.dirname(dataFile),{recursive:true});
  if (!fs.existsSync(dataFile)) {state=defaultData();persist();}
  else {try {state=JSON.parse(fs.readFileSync(dataFile,'utf8'));} catch(err) {throw new Error('Повреждён файл данных. Восстановите резервную копию: '+err.message);}}
  return state;
}
function persist() {
  const tmp=dataFile+'.'+process.pid+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify(state,null,2),{mode:0o600});
  fs.renameSync(tmp,dataFile);
}
function db() {return state||load();}
function makePlayer(name,passwordHash=null) {
  const id=crypto.randomUUID();
  const player={id,name,passwordHash,createdAt:Date.now(),credits:5000,spins:0,won:0,wagered:0,biggestWin:0,freeSpins:{},freeSpinBets:{},favorites:[],lastDaily:0,promoCodes:[],missionsClaimed:[],lastBets:{},dailyWager:{day:'',total:0},dailyLimit:20000,coolOffUntil:0,sessionWins:0};
  db().players[id]=player;persist();return player;
}
function publicPlayer(p) {
  const {passwordHash,...safe}=p;
  const today=new Date().toISOString().slice(0,10);
  return {...safe,dailyWagerToday:p.dailyWager?.day===today?p.dailyWager.total:0};
}
function historyFor(playerId,limit=50){return db().history.filter(x=>x.playerId===playerId).slice(0,limit).map(({playerId,...rest})=>rest);}
function addHistory(playerId,item){const entry={id:db().nextHistoryId++,playerId,at:Date.now(),...item};db().history.unshift(entry);if(db().history.length>2500)db().history.length=2500;}
function leaderboard(){return Object.values(db().players).map(p=>({name:p.name,spins:p.spins,wagered:p.wagered,won:p.won,biggestWin:p.biggestWin})).sort((a,b)=>b.won-a.won).slice(0,10);}
module.exports={load,db,persist,makePlayer,publicPlayer,historyFor,addHistory,leaderboard};
