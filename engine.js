// Client-side slot engine for GitHub Pages. Virtual/demo credits only.
// The JS algorithm and localStorage can be edited by visitors; no real-money use.
'use strict';
(function(){
function randomInt(max){
  if (!Number.isSafeInteger(max) || max<=0) throw new RangeError('max');
  if (window.crypto && window.crypto.getRandomValues) {
    const uint=new Uint32Array(1),range=0x100000000,limit=Math.floor(range/max)*max;
    do { window.crypto.getRandomValues(uint); } while (uint[0]>=limit);
    return uint[0]%max;
  }
  return Math.floor(Math.random()*max); // only an offline demo fallback
}
const GAMES = [
  {id:'iron-fortune',name:'Iron Fortune',label:'Железная удача',tag:'NEW',kind:'new',volatility:'Высокая',accent:'#e8b46c',description:'Сила железа, цепей и золотых корон.'},
  {id:'locker-room-luck',name:'Locker Room Luck',label:'Удача раздевалки',tag:'HOT',kind:'popular',volatility:'Средняя',accent:'#fd64cb',description:'Секреты легендарной раздевалки.'},
  {id:'barbell-bonanza',name:'Barbell Bonanza',label:'Штанга удачи',tag:'POPULAR',kind:'popular',volatility:'Средняя',accent:'#56bbff',description:'Чем тяжелее штанга, тем ярче победа.'},
  {id:'protein-rush',name:'Protein Rush',label:'Протеиновый рывок',tag:'BONUS',kind:'bonus',volatility:'Низкая',accent:'#f78bd9',description:'Шейк, энергия и бесплатные спины.'},
  {id:'ring-of-power',name:'Ring of Power',label:'Ринг силы',tag:'JACKPOT',kind:'jackpot',volatility:'Высокая',accent:'#ffcb6d',description:'Завоюй пояс чемпиона.'},
  {id:'leather-legend',name:'Leather Legend',label:'Кожаная легенда',tag:'HOT',kind:'popular',volatility:'Средняя',accent:'#b89cff',description:'Триумф неоновых легенд.'},
  {id:'dungeon-spin',name:'Dungeon Spin',label:'Спин подземелья',tag:'BONUS',kind:'bonus',volatility:'Высокая',accent:'#ec6fc8',description:'Цепи, ключи и секретные награды.'},
  {id:'flex-empire',name:'Flex Empire',label:'Империя мышц',tag:'NEW',kind:'new',volatility:'Высокая',accent:'#e6b962',description:'Построй империю стальных бицепсов.'},
  {id:'shaker-storm',name:'Shaker Storm',label:'Шторм шейкеров',tag:'NEW',kind:'new',volatility:'Низкая',accent:'#5eceff',description:'Энергетический шторм в зале.'},
  {id:'crown-of-gains',name:'Crown of Gains',label:'Корона качалки',tag:'JACKPOT',kind:'jackpot',volatility:'Высокая',accent:'#ffe08d',description:'Корона достанется сильнейшему.'},
  {id:'gym-glory',name:'Gym Glory',label:'Слава качалки',tag:'POPULAR',kind:'popular',volatility:'Средняя',accent:'#ecb86c',description:'Заслужи славу легенды спортзала.'},
  {id:'giga-jackpot',name:'Giga Jackpot',label:'Гига-джекпот',tag:'JACKPOT',kind:'jackpot',volatility:'Очень высокая',accent:'#ffbc51',description:'Грандиозный куш для короля зала.'}
];
const SYMBOLS = [
  {id:'FLEX',emoji:'💪',name:'Бицепс',weight:19,pay:[0,0,0,12,28,80]},
  {id:'BARBELL',emoji:'🏋️',name:'Штанга',weight:17,pay:[0,0,0,12,32,96]},
  {id:'SHAKER',emoji:'🥤',name:'Шейкер',weight:17,pay:[0,0,0,8,24,72]},
  {id:'CHAIN',emoji:'⛓️',name:'Цепь',weight:15,pay:[0,0,0,16,36,104]},
  {id:'BOOTS',emoji:'🥾',name:'Ботинки',weight:14,pay:[0,0,0,16,40,120]},
  {id:'BELT',emoji:'🏆',name:'Пояс чемпиона',weight:10,pay:[0,0,0,24,60,160]},
  {id:'CROWN',emoji:'👑',name:'Корона',weight:7,pay:[0,0,0,32,80,280]},
  {id:'WILD',emoji:'⭐',name:'WILD',weight:4,pay:[0,0,0,40,120,400]},
  {id:'SCATTER',emoji:'⚡',name:'SCATTER',weight:5,pay:[0,0,0,0,0,0]}
];
// Each payline chooses the row (0,1,2) of each of the five reels.
const LINES = [
  [1,1,1,1,1],[0,0,0,0,0],[2,2,2,2,2],
  [0,1,2,1,0],[2,1,0,1,2],
  [0,0,1,0,0],[2,2,1,2,2],[1,0,0,0,1],[1,2,2,2,1],
  [0,1,1,1,0],[2,1,1,1,2],[1,0,1,0,1],[1,2,1,2,1],
  [0,1,0,1,0],[2,1,2,1,2],[0,0,1,2,2],[2,2,1,0,0],
  [1,1,0,1,1],[1,1,2,1,1],[0,2,0,2,0]
];
const symbolMap = Object.fromEntries(SYMBOLS.map(s => [s.id,s]));
function selectSymbol(gameId, rng=randomInt) {
  const game = GAMES.find(g => g.id===gameId);
  const increaseScatter = ['bonus','new'].includes(game?.kind) ? 2 : 0;
  const increaseCrown = game?.kind==='jackpot' ? 2 : 0;
  const weights = SYMBOLS.map(s => s.weight + (s.id==='SCATTER'? increaseScatter:0) + (s.id==='CROWN'?increaseCrown:0));
  let choice = rng(weights.reduce((a,b)=>a+b,0));
  for (let i=0;i<SYMBOLS.length;i++) {choice-=weights[i];if(choice<0) return SYMBOLS[i].id;}
  return 'FLEX';
}
function generateGrid(gameId, rng=randomInt) {
  return Array.from({length:3},()=>Array.from({length:5},()=>selectSymbol(gameId,rng)));
}
function evaluateGrid(grid,bet) {
  const lineBet=bet/LINES.length;
  let paid=0;
  const wins=[];
  for (let i=0;i<LINES.length;i++) {
    const line = LINES[i].map((row,col)=>grid[row][col]);
    let target=line.find(s=>s!=='WILD') || 'WILD';
    if (target==='SCATTER') continue;
    let count=0;
    for (const s of line) {if(s===target || s==='WILD') count++; else break;}
    // A leading wild can substitute for later symbols, but never for a scatter.
    if (count>=3) {
      const multiplier=symbolMap[target].pay[count];
      if (multiplier>0) {const amount=Math.round(multiplier*lineBet);paid+=amount;wins.push({line:i+1,symbol:target,count,amount});}
    }
  }
  const scatters=grid.flat().filter(s=>s==='SCATTER').length;
  const freeSpins=scatters>=5?12:scatters===4?8:scatters===3?5:0;
  const scatterReward=scatters>=3?Math.round(bet*(scatters===3?2:scatters===4?5:12)):0;
  paid+=scatterReward;
  // An extremely rare jackpot: all five centers must be crowns (not wilds).
  const jackpot = grid[1].every(s=>s==='CROWN');
  return {win:paid, wins, scatters,freeSpins,scatterReward,jackpot};
}
function spin(gameId, bet, rng=randomInt) {
  if (!GAMES.some(g=>g.id===gameId)) throw new Error('Игра не найдена');
  if (!Number.isSafeInteger(bet) || bet<20 || bet>1000 || bet%20!==0) throw new Error('Ставка: от 20 до 1000, кратно 20');
  const grid=generateGrid(gameId,rng);
  return {...evaluateGrid(grid,bet),grid};
}
window.GachinoMath={GAMES,SYMBOLS,LINES,randomInt,generateGrid,evaluateGrid,spin};
})();
