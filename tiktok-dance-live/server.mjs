import express from 'express';
import http from 'http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Server } from 'socket.io';
import { TikTokLiveConnection, WebcastEvent } from 'tiktok-live-connector';

const execFileAsync = promisify(execFile);
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const indexPath = path.join(process.cwd(), 'public', 'index.html');
const edgePython = path.join(process.cwd(), '.venv', 'bin', 'python');
const phraseCache = new Map();
let synthChain = Promise.resolve();
let voiceState = 'starting';
let voiceError = '';

function cleanName(v='') {
  return String(v)
    .replace(/[_.]+/g, ' ')
    .replace(/[^\p{L}\p{N} çğıöşüÇĞİÖŞÜ'-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40);
}
function tierOf(v='low') {
  return ['low','mid','big','huge'].includes(v) ? v : 'low';
}
function variantOf(v) {
  return Math.max(0, Math.min(4, Number(v) || 0));
}
function phraseFor(name, tier, variant) {
  const sets = {
    low: [
      `${name}, teşekkürler!`,
      `${name}, thank you!`,
      `${name}, sağ ol!`,
      `${name}, maşallah, teşekkürler!`,
      `${name}, eyvallah!`
    ],
    mid: [
      `${name}! Maşallah, çok teşekkürler!`,
      `${name}! Thank you, thank you!`,
      `${name}! Eyvallah, sağ ol!`,
      `${name}! Çok teşekkür ederiz!`,
      `${name}! Maşallah!`
    ],
    big: [
      `${name}! Maşallah! Çok teşekkür ederiz!`,
      `${name}! Thank you so much!`,
      `${name}! Helal olsun, çok teşekkürler!`,
      `${name}! Allah razı olsun, teşekkürler!`,
      `${name}! Thank you! Maşallah!`
    ],
    huge: [
      `${name}! Maşallah! Thank you, thank you!`,
      `${name}! Allah razı olsun! Çok teşekkürler!`,
      `${name}! Thank you so much! Maşallah!`,
      `${name}! Helal olsun! Çok teşekkür ederiz!`,
      `${name}! Maşallah! İyi ki varsın, thank you!`
    ]
  };
  return sets[tier][variant];
}
function prosodyFor(tier) {
  if (tier === 'huge') return { rate: '+20%', pitch: '+4Hz', volume: '+20%' };
  if (tier === 'big') return { rate: '+16%', pitch: '+3Hz', volume: '+18%' };
  if (tier === 'mid') return { rate: '+12%', pitch: '+2Hz', volume: '+16%' };
  return { rate: '+8%', pitch: '+1Hz', volume: '+14%' };
}
function enqueueSynth(task) {
  const run = synthChain.then(task, task);
  synthChain = run.catch(() => {});
  return run;
}
async function synthPhrase(name, tier='low', variant=0) {
  name = cleanName(name);
  tier = tierOf(tier);
  variant = variantOf(variant);
  if (!name) throw new Error('empty name');

  const key = `${name.toLocaleLowerCase('tr-TR')}|${tier}|${variant}`;
  if (phraseCache.has(key)) return phraseCache.get(key);

  return enqueueSynth(async () => {
    if (phraseCache.has(key)) return phraseCache.get(key);

    const text = phraseFor(name, tier, variant);
    const p = prosodyFor(tier);
    const temp = path.join(os.tmpdir(), `giftvoice-${crypto.randomUUID()}.mp3`);
    const args = [
      '-m', 'edge_tts',
      '--voice', 'tr-TR-AhmetNeural',
      '--rate=' + p.rate,
      '--pitch=' + p.pitch,
      '--volume=' + p.volume,
      '--text', text,
      '--write-media', temp,
      '--no-progress'
    ];

    try {
      await execFileAsync(edgePython, args, {
        timeout: 18000,
        maxBuffer: 1024 * 1024,
        env: { ...process.env, PYTHONUNBUFFERED: '1' }
      });
      const audio = await fs.readFile(temp);
      if (audio.length < 3000) throw new Error(`edge-tts audio too small: ${audio.length}`);
      if (phraseCache.size > 300) phraseCache.delete(phraseCache.keys().next().value);
      phraseCache.set(key, audio);
      voiceState = 'ready';
      voiceError = '';
      console.log('NATURAL VOICE OK', JSON.stringify(text), audio.length, 'bytes');
      return audio;
    } finally {
      fs.unlink(temp).catch(() => {});
    }
  });
}

app.use(express.static('public', { index: false, maxAge: '1h' }));
app.get('/', async (_req, res) => {
  try {
    const html = await fs.readFile(indexPath, 'utf8');
    res.set('Cache-Control', 'no-store');
    res.type('html').send(
      html.replace(
        '</body>',
        '<script src="/panel-upgrade.js?v=22"></script><script src="/voice-upgrade.js?v=22"></script></body>'
      )
    );
  } catch (e) {
    console.error('index-error', e);
    res.status(500).send('Site yüklenemedi');
  }
});
app.get('/reaction-voice', async (req, res) => {
  const name = cleanName(req.query?.name || '');
  const tier = tierOf(String(req.query?.tier || 'low'));
  const variant = variantOf(req.query?.variant);
  if (!name) return res.status(400).end();

  try {
    const audio = await synthPhrase(name, tier, variant);
    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': String(audio.length),
      'Cache-Control': 'public, max-age=86400'
    });
    res.send(audio);
  } catch (e) {
    voiceState = 'error';
    voiceError = String(e?.message || e);
    console.error('reaction-voice-error', name, tier, variant, voiceError);
    res.status(503).json({ error: 'natural voice unavailable' });
  }
});
app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    version: 22,
    audioMode: 'python-edge-tts-full-sentence',
    voice: 'tr-TR-AhmetNeural',
    voiceState,
    voiceError,
    time: new Date().toISOString()
  });
});

