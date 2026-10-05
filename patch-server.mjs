import fs from 'node:fs';

const file = 'server-live.js';
let text = fs.readFileSync(file, 'utf8');

function replaceOnce(oldText, newText, label) {
  if (text.includes(newText)) {
    console.log(`[live] ${label} zaten aktif.`);
    return;
  }
  if (!text.includes(oldText)) {
    throw new Error(`[live] ${label} için beklenen kod bulunamadı; güvenli olmayan otomatik yama yapılmadı.`);
  }
  text = text.replace(oldText, newText);
  console.log(`[live] ${label} aktif edildi.`);
}

// Heart Me / Beni Sev de tank çıkarsın.
replaceOnce(
`    if (giftNameKey === 'heart me' || giftNameKey === 'beni sev') {
      console.log('[GIFT] Heart Me / Beni Sev bilerek yok sayıldı.');
      return;
    }`,
`    if (giftNameKey === 'heart me' || giftNameKey === 'beni sev') {
      gift.coins = 20;
      console.log('[GIFT] Heart Me / Beni Sev -> Tank');
    }`,
'Heart Me / Beni Sev -> Tank'
);

// Eski sürüm, şövalye ekrana ulaşmadan kullanıcıyı "ödül aldı" diye kalıcı kaydedebiliyordu.
// Yeni dosya adıyla bir kez temiz başlangıç yapıyoruz; bundan sonra tekrar takip ödülü korunur.
replaceOnce(
"const FOLLOW_REWARD_FILE = path.join(__dirname, '.follow-rewards.json');",
"const FOLLOW_REWARD_FILE = path.join(__dirname, '.follow-rewards-v2.json');",
'Takip ödülü geçmişi v2'
);

replaceOnce(
`function addPending(userId, action, count, username) {
  const current = pendingRewards.get(userId) || { username, actions: {} };
  current.username = username || current.username;
  current.actions[action] = (current.actions[action] || 0) + count;
  pendingRewards.set(userId, current);
}
`,
`function addPending(userId, action, count, username) {
  const current = pendingRewards.get(userId) || { username, actions: {} };
  current.username = username || current.username;
  current.actions[action] = (current.actions[action] || 0) + count;
  pendingRewards.set(userId, current);
}

function hasGameClient() {
  for (const client of wss.clients) if (client.readyState === 1) return true;
  return false;
}

function addPendingOnce(userId, action, username) {
  const current = pendingRewards.get(userId) || { username, actions: {} };
  current.username = username || current.username;
  current.actions[action] = Math.max(1, current.actions[action] || 0);
  pendingRewards.set(userId, current);
}
`,
'Takip ödülü güvenli kuyruk'
);

replaceOnce(
`function flushPending(user) {
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
    console.log(\`[FOLLOW] \${user.name} daha önce şövalye aldı; tekrar verilmedi.\`);
    return;
  }
  rewardedFollowers.add(user.id);
  saveRewardedFollowers();
  rewardOrQueue(user, 'knight', 1, 'follow');
  console.log(\`[FOLLOW] \${user.name} -> 1 şövalye (\${source})\`);
}
`,
`function flushPending(user) {
  const pending = pendingRewards.get(user.id);
  const team = teamByUser.get(user.id);
  if (!pending || !team || !hasGameClient()) return;
  for (const [action, count] of Object.entries(pending.actions)) {
    broadcast({ type: 'action', action, count, team, username: pending.username || user.name, reason: 'pending' });
    if (action === 'knight') {
      rewardedFollowers.add(user.id);
      saveRewardedFollowers();
    }
  }
  pendingRewards.delete(user.id);
}

function flushAllPending() {
  if (!hasGameClient()) return;
  for (const [userId, pending] of pendingRewards) {
    if (!teamByUser.has(userId)) continue;
    flushPending({ id: userId, name: pending.username || 'Viewer' });
  }
}

function rewardFollow(data, source = 'follow') {
  const user = getUser(data);
  if (user.id === 'unknown') return;
  if (rewardedFollowers.has(user.id)) {
    console.log(\`[FOLLOW] \${user.name} daha önce şövalye aldı; tekrar verilmedi.\`);
    return;
  }

  const team = teamByUser.get(user.id);
  if (!team || !hasGameClient()) {
    addPendingOnce(user.id, 'knight', user.name);
    if (!team) broadcast({ type: 'notice', text: \`\${user.name} takip ödülü hazır; önce KIRMIZI veya MAVİ yaz.\` });
    console.log(\`[FOLLOW-WAIT] \${user.name} -> şövalye sırada (\${source})\`);
    return;
  }

  broadcast({ type: 'action', action: 'knight', count: 1, team, username: user.name, reason: 'follow' });
  rewardedFollowers.add(user.id);
  saveRewardedFollowers();
  console.log(\`[FOLLOW] \${user.name} -> 1 şövalye (\${source})\`);
}
`,
'Takip -> şövalye teslimatı'
);

replaceOnce(
`  connection.on(WebcastEvent.SOCIAL, data => {
    const displayType = normalize(data?.displayType || data?.common?.displayText?.key || '');
    const action = normalize(data?.action || '');
    if (displayType.includes('follow') || action.includes('follow')) rewardFollow(data, 'social-event');
  });`,
`  connection.on(WebcastEvent.SOCIAL, data => {
    const socialText = normalize([
      data?.displayType,
      data?.action,
      data?.common?.displayText?.key,
      data?.common?.displayText?.defaultPattern,
      data?.label
    ].filter(Boolean).join(' '));
    if (socialText.includes('follow') || socialText.includes('takip')) rewardFollow(data, 'social-event');
  });`,
'Takip social-event algılama'
);

replaceOnce(
`wss.on('connection', ws => {
  ws.send(JSON.stringify({
    type: 'status', connected: Boolean(tiktok?.state?.isConnected),
    username: TIKTOK_USERNAME, roomId: currentRoomId || null
  }));
});`,
`wss.on('connection', ws => {
  ws.send(JSON.stringify({
    type: 'status', connected: Boolean(tiktok?.state?.isConnected),
    username: TIKTOK_USERNAME, roomId: currentRoomId || null
  }));
  setTimeout(flushAllPending, 250);
});`,
'Bekleyen takip ödüllerini oyun açılınca gönder'
);

fs.writeFileSync(file, text, 'utf8');
