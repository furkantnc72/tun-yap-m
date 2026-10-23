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
    masterGain.gain.value=1.18;
    chantMaster.connect(masterGain).connect(chantContext.destination);
  }
  if(chantContext.state==='suspended')chantContext.resume().catch(()=>{});
  return chantContext;
}

async function getChantBuffer(name){
  const key=name.toLocaleLowerCase('tr-TR');
  if(chantBuffers.has(key))return chantBuffers.get(key);
  const job=(async()=>{
    const r=await fetch('/voice?name='+encodeURIComponent(name),{cache:'force-cache'});
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

async function crowdChant(name,repeats=1){
  if(!unlocked)return;
  try{
    const buffer=await getChantBuffer(name);
    const ctx=ensureChantContext();
    if(!ctx)return;
    const start=ctx.currentTime+.04;
    // Öndeki lider: daha tok, ortada ve tek kişi.
    sourceVoice(buffer,start,.91,1.0,0);
    // Referans videodaki gibi liderden kısa süre sonra grup cevap verir.
    const first=start+.47;
    const rates=[.88,.94,1.00,1.065,1.11];
    const pans=[-.84,-.38,0,.38,.84];
    const gains=[.24,.34,.38,.34,.24];
    for(let r=0;r<repeats;r++){
      const groupAt=first+r*.48;
      rates.forEach((rate,i)=>sourceVoice(buffer,groupAt+i*.018,rate,gains[i],pans[i]));
    }
  }catch(err){
    try{speechSynthesis.cancel()}catch{}
    say(name,.94,.82);
    setTimeout(()=>{for(let i=0;i<repeats;i++)setTimeout(()=>say(name,1.07,1.02),i*440)},500);
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
  crowdChant(n,t.r);
  if(t.c==='react-mid'){stage.classList.add('shake');setTimeout(()=>stage.classList.remove('shake'),1000)}
  if(t.c==='react-high'||t.c==='react-max'){burst.classList.remove('on');void burst.offsetWidth;burst.classList.add('on')}
  if(t.c==='react-max'){flash.classList.remove('on');void flash.offsetWidth;flash.classList.add('on');stage.classList.add('shake');setTimeout(()=>stage.classList.remove('shake'),1300)}
  await new Promise(r=>setTimeout(r,t.t));
  crew.className='crew';gift.classList.remove('show');
};

// İlk tıklamada AudioContext'i de uyandır; böylece ilk hediyede gecikme azalır.
const originalStart=$('#start').onclick;
$('#start').onclick=()=>{ensureChantContext();originalStart?.();};
