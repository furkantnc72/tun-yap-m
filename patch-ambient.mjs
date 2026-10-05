import fs from 'node:fs';

const file = 'game-v14-8.txt';
let text = fs.readFileSync(file, 'utf8');
const marker = '/* LIVE_AMBIENT_V1 */';
const trailer = 'renderBoard(); reset(); requestAnimationFrame(loop);';

if (!text.includes(marker)) {
  if (!text.includes(trailer)) {
    throw new Error('[ambient] insertion point not found; refusing to patch blindly.');
  }

  const ambient = String.raw`
/* LIVE_AMBIENT_V1 */
function drawLiveAmbient(now){
  const t=(now||performance.now())/1000;
  ctx.save();

  // Slowly moving clouds: decorative only, never added to state.units.
  const clouds=[
    {speed:10,y:125,s:1.05,phase:0},
    {speed:7,y:210,s:.82,phase:330},
    {speed:12,y:300,s:.68,phase:690}
  ];
  ctx.globalAlpha=.18;
  ctx.fillStyle='#ffffff';
  for(const c of clouds){
    const x=((t*c.speed+c.phase)%(W+260))-130;
    ctx.save();ctx.translate(x,c.y);ctx.scale(c.s,c.s);
    ctx.beginPath();
    ctx.arc(-42,5,24,0,Math.PI*2);
    ctx.arc(-12,-7,31,0,Math.PI*2);
    ctx.arc(24,3,25,0,Math.PI*2);
    ctx.arc(50,8,18,0,Math.PI*2);
    ctx.fill();ctx.restore();
  }

  // Tiny birds cross the sky so the scene is never fully static.
  ctx.globalAlpha=.30;
  ctx.strokeStyle='#dfe7f5';ctx.lineWidth=2.2;ctx.lineCap='round';
  for(let i=0;i<2;i++){
    const bx=((t*(22+i*7)+i*420)%(W+180))-90;
    const by=175+i*72+Math.sin(t*1.3+i)*10;
    const flap=Math.sin(t*6+i)*4;
    ctx.beginPath();ctx.moveTo(bx-10,by);ctx.quadraticCurveTo(bx-5,by-5-flap,bx,by);ctx.quadraticCurveTo(bx+5,by-5+flap,bx+10,by);ctx.stroke();
  }

  function flag(x,y,team,flip=1){
    const wave=Math.sin(t*3.2+x*.01)*5;
    ctx.globalAlpha=.82;
    ctx.strokeStyle='#c9d2df';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x,y+42);ctx.lineTo(x,y-28);ctx.stroke();
    ctx.fillStyle=team==='red'?'#d94848':'#4778d8';
    ctx.beginPath();ctx.moveTo(x,y-26);ctx.quadraticCurveTo(x+flip*(22+wave),y-34,x+flip*45,y-20);ctx.lineTo(x+flip*45,y+3);ctx.quadraticCurveTo(x+flip*(20-wave),y-6,x,y+1);ctx.closePath();ctx.fill();
  }

  function torch(x,y,phase){
    const f=6+Math.sin(t*9+phase)*2.5;
    ctx.globalAlpha=.75;
    ctx.strokeStyle='#6f4a2e';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(x,y+22);ctx.lineTo(x,y);ctx.stroke();
    ctx.fillStyle='rgba(255,176,74,.28)';ctx.beginPath();ctx.arc(x,y-5,f*2.1,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#ffbd58';ctx.beginPath();ctx.ellipse(x,y-6,f*.65,f*1.25,0,0,Math.PI*2);ctx.fill();
  }

  function guard(baseX,y,team,phase,face){
    // Decorative sentry. Not a Unit, has no HP, collision, score or damage.
    const x=baseX+Math.sin(t*.75+phase)*22;
    const step=Math.sin(t*5+phase)*4;
    const bob=Math.abs(Math.sin(t*5+phase))*2;
    ctx.save();ctx.translate(x,y-bob);ctx.scale(face,1);ctx.globalAlpha=.72;
    ctx.fillStyle='rgba(0,0,0,.20)';ctx.beginPath();ctx.ellipse(0,31,17,5,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#25303d';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(-6,12);ctx.lineTo(-7+step,29);ctx.moveTo(6,12);ctx.lineTo(7-step,29);ctx.stroke();
    ctx.fillStyle=team==='red'?'#963636':'#345595';ctx.fillRect(-10,-8,20,23);
    ctx.fillStyle='#8b96a5';ctx.beginPath();ctx.arc(0,-14,8,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#aeb9c8';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(12,-6);ctx.lineTo(18,24);ctx.stroke();
    ctx.restore();
  }

  flag(74,GROUND-220,'red',1);
  flag(W-74,GROUND-220,'blue',-1);
  torch(94,GROUND-68,0);
  torch(W-94,GROUND-68,1.7);
  guard(94,GROUND-34,'red',0,1);
  guard(W-94,GROUND-34,'blue',Math.PI,-1);

  ctx.restore();
}
`;

  text = text.replace(trailer, `${ambient}\n${trailer}`);
}

const oldLoop = "drawBG(); if(!state.ended){";
const newLoop = "drawBG(); drawLiveAmbient(now); if(!state.ended){";
if (!text.includes(newLoop)) {
  if (!text.includes(oldLoop)) {
    throw new Error('[ambient] loop hook not found; refusing to patch blindly.');
  }
  text = text.replace(oldLoop, newLoop);
}

fs.writeFileSync(file, text, 'utf8');
console.log('[ambient] idle LIVE motion active: clouds, birds, flags, torches and corner sentries');
