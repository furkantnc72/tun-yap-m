import express from 'express';
import http from 'http';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { Server } from 'socket.io';
import { EdgeTTS } from 'node-edge-tts';
import { TikTokLiveConnection, WebcastEvent } from 'tiktok-live-connector';

const app=express(),server=http.createServer(app),io=new Server(server,{cors:{origin:'*'}});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const voices={
  tr:new EdgeTTS({voice:'tr-TR-AhmetNeural',lang:'tr-TR',outputFormat:'audio-24khz-96kbitrate-mono-mp3',pitch:'-4%',rate:'-2%',volume:'+35%',timeout:18000}),
  en:new EdgeTTS({voice:'en-US-GuyNeural',lang:'en-US',outputFormat:'audio-24khz-96kbitrate-mono-mp3',pitch:'-4%',rate:'-2%',volume:'+35%',timeout:18000})
};
const voiceCache=new Map(),voiceInflight=new Map();
let ttsTail=Promise.resolve(),lastTtsAt=0;
const voiceState={tr:'idle',en:'idle'};
const indexPath=path.join(process.cwd(),'public','index.html');
const musicDataPath=path.join(process.cwd(),'public','bahar-loop.b64');
let musicBuffer=null;

async function getMusic(){
  if(musicBuffer)return musicBuffer;
  const b64=(await fs.readFile(musicDataPath,'utf8')).trim();
  const b=Buffer.from(b64,'base64');
  if(b.length<5000)throw new Error('music data too small');
  musicBuffer=b;return b;
}

app.use(express.static('public',{index:false,maxAge:'1h'}));
app.get('/',async(_req,res)=>{try{const html=await fs.readFile(indexPath,'utf8');res.set('Cache-Control','no-store');res.type('html').send(html.replace('</body>','<script src="/panel-upgrade.js?v=9"></script><script src="/voice-upgrade.js?v=9"></script></body>'))}catch(e){console.error('index-error',e);res.status(500).send('Site yüklenemedi')}});
app.get('/background-music.ogg',async(_req,res)=>{try{const b=await getMusic();res.set({'Content-Type':'audio/ogg','Content-Length':String(b.length),'Cache-Control':'no-store'});res.send(b)}catch(e){console.error('music-error',e);res.status(500).end()}});
app.get('/health',async(_req,res)=>{let musicBytes=0;try{musicBytes=(await getMusic()).length}catch{}res.json({ok:true,voiceMode:'queued-neural-v9',voiceState,musicBytes,time:new Date().toISOString()})});

