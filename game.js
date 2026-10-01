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
    const cell = portrait ? 19 : 18;
    const high = phraseIndex % 2 === 0;
    const top = high ? GROUND - (portrait ? 430 : 390) : GROUND - (portrait ? 280 : 250);
    for (let r = 0; r < grid.length; r++) {
      for (let c = 0; c < grid[r].length; c++) {
        if (grid[r][c] !== "1") continue;
        coins.push({
          x: x + c * cell, y: top + r * cell, ox: x + c * cell, oy: top + r * cell,
          stolen: false, state: "home", r: portrait ? 9.5 : 10.5, phase: Math.random() * 6, rot: 0, rotV: 0,
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
      nextLetterX += ch === " " ? 78 : 152;
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
    hintEl.textContent = "Persigue a la rata y salta sobre su cabeza";
    state = STATES.PLAYING;
  }
  function resetGame() {
    document.getElementById("victory").classList.remove("show");
    document.getElementById("defeat").classList.remove("show");
    applyLayoutSize();
    resetWorld();
    hintEl.style.display = "block";
    hintEl.textContent = "Persigue a la rata y salta sobre su cabeza";
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
    g.addColorStop(0, "#0f8ff5");
    g.addColorStop(0.58, "#53b9fb");
    g.addColorStop(1, "#98d8fb");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Suave brillo central.
    const sun = ctx.createRadialGradient(W * .52, H * .1, 10, W * .52, H * .1, H * .65);
    sun.addColorStop(0, "rgba(255,255,255,.12)");
    sun.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, W, H);

    function cloud(x, y, scale) {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(scale, scale);
      ctx.fillStyle = "#d7edff";
      ctx.fillRect(8, 22, 80, 22);
      ctx.fillStyle = "#fff";
      ctx.fillRect(18, 12, 22, 24);
      ctx.fillRect(35, 4, 30, 40);
      ctx.fillRect(60, 15, 24, 29);
      ctx.fillStyle = "#c7e5ff";
      ctx.fillRect(12, 38, 72, 8);
      ctx.fillStyle = "rgba(255,255,255,.9)";
      ctx.fillRect(26, 10, 20, 10);
      ctx.restore();
    }

    const cloudShift = camX * .12;
    cloud(60 - (cloudShift % 900), 62, 1.15);
    cloud(1010 - (cloudShift % 1000), 90, .95);
    cloud(430 - (cloudShift % 1200), 218, .48);
    cloud(1210 - (cloudShift % 1250), 310, .56);

    // Bloques arcade flotantes al fondo.
    function brickStrip(x, y, count) {
      for (let i = 0; i < count; i++) {
        const bx = x + i * 42;
        ctx.fillStyle = "#8e321d";
        ctx.fillRect(bx + 2, y + 4, 38, 31);
        ctx.fillStyle = "#d45e2f";
        ctx.fillRect(bx, y, 38, 29);
        ctx.fillStyle = "#f1834d";
        ctx.fillRect(bx + 3, y + 3, 32, 4);
        ctx.strokeStyle = "#8a2e1c";
        ctx.lineWidth = 2;
        ctx.strokeRect(bx, y, 38, 29);
        ctx.beginPath();
        ctx.moveTo(bx + 19, y);
        ctx.lineTo(bx + 19, y + 29);
        ctx.moveTo(bx, y + 15);
        ctx.lineTo(bx + 38, y + 15);
        ctx.stroke();
      }
    }

    function qBlock(x, y) {
      ctx.fillStyle = "#c78300";
      ctx.fillRect(x + 3, y + 5, 48, 48);
      ctx.fillStyle = "#ffc62b";
      ctx.fillRect(x, y, 48, 48);
      ctx.fillStyle = "#ffe16e";
      ctx.fillRect(x + 5, y + 5, 38, 6);
      ctx.strokeStyle = "#b47200";
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y, 48, 48);
      ctx.fillStyle = "#fff9dd";
      ctx.font = "900 31px Trebuchet MS";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("?", x + 24, y + 25);
      ctx.fillStyle = "#a56b00";
      [[6,6],[42,6],[6,42],[42,42]].forEach(([px,py]) => {
        ctx.beginPath(); ctx.arc(x + px, y + py, 2.2, 0, Math.PI * 2); ctx.fill();
      });
    }

    const par = camX * .18;
    brickStrip(-50 - (par % 820), 300, 3);
    qBlock(28 - (par % 820), 300);
    brickStrip(1185 - (par % 980), 205, 4);
    qBlock(1261 - (par % 980), 205);
  }
  function drawGround() {
    const rail = GROUND - 116;

    // Muro posterior.
    ctx.fillStyle = "#e9b17d";
    ctx.fillRect(0, GROUND - 98, W, 98);
    ctx.fillStyle = "#f6c493";
    ctx.fillRect(0, GROUND - 92, W, 10);

    // Cerca metálica.
    ctx.strokeStyle = "rgba(57,121,171,.82)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, rail);
    ctx.lineTo(W, rail);
    ctx.stroke();

    const fenceStart = -((camX * .45) % 82);
    for (let x = fenceStart; x < W + 82; x += 82) {
      ctx.strokeStyle = "#5a9bc8";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(x, rail - 8);
      ctx.lineTo(x, GROUND - 8);
      ctx.stroke();

      ctx.strokeStyle = "rgba(71,143,193,.45)";
      ctx.lineWidth = 1;
      for (let d = -40; d < 85; d += 16) {
        ctx.beginPath();
        ctx.moveTo(x - 40 + d, rail + 5);
        ctx.lineTo(x + 18 + d, GROUND - 12);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x + 18 + d, rail + 5);
        ctx.lineTo(x - 40 + d, GROUND - 12);
        ctx.stroke();
      }
    }

    // Arbustos pixelados.
    function bush(x, y, scale) {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(scale, scale);
      ctx.fillStyle = "#0d8d37";
      ctx.fillRect(0, 18, 82, 34);
      ctx.fillStyle = "#13a945";
      ctx.fillRect(9, 5, 28, 40);
      ctx.fillRect(32, 12, 36, 35);
      ctx.fillStyle = "#2ac65b";
      ctx.fillRect(16, 2, 16, 12);
      ctx.fillRect(41, 9, 18, 12);
      ctx.restore();
    }
    bush(18 - ((camX * .22) % 730), GROUND - 126, 1);
    bush(1020 - ((camX * .22) % 910), GROUND - 112, 1.1);
    bush(1320 - ((camX * .22) % 1060), GROUND - 142, .92);

    // Andén de piedra.
    ctx.fillStyle = "#cfc8b9";
    ctx.fillRect(0, GROUND - 8, W, 64);
    ctx.fillStyle = "#eee8d9";
    ctx.fillRect(0, GROUND - 8, W, 8);

    const stoneStart = -((camX * .7) % 74);
    for (let x = stoneStart; x < W + 74; x += 74) {
      ctx.strokeStyle = "rgba(120,108,89,.38)";
      ctx.lineWidth = 2;
      ctx.strokeRect(x, GROUND + 2, 70, 42);
      ctx.beginPath();
      ctx.moveTo(x + 15, GROUND + 2);
      ctx.lineTo(x + 5, GROUND + 42);
      ctx.moveTo(x + 50, GROUND + 2);
      ctx.lineTo(x + 63, GROUND + 42);
      ctx.stroke();
    }

    // Borde dorado.
    ctx.fillStyle = "#d98a00";
    ctx.fillRect(0, GROUND + 46, W, 16);
    ctx.fillStyle = "#ffca24";
    ctx.fillRect(0, GROUND + 42, W, 13);
    ctx.fillStyle = "#ffe56b";
    ctx.fillRect(0, GROUND + 42, W, 4);

    // Base de ladrillos.
    ctx.fillStyle = "#8f331e";
    ctx.fillRect(0, GROUND + 62, W, H - (GROUND + 62));
    const brickW = 58, brickH = 34;
    const startX = -((camX * .85) % brickW);
    for (let row = 0; row < Math.ceil((H - GROUND) / brickH) + 2; row++) {
      const offset = row % 2 ? -brickW / 2 : 0;
      for (let x = startX + offset; x < W + brickW; x += brickW) {
        const y = GROUND + 64 + row * brickH;
        ctx.fillStyle = row % 3 === 0 ? "#b64a27" : "#a33e22";
        ctx.fillRect(x + 2, y + 2, brickW - 5, brickH - 5);
        ctx.fillStyle = "rgba(255,148,83,.35)";
        ctx.fillRect(x + 5, y + 5, brickW - 12, 5);
        ctx.strokeStyle = "#792817";
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, brickW, brickH);
      }
    }
  }
  function drawCoin(c) {
    if (c.state === "pocket") return;
    if (c.x < camX - 40 || c.x > camX + W + 40) return;

    const twinkle = 1 + Math.sin(performance.now() * .004 + c.phase) * .05;
    const r = c.r * twinkle;
    ctx.save();
    ctx.translate(c.x - camX, c.y);

    ctx.fillStyle = "rgba(122,73,0,.22)";
    ctx.beginPath();
    ctx.ellipse(2, r + 3, r * .75, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    const grd = ctx.createRadialGradient(-r * .35, -r * .4, 1, 0, 0, r);
    grd.addColorStop(0, "#fff7a5");
    grd.addColorStop(.24, "#ffd83d");
    grd.addColorStop(.72, "#f4a900");
    grd.addColorStop(1, "#b96d00");
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#ffe875";
    ctx.lineWidth = Math.max(1.5, r * .16);
    ctx.beginPath();
    ctx.arc(0, 0, r * .72, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "#c77c00";
    ctx.fillRect(-1.1, -r * .35, 2.2, r * .48);
    ctx.beginPath();
    ctx.arc(0, r * .3, 1.7, 0, Math.PI * 2);
    ctx.fill();

    // Destello.
    if (Math.sin(performance.now() * .003 + c.phase) > .72) {
      ctx.strokeStyle = "rgba(255,255,255,.95)";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-r * .9, -r * .8); ctx.lineTo(-r * .9, -r * 1.35);
      ctx.moveTo(-r * 1.18, -r * 1.08); ctx.lineTo(-r * .62, -r * 1.08);
      ctx.stroke();
    }
    ctx.restore();
  }
  function drawHeroCharacter(x, y, w, h, facing, bob) {
    ctx.save();
    ctx.translate(x - camX, y + (bob || 0));
    if (facing < 0) ctx.scale(-1, 1);

    // Sombra.
    ctx.fillStyle = "rgba(0,0,0,.16)";
    ctx.beginPath();
    ctx.ellipse(0, 2, w * .38, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    // Piernas y zapatos.
    ctx.fillStyle = "#214e86";
    ctx.fillRect(-w * .26, -h * .3, w * .2, h * .3);
    ctx.fillRect(w * .06, -h * .3, w * .2, h * .3);
    ctx.fillStyle = "#202020";
    ctx.beginPath(); ctx.ellipse(-w * .16, -2, w * .16, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(w * .17, -2, w * .16, 6, 0, 0, Math.PI * 2); ctx.fill();

    // Camisa blanca.
    ctx.fillStyle = "#f7fbff";
    ctx.beginPath();
    ctx.roundRect(-w * .34, -h * .66, w * .68, h * .4, 12);
    ctx.fill();
    ctx.strokeStyle = "#cfd7df";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#3c668c";
    ctx.fillRect(-1, -h * .64, 2, h * .31);

    // Brazos.
    ctx.strokeStyle = "#d79b75";
    ctx.lineWidth = Math.max(6, w * .09);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-w * .31, -h * .56); ctx.lineTo(-w * .39, -h * .31);
    ctx.moveTo(w * .31, -h * .56); ctx.lineTo(w * .38, -h * .31);
    ctx.stroke();

    // Cabeza.
    const headY = -h * .79;
    ctx.fillStyle = "#d69b75";
    ctx.beginPath();
    ctx.ellipse(0, headY, w * .31, h * .17, 0, 0, Math.PI * 2);
    ctx.fill();

    // Cabello estilizado.
    ctx.fillStyle = "#2b1b17";
    ctx.beginPath();
    ctx.arc(0, headY - h * .035, w * .32, Math.PI, Math.PI * 2);
    ctx.lineTo(w * .3, headY + h * .06);
    ctx.lineTo(-w * .3, headY + h * .06);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(-w * .31, headY, w * .09, h * .25);
    ctx.fillRect(w * .22, headY, w * .09, h * .25);

    // Cara simple, no fotográfica.
    ctx.fillStyle = "#1e2730";
    ctx.beginPath(); ctx.arc(-w * .1, headY, 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(w * .1, headY, 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#8d4d3d";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, headY + h * .055, w * .09, .1, Math.PI - .1);
    ctx.stroke();

    ctx.restore();
  }
  function drawMouse() {
    if (!mouse.alive) return;
    const w = mouse.w * mouse.scale;
    const h = mouse.h * mouse.scale * (mouse.grab ? 1 : mouse.squash);
    const x = mouse.x - camX;
    const y = mouse.y + (mouse.grab ? 0 : Math.sin(mouse.walk) * 2);

    ctx.save();
    ctx.translate(x, y);

    // Sombra.
    ctx.fillStyle = "rgba(0,0,0,.18)";
    ctx.beginPath();
    ctx.ellipse(0, 2, w * .42, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    // Cola.
    ctx.strokeStyle = "#9b7e72";
    ctx.lineWidth = Math.max(4, w * .055);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(w * .33, -h * .22);
    ctx.bezierCurveTo(w * .72, -h * .28, w * .75, -h * .03, w * .54, h * .03);
    ctx.stroke();

    // Piernas.
    ctx.fillStyle = "#1f467a";
    ctx.fillRect(-w * .28, -h * .27, w * .2, h * .27);
    ctx.fillRect(w * .08, -h * .27, w * .2, h * .27);

    // Cuerpo.
    ctx.fillStyle = "#f2f2ef";
    ctx.beginPath();
    ctx.roundRect(-w * .36, -h * .67, w * .72, h * .44, 15);
    ctx.fill();
    ctx.strokeStyle = "#c9cbc8";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Brazos/patas.
    ctx.strokeStyle = "#89766d";
    ctx.lineWidth = Math.max(7, w * .09);
    ctx.beginPath();
    ctx.moveTo(-w * .31, -h * .55); ctx.lineTo(-w * .39, -h * .31);
    ctx.moveTo(w * .31, -h * .55); ctx.lineTo(w * .39, -h * .31);
    ctx.stroke();

    // Cabeza de rata, totalmente ilustrada.
    const hy = -h * .82;
    ctx.fillStyle = "#8f7b72";
    ctx.beginPath(); ctx.arc(-w * .21, hy - h * .13, w * .18, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(w * .21, hy - h * .13, w * .18, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = "#b9a59a";
    ctx.beginPath(); ctx.ellipse(0, hy, w * .34, h * .19, 0, 0, Math.PI * 2); ctx.fill();

    // Hocico.
    ctx.fillStyle = "#cfb8aa";
    ctx.beginPath(); ctx.ellipse(0, hy + h * .045, w * .2, h * .085, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#4d3b37";
    ctx.beginPath(); ctx.arc(0, hy + h * .035, 4, 0, Math.PI * 2); ctx.fill();

    // Ojos.
    ctx.fillStyle = "#151515";
    ctx.beginPath(); ctx.arc(-w * .11, hy - h * .035, 3.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(w * .11, hy - h * .035, 3.2, 0, Math.PI * 2); ctx.fill();

    // Bigotes.
    ctx.strokeStyle = "#4d3b37";
    ctx.lineWidth = 1.6;
    [-1, 1].forEach(side => {
      for (let k = -1; k <= 1; k++) {
        ctx.beginPath();
        ctx.moveTo(side * w * .12, hy + h * .05 + k * 5);
        ctx.lineTo(side * w * .43, hy + h * .03 + k * 8);
        ctx.stroke();
      }
    });

    // Bolsa de monedas.
    if (stolenCount > 0) {
      const bagx = w * .34, bagy = -h * .34;
      ctx.fillStyle = "#8b6840";
      ctx.beginPath();
      ctx.ellipse(bagx, bagy, 17 + mouse.bagPulse * 7, 13, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#6d4f2d";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.restore();

    if (mouse.grab) {
      const hand = handPos();
      ctx.strokeStyle = "#89766d";
      ctx.lineWidth = 7;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(mouse.x + w * .2 - camX, mouse.y - h * .42);
      ctx.lineTo(hand.x - camX, hand.y);
      ctx.stroke();
      ctx.fillStyle = "#a28c81";
      ctx.beginPath();
      ctx.arc(hand.x - camX, hand.y, 7, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  function draw() {
    drawSky();
    drawGround();

    // Estructura tipo letrero detrás de las monedas.
    ctx.strokeStyle = "rgba(14,88,153,.62)";
    ctx.lineWidth = 5;
    const signY = GROUND - (portrait ? 360 : 300);
    ctx.beginPath();
    ctx.moveTo(250 - camX * .06, signY);
    ctx.lineTo(W + 100, signY);
    ctx.stroke();
    for (let x = 300 - (camX * .06 % 210); x < W + 120; x += 210) {
      ctx.beginPath();
      ctx.moveTo(x, signY);
      ctx.lineTo(x, GROUND - 14);
      ctx.stroke();
    }

    for (const c of coins) drawCoin(c);

    drawHeroCharacter(
      hero.x,
      hero.y,
      hero.w,
      hero.h,
      hero.facing,
      hero.onGround ? Math.sin(hero.walk) * 2 : 0
    );

    drawMouse();

    for (const p of particles) {
      ctx.globalAlpha = 1 - p.t / p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x - camX, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
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
