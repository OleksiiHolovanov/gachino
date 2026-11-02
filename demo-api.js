/*
 * GACHINO — GitHub Pages edition.
 * In-browser virtual-credit simulation. No backend, secure accounts,
 * cross-device multiplayer, shared leaderboard, payments or real value.
 * Anyone can inspect and edit these files or localStorage.
 */
'use strict';
(function () {
  const { GAMES, SYMBOLS, spin, randomInt } = window.GachinoMath;
  const STORAGE_KEY = 'gachino_pages_demo_v1';
  const START_CREDITS = 5000;
  const DAY_MS = 24 * 60 * 60 * 1000;
  const MISSIONS = [
    { id:'first5', title:'Разогрев', description:'Сыграть 5 спинов', target:5, field:'spins', reward:200 },
    { id:'fighter25', title:'Железная дисциплина', description:'Сыграть 25 спинов', target:25, field:'spins', reward:600 },
    { id:'winner5', title:'Первые победы', description:'Выиграть 5 раз', target:5, field:'sessionWins', reward:350 },
    { id:'highroller', title:'Стальной марафон', description:'Сделать ставок на 5 000 кредитов', target:5000, field:'wagered', reward:500 }
  ];
  function freshDb() { return { version:1, profiles:{}, activeId:null, history:[], jackpot:25000, nextHistoryId:1 }; }
  function readDb() {
    let raw;
    try { raw = localStorage.getItem(STORAGE_KEY); } catch { throw new Error('Разрешите локальное хранение данных в браузере'); }
    if (!raw) return freshDb();
    let data;
    try { data = JSON.parse(raw); } catch { throw new Error('Локальные данные повреждены. Очистите данные Gachino в браузере.'); }
    if (!data || data.version!==1 || typeof data.profiles!=='object' || !Array.isArray(data.history)) {
      throw new Error('Неподдерживаемый формат локальных данных');
    }
    return data;
  }
  function saveDb(data) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
    catch { throw new Error('Не удалось сохранить игру. Возможно, хранилище браузера заполнено.'); }
  }
  function active(db) { return db.activeId ? (db.profiles[db.activeId] || null) : null; }
  function requirePlayer(db) {
    const p = active(db);
    if (!p) throw new Error('Создай локальный профиль или начни гостевую игру');
    return p;
  }
  function publicPlayer(p) {
    if (!p) return null;
    const clone = JSON.parse(JSON.stringify(p));
    const today = new Date().toISOString().slice(0,10);
    clone.dailyWagerToday = p.dailyWager?.day===today ? p.dailyWager.total : 0;
    return clone;
  }
  function payload(db) { return { player: publicPlayer(active(db)), jackpot: db.jackpot }; }
  function leaderboard(db) {
    return Object.values(db.profiles).map(p=>({name:p.name,spins:p.spins,won:p.won,wagered:p.wagered,biggestWin:p.biggestWin}))
      .sort((a,b)=>b.won-a.won).slice(0,10);
  }
  function newPlayer(name) {
    const id = 'local-' + Date.now().toString(36) + '-' + randomInt(999999).toString(36);
    return { id, name, createdAt:Date.now(), credits:START_CREDITS, spins:0, won:0, wagered:0,
      biggestWin:0, freeSpins:{}, freeSpinBets:{}, favorites:[], lastDaily:0,
      promoCodes:[], missionsClaimed:[], lastBets:{}, dailyWager:{day:'',total:0},
      dailyLimit:20000, lastLimitIncrease:0, coolOffUntil:0, sessionWins:0 };
  }
  function addHistory(db,p,item) {
    db.history.unshift({id:db.nextHistoryId++,playerId:p.id,at:Date.now(),...item});
    if (db.history.length>500) db.history.length=500;
  }
  function addCredits(db,p,amount,reason) {
    p.credits+=amount;
    addHistory(db,p,{type:'bonus',amount,reason});
  }
  function fail(message) { throw new Error(message); }
  function claimName(body) {
    const name = String(body?.name || '').trim();
    if (!/^[\p{L}\p{N}_]{3,22}$/u.test(name)) fail('Имя: 3–22 символа (буквы, цифры, _)');
    return name;
  }
  function gameExists(id) { return GAMES.some(g=>g.id===id); }

  function api(path,body={}) {
    const db=readDb();
    if (path==='bootstrap') return {
      games:GAMES, symbols:SYMBOLS, missions:MISSIONS, leaderboard:leaderboard(db),
      jackpot:db.jackpot, player:publicPlayer(active(db)), mode:'local-demo'
    };
    if (path==='leaderboard') return { leaderboard:leaderboard(db) };
    if (path==='history') {
      const p=requirePlayer(db);
      return {history:db.history.filter(x=>x.playerId===p.id).slice(0,50).map(({playerId,...x})=>x)};
    }
    if (path==='auth/guest') {
      const p=newPlayer('GachiGuest'+(10000+randomInt(90000)));
      db.profiles[p.id]=p; db.activeId=p.id; saveDb(db); return payload(db);
    }
    if (path==='auth/register') {
      const name=claimName(body);
      if (Object.values(db.profiles).some(p=>p.name.toLowerCase()===name.toLowerCase())) fail('Локальный профиль с таким именем уже существует');
      const p=newPlayer(name);
      db.profiles[p.id]=p; db.activeId=p.id; saveDb(db); return payload(db);
    }
    if (path==='auth/login') {
      const name=claimName(body);
      const p=Object.values(db.profiles).find(p=>p.name.toLowerCase()===name.toLowerCase());
      if (!p) fail('Такого локального профиля нет в этом браузере. Создай новый.');
      db.activeId=p.id; saveDb(db); return payload(db);
    }
    if (path==='auth/logout') { db.activeId=null; saveDb(db); return {ok:true}; }

    const p=requirePlayer(db);
    if (path==='spin') {
      const gameId=String(body.gameId||'');
      const bet=Number(body.bet);
      if (!gameExists(gameId)) fail('Игра не найдена');
      if (!Number.isSafeInteger(bet)||bet<20||bet>1000||bet%20!==0) fail('Ставка: от 20 до 1000, кратно 20');
      if (p.coolOffUntil>Date.now()) fail('Сейчас действует добровольный перерыв в игре');
      const free=(p.freeSpins[gameId]||0)>0;
      const effectiveBet=free?(p.freeSpinBets[gameId]||p.lastBets[gameId]||bet):bet;
      if (!free&&p.credits<bet) fail('Недостаточно виртуальных кредитов');
      const today=new Date().toISOString().slice(0,10);
      if (p.dailyWager.day!==today) p.dailyWager={day:today,total:0};
      if (!free && p.dailyWager.total+bet>p.dailyLimit) fail('Достигнут дневной лимит виртуальных ставок');
      const result=spin(gameId,effectiveBet);
      if (free) p.freeSpins[gameId]--;
      else {
        p.credits-=bet;
        p.wagered+=bet;
        p.dailyWager.total+=bet;
        db.jackpot+=Math.max(1,Math.round(bet/100));
      }
      let jackpotWin=0;
      if (result.jackpot) { jackpotWin=db.jackpot; db.jackpot=25000; }
      const totalWin=result.win+jackpotWin;
      p.credits+=totalWin; p.won+=totalWin; p.spins++;
      if (totalWin>0) p.sessionWins++;
      p.biggestWin=Math.max(p.biggestWin,totalWin);
      p.freeSpins[gameId]=(p.freeSpins[gameId]||0)+result.freeSpins;
      if (result.freeSpins&&!free) p.freeSpinBets[gameId]=bet;
      if (!free) p.lastBets[gameId]=bet;
      addHistory(db,p,{type:'spin',gameId,bet:effectiveBet,free,amount:totalWin,
        lines:result.wins.length,scatters:result.scatters,jackpotWin});
      saveDb(db);
      return {...result,jackpotWin,totalWin,betApplied:effectiveBet,freeSpinUsed:free,...payload(db)};
    }
    if (path==='bonus/daily') {
      if (Date.now()-p.lastDaily<DAY_MS) fail('Ежедневный бонус уже получен');
      p.lastDaily=Date.now(); addCredits(db,p,500,'Ежедневный бонус');
    } else if (path==='bonus/promo') {
      const code=String(body.code||'').trim().toUpperCase();
      if (code!=='GACHINO') fail('Промокод не найден');
      if (p.promoCodes.includes(code)) fail('Промокод уже использован');
      p.promoCodes.push(code); addCredits(db,p,750,'Промокод GACHINO');
    } else if (path==='missions/claim') {
      const m=MISSIONS.find(m=>m.id===body.id);
      if (!m) fail('Миссия не найдена');
      if (p.missionsClaimed.includes(m.id)) fail('Награда уже получена');
      if ((p[m.field]||0)<m.target) fail('Миссия пока не выполнена');
      p.missionsClaimed.push(m.id); addCredits(db,p,m.reward,'Миссия: '+m.title);
    } else if (path==='favorite') {
      if (!gameExists(body.gameId)) fail('Игра не найдена');
      const idx=p.favorites.indexOf(body.gameId);
      if (idx===-1) p.favorites.push(body.gameId); else p.favorites.splice(idx,1);
    } else if (path==='settings/limit') {
      const limit=Number(body.limit);
      if (!Number.isSafeInteger(limit)||limit<1000||limit>100000) fail('Лимит: от 1000 до 100000 GC');
      if (limit>p.dailyLimit&&Date.now()-(p.lastLimitIncrease||0)<DAY_MS) fail('Увеличение лимита возможно раз в 24 часа');
      if (limit>p.dailyLimit) p.lastLimitIncrease=Date.now();
      p.dailyLimit=limit;
    } else if (path==='settings/cooloff') {
      const hours=Number(body.hours);
      if (![1,24,168].includes(hours)) fail('Выберите 1, 24 или 168 часов');
      p.coolOffUntil=Math.max(p.coolOffUntil,Date.now()+hours*3600000);
    } else { fail('Неизвестная команда демоверсии'); }
    saveDb(db);
    return payload(db);
  }
  window.GachinoDemo={api};
})();
