/* Pikomofu: うちの子メーカー (https://pikomofu.com/maker and /<lang>/maker, built by Tools/site/build.py --maker).
   Pick a dog or a cat, its breed, coat and accessory, and a name: the pet sits in the app's garden in the app's own pixels
   (maker-data/pets-*.png, drawn by the app's SpriteEngine: Tools/site/maker/atlas.swift), blinks, wags and is glad when
   touched (reduced motion: one still picture). できた！ gives two pictures to keep and share: 1200 × 630 (10 × the garden)
   and 1080 × 1080 (12 ×), every dot a whole square, the name on a tag and no link in the picture. A playdate link
   (VisitLink v1, docs/visit-link-v1.md) is made here too, byte for byte the one the app makes for the same pet with the QR
   code's frames (sit, blink): a friend with Pikomofu gets a visit, anyone else meets the pet on /v.
   Everything happens on this device: the page's words and pictures come with it, nothing is sent anywhere, and the name
   is only ever drawn or set as text. window.PikoMaker is the page's own hook for the checks (Tools/site/maker/*.mjs). */
(() => {
  'use strict';
  const D = JSON.parse(document.getElementById('maker-data').textContent);
  const A = D.atlas, W = D.w, G = A.garden, SQ = G.square, CW = A.cell[0], CH = A.cell[1];
  const KINDS = ['collar', 'ribbon', 'bandana'], ACC_CODE = { none: 0, collar: 1, ribbon: 2, bandana: 3 };
  const NACC = A.accessories.length;
  const PET_X = 60;                                  // the pet's cell's left edge in the garden (right of the house, as in the app)
  const HEART = ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'];
  const $ = id => document.getElementById(id);
  const fill = (s, v) => String(s || '').replace(/\{(\w+)\}/g, (m, k) => v[k] != null ? String(v[k]) : '');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ua = navigator.userAgent || '';
  const android = /Android/i.test(ua);
  const ios = !android && (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1));
  const phone = android || ios || matchMedia('(pointer: coarse)').matches;

  // ---- the name, as the app keeps it (VisitLink.trimmedName): no controls, bidi overrides or zero-width characters
  //      (a ZWJ inside an emoji stays), no spaces at the ends, 8 characters (grapheme clusters), 48 bytes at most
  const seg = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
  const graphemes = s => seg ? Array.from(seg.segment(s), x => x.segment) : Array.from(s);
  const utf8 = s => new TextEncoder().encode(s);
  function cleanName(s) {
    s = String(s || '').replace(/\p{Cc}/gu, '').replace(/[​‌‎‏‪-‮⁦-⁩﻿]/g, '').trim();
    const g = graphemes(s).slice(0, 8);
    while (g.length && utf8(g.join('')).length > 48) g.pop();
    return g.join('');
  }

  // ---- what you pick (the first look: the official pair's, today's season and hour)
  const now = new Date(), hr = now.getHours(), mo = now.getMonth() + 1;
  const S = {
    species: 'dog', breed: 'shiba', coat: 0, acc: 'collar', color: 0, name: D.names.dog,
    hour: hr >= 5 && hr < 16 ? 'day' : hr >= 16 && hr < 18 ? 'dusk' : 'night',
    season: [3, 4, 5].includes(mo) ? 'spring' : [6, 7, 8].includes(mo) ? 'summer' : [9, 10, 11].includes(mo) ? 'autumn' : 'winter',
  };
  const lastName = { dog: D.names.dog, cat: D.names.cat };
  const breedOf = id => A.breeds.find(b => b.id === id);
  const accIndex = s => s.acc === 'none' ? 0 : 1 + KINDS.indexOf(s.acc) * 4 + s.color;

  // ---- pictures
  const load = src => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });
  const sheets = {};
  const sheet = id => sheets[id] || (sheets[id] = load(`${D.dir}pets-${id}.png`).catch(e => { delete sheets[id]; throw e; }));
  let garden, gardenSq, logo, logoNight, started = null;

  // one frame of the pet, its colours snapped to the breed's own (a browser that colour-manages a PNG is put right)
  const cells = new Map();
  async function cell(s, frame) {
    const key = `${s.breed}|${s.coat}|${accIndex(s)}|${frame}`;
    if (cells.has(key)) return cells.get(key);
    const img = await sheet(s.breed), b = breedOf(s.breed);
    const c = document.createElement('canvas'); c.width = CW; c.height = CH;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, A.frames.indexOf(frame) * CW, (s.coat * NACC + accIndex(s)) * CH, CW, CH, 0, 0, CW, CH);
    const d = x.getImageData(0, 0, CW, CH), p = d.data;
    const pal = b.pal || (b.pal = b.palette.map(h => [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16))));
    const exact = b.exact || (b.exact = new Map(pal.map((c, i) => [c[0] << 16 | c[1] << 8 | c[2], i])));
    let top = CH;
    for (let i = 0; i < p.length; i += 4) {
      if (p[i + 3] < 128) { p[i] = p[i + 1] = p[i + 2] = p[i + 3] = 0; continue; }
      top = Math.min(top, (i >> 2) / CW | 0);
      p[i + 3] = 255;
      if (exact.has(p[i] << 16 | p[i + 1] << 8 | p[i + 2])) continue;
      let best = 0, bd = 1e9;
      pal.forEach((q, k) => { const dd = (q[0] - p[i]) ** 2 + (q[1] - p[i + 1]) ** 2 + (q[2] - p[i + 2]) ** 2; if (dd < bd) { bd = dd; best = k; } });
      [p[i], p[i + 1], p[i + 2]] = pal[best];
    }
    x.putImageData(d, 0, 0);
    // the frame's own size (atlas.swift checks this for every cell): 32 wide, max(32, its solid rows) tall
    const out = { data: d, top, h: Math.max(32, CH - top) };
    cells.set(key, out);
    return out;
  }
  // the pet in the hour's light (the app tints a portrait the same way), as a little canvas
  const lit = new Map();
  async function petCanvas(s, frame) {
    const key = `${s.breed}|${s.coat}|${accIndex(s)}|${frame}|${s.hour}`;
    if (lit.has(key)) return lit.get(key);
    const f = await cell(s, frame), t = G.tint[s.hour];
    const d = new ImageData(new Uint8ClampedArray(f.data.data), CW, CH), p = d.data;
    if (t) {
      const tc = [0, 2, 4].map(i => parseInt(t[0].slice(i, i + 2), 16));
      for (let i = 0; i < p.length; i += 4) if (p[i + 3]) for (let k = 0; k < 3; k++) p[i + k] = Math.round(p[i + k] + (tc[k] - p[i + k]) * t[1]);
    }
    const c = document.createElement('canvas'); c.width = CW; c.height = CH;
    c.getContext('2d').putImageData(d, 0, 0);
    const out = { c, top: f.top };
    lit.set(key, out);
    return out;
  }

  // ---- the name's pixel font: the one for its script, at a whole multiple of the font's grid (DotGothic16 is 16 dots
  //      to the em, Fusion Pixel 12); the other faces follow for letters it hasn't got
  function nameFont(name) {
    const zh = D.lang === 'zh-Hant' ? '"Piko ZhHant"' : '"Piko ZhHans"';
    let first = '"Piko Dot"', grid = 16;
    if (/[ㄱ-ㆎ가-힣]/.test(name)) { first = '"Piko KO"'; grid = 12; }
    else if (/[Ѐ-ӿ]/.test(name)) { first = '"Piko RU"'; grid = 12; }
    else if (D.lang.startsWith('zh') && /[一-鿿]/.test(name) && !/[぀-ヿ]/.test(name)) { first = zh; grid = 12; }
    const stack = [...new Set([first, '"Piko Dot"', '"Piko KO"', zh, '"Piko RU"'])].join(', ') + ', sans-serif';
    return { stack, grid };
  }
  // the name drawn at the font's own size (one dot a pixel), its edges made hard (a canvas smooths even a pixel font),
  // cut to what is drawn: scaled up by a whole number it stays a pixel font
  const bitmaps = new Map();
  function nameBitmap(name, f) {
    const key = f.stack + '|' + name;
    if (bitmaps.has(key)) return bitmaps.get(key);
    const c = document.createElement('canvas'), x = c.getContext('2d', { willReadFrequently: true }), size = f.grid;
    x.font = `${size}px ${f.stack}`;
    const m = x.measureText(name), asc = Math.ceil(m.fontBoundingBoxAscent || size), desc = Math.ceil(m.fontBoundingBoxDescent || size / 3);
    c.width = Math.ceil(m.width) + 4; c.height = asc + desc + 2;
    x.font = `${size}px ${f.stack}`; x.textBaseline = 'alphabetic'; x.fillStyle = '#3A2F45';
    x.fillText(name, 2, asc + 1);
    const d = x.getImageData(0, 0, c.width, c.height), p = d.data;
    let x0 = c.width, x1 = -1, y0 = c.height, y1 = -1;
    for (let i = 0; i < p.length; i += 4) {
      if (p[i + 3] >= 128) { p[i + 3] = 255; const q = i >> 2, xx = q % c.width, yy = q / c.width | 0; x0 = Math.min(x0, xx); x1 = Math.max(x1, xx); y0 = Math.min(y0, yy); y1 = Math.max(y1, yy); }
      else p[i] = p[i + 1] = p[i + 2] = p[i + 3] = 0;
    }
    if (x1 < 0) { x0 = y0 = 0; x1 = y1 = 0; }
    const o = document.createElement('canvas'); o.width = x1 - x0 + 1; o.height = y1 - y0 + 1;
    o.getContext('2d').putImageData(d, -x0, -y0);
    const out = { c: o, w: o.width, h: o.height };
    if (bitmaps.size > 60) bitmaps.clear();
    bitmaps.set(key, out);
    return out;
  }
  const fontsFor = (name, px) => document.fonts ? document.fonts.load(`${px}px ${nameFont(name).stack}`, name || 'あ').catch(() => {}) : Promise.resolve();

  // ---- one picture. kind: 'wide' (the garden 120 × 63) or 'square' (90 × 90); k: canvas pixels a dot.
  //      out: the shared picture (fonts at whole multiples of their grid); otherwise the preview at the screen's own pixels
  async function draw(ctx, s, { kind = 'wide', k = 10, frame = 'sit', heart = null, out = false } = {}) {
    const sq = kind === 'square', gw = sq ? SQ.w : G.w, gh = sq ? SQ.h : G.h, ground = sq ? SQ.ground : G.ground;
    if (!(sq ? gardenSq : garden)) return;                     // (a choice made while the gardens are still on their way)
    const px = sq ? PET_X - SQ.x0 : PET_X;
    const b = breedOf(s.breed), pet = await petCanvas(s, frame);
    ctx.imageSmoothingEnabled = false;
    const hi = G.hours.indexOf(s.hour), row = G.seasons.indexOf(s.season) * 2 + (b.species === 'cat' ? 1 : 0);
    ctx.drawImage(sq ? gardenSq : garden, hi * gw, row * gh, gw, gh, 0, 0, gw * k, gh * k);
    const top = ground - CH;
    ctx.drawImage(pet.c, px * k, top * k, CW * k, CH * k);
    if (heart) {
      ctx.fillStyle = '#F2577B';
      const hx = px + 22, hy = top + pet.top - 6 - heart.rise;
      HEART.forEach((r, y) => [...r].forEach((ch, x) => { if (ch === '#') ctx.fillRect((hx + x) * k, (hy + y) * k, k, k); }));
    }
    const W0 = gw * k, name = cleanName(s.name);
    // the name tag over the pet's head: the app's key (white, an ink line, an ink ledge); the name in its pixel font,
    // one dot a whole square like the pet's (3 or 4 × the font's own size at 10 ×, 4 or 5 × at 12 ×)
    if (name) {
      const f = nameFont(name), t = nameBitmap(name, f);
      const sc = out ? (sq ? (f.grid === 16 ? 4 : 5) : (f.grid === 16 ? 3 : 4)) : Math.max(1, Math.round(k * (f.grid === 16 ? 0.3 : 0.4)));
      const u = sq ? k / 12 * 1.2 : k / 10;                                   // the tag's other sizes, in 1200-picture pixels
      const pad = Math.round(28 * u), hgt = Math.round((sq ? 104 / 1.2 : 80) * u), step = Math.round(6 * u), line = Math.max(1, Math.round(5 * u));
      const tw = t.w * sc, w = tw + pad * 2, cx = (px + CW / 2) * k;
      const y = Math.max(Math.round(28 * u), Math.round((top + pet.top) * k - hgt - 26 * u));
      const x0 = Math.round(Math.max(24 * u, Math.min(W0 - 24 * u - w, cx - w / 2)));
      const r = Math.round(20 * u);
      ctx.fillStyle = '#3A2F45'; rr(ctx, x0, y + step, w, hgt, r); ctx.fill();          // the ledge
      rr(ctx, x0, y, w, hgt, r); ctx.fill();                                             // the line
      ctx.fillStyle = '#FFFFFF'; rr(ctx, x0 + line, y + line, w - line * 2, hgt - line * 2, Math.max(1, r - line)); ctx.fill();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(t.c, x0 + pad, y + Math.round((hgt - t.h * sc) / 2), tw, t.h * sc);
    }
    // the logo, small, top right (white on the night sky); in the square under the cloud that drifts up there
    if (logo) {
      const lw = Math.round((sq ? 230 : 190) * k / (sq ? 12 : 10)), lh = Math.round(lw / D.logoRatio);
      const m = Math.round((sq ? 40 : 34) * k / (sq ? 12 : 10));
      ctx.globalAlpha = 0.92;
      ctx.drawImage(s.hour === 'night' ? logoNight : logo, W0 - lw - m, sq ? 9 * k : Math.round(m * 0.9), lw, lh);
      ctx.globalAlpha = 1;
    }
  }
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }

  async function picture(s, kind) {
    const name = cleanName(s.name), k = kind === 'square' ? 12 : 10;
    await fontsFor(name, kind === 'square' ? 64 : 48);
    for (const key of [...bitmaps.keys()]) if (key.endsWith('|' + name)) bitmaps.delete(key);   // drawn now with the font surely in
    const c = document.createElement('canvas');
    c.width = (kind === 'square' ? SQ.w : G.w) * k; c.height = (kind === 'square' ? SQ.h : G.h) * k;
    await draw(c.getContext('2d'), s, { kind, k, out: true });
    const blob = await new Promise(ok => c.toBlob(ok, 'image/png'));
    return { canvas: c, blob };
  }

  // ---- the preview: whole device pixels a dot, so every dot is square and sharp on every screen
  const scene = $('scene'), sctx = scene.getContext('2d');
  let K = 4;
  function fit() {
    const dpr = window.devicePixelRatio || 1, avail = scene.parentElement.clientWidth;
    K = Math.max(1, Math.floor(avail * dpr / G.w));
    if (scene.width !== G.w * K) { scene.width = G.w * K; scene.height = G.h * K; }
    scene.style.width = G.w * K / dpr + 'px'; scene.style.height = G.h * K / dpr + 'px';
  }
  let frame = 'sit', glad = 0, heartAt = 0, drawing = false, again = false;
  async function redraw() {
    if (drawing) { again = true; return; }
    drawing = true;
    try {
      const age = performance.now() - heartAt, s = { ...S };
      await draw(sctx, s, { k: K, frame: glad ? 'glad' : frame, heart: glad && age < 1200 ? { rise: reduce ? 0 : Math.min(4, Math.floor(age / 220)) } : null });
    } catch (e) { /* a sheet that didn't load: the next change tries again */ }
    finally { drawing = false; if (again) { again = false; redraw(); } }
  }
  // its own small life: blinks, now and then a wag; a touch makes it glad (reduced motion: only the touch)
  let next = performance.now() + 1800;
  function tick() {
    const t = performance.now();
    if (glad && t - heartAt > 1300) { glad = 0; redraw(); }
    else if (glad && !reduce) redraw();
    if (!glad && !reduce && t >= next && !document.hidden) {
      if (Math.random() < 0.65) { frame = 'blink'; redraw(); setTimeout(() => { frame = 'sit'; redraw(); }, 130); next = t + 2400 + Math.random() * 2600; }
      else { let n = 0; const wag = setInterval(() => { frame = n % 2 ? 'sit' : 'wag'; redraw(); if (++n >= 8) { clearInterval(wag); frame = 'sit'; redraw(); } }, 160); next = t + 3600 + Math.random() * 2000; }
    }
    setTimeout(tick, 110);
  }
  function touch() { glad = 1; heartAt = performance.now(); redraw(); }
  scene.addEventListener('pointerdown', e => {
    const r = scene.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * G.w, y = (e.clientY - r.top) / r.height * G.h;
    if (x > PET_X - 4 && x < PET_X + CW + 4 && y > G.ground - CH) touch();
  });
  scene.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); touch(); } });

  // ---- choices
  function chip(label, pressed, on, extra) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.setAttribute('aria-pressed', String(pressed));
    if (extra) b.append(extra);
    b.append(document.createTextNode(label)); b.addEventListener('click', on); return b;
  }
  function render() {
    $('species').replaceChildren(chip(D.dog, S.species === 'dog', () => pickSpecies('dog')), chip(D.cat, S.species === 'cat', () => pickSpecies('cat')));
    const list = A.breeds.filter(b => b.species === S.species);
    $('breeds').replaceChildren(...list.map(b => {
      const t = document.createElement('button'); t.type = 'button'; t.className = 'tile'; t.setAttribute('aria-pressed', String(b.id === S.breed));
      const f = document.createElement('span'); f.className = 'face'; f.setAttribute('aria-hidden', 'true');
      const i = A.breeds.indexOf(b);
      f.style.backgroundImage = `url(${D.dir}faces.png)`;
      f.style.backgroundSize = `${A.breeds.length * A.face[0] * 2}px ${A.face[1] * 2}px`;
      f.style.backgroundPosition = `-${i * A.face[0] * 2}px 0`;
      const n = document.createElement('span'); n.textContent = b.name;
      t.append(f, n); t.addEventListener('click', () => { S.breed = b.id; S.coat = 0; sheet(b.id).catch(() => {}); changed(); });
      return t;
    }));
    $('coats').replaceChildren(...breedOf(S.breed).coats.map((c, i) => {
      const sw = document.createElement('span'); sw.className = 'sw'; sw.style.background = `linear-gradient(135deg, #${c.swatch} 55%, #${c.sub} 55%)`;
      return chip(c.name, i === S.coat, () => { S.coat = i; changed(); }, sw);
    }));
    $('accs').replaceChildren(...['none', ...KINDS].map(k => chip(D.acc[k], S.acc === k, () => { S.acc = k; changed(); })));
    $('colors').replaceChildren(...A.accessoryColors.map((c, i) => {
      const d = document.createElement('button'); d.type = 'button'; d.className = 'paint'; d.style.background = `#${c.hex}`;
      d.setAttribute('aria-label', c.name); d.title = c.name; d.setAttribute('aria-pressed', String(S.acc !== 'none' && S.color === i));
      d.disabled = S.acc === 'none';
      d.addEventListener('click', () => { S.color = i; changed(); }); return d;
    }));
    $('hours').replaceChildren(...G.hours.map(h => chip(D.hours[h], S.hour === h, () => { S.hour = h; changed(); })));
    $('seasons').replaceChildren(...G.seasons.map(x => chip(D.seasons[x], S.season === x, () => { S.season = x; changed(); })));
    $('count').textContent = `${graphemes(S.name).length}/8`;
    const nm = cleanName(S.name) || W.noname;
    scene.setAttribute('aria-label', fill(W.alt, { name: nm }));
    if ($('visit-p')) $('visit-p').textContent = fill(W.visit_p, { name: nm });
  }
  function changed() { render(); redraw(); fontsFor(cleanName(S.name), 48).then(() => { bitmaps.clear(); redraw(); stale(); }); stale(); }
  function pickSpecies(sp) {
    if (sp === S.species) return;
    lastName[S.species] = S.name;
    Object.assign(S, sp === 'dog' ? { species: 'dog', breed: 'shiba', coat: 0, acc: 'collar', color: 0 } : { species: 'cat', breed: 'shiro', coat: 0, acc: 'ribbon', color: 1 });
    S.name = lastName[sp]; nameBox.value = S.name;
    sheet(S.breed).catch(() => {}); changed();
  }
  // the name: 8 characters, not cut while a word is being composed (IME)
  const nameBox = $('name');
  let composing = false;
  nameBox.addEventListener('compositionstart', () => { composing = true; });
  nameBox.addEventListener('compositionend', () => { composing = false; onName(); });
  nameBox.addEventListener('input', () => { if (!composing) onName(); });
  nameBox.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) nameBox.blur(); });
  function onName() {
    const g = graphemes(nameBox.value);
    if (g.length > 8) nameBox.value = g.slice(0, 8).join('');
    S.name = nameBox.value; changed();
  }

  // ---- the playdate link (VisitLink v1): the app's VisitLink.make(look, since:, roles: [.sit, .blink]) byte for byte
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  function b64url(b) {
    let s = '';
    for (let i = 0; i < b.length; i += 3) {
      const n = b[i] << 16 | (b[i + 1] || 0) << 8 | (b[i + 2] || 0), left = b.length - i;
      s += B64[n >> 18 & 63] + B64[n >> 12 & 63] + (left > 1 ? B64[n >> 6 & 63] : '') + (left > 2 ? B64[n & 63] : '');
    }
    return s;
  }
  let CRC = null;
  function crc32(b) {
    if (!CRC) { CRC = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c; } }
    let c = -1;
    for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  }
  async function linkFrames(s) {   // roles sit (0) and blink (2), as tall as the app draws them
    const out = [];
    for (const [role, f] of [[0, 'sit'], [2, 'blink']]) {
      const c = await cell(s, f), p = c.data.data;
      out.push({ role, w: CW, h: c.h, px: p.subarray((CH - c.h) * CW * 4) });
    }
    return out;
  }
  function body(s, days, frames) {
    const palette = [], index = new Map();
    const planes = frames.map(f => {
      const pl = new Uint8Array(f.w * f.h);
      for (let i = 0; i < pl.length; i++) {
        if (!f.px[i * 4 + 3]) continue;
        const key = f.px[i * 4] << 16 | f.px[i * 4 + 1] << 8 | f.px[i * 4 + 2];
        let k = index.get(key);
        if (!k) { palette.push(key); k = palette.length; index.set(key, k); }
        pl[i] = k;
      }
      return pl;
    });
    const b = [], cat = breedOf(s.breed).species === 'cat';
    b.push((cat ? 1 : 0) | 2 | 4, days & 0xFF, days >> 8 & 0xFF);
    const id = [...s.breed].map(ch => ch.charCodeAt(0)).slice(0, 16);
    b.push(id.length, ...id, Math.max(0, Math.min(255, s.coat)), ACC_CODE[s.acc] || 0);
    const hex = A.accessoryColors[s.color].hex;
    b.push(...[0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16)));
    b.push(5, 0, 2);   // Look().mix: floppy ears, curl tail, muzzle face (VisitLink's codes)
    const nm = utf8(cleanName(s.name));
    b.push(nm.length, ...nm, palette.length);
    for (const c of palette) b.push(c >> 16 & 0xFF, c >> 8 & 0xFF, c & 0xFF);
    b.push(frames.length);
    for (const f of frames) b.push(f.role, f.w, f.h);
    const head = Uint8Array.from(b), all = new Uint8Array(head.length + planes.reduce((n, p) => n + p.length, 0));
    all.set(head); let o = head.length;
    for (const p of planes) { all.set(p, o); o += p.length; }
    return all;
  }
  async function makeLink(s, days) {
    const raw = body(s, days, await linkFrames(s));
    for (let pad = 0; pad <= 3; pad++) {   // a link ending in '-' or '_' gets 1–3 zero bytes (a linkifier might leave it off)
      const bb = new Uint8Array(raw.length + pad); bb.set(raw);
      const z = PikoDeflate.deflateRaw(bb), c = crc32(bb);
      const d = new Uint8Array(6 + z.length); d.set([1, 1, c & 0xFF, c >>> 8 & 0xFF, c >>> 16 & 0xFF, c >>> 24 & 0xFF]); d.set(z, 6);
      const run = b64url(d);
      if (pad === 3 || !/[-_]$/.test(run)) return { url: 'https://pikomofu.com/v#' + run, run };
    }
  }
  // the day it came home: the day it was made here. A link that was sent keeps its day on this device, so the same pet
  // sent again another day is still the same friend in the app (its key is name, breed, coat and that day)
  const today = () => { const d = new Date(); return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5); };
  const sig = s => `${cleanName(s.name)}|${s.breed}|${s.coat}`;
  function days() { try { return JSON.parse(localStorage.getItem('pikomofu-maker-since') || '{}') || {}; } catch (e) { return {}; } }
  function since(s) { const d = days()[sig(s)]; return Number.isInteger(d) && d >= 20454 && d <= today() ? d : today(); }
  function keepDay(m) {
    if (!m || !m.link) return;
    const all = days(); all[sig(m.s)] = m.link.days;
    const keys = Object.keys(all); for (const k of keys.slice(0, Math.max(0, keys.length - 40))) delete all[k];
    try { localStorage.setItem('pikomofu-maker-since', JSON.stringify(all)); } catch (e) { /* a private window: today, each time */ }
  }
  // read back with /v's own reader before it is handed out: the same pet, name and pixels, or no link
  async function checked(s, link) {
    if (!window.PikoVisit) return link;
    const v = await PikoVisit.decode(link.run);
    const f = await linkFrames(s), mine = f[0].px, back = PikoVisit.rgba(v, v.frames.sit);
    const same = v.name === PikoVisit.cleanName(cleanName(s.name)) && v.look.breed === s.breed && v.look.coat === s.coat && v.frames.blink
      && back.length === mine.length && back.every((x, i) => x === mine[i]);
    if (!same) throw new Error('link check');
    return link;
  }

  // ---- できた！: the two pictures, then share, save and the playdate link
  let made = null, making = null, dirty = true;
  const urls = [];
  function stale() { dirty = true; if (!$('done').hidden) { clearTimeout(stale.t); stale.t = setTimeout(make, 300); } }
  async function make() {
    if (started) await started;
    if (making) { await making; if (!dirty) return made; }
    dirty = false;
    const s = { ...S };
    making = (async () => {
      const [wide, square] = await Promise.all([picture(s, 'wide'), picture(s, 'square')]);
      const name = cleanName(s.name) || W.noname;
      const file = (b, n) => new File([b], n, { type: 'image/png' });
      urls.splice(0).forEach(u => URL.revokeObjectURL(u));
      const u1 = URL.createObjectURL(wide.blob), u2 = URL.createObjectURL(square.blob); urls.push(u1, u2);
      $('out').src = u1; $('out').alt = fill(W.alt, { name });
      $('outsq').src = u2; $('outsq').alt = fill(W.alt, { name });
      made = { s, name, wide: file(wide.blob, 'pikomofu-uchinoko.png'), square: file(square.blob, 'pikomofu-uchinoko-square.png'), u1, u2, link: null };
      if ($('visit')) await visitLink(made);
      return made;
    })();
    try { return await making; } finally { making = null; }
  }
  // the pictures are remade a moment after each change, so a key finds them ready and the share sheet opens while the tap
  // still counts (Safari wants it then); only a key pressed within that moment waits for them
  const fresh = () => (!dirty && made && !making) ? made : make();
  const shareText = m => fill(W.share_text, { name: m.name });
  const canShareFile = f => { try { return !!(navigator.canShare && navigator.canShare({ files: [f] })); } catch (e) { return false; } };
  function download(url, name) { const a = document.createElement('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); }
  async function save(which) {
    const m = await fresh(); if (!m) return;
    const f = m[which], url = which === 'wide' ? m.u1 : m.u2;
    try {
      if (ios && canShareFile(f)) await navigator.share({ files: [f] });   // iPhone: the sheet's 画像を保存 puts it in Photos
      else download(url, f.name);
    } catch (e) { if (e && e.name !== 'AbortError') $('say').textContent = W.save_tip; }
  }
  $('make').addEventListener('click', async () => {
    $('done').hidden = false; if ($('visit')) $('visit').hidden = false;
    $('say').textContent = phone ? W.say_phone : W.say_desk;
    await make();
    // bring the pictures into view whenever they aren't (on a desktop they sit below the choices, out of sight)
    const r = $('done').getBoundingClientRect();
    if (r.top < 0 || r.top > innerHeight * 0.5) $('done').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  });
  $('save').addEventListener('click', () => save('wide'));
  $('savesq').addEventListener('click', () => save('square'));
  $('share').textContent = phone ? W.share : W.post;
  $('share').addEventListener('click', async () => {
    const m = await fresh(); if (!m) return;
    const text = shareText(m);
    if (phone && canShareFile(m.wide)) {
      try { await navigator.share({ files: [m.wide], text: `${text}\n${D.url}` }); return; }
      catch (e) { if (e && e.name === 'AbortError') return; }
    }
    window.open(`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(D.url)}`, '_blank', 'noopener');
  });

  async function visitLink(m) {
    const name = cleanName(m.s.name);
    const ok = !!name;
    for (const id of ['vsend', 'vcopy']) $(id).disabled = !ok;
    $('vopen').hidden = !ok;
    $('vsay').textContent = ok ? '' : W.visit_needname;
    if (!ok) { m.link = null; return; }
    try {
      const day = since(m.s);
      m.link = await checked(m.s, await makeLink(m.s, day)); m.link.days = day;
      $('vopen').href = D.v + '#' + m.link.run;
    } catch (e) {
      m.link = null; $('vopen').hidden = true; for (const id of ['vsend', 'vcopy']) $(id).disabled = true; $('vsay').textContent = W.error;
    }
  }
  if ($('visit')) {
    $('vsend').textContent = W.visit_send;
    $('vsend').addEventListener('click', async () => {
      const m = await fresh(); if (!m || !m.link) return;
      const text = fill(D.visitText, { name: m.name });
      keepDay(m);
      if (phone && navigator.share) {
        try { await navigator.share({ text, url: m.link.url }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
      }
      window.open(`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(m.link.url)}`, '_blank', 'noopener');
    });
    $('vopen').addEventListener('click', () => keepDay(made));
    $('vcopy').addEventListener('click', async () => {
      const m = await fresh(); if (!m || !m.link) return;
      keepDay(m);
      let ok = false;
      try { await navigator.clipboard.writeText(m.link.url); ok = true; } catch (e) {
        const t = document.createElement('textarea'); t.value = m.link.url; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
        document.body.append(t); t.select(); try { ok = document.execCommand('copy'); } catch (e2) { ok = false; } t.remove();
      }
      $('vsay').textContent = ok ? W.visit_copied : m.link.url;
    });
  }

  // ---- the page's own hook, for the checks in Tools/site/maker (the same code paths the keys use)
  window.PikoMaker = {
    set(o) { Object.assign(S, o); if (o.name != null) nameBox.value = S.name; changed(); },
    state: () => ({ ...S }),
    link: (o, days) => makeLink({ ...S, ...o }, days),
    frames: async o => (await linkFrames({ ...S, ...o })).map(f => ({ role: f.role, w: f.w, h: f.h, px: Array.from(f.px) })),
    picture: async (o, kind) => { const p = await picture({ ...S, ...o }, kind); return p.canvas.toDataURL('image/png'); },
    cleanName,
  };

  // ---- start (a key pressed before the gardens and the first breed are in waits for them: on a slow line the page
  //      is up before its pictures, 2026-11-03)
  started = (async () => {
    [garden, gardenSq] = await Promise.all([load(D.dir + 'garden.png'), load(D.dir + 'garden-sq.png')]);
    try { [logo, logoNight] = await Promise.all([load(D.logo), load(D.logoWhite)]); } catch (e) { logo = null; }
    nameBox.value = S.name;
    await sheet(S.breed);
    fit(); addEventListener('resize', () => { fit(); redraw(); });
    render(); await redraw();
    await fontsFor(S.name, 48); bitmaps.clear(); redraw();
    document.documentElement.classList.add('ready');
    tick();
  })();
  started.catch(() => {
    const p = document.createElement('p'); p.className = 'oops'; p.textContent = W.error;
    scene.replaceWith(p); $('make').disabled = true;
  });
})();
