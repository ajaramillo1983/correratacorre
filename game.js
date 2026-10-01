(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const hintEl = document.getElementById("hint");
  let W = 1400, H = 780, GROUND = 640, portrait = false, level = 1;
  const GRAVITY = 2200, JUMP_V = -1560, GOAL = 1000;
  const HERO_ACC = 2600, HERO_FRI = 2000, HERO_MAX = 460;
  const STATES = { INTRO:"INTRO", PLAYING:"PLAYING", FINAL_HIT:"FINAL_HIT", COIN_EXPLOSION:"COIN_EXPLOSION", COIN_RETURN:"COIN_RETURN", VICTORY:"VICTORY", DEFEAT:"DEFEAT" };
  const FONT = { S:["01110","10001","10000","01110","00001","10001","01110"], A:["01110","10001","10001","11111","10001","10001","10001"], N:["10001","11001","10101","10011","10001","10001","10001"], T:["11111","00100","00100","00100","00100","00100","00100"], O:["01110","10001","10001","10001","10001","10001","01110"], D:["11110","10001","10001","10001","10001","10001","11110"], M:["10001","11011","10101","10101","10001","10001","10001"], I:["11111","00100","00100","00100","00100","00100","11111"], G:["01110","10001","10000","10111","10001","10001","01110"] };
  const PHRASE = "SANTO DOMINGO";
  let state = STATES.INTRO, last = 0, hits = 0, stolenCount = 0, lives = 3, muted = false, audioReady = false, ac = null, musicTimer = 0, hitLock = 0, stunT = 0, sequenceT = 0, camX = 0;
  let particles = [], keys = {}, touch = { left:false, right:false, jump:false }, coins = [], nextLetterX = 480, phraseIndex = 0;
  const heroImg = new Image(), yadiraImg = new Image(), wilsonImg = new Image();
  heroImg.src = "images/hero.png";
  yadiraImg.src = "images/yadira.png";
  wilsonImg.src = "images/wilson.png";
  const hero = { x:200, y:640, vx:0, vy:0, w:86, h:164, facing:1, onGround:true, walk:0 };
  const mouse = { x:560, y:640, vx:0, vy:0, dir:1, w:200, h:390, scale:1, squash:1, speed:210, target:null, alive:true, onGround:true, grab:null, grabT:0, bagPulse:0, walk:0 };
  function enemyImg(){ return level === 1 ? yadiraImg : wilsonImg; }
  function enemyName(){ return level === 1 ? "Yadira" : "Wilson"; }
  function applyLayoutSize(){
    portrait = window.innerWidth < 820 || window.innerHeight > window.innerWidth;
    W = portrait ? 780 : 1400; H = portrait ? 1280 : 780; GROUND = portrait ? 1080 : 640;
    canvas.width = W; canvas.height = H;
    hero.w = portrait ? 90 : 86; hero.h = portrait ? 210 : 190;
    mouse.w = hero.w * 2.3; mouse.h = hero.h * 2.3;
    const wrap = document.getElementById("game-wrap"), stage = document.getElementById("stage");
    const r = wrap.getBoundingClientRect();
    const scale = Math.min(r.width / W, r.height / H);
    canvas.style.width = Math.floor(W * scale) + "px";
    canvas.style.height = Math.floor(H * scale) + "px";
    if (stage) { stage.style.width = canvas.style.width; stage.style.height = canvas.style.height; }
  }
  function spawnLetter(ch, x){
    const grid = FONT[ch]; if (!grid) return;
    const cell = portrait ? 18 : 16;
    const high = phraseIndex % 2 === 0;
    const top = high ? GROUND - (portrait ? 430 : 390) : GROUND - (portrait ? 280 : 250);
    for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) if (grid[r][c] === "1") coins.push({ x:x+c*cell, y:top+r*cell, ox:x+c*cell, oy:top+r*cell, stolen:false, state:"home", r:8, rot:0, flyVx:0, flyVy:0, delay:0 });
  }
  function ensureSigns(){
    while (nextLetterX < camX + W + 700) {
      const ch = PHRASE[phraseIndex % PHRASE.length];
      if (ch !== " ") spawnLetter(ch, nextLetterX);
      nextLetterX += ch === " " ? 70 : 140;
      phraseIndex++;
    }
  }
  function placeEnemy(){ mouse.w = hero.w * 2.3; mouse.h = hero.h * 2.3; mouse.scale = 1; mouse.alive = true; mouse.x = hero.x + 360; mouse.y = GROUND; mouse.vx = 0; mouse.vy = 0; mouse.grab = null; }
  function resetWorld(){ hits = 0; stolenCount = 0; lives = 3; level = 1; camX = 0; coins = []; nextLetterX = 480; phraseIndex = 0; hero.x = 200; hero.y = GROUND; hero.vx = 0; hero.vy = 0; placeEnemy(); ensureSigns(); updateHud(); }
  window.addEventListener("resize", applyLayoutSize);
  applyLayoutSize(); resetWorld();
  function ensureAudio(){ if (!audioReady) { ac = new (window.AudioContext||window.webkitAudioContext)(); audioReady = true; } }
  function beep(f,d,t,v){ if (muted||!ac) return; const o=ac.createOscillator(), g=ac.createGain(); o.type=t||"square"; o.frequency.value=f; g.gain.value=v||0.06; g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime+d); o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime+d); }
  window.addEventListener("keydown", e => { keys[e.code]=true; if(["ArrowLeft","ArrowRight","ArrowUp","Space"].includes(e.code)) e.preventDefault(); });
  window.addEventListener("keyup", e => { keys[e.code]=false; });
  function bindHold(el, prop){ const on=ev=>{ev.preventDefault(); touch[prop]=true;}; const off=ev=>{ev.preventDefault(); touch[prop]=false;}; el.addEventListener("pointerdown", on); el.addEventListener("pointerup", off); el.addEventListener("pointerleave", off); }
  bindHold(document.getElementById("btn-left"), "left");
  bindHold(document.getElementById("btn-right"), "right");
  bindHold(document.getElementById("btn-jump"), "jump");
  document.getElementById("btn-mute").addEventListener("click", () => { muted=!muted; document.getElementById("btn-mute").textContent = muted ? "🔇" : "🔊"; });
  document.getElementById("btn-start").addEventListener("click", startGame);
  document.getElementById("btn-again").addEventListener("click", resetGame);
  document.getElementById("btn-retry").addEventListener("click", resetGame);
  function startGame(){ ensureAudio(); document.getElementById("popup").classList.remove("show"); hintEl.style.display="block"; hintEl.textContent="Nivel 1: salta 5 veces sobre Yadira"; state=STATES.PLAYING; }
  function resetGame(){ document.getElementById("victory").classList.remove("show"); document.getElementById("defeat").classList.remove("show"); applyLayoutSize(); resetWorld(); hintEl.style.display="block"; hintEl.textContent="Nivel 1: salta 5 veces sobre Yadira"; state=STATES.PLAYING; }
  function updateHud(){ document.getElementById("coin-hud").textContent = "🪙 " + stolenCount + "/" + GOAL; document.getElementById("hearts").textContent = "❤ ".repeat(lives).trim(); }
  function reachY(){ return mouse.y - mouse.h * mouse.scale * 0.42; }
  function handPos(){ return { x: mouse.x + mouse.w * mouse.scale * 0.42, y: mouse.y - mouse.h * mouse.scale * 0.45 }; }
  function nearestAhead(){ let best=null, bestD=1e9; for (const c of coins){ if (c.stolen||c.state!=="home"||c.x<mouse.x-20) continue; const d=c.x-mouse.x+Math.abs(c.y-reachY())*0.25; if (d<bestD){ bestD=d; best=c; } } return best; }
  function applyGravity(b, dt){ b.vy += GRAVITY*dt; b.x += b.vx*dt; b.y += b.vy*dt; if (b.y>=GROUND){ b.y=GROUND; b.vy=0; b.onGround=true; } else b.onGround=false; }
  function updateHero(dt){
    const left = keys.ArrowLeft||keys.KeyA||touch.left, right = keys.ArrowRight||keys.KeyD||touch.right, jump = keys.ArrowUp||keys.Space||keys.KeyW||touch.jump;
    if (right && !left){ hero.vx += HERO_ACC*dt; hero.facing=1; } else if (left && !right){ hero.vx -= HERO_ACC*dt; hero.facing=-1; }
    else hero.vx += (hero.vx>0?-1:1)*Math.min(Math.abs(hero.vx), HERO_FRI*dt);
    hero.vx = Math.max(-HERO_MAX, Math.min(HERO_MAX, hero.vx));
    if (jump && hero.onGround){ hero.vy = JUMP_V; hero.onGround=false; beep(420,0.12,"square",0.07); }
    applyGravity(hero, dt);
    if (hero.x < camX+30){ hero.x = camX+30; hero.vx = Math.max(0, hero.vx); }
    if (Math.abs(hero.vx)>30 && hero.onGround) hero.walk += dt*10;
  }
  function updateMouse(dt){
    mouse.dir = 1;
    if (mouse.grab){
      mouse.grabT += dt; const hand = handPos();
      mouse.grab.x += (hand.x-mouse.grab.x)*Math.min(1, dt*12);
      mouse.grab.y += (hand.y-mouse.grab.y)*Math.min(1, dt*12);
      mouse.grab.state = "grab";
      if (mouse.grabT > 0.34){ mouse.grab.state="pocket"; mouse.grab.stolen=true; stolenCount++; mouse.bagPulse=0.3; mouse.grab=null; beep(300,0.1,"square",0.05); updateHud(); }
      mouse.vx = 30; applyGravity(mouse, dt); return;
    }
    if (!mouse.target || mouse.target.stolen) mouse.target = nearestAhead();
    mouse.vx = mouse.speed;
    if (mouse.target){
      if (mouse.target.x - mouse.x < 36){
        if (mouse.target.y < reachY()-20 && mouse.onGround) mouse.vy = JUMP_V;
        if (Math.abs(mouse.target.y - reachY()) < 52){ mouse.grab = mouse.target; mouse.grabT = 0; mouse.vx = 0; }
      }
    }
    applyGravity(mouse, dt); mouse.walk += dt*8;
  }
  function checkStomp(){
    if (!mouse.alive || hitLock>0 || hero.onGround || hero.vy<=40) return;
    const mw = mouse.w*mouse.scale, mh = mouse.h*mouse.scale;
    const head = { x:mouse.x-mw*0.28, y:mouse.y-mh, w:mw*0.56, h:mh*0.28 };
    const feet = { x:hero.x-18, y:hero.y-16, w:36, h:18 };
    if (!(feet.x < head.x+head.w && feet.x+feet.w > head.x && feet.y < head.y+head.h && feet.y+feet.h > head.y)) return;
    hits++; hitLock = 0.45; stunT = 0.25; hero.vy = JUMP_V*0.55; mouse.squash = 0.7; beep(180,0.14,"square",0.1);
    if (hits < 5){ mouse.scale = 1 - hits*0.16; hintEl.textContent = "Golpe "+hits+"/5 sobre "+enemyName(); }
    else { state = STATES.FINAL_HIT; sequenceT = 0; hintEl.textContent = enemyName()+" desaparece"; beep(90,0.3,"sawtooth",0.12); }
  }
  function explodeMouse(){
    mouse.alive = false;
    coins.forEach(c => { if (!c.stolen) return; c.state="fly"; c.x=mouse.x; c.y=mouse.y-80; c.flyVx=(Math.random()-0.3)*400; c.flyVy=-220-Math.random()*200; });
  }
  function update(dt){
    if (dt>0.05) dt=0.05;
    hitLock=Math.max(0,hitLock-dt); stunT=Math.max(0,stunT-dt); mouse.squash += (1-mouse.squash)*Math.min(1,dt*8); mouse.bagPulse=Math.max(0,mouse.bagPulse-dt);
    if (state===STATES.INTRO || state===STATES.DEFEAT || state===STATES.VICTORY) return;
    if (state===STATES.PLAYING){ updateHero(dt); if (stunT<=0 && mouse.alive) updateMouse(dt); else applyGravity(mouse,dt); checkStomp(); ensureSigns(); if (stolenCount>=GOAL){ state=STATES.DEFEAT; hintEl.style.display="none"; document.getElementById("lives-left").textContent = enemyName()+" llegó a 1000 monedas."; document.getElementById("defeat").classList.add("show"); } }
    if (state===STATES.FINAL_HIT){ sequenceT+=dt; if (sequenceT>0.25){ explodeMouse(); state=STATES.COIN_EXPLOSION; sequenceT=0; } }
    if (state===STATES.COIN_EXPLOSION){ sequenceT+=dt; coins.forEach(c=>{ if(c.state!=="fly")return; c.flyVy+=900*dt; c.x+=c.flyVx*dt; c.y+=c.flyVy*dt; if(c.y>GROUND-8){c.y=GROUND-8; c.flyVy*=-0.4;} }); if (sequenceT>1){ state=STATES.COIN_RETURN; coins.forEach((c,i)=>{ if(c.stolen){ c.state="return"; c.delay=(i%8)*0.02; } }); } }
    if (state===STATES.COIN_RETURN){
      coins.forEach(c=>{ if(c.state!=="return")return; if(c.delay>0){c.delay-=dt;return;} c.x+=(c.ox-c.x)*Math.min(1,dt*3); c.y+=(c.oy-c.y)*Math.min(1,dt*3); if(Math.hypot(c.ox-c.x,c.oy-c.y)<6){ c.x=c.ox; c.y=c.oy; c.stolen=false; c.state="home"; stolenCount=Math.max(0,stolenCount-1);} });
      updateHud();
      if (coins.every(c=>!c.stolen)){
        if (level===1){ level=2; hits=0; stolenCount=0; placeEnemy(); mouse.x=hero.x+380; state=STATES.PLAYING; hintEl.textContent="Nivel 2: salta 5 veces sobre Wilson"; updateHud(); }
        else { state=STATES.VICTORY; hintEl.style.display="none"; setTimeout(()=>document.getElementById("victory").classList.add("show"), 400); }
      }
    }
    camX += (Math.max(0, hero.x - W*0.32) - camX) * Math.min(1, dt*4);
  }
  function drawSprite(img, x, y, w, h, facing){
    if (!img.complete || !img.naturalWidth) return;
    ctx.save(); ctx.translate(x-camX, y); if (facing<0) ctx.scale(-1,1); ctx.drawImage(img, -w/2, -h, w, h); ctx.restore();
  }
  function draw(){
    const g = ctx.createLinearGradient(0,0,0,H); g.addColorStop(0,"#5ec4f5"); g.addColorStop(1,"#9ad8f8"); ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
    ctx.fillStyle="#fff"; ctx.beginPath(); ctx.arc(120,70,26,0,6.3); ctx.arc(420,90,22,0,6.3); ctx.fill();
    ctx.fillStyle="#6d3a16"; ctx.fillRect(0,GROUND,W,H-GROUND);
    ctx.fillStyle="#3d8c3a"; ctx.fillRect(0,GROUND-8,W,8);
    for (const c of coins){ if (c.state==="pocket" || c.x<camX-20 || c.x>camX+W+20) continue; ctx.fillStyle="#ffd54a"; ctx.beginPath(); ctx.arc(c.x-camX,c.y,c.r,0,6.3); ctx.fill(); }
    drawSprite(heroImg, hero.x, hero.y, hero.w, hero.h, hero.facing);
    if (mouse.alive) drawSprite(enemyImg(), mouse.x, mouse.y, mouse.w*mouse.scale, mouse.h*mouse.scale*mouse.squash, 1);
  }
  function loop(ts){ if(!last) last=ts; const dt=(ts-last)/1000; last=ts; update(dt); draw(); requestAnimationFrame(loop); }
  requestAnimationFrame(loop);
})();
