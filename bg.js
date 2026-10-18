/* Pikomofu site: the sky outside the window, softly, like the garden's.
   The visitor's own clock and season (nothing is sent anywhere): dawn, day, dusk and night, drifting clouds, the real
   moon, stars and now and then a shooting star at night; petals in spring, fireflies in June, red dragonflies, falling
   leaves, snow on some winter days, a kite at New Year. At the bottom of the page, a lawn where a shiba and a calico
   sit (they blink, wag, are glad when you come near, and sleep at night). Reduced motion: one still picture. */
(() => {
  'use strict';
  const me = document.currentScript;
  const petsSrc = me && me.dataset.pets;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const darkQ = matchMedia('(prefers-color-scheme: dark)');
  const R = Math.random;
  // ?at=2026-06-15T21:00 shows another day and hour (to look at the seasons; nothing else changes)
  const at = new URLSearchParams(location.search).get('at'), shift = at && !isNaN(Date.parse(at)) ? Date.parse(at) - Date.now() : 0;
  const clock = () => new Date(Date.now() + shift);
  const rng = seed => () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const hash = (a, b) => { let h = Math.imul(a ^ 0x9E3779B9, 0x85EBCA6B) ^ Math.imul(b + 0x632BE5AB, 0xC2B2AE35); h ^= h >>> 13; h = Math.imul(h, 0x27D4EB2F); return (h ^ h >>> 15) >>> 0; };

  // ---- the visitor's sky
  const dayOfYear = d => Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 0)) / 864e5);   // (not local subtraction: DST)
  function readSky(d) {
    const c = Math.cos((dayOfYear(d) - 172) / 365.25 * 2 * Math.PI);
    const rise = 5.6 - 1.15 * c, set = 17.75 + 1.25 * c, h = d.getHours() + d.getMinutes() / 60;
    let phase = 'night';
    if (h >= rise - 0.8 && h < rise + 0.7) phase = 'dawn';
    else if (h >= rise + 0.7 && h < set - 0.9) phase = 'day';
    else if (h >= set - 0.9 && h < set + 0.8) phase = 'dusk';
    const m = d.getMonth() + 1, md = m * 100 + d.getDate(), y = d.getFullYear(), doy = dayOfYear(d);
    const night = phase === 'night', day = phase === 'day', extras = new Set();
    if ((md >= 1201 || md <= 228) && hash(y, doy) % 5 < 2) extras.add('snow');            // some winter days
    if (md >= 101 && md <= 107 && !night) extras.add('kite');
    if (md >= 315 && md <= 425) extras.add('petals');
    if (md >= 601 && md <= 710 && (night || phase === 'dusk')) extras.add('fireflies');
    if (md >= 901 && md <= 1020 && day) extras.add('dragonflies');
    if (md >= 1021 && md <= 1130) extras.add('leaves');
    if (day && ((md >= 426 && md <= 831) || (md >= 301 && md < 315))) extras.add('butterfly');
    return { phase, night, extras, dusk: hash(y * 7, doy) % 3 };
  }
  const moonAge = d => (((d - Date.UTC(2000, 0, 6, 18, 14)) / 864e5) % 29.530588 + 29.530588) % 29.530588;

  const PAL = {
    light: {
      dawn: ['#C5D3EE', '#D3DAF0', '#E6DCEB', '#F6E2E0', '#FBEBE1'],
      day: ['#BCDDF3', '#C9E4F6', '#D6EBF8', '#E2F0F9', '#EEF5FA'],
      dusk: [['#C2C3E8', '#D6C6E3', '#EECBD7', '#F9D6C9', '#FCE4D3'], ['#BFCBEA', '#D9CDE6', '#F2D0D2', '#FADBC4', '#FDE8D0'], ['#C9C0E4', '#DFC3DC', '#F3C9CC', '#F9D8C2', '#FCE7D6']],
      night: ['#C6CBE6', '#D0D4EA', '#DADDEF', '#E3E6F3', '#ECEEF7'],
    },
    dark: {
      dawn: ['#1B2036', '#262843', '#372F4E', '#4A3656', '#523B5A'],
      day: ['#1D2534', '#212A3A', '#252F40', '#293446', '#2D394B'],
      dusk: [['#1C1D38', '#2A2443', '#3D2B4B', '#4F3350', '#573752'], ['#1A2038', '#272845', '#3A2E4C', '#4C344F', '#553850'], ['#1E1B36', '#2D2242', '#40284A', '#52304D', '#5A344F']],
      night: ['#11152A', '#14192D', '#171C31', '#1A2035', '#1D2339'],
    },
  };
  const CLOUD = {
    light: { day: ['#FFFFFF', '#E3ECF4'], dawn: ['#FFF7F3', '#E7DDE9'], dusk: ['#FFEFEA', '#EBCDD5'], night: ['#F1F2FA', '#D8DBEA'] },
    dark: { day: ['#384257', '#2F384B'], dawn: ['#4E3F5C', '#43374F'], dusk: ['#5A4160', '#4A3753'], night: ['#22283D', '#1D2235'] },
  };

  const S = { P: 4, W: 0, H: 0, t: 0, dark: darkQ.matches, sky: readSky(clock()) };
  const scheme = () => S.dark ? 'dark' : 'light';
  const palette = () => { const p = PAL[scheme()][S.sky.phase]; return S.sky.phase === 'dusk' ? p[S.sky.dusk] : p; };

  const cv = document.createElement('canvas');
  cv.setAttribute('aria-hidden', 'true');
  cv.style.cssText = 'position:fixed;left:0;top:0;z-index:-1;pointer-events:none;image-rendering:pixelated;image-rendering:crisp-edges';
  document.body.prepend(cv);
  const g = cv.getContext('2d');
  const dot = (c, x, y, a = 1, w = 1, h = 1) => { c.globalAlpha = a; c.fillRect(Math.round(x), Math.round(y), w, h); };

  // the bands, drawn once per size and hour (seams dithered like the garden's sky)
  let skyCache = null;
  function buildSky() {
    const pal = palette(), c = document.createElement('canvas'); c.width = S.W; c.height = S.H;
    const k = c.getContext('2d'), bh = S.H / 5;
    pal.forEach((col, i) => { k.fillStyle = col; k.fillRect(0, Math.floor(i * bh), S.W, Math.ceil(bh) + 1); });
    for (let i = 1; i < 5; i++) {
      const y = Math.floor(i * bh); k.fillStyle = pal[i - 1];
      for (let x = 0; x < S.W; x += 2) { k.fillRect(x, y, 1, 1); k.fillRect(x + 1, y + 1, 1, 1); }
    }
    skyCache = c;
  }

  // ---- stars (always in the same places), the moon, a shooting star now and then
  const stars = [];
  { const r = rng(20261018); for (let i = 0; i < 160; i++) stars.push({ x: r(), y: r() * 0.72, a: 0.35 + r() * 0.55, sp: 0.6 + r() * 1.6, ph: r() * 6.3, big: r() < 0.09 }); }
  function drawStars() {
    const dusk = S.sky.phase === 'dusk';
    if (!S.dark || !(S.sky.night || dusk)) return;
    const n = Math.min(stars.length, Math.round(S.W * S.H / 900));
    g.fillStyle = '#FFF4DA';
    for (let i = 0; i < n; i++) {
      const s = stars[i];
      if (dusk && (!s.big || s.y > 0.3)) continue;
      const a = s.a * (0.55 + 0.45 * Math.sin(S.t * s.sp + s.ph)) * (dusk ? 0.5 : 1), x = s.x * S.W, y = s.y * S.H;
      dot(g, x, y, a);
      if (s.big) { dot(g, x - 1, y, a * 0.4); dot(g, x + 1, y, a * 0.4); dot(g, x, y - 1, a * 0.4); dot(g, x, y + 1, a * 0.4); }
    }
    g.globalAlpha = 1;
  }
  function drawMoon() {
    if (!S.sky.night) return;
    const k = moonAge(clock()) / 29.530588, th = 2 * Math.PI * k, r = S.W < 160 ? 3.5 : 4.5;
    const cx = Math.round(S.W * 0.84), cy = Math.round(S.H * 0.1) + 3;
    const lit = S.dark ? '#FFF1BF' : '#FFFDF2', dim = S.dark ? '#262C45' : '#BCC2DE';
    for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
      const nx = dx / r, ny = dy / r;
      if (nx * nx + ny * ny > 1.02) continue;
      const half = Math.sqrt(Math.max(0, 1 - ny * ny));
      const on = k < 0.5 ? nx >= Math.cos(th) * half : nx <= -Math.cos(th) * half;
      g.fillStyle = on ? lit : dim; dot(g, cx + dx, cy + dy, on ? 1 : 0.9);
    }
    g.globalAlpha = 1;
  }
  let meteor = null, meteorAt = 12 + R() * 25;
  function moveMeteor(dt) {
    if (!(S.dark && S.sky.night)) return;
    if (!meteor && (meteorAt -= dt) <= 0) { meteor = { x: S.W * (0.35 + R() * 0.6), y: S.H * R() * 0.25, life: 0 }; meteorAt = 18 + R() * 40; }
    if (meteor && (meteor.life += dt) > 0.7) meteor = null;
  }
  function drawMeteor() {
    if (!meteor) return;
    const p = meteor.life / 0.7, hx = meteor.x - p * 46, hy = meteor.y + p * 23;
    g.fillStyle = '#FFF8E6';
    for (let i = 0; i < 8; i++) dot(g, hx + i * 2, hy - i, (1 - i / 8) * (1 - p * p) * 0.9, i ? 2 : 1, 1);
    g.globalAlpha = 1;
  }

  // ---- clouds
  let clouds = [];
  function makeCloud(r, x) {
    // a few round puffs on a flat bottom, the middle one highest (the garden's clouds)
    const n = 2 + Math.floor(r() * 3), puffs = [];
    let cx = 0;
    for (let i = 0; i < n; i++) {
      const mid = 1 - Math.abs(i - (n - 1) / 2) / Math.max(1, (n - 1) / 2);
      const rr = 2.5 + mid * 2 + r() * 1.5;
      cx += i ? rr * 1.1 + puffs[i - 1].r * 0.5 : rr;
      puffs.push({ x: cx, r: rr });
    }
    const w = Math.ceil(cx + puffs[n - 1].r) + 1, top = Math.max(...puffs.map(p => p.r)) * 1.35, h = Math.ceil(top) + 2;
    const cells = [];
    for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) {
      const yy = h - 1 - y;   // from the bottom
      let on = yy < 2 && xx > 1 && xx < w - 2;
      for (const p of puffs) { const dx = xx + 0.5 - p.x, dy = y + 0.5 - (h - p.r * 0.95); if (dx * dx + dy * dy <= p.r * p.r) on = true; }
      if (on) cells.push([xx, yy]);
    }
    return { x, y: 0.05 + r() * 0.42, sp: 0.18 + r() * 0.3, w, h, cells, img: null };
  }
  function paintCloud(c) {
    const [lit, shade] = CLOUD[scheme()][S.sky.phase], k = document.createElement('canvas');
    k.width = c.w; k.height = c.h; const q = k.getContext('2d');
    for (const [x, y] of c.cells) { q.fillStyle = y === 0 ? shade : lit; q.fillRect(x, c.h - 1 - y, 1, 1); }
    c.img = k;
  }
  function seedClouds() {
    const r = rng(7 + clock().getDate()), n = Math.max(3, Math.round(S.W / 90));
    clouds = Array.from({ length: n }, (_, i) => makeCloud(r, (i + r() * 0.6) / n * (S.W + 40) - 20));
    clouds.forEach(paintCloud);
  }
  function drawClouds(dt) {
    const a = S.dark ? 0.9 : 0.92;
    for (const c of clouds) {
      c.x += c.sp * dt; if (c.x > S.W + 2) { c.x = -c.w - 2; c.y = 0.05 + R() * 0.42; }
      g.globalAlpha = a; g.drawImage(c.img, Math.round(c.x), Math.round(c.y * S.H));
    }
    g.globalAlpha = 1;
  }

  // ---- what the season brings
  let parts = [], butterfly = null, butterflyAt = 6 + R() * 14;
  function newPart(kind, anywhere) {
    const y = anywhere ? R() * S.H : -3, x = anywhere ? R() * S.W : R() * S.W * 1.3 - S.W * 0.3;
    switch (kind) {
      case 'petals': return { kind, x, y, vx: 2 + R() * 3, vy: 3 + R() * 3, ph: R() * 6.3, c: R() < 0.5 ? ['#F9C6D3', '#F4A9BE'] : ['#FBD5DF', '#F2B3C6'] };
      case 'leaves': return { kind, x, y, vx: 2 + R() * 4, vy: 5 + R() * 4, ph: R() * 6.3, c: [['#E8833A', '#B85E26'], ['#D9534F', '#A63D3A'], ['#E8B84A', '#B88A2E']][Math.floor(R() * 3)] };
      case 'snow': return { kind, x, y, vx: 0, vy: 3.5 + R() * 5, ph: R() * 6.3, s: R() < 0.3 ? 2 : 1 };
      case 'fireflies': return { kind, x: R() * S.W, y: S.H * (0.55 + R() * 0.4), tx: R() * S.W, ty: S.H * (0.55 + R() * 0.4), ph: R() * 6.3, per: 2.2 + R() * 2 };
      case 'dragonflies': return { kind, x: R() * S.W, y: S.H * (0.3 + R() * 0.35), hover: 1 + R() * 1.5, dash: 0, vx: 0, vy: 0, dir: 1 };
    }
  }
  function seedParts() {
    parts = [];
    const area = S.W * S.H, count = { petals: Math.min(14, area / 2600), leaves: Math.min(10, area / 3600), snow: Math.min(34, area / 1100), fireflies: 7, dragonflies: 2 };
    for (const k of S.sky.extras) if (count[k]) for (let i = 0; i < Math.round(count[k]); i++) parts.push(newPart(k, true));
  }
  function stepParts(dt) {
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (p.kind === 'fireflies') {
        const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy);
        if (d < 1) { p.tx = Math.min(S.W, Math.max(0, p.x + (R() - 0.5) * 40)); p.ty = Math.min(S.H * 0.97, Math.max(S.H * 0.5, p.y + (R() - 0.5) * 24)); }
        else { p.x += dx / d * 2.2 * dt; p.y += dy / d * 2.2 * dt; }
        continue;
      }
      if (p.kind === 'dragonflies') {
        if (p.dash > 0) { p.x += p.vx * dt; p.y += p.vy * dt; if ((p.dash -= dt) <= 0) p.hover = 0.8 + R() * 2; }
        else if ((p.hover -= dt) <= 0) {
          const a = R() * 6.3, sp = 90 + R() * 70; p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp * 0.5; p.dash = 0.22 + R() * 0.15;
          if (p.x < S.W * 0.1) p.vx = Math.abs(p.vx); if (p.x > S.W * 0.9) p.vx = -Math.abs(p.vx);
          if (p.y < S.H * 0.25) p.vy = Math.abs(p.vy); if (p.y > S.H * 0.7) p.vy = -Math.abs(p.vy);
          p.dir = p.vx >= 0 ? 1 : -1;
        }
        continue;
      }
      const sway = p.kind === 'snow' ? 4 : p.kind === 'leaves' ? 5 : 3;
      p.x += (p.vx + Math.sin(S.t * (p.kind === 'snow' ? 0.8 : 1.3) + p.ph) * sway) * dt; p.y += p.vy * dt;
      if (p.y > S.H + 3 || p.x > S.W + 3) parts[i] = newPart(p.kind, false);
    }
  }
  function drawParts() {
    for (const p of parts) {
      if (p.kind === 'petals') {
        const f = Math.floor(S.t * 3 + p.ph) % 2; g.fillStyle = p.c[f];
        f ? dot(g, p.x, p.y, 0.95, 1, 2) : dot(g, p.x, p.y, 0.95, 2, 1);
      } else if (p.kind === 'leaves') {
        const f = Math.floor(S.t * 2.5 + p.ph) % 2, x = Math.round(p.x), y = Math.round(p.y);
        g.fillStyle = p.c[0];
        if (f) { dot(g, x + 1, y, 1, 2, 1); dot(g, x + 1, y + 1, 1); } else { dot(g, x, y, 1, 2, 1); dot(g, x + 1, y + 1, 1); }
        g.fillStyle = p.c[1]; dot(g, f ? x : x + 2, y + 1, 1);
      } else if (p.kind === 'snow') {
        if (!S.dark) { g.fillStyle = '#B8C7D8'; dot(g, p.x, p.y + 1, 0.6, p.s, 1); }
        g.fillStyle = '#FFFFFF'; dot(g, p.x, p.y, 0.95, p.s, p.s);
      } else if (p.kind === 'fireflies') {
        const b = Math.pow(Math.max(0, Math.sin(2 * Math.PI * S.t / p.per + p.ph)), 2);
        if (b < 0.02) continue;
        g.fillStyle = S.dark ? '#DFFF80' : '#E3F08C'; dot(g, p.x - 1, p.y - 1, b * (S.dark ? 0.22 : 0.45), 3, 3);
        g.fillStyle = S.dark ? '#F8FFC0' : '#A9C42E'; dot(g, p.x, p.y, b);
      } else if (p.kind === 'dragonflies') {
        const x = Math.round(p.x), y = Math.round(p.y), d = p.dir;
        g.fillStyle = '#D8432F'; for (let i = 0; i < 4; i++) dot(g, x - d * i, y, 1);
        g.fillStyle = '#9E2B1E'; dot(g, x + d, y, 1);
        if (Math.floor(S.t * 20) % 2 === 0) { g.fillStyle = S.dark ? '#E6ECF7' : '#FFFFFF'; dot(g, x - d * 2, y - 1, 0.6, 2, 1); dot(g, x - d * 2, y + 1, 0.6, 2, 1); }
      }
    }
    g.globalAlpha = 1;
  }
  function stepButterfly(dt) {
    if (!S.sky.extras.has('butterfly')) { butterfly = null; return; }
    if (!butterfly && (butterflyAt -= dt) <= 0) { const d = R() < 0.5 ? 1 : -1; butterfly = { x: d > 0 ? -6 : S.W + 6, y: S.H * (0.3 + R() * 0.4), d, ph: R() * 6.3 }; }
    if (butterfly) {
      butterfly.x += butterfly.d * 9 * dt;
      if (butterfly.x < -8 || butterfly.x > S.W + 8) { butterfly = null; butterflyAt = 22 + R() * 30; }
    }
  }
  function drawButterfly() {
    if (!butterfly) return;
    const b = butterfly, x = Math.round(b.x), y = Math.round(b.y + Math.sin(S.t * 2.2 + b.ph) * 4), open = Math.floor(S.t * 6) % 2 === 0;
    g.fillStyle = S.dark ? '#D987A2' : '#F49AB6';
    const wing = open ? [[-2, 0], [-1, 0], [1, 0], [2, 0], [-2, 1], [-1, 1], [1, 1], [2, 1], [-1, 2], [1, 2]] : [[-1, 0], [1, 0], [-1, 1], [1, 1]];
    for (const [dx, dy] of wing) dot(g, x + dx, y + dy, 1);
    g.fillStyle = '#6B4A5E'; dot(g, x, y, 1, 1, 3);
    g.globalAlpha = 1;
  }
  function drawKite() {
    if (!S.sky.extras.has('kite')) return;
    const x = Math.round(S.W * 0.16 + Math.sin(S.t * 0.5) * 2), y = Math.round(S.H * 0.16 + Math.sin(S.t * 0.8) * 1.5);
    g.fillStyle = S.dark ? '#B04848' : '#E0504E';
    for (let dy = -3; dy <= 3; dy++) { const w = 3 - Math.abs(dy); dot(g, x - w, y + dy, 1, w * 2 + 1, 1); }
    g.fillStyle = '#FFF4E0'; dot(g, x, y - 1, 1, 1, 3); dot(g, x - 1, y, 1, 3, 1);
    g.fillStyle = S.dark ? '#8C95B4' : '#7E86A8';
    for (let i = 1; i < 8; i++) dot(g, x + Math.round(Math.sin(S.t * 3 + i * 0.9) * 1.2), y + 3 + i, 0.8);
    for (let i = 1; i < 60; i++) dot(g, x - i * 0.55, y + 3 + i, 0.18);
    g.globalAlpha = 1;
  }

  // ---- the lawn and the two who live there
  const lawn = { host: document.querySelector('.lawn'), c: null, k: null, W: 0, H: 40, ground: 28, base: null, flowers: [], pets: [], img: null, hearts: [], zs: [] };
  if (lawn.host) {
    lawn.c = document.createElement('canvas'); lawn.c.setAttribute('aria-hidden', 'true');
    lawn.c.style.cssText = 'display:block;image-rendering:pixelated;image-rendering:crisp-edges';
    lawn.host.append(lawn.c); lawn.k = lawn.c.getContext('2d');
    if (petsSrc) { const im = new Image(); im.onload = () => { lawn.img = im; draw(0); }; im.onerror = () => { lawn.pets = []; lawn.gone = true; buildLawn(); draw(0); }; im.src = petsSrc; }
    const hit = e => {
      const r = lawn.c.getBoundingClientRect(), x = (e.clientX - r.left) / S.P, y = (e.clientY - r.top) / S.P;
      for (const p of lawn.pets) if (x >= p.x + 6 && x <= p.x + 34 && y >= 4 && y <= lawn.ground + 4) glad(p);
    };
    lawn.c.addEventListener('pointermove', hit); lawn.c.addEventListener('pointerdown', hit);
  }
  function glad(p) {
    if (S.sky.night || still) return;   // asleep: let them be (and nothing moves under reduced motion)
    const first = p.happy <= S.t;
    p.happy = S.t + 1.4;
    if (first || S.t - p.heartAt > 0.7) { p.heartAt = S.t; lawn.hearts.push({ x: p.x + 20, y: 6, life: 0 }); }
  }
  function buildLawn() {
    if (!lawn.c) return;
    const w = Math.ceil(lawn.host.clientWidth / S.P); lawn.W = w;
    lawn.c.width = w; lawn.c.height = lawn.H; lawn.c.style.width = w * S.P + 'px'; lawn.c.style.height = lawn.H * S.P + 'px';
    lawn.host.style.height = lawn.H * S.P + 'px';
    const dk = S.dark, tip = dk ? '#4D6E46' : '#B6E07E', body = dk ? '#3E5A3C' : '#9CD268', speck = dk ? '#354E35' : '#88C15A';
    const b = document.createElement('canvas'); b.width = w; b.height = lawn.H; const q = b.getContext('2d');
    q.fillStyle = body; q.fillRect(0, lawn.ground + 1, w, lawn.H);
    for (let x = 0; x < w; x++) {
      const t = hash(x, 3) % 7 < 2 ? 2 : hash(x, 5) % 3 ? 1 : 0;
      q.fillStyle = body; q.fillRect(x, lawn.ground + 1 - t, 1, t);
      q.fillStyle = tip; q.fillRect(x, lawn.ground + 1 - t, 1, 1);
      for (let y = lawn.ground + 2; y < lawn.H; y++) if (hash(x * 31 + y, 11) % 13 === 0) { q.fillStyle = speck; q.fillRect(x, y, 1, 1); }
    }
    lawn.base = b;
    const P = lawn.pets;
    lawn.pets = lawn.gone ? [] : [{ x: Math.round(w * 0.3) - 20, cell: 0 }, { x: Math.round(w * 0.7) - 20, cell: 5 }].map((p, i) => Object.assign({ blink: 0, nextBlink: S.t + 1 + R() * 4, wag: 0, nextWag: S.t + 3 + R() * 6 + i * 3, happy: 0, heartAt: -9, nextZ: S.t + i * 1.3 }, P[i] || {}, p));
    const fl = dk ? [['#CFCADC', '#C9AE52'], ['#B9839A', '#C9B36A'], ['#C9AE52', '#A88433'], ['#9F92C2', '#C9B36A']]
                  : [['#FFFFFF', '#FFD45C'], ['#F7A8C0', '#FFE38A'], ['#FFD45C', '#E8A33A'], ['#C9B8F0', '#FFE38A']];
    lawn.flowers = [];
    for (let x = 3 + hash(w, 1) % 6; x < w - 2; x += 7 + hash(x, 9) % 9) {
      if (lawn.pets.some(p => x > p.x + 4 && x < p.x + 36)) continue;
      lawn.flowers.push({ x, y: lawn.ground + 3 + hash(x, 13) % 7, c: fl[hash(x, 17) % fl.length] });
    }
  }
  function drawLawn(dt) {
    if (!lawn.c || !lawn.base) return;
    const q = lawn.k, night = S.sky.night;
    q.clearRect(0, 0, lawn.W, lawn.H); q.drawImage(lawn.base, 0, 0);
    for (const f of lawn.flowers) {
      const s = Math.sin(S.t * 1.1 + f.x * 0.27) > 0.65 ? 1 : 0;
      q.fillStyle = S.dark ? '#2F4A30' : '#6FAE4A'; q.fillRect(f.x, f.y + 1, 1, 2);
      q.fillStyle = f.c[0]; q.fillRect(f.x - 1 + s, f.y, 1, 1); q.fillRect(f.x + 1 + s, f.y, 1, 1); q.fillRect(f.x + s, f.y - 1, 1, 1);
      q.fillStyle = f.c[1]; q.fillRect(f.x + s, f.y, 1, 1);
    }
    for (const p of lawn.pets) {
      if (!lawn.img) break;   // the picture hasn't come (yet): no shadows or z's for nobody
      if (!still) {
        if (S.t >= p.nextBlink) { p.blink = S.t + 0.14; p.nextBlink = S.t + 2.5 + R() * 4; }
        if (S.t >= p.nextWag) { p.wag = S.t + 1.4; p.nextWag = S.t + 7 + R() * 9; }
      }
      const feet = lawn.ground + 4, top = feet - 31;
      q.fillStyle = S.dark ? 'rgba(0,0,0,.25)' : 'rgba(40,70,30,.16)';
      q.fillRect(p.x + 11, feet, 18, 1); q.fillRect(p.x + 14, feet + 1, 12, 1);
      let f = 0;
      if (night) f = 4; else if (p.happy > S.t) f = 3; else if (p.blink > S.t) f = 2; else if (p.wag > S.t) f = Math.floor(S.t * 6.5) % 2;
      if (lawn.img) {
        if (S.dark || night) q.filter = S.dark ? 'brightness(.82) saturate(.9)' : 'none';
        q.drawImage(lawn.img, (p.cell + f) * 40, 0, 40, 32, p.x, top, 40, 32);
        q.filter = 'none';
      }
      if (night && !still && S.t >= p.nextZ) { p.nextZ = S.t + 2.6; lawn.zs.push({ x: p.x + (p.cell ? 30 : 29), y: top + 12, life: 0 }); }
    }
    for (const h of lawn.hearts) {
      h.life += dt; const a = Math.max(0, 1 - h.life / 1.3), x = Math.round(h.x), y = Math.round(h.y - h.life * 7);
      q.globalAlpha = a; q.fillStyle = '#F0607E';
      for (const [dx, dy] of [[1, 0], [3, 0], [0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [1, 2], [2, 2], [3, 2], [2, 3]]) q.fillRect(x - 2 + dx, y + dy, 1, 1);
      q.fillStyle = '#FFC2D0'; q.fillRect(x - 1, y + 1, 1, 1);
    }
    lawn.hearts = lawn.hearts.filter(h => h.life < 1.3);
    q.fillStyle = S.dark ? '#C3C9E6' : '#8E97BD';
    for (const z of lawn.zs) {
      z.life += dt; const a = Math.min(1, z.life * 2) * Math.max(0, 1 - z.life / 2.6), x = Math.round(z.x + z.life * 2), y = Math.round(z.y - z.life * 4);
      q.globalAlpha = a * 0.9;
      q.fillRect(x, y, 4, 1); q.fillRect(x + 2, y + 1, 1, 1); q.fillRect(x + 1, y + 2, 1, 1); q.fillRect(x, y + 3, 4, 1);
    }
    lawn.zs = lawn.zs.filter(z => z.life < 2.6);
    q.globalAlpha = 1;
  }

  // ---- size, time, loop
  function resize() {
    S.P = innerWidth < 520 ? 3 : 4;
    // the tallest the window gets (a phone's toolbar going away should not uncover the page under the sky); on a
    // desktop outerHeight includes the browser's own chrome, so it only counts on narrow screens, and never by much
    const tall = innerWidth < 820 ? Math.min(outerHeight || 0, innerHeight * 1.15) : 0;
    S.W = Math.ceil(innerWidth / S.P); S.H = Math.ceil(Math.max(innerHeight, tall, document.documentElement.clientHeight) / S.P);
    cv.width = S.W; cv.height = S.H; cv.style.width = S.W * S.P + 'px'; cv.style.height = S.H * S.P + 'px';
    buildSky(); if (!clouds.length) seedClouds(); else clouds.forEach(paintCloud);
    if (!parts.length) seedParts();
    buildLawn(); draw(0);
  }
  function retime() {
    const s = readSky(clock());
    const changed = s.phase !== S.sky.phase || [...s.extras].join() !== [...S.sky.extras].join();
    S.sky = s;
    if (changed) { buildSky(); clouds.forEach(paintCloud); seedParts(); buildLawn(); draw(0); }
  }
  function draw(dt) {
    g.globalAlpha = 1; g.drawImage(skyCache, 0, 0);
    drawStars(); drawMoon(); drawMeteor(); drawClouds(dt); drawKite(); drawParts(); drawButterfly();
    drawLawn(dt);
  }
  let last = performance.now(), acc = 0;
  function loop(ts) {
    const dt = Math.min(0.25, (ts - last) / 1000); last = ts; acc += dt;
    if (acc >= 1 / 15) { S.t += acc; stepParts(acc); stepButterfly(acc); moveMeteor(acc); draw(acc); acc = 0; }
    requestAnimationFrame(loop);
  }
  let rt = 0;
  addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(resize, 120); });
  resize();
  const onScheme = e => { S.dark = e.matches; buildSky(); clouds.forEach(paintCloud); buildLawn(); draw(0); };
  if (darkQ.addEventListener) darkQ.addEventListener('change', onScheme); else if (darkQ.addListener) darkQ.addListener(onScheme);
  if (!still) { setInterval(retime, 60000); requestAnimationFrame(t => { last = t; requestAnimationFrame(loop); }); }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { retime(); last = performance.now(); } });
})();
