import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer } from 'ws';
import { TikTokLiveConnection, WebcastEvent, ControlEvent } from 'tiktok-live-connector';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT || 3000);
const TIKTOK_USERNAME = (process.env.TIKTOK_USERNAME || 'tncfurkan72').replace(/^@/, '');
const TIKTOK_ROOM_ID = String(process.env.TIKTOK_ROOM_ID || '').trim();
const RETRY_MS = 15000;
const FOLLOW_REWARD_FILE = path.join(__dirname, '.follow-rewards.json');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/live' });

const teamByUser = new Map();
const likesByUser = new Map();
const pendingRewards = new Map();
let rewardedFollowers = new Set();
let tiktok = null;
let retryTimer = null;
let connecting = false;
let currentRoomId = '';
let giftById = new Map();

try {
  const saved = JSON.parse(fs.readFileSync(FOLLOW_REWARD_FILE, 'utf8'));
  if (Array.isArray(saved)) rewardedFollowers = new Set(saved.map(String));
} catch {}

function saveRewardedFollowers() {
  try {
    fs.writeFileSync(FOLLOW_REWARD_FILE, JSON.stringify([...rewardedFollowers], null, 2), 'utf8');
  } catch (err) {
    console.warn('[FOLLOW] ödül geçmişi kaydedilemedi:', err?.message || err);
  }
}

function normalize(v = '') {
  return String(v).trim().toLocaleLowerCase('tr-TR').replaceAll('ı', 'i').replace(/\s+/g, ' ');
}

function broadcast(payload) {
  const text = JSON.stringify(payload);
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(text);
  }
}

function getUser(data) {
  const user = data?.user || data || {};
  const uniqueId = user?.uniqueId || data?.uniqueId || '';
  const stableId = user?.userId || data?.userId || uniqueId || 'unknown';
  const nickname = user?.nickname || data?.nickname || 'Viewer';
  return {
    id: String(stableId),
    uniqueId: String(uniqueId || ''),
    name: uniqueId ? `@${uniqueId}` : nickname
  };
}

function getGiftInfo(data) {
  const giftDetails = data?.giftDetails || {};
  const ext = data?.extendedGiftInfo || {};
  const giftId = String(data?.giftId ?? giftDetails?.giftId ?? ext?.id ?? '');
  const catalog = giftById.get(giftId) || {};
  const name =
    giftDetails?.giftName || giftDetails?.name || ext?.name || ext?.giftName ||
    catalog?.name || data?.giftName || giftId || 'gift';
  const coins = Number(
    giftDetails?.diamondCount ?? giftDetails?.diamond_count ?? ext?.diamondCount ??
    ext?.diamond_count ?? catalog?.diamondCount ?? catalog?.diamond_count ?? catalog?.cost ?? 0
  );
  const giftType = Number(giftDetails?.giftType ?? data?.giftType ?? 0);
  const repeatCount = Math.max(1, Number(data?.repeatCount || data?.comboCount || 1));
  const repeatEnd = Boolean(data?.repeatEnd);
  return { id: giftId, name: String(name), coins, giftType, repeatCount, repeatEnd };
}

function addPending(userId, action, count, username) {
  const current = pendingRewards.get(userId) || { username, actions: {} };
  current.username = username || current.username;
  current.actions[action] = (current.actions[action] || 0) + count;
  pendingRewards.set(userId, current);
}

function rewardOrQueue(user, action, count = 1, reason = '') {
  if (count <= 0 || user.id === 'unknown') return;
  const team = teamByUser.get(user.id);
  if (!team) {
    addPending(user.id, action, count, user.name);
    broadcast({ type: 'notice', text: `${user.name} ödülü hazır; önce KIRMIZI veya MAVİ yaz.` });
    console.log(`[WAIT] ${user.name} ${reason} ödülü bekliyor; takım seçmedi.`);
    return;
  }
  broadcast({ type: 'action', action, count, team, username: user.name, reason });
}

