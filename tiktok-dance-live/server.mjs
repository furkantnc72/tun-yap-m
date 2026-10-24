import express from 'express';
import http from 'http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Server } from 'socket.io';
import { TikTokLiveConnection, WebcastEvent } from 'tiktok-live-connector';

const app=express(),server=http.createServer(app),io=new Server(server,{cors:{origin:'*'}});
const indexPath=path.join(process.cwd(),'public','index.html');
let realReactionBuffer=null;

async function getRealReaction(){
  if(realReactionBuffer)return realReactionBuffer;
  const parts=[];
  for(let i=1;i<=4;i++)parts.push((await fs.readFile(path.join(process.cwd(),'public',`voice-c1-part${i}.b64`),'utf8')).trim());
  const b=Buffer.from(parts.join(''),'base64');
  if(b.length<10000)throw new Error('verified reaction audio too small');
  realReactionBuffer=b;
  return b;
}

app.use(express.static('public',{index:false,maxAge:'1h'}));
app.get('/',async(_req,res)=>{
  try{
    const html=await fs.readFile(indexPath,'utf8');
    res.set('Cache-Control','no-store');
    res.type('html').send(html.replace('</body>','<script src="/panel-upgrade.js?v=21"></script><script src="/voice-upgrade.js?v=21"></script></body>'));
  }catch(e){console.error('index-error',e);res.status(500).send('Site yüklenemedi')}
});
app.get('/real-reaction.ogg',async(_req,res)=>{
  try{
    const b=await getRealReaction();
    res.set({'Content-Type':'audio/ogg','Content-Length':String(b.length),'Cache-Control':'public, max-age=86400'});
    res.send(b);
  }catch(e){console.error('real-reaction-error',e);res.status(500).end()}
});
app.get('/health',async(_req,res)=>{
  let realReactionBytes=0;
  try{realReactionBytes=(await getRealReaction()).length}catch{}
  res.json({ok:true,audioMode:'natural-device-name+real-reference-human-reaction-v21',voiceMode:'name-only-then-real-human',realReactionBytes,time:new Date().toISOString()});
});

let liveConnection=null,activeUsername=null,connecting=false,reconnectTimer=null;
function normalizeUsername(v=''){return String(v).trim().replace(/^https?:\/\/(www\.)?tiktok\.com\/@/i,'').replace(/\/live.*$/i,'').replace(/^@/,'').replace(/[^a-zA-Z0-9._-]/g,'').slice(0,64)}
function safeText(v,f=''){const t=String(v??f).replace(/[<>]/g,'').trim();return t.slice(0,80)||f}
function emitStatus(status,message,extra={}){io.emit('tiktok-status',{status,message,username:activeUsername,...extra})}
async function stopTikTok(reason='Bağlantı kapatıldı'){
  if(reconnectTimer){clearTimeout(reconnectTimer);reconnectTimer=null}
  const old=liveConnection;liveConnection=null;connecting=false;
  if(old){try{old.disconnect()}catch{}}
  emitStatus('disconnected',reason);
}
async function startTikTok(username){
  const clean=normalizeUsername(username);
  if(!clean)throw new Error('Geçerli bir TikTok kullanıcı adı gir.');
  if(connecting)throw new Error('Bağlantı kuruluyor.');
  if(liveConnection)await stopTikTok('Yeni hesaba geçiliyor…');
  activeUsername=clean;connecting=true;emitStatus('connecting',`@${clean} canlı yayınına bağlanılıyor…`);
  const connection=new TikTokLiveConnection(clean,{processInitialData:false,enableExtendedGiftInfo:true,fetchRoomInfoOnConnect:true});
  liveConnection=connection;
  connection.on(WebcastEvent.GIFT,event=>{
    try{
      if(event?.gift?.type===1&&Number(event?.repeatEnd)!==1)return;
      const repeatCount=Math.max(1,Number(event?.repeatCount||1));
      const giftName=safeText(event?.gift?.name||event?.extendedGiftInfo?.name||`Hediye #${event?.giftId??''}`,'Hediye');
      const diamondsPerGift=Math.max(0,Number(event?.gift?.diamondCount??event?.extendedGiftInfo?.diamondCount??0));
      const diamonds=diamondsPerGift*repeatCount;
      const displayName=safeText(event?.user?.nickname||event?.user?.displayId||event?.user?.uniqueId,'Misafir');
      const uniqueId=safeText(event?.user?.uniqueId||event?.user?.displayId||'','misafir');
      io.emit('gift',{id:`${Date.now()}-${Math.random().toString(36).slice(2)}`,displayName,uniqueId,giftName,giftId:String(event?.giftId??''),repeatCount,diamonds,diamondsPerGift});
    }catch(e){console.error('gift-handler',e)}
  });
  connection.on('disconnected',()=>{
    connecting=false;if(liveConnection!==connection)return;
    emitStatus('reconnecting',`@${clean} bağlantısı koptu; yeniden deneniyor…`);
    reconnectTimer=setTimeout(()=>{if(activeUsername===clean)startTikTok(clean).catch(e=>emitStatus('error',e.message))},5000);
  });
  connection.on('error',e=>emitStatus('error',e?.message||'TikTok bağlantı hatası'));
  try{const state=await connection.connect();connecting=false;emitStatus('connected',`@${clean} bağlandı`,{roomId:String(state?.roomId??'')});return state}
  catch(e){connecting=false;if(liveConnection===connection)liveConnection=null;throw e}
}

io.on('connection',socket=>{
  socket.emit('tiktok-status',{status:liveConnection?'connected':'disconnected',message:liveConnection?`@${activeUsername} bağlı`:'TikTok bağlı değil',username:activeUsername});
  socket.on('connect-tiktok',async({username}={},ack=()=>{})=>{try{const state=await startTikTok(username);ack({ok:true,roomId:String(state?.roomId??'')})}catch(e){const m=e?.message||'Bağlanamadı';emitStatus('error',m);ack({ok:false,error:m})}});
  socket.on('disconnect-tiktok',async(_p,ack=()=>{})=>{await stopTikTok();activeUsername=null;ack({ok:true})});
  socket.on('simulate-gift',(p={},ack=()=>{})=>{
    const d=Math.max(1,Math.min(100000,Number(p.diamonds||1)));
    io.emit('gift',{id:`${Date.now()}-test`,displayName:safeText(p.displayName,'Furkan'),uniqueId:'test_user',giftName:safeText(p.giftName,d>=500?'Lion':d>=100?'Swan':d>=10?'Perfume':'Rose'),giftId:'test',repeatCount:1,diamonds:d,diamondsPerGift:d});
    ack({ok:true});
  });
});

const PORT=Number(process.env.PORT||3000);
server.listen(PORT,'0.0.0.0',()=>{
  console.log(`TikTok Dance Live v21 running on http://0.0.0.0:${PORT}`);
  getRealReaction().then(b=>console.log('REAL HUMAN REACTION READY',b.length,'bytes')).catch(e=>console.error('REAL REACTION FAIL',e));
});
