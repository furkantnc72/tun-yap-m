function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
const phraseCache=new Map();

function reactionTier(g){
  const d=Number(g.diamonds||1),giftName=String(g.giftName||'').toLowerCase();
  if(d>=1000||/universe|galaxy|lion|aslan|galaksi|evren/.test(giftName))return 'huge';
  if(d>=100||/swan|kuğu/.test(giftName))return 'big';
  if(d>=10)return 'mid';
  return 'low';
}
function randomVariant(){return Math.floor(Math.random()*5)}
function reactionLabel(rt,v){
  const sets={
    low:['TEŞEKKÜRLER!','THANK YOU!','SAĞ OL!','MAŞALLAH!','EYVALLAH!'],
    mid:['MAŞALLAH!','THANK YOU!','EYVALLAH!','ÇOK TEŞEKKÜRLER!','MAŞALLAH!'],
    big:['MAŞALLAH!','THANK YOU SO MUCH!','HELAL OLSUN!','ALLAH RAZI OLSUN!','THANK YOU!'],
    huge:['MAŞALLAH!','ALLAH RAZI OLSUN!','THANK YOU SO MUCH!','HELAL OLSUN!','ÇOK TEŞEKKÜRLER!']
  };
  return sets[rt][v];
}
async function getNaturalPhrase(name,rt,v){
  const key=`${String(name||'').toLocaleLowerCase('tr-TR')}|${rt}|${v}`;
  if(phraseCache.has(key))return phraseCache.get(key);
  const r=await fetch(`/reaction-voice?v=22&name=${encodeURIComponent(name)}&tier=${encodeURIComponent(rt)}&variant=${v}`,{cache:'no-store'});
  if(!r.ok)throw new Error(`voice ${r.status}`);
  const blob=await r.blob();
  if(blob.size<3000)throw new Error('voice empty');
  const url=URL.createObjectURL(blob);
  if(phraseCache.size>80){
    const first=phraseCache.keys().next().value;
    URL.revokeObjectURL(phraseCache.get(first));
    phraseCache.delete(first);
  }
  phraseCache.set(key,url);
  return url;
}
async function playNaturalPhrase(name,rt,v,volume=1){
  const url=await getNaturalPhrase(name,rt,v);
  return new Promise(resolve=>{
    const a=new Audio(url);
    a.preload='auto';
    a.volume=Math.max(0,Math.min(1,volume));
    let done=false;
    const finish=()=>{if(done)return;done=true;resolve()};
    a.onended=finish;a.onerror=finish;
    a.play().catch(finish);
    setTimeout(finish,9000);
  });
}
function popReactionBubbles(name,rt,v){
  const label=reactionLabel(rt,v);
  $$('.d').forEach((d,i)=>setTimeout(()=>{
    const b=d.querySelector('.bubble');
    b.textContent=i===4?name:label;
    b.classList.remove('pop');void b.offsetWidth;b.classList.add('pop');
  },i===4?0:260+i*80));
}

say=function(){};
try{speechSynthesis?.cancel?.()}catch{}

react=async function(g){
  const t=tier(g.diamonds),n=nameClean(g.displayName||g.uniqueId),rt=reactionTier(g),v=randomVariant();
  clearTimeout(timer);
  who.textContent=n;
  meta.textContent=`${g.giftName||'Hediye'} x${g.repeatCount||1}${g.diamonds?` • ${g.diamonds} elmas`:''}`;
  ico.textContent=t.i;
  gift.classList.add('show');
  crew.className='crew '+t.c;
  popReactionBubbles(n,rt,v);
  if(t.c==='react-mid'){stage.classList.add('shake');setTimeout(()=>stage.classList.remove('shake'),900)}
  if(t.c==='react-high'||t.c==='react-max'){burst.classList.remove('on');void burst.offsetWidth;burst.classList.add('on')}
  if(t.c==='react-max'){flash.classList.remove('on');void flash.offsetWidth;flash.classList.add('on')}
  const voice=(async()=>{
    window.duckMusic?.(true);
    try{
      await playNaturalPhrase(n,rt,v,1);
      if(rt==='huge'){
        await sleep(110);
        await playNaturalPhrase(n,rt,(v+1)%5,.95);
      }
    }catch(e){
      console.warn('natural voice unavailable',e);
      const st=$('#status');
      if(st)st.textContent='Ses motoru geçici olarak yanıt vermedi.';
    }finally{
      window.duckMusic?.(false);
    }
  })();
  await Promise.all([voice,sleep(Math.max(t.t,3000))]);
  crew.className='crew';
  gift.classList.remove('show');
};

const oldStart=$('#start').onclick;
$('#start').onclick=()=>{
  unlocked=true;
  oldStart?.();
  getNaturalPhrase($('#testName')?.value||'Furkan','mid',0).catch(()=>{});
};
