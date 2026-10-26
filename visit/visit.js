/* Pikomofu: a friend's pet comes to visit (https://pikomofu.com/v#…, built by Tools/site/build.py --visits).
   decode.js reads the pet from the link's fragment, here on the device, and this seats it in the app's own garden
   (visit/garden.png: the same picture for everyone, at the visitor's hour). Nothing about the visit is sent anywhere: the
   page's words, the app's breed names and the garden's light come with the page (#visit-data), and the name is only ever
   set as text. Like the app, the pet glances about, blinks and wags, is glad when touched, and sleeps at night (three
   touches wake it for a little while). Reduced motion: one still picture that changes only when touched.
   Test switches (a query string IS sent to the server, so they are for trying things out only): ?lang=<code>,
   ?at=2026-10-21T21:30 (another hour, as in bg.js). */
(() => {
  'use strict';
  const D = JSON.parse(document.getElementById('visit-data').textContent);
  const W = D.garden.w, H = D.garden.h, GROUND = D.garden.ground, PHASES = D.garden.order;
  const qs = new URLSearchParams(location.search);

  // ---- the language: the browser's first one the page has (one page for all: the pet rides in the fragment)
  function pick() {
    const want = qs.get('lang'); if (want && D.text[want]) return want;
    for (const l of (navigator.languages || [navigator.language || 'en'])) {
      const s = String(l).toLowerCase(), p = s.split('-')[0];
      if (p === 'zh') return /hant|-tw|-hk|-mo/.test(s) ? 'zh-Hant' : 'zh-Hans';
      if (p === 'pt') return 'pt-BR';
      if (p === 'in') return 'id';   // the old code for Indonesian
      for (const k in D.text) if (k === p) return k;
    }
    return 'en';
  }
  const lang = pick(), T = D.text[lang], ix = D.order.indexOf(lang);
  const root = document.documentElement;
  root.lang = lang;
  root.className = D.pixel[lang] || 'dot';
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const at = qs.get('at'), shift = at && !isNaN(Date.parse(at)) ? Date.parse(at) - Date.now() : 0;
  const clock = () => new Date(Date.now() + shift);
  const R = Math.random;
  const ua = navigator.userAgent || '';
  const android = /Android/i.test(ua);
  const ios = !android && (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1));

  // ---- words: {name} {breed} {days} {topic}; Chinese puts a space between Latin letters and Han, as the site does
  const koTopic = n => { const c = n.charCodeAt(n.length - 1); return c >= 0xAC00 && c <= 0xD7A3 && (c - 0xAC00) % 28 ? '은' : '는'; };
  function say(key, v = {}) {
    let s = (key === 'days' && v.days === 1 && T.days1) || T[key] || '';
    s = s.replace(/\{(\w+)\}/g, (m, k) => k === 'topic' ? koTopic(v.name || '') : v[k] != null ? String(v[k]) : '');
    if (lang.startsWith('zh')) s = s.replace(/([A-Za-z0-9])(?=[㐀-鿿])/g, '$1 ').replace(/([㐀-鿿])(?=[A-Za-z0-9])/g, '$1 ');
    return s;
  }
  const $ = s => document.querySelector(s);
  const text = (sel, s) => { const e = $(sel); if (e) e.textContent = s; };

  // ---- the page around the garden
  const site = 'https://pikomofu.com/' + (lang === 'ja' ? '' : lang + '/');
  $('#home').href = site; $('#top').href = site; $('#privacy').href = site + 'privacy.html';
  text('#top', T.top); text('#privacy', T.privacy);
  text('#cta', T.cta); text('#free', T.free); text('#note', T.note); text('#open-note', T.openNote); text('#open-label', T.open);
  $('#store').href = D.store;
  $('#badge').src = `badges/${lang}-black.svg`; $('#badge').alt = T.badge; $('#badge-dark').srcset = `badges/${lang}-white.svg`;
  if (android) { text('#android', T.android); $('#android').hidden = false; }

  // ---- the garden
  const host = $('#garden'), cv = document.createElement('canvas');
  cv.width = W; cv.height = H; cv.tabIndex = 0; cv.setAttribute('role', 'img');
  host.append(cv);
  const g = cv.getContext('2d');
  const S = { t: 0, phase: phaseAt(clock()), visit: null, frames: {}, bg: null, mode: 'sit', until: 0, petSwap: 0, gaze: 'sit', gazeAt: 0,
              blinkUntil: 0, blinkAt: 1.5 + R() * 3, wagUntil: 0, wagAt: 4 + R() * 6, taps: [], hearts: [], zs: [], zAt: 1, bf: null, bfAt: 3 + R() * 6,
              petX: 32, lastHeart: -9 };

  // the hour as the site's sky reads it (bg.js), so the garden and the sky behind the page agree
  function dayOfYear(d) { return Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 0)) / 864e5); }
  function phaseAt(d) {
    const c = Math.cos((dayOfYear(d) - 172) / 365.25 * 2 * Math.PI);
    const rise = 5.6 - 1.15 * c, set = 17.75 + 1.25 * c, h = d.getHours() + d.getMinutes() / 60;
    if (h >= rise - 0.8 && h < rise + 0.7) return 'dawn';
    if (h >= rise + 0.7 && h < set - 0.9) return 'day';
    if (h >= set - 0.9 && h < set + 0.8) return 'dusk';
    return 'night';
  }

  function fit() {
    // whole device pixels per garden pixel, so every dot stays square and sharp
    const dpr = window.devicePixelRatio || 1, avail = Math.min(host.clientWidth, 480);
    const k = Math.max(1, Math.floor(avail * dpr / W));
    cv.style.width = W * k / dpr + 'px'; cv.style.height = H * k / dpr + 'px';
  }

  const bgImg = new Image();
  bgImg.onload = () => { S.bg = bgImg; draw(); };
  bgImg.onerror = () => { S.bg = null; draw(); };   // no picture: a plain sky and lawn
  bgImg.src = 'visit/garden.png';

  function plainGarden() {
    const sky = { dawn: ['#9FB2E0', '#E9C9D8', '#F8DCC8'], day: ['#BCDDF3', '#D6EBF8', '#EEF5FA'], dusk: ['#8C8CC8', '#D9A9C0', '#F4C4A8'], night: ['#151B3A', '#1B2346', '#222B52'] }[S.phase];
    sky.forEach((c, i) => { g.fillStyle = c; g.fillRect(0, Math.floor(i * GROUND / 3), W, Math.ceil(GROUND / 3) + 1); });
    g.fillStyle = S.phase === 'night' ? '#3E5A3C' : '#9CD268'; g.fillRect(0, GROUND, W, H - GROUND);
  }

  // the pet's frames as little canvases, in the light of the hour (the app tints a portrait the same way)
  function paintFrames() {
    const v = S.visit; if (!v) return;
    const tint = D.garden.tint[S.phase], tc = tint && [0, 2, 4].map(i => parseInt(tint[0].slice(i, i + 2), 16));
    S.frames = {};
    for (const key of v.order) {
      const f = v.frames[key], px = PikoVisit.rgba(v, f);
      if (tc) for (let i = 0; i < px.length; i += 4) if (px[i + 3]) for (let c = 0; c < 3; c++) px[i + c] = Math.round(px[i + c] + (tc[c] - px[i + c]) * tint[1]);
      const k = document.createElement('canvas'); k.width = f.w; k.height = f.h;
      k.getContext('2d').putImageData(new ImageData(px, f.w, f.h), 0, 0);
      // its outline (for touches): the first and last solid columns and rows
      let x0 = f.w, x1 = -1, y0 = f.h, y1 = -1;
      for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) if (f.idx[y * f.w + x]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      S.frames[key] = { c: k, w: f.w, h: f.h, box: [x0, y0, x1, y1] };
    }
  }
  const has = k => !!S.frames[k];
  const asleep = () => S.phase === 'night' && has('sleep') && S.mode !== 'awake';

  function frameNow() {
    if (asleep()) return 'sleep';
    if (S.mode === 'pet') return S.t < S.petSwap && has('petA') ? 'petA' : has('petB') ? 'petB' : 'sit';
    if (S.mode === 'awake') return has('blink') && (S.blinkUntil > S.t || (S.t % 3.2) < 0.5) ? 'blink' : 'sit';   // woken up: sleepy blinks
    if (still) return 'sit';
    if (S.blinkUntil > S.t && has('blink')) return 'blink';
    if (S.wagUntil > S.t && has('wag')) return Math.floor(S.t * 7) % 2 ? 'wag' : 'sit';
    return has(S.gaze) ? S.gaze : 'sit';
  }

  function step(dt) {
    S.t += dt;
    if ((S.mode === 'pet' || S.mode === 'awake') && S.t > S.until) { const woke = S.mode === 'awake'; S.mode = 'sit'; if (woke) hint(); }
    for (const h of S.hearts) h.life += dt; S.hearts = S.hearts.filter(h => h.life < (still ? 1.5 : 1.3));
    for (const z of S.zs) z.life += dt; S.zs = S.zs.filter(z => z.life < 2.6);
    if (still || !S.visit) return;
    if (S.t >= S.blinkAt) { S.blinkUntil = S.t + 0.14; S.blinkAt = S.t + 2.5 + R() * 4; }
    if (S.t >= S.wagAt) { S.wagUntil = S.t + 1.4; S.wagAt = S.t + 7 + R() * 9; }
    // the gaze wanders (the app's .sit), or follows the butterfly
    const cx = S.petX + 16;
    stepButterfly(dt);
    if (S.bf) S.gaze = Math.abs(S.bf.x - cx) < 9 && S.bf.y < GROUND - 26 ? 'lookUp' : S.bf.x < cx ? 'lookLeft' : 'lookRight';
    else if (S.t > S.gazeAt) {
      S.gaze = ['sit', 'lookLeft', 'lookRight', 'lookUp', 'sit', 'sit'][Math.floor(R() * 6)];
      S.gazeAt = S.t + 0.8 + R() * 0.9 + (S.gaze === 'sit' ? 1.5 : 0);
    }
    if (asleep() && S.t >= S.zAt) { S.zAt = S.t + 2.6; S.zs.push({ x: S.petX + 30, y: GROUND - 20, life: 0 }); }
  }

  function stepButterfly(dt) {
    const m = clock().getMonth() + 1;
    if (S.phase !== 'day' || m === 12 || m <= 2) { S.bf = null; return; }   // by day, and not in winter
    if (!S.bf && (S.bfAt -= dt) <= 0) { const d = R() < 0.5 ? 1 : -1; S.bf = { x: d > 0 ? -4 : W + 4, y0: 14 + R() * 12, d, ph: R() * 6.3 }; }
    if (S.bf) {
      const b = S.bf; b.x += b.d * 7 * dt; b.y = b.y0 + Math.sin(S.t * 1.7 + b.ph) * 5;
      if (b.x < -6 || b.x > W + 6) { S.bf = null; S.bfAt = 9 + R() * 14; }
    }
  }

  function draw() {
    g.clearRect(0, 0, W, H);
    if (S.bg) g.drawImage(S.bg, 0, PHASES.indexOf(S.phase) * H, W, H, 0, 0, W, H); else plainGarden();
    const key = S.visit ? frameNow() : null, f = key && S.frames[key];
    if (f) {
      const x = Math.round((W - f.w) / 2), y = GROUND - f.h;
      S.petX = x + (f.w - 32) / 2;
      g.fillStyle = 'rgba(40,60,30,.18)';   // a soft shadow under it, the garden's
      const [x0, , x1] = f.box, sw = x1 - x0 + 1;
      g.fillRect(x + x0 + 2, GROUND - 1, sw - 4, 1); g.fillRect(x + x0 + 4, GROUND, sw - 8, 1);
      g.drawImage(f.c, x, y);
    }
    drawButterfly();
    for (const h of S.hearts) {
      const a = still ? 1 : Math.max(0, 1 - h.life / 1.3), x = Math.round(h.x), y = Math.round(h.y - (still ? 0 : h.life * 7));
      g.globalAlpha = a; g.fillStyle = '#F0607E';
      for (const [dx, dy] of [[1, 0], [3, 0], [0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [1, 2], [2, 2], [3, 2], [2, 3]]) g.fillRect(x - 2 + dx, y + dy, 1, 1);
      g.fillStyle = '#FFC2D0'; g.fillRect(x - 1, y + 1, 1, 1);
    }
    g.fillStyle = '#C3C9E6';
    for (const z of S.zs) {
      const life = still ? 1 : z.life;
      const a = still ? 1 : Math.min(1, life * 2) * Math.max(0, 1 - life / 2.6), x = Math.round(z.x + life * 2), y = Math.round(z.y - life * 4);
      g.globalAlpha = a * 0.9;
      g.fillRect(x, y, 4, 1); g.fillRect(x + 2, y + 1, 1, 1); g.fillRect(x + 1, y + 2, 1, 1); g.fillRect(x, y + 3, 4, 1);
    }
    g.globalAlpha = 1;
  }
  function drawButterfly() {
    const b = S.bf; if (!b) return;
    const x = Math.round(b.x), y = Math.round(b.y), open = Math.floor(S.t * 6) % 2 === 0;
    g.fillStyle = '#F49AB6';
    for (const [dx, dy] of open ? [[-2, 0], [-1, 0], [1, 0], [2, 0], [-2, 1], [-1, 1], [1, 1], [2, 1], [-1, 2], [1, 2]] : [[-1, 0], [1, 0], [-1, 1], [1, 1]]) g.fillRect(x + dx, y + dy, 1, 1);
    g.fillStyle = '#6B4A5E'; g.fillRect(x, y, 1, 3);
  }

  // ---- touch: glad (a heart); asleep, three touches wake it for a little while (as in the app)
  function touch() {
    if (!S.visit) return;
    if (still) advance();
    if (asleep()) {
      S.taps = S.taps.filter(t => S.t - t < 4); S.taps.push(S.t);
      if (S.taps.length >= 3) { S.taps = []; S.mode = 'awake'; S.until = S.t + 10; S.blinkUntil = S.t + 0.6; hint(); }
      else S.zs.push({ x: S.petX + 30, y: GROUND - 20, life: still ? 1 : 0 });
    } else {
      const first = S.mode !== 'pet';
      S.mode = 'pet'; S.until = S.t + 2.1; if (first) S.petSwap = S.t + 0.9;
      if (S.t - S.lastHeart > 0.7) { S.lastHeart = S.t; S.hearts.push({ x: S.petX + 17, y: GROUND - 34, life: 0 }); }
    }
    draw();
    if (still) settle();
  }
  // reduced motion: no animation loop; the picture changes when touched and goes back once the moment is over
  let stepped = performance.now(), settling = 0;
  function advance() { const now = performance.now(); step(Math.min(5, (now - stepped) / 1000)); stepped = now; }
  function settle() {
    clearTimeout(settling);
    settling = setTimeout(function tick() {
      advance(); draw();
      if (S.mode !== 'sit' || S.hearts.length || S.zs.length) settling = setTimeout(tick, 400);
    }, 400);
  }
  function onPointer(e) {
    if (!S.visit) return;
    const r = cv.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * W, y = (e.clientY - r.top) / r.height * H;
    const f = S.frames[frameNow()]; if (!f) return;
    const ox = Math.round((W - f.w) / 2), oy = GROUND - f.h, [x0, y0, x1, y1] = f.box;
    if (x >= ox + x0 - 4 && x <= ox + x1 + 4 && y >= oy + y0 - 5 && y <= oy + y1 + 3) touch();
  }
  cv.addEventListener('pointerdown', onPointer);
  cv.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); touch(); } });

  function breedName(v) {
    const b = v.look && D.breeds[v.look.breed];
    return b ? b[ix] : T[v.species];
  }
  function hint() {
    const v = S.visit;
    text('#hint', !v ? '' : asleep() ? T.hintNight : T.hint);
    cv.setAttribute('aria-label', v ? say(asleep() ? 'altSleep' : 'alt', { name: v.name || T[v.species], breed: breedName(v) }) : T.altNone);
  }

  // ---- the loop (15 frames a second, like the site's sky)
  let last = performance.now(), acc = 0;
  function loop(ts) {
    const dt = Math.min(0.25, (ts - last) / 1000); last = ts; acc += dt;
    if (acc >= 1 / 15) { step(acc); draw(); acc = 0; }
    requestAnimationFrame(loop);
  }
  function retime() {
    const p = phaseAt(clock());
    if (p !== S.phase) { S.phase = p; S.mode = 'sit'; paintFrames(); hint(); draw(); }
  }

  // ---- read the link
  function show(v, run) {
    S.visit = v; paintFrames();
    const name = v.name || T[v.species];
    text('#title', say('title', { name })); text('#lead', say('lead', { name }));
    document.title = `${say('title', { name })} · Pikomofu`;
    const bits = [breedName(v)];
    if (v.since != null) {
      const d = clock(), today = Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5), n = today - v.since + 1;
      if (v.since >= 20454 && n >= 1 && n < 40000) bits.push(say('days', { days: n }));   // 2026-01-01 or later, and not in the future
    }
    text('#meta', bits.filter(Boolean).join(' ・ '));
    text('#why', '');
    // with the app, the same link opens it (until universal links are set up): the visitor comes into your own garden
    $('#open-app').href = 'pikomofu://visit#' + run;
    $('#open').hidden = !ios;
    document.body.className = 'has-pet';
    hint(); draw();
  }
  function empty(code) {
    S.visit = null; S.frames = {};
    text('#title', T.emptyTitle); text('#meta', ''); text('#lead', T.leadNone);
    text('#why', code === 'none' ? T.none : code === 'version' || code === 'method' ? T.newer : T.cut);
    document.title = `${T.emptyTitle} · Pikomofu`;
    $('#open').hidden = true;
    document.body.className = 'no-pet';
    hint(); draw();
  }
  async function read() {
    const run = PikoVisit.run(location.hash);
    if (!run) return empty('none');
    try { show(await PikoVisit.decode(run), run); }
    catch (e) { empty(e && e.code || 'format'); }
  }

  fit(); addEventListener('resize', fit);
  read();
  addEventListener('hashchange', read);
  setInterval(retime, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { retime(); last = performance.now(); } });
  if (!still) requestAnimationFrame(t => { last = t; requestAnimationFrame(loop); });
})();