function flushPending(user) {
  const pending = pendingRewards.get(user.id);
  const team = teamByUser.get(user.id);
  if (!pending || !team) return;
  for (const [action, count] of Object.entries(pending.actions)) {
    broadcast({ type: 'action', action, count, team, username: pending.username || user.name, reason: 'pending' });
  }
  pendingRewards.delete(user.id);
}

function rewardFollow(data, source = 'follow') {
  const user = getUser(data);
  if (user.id === 'unknown') return;
  if (rewardedFollowers.has(user.id)) {
    console.log(`[FOLLOW] ${user.name} daha önce şövalye aldı; tekrar verilmedi.`);
    return;
  }
  rewardedFollowers.add(user.id);
  saveRewardedFollowers();
  rewardOrQueue(user, 'knight', 1, 'follow');
  console.log(`[FOLLOW] ${user.name} -> 1 şövalye (${source})`);
}

async function refreshGiftCatalog() {
  try {
    const raw = await tiktok.fetchAvailableGifts();
    const list = Array.isArray(raw) ? raw : (raw?.gifts || raw?.giftList || []);
    giftById = new Map(list.map(g => [String(g?.id ?? g?.gift_id ?? ''), g]));
    console.log(`[TikTok] ${list.length} hediye kataloğu yüklendi.`);
  } catch (err) {
    console.log(`[TikTok] Hediye kataloğu alınamadı; gift event içindeki bilgi kullanılacak. (${err?.message || err})`);
  }
}

function scheduleReconnect() {
  if (retryTimer) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    connectTikTok();
  }, RETRY_MS);
}

function attachEvents(connection) {
  connection.on(ControlEvent.CONNECTED, state => {
    currentRoomId = String(state?.roomId || connection?.roomId || currentRoomId || '');
    console.log(`\n[TikTok] ✅ BAĞLANDI @${TIKTOK_USERNAME} roomId=${currentRoomId || '?'}`);
    broadcast({ type: 'status', connected: true, username: TIKTOK_USERNAME, roomId: currentRoomId });
  });

  connection.on(ControlEvent.WEBSOCKET_CONNECTED, () => {
    console.log('[TikTok] ✅ WebSocket açıldı. Yorum / beğeni / takip / hediye dinleniyor.');
  });

  connection.on(WebcastEvent.CHAT, data => {
    const user = getUser(data);
    const rawMsg = String(data?.comment || '').trim();
    const msg = normalize(rawMsg);
    console.log(`[CHAT] ${user.name}: ${rawMsg}`);

    let team = null;
    if (['kirmizi', 'kırmızı', 'red'].includes(msg)) team = 'red';
    if (['mavi', 'blue'].includes(msg)) team = 'blue';
    if (!team || user.id === 'unknown') return;

    teamByUser.set(user.id, team);
    broadcast({ type: 'team', team, username: user.name, uniqueId: user.id });
    flushPending(user);
    console.log(`[TEAM] ${user.name} -> ${team}`);
  });

  connection.on(WebcastEvent.FOLLOW, data => rewardFollow(data, 'follow-event'));

  connection.on(WebcastEvent.SOCIAL, data => {
    const displayType = normalize(data?.displayType || data?.common?.displayText?.key || '');
    const action = normalize(data?.action || '');
    if (displayType.includes('follow') || action.includes('follow')) rewardFollow(data, 'social-event');
  });

  connection.on(WebcastEvent.LIKE, data => {
    const user = getUser(data);
    const likeCount = Math.max(0, Number(data?.likeCount || 0));
    const totalLiveLikes = Math.max(0, Number(data?.totalLikeCount || 0));
    console.log(`[LIKE-EVENT] ${user.name} +${likeCount} | yayın toplamı=${totalLiveLikes}`);
    if (!likeCount || user.id === 'unknown') return;

    const before = likesByUser.get(user.id) || 0;
    const after = before + likeCount;
    likesByUser.set(user.id, after);
    const earned = Math.floor(after / 200) - Math.floor(before / 200);
    if (earned > 0) {
      rewardOrQueue(user, 'soldier', earned, 'likes');
      console.log(`[LIKE] ${user.name} kişisel toplam=${after} -> ${earned} asker`);
    }
  });

  connection.on(WebcastEvent.GIFT, data => {
    const user = getUser(data);
    const gift = getGiftInfo(data);
    console.log(`[GIFT-EVENT] ${user.name} | ${gift.name} | id=${gift.id} | ${gift.coins} coin | x${gift.repeatCount} | end=${gift.repeatEnd}`);

    if (gift.giftType === 1 && !gift.repeatEnd) return;
    const giftNameKey = normalize(gift.name);
    if (giftNameKey === 'heart me' || giftNameKey === 'beni sev') {
      console.log('[GIFT] Heart Me / Beni Sev bilerek yok sayıldı.');
      return;
    }

    const team = teamByUser.get(user.id);
    if (!team) {
      broadcast({ type: 'notice', text: `${user.name} önce KIRMIZI veya MAVİ yazmalı.` });
      console.log(`[GIFT] ${user.name} hediyesi alındı ama takım seçilmedi.`);
      return;
    }

    broadcast({
      type: 'gift', team, username: user.name, uniqueId: user.id,
      giftName: gift.name, coins: gift.coins, repeatCount: gift.repeatCount
    });
    console.log(`[GIFT] ${user.name} -> ${gift.name} -> ${team}`);
  });

  connection.on(ControlEvent.DISCONNECTED, info => {
    console.log(`[TikTok] bağlantı kapandı. code=${info?.code ?? '?'} reason=${info?.reason || ''}`);
    broadcast({ type: 'status', connected: false, username: TIKTOK_USERNAME });
    scheduleReconnect();
  });

  connection.on(ControlEvent.ERROR, err => {
    const detail = err?.exception?.message || err?.message || String(err?.exception || err || 'unknown');
    console.warn(`[TikTok] ERROR: ${detail}`);
  });
}

