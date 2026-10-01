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
  let state = STATES.INTRO, last = 0, hits = 0, stolenCount = 0, lives = 3, muted = false, audioReady = false, ac = null, hitLock = 0, stunT = 0, sequenceT = 0, camX = 0;
  let keys = {}, touch = { left:false, right:false, jump:false }, coins = [], nextLetterX = 480, phraseIndex = 0;
  const heroImg = new Image(), yadiraImg = new Image(), wilsonImg = new Image();
  heroImg.src = "images/hero.png"; yadiraImg.src = "images/yadira.png"; wilsonImg.src = "images/wilson.png";
  const hero = { x:200, y:640, vx:0, vy:0, w:86, h:190, facing:1, onGround:true, walk:0, crouch:0 };
  const mouse = { x:560, y:640, vx:0, vy:0, dir:1, w:220, h:420, scale:1, speed:210, target:null, alive:true, onGround:true, grab:null, grabT:0, walk:0, pocket:0 };
  function enemyImg(){ return level === 1 ? yadiraImg : wilsonImg; }
  function enemyName(){ return level === 1 ? "Yadira" : "Wilson"; }
  function aspect(img){ return (img.naturalWidth && img.naturalHeight) ? img.naturalWidth / img.naturalHeight : 0.7; }
  function sizeFromHeight(img, height){ return { h: height, w: height * aspect(img) }; }
  function applyLayoutSize(){
    portrait = window.innerWidth < 820 || window.innerHeight > window.innerWidth;
    W = portrait ? 780 : 1400; H = portrait ? 1280 : 780; GROUND = portrait ? 1080 : 640;
    canvas.width = W; canvas.height = H;
    hero.h = portrait ? 210 : 190; hero.w = hero.h * aspect(heroImg);
    mouse.h = hero.h * 2.15; mouse.w = mouse.h * aspect(enemyImg());
    const wrap = document.getElementById("game-wrap"), stage = document.getElementById("stage");
    const r = wrap.getBoundingClientRect(), scale = Math.min(r.width / W, r.height / H);
    canvas.style.width = Math.floor(W * scale) + "px"; canvas.style.height = Math.floor(H * scale) + "px";
    if (stage) { stage.style.width = canvas.style.width; stage.style.height = canvas.style.height; }
  }
  function spawnLetter(ch, x, high){
    const grid = FONT[ch]; if (!grid) return;
    const cell = portrait ? 20 : 18;
    const top = high ? GROUND - (portrait ? 470 : 420) : GROUND - (portrait ? 290 : 255);
    for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) if (grid[r][c] === "1") coins.push({ x:x+c*cell, y:top+r*cell, ox:x+c*cell, oy:top+r*cell, stolen:false, state:"home", r: portrait ? 10 : 9.5, flyVx:0, flyVy:0, delay:0 });
  }
  function ensureSigns(){ while (nextLetterX < camX + W + 760) { const i = phraseIndex % PHRASE.length; const ch = PHRASE[i]; if (ch !== " ") spawnLetter(ch, nextLetterX, i < 5); nextLetterX += ch === " " ? 90 : 150; phraseIndex++; } }
  function placeEnemy(){ mouse.h = hero.h * 2.15; mouse.w = mouse.h * aspect(enemyImg()); mouse.scale = 1; mouse.alive = true; mouse.x = hero.x + 380; mouse.y = GROUND; mouse.vx = 0; mouse.vy = 0; mouse.grab = null; mouse.grabT = 0; }
  function resetWorld(){ hits = 0; stolenCount = 0; lives = 3; level = 1; camX = 0; coins = []; nextLetterX = 480; phraseIndex = 0; hero.x = 200; hero.y = GROUND; hero.vx = 0; hero.vy = 0; hero.crouch = 0; placeEnemy(); ensureSigns(); updateHud(); }
  window.addEventListener("resize", applyLayoutSize);
  heroImg.onload = yadiraImg.onload = wilsonImg.onload = applyLayoutSize;
  applyLayoutSize(); resetWorld();
  function ensureAudio(){ if (!audioReady) { ac = new (window.AudioContext||window.webkitAudioContext)(); audioReady = true; } }
  function beep(f,d,t,v){ if (muted||!ac) return; const o=ac.createOscillator(), g=ac.createGain(); o.type=t||"square"; o.frequency.value=f; g.gain.value=v||0.06; g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime+d); o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime+d); }
  window.addEventListener("keydown", e => { keys[e.code]=true; if(["ArrowLeft","ArrowRight","ArrowUp","Space"].includes(e.code)) e.preventDefault(); });
  window.addEventListener("keyup", e => { keys[e.code]=false; });
  function bindHold(el, prop){ const on=ev=>{ev.preventDefault(); touch[prop]=true;}; const off=ev=>{ev.preventDefault(); touch[prop]=false;}; el.addEventListener("pointerdown", on); el.addEventListener("pointerup", off); el.addEventListener("pointerleave", off); }
  bindHold(document.getElementById("btn-left"), "left"); bindHold(document.getElementById("btn-right"), "right"); bindHold(document.getElementById("btn-jump"), "jump");
  document.getElementById("btn-mute").addEventListener("click", () => { muted=!muted; document.getElementById("btn-mute").textContent = muted ? "\ud83d\udd07" : "\ud83d\udd0a"; });
  document.getElementById("btn-start").addEventListener("click", startGame);
  document.getElementById("btn-again").addEventListener("click", resetGame);
  document.getElementById("btn-retry").addEventListener("click", resetGame);
  function startGame(){ ensureAudio(); document.getElementById("popup").classList.remove("show"); hintEl.style.display="block"; hintEl.textContent="Nivel 1: salta 5 veces sobre Yadira"; state=STATES.PLAYING; }
  function resetGame(){ document.getElementById("victory").classList.remove("show"); document.getElementById("defeat").classList.remove("show"); applyLayoutSize(); resetWorld(); hintEl.style.display="block"; hintEl.textContent="Nivel 1: salta 5 veces sobre Yadira"; state=STATES.PLAYING; }
  function updateHud(){ document.getElementById("coin-hud").textContent = "\ud83e\ude99 " + stolenCount + "/" + GOAL; document.getElementById("hearts").textContent = "\u2764 ".repeat(lives).trim(); }
  function drawnMouse(){ return sizeFromHeight(enemyImg(), mouse.h * mouse.scale); }
  function reachY(){ return mouse.y - drawnMouse().h * 0.38; }
  function tailSide(){ return level === 1 ? 1 : -1; }
  function tailBase(){ const s = drawnMouse(); return { x: mouse.x + tailSide() * s.w * 0.28, y: mouse.y - s.h * 0.34 }; }
  function pocketPos(){ const s = drawnMouse(); return { x: mouse.x + tailSide() * s.w * 0.1, y: mouse.y - s.h * 0.32 }; }
  function tailTip(){
    const base = tailBase();
    if (!mouse.grab) return { x: base.x + tailSide() * 64, y: base.y + 16 + Math.sin(mouse.walk) * 8 };
    const back = mouse.grabT > 0.24;
    const t = back ? Math.min(1, (mouse.grabT - 0.24) / 0.28) : Math.min(1, mouse.grabT / 0.24);
    const dest = back ? pocketPos() : { x: mouse.grab.x, y: mouse.grab.y };
    return { x: base.x + (dest.x - base.x) * t, y: base.y + (dest.y - base.y) * t };
  }
  function nearestAhead(){ let best=null, bestD=1e9; for (const c of coins){ if (c.stolen||c.state!=="home"||c.x<mouse.x-20) continue; const d=c.x-mouse.x+Math.abs(c.y-reachY())*0.25; if (d<bestD){ bestD=d; best=c; } } return best; }
  function applyGravity(b, dt){ b.vy += GRAVITY*dt; b.x += b.vx*dt; b.y += b.vy*dt; if (b.y>=GROUND){ b.y=GROUND; b.vy=0; b.onGround=true; } else b.onGround=false; }
  function updateHero(dt){
    const left = keys.ArrowLeft||keys.KeyA||touch.left, right = keys.ArrowRight||keys.KeyD||touch.right, jump = keys.ArrowUp||keys.Space||keys.KeyW||touch.jump;
    if (right && !left){ hero.vx += HERO_ACC*dt; hero.facing=1; } else if (left && !right){ hero.vx -= HERO_ACC*dt; hero.facing=-1; }
    else hero.vx += (hero.vx>0?-1:1)*Math.min(Math.abs(hero.vx), HERO_FRI*dt);
    hero.vx = Math.max(-HERO_MAX, Math.min(HERO_MAX, hero.vx));
    if (jump && hero.onGround && hero.crouch <= 0) hero.crouch = 0.14;
    if (hero.crouch > 0){ hero.crouch -= dt; if (hero.crouch <= 0){ hero.vy = JUMP_V; hero.onGround = false; beep(420,0.12,"square",0.07); } }
    applyGravity(hero, dt);
    if (hero.x < camX+30){ hero.x = camX+30; hero.vx = Math.max(0, hero.vx); }
    if (Math.abs(hero.vx)>30 && hero.onGround) hero.walk += dt*10;
  }
  function updateMouse(dt){
    mouse.walk += dt * 8; mouse.pocket = Math.max(0, mouse.pocket - dt);
    if (mouse.grab){
      mouse.grabT += dt; const tip = tailTip();
      mouse.grab.x += (tip.x - mouse.grab.x) * Math.min(1, dt * 12);
      mouse.grab.y += (tip.y - mouse.grab.y) * Math.min(1, dt * 12);
      mouse.grab.state = "grab";
      if (mouse.grabT > 0.56){ mouse.grab.stolen = true; mouse.grab.state = "pocket"; stolenCount++; mouse.pocket = 0.28; mouse.grab = null; beep(300,0.1,"square",0.05); updateHud(); }
      mouse.vx = 24; applyGravity(mouse, dt); return;
    }
    if (!mouse.target || mouse.target.stolen) mouse.target = nearestAhead();
    mouse.vx = mouse.speed;
    if (mouse.target && mouse.target.x - mouse.x < 70){
      if (mouse.target.y < reachY()-20 && mouse.onGround) mouse.vy = JUMP_V;
      if (Math.abs(mouse.target.y - reachY()) < 70){ mouse.grab = mouse.target; mouse.grabT = 0; mouse.vx = 0; }
    }
    applyGravity(mouse, dt);
  }
  function checkStomp(){
    if (!mouse.alive || hitLock>0 || hero.onGround || hero.vy<=40) return;
    const s = drawnMouse();
    const head = { x:mouse.x-s.w*0.22, y:mouse.y-s.h, w:s.w*0.44, h:s.h*0.24 };
    const feet = { x:hero.x-18, y:hero.y-16, w:36, h:18 };
    if (!(feet.x < head.x+head.w && feet.x+feet.w > head.x && feet.y < head.y+head.h && feet.y+feet.h > head.y)) return;
    hits++; hitLock = 0.45; stunT = 0.25; hero.vy = JUMP_V*0.55; beep(180,0.14,"square",0.1);
    if (hits < 5){ mouse.scale = 1 - hits*0.14; hintEl.textContent = "Golpe "+hits+"/5 sobre "+enemyName(); }
    else { state = STATES.FINAL_HIT; sequenceT = 0; hintEl.textContent = enemyName()+" desaparece"; beep(90,0.3,"sawtooth",0.12); }
  }
  function explodeMouse(){ mouse.alive = false; coins.forEach(c => { if (!c.stolen) return; c.state="fly"; c.x=mouse.x; c.y=mouse.y-80; c.flyVx=(Math.random()-0.3)*400; c.flyVy=-220-Math.random()*200; }); }
  function update(dt){
    if (dt>0.05) dt=0.05; hitLock=Math.max(0,hitLock-dt); stunT=Math.max(0,stunT-dt);
    if (state===STATES.INTRO || state===STATES.DEFEAT || state===STATES.VICTORY) return;
    if (state===STATES.PLAYING){ updateHero(dt); if (stunT<=0 && mouse.alive) updateMouse(dt); else applyGravity(mouse,dt); checkStomp(); ensureSigns(); if (stolenCount>=GOAL){ state=STATES.DEFEAT; hintEl.style.display="none"; document.getElementById("lives-left").textContent = enemyName()+" lleg\u00f3 a 1000 monedas."; document.getElementById("defeat").classList.add("show"); } }
    if (state===STATES.FINAL_HIT){ sequenceT+=dt; if (sequenceT>0.25){ explodeMouse(); state=STATES.COIN_EXPLOSION; sequenceT=0; } }
    if (state===STATES.COIN_EXPLOSION){ sequenceT+=dt; coins.forEach(c=>{ if(c.state!=="fly")return; c.flyVy+=900*dt; c.x+=c.flyVx*dt; c.y+=c.flyVy*dt; if(c.y>GROUND-8){c.y=GROUND-8; c.flyVy*=-0.4;} }); if (sequenceT>1){ state=STATES.COIN_RETURN; coins.forEach((c,i)=>{ if(c.stolen){ c.state="return"; c.delay=(i%8)*0.02; } }); } }
    if (state===STATES.COIN_RETURN){
      coins.forEach(c=>{ if(c.state!=="return")return; if(c.delay>0){c.delay-=dt;return;} c.x+=(c.ox-c.x)*Math.min(1,dt*3); c.y+=(c.oy-c.y)*Math.min(1,dt*3); if(Math.hypot(c.ox-c.x,c.oy-c.y)<6){ c.x=c.ox; c.y=c.oy; c.stolen=false; c.state="home"; stolenCount=Math.max(0,stolenCount-1);} });
      updateHud();
      if (coins.every(c=>!c.stolen)){
        if (level===1){ level=2; hits=0; stolenCount=0; placeEnemy(); mouse.x=hero.x+400; state=STATES.PLAYING; hintEl.textContent="Nivel 2: salta 5 veces sobre Wilson"; updateHud(); }
        else { state=STATES.VICTORY; hintEl.style.display="none"; setTimeout(()=>document.getElementById("victory").classList.add("show"), 400); }
      }
    }
    camX += (Math.max(0, hero.x - W*0.32) - camX) * Math.min(1, dt*4);
  }
  function drawHero(){
    if (!heroImg.complete || !heroImg.naturalWidth) return;
    const s = sizeFromHeight(heroImg, hero.h); hero.w = s.w;
    const iw = heroImg.naturalWidth, ih = heroImg.naturalHeight;
    const bend = hero.crouch > 0 || (!hero.onGround && hero.vy < 0);
    const falling = !hero.onGround && hero.vy > 80;
    const step = hero.onGround ? Math.sin(hero.walk) * 0.35 : 0;
    const arm = falling ? -1.15 : (bend ? 0.35 : step);
    ctx.save(); ctx.translate(hero.x-camX, hero.y); if (hero.facing<0) ctx.scale(-1,1);
    ctx.drawImage(heroImg, iw*0.22, 0, iw*0.56, ih*0.58, -s.w*0.28, -s.h, s.w*0.56, s.h*0.58);
    ctx.save(); ctx.translate(-s.w*0.3, -s.h*0.72); ctx.rotate(arm); ctx.drawImage(heroImg, 0, ih*0.3, iw*0.24, ih*0.28, -s.w*0.04, 0, s.w*0.24, s.h*0.28); ctx.restore();
    ctx.save(); ctx.translate(s.w*0.3, -s.h*0.72); ctx.rotate(-arm); ctx.drawImage(heroImg, iw*0.76, ih*0.3, iw*0.24, ih*0.28, -s.w*0.2, 0, s.w*0.24, s.h*0.28); ctx.restore();
    ctx.save(); ctx.translate(0, -s.h*0.42); ctx.rotate(bend ? 0.45 : step); ctx.drawImage(heroImg, 0, ih*0.55, iw, ih*0.45, -s.w/2, 0, s.w, s.h*0.45); ctx.restore();
    ctx.restore();
  }
  function drawMouse(){
    if (!mouse.alive) return;
    const img = enemyImg(); if (!img.complete || !img.naturalWidth) return;
    const s = sizeFromHeight(img, mouse.h * mouse.scale); mouse.w = s.w;
    const iw = img.naturalWidth, ih = img.naturalHeight, side = tailSide();
    const bob = mouse.onGround ? Math.sin(mouse.walk) * 3 : 0;
    const base = tailBase(), tip = tailTip();
    const ang = Math.atan2(tip.y - base.y, tip.x - base.x);
    ctx.save(); ctx.translate(mouse.x-camX, mouse.y + bob);
    if (side > 0) ctx.drawImage(img, 0, 0, iw*0.78, ih, -s.w/2, -s.h, s.w*0.78, s.h);
    else ctx.drawImage(img, iw*0.22, 0, iw*0.78, ih, -s.w/2 + s.w*0.22, -s.h, s.w*0.78, s.h);
    ctx.save();
    ctx.translate(side * s.w * 0.28, -s.h * 0.34);
    ctx.rotate(ang - (side > 0 ? 0.8 : 2.3));
    if (side > 0) ctx.drawImage(img, iw*0.62, ih*0.42, iw*0.38, ih*0.38, 0, -s.h*0.08, s.w*0.38, s.h*0.38);
    else ctx.drawImage(img, 0, ih*0.28, iw*0.36, ih*0.4, -s.w*0.36, -s.h*0.08, s.w*0.36, s.h*0.4);
    ctx.restore(); ctx.restore();
  }
  function cloud(x, y, s){ ctx.fillStyle="#fff"; ctx.beginPath(); ctx.ellipse(x,y,34*s,16*s,0,0,6.3); ctx.ellipse(x-22*s,y+4*s,22*s,14*s,0,0,6.3); ctx.ellipse(x+24*s,y+6*s,26*s,15*s,0,0,6.3); ctx.fill(); }
  function palm(x){ const y=GROUND-6; ctx.strokeStyle="#8a5a28"; ctx.lineWidth=7; ctx.lineCap="round"; ctx.beginPath(); ctx.moveTo(x,y); ctx.quadraticCurveTo(x+8,y-40,x-2,y-78); ctx.stroke(); ctx.fillStyle="#2f9a3a"; [[-34,-8],[28,-4],[-18,-28],[22,-26],[0,-36]].forEach(([dx,dy],i)=>{ ctx.beginPath(); ctx.ellipse(x+dx,y-78+dy,22,8,(i-2)*0.45,0,6.3); ctx.fill(); }); }
  function goldCoin(c){ const x=c.x-camX,y=c.y,r=c.r; const g=ctx.createRadialGradient(x-r*0.35,y-r*0.4,r*0.2,x,y,r); g.addColorStop(0,"#fff1a8"); g.addColorStop(0.45,"#ffc62b"); g.addColorStop(1,"#d48900"); ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,r,0,6.3); ctx.fill(); ctx.strokeStyle="#b87400"; ctx.lineWidth=2; ctx.stroke(); ctx.fillStyle="#fff8d2"; ctx.font="900 "+Math.max(8,r)+"px Trebuchet MS"; ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.fillText("?",x,y+0.5); }
  function draw(){
    const g=ctx.createLinearGradient(0,0,0,H); g.addColorStop(0,"#1f92f2"); g.addColorStop(0.55,"#67c6fb"); g.addColorStop(1,"#b7e6ff"); ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
    const shift=camX*0.15; cloud(160-(shift%900),78,1.15); cloud(520-(shift%1100),130,0.85); cloud(860-(shift%980),64,1.25);
    ctx.fillStyle="#c46a32"; ctx.fillRect(0,GROUND,W,H-GROUND); ctx.fillStyle="#3cab45"; ctx.fillRect(0,GROUND-10,W,12);
    const palmShift=camX*0.35; for (let x=180-(palmShift%340); x<W+40; x+=340) palm(x);
    for (const c of coins){ if (c.state==="pocket" || c.x<camX-30 || c.x>camX+W+30) continue; goldCoin(c); }
    drawHero(); drawMouse();
  }
  function loop(ts){ if(!last) last=ts; const dt=(ts-last)/1000; last=ts; update(dt); draw(); requestAnimationFrame(loop); }
  requestAnimationFrame(loop);
})();
