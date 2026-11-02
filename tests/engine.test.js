'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {GAMES,SYMBOLS,LINES,generateGrid,evaluateGrid,spin}=require('../src/engine');
test('All 12 Gachino slots are distinct and thematic',()=>{
 assert.equal(GAMES.length,12);assert.equal(new Set(GAMES.map(g=>g.id)).size,12);
 for(const g of GAMES)assert.ok(g.id&&g.name&&g.label&&g.description&&g.kind);
 assert.equal(LINES.length,20);assert.equal(SYMBOLS.length,9);
});
test('Every generated grid contains 3 rows and 5 legal symbols',()=>{
 for(const game of GAMES){const grid=generateGrid(game.id);assert.equal(grid.length,3);for(const row of grid){assert.equal(row.length,5);for(const symbol of row)assert.ok(SYMBOLS.some(s=>s.id===symbol));}}
});
test('Payout math works on paylines and provides bonus spins for three scatters',()=>{
 const grid=[['SCATTER','SHAKER','SHAKER','SHAKER','CROWN'],['CROWN','CROWN','CROWN','CROWN','CROWN'],['SCATTER','SCATTER','FLEX','FLEX','FLEX']];
 const result=evaluateGrid(grid,100);
 assert.ok(result.win>0);assert.equal(result.scatters,3);assert.equal(result.freeSpins,5);assert.equal(result.jackpot,true);
 assert.ok(result.wins.some(w=>w.count===5&&w.symbol==='CROWN'));
});
test('Spin rejects illegal bet and missing game',()=>{
 for(const bad of [0,19,21,1001,42.5,-100,NaN,Infinity])assert.throws(()=>spin('iron-fortune',bad));
 assert.throws(()=>spin('nonexistent',100));
 assert.doesNotThrow(()=>spin('iron-fortune',20));
});
test('Wild substitute matches line left to right',()=>{
 const grid=[['FLEX','CHAIN','FLEX','CHAIN','FLEX'],['WILD','WILD','BELT','BELT','BELT'],['CHAIN','CHAIN','FLEX','FLEX','FLEX']];
 const r=evaluateGrid(grid,200);
 assert.ok(r.wins.some(w=>w.line===1&&w.symbol==='BELT'&&w.count===5));
});