async function connectTikTok() {
  if (connecting || tiktok?.state?.isConnected) return;
  connecting = true;
  try {
    if (tiktok) {
      try { await tiktok.disconnect(); } catch {}
    }

    console.log(`\n[TikTok] @${TIKTOK_USERNAME} LIVE aranıyor...`);
    tiktok = new TikTokLiveConnection(TIKTOK_USERNAME, {
      processInitialData: false,
      fetchRoomInfoOnConnect: false,
      enableExtendedGiftInfo: true,
      disableEulerFallbacks: true
    });
    attachEvents(tiktok);

    const state = await tiktok.connect(TIKTOK_ROOM_ID || undefined);
    currentRoomId = String(state?.roomId || tiktok?.roomId || TIKTOK_ROOM_ID || '');
    console.log(`[TikTok] ✅ CONNECT TAMAM @${TIKTOK_USERNAME} roomId=${currentRoomId || '?'}`);
    broadcast({ type: 'status', connected: true, username: TIKTOK_USERNAME, roomId: currentRoomId });
    refreshGiftCatalog();
  } catch (err) {
    const detail = err?.exception?.message || err?.message || String(err);
    console.log(`[TikTok] ❌ Bağlanamadı: ${detail}`);
    if (/Euler|Business Plan|pricing/i.test(detail)) {
      console.log('[TikTok] ⚠️ Ücretli Euler yolu engellendi; bu sürüm doğrudan TikTok oda çözümlemeyi kullanır.');
    }
    console.log(`[TikTok] ${RETRY_MS / 1000} saniye sonra tekrar denenecek.`);
    broadcast({ type: 'status', connected: false, username: TIKTOK_USERNAME });
    scheduleReconnect();
  } finally {
    connecting = false;
  }
}