let liveConnection = null;
let activeUsername = null;
let connecting = false;
let reconnectTimer = null;

function normalizeUsername(v='') {
  return String(v).trim()
    .replace(/^https?:\/\/(www\.)?tiktok\.com\/@/i, '')
    .replace(/\/live.*$/i, '')
    .replace(/^@/, '')
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .slice(0, 64);
}
function safeText(v, f='') {
  const t = String(v ?? f).replace(/[<>]/g, '').trim();
  return t.slice(0, 80) || f;
}
function emitStatus(status, message, extra={}) {
  io.emit('tiktok-status', { status, message, username: activeUsername, ...extra });
}
async function stopTikTok(reason='Bağlantı kapatıldı') {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  const old = liveConnection;
  liveConnection = null;
  connecting = false;
  if (old) {
    try { old.disconnect(); } catch {}
  }
  emitStatus('disconnected', reason);
}
async function startTikTok(username) {
  const clean = normalizeUsername(username);
  if (!clean) throw new Error('Geçerli bir TikTok kullanıcı adı gir.');
  if (connecting) throw new Error('Bağlantı kuruluyor.');
  if (liveConnection) await stopTikTok('Yeni hesaba geçiliyor…');

  activeUsername = clean;
  connecting = true;
  emitStatus('connecting', `@${clean} canlı yayınına bağlanılıyor…`);

  const connection = new TikTokLiveConnection(clean, {
    processInitialData: false,
    enableExtendedGiftInfo: true,
    fetchRoomInfoOnConnect: true
  });
  liveConnection = connection;

  connection.on(WebcastEvent.GIFT, event => {
    try {
      if (event?.gift?.type === 1 && Number(event?.repeatEnd) !== 1) return;
      const repeatCount = Math.max(1, Number(event?.repeatCount || 1));
      const giftName = safeText(
        event?.gift?.name || event?.extendedGiftInfo?.name || `Hediye #${event?.giftId ?? ''}`,
        'Hediye'
      );
      const diamondsPerGift = Math.max(
        0,
        Number(event?.gift?.diamondCount ?? event?.extendedGiftInfo?.diamondCount ?? 0)
      );
      const diamonds = diamondsPerGift * repeatCount;
      const displayName = safeText(
        event?.user?.nickname || event?.user?.displayId || event?.user?.uniqueId,
        'Misafir'
      );
      const uniqueId = safeText(event?.user?.uniqueId || event?.user?.displayId || '', 'misafir');
      io.emit('gift', {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        displayName,
        uniqueId,
        giftName,
        giftId: String(event?.giftId ?? ''),
        repeatCount,
        diamonds,
        diamondsPerGift
      });
    } catch (e) {
      console.error('gift-handler', e);
    }
  });

  connection.on('disconnected', () => {
    connecting = false;
    if (liveConnection !== connection) return;
    emitStatus('reconnecting', `@${clean} bağlantısı koptu; yeniden deneniyor…`);
    reconnectTimer = setTimeout(() => {
      if (activeUsername === clean) startTikTok(clean).catch(e => emitStatus('error', e.message));
    }, 5000);
  });

  connection.on('error', e => emitStatus('error', e?.message || 'TikTok bağlantı hatası'));

  try {
    const state = await connection.connect();
    connecting = false;
    emitStatus('connected', `@${clean} bağlandı`, { roomId: String(state?.roomId ?? '') });
    return state;
  } catch (e) {
    connecting = false;
    if (liveConnection === connection) liveConnection = null;
    throw e;
  }
}

io.on('connection', socket => {
  socket.emit('tiktok-status', {
    status: liveConnection ? 'connected' : 'disconnected',
    message: liveConnection ? `@${activeUsername} bağlı` : 'TikTok bağlı değil',
    username: activeUsername
  });

  socket.on('connect-tiktok', async ({ username }={}, ack=()=>{}) => {
    try {
      const state = await startTikTok(username);
      ack({ ok: true, roomId: String(state?.roomId ?? '') });
    } catch (e) {
      const m = e?.message || 'Bağlanamadı';
      emitStatus('error', m);
      ack({ ok: false, error: m });
    }
  });

  socket.on('disconnect-tiktok', async (_p, ack=()=>{}) => {
    await stopTikTok();
    activeUsername = null;
    ack({ ok: true });
  });

  socket.on('simulate-gift', (p={}, ack=()=>{}) => {
    const d = Math.max(1, Math.min(100000, Number(p.diamonds || 1)));
    io.emit('gift', {
      id: `${Date.now()}-test`,
      displayName: safeText(p.displayName, 'Furkan'),
      uniqueId: 'test_user',
      giftName: safeText(p.giftName, d >= 500 ? 'Lion' : d >= 100 ? 'Swan' : d >= 10 ? 'Perfume' : 'Rose'),
      giftId: 'test',
      repeatCount: 1,
      diamonds: d,
      diamondsPerGift: d
    });
    ack({ ok: true });
  });
});

const PORT = Number(process.env.PORT || 3000);
server.listen(PORT, '0.0.0.0', () => {
  console.log(`TikTok Dance Live v22 running on http://0.0.0.0:${PORT}`);
  synthPhrase('Furkan', 'mid', 0)
    .then(b => console.log('EDGE PYTHON VOICE READY Furkan', b.length, 'bytes'))
    .catch(e => {
      voiceState = 'error';
      voiceError = String(e?.message || e);
      console.error('EDGE PYTHON VOICE FAIL', voiceError);
    });
});
