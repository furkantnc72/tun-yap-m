(()=>{
  const stage=document.getElementById('stage'),panel=document.getElementById('panel');
  if(!stage||!panel)return;

  const shell=document.createElement('div');shell.className='live-shell';
  const zone=document.createElement('div');zone.className='live-zone';
  stage.parentNode.insertBefore(shell,stage);shell.appendChild(zone);zone.appendChild(stage);shell.appendChild(panel);
  const css=document.createElement('style');css.textContent=`
  html,body{background:#080b07!important}
  .live-shell{display:flex;width:100vw;height:100dvh;overflow:hidden;background:#080b07}
  .live-zone{flex:1;min-width:0;height:100%;display:grid;place-items:center;overflow:hidden;background:radial-gradient(circle at 50% 15%,#1e2c16,#080b07 60%)}
  .live-zone #stage{width:min(calc(100vw - 365px),56.25vh)!important;height:100dvh!important;margin:0!important;flex:none}
  .live-shell #panel{position:relative!important;right:auto!important;top:auto!important;bottom:auto!important;transform:none!important;width:365px!important;height:100dvh!important;border-radius:0!important;border:0!important;border-left:1px solid #ffffff20!important;background:#10150ff2!important;box-shadow:-18px 0 55px #0006!important;backdrop-filter:blur(16px)!important;overflow:auto!important}
  .live-shell #panel header button{display:none!important}.live-shell #gear{display:none!important}
  .fixedMusic{padding:11px 12px;border-radius:14px;background:#ffffff0c;border:1px solid #ffffff16;margin:8px 0 10px}.fixedMusic b{display:block;font-size:13px}.fixedMusic span{display:block;font-size:11px;opacity:.68;margin-top:3px}.musicOk{color:#65ef8b!important;opacity:1!important}.musicErr{color:#ff8484!important;opacity:1!important}.musicWait{color:#ffd86c!important;opacity:1!important}
  #bgYoutube{position:fixed!important;left:-20px!important;top:-20px!important;width:2px!important;height:2px!important;opacity:.001!important;pointer-events:none!important;border:0!important}
  @media(max-width:900px){.live-shell{display:block}.live-zone{width:100%;height:100dvh}.live-zone #stage{width:100vw!important;max-width:100vw!important;height:100dvh!important}.live-shell #panel{position:fixed!important;z-index:200!important;right:10px!important;top:10px!important;bottom:10px!important;height:auto!important;width:min(92vw,370px)!important;border:1px solid #ffffff20!important;border-radius:20px!important;transform:translateX(calc(100% + 30px))!important;transition:.28s!important}.live-shell #panel.open{transform:translateX(0)!important}.live-shell #panel header button{display:block!important}.live-shell #gear{display:block!important}}
  `;document.head.appendChild(css);

  // Eski bozuk/kesik audio dosyasını tamamen devreden çıkar.
  const oldMusic=document.getElementById('music');
  if(oldMusic){try{oldMusic.pause();oldMusic.removeAttribute('src');oldMusic.load()}catch{}}

  const VIDEO_ID='6WMPvAowofk';
  let player=null,playerReady=null,musicState=null,wantedPlaying=false,ducked=false;
  const file=document.getElementById('musicFile');
  if(file){const box=document.createElement('div');box.className='fixedMusic';box.innerHTML='<b>🎵 Bahar Gözlüm (Hazalım) • 4:24</b><span>Tam sürüm • otomatik döngü</span><span id="musicState" class="musicWait">Müzik hazırlanıyor…</span>';file.replaceWith(box);musicState=document.getElementById('musicState')}
  const toggle=document.getElementById('musicToggle'),vol=document.getElementById('volume');
  if(vol)vol.value='.72';
  function state(text,kind=''){if(musicState){musicState.textContent=text;musicState.className=kind}}
  function baseVolume(){return Math.round((vol?Number(vol.value):.72)*100)}
  function setVol(){try{if(player?.setVolume)player.setVolume(ducked?Math.max(28,Math.round(baseVolume()*.55)):baseVolume())}catch{}}
  function updateButton(){if(toggle)toggle.textContent=wantedPlaying?'⏸ Müziği Durdur':'▶ Müziği Başlat'}

  function loadApi(){
    if(window.YT?.Player)return Promise.resolve();
    return new Promise(resolve=>{
      const old=window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady=()=>{try{old?.()}catch{} resolve()};
      if(!document.querySelector('script[src*="youtube.com/iframe_api"]')){const s=document.createElement('script');s.src='https://www.youtube.com/iframe_api';s.async=true;document.head.appendChild(s)}
    });
  }
  function ensurePlayer(){
    if(playerReady)return playerReady;
    playerReady=(async()=>{
      await loadApi();
      if(!document.getElementById('bgYoutube')){const d=document.createElement('div');d.id='bgYoutube';document.body.appendChild(d)}
      return await new Promise((resolve,reject)=>{
        let done=false;const fail=setTimeout(()=>{if(!done)reject(new Error('player timeout'))},12000);
        player=new YT.Player('bgYoutube',{width:'2',height:'2',videoId:VIDEO_ID,playerVars:{autoplay:0,controls:0,disablekb:1,fs:0,loop:1,playlist:VIDEO_ID,playsinline:1,rel:0},events:{
          onReady:e=>{done=true;clearTimeout(fail);e.target.unMute();setVol();state('Hazır — Yayını Başlat','musicWait');resolve(e.target)},
          onStateChange:e=>{if(e.data===YT.PlayerState.ENDED&&wantedPlaying){try{e.target.seekTo(0,true);e.target.playVideo()}catch{}} if(e.data===YT.PlayerState.PLAYING){state('● Müzik çalıyor • 4:24','musicOk')} if(e.data===YT.PlayerState.PAUSED&&!wantedPlaying){state('Müzik durduruldu')}},
          onError:e=>{state('Müzik oynatma hatası ('+e.data+')','musicErr')}
        }});
      });
    })().catch(e=>{playerReady=null;state('Müzik yüklenemedi — tekrar bas','musicErr');throw e});
    return playerReady;
  }
  async function playMusic(){wantedPlaying=true;updateButton();state('Müzik başlatılıyor…','musicWait');try{const p=await ensurePlayer();p.unMute();setVol();p.playVideo()}catch(e){wantedPlaying=false;updateButton();console.warn('youtube music',e)}}
  function stopMusic(){wantedPlaying=false;updateButton();try{player?.pauseVideo?.()}catch{}state('Müzik durduruldu')}
  if(toggle)toggle.onclick=()=>wantedPlaying?stopMusic():playMusic();
  if(vol)vol.oninput=()=>setVol();
  window.duckMusic=on=>{ducked=!!on;setVol()};

  // Sayfa açılır açılmaz oynatıcıyı hazırla; ses kullanıcı tıklayınca başlar.
  ensurePlayer().catch(()=>{});
  const start=document.getElementById('start');
  if(start){const prev=start.onclick;start.onclick=()=>{wantedPlaying=true;updateButton();try{if(player?.playVideo){player.unMute();setVol();player.playVideo()}else playMusic()}catch{playMusic()} prev?.()}}
  updateButton();
})();