const injectedClient = `
<script>
(() => {
  const COIN_ACTIONS = {10:'tornado',20:'tank',100:'meteor',500:'nuke'};
  let socket;
  const queue = [];

  function showNotice(text) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(showNotice.t);
    showNotice.t = setTimeout(() => el.classList.remove('show'), 2600);
  }

  function triggerAction(action, team, username) {
    const teamEl = document.getElementById('testTeam');
    const nameEl = document.getElementById('testName');
    const btn = document.querySelector('.ev[data-action="' + action + '"]');
    if (!teamEl || !nameEl || !btn) return false;
    teamEl.value = team;
    nameEl.value = username || 'Viewer';
    btn.click();
    return true;
  }

  function runAction(msg) {
    const count = Math.max(1, Math.min(50, Number(msg.count || 1)));
    for (let i = 0; i < count; i++) setTimeout(() => triggerAction(msg.action, msg.team, msg.username), i * 140);
  }

  function runGift(msg) {
    const repeats = Math.max(1, Math.min(50, Number(msg.repeatCount || 1)));
    const action = COIN_ACTIONS[Number(msg.coins || 0)];
    for (let i = 0; i < repeats; i++) {
      setTimeout(() => {
        if (action) triggerAction(action, msg.team, msg.username);
        else if (typeof window.handleTikTokGift === 'function') window.handleTikTokGift(msg.giftName, msg.team, msg.username);
      }, i * 120);
    }
  }

  function process(msg) {
    if (msg.type === 'gift') return runGift(msg);
    if (msg.type === 'action') return runAction(msg);
    if (msg.type === 'team') return showNotice((msg.team === 'red' ? '🔴 ' : '🔵 ') + msg.username + ' takıma katıldı!');
    if (msg.type === 'notice') return showNotice(msg.text);
    if (msg.type === 'status') console.log(msg.connected ? 'TikTok LIVE bağlı' : 'TikTok LIVE bekleniyor', msg);
  }

  function flush() { while (queue.length) process(queue.shift()); }

  function connect() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    socket = new WebSocket(proto + '//' + location.host + '/live');
    socket.onopen = flush;
    socket.onmessage = e => {
      try {
        const msg = JSON.parse(e.data);
        if (typeof window.handleTikTokGift !== 'function') queue.push(msg);
        else process(msg);
      } catch (err) { console.error(err); }
    };
    socket.onclose = () => setTimeout(connect, 2000);
  }

  const readyTimer = setInterval(() => {
    if (typeof window.handleTikTokGift === 'function') {
      clearInterval(readyTimer);
      flush();
    }
  }, 250);

  connect();
})();
</script>`;

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    tiktok: `@${TIKTOK_USERNAME}`,
    connected: Boolean(tiktok?.state?.isConnected),
    roomId: currentRoomId || null,
    teams: teamByUser.size,
    followerRewards: rewardedFollowers.size,
    likeUsers: likesByUser.size
  });
});

app.get('/', (_req, res) => {
  const indexPath = path.join(__dirname, 'index.html');
  let html = fs.readFileSync(indexPath, 'utf8');
  html = html.replace('</body>', `${injectedClient}\n</body>`);
  res.type('html').send(html);
});

app.use(express.static(__dirname, { index: false, dotfiles: 'ignore' }));

wss.on('connection', ws => {
  ws.send(JSON.stringify({
    type: 'status', connected: Boolean(tiktok?.state?.isConnected),
    username: TIKTOK_USERNAME, roomId: currentRoomId || null
  }));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\nLIVE Kingdom Battle: http://127.0.0.1:${PORT}`);
  console.log(`TikTok account: @${TIKTOK_USERNAME}`);
  console.log('Takım seçimi: sohbete KIRMIZI veya MAVİ.');
  console.log('Takip = 1 şövalye (hesap başına yalnız 1 kez).');
  console.log('Her kişisel 200 beğeni = 1 asker.');
  console.log('TikTok bridge: ücretsiz uyumlu connector 2.1.0 / Euler fallback kapalı.\n');
  connectTikTok();
});
