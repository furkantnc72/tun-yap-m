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

const combatFile = 'game-v14-8.txt';
let combatText = fs.readFileSync(combatFile, 'utf8');
const trailer = 'renderBoard(); reset(); requestAnimationFrame(loop);';

const combatMarker = '/* LIVE_COMBAT_V2 */';
if (!combatText.includes(combatMarker)) {
  if (!combatText.includes(trailer)) {
    throw new Error('[live] Combat patch insertion point not found; refusing to patch blindly.');
  }

  const combatPatch = String.raw`
/* LIVE_COMBAT_V2 */
const LIVE_COMBAT_LANE=105;

function liveCombatTargetValid(u,t){
  if(!t||t.dead||t.hp<=0)return false;
  if(t===state.boss)return !!state.boss&&state.boss.hp>0;
  if(t.team===u.team)return false;
  if(u.kind==='melee'&&!u.flying&&t.flying)return false;
  return true;
}

function livePickCombatTarget(u){
  const dir=u.team==='red'?1:-1;
  const enemies=state.units.filter(v=>!v.dead&&v.team!==u.team&&!(u.kind==='melee'&&!u.flying&&v.flying));
  let pool=enemies.filter(v=>((v.x-u.x)*dir)>=-24&&(u.flying||Math.abs((v.baseY??v.y)-(u.baseY??u.y))<=LIVE_COMBAT_LANE));
  if(!pool.length)pool=enemies.filter(v=>((v.x-u.x)*dir)>=-24);
  if(!pool.length)pool=enemies;

  let target=null,best=Infinity;
  for(const v of pool){
    const dx=v.x-u.x,dy=(v.baseY??v.y)-(u.baseY??u.y);
    let score=Math.abs(dx)+Math.abs(dy)*(u.kind==='melee'?1.15:.45);
    if(dx*dir<0)score+=90;
    if(score<best){best=score;target=v;}
  }

  if(state.boss&&state.boss.hp>0){
    const bossDist=Math.hypot(state.boss.x-u.x,state.boss.y-u.y);
    const normalDist=target?Math.hypot(target.x-u.x,target.y-u.y):Infinity;
    if(!target||bossDist<Math.min(180,normalDist*.72))target=state.boss;
  }
  return target;
}

Unit.prototype.update=function(dt){
  if(this.dead||state.ended)return;
  this.phase+=dt*8;
  this.hit=Math.max(0,this.hit-dt*4);
  this.cool=Math.max(0,this.cool-dt);
  this.slow=Math.max(0,this.slow-dt);
  this.y=this.baseY+Math.sin(this.phase)*(this.flying?6:2);

  if(this.enter>0){
    this.enter-=dt;
    const total=this.enterTotal||1.05,p=1-clamp(this.enter/total,0,1),e=1-Math.pow(1-p,3);
    this.baseY=(this.enterStartY??-140)+((this.landY)-(this.enterStartY??-140))*e;
    this.y=this.baseY;
    if(this.enter<=0&&!this.landed){
      this.landed=true;this.baseY=this.landY;
      const st=this.enterStyle||'hero';
      if(st==='hero'){state.shake=Math.max(state.shake,17);burst(this.x,this.landY+40,'rgba(255,225,160,.9)',145);particles(this.x,this.landY+35,'#d7c3a2',28,100);sfx('landing');}
      else if(st==='storm'){state.shake=Math.max(state.shake,10);burst(this.x,this.landY+20,'rgba(210,235,255,.9)',135);particles(this.x,this.landY+20,'#c9efff',20,70);sfx('thunder');}
      else if(st==='mech'){state.shake=Math.max(state.shake,15);burst(this.x,this.landY+38,'rgba(105,235,255,.8)',150);particles(this.x,this.landY+42,'#7bdcea',22,90);sfx('mechEntry');}
    }
    return;
  }

  if(this.type==='ninja'&&Math.random()<dt*12){
    state.particles.push({x:this.x,y:this.y+8,vx:rand(-10,10),vy:rand(-8,8),life:.18,size:rand(5,10),color:'rgba(150,110,255,.35)'});
  }

  this._retargetIn=(this._retargetIn||0)-dt;
  if(!liveCombatTargetValid(this,this._combatTarget)||this._retargetIn<=0){
    const next=livePickCombatTarget(this);
    if(!liveCombatTargetValid(this,this._combatTarget)||!next){
      this._combatTarget=next;
    }else{
      const oldD=Math.hypot(this._combatTarget.x-this.x,this._combatTarget.y-this.y);
      const newD=Math.hypot(next.x-this.x,next.y-this.y);
      if(next===state.boss||newD<oldD*.78)this._combatTarget=next;
    }
    this._retargetIn=.28+Math.random()*.16;
  }

  const target=this._combatTarget;
  if(target&&liveCombatTargetValid(this,target)){
    const tx=target.x;
    const targetY=target===state.boss?target.y:(target.baseY??target.y);
    const dx=tx-this.x;
    const rawDy=targetY-(this.baseY??this.y);
    const combatDy=this.flying?(target.y-this.y):rawDy;
    const dst=Math.hypot(dx,combatDy);
    let reach=this.range;
    if(this.kind==='melee'){
      const bodyReach=target===state.boss?76:((this.size||1)+(target.size||1))*15+10;
      reach=Math.max(reach,bodyReach);
    }

    if(dst<=reach){
      if(this.cool<=0){
        this.cool=this.reload||.55;
        if(this.kind==='ranged')shoot(this,target);
        else hit(target,this.atk,this);
      }
      return;
    }

    const mv=this.speed*(this.slow>0?.55:1);
    if(this.flying){
      const d=Math.hypot(dx,combatDy*.55)||1;
      this.x+=dx/d*mv*dt;
      this.baseY+=combatDy*.55/d*mv*dt;
      return;
    }

    if(Math.abs(dx)>Math.max(18,reach*.72))this.x+=Math.sign(dx)*mv*dt;
    if(Math.abs(rawDy)>8){
      const yStep=Math.min(Math.abs(rawDy),mv*.50*dt);
      this.baseY+=Math.sign(rawDy)*yStep;
    }
    this.baseY=clamp(this.baseY,GROUND-80,GROUND+18);
    this.y=this.baseY+Math.sin(this.phase)*2;
    return;
  }

  this._combatTarget=null;
  const cx=this.team==='red'?W-132:132,dx=cx-this.x;
  const mv=this.speed*(this.slow>0?.55:1);
  if(Math.abs(dx)>78)this.x+=Math.sign(dx)*mv*dt;
  else if(this.cool<=0){
    this.cool=.75;
    damageCastle(this.team==='red'?'blue':'red',this.atk*2,this);
  }
};

resolveCollisions=function(){
  const arr=state.units.filter(u=>!u.dead&&!u.flying);
  for(let i=0;i<arr.length;i++){
    for(let j=i+1;j<arr.length;j++){
      const a=arr[i],b=arr[j];
      let dx=b.x-a.x,dy=b.baseY-a.baseY;
      const dist=Math.hypot(dx,dy)||.001;
      const same=a.team===b.team;
      const min=(a.size+b.size)*(same?21:13.5);
      if(dist>=min)continue;
      const push=(min-dist)/2;
      dx/=dist;dy/=dist;
      const xFactor=same?.78:.92,yFactor=same?.46:.18;
      a.x-=dx*push*xFactor;b.x+=dx*push*xFactor;
      a.baseY-=dy*push*yFactor;b.baseY+=dy*push*yFactor;
      a.baseY=clamp(a.baseY,GROUND-80,GROUND+18);
      b.baseY=clamp(b.baseY,GROUND-80,GROUND+18);
      if(same&&Math.abs(dx)<.2){a.x-=.15;b.x+=.15;}
    }
  }
};
`;

  combatText = combatText.replace(trailer, `${combatPatch}\n${trailer}`);
  fs.writeFileSync(combatFile, combatText, 'utf8');
  console.log('[live] ground combat patched: melee reach, target locking, lanes and enemy collision fixed');
} else {
  console.log('[live] ground combat patch v2 already active');
}

