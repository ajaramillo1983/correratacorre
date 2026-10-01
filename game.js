(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const hintEl = document.getElementById("hint");

  let W = 1400, H = 780, GROUND = 640, portrait = false;
  const GRAVITY = 2200;
  const JUMP_V = -1280;
  const GOAL = 1000;
  const HERO_ACC = 2600, HERO_FRI = 2000, HERO_MAX = 460;

  const STATES = {
    INTRO: "INTRO", PLAYING: "PLAYING", HIT_1: "HIT_1", HIT_2: "HIT_2",
    FINAL_HIT: "FINAL_HIT", COIN_EXPLOSION: "COIN_EXPLOSION",
    COIN_RETURN: "COIN_RETURN", VICTORY: "VICTORY", ESCAPE: "ESCAPE", DEFEAT: "DEFEAT",
  };
  const FONT = {
    S: ["01110","10001","10000","01110","00001","10001","01110"],
    A: ["01110","10001","10001","11111","10001","10001","10001"],
    N: ["10001","11001","10101","10011","10001","10001","10001"],
    T: ["11111","00100","00100","00100","00100","00100","00100"],
    O: ["01110","10001","10001","10001","10001","10001","01110"],
    D: ["11110","10001","10001","10001","10001","10001","11110"],
    M: ["10001","11011","10101","10101","10001","10001","10001"],
    I: ["11111","00100","00100","00100","00100","00100","11111"],
    G: ["01110","10001","10000","10111","10001","10001","01110"],
  };
  const PHRASE = "SANTO DOMINGO";

  let state = STATES.INTRO;
  let last = 0, hits = 0, stolenCount = 0, lives = 3, muted = false, audioReady = false, ac = null;
  let musicTimer = 0, hitLock = 0, stunT = 0, sequenceT = 0, flashT = 0, camX = 0;
  let particles = [], keys = {}, touch = { left: false, right: false, jump: false };
  let coins = [], nextLetterX = 420, phraseIndex = 0;

  const heroImg = new Image();
  const mouseImg = new Image();
  heroImg.src = "images/hero.png";
  mouseImg.src = "images/mouse.png";

  const hero = { x: 180, y: 640, vx: 0, vy: 0, w: 86, h: 150, facing: 1, onGround: true, celeb: 0, walk: 0 };
  const mouse = {
    x: 520, y: 640, vx: 0, vy: 0, dir: 1, w: 112, h: 140,
    scale: 1, squash: 1, speed: 230, target: null,
    bagPulse: 0, alive: true, walk: 0, onGround: true, grab: null, grabT: 0,
  };

  function applyLayoutSize() {
    portrait = window.innerWidth < 820 || window.innerHeight > window.innerWidth;
    W = portrait ? 780 : 1400;
    H = portrait ? 1280 : 780;
    GROUND = portrait ? 1080 : 640;
    canvas.width = W;
    canvas.height = H;
    hero.w = portrait ? 96 : 86;
    hero.h = portrait ? 164 : 150;
    mouse.w = portrait ? 122 : 112;
    mouse.h = portrait ? 154 : 140;
    fitCanvas();
  }
  function fitCanvas() {
    const wrap = document.getElementById("game-wrap");
    const stage = document.getElementById("stage");
    const r = wrap.getBoundingClientRect();
    const scale = Math.min(r.width / W, r.height / H);
    canvas.style.width = Math.floor(W * scale) + "px";
    canvas.style.height = Math.floor(H * scale) + "px";
    if (stage) {
      stage.style.width = canvas.style.width;
      stage.style.height = canvas.style.height;
    }
  }
  window.addEventListener("resize", applyLayoutSize);
  window.addEventListener("orientationchange", () => setTimeout(applyLayoutSize, 80));

  function spawnLetter(ch, x) {
    const grid = FONT[ch];
    if (!grid) return;
    const cell = portrait ? 13 : 14;
    const high = phraseIndex % 2 === 0;
    const top = high ? GROUND - (portrait ? 430 : 390) : GROUND - (portrait ? 280 : 250);
    for (let r = 0; r < grid.length; r++) {
      for (let c = 0; c < grid[r].length; c++) {
        if (grid[r][c] !== "1") continue;
        coins.push({
          x: x + c * cell, y: top + r * cell, ox: x + c * cell, oy: top + r * cell,
          stolen: false, state: "home", r: 6.5, phase: Math.random() * 6, rot: 0, rotV: 0,
          flyVx: 0, flyVy: 0, delay: 0,
        });
      }
    }
  }
  function ensureSigns() {
    const ahead = camX + W + 700;
    while (nextLetterX < ahead && coins.filter((c) => !c.stolen).length < 1400) {
      const ch = PHRASE[phraseIndex % PHRASE.length];
      if (ch !== " ") spawnLetter(ch, nextLetterX);
      nextLetterX += ch === " " ? 50 : 118;
      phraseIndex++;
    }
  }
  function resetWorld() {
    hits = 0; stolenCount = 0; lives = 3; hitLock = 0; stunT = 0; sequenceT = 0; flashT = 0; camX = 0;
    particles = []; coins = []; nextLetterX = 480; phraseIndex = 0;
    hero.x = 200; hero.vx = 0; hero.vy = 0; hero.onGround = true; hero.facing = 1; hero.celeb = 0; hero.y = GROUND;
    mouse.x = 560; mouse.vx = 0; mouse.vy = 0; mouse.dir = 1; mouse.scale = 1; mouse.squash = 1;
    mouse.speed = 220; mouse.target = null; mouse.alive = true; mouse.onGround = true; mouse.y = GROUND;
    mouse.grab = null; mouse.grabT = 0;
    ensureSigns();
    updateHud();
  }
  applyLayoutSize();
  resetWorld();

  function ensureAudio() {
    if (audioReady) return;
    ac = new (window.AudioContext || window.webkitAudioContext)();
    audioReady = true;
  }
  function beep(freq, dur, type, vol, slide) {
    if (muted || !ac) return;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type || "square";
    o.frequency.value = freq;
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, slide), ac.currentTime + dur);
    g.gain.value = vol || 0.08;
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
    o.connect(g); g.connect(ac.destination);
    o.start(); o.stop(ac.currentTime + dur);
  }
  function sfx(name) {
    if (muted || !ac) return;
    if (name === "jump") beep(420, 0.12, "square", 0.07, 280);
    if (name === "steal") beep(300, 0.1, "square", 0.05, 180);
    if (name === "hit1") { beep(200, 0.15, "square", 0.1, 90); beep(520, 0.12, "triangle", 0.06); }
    if (name === "hit2") { beep(160, 0.18, "square", 0.12, 70); beep(640, 0.14, "triangle", 0.07); }
    if (name === "hit3") { beep(120, 0.35, "sawtooth", 0.12, 40); beep(700, 0.25, "triangle", 0.08, 200); }
    if (name === "boom") beep(80, 0.45, "sawtooth", 0.14, 30);
    if (name === "return") beep(660, 0.07, "sine", 0.04);
    if (name === "win") [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, 0.22, "triangle", 0.08), i * 140));
  }
  function musicTick(dt) {
    if (!audioReady || muted || !ac) return;
    if (state !== STATES.PLAYING && state !== STATES.HIT_1 && state !== STATES.HIT_2) return;
    musicTimer += dt;
    if (musicTimer > 0.28) {
      musicTimer = 0;
      const notes = [262, 330, 392, 330, 349, 392, 440, 392];
      musicTick._i = ((musicTick._i || 0) + 1) % notes.length;
      beep(notes[musicTick._i], 0.12, "square", 0.022);
    }
  }

  window.addEventListener("keydown", (e) => {
    keys[e.code] = true;
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "Space"].includes(e.code)) e.preventDefault();
  });
  window.addEventListener("keyup", (e) => { keys[e.code] = false; });
  function bindHold(el, prop) {
    const on = (ev) => { ev.preventDefault(); touch[prop] = true; };
    const off = (ev) => { ev.preventDefault(); touch[prop] = false; };
    el.addEventListener("pointerdown", on);
    el.addEventListener("pointerup", off);
    el.addEventListener("pointerleave", off);
    el.addEventListener("pointercancel", off);
  }
  bindHold(document.getElementById("btn-left"), "left");
  bindHold(document.getElementById("btn-right"), "right");
  bindHold(document.getElementById("btn-jump"), "jump");
  document.getElementById("btn-mute").addEventListener("click", () => {
    muted = !muted;
    document.getElementById("btn-mute").textContent = muted ? "🔇" : "🔊";
  });
  document.getElementById("btn-start").addEventListener("click", startGame);
  document.getElementById("btn-again").addEventListener("click", resetGame);
  document.getElementById("btn-retry").addEventListener("click", resetGame);

  function startGame() {
    ensureAudio();
    if (ac && ac.state === "suspended") ac.resume();
    document.getElementById("popup").classList.remove("show");
    hintEl.style.display = "block";
    hintEl.textContent = "Persigue al ratón y salta sobre su cabeza";
    state = STATES.PLAYING;
  }
  function resetGame() {
    document.getElementById("victory").classList.remove("show");
    document.getElementById("defeat").classList.remove("show");
    applyLayoutSize();
    resetWorld();
    hintEl.style.display = "block";
    hintEl.textContent = "Persigue al ratón y salta sobre su cabeza";
    state = STATES.PLAYING;
  }
  function updateHud() {
    document.getElementById("coin-hud").textContent = "🪙 " + stolenCount + "/" + GOAL;
    document.getElementById("hearts").textContent = "❤ ".repeat(Math.max(0, lives)).trim();
  }
  function addBurst(x, y, color, n, speed) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random());
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 80, life: 0.45, t: 0, color, size: 3 + Math.random() * 4 });
    }
  }
  function reachY() { return mouse.y - mouse.h * mouse.scale * 0.4; }
  function handPos() {
    return { x: mouse.x + mouse.dir * mouse.w * mouse.scale * 0.46, y: mouse.y - mouse.h * mouse.scale * 0.48 };
  }
  function nearestAhead() {
    let best = null, bestD = 1e9;
    for (const c of coins) {
      if (c.stolen || c.state !== "home") continue;
      if (c.x < mouse.x - 30) continue;
      const d = (c.x - mouse.x) + Math.abs(c.y - reachY()) * 0.25;
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  }
  function mouseWins() {
    state = STATES.DEFEAT;
    mouse.alive = false;
    hintEl.style.display = "none";
    document.getElementById("lives-left").textContent = "Llegó a " + GOAL + " monedas.";
    document.getElementById("defeat").classList.add("show");
    sfx("boom");
  }

  function update(dt) {
    if (dt > 0.05) dt = 0.05;
    hitLock = Math.max(0, hitLock - dt);
    stunT = Math.max(0, stunT - dt);
    flashT = Math.max(0, flashT - dt);
    mouse.bagPulse = Math.max(0, mouse.bagPulse - dt);
    mouse.squash += (1 - mouse.squash) * Math.min(1, dt * 8);
    hero.celeb = Math.max(0, hero.celeb - dt);
    musicTick(dt);
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 500 * dt;
      if (p.t > p.life) particles.splice(i, 1);
    }
    if (state === STATES.INTRO || state === STATES.DEFEAT || state === STATES.VICTORY) {
      if (state === STATES.VICTORY) updateHero(dt * 0.25);
      return;
    }
    if (state === STATES.PLAYING || state === STATES.HIT_1 || state === STATES.HIT_2) {
      updateHero(dt);
      if (stunT <= 0 && mouse.alive) updateMouse(dt);
      else applyGravity(mouse, dt);
      checkStomp();
      ensureSigns();
      if (stolenCount >= GOAL) mouseWins();
    }
    if (state === STATES.FINAL_HIT) {
      sequenceT += dt;
      if (sequenceT > 0.25) { explodeMouse(); state = STATES.COIN_EXPLOSION; sequenceT = 0; }
    }
    if (state === STATES.COIN_EXPLOSION) {
      sequenceT += dt;
      updateFlying(dt);
      if (sequenceT > 1.1) {
        state = STATES.COIN_RETURN;
        coins.forEach((c, i) => { if (c.stolen) { c.state = "return"; c.delay = (i % 10) * 0.015; } });
      }
    }
    if (state === STATES.COIN_RETURN) {
      updateReturning(dt);
      if (coins.every((c) => !c.stolen)) {
        flashT = 0.6; hero.celeb = 1.4; sfx("win");
        state = STATES.VICTORY;
        hintEl.style.display = "none";
        setTimeout(() => document.getElementById("victory").classList.add("show"), 400);
      }
    }
    const targetCam = Math.max(0, hero.x - W * 0.32);
    camX += (targetCam - camX) * Math.min(1, dt * 4);
  }

  function updateHero(dt) {
    const left = keys.ArrowLeft || keys.KeyA || touch.left;
    const right = keys.ArrowRight || keys.KeyD || touch.right;
    const jump = keys.ArrowUp || keys.Space || keys.KeyW || touch.jump;
    if (right && !left) { hero.vx += HERO_ACC * dt; hero.facing = 1; }
    else if (left && !right) { hero.vx -= HERO_ACC * dt; hero.facing = -1; }
    else hero.vx += (hero.vx > 0 ? -1 : 1) * Math.min(Math.abs(hero.vx), HERO_FRI * dt);
    hero.vx = Math.max(-HERO_MAX, Math.min(HERO_MAX, hero.vx));
    if (jump && hero.onGround) { hero.vy = JUMP_V; hero.onGround = false; sfx("jump"); }
    applyGravity(hero, dt);
    if (hero.x < camX + 30) { hero.x = camX + 30; hero.vx = Math.max(0, hero.vx); }
    if (Math.abs(hero.vx) > 30 && hero.onGround) hero.walk += dt * 10;
  }
  function applyGravity(body, dt) {
    body.vy += GRAVITY * dt;
    body.x += body.vx * dt;
    body.y += body.vy * dt;
    if (body.y >= GROUND) { body.y = GROUND; body.vy = 0; body.onGround = true; }
    else body.onGround = false;
  }
  function updateMouse(dt) {
    mouse.dir = 1;
    if (mouse.grab) {
      mouse.grabT += dt;
      const hand = handPos();
      mouse.grab.x += (hand.x - mouse.grab.x) * Math.min(1, dt * 12);
      mouse.grab.y += (hand.y - mouse.grab.y) * Math.min(1, dt * 12);
      mouse.grab.state = "grab";
      if (mouse.grabT > 0.34) {
        mouse.grab.state = "pocket";
        mouse.grab.stolen = true;
        stolenCount++;
        mouse.bagPulse = 0.3;
        mouse.grab = null;
        mouse.target = null;
        sfx("steal");
        updateHud();
      }
      mouse.vx = 40;
      applyGravity(mouse, dt);
      return;
    }
    if (!mouse.target || mouse.target.stolen || mouse.target.x < mouse.x - 20) mouse.target = nearestAhead();
    mouse.vx = mouse.speed;
    if (mouse.target) {
      const dx = mouse.target.x - mouse.x;
      if (dx < 34) {
        const needsJump = mouse.target.y < reachY() - 20;
        if (needsJump && mouse.onGround) { mouse.vy = JUMP_V; mouse.onGround = false; }
        if (Math.abs(mouse.target.y - reachY()) < 50) {
          mouse.grab = mouse.target;
          mouse.grabT = 0;
          mouse.vx = 0;
        }
      }
    }
    if (hero.x > mouse.x - 80) mouse.vx += 70;
    applyGravity(mouse, dt);
    mouse.walk += dt * 9;
  }
  function checkStomp() {
    if (!mouse.alive || hitLock > 0 || hero.onGround || hero.vy <= 40) return;
    const mw = mouse.w * mouse.scale, mh = mouse.h * mouse.scale * 1.25;
    const head = { x: mouse.x - mw * 0.34, y: mouse.y - mh, w: mw * 0.7, h: mh * 0.34 };
    const feet = { x: hero.x - 20, y: hero.y - 16, w: 40, h: 20 };
    if (!(feet.x < head.x + head.w && feet.x + feet.w > head.x && feet.y < head.y + head.h && feet.y + feet.h > head.y)) return;
    hits++;
    hitLock = 0.45; stunT = 0.25;
    hero.vy = JUMP_V * 0.55;
    mouse.squash = 0.6;
    addBurst(mouse.x, mouse.y - mh * 0.7, "#fff176", 12, 240);
    if (hits === 1) { mouse.scale = 0.72; mouse.speed = 200; sfx("hit1"); state = STATES.HIT_1; setTimeout(() => { if (state === STATES.HIT_1) state = STATES.PLAYING; }, 160); }
    else if (hits === 2) { mouse.scale = 0.46; mouse.speed = 250; sfx("hit2"); state = STATES.HIT_2; setTimeout(() => { if (state === STATES.HIT_2) state = STATES.PLAYING; }, 160); }
    else { sfx("hit3"); sfx("boom"); state = STATES.FINAL_HIT; sequenceT = 0; }
    hintEl.textContent = hits >= 3 ? "¡Lo detuviste!" : "Golpe " + hits + "/3 — sigue persiguiéndolo";
  }
  function explodeMouse() {
    addBurst(mouse.x, mouse.y - 80, "#ffd54a", 24, 380);
    mouse.alive = false;
    coins.forEach((c) => {
      if (!c.stolen) return;
      c.state = "fly";
      c.x = mouse.x; c.y = mouse.y - 60;
      c.flyVx = (Math.random() - 0.3) * 420;
      c.flyVy = -200 - Math.random() * 280;
    });
  }
  function updateFlying(dt) {
    for (const c of coins) {
      if (c.state !== "fly") continue;
      c.flyVy += 900 * dt; c.x += c.flyVx * dt; c.y += c.flyVy * dt;
      if (c.y > GROUND - 8) { c.y = GROUND - 8; c.flyVy *= -0.4; }
    }
  }
  function updateReturning(dt) {
    for (const c of coins) {
      if (c.state !== "return") continue;
      if (c.delay > 0) { c.delay -= dt; continue; }
      c.x += (c.ox - c.x) * Math.min(1, dt * 3);
      c.y += (c.oy - c.y) * Math.min(1, dt * 3);
      if (Math.hypot(c.ox - c.x, c.oy - c.y) < 6) {
        c.x = c.ox; c.y = c.oy; c.stolen = false; c.state = "home";
        stolenCount = Math.max(0, stolenCount - 1);
      }
    }
    updateHud();
  }

  function drawSky() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#5ec4f5"); g.addColorStop(1, "#9ad8f8");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#fff";
    for (let i = 0; i < 5; i++) {
      const x = ((i * 280 - camX * 0.25) % (W + 200)) - 40;
      ctx.beginPath(); ctx.arc(x, 70 + (i % 3) * 24, 26, 0, 6.28); ctx.arc(x + 28, 78, 18, 0, 6.28); ctx.fill();
    }
  }
  function drawGround() {
    ctx.fillStyle = "#6d3a16";
    ctx.fillRect(0, GROUND, W, H - GROUND);
    ctx.fillStyle = "#c47a3a"; ctx.fillRect(0, GROUND, W, 14);
    ctx.fillStyle = "#3d8c3a"; ctx.fillRect(0, GROUND - 8, W, 8);
    ctx.strokeStyle = "#8aa0b0"; ctx.lineWidth = 3;
    const rail = GROUND - 84;
    ctx.beginPath(); ctx.moveTo(0, rail); ctx.lineTo(W, rail); ctx.stroke();
    const start = -((camX) % 64);
    for (let x = start; x < W; x += 64) {
      ctx.beginPath(); ctx.moveTo(x, rail); ctx.lineTo(x, GROUND - 8); ctx.stroke();
    }
  }
  function drawCoin(c) {
    if (c.state === "pocket") return;
    if (c.x < camX - 30 || c.x > camX + W + 30) return;
    ctx.save(); ctx.translate(c.x - camX, c.y);
    const grd = ctx.createRadialGradient(-2, -2, 1, 0, 0, c.r);
    grd.addColorStop(0, "#fff3b0"); grd.addColorStop(1, "#c98912");
    ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(0, 0, c.r, 0, 6.28); ctx.fill();
    ctx.restore();
  }
  function drawBigHead(img, x, y, w, h, facing, bob) {
    if (!img.complete || !img.naturalWidth) return;
    const iw = img.naturalWidth, ih = img.naturalHeight, split = 0.38, hs = 1.5;
    ctx.save();
    ctx.translate(x - camX, y + (bob || 0));
    if (facing < 0) ctx.scale(-1, 1);
    const bodyH = h * (1 - split), headH = h * split * hs, headW = w * hs;
    ctx.drawImage(img, 0, ih * split, iw, ih * (1 - split), -w / 2, -bodyH, w, bodyH);
    ctx.drawImage(img, 0, 0, iw, ih * split, -headW / 2, -bodyH - headH + 6, headW, headH);
    ctx.restore();
  }
  function drawMouse() {
    if (!mouse.alive) return;
    const w = mouse.w * mouse.scale, h = mouse.h * mouse.scale * (mouse.grab ? 1 : mouse.squash);
    drawBigHead(mouseImg, mouse.x, mouse.y, w, h, 1, mouse.grab ? 0 : Math.sin(mouse.walk) * 2);
    const bagx = mouse.x + w * 0.34 - camX, bagy = mouse.y - h * 0.34;
    if (mouse.grab) {
      const hand = handPos();
      ctx.strokeStyle = "#8d6b52"; ctx.lineWidth = 7; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(mouse.x + w * 0.2 - camX, mouse.y - h * 0.42); ctx.lineTo(hand.x - camX, hand.y); ctx.stroke();
      ctx.fillStyle = "#c4a484"; ctx.beginPath(); ctx.arc(hand.x - camX, hand.y, 7, 0, 6.28); ctx.fill();
    }
    if (stolenCount > 0) {
      ctx.fillStyle = "#8d6e3d"; ctx.beginPath(); ctx.ellipse(bagx, bagy, 16 + mouse.bagPulse * 6, 12, 0, 0, 6.28); ctx.fill();
    }
  }
  function draw() {
    drawSky(); drawGround();
    for (const c of coins) drawCoin(c);
    drawBigHead(heroImg, hero.x, hero.y, hero.w, hero.h, hero.facing, hero.onGround ? Math.sin(hero.walk) * 2 : 0);
    drawMouse();
    for (const p of particles) {
      ctx.globalAlpha = 1 - p.t / p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x - camX, p.y, p.size, 0, 6.28); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  function loop(ts) {
    if (!last) last = ts;
    const dt = (ts - last) / 1000;
    last = ts;
    update(dt); draw();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
