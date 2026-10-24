const VERIFIED_REACTION='/real-reaction.ogg?v=21';
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}

let selectedNaturalVoice=null;
let voiceSelect=null;
const reactionWords={
  low:['TEŞEKKÜRLER!','THANK YOU!','SAĞ OL!'],
  mid:['MAŞALLAH!','ÇOK TEŞEKKÜRLER!','THANK YOU!'],
  big:['MAŞALLAH!','THANK YOU SO MUCH!','ÇOK TEŞEKKÜRLER!'],
  huge:['MAŞALLAH!','ALLAH RAZI OLSUN!','THANK YOU!','ÇOK TEŞEKKÜRLER!']
};

function reactionTier(g){
  const d=Number(g.diamonds||1),giftName=String(g.giftName||'').toLowerCase();
  if(d>=1000||/universe|galaxy|lion|aslan|galaksi|evren/.test(giftName))return 'huge';
  if(d>=100||/swan|kuğu/.test(giftName))return 'big';
  if(d>=10)return 'mid';
  return 'low';
}
function voiceScore(v){
  const n=(v?.name||'').toLowerCase(),l=(v?.lang||'').toLowerCase();let s=0;
  if(l==='tr-tr')s+=120;else if(l.startsWith('tr'))s+=90;
  if(n.includes('natural'))s+=100;
  if(n.includes('online'))s+=75;
  if(n.includes('google'))s+=65;
  if(n.includes('ahmet'))s+=55;
  if(n.includes('microsoft'))s+=45;
  if(n.includes('male'))s+=12;
  if(v?.localService===false)s+=15;
  return s;
}
function refreshNaturalVoices(){
  if(!window.speechSynthesis)return;
  const all=[...(speechSynthesis.getVoices?.()||[])];
  const sorted=all.sort((a,b)=>voiceScore(b)-voiceScore(a));
  const turkish=sorted.filter(v=>(v.lang||'').toLowerCase().startsWith('tr'));
  selectedNaturalVoice=turkish[0]||sorted[0]||null;
  if(voiceSelect){
    const previous=voiceSelect.value;
    voiceSelect.innerHTML='';
    (turkish.length?turkish:sorted.slice(0,12)).forEach((v,i)=>{
      const o=document.createElement('option');o.value=String(all.indexOf(v));o.textContent=`${i===0?'★ ':''}${v.name} (${v.lang})`;voiceSelect.appendChild(o);
    });
    if(previous&&[...voiceSelect.options].some(o=>o.value===previous))voiceSelect.value=previous;
  }
}
function addVoiceControl(){
  const panel=$('#panel');if(!panel||$('#voiceChoice'))return;
  const sep=document.createElement('div');sep.className='sep';
  const label=document.createElement('label');label.textContent='Seslendirme sesi';
  voiceSelect=document.createElement('select');voiceSelect.id='voiceChoice';voiceSelect.style.cssText='width:100%;padding:11px 12px;border-radius:12px;border:1px solid #ffffff2a;background:#262b24;color:white;outline:none';
  const hint=document.createElement('small');hint.id='voiceHint';hint.textContent='★ işaretli ses cihazındaki en doğal Türkçe ses olarak seçildi.';
  const testName=$('#testName');const parent=testName?.parentElement||panel;
  if(testName){testName.insertAdjacentElement('afterend',sep);sep.insertAdjacentElement('afterend',label);label.insertAdjacentElement('afterend',voiceSelect);voiceSelect.insertAdjacentElement('afterend',hint)}
  else parent.append(sep,label,voiceSelect,hint);
  voiceSelect.onchange=()=>{
    const all=[...(speechSynthesis.getVoices?.()||[])];const idx=Number(voiceSelect.value);if(all[idx])selectedNaturalVoice=all[idx];
  };
  refreshNaturalVoices();
}
async function speakNameNatural(name,repeat=1){
  if(!unlocked||!window.speechSynthesis||!window.SpeechSynthesisUtterance)return;
  refreshNaturalVoices();
  for(let i=0;i<repeat;i++){
    await new Promise(resolve=>{
      try{
        const u=new SpeechSynthesisUtterance(`${name}!`);
        if(selectedNaturalVoice)u.voice=selectedNaturalVoice;
        u.lang=selectedNaturalVoice?.lang||'tr-TR';
        u.rate=.97;u.pitch=.88;u.volume=1;
        let done=false;const finish=()=>{if(done)return;done=true;resolve()};
        u.onend=finish;u.onerror=finish;
        speechSynthesis.cancel();speechSynthesis.speak(u);setTimeout(finish,2200);
      }catch{resolve()}
    });
    if(i+1<repeat)await sleep(65);
  }
}
async function playRealHumanReaction(volume=1,rate=1){
  return new Promise(resolve=>{
    const a=new Audio(VERIFIED_REACTION);a.preload='auto';a.volume=Math.max(0,Math.min(1,volume));a.playbackRate=rate;
    let done=false;const finish=()=>{if(done)return;done=true;resolve()};
    a.onended=finish;a.onerror=finish;a.play().catch(finish);setTimeout(finish,2500);
  });
}
function popReactionBubbles(name,rt){
  const words=reactionWords[rt];
  $$('.d').forEach((d,i)=>setTimeout(()=>{
    const b=d.querySelector('.bubble');
    b.textContent=i===4?name:words[(i+Math.floor(Math.random()*words.length))%words.length];
    b.classList.remove('pop');void b.offsetWidth;b.classList.add('pop');
  },i===4?0:330+i*90));
}
async function humanReaction(name,g){
  const rt=reactionTier(g),d=Number(g.diamonds||1);
  window.duckMusic?.(true);
  try{
    await speakNameNatural(name,rt==='huge'?2:1);
    await sleep(35);
    await playRealHumanReaction(1,1);
    if(rt==='big'){
      await sleep(80);await playRealHumanReaction(.92,1.015);
    }
    if(rt==='huge'){
      await sleep(60);await speakNameNatural(name,1);await sleep(35);await playRealHumanReaction(.98,1.02);await sleep(55);await playRealHumanReaction(.9,.99);
    }
  }finally{window.duckMusic?.(false)}
}

say=function(){};
try{speechSynthesis?.cancel?.()}catch{}
if(window.speechSynthesis)speechSynthesis.onvoiceschanged=()=>refreshNaturalVoices();

react=async function(g){
  const t=tier(g.diamonds),n=nameClean(g.displayName||g.uniqueId),rt=reactionTier(g);clearTimeout(timer);
  who.textContent=n;meta.textContent=`${g.giftName||'Hediye'} x${g.repeatCount||1}${g.diamonds?` • ${g.diamonds} elmas`:''}`;ico.textContent=t.i;
  gift.classList.add('show');crew.className='crew '+t.c;popReactionBubbles(n,rt);
  if(t.c==='react-mid'){stage.classList.add('shake');setTimeout(()=>stage.classList.remove('shake'),900)}
  if(t.c==='react-high'||t.c==='react-max'){burst.classList.remove('on');void burst.offsetWidth;burst.classList.add('on')}
  if(t.c==='react-max'){flash.classList.remove('on');void flash.offsetWidth;flash.classList.add('on')}
  const voice=humanReaction(n,g);await Promise.all([voice,sleep(Math.max(t.t,2600))]);crew.className='crew';gift.classList.remove('show');
};

addVoiceControl();refreshNaturalVoices();
const oldStart=$('#start').onclick;
$('#start').onclick=()=>{unlocked=true;oldStart?.();refreshNaturalVoices();const a=new Audio(VERIFIED_REACTION);a.preload='auto';try{a.load()}catch{}};
