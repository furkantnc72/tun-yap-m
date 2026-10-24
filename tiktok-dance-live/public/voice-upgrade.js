const VERIFIED_REACTION='/real-reaction.ogg?v=18';
const nameVoiceCache=new Map();
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}

say=function(){};
try{speechSynthesis?.cancel?.()}catch{}

async function getNameVoice(name){
  const key=String(name||'').toLocaleLowerCase('tr-TR');
  if(nameVoiceCache.has(key))return nameVoiceCache.get(key);
  const r=await fetch('/name-voice?v=18&name='+encodeURIComponent(name),{cache:'no-store'});
  if(!r.ok)throw new Error('name voice '+r.status);
  const blob=await r.blob();if(blob.size<1500)throw new Error('empty name voice');
  const url=URL.createObjectURL(blob);
  if(nameVoiceCache.size>80){const first=nameVoiceCache.keys().next().value;URL.revokeObjectURL(nameVoiceCache.get(first));nameVoiceCache.delete(first)}
  nameVoiceCache.set(key,url);return url;
}
async function playName(name,repeat=1){
  try{
    const url=await getNameVoice(name);
    for(let i=0;i<repeat;i++){
      await new Promise(resolve=>{const a=new Audio(url);a.volume=1;a.playbackRate=1;a.onended=resolve;a.onerror=resolve;a.play().catch(resolve)});
      if(i+1<repeat)await sleep(55);
    }
  }catch(e){console.warn('name voice skipped',e)}
}
async function playVerifiedReaction(volume=1,rate=1){
  return new Promise(resolve=>{
    const a=new Audio(VERIFIED_REACTION);a.preload='auto';a.volume=Math.max(0,Math.min(1,volume));a.playbackRate=rate;
    let done=false;const finish=()=>{if(done)return;done=true;resolve()};a.onended=finish;a.onerror=finish;a.play().catch(finish);setTimeout(finish,2200);
  });
}
async function humanReaction(name,g){
  const d=Number(g.diamonds||1),giftName=String(g.giftName||'').toLowerCase();
  const huge=d>=1000||/universe|galaxy|lion|aslan|galaksi|evren/.test(giftName);
  const big=d>=100||/swan|kuğu/.test(giftName);
  window.duckMusic?.(true);
  try{
    await playName(name,huge?2:1);
    await sleep(60);
    await playVerifiedReaction(1,1);
    if(big||huge){await sleep(70);await playName(name,1);await sleep(45);await playVerifiedReaction(.98,1.01)}
    if(huge){await sleep(65);await playVerifiedReaction(.95,.995)}
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
$('#start').onclick=()=>{unlocked=true;oldStart?.();const a=new Audio(VERIFIED_REACTION);a.preload='auto';try{a.load()}catch{}};