combatText = fs.readFileSync(combatFile, 'utf8');
const combatMarkerV3 = '/* LIVE_COMBAT_V3 */';
if (!combatText.includes(combatMarkerV3)) {
  if (!combatText.includes(trailer)) {
    throw new Error('[live] Combat v3 insertion point not found; refusing to patch blindly.');
  }

  const combatPatchV3 = String.raw`
/* LIVE_COMBAT_V3 */
function liveTargetValidV3(u,t){
  if(!t||t.dead||t.hp<=0)return false;
  if(t===state.boss)return !!state.boss&&state.boss.hp>0;
  if(t.team===u.team)return false;
  if(u.kind==='melee'&&!u.flying&&t.flying)return false;
  return true;
}

function livePickTargetV3(u){
  const dir=u.team==='red'?1:-1;
  const enemies=state.units.filter(v=>liveTargetValidV3(u,v));
  let target=null,best=Infinity;

  for(const v of enemies){
    const dx=v.x-u.x;
    const dy=(v.baseY??v.y)-(u.baseY??u.y);
    const ahead=dx*dir>=-30;
    let score=Math.abs(dx)+(u.kind==='melee'?Math.abs(dy)*.28:Math.abs(dy)*.45);
    if(!ahead)score+=170;
    if(u.kind==='melee'&&!u.flying&&Math.abs(dy)>100)score+=240;
    if(score<best){best=score;target=v;}
  }

  if(state.boss&&state.boss.hp>0){
    const bd=Math.hypot(state.boss.x-u.x,(state.boss.y-u.y)*.45);
    const td=target?Math.hypot(target.x-u.x,(target.y-u.y)*.45):Infinity;
    if(!target||bd<Math.min(150,td*.60))target=state.boss;
  }
  return target;
}

function liveCastleShotV3(u){
  const enemyTeam=u.team==='red'?'blue':'red';
  const castleX=enemyTeam==='red'?118:W-118;
  const castleY=GROUND-170;
  const startY=u.y-(u.flying?4:18);
  const type=u.projectile||'arrow';
  const color=type==='shell'?'#ffd27e':type==='fire'?'#ffb35c':type==='laser'?'#ff5b5b':type==='ice'?'#bdf6ff':type==='thunder'?'#f8f06d':type==='lightning'?'#8fe8ff':type==='plasma'?'#65f2ff':'#ffe08a';
  state.attacks.push({type:'shot',x1:u.x,y1:startY,x2:castleX,y2:castleY,life:type==='shell'?.22:.14,color});
  if(type==='shell'){
    sfx('tank');
    state.shake=Math.max(state.shake,3.5);
  }else if(type==='fire')sfx('dragon');
  else if(type==='laser')sfx('laser');
  else if(type==='ice')sfx('ice');
  else if(type==='thunder')sfx('thunder');
  else if(type==='lightning')sfx('lightning');
  else if(type==='plasma')sfx('plasma');
  else sfx('arrow');
  damageCastle(enemyTeam,u.atk*2,u);
}

Unit.prototype.update=function(dt){
  if(this.dead||state.ended)return;
  this.phase+=dt*8;
  this.hit=Math.max(0,this.hit-dt*4);
  this.cool=Math.max(0,this.cool-dt);
  this.slow=Math.max(0,this.slow-dt);
  this.y=this.baseY+Math.sin(this.phase)*(this.flying?6:2);

  if(this.enter>0){
    this.enter-=dt;
    const total=this.enterTotal||1.05,p=1-clamp(this.enter/total,0,1),e=1-Math.pow(1-p,3);
    this.baseY=(this.enterStartY??-140)+((this.landY)-(this.enterStartY??-140))*e;
    this.y=this.baseY;
    if(this.enter<=0&&!this.landed){
      this.landed=true;this.baseY=this.landY;
      const st=this.enterStyle||'hero';
      if(st==='hero'){state.shake=Math.max(state.shake,17);burst(this.x,this.landY+40,'rgba(255,225,160,.9)',145);particles(this.x,this.landY+35,'#d7c3a2',28,100);sfx('landing');}
      else if(st==='storm'){state.shake=Math.max(state.shake,10);burst(this.x,this.landY+20,'rgba(210,235,255,.9)',135);particles(this.x,this.landY+20,'#c9efff',20,70);sfx('thunder');}
      else if(st==='mech'){state.shake=Math.max(state.shake,15);burst(this.x,this.landY+38,'rgba(105,235,255,.8)',150);particles(this.x,this.landY+42,'#7bdcea',22,90);sfx('mechEntry');}
    }
    return;
  }

  if(this.type==='ninja'&&Math.random()<dt*12){
    state.particles.push({x:this.x,y:this.y+8,vx:rand(-10,10),vy:rand(-8,8),life:.18,size:rand(5,10),color:'rgba(150,110,255,.35)'});
  }

  this._retargetIn=(this._retargetIn||0)-dt;
  if(!liveTargetValidV3(this,this._combatTarget)||this._retargetIn<=0){
    const next=livePickTargetV3(this);
    if(!liveTargetValidV3(this,this._combatTarget)||!next){
      this._combatTarget=next;
    }else{
      const oldDx=Math.abs(this._combatTarget.x-this.x);
      const newDx=Math.abs(next.x-this.x);
      if(next===state.boss||newDx<oldDx*.70)this._combatTarget=next;
    }
    this._retargetIn=.22+Math.random()*.14;
  }

  const target=this._combatTarget;
  if(target&&liveTargetValidV3(this,target)){
    const targetY=target===state.boss?target.y:(target.baseY??target.y);
    const dx=target.x-this.x;
    const dy=targetY-(this.baseY??this.y);
    const mv=this.speed*(this.slow>0?.55:1);

    if(this.kind==='melee'&&!this.flying){
      const targetSize=target===state.boss?2.5:(target.size||1);
      const reach=Math.max(this.range||35,28+((this.size||1)+targetSize)*11);
      if(Math.abs(dx)<=reach&&Math.abs(dy)<=95){
        if(this.cool<=0){this.cool=this.reload||.55;hit(target,this.atk,this);}
        return;
      }
      if(Math.abs(dx)>reach*.82)this.x+=Math.sign(dx)*mv*dt;
      if(Math.abs(dy)>10){
        const step=Math.min(Math.abs(dy),mv*.72*dt);
        this.baseY+=Math.sign(dy)*step;
      }
      this.baseY=clamp(this.baseY,GROUND-80,GROUND+18);
      this.y=this.baseY+Math.sin(this.phase)*2;
      return;
    }

    const combatDy=this.flying?(target.y-this.y):dy;
    const dst=Math.hypot(dx,combatDy*.62);
    if(dst<=(this.range||45)){
      if(this.cool<=0){
        this.cool=this.reload||.55;
        if(this.kind==='ranged')shoot(this,target);else hit(target,this.atk,this);
      }
      return;
    }

    const d=Math.hypot(dx,combatDy*.55)||1;
    this.x+=dx/d*mv*dt;
    if(this.flying)this.baseY+=combatDy*.55/d*mv*dt;
    else if(Math.abs(dy)>10)this.baseY+=Math.sign(dy)*Math.min(Math.abs(dy),mv*.45*dt);
    if(!this.flying)this.baseY=clamp(this.baseY,GROUND-80,GROUND+18);
    return;
  }

  this._combatTarget=null;
  const enemyTeam=this.team==='red'?'blue':'red';
  const castleX=enemyTeam==='red'?118:W-118;
  const dx=castleX-this.x;
  const mv=this.speed*(this.slow>0?.55:1);
  const castleReach=this.kind==='ranged'?Math.max(115,this.range||115):68;

  if(Math.abs(dx)>castleReach){
    this.x+=Math.sign(dx)*mv*dt;
    if(!this.flying){
      const laneY=GROUND-24;
      if(Math.abs(laneY-this.baseY)>10)this.baseY+=Math.sign(laneY-this.baseY)*Math.min(Math.abs(laneY-this.baseY),mv*.35*dt);
      this.baseY=clamp(this.baseY,GROUND-80,GROUND+18);
    }
    return;
  }

  if(this.cool<=0){
    this.cool=this.kind==='ranged'?(this.reload||.75):.70;
    if(this.kind==='ranged')liveCastleShotV3(this);
    else damageCastle(enemyTeam,this.atk*2,this);
  }
};

resolveCollisions=function(){
  const arr=state.units.filter(u=>!u.dead&&!u.flying);
  for(let i=0;i<arr.length;i++){
    for(let j=i+1;j<arr.length;j++){
      const a=arr[i],b=arr[j];
      if(a.team!==b.team)continue;
      const dx=b.x-a.x;
      const dy=b.baseY-a.baseY;
      const minY=Math.max(14,(a.size+b.size)*10);
      const closeX=Math.abs(dx)<(a.size+b.size)*18;
      if(!closeX||Math.abs(dy)>=minY)continue;
      const sign=dy===0?(i%2===0?-1:1):Math.sign(dy);
      const push=(minY-Math.abs(dy))/2;
      a.baseY=clamp(a.baseY-sign*push,GROUND-80,GROUND+18);
      b.baseY=clamp(b.baseY+sign*push,GROUND-80,GROUND+18);
    }
  }
};
`;

  combatText = combatText.replace(trailer, `${combatPatchV3}\n${trailer}`);
  fs.writeFileSync(combatFile, combatText, 'utf8');
  console.log('[live] combat v3 patched: ground units fight instead of shoving; tanks/ranged fire at castles');
} else {
  console.log('[live] ground combat patch v3 already active');
}
