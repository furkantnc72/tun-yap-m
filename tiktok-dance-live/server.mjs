import express from 'express';
import http from 'http';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { Server } from 'socket.io';
import { EdgeTTS } from 'node-edge-tts';
import { TikTokLiveConnection, WebcastEvent } from 'tiktok-live-connector';

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const neuralVoice = new EdgeTTS({
  voice: 'tr-TR-AhmetNeural',
  lang: 'tr-TR',
  outputFormat: 'audio-24khz-96kbitrate-mono-mp3',
  pitch: '-7%',
  rate: '+18%',
  volume: '+20%',
  timeout: 12000
});
const voiceCache = new Map();
const voiceInflight = new Map();

app.use(express.static('public'));
app.get('/health', (_req, res) => res.json({ ok: true, voice: 'tr-TR-AhmetNeural', time: new Date().toISOString() }));

function cleanVoiceText(value = '') {
  return String(value)
    .replace(/[_.]+/g, ' ')
    .replace(/[^\p{L}\p{N} çğıöşüÇĞİÖŞÜ-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 32);
}

async function synthesizeName(name) {
  const key = name.toLocaleLowerCase('tr-TR');
  if (voiceCache.has(key)) return voiceCache.get(key);
  if (voiceInflight.has(key)) return voiceInflight.get(key);

  const job = (async () => {
    const tmp = path.join(os.tmpdir(), `dance-voice-${crypto.randomUUID()}.mp3`);
    try {
      await neuralVoice.ttsPromise(`${name}!`, tmp);
      const audio = await fs.readFile(tmp);
      if (voiceCache.size >= 160) voiceCache.delete(voiceCache.keys().next().value);
      voiceCache.set(key, audio);
      return audio;
    } finally {
      fs.unlink(tmp).catch(() => {});
    }
  })();

  voiceInflight.set(key, job);
  try { return await job; }
  finally { voiceInflight.delete(key); }
}

app.get('/voice', async (req, res) => {
  const name = cleanVoiceText(req.query?.name);
  if (!name) return res.status(400).json({ ok: false, error: 'name gerekli' });
  try {
    const audio = await synthesizeName(name);
    res.set({
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
      'X-Voice-Engine': 'tr-TR-AhmetNeural'
    });
    res.send(audio);
  } catch (error) {
    console.error('voice-error', error);
    res.status(503).json({ ok: false, error: 'Ses üretilemedi' });
  }
});

let liveConnection = null;
let activeUsername = null;
let connecting = false;
let reconnectTimer = null;

function normalizeUsername(value = '') {
  return String(value).trim().replace(/^https?:\/\/(www\.)?tiktok\.com\/@/i, '').replace(/\/live.*$/i, '').replace(/^@/, '').replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 64);
}
function safeText(value, fallback = '') {
  const text = String(value ?? fallback).replace(/[<>]/g, '').trim();
  return text.slice(0, 80) || fallback;
}
function emitStatus(status, message, extra = {}) {
  io.emit('tiktok-status', { status, message, username: activeUsername, ...extra });
}
async function stopTikTok(reason = 'Bağlantı kapatıldı') {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  const old = liveConnection;
  liveConnection = null;
  connecting = false;
  if (old) { try { old.disconnect(); } catch {} }
  emitStatus('disconnected', reason);
}
async function startTikTok(username) {
  const clean = normalizeUsername(username);
  if (!clean) throw new Error('Geçerli bir TikTok kullanıcı adı gir.');
  if (connecting) throw new Error('Bağlantı kuruluyor, birkaç saniye sonra tekrar dene.');
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

  connection.on(WebcastEvent.GIFT, (event) => {
    try {
      if (event?.gift?.type === 1 && Number(event?.repeatEnd) !== 1) return;
      const repeatCount = Math.max(1, Number(event?.repeatCount || 1));
      const giftName = safeText(event?.gift?.name || event?.extendedGiftInfo?.name || `Hediye #${event?.giftId ?? ''}`, 'Hediye');
      const diamondsPerGift = Math.max(0, Number(event?.gift?.diamondCount ?? event?.extendedGiftInfo?.diamondCount ?? 0));
      const diamonds = diamondsPerGift * repeatCount;
      const displayName = safeText(event?.user?.nickname || event?.user?.displayId || event?.user?.uniqueId, 'Misafir');
      const uniqueId = safeText(event?.user?.uniqueId || event?.user?.displayId || '', 'misafir');
      const avatar = event?.user?.profilePicture?.urls?.[0] || event?.user?.avatarThumb?.urlList?.[0] || '';
      io.emit('gift', { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, displayName, uniqueId, giftName, giftId: String(event?.giftId ?? ''), repeatCount, diamonds, diamondsPerGift, avatar });
    } catch (error) { console.error('gift-handler', error); }
  });

  connection.on('disconnected', () => {
    connecting = false;
    if (liveConnection !== connection) return;
    emitStatus('reconnecting', `@${clean} bağlantısı koptu; yeniden deneniyor…`);
    reconnectTimer = setTimeout(() => {
      if (activeUsername === clean) startTikTok(clean).catch(err => emitStatus('error', err.message));
    }, 5000);
  });
  connection.on('error', (err) => emitStatus('error', err?.message || 'TikTok bağlantı hatası'));

  try {
    const state = await connection.connect();
    connecting = false;
    emitStatus('connected', `@${clean} bağlandı`, { roomId: String(state?.roomId ?? '') });
    return state;
  } catch (error) {
    connecting = false;
    if (liveConnection === connection) liveConnection = null;
    throw error;
  }
}

io.on('connection', (socket) => {
  socket.emit('tiktok-status', {
    status: liveConnection ? 'connected' : 'disconnected',
    message: liveConnection ? `@${activeUsername} bağlı` : 'TikTok bağlı değil',
    username: activeUsername
  });

  socket.on('connect-tiktok', async ({ username } = {}, ack = () => {}) => {
    try {
      const state = await startTikTok(username);
      ack({ ok: true, roomId: String(state?.roomId ?? '') });
    } catch (error) {
      const message = error?.message || 'TikTok bağlantısı kurulamadı';
      emitStatus('error', message);
      ack({ ok: false, error: message });
    }
  });
  socket.on('disconnect-tiktok', async (_payload, ack = () => {}) => {
    await stopTikTok(); activeUsername = null; ack({ ok: true });
  });
  socket.on('simulate-gift', (payload = {}, ack = () => {}) => {
    const diamonds = Math.max(1, Math.min(100000, Number(payload.diamonds || 1)));
    io.emit('gift', {
      id: `${Date.now()}-test`, displayName: safeText(payload.displayName, 'Furkan'), uniqueId: safeText(payload.uniqueId, 'test_user'),
      giftName: safeText(payload.giftName, diamonds >= 500 ? 'Aslan' : diamonds >= 100 ? 'Kuğu' : diamonds >= 10 ? 'Parfüm' : 'Gül'),
      giftId: 'test', repeatCount: Math.max(1, Number(payload.repeatCount || 1)), diamonds, diamondsPerGift: diamonds, avatar: ''
    });
    ack({ ok: true });
  });
});

const PORT = Number(process.env.PORT || 3000);
server.listen(PORT, '0.0.0.0', () => console.log(`TikTok Dance Live running on http://0.0.0.0:${PORT}`));
