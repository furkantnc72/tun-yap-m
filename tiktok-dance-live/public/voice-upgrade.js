let chantContext=null;
const chantBuffers=new Map();
let chantMaster=null;

function ensureChantContext(){
  if(!chantContext){
    const AC=window.AudioContext||window.webkitAudioContext;
    if(!AC)return null;
    chantContext=new AC();
    chantMaster=chantContext.createDynamicsCompressor();
    chantMaster.threshold.value=-16;
    chantMaster.knee.value=15;
    chantMaster.ratio.value=5;
    chantMaster.attack.value=.006;
    chantMaster.release.value=.2;
    const masterGain=chantContext.createGain();
    masterGain.gain.value=1.2;
    chantMaster.connect(masterGain).connect(chantContext.destination);
  }
  if(chantContext.state==='suspended')chantContext.resume().catch(()=>{});
  return chantContext;
}

async function getVoiceBuffer(text){
  const key=String(text).toLocaleLowerCase('tr-TR');
  if(chantBuffers.has(key))return chantBuffers.get(key);
  const job=(async()=>{
    const r=await fetch('/voice?text='+encodeURIComponent(text),{cache:'force-cache'});
    if(!r.ok)throw new Error('neural voice unavailable');
    const bytes=await r.arrayBuffer();
    const ctx=ensureChantContext();
    if(!ctx)throw new Error('audio context unavailable');
    return await ctx.decodeAudioData(bytes.slice(0));
  })();
  chantBuffers.set(key,job);
  try{return await job}catch(e){chantBuffers.delete(key);throw e}
}

function sourceVoice(buffer,when,rate,gain,pan=0){
  const ctx=ensureChantContext();
  if(!ctx)return;
  const src=ctx.createBufferSource();
  src.buffer=buffer;
  src.playbackRate.value=rate;
  const g=ctx.createGain();
  g.gain.value=gain;
  if(ctx.createStereoPanner){
    const p=ctx.createStereoPanner();
    p.pan.value=pan;
    src.connect(g).connect(p).connect(chantMaster);
  }else src.connect(g).connect(chantMaster);
  src.start(when);
}

function fallbackVoices(){
  const v=speechSynthesis?.getVoices?.()||[];
  const tr=v.filter(x=>/^tr/i.test(x.lang));
  return tr.sort((a,b)=>{
    const score=x=>/Google|Natural|Online|Ahmet|Tolga/i.test(x.name)?2:/Microsoft/i.test(x.name)?1:0;
    return score(b)-score(a);
  });
}

say=function(txt,rate=1,pitch=1){
  if(!unlocked||!('speechSynthesis'in window))return;
  const u=new SpeechSynthesisUtterance(txt);
  u.lang='tr-TR';u.rate=rate;u.pitch=pitch;u.volume=1;
  const best=fallbackVoices()[0];if(best)u.voice=best;
  speechSynthesis.speak(u);
};

function pick(list){return list[Math.floor(Math.random()*list.length)]}

function crowdLayer(buffer,when,energy=1){
  const rates=energy>1.2?[.86,.93,1.00,1.08,1.15]:[.9,.96,1.01,1.065,1.12];
  const pans=[-.88,-.42,0,.42,.88];
  const gains=energy>1.2?[.27,.37,.43,.37,.27]:[.22,.32,.37,.32,.22];
  rates.forEach((rate,i)=>sourceVoice(buffer,when+i*.015,rate,gains[i],pans[i]));
}

async function playCall(text,when,{crowd=false,energy=1,leaderRate=.94,leaderGain=1}={}){
  const buffer=await getVoiceBuffer(text);
  if(crowd)crowdLayer(buffer,when,energy);
  else sourceVoice(buffer,when,leaderRate,leaderGain,0);
}