function cleanVoiceText(v=''){return String(v).replace(/[_.]+/g,' ').replace(/[^\p{L}\p{N} çğıöşüÇĞİÖŞÜ!?,.'-]/gu,'').replace(/\s+/g,' ').trim().slice(0,120)}
async function synthOnce(text,l){
  const tmp=path.join(os.tmpdir(),`voice-${crypto.randomUUID()}.mp3`);
  try{
    const since=Date.now()-lastTtsAt;if(since<900)await wait(900-since);
    let lastErr;
    for(let attempt=0;attempt<5;attempt++){
      try{
        await voices[l].ttsPromise(text,tmp);
        lastTtsAt=Date.now();
        const b=await fs.readFile(tmp);
        if(!b.length)throw new Error('empty voice');
        return b;
      }catch(e){
        lastErr=e;
        const is429=/429|too many requests/i.test(String(e?.message||e));
        if(!is429||attempt===4)throw e;
        await wait([1400,2400,4000,6500,9000][attempt]);
      }
    }
    throw lastErr;
  }finally{fs.unlink(tmp).catch(()=>{})}
}
async function synthesizeText(text,lang='tr'){
  const l=lang==='en'?'en':'tr',key=l+':'+text.toLowerCase();
  if(voiceCache.has(key))return voiceCache.get(key);
  if(voiceInflight.has(key))return voiceInflight.get(key);
  const run=ttsTail.catch(()=>{}).then(()=>synthOnce(text,l));
  ttsTail=run.then(()=>undefined,()=>undefined);
  const job=run.then(b=>{if(voiceCache.size>300)voiceCache.delete(voiceCache.keys().next().value);voiceCache.set(key,b);return b});
  voiceInflight.set(key,job);try{return await job}finally{voiceInflight.delete(key)}
}
app.get('/voice',async(req,res)=>{let text=cleanVoiceText(req.query?.text??req.query?.name),lang=req.query?.lang==='en'?'en':'tr';if(!text)return res.status(400).end();if(!/[!?.]$/.test(text))text+='!';try{const b=await synthesizeText(text,lang);res.set({'Content-Type':'audio/mpeg','Content-Length':String(b.length),'Cache-Control':'public, max-age=86400'});res.send(b)}catch(e){console.error('voice-error',lang,text,e);res.status(503).end()}});

let liveConnection=null,activeUsername=null,connecting=false,reconnectTimer=null;
function normalizeUsername(v=''){return String(v).trim().replace(/^https?:\/\/(www\.)?tiktok\.com\/@/i,'').replace(/\/live.*$/i,'').replace(/^@/,'').replace(/[^a-zA-Z0-9._-]/g,'').slice(0,64)}
function safeText(v,f=''){const t=String(v??f).replace(/[<>]/g,'').trim();return t.slice(0,80)||f}
function emitStatus(status,message,extra={}){io.emit('tiktok-status',{status,message,username:activeUsername,...extra})}
async function stopTikTok(reason='Bağlantı kapatıldı'){if(reconnectTimer){clearTimeout(reconnectTimer);reconnectTimer=null}const old=liveConnection;liveConnection=null;connecting=false;if(old){try{old.disconnect()}catch{}}emitStatus('disconnected',reason)}
async function startTikTok(username){
  const clean=normalizeUsername(username);if(!clean)throw new Error('Geçerli bir TikTok kullanıcı adı gir.');if(connecting)throw new Error('Bağlantı kuruluyor.');if(liveConnection)await stopTikTok('Yeni hesaba geçiliyor…');activeUsername=clean;connecting=true;emitStatus('connecting',`@${clean} canlı yayınına bağlanılıyor…`);
  const connection=new TikTokLiveConnection(clean,{processInitialData:false,enableExtendedGiftInfo:true,fetchRoomInfoOnConnect:true});liveConnection=connection;
  connection.on(WebcastEvent.GIFT,event=>{try{if(event?.gift?.type===1&&Number(event?.repeatEnd)!==1)return;const repeatCount=Math.max(1,Number(event?.repeatCount||1)),giftName=safeText(event?.gift?.name||event?.extendedGiftInfo?.name||`Hediye #${event?.giftId??''}`,'Hediye'),diamondsPerGift=Math.max(0,Number(event?.gift?.diamondCount??event?.extendedGiftInfo?.diamondCount??0)),diamonds=diamondsPerGift*repeatCount,displayName=safeText(event?.user?.nickname||event?.user?.displayId||event?.user?.uniqueId,'Misafir'),uniqueId=safeText(event?.user?.uniqueId||event?.user?.displayId||'','misafir');io.emit('gift',{id:`${Date.now()}-${Math.random().toString(36).slice(2)}`,displayName,uniqueId,giftName,giftId:String(event?.giftId??''),repeatCount,diamonds,diamondsPerGift})}catch(e){console.error('gift-handler',e)}});
  connection.on('disconnected',()=>{connecting=false;if(liveConnection!==connection)return;emitStatus('reconnecting',`@${clean} bağlantısı koptu; yeniden deneniyor…`);reconnectTimer=setTimeout(()=>{if(activeUsername===clean)startTikTok(clean).catch(e=>emitStatus('error',e.message))},5000)});
  connection.on('error',e=>emitStatus('error',e?.message||'TikTok bağlantı hatası'));
  try{const state=await connection.connect();connecting=false;emitStatus('connected',`@${clean} bağlandı`,{roomId:String(state?.roomId??'')});return state}catch(e){connecting=false;if(liveConnection===connection)liveConnection=null;throw e}
}

io.on('connection',socket=>{
  socket.emit('tiktok-status',{status:liveConnection?'connected':'disconnected',message:liveConnection?`@${activeUsername} bağlı`:'TikTok bağlı değil',username:activeUsername});
  socket.on('connect-tiktok',async({username}={},ack=()=>{})=>{try{const state=await startTikTok(username);ack({ok:true,roomId:String(state?.roomId??'')})}catch(e){const m=e?.message||'Bağlanamadı';emitStatus('error',m);ack({ok:false,error:m})}});
  socket.on('disconnect-tiktok',async(_p,ack=()=>{})=>{await stopTikTok();activeUsername=null;ack({ok:true})});
  socket.on('simulate-gift',(p={},ack=()=>{})=>{const d=Math.max(1,Math.min(100000,Number(p.diamonds||1)));io.emit('gift',{id:`${Date.now()}-test`,displayName:safeText(p.displayName,'Furkan'),uniqueId:'test_user',giftName:safeText(p.giftName,d>=500?'Lion':d>=100?'Swan':d>=10?'Perfume':'Rose'),giftId:'test',repeatCount:1,diamonds:d,diamondsPerGift:d});ack({ok:true})});
});

const PORT=Number(process.env.PORT||3000);
server.listen(PORT,'0.0.0.0',()=>{
  console.log(`TikTok Dance Live running on http://0.0.0.0:${PORT}`);
  getMusic().then(b=>console.log('MUSIC READY',b.length,'bytes')).catch(e=>console.error('MUSIC WARMUP FAIL',e));
  (async()=>{
    await wait(2200);
    voiceState.tr='warming';
    try{const b=await synthesizeText('Teşekkürler!','tr');voiceState.tr='ready';console.log('TR VOICE READY',b.length,'bytes')}catch(e){voiceState.tr='retry-on-demand';console.error('TR VOICE WARMUP FAIL',e)}
    await wait(1300);
    voiceState.en='warming';
    try{const b=await synthesizeText('Thank you!','en');voiceState.en='ready';console.log('EN VOICE READY',b.length,'bytes')}catch(e){voiceState.en='retry-on-demand';console.error('EN VOICE WARMUP FAIL',e)}
  })();
});
