let chantContext=null,chantMaster=null,roomDelay=null;
const chantBuffers=new Map();
function ensureChantContext(){
  if(!chantContext){
    const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return null;chantContext=new AC();
    chantMaster=chantContext.createDynamicsCompressor();chantMaster.threshold.value=-18;chantMaster.knee.value=18;chantMaster.ratio.value=3.2;chantMaster.attack.value=.008;chantMaster.release.value=.24;
    const master=chantContext.createGain();master.gain.value=1.02;chantMaster.connect(master).connect(chantContext.destination);
    roomDelay=chantContext.createDelay(.15);roomDelay.delayTime.value=.055;const wet=chantContext.createGain();wet.gain.value=.09;roomDelay.connect(wet).connect(chantMaster);
  }
  if(chantContext.state==='suspended')chantContext.resume().catch(()=>{});return chantContext;
}
window.unlockReactionAudio=()=>ensureChantContext();
async function getVoiceBuffer(text,lang='tr'){
  const useLang=lang==='en'?'en':'tr',key=useLang+':'+String(text).toLowerCase();if(chantBuffers.has(key))return chantBuffers.get(key);
  const job=(async()=>{const r=await fetch('/voice?lang='+useLang+'&text='+encodeURIComponent(text),{cache:'force-cache'});if(!r.ok)throw new Error('voice unavailable');const bytes=await r.arrayBuffer(),ctx=ensureChantContext();if(!ctx)throw new Error('audio unavailable');return ctx.decodeAudioData(bytes.slice(0))})();
  chantBuffers.set(key,job);try{return await job}catch(e){chantBuffers.delete(key);throw e}
}
function sourceVoice(buffer,when,{rate=1,gain=1,pan=0,detune=0,room=.07}={}){const ctx=ensureChantContext();if(!ctx)return;const src=ctx.createBufferSource();src.buffer=buffer;src.playbackRate.value=rate;if('detune'in src)src.detune.value=detune;const g=ctx.createGain();g.gain.value=gain;let out=g;if(ctx.createStereoPanner){const p=ctx.createStereoPanner();p.pan.value=pan;g.connect(p);out=p}out.connect(chantMaster);if(roomDelay&&room>0){const send=ctx.createGain();send.gain.value=room;out.connect(send).connect(roomDelay)}src.connect(g);src.start(when)}
function crowdLayer(buffer,when,energy=1){const settings=energy>1.25?[[-.68,-18,.34],[0,0,.43],[.68,16,.34]]:[[-.55,-10,.28],[0,0,.36],[.55,11,.28]];settings.forEach(([pan,detune,gain],i)=>sourceVoice(buffer,when+i*.022,{rate:i===0?.992:i===2?1.008:1,gain:gain*energy,pan,detune,room:.11}))}
function pick(a){return a[Math.floor(Math.random()*a.length)]}function norm(s=''){return String(s).toLocaleLowerCase('tr-TR')}
function danceForGift(g){const n=norm(g.giftName),d=Number(g.diamonds||1);if(/rose|gül/.test(n))return'dance-wave';if(/heart|kalp/.test(n))return'dance-heart';if(/perfume|parfüm/.test(n))return'dance-clap';if(/swan|kuğu/.test(n))return'dance-sway';if(/lion|aslan/.test(n))return'dance-stomp';if(/universe|galaxy|evren|galaksi/.test(n))return'dance-frenzy';if(d>=1000)return'dance-jump';if(d>=500)return'dance-stomp';if(d>=100)return'dance-clap';if(d>=10)return'dance-sway';return'dance-wave'}
function linesFor(name,g){const d=Number(g.diamonds||1),n=norm(g.giftName);let first;if(/universe|galaxy|evren|galaksi/.test(n))first={text:`${name}, maşallah!`,lang:'tr'};else if(/lion|aslan/.test(n))first={text:`Ooo ${name}! Aslan geldi!`,lang:'tr'};else if(/swan|kuğu/.test(n))first={text:`${name}, kuğu için çok teşekkürler!`,lang:'tr'};else if(/perfume|parfüm/.test(n))first={text:`${name}, parfüm geldi! Teşekkürler!`,lang:'tr'};else if(/heart|kalp/.test(n))first={text:`${name}, thank you!`,lang:'en'};else first={text:`${name}, teşekkürler!`,lang:'tr'};
  const arr=[{...first,at:.04}];
  if(d>=1000){arr.push({text:'Thank you so much!',lang:'en',at:.82,crowd:true,energy:1.3},{text:pick(['Maşallah!','Helal olsun!','Eyvallah!']),lang:'tr',at:1.58,crowd:true,energy:1.18},{text:`Çok teşekkürler ${name}!`,lang:'tr',at:2.3},{text:'Thank you!',lang:'en',at:3.05,crowd:true,energy:1.15});return arr}
  if(d>=500){arr.push({text:'Thank you so much!',lang:'en',at:.78,crowd:true,energy:1.22},{text:pick(['Maşallah!','Eyvallah!','Çok teşekkürler!']),lang:'tr',at:1.52,crowd:true,energy:1.1},{text:`Sağ ol ${name}!`,lang:'tr',at:2.22});return arr}
  if(d>=100){arr.push({text:pick(['Thank you!','Thank you so much!']),lang:'en',at:.76,crowd:true,energy:1.12},{text:pick(['Maşallah!','Teşekkürler!','Eyvallah!']),lang:'tr',at:1.45,crowd:true});return arr}
  if(d>=10){arr.push({text:'Thank you!',lang:'en',at:.72,crowd:true,energy:1.05},{text:pick(['Teşekkürler!','Maşallah!','Sağ ol!']),lang:'tr',at:1.34,crowd:true});return arr}
  arr.push({text:pick(['Thank you!','Teşekkürler!','Sağ ol!']),lang:Math.random()>.48?'en':'tr',at:.7,crowd:true});return arr
}
async function playReaction(name,g){const lines=linesFor(name,g);try{const ctx=ensureChantContext();if(!ctx)return;const prepared=await Promise.all(lines.map(async line=>({line,buffer:await getVoiceBuffer(line.text,line.lang)})));const base=ctx.currentTime+.06;prepared.forEach(({line,buffer})=>{if(line.crowd)crowdLayer(buffer,base+line.at,line.energy||1);else sourceVoice(buffer,base+line.at,{rate:1,gain:1.0,room:.08})})}catch(e){console.warn('voice fallback',e)}}
window.handleGift=async function(g){const n=nameClean(g.displayName||g.uniqueId),d=Number(g.diamonds||1),dance=danceForGift(g);who.textContent=n;meta.textContent=`${g.giftName||'Hediye'} x${g.repeatCount||1}${d?` • ${d} elmas`:''}`;ico.textContent=d>=5000?'🌌':d>=1000?'🦁':d>=500?'🦢':d>=100?'✨':d>=10?'🎁':'🌹';gift.classList.add('show');crew.className='crew '+dance+(d>=500?' face-hype':'');bubbles(d>=500?'Maşallah!':'Thank you!');window.duckMusic?.(true);playReaction(n,g);if(d>=100){burst.classList.remove('on');void burst.offsetWidth;burst.classList.add('on')}if(d>=1000){flash.classList.remove('on');void flash.offsetWidth;flash.classList.add('on');stage.classList.add('shake');setTimeout(()=>stage.classList.remove('shake'),900)}const t=d>=1000?4100:d>=500?3300:d>=100?2500:d>=10?2100:1700;await new Promise(r=>setTimeout(r,t));crew.className='crew';gift.classList.remove('show');window.duckMusic?.(false)};
