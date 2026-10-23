const nameVoiceCache=new Map();
const reactionSource='/crowd-reactions.ogg?v=12';
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
function pick(a){return a[Math.floor(Math.random()*a.length)]}

// Eski tarayıcı/robot konuşmasını tamamen kapat.
say=function(){};
try{speechSynthesis?.cancel?.()}catch{}

async function nameVoiceUrl(name){
  const key=String(name||'').trim().toLowerCase();
  if(nameVoiceCache.has(key))return nameVoiceCache.get(key);
  const r=await fetch('/voice?text='+encodeURIComponent(name),{cache:'force-cache'});
  if(!r.ok)throw new Error('name voice '+r.status);
  const blob=await r.blob();if(blob.size<1000)throw new Error('empty name voice');
  const url=URL.createObjectURL(blob);
  if(nameVoiceCache.size>80){const k=nameVoiceCache.keys().next().value;URL.revokeObjectURL(nameVoiceCache.get(k));nameVoiceCache.delete(k)}
  nameVoiceCache.set(key,url);return url;
}

async function playName(name,repeat=1){
  try{
    const url=await nameVoiceUrl(name);
    for(let i=0;i<repeat;i++){
      await new Promise(resolve=>{const a=new Audio(url);a.volume=1;a.playbackRate=.98;a.onended=resolve;a.onerror=resolve;a.play().catch(resolve)});
      if(i+1<repeat)await sleep(80);
    }
  }catch(e){console.warn('name voice skipped',e)}
}

const slices=[
  {s:.35,d:2.25},{s:2.9,d:2.35},{s:5.55,d:2.4},{s:8.25,d:2.35},
  {s:10.95,d:2.4},{s:13.7,d:2.35},{s:16.4,d:2.45},{s:19.15,d:2.4},
  {s:21.85,d:2.35},{s:23.55,d:2.15}
];
let lastSlice=-1;
function nextSlice(){let i=Math.floor(Math.random()*slices.length);if(i===lastSlice)i=(i+1)%slices.length;lastSlice=i;return slices[i]}

async function playRealReaction(mult=1){
  for(let n=0;n<mult;n++){
    const clip=nextSlice();
    await new Promise(resolve=>{
      const a=new Audio(reactionSource);a.preload='auto';a.volume=.98;
      let finished=false,timer=null;
      const done=()=>{if(finished)return;finished=true;clearTimeout(timer);try{a.pause()}catch{} resolve()};
      const go=()=>{if(finished)return;try{a.currentTime=clip.s}catch{};a.play().then(()=>{timer=setTimeout(done,clip.d*1000)}).catch(done)};
      a.onerror=done;
      if(a.readyState>=1)go();else a.addEventListener('loadedmetadata',go,{once:true});
      setTimeout(done,5000);
    });
    if(n+1<mult)await sleep(80);
  }
}

async function humanReaction(name,g){
  const d=Number(g.diamonds||1),gift=String(g.giftName||'').toLowerCase();
  const huge=d>=1000||/universe|galaxy|lion|aslan|galaksi|evren/.test(gift);
  const big=d>=100||/swan|kuğu/.test(gift);
  const mid=d>=10;
  window.duckMusic?.(true);
  try{
    // Sadece isim yapay ses; teşekkür/maşallah/thank-you kısmı gerçek videodan.
    await playName(name,huge?2:1);
    await sleep(70);
    await playRealReaction(huge?3:big?2:mid?2:1);
  }finally{window.duckMusic?.(false)}
}

react=async function(g){
  const t=tier(g.diamonds),n=nameClean(g.displayName||g.uniqueId);clearTimeout(timer);
  who.textContent=n;meta.textContent=`${g.giftName||'Hediye'} x${g.repeatCount||1}${g.diamonds?` • ${g.diamonds} elmas`:''}`;ico.textContent=t.i;
  gift.classList.add('show');crew.className='crew '+t.c;bubbles(n);
  if(t.c==='react-mid'){stage.classList.add('shake');setTimeout(()=>stage.classList.remove('shake'),900)}
  if(t.c==='react-high'||t.c==='react-max'){burst.classList.remove('on');void burst.offsetWidth;burst.classList.add('on')}
  if(t.c==='react-max'){flash.classList.remove('on');void flash.offsetWidth;flash.classList.add('on')}
  const voice=humanReaction(n,g);await Promise.all([voice,sleep(t.t)]);crew.className='crew';gift.classList.remove('show');
};

const oldStart=$('#start').onclick;
$('#start').onclick=()=>{unlocked=true;oldStart?.();
  // Gerçek reaksiyon sesini önceden indir; ses başlaması gecikmesin.
  const a=new Audio(reactionSource);a.preload='auto';try{a.load()}catch{}
};