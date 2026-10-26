/* Pikomofu site, top page (build.py --landing): the app's own garden at the top with the logo in its sky, the moments
   and rare days as clips, every breed. All the pixel art is drawn by the app's engine (hero.swift, moments.py) and shown
   at whole device pixels a dot.
   The garden: the visitor's own hour and season (read from the clock as bg.js does, so it agrees with the sky behind
   the page), the real moon at night, one of a few pets. Like the app it blinks, wags and glances about, watches a
   butterfly by day, is glad when touched (a heart), and with a finger resting on it its heart beats over its head. At
   night it sleeps; three touches wake it for a little while. Nothing is sent anywhere.
   Reduced motion, or the pause button: still pictures that change only when touched.
   Test switches: ?at=2026-06-15T21:00 (bg.js's), ?pet=<id>, ?bf=logo (a butterfly at once, to the logo). */
(() => {
  'use strict';
  const D = JSON.parse(document.getElementById('hero-data').textContent);
  const qs = new URLSearchParams(location.search);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let paused = false;
  try { paused = localStorage.getItem('piko-still') === '1'; } catch {}
  const still = () => reduce || paused;
  const at = qs.get('at'), shift = at && !isNaN(Date.parse(at)) ? Date.parse(at) - Date.now() : 0;
  const clock = () => new Date(Date.now() + shift);
  const R = Math.random;
  const dpr = () => window.devicePixelRatio || 1;

  // ---- the hour and the season, as bg.js reads them
  const dayOfYear = d => Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 0)) / 864e5);
  function phaseAt(d) {
    const c = Math.cos((dayOfYear(d) - 172) / 365.25 * 2 * Math.PI);
    const rise = 5.6 - 1.15 * c, set = 17.75 + 1.25 * c, h = d.getHours() + d.getMinutes() / 60;
    if (h >= rise - 0.8 && h < rise + 0.7) return 'dawn';
    if (h >= rise + 0.7 && h < set - 0.9) return 'day';
    if (h >= set - 0.9 && h < set + 0.8) return 'dusk';
    return 'night';
  }
  // the tree through the year, Tokyo's (the app's World.treeStage from the JMA normals: blossom from the opening to a
  // week after full bloom, young leaves, green, the maples turning from five weeks before their peak, then bare)
  function stageAt(d) {
    const md = (d.getMonth() + 1) * 100 + d.getDate();
    if (md >= 324 && md <= 408) return 'blossom';
    if (md >= 409 && md <= 513) return 'young';
    if (md >= 514 && md <= 1023) return 'green';
    if (md >= 1024 && md <= 1205) return 'autumn';
    return 'bare';
  }
  const moonAge = d => (((d - Date.UTC(2000, 0, 6, 18, 14)) / 864e5) % 29.530588 + 29.530588) % 29.530588;

  // ================= the garden at the top =================
  const host = document.getElementById('hero-garden');
  const statusEl = document.getElementById('hero-status'), hintEl = document.getElementById('hero-hint');
  const dir = host.dataset.dir;
  const FULL = D.w, H = D.h, GROUND = D.ground, CW = D.cell[0], CH = D.cell[1];
  const TREE_RIGHT = 52;   // the tree's crown ends here: the open sky (for the logo) and lawn are to its right
  const want = qs.get('pet');
  const row = D.pets.some(p => p.id === want) ? D.pets.findIndex(p => p.id === want) : Math.floor(R() * D.pets.length);
  const pet = D.pets[row], name = D.names[pet.id] || '';
  const say = key => (D.say[key] || '').replace('%@', name);

  const cv = document.createElement('canvas');
  cv.tabIndex = 0; cv.setAttribute('role', 'img');
  const g = cv.getContext('2d');
  const logo = document.createElement('div'); logo.className = 'logo';
  const logoImg = document.createElement('img'); logoImg.alt = 'Pikomofu'; logo.append(logoImg);
  host.prepend(cv); host.append(logo);
  const pauseBtn = document.createElement('button'); pauseBtn.className = 'pause'; pauseBtn.type = 'button';
  host.append(pauseBtn);

  const S = { t: 0, phase: phaseAt(clock()), stage: stageAt(clock()), W: 120, petX: 64, frames: null, sheet: null, bg: null,
              mode: 'sit', until: 0, gaze: 'sit', gazeAt: 1, blinkUntil: 0, blinkAt: 1.5 + R() * 3, wagUntil: 0, wagAt: 3 + R() * 5,
              taps: [], awakeUntil: 0, hearts: [], zs: [], zAt: 1, bf: null, bfAt: qs.get('bf') ? 0.3 : 3.2, firstBf: true, lastHeart: -9, hold: null, touched: false, greetAt: 0.7, hop: -1 };

  function fit() {
    // whole device pixels a dot: about 3 CSS px on a phone, 4 on a wide screen; as much of the garden as fits, from the left
    const avail = (host.parentElement.clientWidth || 360) - 4, r = dpr();
    const k = Math.max(1, Math.round((avail >= 700 ? 4 : 3) * r));
    const w = Math.max(96, Math.min(FULL, Math.floor(avail * r / k)));
    S.W = w; cv.width = w; cv.height = H;
    const css = k / r;
    cv.style.width = w * css + 'px'; cv.style.height = H * css + 'px';
    // the logo in the open sky right of the tree, its width a whole number of CSS px
    const open = w - TREE_RIGHT, lw = Math.round(Math.max(150, Math.min(300, open * css * 0.82)));
    const cx = (TREE_RIGHT + w) / 2;
    logo.style.width = lw + 'px';
    logo.style.left = Math.round(cx * css - lw / 2) + 'px';
    const top = Math.round(12 * css), left = Math.round(cx * css - lw / 2);
    logo.style.top = top + 'px';
    // the dot of the i, in garden dots (the SVG's ink sits 16.83 units inside its 874.92 × 225.65 box): the butterfly rests on it
    const ix = (16.83 + 371 / 2400 * 841.26) / 874.92 * lw, iy = (16.83 + 7 / 550 * 192) / 225.65 * lw * 225.65 / 874.92;
    S.iDot = { x: (left + ix) / css, y: (top + iy) / css - 2.6 };
    S.petX = Math.max(58, Math.min(w - 36, Math.round(cx - 16)));
    cv.dataset.pet = [(S.petX + 16) / w, (GROUND - 14) / H].map(v => v.toFixed(3)).join(',');   // where its body is (for tests)
    draw();
  }

  let sheet = null;
  function load() {
    const bg = new Image(), sh = new Image();
    bg.onload = () => { S.bg = bg; draw(); };
    bg.src = `${dir}garden-${S.stage}-${pet.cat ? 'cat' : 'dog'}.png`;
    sh.onload = () => { sheet = sh; paintFrames(); draw(); };
    sh.src = `${dir}pets.png`;
  }
  function setLogo() { logoImg.src = S.phase === 'night' ? host.dataset.logoDark : host.dataset.logo; }   // white on the night sky
  // its frames in the light of the hour (the app tints a pet the same way)
  function paintFrames() {
    if (!sheet) return;
    const tint = D.tint[S.phase], tc = tint && [0, 2, 4].map(i => parseInt(tint[0].slice(i, i + 2), 16));
    const k = document.createElement('canvas'); k.width = CW * D.cells.length; k.height = CH;
    const c = k.getContext('2d'); c.drawImage(sheet, 0, row * CH, k.width, CH, 0, 0, k.width, CH);
    const img = c.getImageData(0, 0, k.width, CH), px = img.data;
    if (tc) for (let i = 0; i < px.length; i += 4) if (px[i + 3]) for (let j = 0; j < 3; j++) px[i + j] = Math.round(px[i + j] + (tc[j] - px[i + j]) * tint[1]);
    c.putImageData(img, 0, 0);
    S.frames = {};
    D.cells.forEach((key, i) => {
      let x0 = CW, x1 = -1, y0 = CH, y1 = -1;
      for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) if (px[(y * k.width + i * CW + x) * 4 + 3]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      S.frames[key] = { x: i * CW, box: [x0, y0, x1, y1] };
    });
    S.sheet = k;
  }

  const asleep = () => S.phase === 'night' && S.t >= S.awakeUntil;
  const woken = () => S.phase === 'night' && S.t < S.awakeUntil;   // three touches: up for a little while, sleepy
  function frameNow() {
    if (asleep()) return !still() && Math.floor(S.t / 1.6) % 2 ? 'sleep2' : 'sleep';   // breathing
    if (S.hold || S.mode === 'pet') return 'happy';
    if (woken()) return S.blinkUntil > S.t || (S.t % 3.2) < 0.5 ? 'blink' : 'sit';
    if (still()) return 'sit';
    if (S.blinkUntil > S.t) return 'blink';
    if (S.wagUntil > S.t) return Math.floor(S.t * 7) % 2 ? 'wag' : 'sit';
    return S.gaze;
  }
  function line() {
    const s = asleep() ? say('asleep') : S.hold && S.hold.on ? say('hold') : S.mode === 'pet' && S.touched ? say('glad')
      : woken() ? say('sleepy') : S.bf ? say('butterfly') : say('hello');
    if (hintEl && hintEl.hidden !== S.touched) hintEl.hidden = S.touched;
    if (statusEl.textContent !== s) statusEl.textContent = s;
    const label = asleep() ? say('asleep') : say('hello');
    if (cv.getAttribute('aria-label') !== label) cv.setAttribute('aria-label', label);
  }

  function step(dt) {
    S.t += dt;
    if (S.mode === 'pet' && S.t > S.until) S.mode = 'sit';
    for (const h of S.hearts) h.life += dt; S.hearts = S.hearts.filter(h => h.life < 1.3);
    for (const z of S.zs) z.life += dt; S.zs = S.zs.filter(z => z.life < 2.6);
    if (S.hold && !S.hold.on && S.t - S.hold.t0 > 0.45) S.hold.on = true;
    if (S.greetAt && S.t >= S.greetAt) {   // it notices you: a hop and a heart (the app's greeting when you open it)
      S.greetAt = 0;
      if (!asleep() && !S.touched) { S.mode = 'pet'; S.until = S.t + 1.6; S.hop = S.t; S.hearts.push({ x: S.petX + 17, y: GROUND - 38, life: 0 }); }
    }
    if (still()) return;
    if (S.t >= S.blinkAt) { S.blinkUntil = S.t + 0.14; S.blinkAt = S.t + 2.5 + R() * 4; }
    if (S.t >= S.wagAt) { S.wagUntil = S.t + 1.4; S.wagAt = S.t + 6 + R() * 8; }
    stepButterfly(dt);
    const cx = S.petX + 16;
    if (S.bf) S.gaze = (Math.abs(S.bf.x - cx) < 14 && S.bf.y < GROUND - 26) || S.bf.visit === 'rest' ? 'up' : S.bf.x < cx ? 'left' : 'right';
    else if (S.t > S.gazeAt) {
      S.gaze = ['sit', 'left', 'right', 'up', 'sit', 'sit'][Math.floor(R() * 6)];
      S.gazeAt = S.t + 0.8 + R() * 0.9 + (S.gaze === 'sit' ? 1.6 : 0);
    }
    if (asleep() && S.t >= S.zAt) { S.zAt = S.t + 2.6; S.zs.push({ x: S.petX + 30, y: GROUND - 18, life: 0 }); }
  }
  function stepButterfly(dt) {
    const m = clock().getMonth() + 1;
    if (S.phase !== 'day' || m === 12 || m <= 2) { S.bf = null; return; }   // by day, and not in winter
    if (!S.bf && (S.bfAt -= dt) <= 0) {
      const d = R() < 0.5 ? 1 : -1;
      S.bf = { x: d > 0 ? TREE_RIGHT - 6 : S.W + 4, y0: 34 + R() * 10, d, ph: R() * 6.3, visit: S.iDot && (qs.get('bf') === 'logo' || S.firstBf || R() < 0.6) ? 'go' : null, rest: 0 };
      S.firstBf = false;
      S.bf.y = S.bf.y0;
    }
    const b = S.bf; if (!b) return;
    if (b.visit === 'go') {   // up to the dot of the i, wobbling a little
      const dx = S.iDot.x - b.x, dy = S.iDot.y - b.y, dist = Math.hypot(dx, dy), v = 8 * dt;
      if (dist <= v) { b.x = S.iDot.x; b.y = S.iDot.y; b.visit = 'rest'; b.rest = 2.6 + R() * 1.6; }
      else { b.x += dx / dist * v; b.y += dy / dist * v + Math.sin(S.t * 6 + b.ph) * 0.25; }
      return;
    }
    if (b.visit === 'rest') { if ((b.rest -= dt) <= 0) { b.visit = 'off'; b.y0 = b.y; b.ph = -S.t * 1.7; } return; }
    b.x += b.d * 7 * dt; b.y = b.visit === 'off' ? Math.max(2, b.y0 - (1 - Math.cos(S.t * 1.7 + b.ph)) * 4) : b.y0 + Math.sin(S.t * 1.7 + b.ph) * 5;
    if (b.x < TREE_RIGHT - 8 || b.x > S.W + 6) { S.bf = null; S.bfAt = 8 + R() * 12; }
  }

  // the moon in the top corner at night, its real phase (bg.js draws the same one in the page's sky)
  function drawMoon() {
    if (S.phase !== 'night') return;
    const k = moonAge(clock()) / 29.530588, th = 2 * Math.PI * k, r = 3.5, cx = S.W - 8, cy = 5;
    if (k < 0.04 || k > 0.96) return;   // new moon
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const nx = dx / r, ny = dy / r;
      if (nx * nx + ny * ny > 1.02) continue;
      const half = Math.sqrt(Math.max(0, 1 - ny * ny));
      const on = k < 0.5 ? nx >= Math.cos(th) * half : nx <= -Math.cos(th) * half;
      g.fillStyle = on ? '#FFF1BF' : '#2A3256'; g.globalAlpha = on ? 1 : 0.6; g.fillRect(cx + dx, cy + dy, 1, 1);
    }
    g.globalAlpha = 1;
  }

  function draw() {
    if (!cv.width) return;
    g.clearRect(0, 0, S.W, H);
    if (S.bg) g.drawImage(S.bg, 0, D.order.indexOf(S.phase) * H, S.W, H, 0, 0, S.W, H);
    drawMoon();
    const key = S.frames && frameNow(), f = key && S.frames[key];
    if (f) {
      const hop = S.hop >= 0 && S.t - S.hop < 0.5 ? Math.round(Math.sin((S.t - S.hop) / 0.5 * Math.PI) * 4) : 0;
      const [x0, , x1] = f.box, sw = x1 - x0 + 1, x = S.petX - (CW - 32) / 2, y = GROUND - CH - hop;
      g.fillStyle = 'rgba(40,60,30,.18)';   // its soft shadow on the lawn, the garden's
      g.fillRect(x + x0 + 2, GROUND - 1, sw - 4, 1); g.fillRect(x + x0 + 4, GROUND, sw - 8, 1);
      g.drawImage(S.sheet, f.x, 0, CW, CH, x, y, CW, CH);
    }
    drawButterfly();
    for (const h of S.hearts) heart(h.x, h.y - (still() ? 0 : h.life * 7), still() ? 1 : Math.max(0, 1 - h.life / 1.3), 1);
    if (S.hold && S.hold.on && !asleep()) {   // its heartbeat over its head: big, small, big (the app's lub-dub)
      const p = (S.t * pet.bpm / 60) % 1, big = p < 0.12 || (p > 0.24 && p < 0.34);
      heart(S.petX + 17, GROUND - 40, 1, big ? 2 : 1);
    }
    g.fillStyle = '#C3C9E6';
    for (const z of S.zs) {
      const life = still() ? 1 : z.life;
      const a = still() ? 1 : Math.min(1, life * 2) * Math.max(0, 1 - life / 2.6), x = Math.round(z.x + life * 2), y = Math.round(z.y - life * 4);
      g.globalAlpha = a * 0.9;
      g.fillRect(x, y, 4, 1); g.fillRect(x + 2, y + 1, 1, 1); g.fillRect(x + 1, y + 2, 1, 1); g.fillRect(x, y + 3, 4, 1);
    }
    g.globalAlpha = 1;
    line();
  }
  function heart(cx, cy, a, s) {
    const x = Math.round(cx), y = Math.round(cy);
    g.globalAlpha = a; g.fillStyle = '#F0607E';
    for (const [dx, dy] of [[1, 0], [3, 0], [0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [1, 2], [2, 2], [3, 2], [2, 3]]) g.fillRect(x - 2 * s + dx * s, y + dy * s, s, s);
    g.fillStyle = '#FFC2D0'; g.fillRect(x - s, y + s, s, s);
    g.globalAlpha = 1;
  }
  function drawButterfly() {   // the app's (Art.fly1 / fly2): yellow wings, ink body
    const b = S.bf; if (!b) return;
    const x = Math.round(b.x), y = Math.round(b.y), open = b.visit === 'rest' ? Math.floor(S.t * 1.4) % 2 === 0 : Math.floor(S.t * 8) % 2 === 0;
    g.fillStyle = '#FFC94D';
    if (open) { g.fillRect(x - 1, y, 1, 1); g.fillRect(x + 1, y, 1, 1); g.fillRect(x - 1, y + 1, 1, 1); g.fillRect(x + 1, y + 1, 1, 1); }
    else g.fillRect(x, y, 1, 1);
    g.fillStyle = '#3A2F45'; g.fillRect(x, y + 1, 1, 1);
  }

  // ---- touch: glad (a heart); held, its heartbeat; asleep, three touches wake it for a little while (as in the app)
  function onPet(x, y) {
    const f = S.frames && S.frames[frameNow()]; if (!f) return false;
    const ox = S.petX - (CW - 32) / 2, oy = GROUND - CH, [x0, y0, x1, y1] = f.box;
    return x >= ox + x0 - 5 && x <= ox + x1 + 5 && y >= oy + y0 - 6 && y <= oy + y1 + 4;
  }
  function touch() {
    S.touched = true;
    if (asleep()) {
      S.taps = S.taps.filter(t => S.t - t < 4); S.taps.push(S.t);
      if (S.taps.length >= 3) { S.taps = []; S.mode = 'sit'; S.awakeUntil = S.t + 10; S.blinkUntil = S.t + 0.6; }
      else S.zs.push({ x: S.petX + 30, y: GROUND - 18, life: still() ? 1 : 0 });
    } else {
      S.mode = 'pet'; S.until = S.t + 2.1;
      if (S.t - S.lastHeart > 0.6) { S.lastHeart = S.t; S.hearts.push({ x: S.petX + 17, y: GROUND - 38, life: 0 }); }
    }
    draw();
    if (still()) settle();
  }
  let settling = 0, stepped = performance.now();
  function settle() {   // without the loop: let the moment play out, then back to sitting
    clearTimeout(settling);
    settling = setTimeout(function tick() {
      const now = performance.now(); step(Math.min(5, (now - stepped) / 1000)); stepped = now; draw();
      if (S.mode !== 'sit' || S.hearts.length || S.zs.length || S.hold || woken()) settling = setTimeout(tick, 300);
    }, 300);
  }
  const garden = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * S.W, (e.clientY - r.top) / r.height * H]; };
  cv.addEventListener('pointerdown', e => {
    const [x, y] = garden(e); if (!onPet(x, y)) return;
    e.preventDefault();
    const was = asleep();
    touch();
    if (!was) { S.hold = { t0: S.t, x: e.clientX, y: e.clientY, on: false }; try { cv.setPointerCapture(e.pointerId); } catch {} }
  });
  cv.addEventListener('pointermove', e => { if (S.hold && Math.hypot(e.clientX - S.hold.x, e.clientY - S.hold.y) > 12) S.hold = null; });
  const up = () => { if (S.hold) { const was = S.hold.on; S.hold = null; S.mode = 'pet'; S.until = S.t + (was ? 1.2 : 2.1); draw(); } };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up); cv.addEventListener('lostpointercapture', up);
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); touch(); } });

  let last = performance.now(), acc = 0, running = false;
  function loop(ts) {
    if (still()) { running = false; return; }
    const dt = Math.min(0.25, (ts - last) / 1000); last = ts; acc += dt;
    if (acc >= 1 / 15) { step(acc); draw(); acc = 0; }   // 15 a second, like the site's sky
    requestAnimationFrame(loop);
  }
  function run() { if (!running && !still()) { running = true; last = performance.now(); requestAnimationFrame(loop); } }
  function retime() {
    const p = phaseAt(clock()), s = stageAt(clock());
    if (s !== S.stage) { S.stage = s; load(); }
    if (p !== S.phase) { S.phase = p; S.mode = 'sit'; S.awakeUntil = 0; setLogo(); paintFrames(); draw(); }
  }

  // ================= the moments: a still first, the clip once it is on screen =================
  const clips = [...document.querySelectorAll('img[data-gif]')];
  function fitClips() {   // whole device pixels a dot
    const r = dpr();
    for (const im of clips) {
      const w = im.parentElement.clientWidth; if (!w) continue;
      const dw = +im.getAttribute('width') || 120, dh = +im.getAttribute('height') || 56, k = Math.max(1, Math.floor(w * r / dw));
      im.style.width = dw * k / r + 'px'; im.style.height = dh * k / r + 'px';
    }
  }
  const png = im => im.dataset.png || (im.dataset.png = im.getAttribute('src'));
  const seen = new Set();
  const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => {
    for (const en of es) {
      if (en.isIntersecting) { seen.add(en.target); if (!still()) en.target.src = en.target.dataset.gif; }
      else if (seen.has(en.target)) { seen.delete(en.target); en.target.src = png(en.target); }   // off screen: still again
    }
  }, { rootMargin: '120px 0px' }) : null;
  clips.forEach(im => { png(im); if (io) io.observe(im); });
  function motion() {   // pause or play everything that moves on its own
    for (const im of clips) if (seen.has(im) || !io) { const want = still() ? png(im) : im.dataset.gif; if (im.getAttribute('src') !== want) im.src = want; }
    pauseBtn.innerHTML = D.icons[still() ? 'play' : 'pause'];
    pauseBtn.setAttribute('aria-label', still() ? D.play : D.pause); pauseBtn.title = pauseBtn.getAttribute('aria-label');
    pauseBtn.setAttribute('aria-pressed', paused ? 'true' : 'false');
    pauseBtn.hidden = reduce;
    if (still()) { S.bf = null; S.hold = null; draw(); } else run();
  }
  pauseBtn.addEventListener('click', () => { paused = !paused; try { localStorage.setItem('piko-still', paused ? '1' : '0'); } catch {} motion(); });

  // ================= every breed: sitting, glad when you come near =================
  const grid = document.getElementById('breeds');
  if (grid) {
    const img = new Image();
    img.onload = () => {
      const cells = [];
      D.breeds.forEach((b, i) => {
        const fig = document.createElement('div'); fig.className = 'breed';
        const c = document.createElement('canvas'); c.width = CW; c.height = CH; c.className = 'px';
        c.setAttribute('aria-hidden', 'true');
        const k = c.getContext('2d');
        const show = glad => { k.clearRect(0, 0, CW, CH); k.drawImage(img, i * CW, glad ? CH : 0, CW, CH, 0, 0, CW, CH); };
        show(false);
        const cap = document.createElement('span'); cap.textContent = b.name;
        fig.append(c, cap); grid.append(fig);
        let off = 0;
        const glad = () => { show(true); clearTimeout(off); off = setTimeout(() => show(false), 1400); };
        fig.addEventListener('pointerenter', glad); fig.addEventListener('pointerdown', glad);
        cells.push(c);
      });
      const fitBreeds = () => { const r = dpr(), k = Math.max(1, Math.round(2 * r)); for (const c of cells) { c.style.width = CW * k / r + 'px'; c.style.height = CH * k / r + 'px'; } };
      fitBreeds(); addEventListener('resize', fitBreeds);
    };
    // only once it is near the screen (it is far down the page)
    const go = () => { if (!img.src) img.src = grid.dataset.src; };
    if ('IntersectionObserver' in window) { const o = new IntersectionObserver(es => { if (es.some(x => x.isIntersecting)) { o.disconnect(); go(); } }, { rootMargin: '400px 0px' }); o.observe(grid); }
    else go();
  }

  if (hintEl) hintEl.textContent = say('touch');
  setLogo(); fit(); fitClips(); load(); motion(); line();
  addEventListener('resize', () => { fit(); fitClips(); });
  setInterval(retime, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { retime(); last = performance.now(); } });
})();
