import fs from 'node:fs';

const file = 'server-live.js';
let text = fs.readFileSync(file, 'utf8');

const oldBlock = `    if (giftNameKey === 'heart me' || giftNameKey === 'beni sev') {
      console.log('[GIFT] Heart Me / Beni Sev bilerek yok sayıldı.');
      return;
    }`;

const newBlock = `    if (giftNameKey === 'heart me' || giftNameKey === 'beni sev') {
      // Kullanıcı isteği: Beni Sev / Heart Me de tank çıkarsın.
      // İstemci 20 jetonluk hediyeleri zaten tank olarak çalıştırıyor.
      gift.coins = 20;
      console.log('[GIFT] Heart Me / Beni Sev -> Tank');
    }`;

if (text.includes(newBlock)) {
  console.log('[live] Heart Me / Beni Sev -> Tank zaten aktif.');
} else if (text.includes(oldBlock)) {
  text = text.replace(oldBlock, newBlock);
  fs.writeFileSync(file, text, 'utf8');
  console.log('[live] Heart Me / Beni Sev -> Tank aktif edildi.');
} else {
  throw new Error('[live] Beni Sev hediye bloğu bulunamadı; güvenli olmayan otomatik yama yapılmadı.');
}
