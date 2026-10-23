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

async function getVoiceBuffer(text,lang='tr'){
  const useLang=lang==='en'?'en':'tr';
  const key=useLang+':'+String(text).toLocaleLowerCase(useLang==='tr'?'tr-TR':'en-US');
  if(chantBuffers.has(key))return chantBuffers.get(key);
  const job=(async()=>{
    const r=await fetch('/voice?lang='+useLang+'&text='+encodeURIComponent(text),{cache:'force-cache'});
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
  const src=ctx.createBufferSource();src.buffer=buffer;src.playbackRate.value=rate;
  const g=ctx.createGain();g.gain.value=gain;
  if(ctx.createStereoPanner){const p=ctx.createStereoPanner();p.pan.value=pan;src.connect(g).connect(p).connect(chantMaster)}
  else src.connect(g).connect(chantMaster);
  src.start(when);
}

function fallbackVoices(){
  const v=speechSynthesis?.getVoices?.()||[];
  return v.filter(x=>/^tr/i.test(x.lang)).sort((a,b)=>/Google|Natural|Online|Ahmet|Tolga/i.test(b.name)-/Google|Natural|Online|Ahmet|Tolga/i.test(a.name));
}

say=function(txt,rate=1,pitch=1){
  if(!unlocked||!('speechSynthesis'in window))return;
  const u=new SpeechSynthesisUtterance(txt);u.lang='tr-TR';u.rate=rate;u.pitch=pitch;u.volume=1;
  const best=fallbackVoices()[0];if(best)u.voice=best;speechSynthesis.speak(u);
};

function pick(list){return list[Math.floor(Math.random()*list.length)]}
function norm(s=''){return String(s).toLocaleLowerCase('tr-TR')}
function giftHash(s=''){return [...String(s)].reduce((a,c)=>(a*31+c.charCodeAt(0))>>>0,7)}

function crowdLayer(buffer,when,energy=1){
  const rates=energy>1.2?[.86,.93,1,1.08,1.15]:[.9,.96,1.01,1.065,1.12];
  const pans=[-.88,-.42,0,.42,.88];
  const gains=energy>1.2?[.27,.37,.43,.37,.27]:[.22,.32,.37,.32,.22];
  rates.forEach((rate,i)=>sourceVoice(buffer,when+i*.015,rate,gains[i],pans[i]));
}

function danceForGift(g){
  const n=norm(g.giftName),d=Number(g.diamonds||1),h=giftHash(g.giftName||'gift');
  if(/rose|gül/.test(n))return'dance-wave';
  if(/heart|kalp/.test(n))return'dance-heart';
  if(/perfume|parfüm/.test(n))return'dance-clap';
  if(/swan|kuğu/.test(n))return'dance-sway';
  if(/lion|aslan/.test(n))return'dance-stomp';
  if(/universe|galaxy|evren|galaksi/.test(n))return'dance-frenzy';
  if(d>=5000)return['dance-frenzy','dance-spin','dance-jump'][h%3];
  if(d>=1000)return['dance-spin','dance-stomp','dance-jump'][h%3];
  if(d>=500)return['dance-stomp','dance-clap','dance-sway'][h%3];
  if(d>=100)return['dance-clap','dance-sway','dance-wave'][h%3];
  if(d>=10)return['dance-wave','dance-heart','dance-sway'][h%3];
  return['dance-wave','dance-bounce','dance-heart'][h%3];
}

function giftSpecificLine(g,name){
  const n=norm(g.giftName);
  if(/rose|gül/.test(n))return{ text:`${name}, gül için teşekkürler!`, lang:'tr' };
  if(/heart|kalp/.test(n))return{ text:`${name}, kalp geldi!`, lang:'tr' };
  if(/perfume|parfüm/.test(n))return{ text:`${name}, parfüm için çok teşekkürler!`, lang:'tr' };
  if(/swan|kuğu/.test(n))return{ text:`Kuğu geldi! Maşallah ${name}!`, lang:'tr' };
  if(/lion|aslan/.test(n))return{ text:`Aslan geldi! Ooo ${name}!`, lang:'tr' };
  if(/universe|evren/.test(n))return{ text:'TikTok Universe! Thank you so much!', lang:'en' };
  if(/galaxy|galaksi/.test(n))return{ text:'Galaxy! Thank you so much!', lang:'en' };
  return null;
}

function reactionLines(name,g){
  const d=Number(g.diamonds||1),special=giftSpecificLine(g,name),lines=[];
  if(special)lines.push({...special,at:.04});
  else lines.push({text:pick([`${name}!`,`${name}, teşekkürler!`,`Eyvallah ${name}!`]),lang:'tr',at:.04});

  if(d>=5000){
    lines.push({text:'Thank you so much!',lang:'en',at:.7,crowd:true,energy:1.45});
    lines.push({text:pick([`Maşallah ${name}!`,`Helal olsun ${name}!`,`Çok teşekkürler ${name}!`]),lang:'tr',at:1.45});
    lines.push({text:'Thank you! Thank you!',lang:'en',at:2.15,crowd:true,energy:1.4});
    lines.push({text:pick(['Maşallah!','Eyvallah!','Helal olsun!']),lang:'tr',at:2.9,crowd:true,energy:1.35});
    lines.push({text:'Thank you so much!',lang:'en',at:3.55,crowd:true,energy:1.35});
    return lines;
  }
  if(d>=1000){
    lines.push({text:'Thank you so much!',lang:'en',at:.68,crowd:true,energy:1.4});
    lines.push({text:pick([`Maşallah ${name}!`,`Çok teşekkürler ${name}!`,`Helal olsun ${name}!`]),lang:'tr',at:1.4});
    lines.push({text:'Thank you!',lang:'en',at:2.05,crowd:true,energy:1.3});
    lines.push({text:pick(['Maşallah!','Eyvallah!']),lang:'tr',at:2.7,crowd:true,energy:1.25});
    return lines;
  }
  if(d>=500){
    lines.push({text:'Thank you so much!',lang:'en',at:.65,crowd:true,energy:1.32});
    lines.push({text:pick([`Maşallah ${name}!`,`Çok teşekkürler ${name}!`,`Eyvallah ${name}!`]),lang:'tr',at:1.35});
    lines.push({text:pick(['Thank you!','Thank you, thank you!']),lang:'en',at:2,crowd:true,energy:1.25});
    return lines;
  }
  if(d>=100){
    lines.push({text:pick(['Thank you!','Thank you so much!']),lang:'en',at:.62,crowd:true,energy:1.22});
    lines.push({text:pick(['Maşallah!','Çok teşekkürler!','Eyvallah!']),lang:'tr',at:1.25,crowd:true,energy:1.16});
    lines.push({text:`Sağ ol ${name}!`,lang:'tr',at:1.9});
    return lines;
  }
  if(d>=10){
    lines.push({text:'Thank you!',lang:'en',at:.58,crowd:true,energy:1.1});
    lines.push({text:pick(['Maşallah!','Teşekkürler!','Eyvallah!']),lang:'tr',at:1.15,crowd:true});
    return lines;
  }
  lines.push({text:pick(['Thank you!','Teşekkürler!','Sağ ol!']),lang:Math.random()>.45?'en':'tr',at:.58,crowd:true});
  return lines;
}

async function livelyThanks(name,g){
  if(!unlocked)return;
  const lines=reactionLines(name,g);
  try{
    const ctx=ensureChantContext();if(!ctx)return;
    const prepared=await Promise.all(lines.map(async line=>({line,buffer:await getVoiceBuffer(line.text,line.lang||'tr')})));
    const base=ctx.currentTime+.05;
    prepared.forEach(({line,buffer})=>{
      const when=base+line.at;
      if(line.crowd)crowdLayer(buffer,when,line.energy||1);
      else sourceVoice(buffer,when,line.leaderRate||.93,line.leaderGain||1.04,0);
    });
  }catch(err){
    try{speechSynthesis.cancel()}catch{}
    lines.forEach((line,i)=>setTimeout(()=>say(line.text,line.crowd?1.07:.96,line.crowd?1.03:.84),i*560));
  }
}

react=async function(g){
  const n=nameClean(g.displayName||g.uniqueId),d=Number(g.diamonds||1),dance=danceForGift(g);
  clearTimeout(timer);who.textContent=n;meta.textContent=`${g.giftName||'Hediye'} x${g.repeatCount||1}${d?` • ${d} elmas`:''}`;
  ico.textContent=d>=5000?'🌌':d>=1000?'🦁':d>=500?'🦢':d>=100?'✨':d>=10?'🎁':'🌹';
  gift.classList.add('show');crew.className='crew '+dance+(d>=500?' face-hype':'');bubbles(n);
  try{speechSynthesis.cancel()}catch{}livelyThanks(n,g);
  if(d>=100){burst.classList.remove('on');void burst.offsetWidth;burst.classList.add('on')}
  if(d>=1000){flash.classList.remove('on');void flash.offsetWidth;flash.classList.add('on');stage.classList.add('shake');setTimeout(()=>stage.classList.remove('shake'),1400)}
  const speechTime=d>=5000?4700:d>=1000?3900:d>=500?3300:d>=100?2800:d>=10?2200:1800;
  await new Promise(r=>setTimeout(r,speechTime));crew.className='crew';gift.classList.remove('show');
};

const originalStart=$('#start').onclick;
$('#start').onclick=()=>{
  ensureChantContext();originalStart?.();
  [['Thank you!','en'],['Thank you so much!','en'],['Maşallah!','tr'],['Teşekkürler!','tr'],['Eyvallah!','tr'],['Helal olsun!','tr']].forEach(([t,l])=>getVoiceBuffer(t,l).catch(()=>{}));
};
