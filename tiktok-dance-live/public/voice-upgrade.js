const VERIFIED_REACTION='/real-reaction.ogg?v=20';
const phraseVoiceCache=new Map();
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}

try{speechSynthesis?.cancel?.()}catch{}

function reactionTier(g){
  const d=Number(g.diamonds||1),giftName=String(g.giftName||'').toLowerCase();
  if(d>=1000||/universe|galaxy|lion|aslan|galaksi|evren/.test(giftName))return 'huge';
  if(d>=100||/swan|kuğu/.test(giftName))return 'big';
  if(d>=10)return 'mid';
  return 'low';
}
function phraseVariant(){return Math.floor(Math.random()*3)}
function phraseText(name,tier,variant){
  const sets={
    low:[`${name}, teşekkürler!`,`${name}, sağ ol! Çok teşekkürler!`,`${name}, thank you!`],
    mid:[`${name}! Çok teşekkürler, maşallah!`,`${name}! Maşallah, teşekkür ederiz!`,`${name}! Thank you, thank you!`],
    big:[`${name}! Maşallah! Çok teşekkür ederiz!`,`${name}! Thank you so much! Maşallah!`,`${name}! Helal olsun, çok teşekkürler!`],
    huge:[`${name}! Maşallah! Thank you, thank you! Çok teşekkür ederiz!`,`${name}! Allah razı olsun! Maşallah, çok teşekkürler!`,`${name}! Thank you so much! Maşallah! İyi ki varsın!`]
  };
  return sets[tier][variant];
}
function bestBrowserVoice(){
  const voices=window.speechSynthesis?.getVoices?.()||[];
  const score=v=>{
    const n=(v.name||'').toLowerCase(),l=(v.lang||'').toLowerCase();let s=0;
    if(l.startsWith('tr'))s+=50;
    if(n.includes('natural'))s+=35;
    if(n.includes('online'))s+=25;
    if(n.includes('google'))s+=20;
    if(n.includes('ahmet'))s+=18;
    if(n.includes('microsoft'))s+=12;
    return s;
  };
  return voices.sort((a,b)=>score(b)-score(a))[0]||null;
}
async function browserPhraseFallback(name,tier,variant){
  if(!window.speechSynthesis||!window.SpeechSynthesisUtterance)return;
  const text=phraseText(name,tier,variant);
  await new Promise(resolve=>{
    try{
      const u=new SpeechSynthesisUtterance(text);const v=bestBrowserVoice();if(v)u.voice=v;
      u.lang='tr-TR';u.rate=tier==='huge'?1.12:1.06;u.pitch=.92;u.volume=1;u.onend=resolve;u.onerror=resolve;
      speechSynthesis.cancel();speechSynthesis.speak(u);setTimeout(resolve,6500);
    }catch{resolve()}
  });
}
async function getPhraseVoice(name,tier,variant){
  const key=`${String(name||'').toLocaleLowerCase('tr-TR')}|${tier}|${variant}`;
  if(phraseVoiceCache.has(key))return phraseVoiceCache.get(key);
  const r=await fetch(`/reaction-voice?v=20&name=${encodeURIComponent(name)}&tier=${encodeURIComponent(tier)}&variant=${variant}`,{cache:'no-store'});
  if(!r.ok)throw new Error('reaction voice '+r.status);
  const blob=await r.blob();
  if(blob.size<2500)throw new Error('empty reaction voice');
  const url=URL.createObjectURL(blob);
  if(phraseVoiceCache.size>90){const first=phraseVoiceCache.keys().next().value;URL.revokeObjectURL(phraseVoiceCache.get(first));phraseVoiceCache.delete(first)}
  phraseVoiceCache.set(key,url);
  return url;
}
async function playNaturalPhrase(name,tier,variant){
  try{
    const url=await getPhraseVoice(name,tier,variant);
    await new Promise(resolve=>{
      const a=new Audio(url);a.volume=1;a.playbackRate=1;
      let done=false;const finish=()=>{if(done)return;done=true;resolve()};
      a.onended=finish;a.onerror=finish;a.play().catch(finish);setTimeout(finish,6500);
    });
  }catch(e){
    console.warn('server neural voice failed, using browser natural voice',e);
    await browserPhraseFallback(name,tier,variant);
  }
}
async function playVerifiedReaction(volume=1,rate=1){
  return new Promise(resolve=>{
    const a=new Audio(VERIFIED_REACTION);a.preload='auto';a.volume=Math.max(0,Math.min(1,volume));a.playbackRate=rate;
    let done=false;const finish=()=>{if(done)return;done=true;resolve()};a.onended=finish;a.onerror=finish;a.play().catch(finish);setTimeout(finish,2200);
  });
}
async function humanReaction(name,g){
  const rt=reactionTier(g),variant=phraseVariant();
  window.duckMusic?.(true);
  try{
    await playNaturalPhrase(name,rt,variant);
    if(rt==='mid'){await sleep(55);await playVerifiedReaction(.72,1.01)}
    if(rt==='big'){await sleep(45);await playVerifiedReaction(.86,1.01)}
    if(rt==='huge'){
      await sleep(35);await playVerifiedReaction(.92,1.02);
      await sleep(50);await playVerifiedReaction(.82,.99);
    }
  }finally{window.duckMusic?.(false)}
}
say=function(){};
react=async function(g){
  const t=tier(g.diamonds),n=nameClean(g.displayName||g.uniqueId);clearTimeout(timer);
  who.textContent=n;meta.textContent=`${g.giftName||'Hediye'} x${g.repeatCount||1}${g.diamonds?` • ${g.diamonds} elmas`:''}`;ico.textContent=t.i;
  gift.classList.add('show');crew.className='crew '+t.c;bubbles(n);
  if(t.c==='react-mid'){stage.classList.add('shake');setTimeout(()=>stage.classList.remove('shake'),900)}
  if(t.c==='react-high'||t.c==='react-max'){burst.classList.remove('on');void burst.offsetWidth;burst.classList.add('on')}
  if(t.c==='react-max'){flash.classList.remove('on');void flash.offsetWidth;flash.classList.add('on')}
  const voice=humanReaction(n,g);await Promise.all([voice,sleep(Math.max(t.t,2600))]);crew.className='crew';gift.classList.remove('show');
};
const oldStart=$('#start').onclick;
$('#start').onclick=()=>{unlocked=true;oldStart?.();const a=new Audio(VERIFIED_REACTION);a.preload='auto';try{a.load()}catch{};getPhraseVoice('Furkan','mid',0).catch(()=>{});try{speechSynthesis?.getVoices?.()}catch{}};
