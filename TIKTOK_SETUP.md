# TikTok LIVE entegrasyonu

Bu proje `@tncfurkan72` TikTok LIVE yayınına bağlanacak şekilde hazırlanmıştır.

## İlk kurulum

Bilgisayarda Node.js 20+ kurulu olmalı.

```bash
git clone https://github.com/furkantnc72/tun-yap-m.git
cd tun-yap-m
npm install
npm start
```

Sonra tarayıcıda veya OBS Browser Source içinde şunu aç:

```text
http://127.0.0.1:3000
```

Sunucuyu yayından önce açabilirsin. Hesap henüz canlı değilse 15 saniyede bir tekrar bağlanmayı dener.

## Takım seçimi

İzleyici sohbete bir kez şunlardan birini yazar:

- `kırmızı`
- `mavi`

Sonraki hediyeleri seçtiği takım adına oyuna gider.

## Sabit jeton olayları

- 10 jeton: Kasırga
- 20 jeton: Tank
- 100 jeton: Meteor
- 500 jeton: Nükleer Bomba

`Beni Sev / Heart Me` hediyesi oyunda yok sayılır.

Seri gönderilebilen TikTok hediyeleri streak tamamlandığında bir kez işlenir ve `repeatCount` kadar oyun etkisi uygulanır.

## Kontrol

Sunucu çalışırken:

```text
http://127.0.0.1:3000/health
```

adresinde TikTok bağlantı durumunu görebilirsin.

## Farklı TikTok hesabı

Gerekirse kullanıcı adı ortam değişkeniyle değiştirilebilir:

Windows PowerShell:

```powershell
$env:TIKTOK_USERNAME="kullaniciadi"; npm start
```

macOS/Linux:

```bash
TIKTOK_USERNAME=kullaniciadi npm start
```

Not: `tiktok-live-connector` TikTok'un resmi bir LIVE API'si değildir; TikTok Webcast verisini kullanan açık kaynak bir bağlantıdır. TikTok tarafındaki değişikliklerde paket güncellemesi gerekebilir.
