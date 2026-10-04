(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const hintEl = document.getElementById("hint");
  let W = 1400, H = 780, GROUND = 640, portrait = false, level = 1;
  const GRAVITY = 2200, JUMP_V = -1560, GOAL = 1000;
  const HERO_ACC = 2600, HERO_FRI = 2000, HERO_MAX = 460;
  const FONT = {
    S:["01110","10001","10000","01110","00001","10001","01110"],
    A:["01110","10001","10001","11111","10001","10001","10001"],
    N:["10001","11001","10101","10011","10001","10001","10001"],
    T:["11111","00100","00100","00100","00100","00100","00100"],
    O:["01110","10001","10001","10001","10001","10001","01110"],
    D:["11110","10001","10001","10001","10001","10001","11110"],
    M:["10001","11011","10101","10101","10001","10001","10001"],
    I:["11111","00100","00100","00100","00100","00100","11111"],
    G:["01110","10001","10000","10111","10001","10001","01110"]
  };
  const PHRASE = "SANTO DOMINGO";
  const BRIEFS = {
    2: "¡Genial! No permitiste que se roben Santo Domingo, pero espera... Wilson ha llamado a su candidata Yadira, para que lo ayude. ¡No lo permitas! Las obras que hace hoy, te las cobrarán mañana con muchos intereses.",
    3: "¡No puede ser! El Gobierno ha enviado recursos y Wilson y su candidata se han multiplicado, no permitas que se roben Santo Domingo.",
    4: "Vaya, vaya... Henry Ayala ha conseguido más maquinaria para convencer a los votantes y ha multiplicado a Wilson y Yadira. Evita que se lleven más dinero para incrementar su patrimonio.",
    5: "El día de las elecciones está a punto de llegar y personajes oscuros han colocado más dinero en la campaña de Wilson y Yadira. ¡Se multiplicaron! Persíguelos y salta cinco veces en su cabeza para ganar."
  };
  const LIFE_TEXT = [
    "Recuerda que las obras que hacen hoy, en campaña, te las cobran luego con intereses cuando llegan al poder. ¡Vuelve a intentar!",
    "Ups, Wilson y Jadira fueron más rápidos para robar. No te desanimes, te queda una vida para salvar Santo Domingo."
  ];
  const LEVELS = [
    { e1:1, e2:0, speed:170 },
    { e1:0, e2:1, speed:220 },
    { e1:1, e2:1, speed:270 },
    { e1:2, e2:2, speed:320 },
    { e1:4, e2:4, speed:360 }
  ];
  let state = "INTRO", last = 0, stolenCount = 0, lives = 3, muted = false, audioReady = false, ac = null, hitLock = 0, camX = 0, clock = 0;
  let keys = {}, touch = { left:false, right:false, jump:false };
  let coins = [], obstacles = [], enemies = [], nextLetterX = 520, phraseIndex = 0, heroId = 1;
  const imgs = { hero1:new Image(), hero2:new Image(), enemy1:new Image(), enemy2:new Image() };
  imgs.hero1.src = "images/hero1.png"; imgs.hero2.src = "images/hero2.png";
  imgs.enemy1.src = "images/enemy1.png"; imgs.enemy2.src = "images/enemy2.png";
  const hero = { x:180, y:640, vx:0, vy:0, w:80, h:168, facing:1, onGround:true, scale:1 };
  function ready(img){ return img && img.complete && img.naturalWidth; }
  function aspect(img){ return ready(img) ? img.naturalWidth / img.naturalHeight : 0.5; }
  function heroImg(){ return heroId === 2 ? imgs.hero2 : imgs.hero1; }
  function applyLayoutSize(){
    portrait = window.innerWidth < 820 || window.innerHeight > window.innerWidth;
    W = portrait ? 780 : 1400; H = portrait ? 1280 : 780; GROUND = portrait ? 1040 : 620;
    canvas.width = W; canvas.height = H;
    hero.h = portrait ? 168 : 176;
    const wrap = document.getElementById("game-wrap"), stage = document.getElementById("stage");
    const r = wrap.getBoundingClientRect();
    const scale = Math.min(r.width / W, r.height / H);
    canvas.style.width = Math.floor(W * scale) + "px";
    canvas.style.height = Math.floor(H * scale) + "px";
    if (stage) { stage.style.width = canvas.style.width; stage.style.height = canvas.style.height; }
  }
  function sizeOf(img, height){ return { h: height, w: height * aspect(img) }; }
  function spawnLetter(ch, x, high){
    const grid = FONT[ch]; if (!grid) return;
    const cell = portrait ? 22 : 20;
    const top = high ? GROUND - (portrait ? 500 : 430) : GROUND - (portrait ? 300 : 250);
    for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) if (grid[r][c] === "1") {
      coins.push({ x:x+c*cell, y:top+r*cell, ox:x+c*cell, oy:top+r*cell, stolen:false, state:"home", kind:(r+c)%3===0?"bill":"coin", r:portrait?11:12, owner:null, flyVx:0, flyVy:0, delay:0 });
    }
  }
  function ensureSigns(){
    while (nextLetterX < camX + W + 820) {
      const i = phraseIndex % PHRASE.length, ch = PHRASE[i];
      if (ch !== " ") spawnLetter(ch, nextLetterX, i < 5);
      nextLetterX += ch === " " ? 100 : 168; phraseIndex++;
    }
  }
  function makeEnemy(kind, x){ return { kind, x, y:GROUND, vx:0, vy:0, scale:1, hits:0, alive:true, onGround:true, target:null, grab:null, grabT:0 }; }
  function spawnLevel(){
    const cfg = LEVELS[level-1];
    enemies = []; let x = hero.x + 460;
    for (let i = 0; i < cfg.e1; i++) { enemies.push(makeEnemy(1, x)); x += 280; }
    for (let i = 0; i < cfg.e2; i++) { enemies.push(makeEnemy(2, x)); x += 280; }
    obstacles = [];
    if (level === 3) for (let i = 0; i < 6; i++) obstacles.push({ type:"mud", x:980+i*640, w:110, h:18 });
    if (level === 4) for (let i = 0; i < 5; i++) obstacles.push({ type: i % 2 ? "car" : "house", x:1000+i*780, w: i % 2 ? 120 : 140, h: i % 2 ? 50 : 100 });
    if (level === 5) for (let i = 0; i < 3; i++) obstacles.push({ type:"oncoming", x:1400+i*1600, w:130, h:52, vx:-180 });
  }
  function resetWorld(){
    level = 1; stolenCount = 0; lives = 3; camX = 0; coins = []; nextLetterX = 520; phraseIndex = 0;
    hero.x = 180; hero.y = GROUND; hero.vx = 0; hero.vy = 0; hero.scale = 1; hero.onGround = true;
    spawnLevel(); ensureSigns(); updateHud();
  }
  function retryLevel(){
    stolenCount = 0; camX = 0; coins = []; nextLetterX = 520; phraseIndex = 0;
    hero.x = 180; hero.y = GROUND; hero.vx = 0; hero.vy = 0; hero.onGround = true;
    spawnLevel(); ensureSigns(); updateHud();
  }
  window.addEventListener("resize", applyLayoutSize);
  imgs.hero1.onload = imgs.hero2.onload = applyLayoutSize;
  applyLayoutSize(); resetWorld();
  function ensureAudio(){ if (!audioReady) { ac = new (window.AudioContext||window.webkitAudioContext)(); audioReady = true; } }
  function beep(f,d,t,v){ if (muted||!ac) return; const o=ac.createOscillator(), g=ac.createGain(); o.type=t||"square"; o.frequency.value=f; g.gain.value=v||0.06; g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime+d); o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime+d); }
  window.addEventListener("keydown", e => {
    keys[e.code]=true;
    if (["ArrowLeft","ArrowRight","ArrowUp","Space"].includes(e.code)) e.preventDefault();
    if (e.code === "Enter" && document.getElementById("brief").classList.contains("show")) {
      e.preventDefault(); document.getElementById("btn-brief").click();
    }
  });
  window.addEventListener("keyup", e => { keys[e.code]=false; });
  function bindHold(el, prop){ const on=ev=>{ev.preventDefault(); touch[prop]=true;}; const off=ev=>{ev.preventDefault(); touch[prop]=false;}; el.addEventListener("pointerdown", on); el.addEventListener("pointerup", off); el.addEventListener("pointercancel", off); el.addEventListener("pointerleave", off); }
  bindHold(document.getElementById("btn-left"), "left");
  bindHold(document.getElementById("btn-right"), "right");
  bindHold(document.getElementById("btn-jump"), "jump");
  document.getElementById("btn-mute").addEventListener("click", () => { muted=!muted; document.getElementById("btn-mute").textContent = muted ? "🔇" : "🔊"; });
  document.getElementById("btn-start").addEventListener("click", () => { ensureAudio(); hideAll(); document.getElementById("select").classList.add("show"); });
  document.getElementById("pick-hero1").addEventListener("click", () => choose(1));
  document.getElementById("pick-hero2").addEventListener("click", () => choose(2));
  document.getElementById("btn-exit").addEventListener("click", () => { hideAll(); document.getElementById("popup").classList.add("show"); state="INTRO"; });
  document.getElementById("btn-brief").addEventListener("click", () => {
    hideAll();
    spawnLevel();
    ensureSigns();
    hintEl.style.display="block";
    hintEl.textContent = "Nivel " + level + ": salta 5 veces en la cabeza";
    state="PLAYING";
  });
  document.getElementById("btn-life").addEventListener("click", () => { hideAll(); retryLevel(); hintEl.style.display="block"; state="PLAYING"; });
  document.getElementById("btn-again").addEventListener("click", restart);
  document.getElementById("btn-retry").addEventListener("click", restart);
  document.getElementById("btn-restart").addEventListener("click", restart);
  function hideAll(){ ["popup","select","brief","victory","defeat","life"].forEach(id => document.getElementById(id).classList.remove("show")); }
  function choose(id){ heroId = id; ensureAudio(); hideAll(); applyLayoutSize(); resetWorld(); hintEl.style.display="block"; hintEl.textContent = "Nivel 1: salta 5 veces en la cabeza"; state="PLAYING"; }
  function restart(){ hideAll(); document.getElementById("select").classList.add("show"); hintEl.style.display="none"; state="SELECT"; }
  function showBrief(n){
    hideAll();
    document.getElementById("brief-title").textContent = "Nivel " + n;
    document.getElementById("brief-text").textContent = BRIEFS[n];
    document.getElementById("brief").classList.add("show");
    hintEl.style.display = "none"; state = "BRIEF";
  }
  function loseLife(){
    lives--; updateHud(); state = "LIFE"; hintEl.style.display = "none";
    if (lives <= 0) { state = "DEFEAT"; document.getElementById("defeat").classList.add("show"); return; }
    document.getElementById("life-text").textContent = lives === 2 ? LIFE_TEXT[0] : LIFE_TEXT[1];
    document.getElementById("life").classList.add("show");
  }
  function updateHud(){
    document.getElementById("coin-hud").textContent = "🪙 " + stolenCount + "/" + GOAL;
    document.getElementById("level-hud").textContent = "NIVEL " + level + "/5";
    document.getElementById("hearts").textContent = "❤ ".repeat(Math.max(0, lives)).trim();
  }
  function enemyImg(e){ return e.kind === 2 ? imgs.enemy2 : imgs.enemy1; }
  function enemyHeight(e){ return hero.h * 1.85 * e.scale; }
  function reachY(e){ return e.y - enemyHeight(e) * 0.42; }
  function nearest(e){
    let best=null, bestD=1e9;
    for (const c of coins){
      if (c.stolen || c.state!=="home" || c.x < e.x-20) continue;
      const d = c.x - e.x + Math.abs(c.y - reachY(e)) * 0.3;
      if (d < bestD){ bestD=d; best=c; }
    }
    return best;
  }
  function applyGravity(b, dt){
    b.vy += GRAVITY*dt; b.x += b.vx*dt; b.y += b.vy*dt;
    if (b.y >= GROUND){ b.y = GROUND; b.vy = 0; b.onGround = true; } else b.onGround = false;
  }
  function updateHero(dt){
    const left = keys.ArrowLeft||keys.KeyA||touch.left, right = keys.ArrowRight||keys.KeyD||touch.right, jump = keys.ArrowUp||keys.Space||keys.KeyW||touch.jump;
    if (right && !left){ hero.vx += HERO_ACC*dt; hero.facing=1; }
    else if (left && !right){ hero.vx -= HERO_ACC*dt; hero.facing=-1; }
    else hero.vx += (hero.vx>0?-1:1)*Math.min(Math.abs(hero.vx), HERO_FRI*dt);
    hero.vx = Math.max(-HERO_MAX, Math.min(HERO_MAX, hero.vx));
    if (jump && hero.onGround){ hero.vy = JUMP_V; hero.onGround = false; beep(420,0.12,"square",0.07); }
    applyGravity(hero, dt);
    if (hero.x < camX+36){ hero.x = camX+36; hero.vx = Math.max(0, hero.vx); }
    if (hero.h * hero.scale > H * 0.42) hero.scale = (H * 0.42) / hero.h;
  }
  function updateEnemy(e, dt){
    const speed = LEVELS[level-1].speed;
    if (!e.alive) return;
    if (e.grab){
      e.grabT += dt;
      const hand = { x: e.x + enemyHeight(e)*0.22, y: e.y - enemyHeight(e)*(e.grabT<0.3?0.5:0.36) };
      e.grab.x += (hand.x - e.grab.x) * Math.min(1, dt*8);
      e.grab.y += (hand.y - e.grab.y) * Math.min(1, dt*8);
      if (e.grabT > 0.55){ e.grab.stolen = true; e.grab.state = "pocket"; e.grab.owner = e; stolenCount++; e.grab = null; beep(300,0.08,"square",0.04); updateHud(); }
      e.vx = 16; applyGravity(e, dt); return;
    }
    if (!e.target || e.target.stolen) e.target = nearest(e);
    e.vx = speed;
    if (e.target && e.target.x - e.x < 50){
      if (e.target.y < reachY(e)-24 && e.onGround) e.vy = JUMP_V;
      if (Math.abs(e.target.y - reachY(e)) < 60){ e.grab = e.target; e.grab.owner = e; e.grabT = 0; e.vx = 0; }
    }
    applyGravity(e, dt);
  }
  function checkStomp(){
    if (hitLock>0 || hero.onGround || hero.vy<=40) return;
    const feet = { x:hero.x-20, y:hero.y-18, w:40, h:20 };
    for (const e of enemies){
      if (!e.alive) continue;
      const h = enemyHeight(e), w = h * aspect(enemyImg(e));
      const head = { x:e.x-w*0.22, y:e.y-h, w:w*0.44, h:h*0.22 };
      if (!(feet.x < head.x+head.w && feet.x+feet.w > head.x && feet.y < head.y+head.h && feet.y+feet.h > head.y)) continue;
      e.hits++; hitLock = 0.4; hero.vy = JUMP_V*0.55; hero.scale = Math.min(1.45, hero.scale + 0.07); beep(180,0.12,"square",0.1);
      if (e.hits < 5) e.scale = Math.max(0.42, 1 - e.hits*0.14);
      else explode(e);
      hintEl.textContent = "Golpe " + e.hits + "/5";
      return;
    }
  }
  function explode(e){
    e.alive = false; beep(90,0.25,"sawtooth",0.1);
    coins.forEach(c => { if (c.stolen && c.owner === e) { c.state = "return"; c.delay = Math.random()*0.15; } });
  }
  function returnAllStolen(){
    coins.forEach(c => { if (c.stolen && c.state !== "home") { c.state = "return"; c.delay = Math.random()*0.12; } });
  }
  function hitObstacle(){
    const feet = hero.onGround;
    for (const o of obstacles){
      if (o.type === "oncoming") {
        if (feet && hero.x > o.x-10 && hero.x < o.x+o.w && Math.abs(hero.y - GROUND) < 8) {
          hero.x = camX + 40; hero.vx = 0; beep(90,0.12,"square",0.08);
        }
      } else if (feet && hero.x > o.x && hero.x < o.x+o.w) {
        if (o.type === "mud") hero.vx *= 0.92;
        else { hero.x = o.x - 10; hero.vx = 0; }
      }
    }
  }
  function update(dt){
    if (dt>0.05) dt=0.05; clock += dt; hitLock = Math.max(0, hitLock-dt);
    if (state!=="PLAYING") return;
    updateHero(dt);
    enemies.forEach(e => updateEnemy(e, dt));
    obstacles.forEach(o => { if (o.type==="oncoming") { o.x += o.vx*dt; if (o.x < camX-240) o.x = camX + W + 900; } });
    checkStomp(); hitObstacle(); ensureSigns();
    coins.forEach(c => {
      if (c.state!=="return") return;
      if (c.delay>0){ c.delay -= dt; return; }
      c.x += (c.ox-c.x)*Math.min(1, dt*3.4); c.y += (c.oy-c.y)*Math.min(1, dt*3.4);
      if (Math.hypot(c.ox-c.x, c.oy-c.y)<6){ c.x=c.ox; c.y=c.oy; c.stolen=false; c.state="home"; c.owner=null; stolenCount=Math.max(0, stolenCount-1); }
    });
    updateHud();
    if (stolenCount >= GOAL) { loseLife(); return; }
    if (enemies.length && enemies.every(e => !e.alive)) {
      coins.forEach(c => { c.x = c.ox; c.y = c.oy; c.stolen = false; c.state = "home"; c.owner = null; });
      stolenCount = 0;
      updateHud();
      if (level < 5) { level++; showBrief(level); }
      else { state="VICTORY"; hintEl.style.display="none"; document.getElementById("victory").classList.add("show"); }
    }
    camX += (Math.max(0, hero.x - W*0.32) - camX) * Math.min(1, dt*4);
  }
  function drawSprite(img, x, y, height, facing){
    if (!ready(img)) return {w:0,h:0};
    const s = sizeOf(img, height);
    ctx.save(); ctx.translate(x-camX, y); if (facing<0) ctx.scale(-1,1);
    ctx.drawImage(img, -s.w/2, -s.h, s.w, s.h); ctx.restore();
    return s;
  }
  function cloud(x,y,s){ ctx.fillStyle="#fff"; ctx.beginPath(); ctx.ellipse(x,y,34*s,16*s,0,0,6.3); ctx.ellipse(x-22*s,y+4*s,22*s,14*s,0,0,6.3); ctx.ellipse(x+24*s,y+6*s,26*s,15*s,0,0,6.3); ctx.fill(); }
  function palm(x){ const y=GROUND-6; ctx.strokeStyle="#8a5a28"; ctx.lineWidth=7; ctx.lineCap="round"; ctx.beginPath(); ctx.moveTo(x,y); ctx.quadraticCurveTo(x+8,y-40,x-2,y-78); ctx.stroke(); ctx.fillStyle="#2f9a3a"; [[-34,-8],[28,-4],[-18,-28],[22,-26],[0,-36]].forEach(([dx,dy],i)=>{ ctx.beginPath(); ctx.ellipse(x+dx,y-78+dy,22,8,(i-2)*0.45,0,6.3); ctx.fill(); }); }
  function money(c){
    const x=c.x-camX, y=c.y;
    if (c.kind==="bill"){
      ctx.save(); ctx.translate(x,y); ctx.rotate(-0.15);
      ctx.fillStyle="#1f8a45"; ctx.fillRect(-16,-9,32,18); ctx.strokeStyle="#b6f3c8"; ctx.strokeRect(-16,-9,32,18);
      ctx.fillStyle="#e9ffe9"; ctx.font="900 11px Trebuchet MS"; ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.fillText("$",0,1);
      ctx.restore(); return;
    }
    const r=c.r, g=ctx.createRadialGradient(x-r*0.35,y-r*0.35,r*0.15,x,y,r);
    g.addColorStop(0,"#fff6c2"); g.addColorStop(0.45,"#ffc62b"); g.addColorStop(1,"#b86a00");
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,r,0,6.3); ctx.fill();
    ctx.strokeStyle="#8a5200"; ctx.lineWidth=2; ctx.stroke();
    ctx.fillStyle="#fff8d0"; ctx.font="900 "+Math.max(9,r)+"px Trebuchet MS"; ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.fillText("$",x,y+0.5);
  }
  function drawSky(){
    const g=ctx.createLinearGradient(0,0,0,H);
    if (level===2){ g.addColorStop(0,"#071433"); g.addColorStop(1,"#1b3d78"); }
    else if (level===3){ g.addColorStop(0,"#5d6f86"); g.addColorStop(1,"#9eb0c4"); }
    else if (level===5){ g.addColorStop(0,"#2a2e34"); g.addColorStop(1,"#4a4036"); }
    else { g.addColorStop(0,"#1f92f2"); g.addColorStop(0.55,"#67c6fb"); g.addColorStop(1,"#b7e6ff"); }
    ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
    if (level===2){ ctx.fillStyle="#f4f1c8"; ctx.beginPath(); ctx.arc(W*0.78, 90, 28, 0, 6.3); ctx.fill(); ctx.fillStyle="#fff"; for (let i=0;i<28;i++) ctx.fillRect((i*97)%W, 30+(i*37)%160, 2, 2); }
    else if (level===5){ ctx.fillStyle="#3a332c"; ctx.fillRect(0, 40, W, 36); ctx.fillStyle="#f1d27a"; for (let x=40-(camX*0.2%80); x<W; x+=80) ctx.fillRect(x, 52, 18, 6); }
    else { const shift=camX*0.15; cloud(160-(shift%900),78,1.1); cloud(520-(shift%1100),130,0.8); cloud(860-(shift%980),64,1.15); if (level===4){ ctx.fillStyle="#ffe36b"; ctx.beginPath(); ctx.arc(W-90,70,34,0,6.3); ctx.fill(); } }
  }
  function drawGround(){
    if (level===5){ ctx.fillStyle="#3d3832"; ctx.fillRect(0,GROUND,W,H-GROUND); ctx.fillStyle="#6d655b"; ctx.fillRect(0,GROUND-8,W,10); return; }
    if (level===3){ ctx.fillStyle="#8a6a42"; ctx.fillRect(0,GROUND,W,H-GROUND); ctx.fillStyle="#6d8a3a"; ctx.fillRect(0,GROUND-8,W,10); return; }
    ctx.fillStyle="#c46a32"; ctx.fillRect(0,GROUND,W,H-GROUND); ctx.fillStyle="#3cab45"; ctx.fillRect(0,GROUND-10,W,12);
    if (level===1){ const palmShift=camX*0.35; for (let x=180-(palmShift%340); x<W+40; x+=340) palm(x); }
  }
  function drawObstacles(){
    obstacles.forEach(o => {
      const x=o.x-camX; if (x<-200 || x>W+200) return;
      if (o.type==="house"){ ctx.fillStyle="#d9c3a1"; ctx.fillRect(x, GROUND-o.h, o.w, o.h); ctx.fillStyle="#8d3b32"; ctx.beginPath(); ctx.moveTo(x-8,GROUND-o.h); ctx.lineTo(x+o.w/2,GROUND-o.h-36); ctx.lineTo(x+o.w+8,GROUND-o.h); ctx.fill(); }
      else if (o.type==="mud"){ ctx.fillStyle="#6a5434"; ctx.beginPath(); ctx.ellipse(x+o.w/2, GROUND-4, o.w/2, 10, 0, 0, 6.3); ctx.fill(); }
      else { ctx.fillStyle=o.type==="oncoming"?"#c23b3b":"#2f6db5"; ctx.fillRect(x, GROUND-o.h, o.w, o.h-8); ctx.fillStyle="#dcecff"; ctx.fillRect(x+16, GROUND-o.h+8, 36, 16); ctx.fillStyle="#222"; ctx.beginPath(); ctx.arc(x+24, GROUND-6, 8, 0, 6.3); ctx.arc(x+o.w-24, GROUND-6, 8, 0, 6.3); ctx.fill(); }
    });
  }
  function draw(){
    drawSky(); drawGround();
    for (const c of coins){ if (c.state==="pocket" || c.x<camX-40 || c.x>camX+W+40) continue; money(c); }
    drawObstacles();
    const hs = drawSprite(heroImg(), hero.x, hero.y, hero.h * hero.scale, hero.facing);
    hero.w = hs.w || hero.w;
    enemies.forEach(e => { if (e.alive) drawSprite(enemyImg(e), e.x, e.y, enemyHeight(e), 1); });
    if (level===3){ ctx.fillStyle="rgba(180,200,220,.25)"; for (let i=0;i<18;i++){ const x=(i*80+clock*220)%W; ctx.fillRect(x, 40+(i*37)%H, 2, 18); } }
  }
  function loop(ts){ if(!last) last=ts; const dt=(ts-last)/1000; last=ts; update(dt); draw(); requestAnimationFrame(loop); }
  requestAnimationFrame(loop);
})();
