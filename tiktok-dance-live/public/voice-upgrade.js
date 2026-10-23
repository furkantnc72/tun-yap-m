const voiceCache=new Map();
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
function pick(a){return a[Math.floor(Math.random()*a.length)]}
try{speechSynthesis?.cancel?.()}catch{}
say=function(){};

async function getVoice(text){
  const key=String(text||'').trim();
  if(voiceCache.has(key))return voiceCache.get(key);
  const r=await fetch('/voice?text='+encodeURIComponent(key),{cache:'force-cache'});
  if(!r.ok)throw new Error('voice '+r.status);
  const blob=await r.blob();if(blob.size<1000)throw new Error('empty voice');
  const url=URL.createObjectURL(blob);
  if(voiceCache.size>100){const k=voiceCache.keys().next().value;URL.revokeObjectURL(voiceCache.get(k));voiceCache.delete(k)}
  voiceCache.set(key,url);return url;
}
async function playClip(text,volume=1,rate=1){
  const url=await getVoice(text);
  return new Promise(resolve=>{const a=new Audio(url);a.volume=volume;a.playbackRate=rate;a.onended=resolve;a.onerror=resolve;a.play().catch(resolve)});
}
async function playCrowd(text){
  const url=await getVoice(text);
  const layers=[{d:0,r:.96,v:.82},{d:55,r:1.0,v:.72},{d:105,r:1.035,v:.58}];
  await Promise.all(layers.map(x=>new Promise(resolve=>setTimeout(()=>{const a=new Audio(url);a.volume=x.v;a.playbackRate=x.r;a.onended=resolve;a.onerror=resolve;a.play().catch(resolve)},x.d))));
}
function script(name,g){
  const d=Number(g.diamonds||1),gift=String(g.giftName||'').toLowerCase();
  if(d>=1000||/universe|galaxy|lion|aslan|galaksi|evren/.test(gift))return{lead:pick([`${name}! Maşallah!`,`${name}! Çok teşekkürler!`,`${name}! Thank you so much!`]),crowd:pick(['Maşallah!','Thank you so much!','Helal olsun!'])};
  if(d>=100||/swan|kuğu/.test(gift))return{lead:pick([`${name}! Maşallah!`,`${name}! Teşekkürler!`,`${name}! Thank you!`]),crowd:pick(['Maşallah!','Thank you!','Eyvallah!'])};
  if(d>=10)return{lead:pick([`${name}! Teşekkürler!`,`${name}! Sağ ol!`,`${name}! Thank you!`]),crowd:pick(['Teşekkürler!','Thank you!','Eyvallah!'])};
  return{lead:pick([`${name}! Sağ ol!`,`${name}! Teşekkürler!`]),crowd:pick(['Thank you!','Teşekkürler!'])};
}
async function humanReaction(name,g){
  const s=script(name,g);window.duckMusic?.(true);
  try{await playClip(s.lead,1,.98);await sleep(100);await playCrowd(s.crowd)}catch(e){console.warn('voice failed',e)}finally{window.duckMusic?.(false)}
}
react=async function(g){
  const t=tier(g.diamonds),n=nameClean(g.displayName||g.uniqueId);clearTimeout(timer);
  who.textContent=n;meta.textContent=`${g.giftName||'Hediye'} x${g.repeatCount||1}${g.diamonds?` • ${g.diamonds} elmas`:''}`;ico.textContent=t.i;
  gift.classList.add('show');crew.className='crew '+t.c;bubbles(n);
  if(t.c==='react-mid'){stage.classList.add('shake');setTimeout(()=>stage.classList.remove('shake'),900)}
  if(t.c==='react-high'||t.c==='react-max'){burst.classList.remove('on');void burst.offsetWidth;burst.classList.add('on')}
  if(t.c==='react-max'){flash.classList.remove('on');void flash.offsetWidth;flash.classList.add('on')}
  const v=humanReaction(n,g);await Promise.all([v,sleep(t.t)]);crew.className='crew';gift.classList.remove('show');
};
const oldStart=$('#start').onclick;$('#start').onclick=()=>{unlocked=true;oldStart?.();['Maşallah!','Thank you!','Teşekkürler!','Eyvallah!'].forEach(x=>getVoice(x).catch(()=>{}))};