function reactionLines(name,diamonds){
  const d=Number(diamonds||1);
  if(d>=500)return [
    {text:pick([`${name}! Maşallah!`,`Maşallah ${name}!`,`Vay ${name}! Maşallah!`]),at:.05},
    {text:'Maşallah!',at:.58,crowd:true,energy:1.35},
    {text:pick([`Çok teşekkürler ${name}!`,`Helal olsun ${name}!`,`Eyvallah ${name}!`]),at:1.22},
    {text:pick(['Teşekkürler!','Helal olsun!','Eyvallah!']),at:1.82,crowd:true,energy:1.3},
    {text:pick(['Maşallah!','Çok sağ ol!','Teşekkürler!']),at:2.45,crowd:true,energy:1.2}
  ];
  if(d>=100)return [
    {text:pick([`${name}! Maşallah!`,`Maşallah ${name}!`,`Çok teşekkürler ${name}!`]),at:.05},
    {text:'Maşallah!',at:.58,crowd:true,energy:1.22},
    {text:pick(['Teşekkürler!','Eyvallah!','Çok sağ ol!']),at:1.2,crowd:true,energy:1.15},
    {text:pick([`Sağ ol ${name}!`,`Teşekkürler ${name}!`]),at:1.85}
  ];
  if(d>=10)return [
    {text:pick([`${name}, teşekkürler!`,`Sağ ol ${name}!`,`Eyvallah ${name}!`]),at:.05},
    {text:pick(['Maşallah!','Teşekkürler!','Eyvallah!']),at:.62,crowd:true,energy:1.08},
    {text:pick(['Çok sağ ol!','Teşekkürler!']),at:1.25,crowd:true}
  ];
  return [
    {text:pick([`${name}, teşekkürler!`,`Sağ ol ${name}!`,`Eyvallah ${name}!`]),at:.05},
    {text:pick(['Teşekkürler!','Sağ ol!','Maşallah!']),at:.62,crowd:true}
  ];
}

async function livelyThanks(name,diamonds){
  if(!unlocked)return;
  const lines=reactionLines(name,diamonds);
  try{
    const ctx=ensureChantContext();
    if(!ctx)return;
    const base=ctx.currentTime+.05;
    const prepared=await Promise.all(lines.map(async line=>({line,buffer:await getVoiceBuffer(line.text)})));
    prepared.forEach(({line,buffer})=>{
      const when=base+line.at;
      if(line.crowd)crowdLayer(buffer,when,line.energy||1);
      else sourceVoice(buffer,when,line.leaderRate||.93,line.leaderGain||1.02,0);
    });
  }catch(err){
    try{speechSynthesis.cancel()}catch{}
    lines.forEach((line,i)=>setTimeout(()=>say(line.text,line.crowd?1.07:.96,line.crowd?1.03:.84),i*520));
  }
}

react=async function(g){
  const t=tier(g.diamonds),n=nameClean(g.displayName||g.uniqueId);
  clearTimeout(timer);
  who.textContent=n;
  meta.textContent=`${g.giftName||'Hediye'} x${g.repeatCount||1}${g.diamonds?` • ${g.diamonds} elmas`:''}`;
  ico.textContent=t.i;
  gift.classList.add('show');
  crew.className='crew '+t.c;
  bubbles(n);
  try{speechSynthesis.cancel()}catch{}
  livelyThanks(n,g.diamonds);
  if(t.c==='react-mid'){stage.classList.add('shake');setTimeout(()=>stage.classList.remove('shake'),1000)}
  if(t.c==='react-high'||t.c==='react-max'){burst.classList.remove('on');void burst.offsetWidth;burst.classList.add('on')}
  if(t.c==='react-max'){flash.classList.remove('on');void flash.offsetWidth;flash.classList.add('on');stage.classList.add('shake');setTimeout(()=>stage.classList.remove('shake'),1300)}
  const speechTime=Number(g.diamonds||1)>=500?3900:Number(g.diamonds||1)>=100?3300:Number(g.diamonds||1)>=10?2750:2250;
  await new Promise(r=>setTimeout(r,Math.max(t.t,speechTime)));
  crew.className='crew';gift.classList.remove('show');
};

// İlk tıklamada AudioContext'i uyandır ve sık kullanılan ünlemleri önceden hazırla.
const originalStart=$('#start').onclick;
$('#start').onclick=()=>{
  ensureChantContext();
  originalStart?.();
  ['Maşallah!','Teşekkürler!','Eyvallah!','Helal olsun!','Çok sağ ol!','Sağ ol!'].forEach(x=>getVoiceBuffer(x).catch(()=>{}));
};
