const REAL_CLIPS=['/reaction-real-1.ogg?v=14','/reaction-real-2.ogg?v=14'];
let realClipIndex=0;
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}

// Robotik/TTS sesi tamamen kapalı. İsim ekranda gösterilir, ses gerçek referans videodan gelir.
say=function(){};
try{speechSynthesis?.cancel?.()}catch{}

function nextRealClip(){
  const src=REAL_CLIPS[realClipIndex%REAL_CLIPS.length];
  realClipIndex=(realClipIndex+1)%REAL_CLIPS.length;
  return src;
}

async function playRealClip(volume=1,rate=1){
  const src=nextRealClip();
  return new Promise(resolve=>{
    const a=new Audio(src);
    a.preload='auto';
    a.volume=Math.max(0,Math.min(1,volume));
    a.playbackRate=rate;
    let done=false;
    const finish=()=>{if(done)return;done=true;resolve()};
    a.onended=finish;a.onerror=finish;
    a.play().catch(finish);
    setTimeout(finish,2400);
  });
}

async function humanReaction(g){
  const d=Number(g.diamonds||1);
  const giftName=String(g.giftName||'').toLowerCase();
  const huge=d>=1000||/universe|galaxy|lion|aslan|galaksi|evren/.test(giftName);
  const big=d>=100||/swan|kuğu/.test(giftName);
  const mid=d>=10;
  window.duckMusic?.(true);
  try{
    if(huge){
      await playRealClip(1,1);
      await sleep(90);
      await playRealClip(.98,1.015);
      await sleep(80);
      await playRealClip(.95,.99);
    }else if(big){
      await playRealClip(1,1);
      await sleep(90);
      await playRealClip(.96,1.01);
    }else if(mid){
      await playRealClip(1,1);
      await sleep(80);
      await playRealClip(.92,1.015);
    }else{
      await playRealClip(1,1);
    }
  }finally{
    window.duckMusic?.(false);
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
  if(t.c==='react-mid'){stage.classList.add('shake');setTimeout(()=>stage.classList.remove('shake'),900)}
  if(t.c==='react-high'||t.c==='react-max'){burst.classList.remove('on');void burst.offsetWidth;burst.classList.add('on')}
  if(t.c==='react-max'){flash.classList.remove('on');void flash.offsetWidth;flash.classList.add('on')}
  const voice=humanReaction(g);
  await Promise.all([voice,sleep(t.t)]);
  crew.className='crew';
  gift.classList.remove('show');
};

const oldStart=$('#start').onclick;
$('#start').onclick=()=>{
  unlocked=true;
  oldStart?.();
  REAL_CLIPS.forEach(src=>{const a=new Audio(src);a.preload='auto';try{a.load()}catch{}});
};
