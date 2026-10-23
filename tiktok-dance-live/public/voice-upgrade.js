const naturalVoiceCache=new Map();

function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
function pick(a){return a[Math.floor(Math.random()*a.length)]}

async function voiceUrl(text,lang='tr'){
  const key=lang+':'+text;
  if(naturalVoiceCache.has(key))return naturalVoiceCache.get(key);
  const r=await fetch('/voice?lang='+encodeURIComponent(lang)+'&text='+encodeURIComponent(text),{cache:'force-cache'});
  if(!r.ok)throw new Error('voice '+r.status);
  const blob=await r.blob();
  const url=URL.createObjectURL(blob);
  if(naturalVoiceCache.size>80){
    const first=naturalVoiceCache.keys().next().value;
    URL.revokeObjectURL(naturalVoiceCache.get(first));
    naturalVoiceCache.delete(first);
  }
  naturalVoiceCache.set(key,url);
  return url;
}

async function playOne(text,lang='tr',volume=1,rate=1){
  const url=await voiceUrl(text,lang);
  return new Promise((resolve,reject)=>{
    const a=new Audio(url);
    a.volume=Math.max(0,Math.min(1,volume));
    a.playbackRate=rate;
    a.onended=resolve;
    a.onerror=reject;
    a.play().catch(reject);
  });
}

async function playGroup(text,lang='tr'){
  const url=await voiceUrl(text,lang);
  const specs=[{delay:0,vol:.9,rate:1},{delay:65,vol:.62,rate:.985},{delay:125,vol:.52,rate:1.015}];
  await Promise.all(specs.map(s=>new Promise(resolve=>setTimeout(()=>{
    const a=new Audio(url);a.volume=s.vol;a.playbackRate=s.rate;a.onended=resolve;a.onerror=resolve;a.play().catch(resolve);
  },s.delay))));
}

function fallbackSay(text,lang='tr'){
  if(!('speechSynthesis' in window))return;
  const u=new SpeechSynthesisUtterance(text);
  u.lang=lang==='en'?'en-US':'tr-TR';u.rate=.95;u.pitch=.92;u.volume=1;
  speechSynthesis.speak(u);
}

function reactionScript(name,g){
  const d=Number(g.diamonds||1),gift=String(g.giftName||'').toLowerCase();
  if(d>=1000||/universe|galaxy|lion|aslan|galaksi|evren/.test(gift))return[
    {t:`${name}! Maşallah!`,l:'tr'},
    {t:'Thank you so much!',l:'en',g:1},
    {t:`Çok teşekkürler ${name}!`,l:'tr'},
    {t:pick(['Maşallah!','Eyvallah!','Helal olsun!']),l:'tr',g:1},
    {t:'Thank you!',l:'en',g:1}
  ];
  if(d>=100)return[
    {t:`${name}! Maşallah!`,l:'tr'},
    {t:pick(['Thank you!','Thank you so much!']),l:'en',g:1},
    {t:pick([`Teşekkürler ${name}!`,`Sağ ol ${name}!`,`Eyvallah ${name}!`]),l:'tr'},
    {t:pick(['Maşallah!','Teşekkürler!']),l:'tr',g:1}
  ];
  if(d>=10)return[
    {t:pick([`${name}, teşekkürler!`,`Sağ ol ${name}!`,`Eyvallah ${name}!`]),l:'tr'},
    {t:'Thank you!',l:'en',g:1},
    {t:pick(['Maşallah!','Teşekkürler!','Sağ ol!']),l:'tr',g:1}
  ];
  return[
    {t:pick([`${name}, teşekkürler!`,`Sağ ol ${name}!`]),l:'tr'},
    {t:pick(['Thank you!','Teşekkürler!']),l:Math.random()>.5?'en':'tr',g:1}
  ];
}

async function speakReaction(name,g){
  const lines=reactionScript(name,g);
  window.duckMusic?.(true);
  try{
    for(const line of lines){
      if(line.g)await playGroup(line.t,line.l);
      else await playOne(line.t,line.l,1,1);
      await sleep(90);
    }
  }catch(err){
    console.warn('natural voice fallback',err);
    try{speechSynthesis.cancel()}catch{}
    lines.forEach((line,i)=>setTimeout(()=>fallbackSay(line.t,line.l),i*650));
    await sleep(lines.length*700);
  }finally{
    window.duckMusic?.(false);
  }
}

react=async function(g){
  const t=tier(g.diamonds),n=nameClean(g.displayName||g.uniqueId);
  clearTimeout(timer);
  who.textContent=n;
  meta.textContent=`${g.giftName||'Hediye'} x${g.repeatCount||1}${g.diamonds?` • ${g.diamonds} elmas`:''}`;
  ico.textContent=t.i;gift.classList.add('show');crew.className='crew '+t.c;bubbles(n);
  if(t.c==='react-mid'){stage.classList.add('shake');setTimeout(()=>stage.classList.remove('shake'),900)}
  if(t.c==='react-high'||t.c==='react-max'){burst.classList.remove('on');void burst.offsetWidth;burst.classList.add('on')}
  if(t.c==='react-max'){flash.classList.remove('on');void flash.offsetWidth;flash.classList.add('on')}
  const voice=speakReaction(n,g);
  await Promise.all([voice,sleep(t.t)]);
  crew.className='crew';gift.classList.remove('show');
};

const oldStart=$('#start').onclick;
$('#start').onclick=()=>{
  unlocked=true;
  oldStart?.();
  [['Teşekkürler!','tr'],['Maşallah!','tr'],['Thank you!','en'],['Thank you so much!','en']].forEach(([t,l])=>voiceUrl(t,l).catch(()=>{}));
};
