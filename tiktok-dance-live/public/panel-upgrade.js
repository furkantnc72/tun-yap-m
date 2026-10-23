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
  .fixedMusic{padding:11px 12px;border-radius:14px;background:#ffffff0c;border:1px solid #ffffff16;margin:8px 0 10px}.fixedMusic b{display:block;font-size:13px}.fixedMusic span{display:block;font-size:11px;opacity:.68;margin-top:3px}.musicOk{color:#65ef8b!important;opacity:1!important}.musicErr{color:#ff8484!important;opacity:1!important}
  @media(max-width:900px){.live-shell{display:block}.live-zone{width:100%;height:100dvh}.live-zone #stage{width:100vw!important;max-width:100vw!important;height:100dvh!important}.live-shell #panel{position:fixed!important;z-index:200!important;right:10px!important;top:10px!important;bottom:10px!important;height:auto!important;width:min(92vw,370px)!important;border:1px solid #ffffff20!important;border-radius:20px!important;transform:translateX(calc(100% + 30px))!important;transition:.28s!important}.live-shell #panel.open{transform:translateX(0)!important}.live-shell #panel header button{display:block!important}.live-shell #gear{display:block!important}}
  `;document.head.appendChild(css);

  const music=document.getElementById('music');let musicState=null;
  if(music){music.src='/background-music.ogg?v=8';music.loop=true;music.preload='auto';music.muted=false;music.load()}
  const file=document.getElementById('musicFile');
  if(file){const box=document.createElement('div');box.className='fixedMusic';box.innerHTML='<b>🎵 Bahar Gözlüm (Hazalım)</b><span>Otomatik döngü • yayın boyunca çalar</span><span id="musicState">Hazır</span>';file.replaceWith(box);musicState=document.getElementById('musicState')}
  const toggle=document.getElementById('musicToggle'),vol=document.getElementById('volume');
  if(vol){vol.value='.70'}
  function state(text,kind=''){if(!musicState)return;musicState.textContent=text;musicState.className=kind}
  function updateButton(){if(toggle)toggle.textContent=music&&music.paused?'▶ Müziği Devam Ettir':'⏸ Müziği Durdur';if(music&&!music.paused)state('● Müzik çalıyor','musicOk')}
  function playMusic(){if(!music)return;music.muted=false;music.volume=vol?Number(vol.value):.70;const p=music.play();if(p)p.then(()=>{updateButton();state('● Müzik çalıyor','musicOk')}).catch(e=>{state('Müzik başlatılamadı — butona tekrar bas','musicErr');console.warn('music play',e)})}
  if(toggle)toggle.onclick=()=>{if(!music)return;if(music.paused)playMusic();else{music.pause();state('Müzik durduruldu');updateButton()}};
  if(vol)vol.oninput=e=>{if(music){music.muted=false;music.volume=Number(e.target.value)}};
  window.duckMusic=on=>{if(!music||music.paused)return;const base=vol?Number(vol.value):.70;music.volume=on?Math.max(.12,base*.34):base};

  const start=document.getElementById('start');
  if(start){const prev=start.onclick;start.onclick=()=>{playMusic();prev?.()}}
  music?.addEventListener('canplay',()=>state('Hazır — Yayını Başlat ile çalar'));
  music?.addEventListener('play',()=>{updateButton();state('● Müzik çalıyor','musicOk')});
  music?.addEventListener('pause',()=>{updateButton();if(music.currentTime>0)state('Müzik durduruldu')});
  music?.addEventListener('error',()=>state('Müzik yükleme hatası','musicErr'));
  updateButton();
})();
