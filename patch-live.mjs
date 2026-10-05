import fs from 'node:fs';

const replacements = [
  {
    file: 'game-v14-8.txt',
    old: "function demo(dt){state.auto+=dt;if(state.auto>7){state.auto=0;const t=Math.random()<.5?'red':'blue', n=pick(names), ev=pick(['soldier','knight','archers',Math.random()<.35?'giant':'soldier',Math.random()<.18?'tank':Math.random()<.25?'meteor':'soldier']);special(ev,t,n)} const ra=state.units.filter(u=>u.team==='red'&&!u.dead).length, ba=state.units.filter(u=>u.team==='blue'&&!u.dead).length; if(ra<5)spawn('red',Math.random()<.25?'archer':'soldier'); if(ba<5)spawn('blue',Math.random()<.25?'archer':'soldier')}",
    next: "function demo(dt){/* LIVE mode: automatic/random demo spawns disabled. */}"
  },
  {
    file: 'game-v14-5.txt',
    old: "function reset(){state.redHp=MAX_HP;state.blueHp=MAX_HP;state.redScore=0;state.blueScore=0;state.seconds=1800;state.battleNo++;state.ended=false;state.units=[];state.projectiles=[];state.particles=[];state.bursts=[];state.effects=[];state.attacks=[];state.boss=null;state.shake=0; for(let i=0;i<5;i++){spawn('red','soldier');spawn('blue','soldier')} spawn('red','knight');spawn('blue','knight'); updateHud()}",
    next: "function reset(){state.redHp=MAX_HP;state.blueHp=MAX_HP;state.redScore=0;state.blueScore=0;state.seconds=1800;state.battleNo++;state.ended=false;state.units=[];state.projectiles=[];state.particles=[];state.bursts=[];state.effects=[];state.attacks=[];state.boss=null;state.shake=0;updateHud()}"
  }
];

for (const { file, old, next } of replacements) {
  let text = fs.readFileSync(file, 'utf8');
  if (text.includes(next)) {
    console.log(`[live] ${file} already patched`);
    continue;
  }
  if (!text.includes(old)) {
    throw new Error(`[live] Expected demo code not found in ${file}; refusing to patch blindly.`);
  }
  text = text.replace(old, next);
  fs.writeFileSync(file, text, 'utf8');
  console.log(`[live] ${file} patched: random/demo spawns disabled`);
}
