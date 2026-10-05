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
const RETRY_MS = 15000;

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/live' });

const teamByUser = new Map();
let tiktok = null;
let retryTimer = null;
let connecting = false;
let giftById = new Map();

function normalize(v = '') {
  return String(v)
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replaceAll('ı', 'i')
    .replace(/\s+/g, ' ');
}

function broadcast(payload) {
  const text = JSON.stringify(payload);
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(text);
  }
}

function getUser(data) {
  const user = data?.user || {};
  const uniqueId = user.uniqueId || data?.uniqueId || '';
  return {
    id: uniqueId || user.userId || data?.userId || 'unknown',
    name: uniqueId ? `@${uniqueId}` : (user.nickname || data?.nickname || 'Viewer')
  };
}

function getGiftInfo(data) {
  const giftDetails = data?.giftDetails || {};
  const ext = data?.extendedGiftInfo || {};
  const catalog = giftById.get(String(data?.giftId ?? giftDetails?.giftId ?? '')) || {};
  const name = giftDetails.giftName || ext.name || ext.giftName || catalog.name || String(data?.giftId || 'gift');
  const coins = Number(
    giftDetails.diamondCount ??
    ext.diamond_count ??
    ext.diamondCount ??
    catalog.diamond_count ??
    catalog.diamondCount ??
    0
  );
  const giftType = Number(giftDetails.giftType ?? data?.giftType ?? 0);
  const repeatCount = Math.max(1, Number(data?.repeatCount || 1));
  const repeatEnd = Boolean(data?.repeatEnd);
  return { name, coins, giftType, repeatCount, repeatEnd };
}

async function refreshGiftCatalog() {
  try {
    const raw = await tiktok.fetchAvailableGifts();
    const list = Array.isArray(raw) ? raw : (raw?.gifts || raw?.giftList || []);
    giftById = new Map(list.map(g => [String(g.id ?? g.gift_id ?? ''), g]));
    console.log(`[TikTok] ${list.length} gift loaded`);
  } catch (err) {
    console.warn('[TikTok] gift catalog could not be loaded:', err?.message || err);
  }
}

function scheduleReconnect() {
  if (retryTimer) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    connectTikTok();
  }, RETRY_MS);
}

async function connectTikTok() {
  if (connecting || tiktok?.state?.isConnected) return;
  connecting = true;
  try {
    if (tiktok) {
      try { tiktok.disconnect(); } catch {}
    }

    tiktok = new TikTokLiveConnection(TIKTOK_USERNAME, {
      processInitialData: false,
      fetchRoomInfoOnConnect: true,
      enableExtendedGiftInfo: true
    });

    tiktok.on(WebcastEvent.CHAT, data => {
      const user = getUser(data);
      const msg = normalize(data?.comment || '');
      let team = null;
      if (['kirmizi', 'kırmızı', 'red'].includes(msg)) team = 'red';
      if (['mavi', 'blue'].includes(msg)) team = 'blue';
      if (!team) return;
      teamByUser.set(String(user.id), team);
      broadcast({ type: 'team', team, username: user.name, uniqueId: user.id });
      console.log(`[TEAM] ${user.name} -> ${team}`);
    });

    tiktok.on(WebcastEvent.GIFT, data => {
      const user = getUser(data);
      const gift = getGiftInfo(data);

      // TikTok streak gifts fire repeatedly; process only the final event.
      if (gift.giftType === 1 && !gift.repeatEnd) return;

      const giftNameKey = normalize(gift.name);
      if (giftNameKey === 'heart me' || giftNameKey === 'beni sev') return;

      const team = teamByUser.get(String(user.id));
      if (!team) {
        broadcast({
          type: 'notice',
          text: `${user.name} önce sohbete KIRMIZI veya MAVİ yazmalı.`
        });
        return;
      }

      broadcast({
        type: 'gift',
        team,
        username: user.name,
        uniqueId: user.id,
        giftName: gift.name,
        coins: gift.coins,
        repeatCount: gift.repeatCount
      });

      console.log(`[GIFT] ${user.name} | ${gift.name} | ${gift.coins} coin x${gift.repeatCount} | ${team}`);
    });

    tiktok.on(ControlEvent.DISCONNECTED, () => {
      broadcast({ type: 'status', connected: false, username: TIKTOK_USERNAME });
      scheduleReconnect();
    });

    tiktok.on(ControlEvent.ERROR, err => {
      console.warn('[TikTok] error:', err?.message || err);
    });

    const state = await tiktok.connect();
    console.log(`[TikTok] connected @${TIKTOK_USERNAME} roomId=${state.roomId}`);
    broadcast({ type: 'status', connected: true, username: TIKTOK_USERNAME, roomId: state.roomId });
    await refreshGiftCatalog();
  } catch (err) {
    console.log(`[TikTok] @${TIKTOK_USERNAME} is not live yet or connection failed. Retrying in ${RETRY_MS / 1000}s.`);
    console.log(String(err?.message || err));
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

  function runGift(msg) {
    const repeats = Math.max(1, Math.min(50, Number(msg.repeatCount || 1)));
    const action = COIN_ACTIONS[Number(msg.coins || 0)];
    for (let i = 0; i < repeats; i++) {
      setTimeout(() => {
        if (action) {
          triggerAction(action, msg.team, msg.username);
        } else if (typeof window.handleTikTokGift === 'function') {
          window.handleTikTokGift(msg.giftName, msg.team, msg.username);
        }
      }, i * 120);
    }
  }

  function process(msg) {
    if (msg.type === 'gift') return runGift(msg);
    if (msg.type === 'team') return showNotice((msg.team === 'red' ? '🔴 ' : '🔵 ') + msg.username + ' takıma katıldı!');
    if (msg.type === 'notice') return showNotice(msg.text);
    if (msg.type === 'status') {
      console.log(msg.connected ? 'TikTok LIVE bağlı' : 'TikTok LIVE bekleniyor', msg);
    }
  }

  function flush() {
    while (queue.length) process(queue.shift());
  }

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
  res.json({ ok: true, tiktok: `@${TIKTOK_USERNAME}`, connected: Boolean(tiktok?.state?.isConnected), teams: teamByUser.size });
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
    type: 'status',
    connected: Boolean(tiktok?.state?.isConnected),
    username: TIKTOK_USERNAME,
    roomId: tiktok?.roomId || null
  }));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\nLIVE Kingdom Battle: http://127.0.0.1:${PORT}`);
  console.log(`TikTok account: @${TIKTOK_USERNAME}`);
  console.log('Viewers choose a team by writing KIRMIZI or MAVİ in chat.\n');
  connectTikTok();
});