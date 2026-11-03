/* Pikomofu: the visit link reader for https://pikomofu.com/v (format v1: docs/visit-link-v1.md; the app's writer and
   reader are Shared/VisitLink.swift). The fragment (everything after #) never leaves the device: this file reads it in the
   browser and fetches nothing. Works as a classic <script> (window.PikoVisit) and in Node (require), which is how
   Tools/visits/check-web.cjs checks it against the app's own links.
   Errors carry e.code: empty, base64, version, method (a newer app), inflate, toolarge, checksum, format. */
(function (root) {
  'use strict';
  const MAX_BODY = 32768;            // decompressed body cap (a zip bomb stops here)
  const MAX_FRAMES = 12, MAX_SIDE = 64, MAX_PAL = 63, MAX_NAME_BYTES = 48;
  const ROLES = ['sit', 'wag', 'blink', 'lookLeft', 'lookRight', 'lookUp', 'petA', 'petB', 'sleep'];
  const ACCESSORIES = ['none', 'collar', 'ribbon', 'bandana'];

  function fail(code, msg) { const e = new Error(msg || code); e.code = code; e.piko = true; return e; }

  // ---- CRC-32 (IEEE, the zlib / PNG one) of the decompressed body
  let CRC = null;
  function crc32(b) {
    if (!CRC) { CRC = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c; } }
    let c = -1;
    for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  }

  // ---- base64url
  function fromB64url(s) {
    const t = s.replace(/-/g, '+').replace(/_/g, '/');
    if (t.length % 4 === 1) throw fail('base64');
    const bin = (typeof atob === 'function') ? atob(t + '='.repeat((4 - t.length % 4) % 4)) : Buffer.from(t, 'base64').toString('binary');
    const b = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
    return b;
  }

  // ---- raw DEFLATE (RFC 1951), for browsers without DecompressionStream('deflate-raw') (Safari < 16.4, Chrome < 103)
  const LBASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
  const LEXT = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
  const DBASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
  const DEXT = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
  const ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
  function huff(len, n) {
    const count = new Uint16Array(16), offs = new Uint16Array(16), symbol = new Uint16Array(n);
    for (let i = 0; i < n; i++) count[len[i]]++;
    for (let l = 1; l < 15; l++) offs[l + 1] = offs[l] + count[l];
    for (let s = 0; s < n; s++) if (len[s]) symbol[offs[len[s]]++] = s;
    return { count, symbol };
  }
  let FIXED = null;
  function inflateRaw(src, max) {
    const out = new Uint8Array(max);
    let pos = 0, bitbuf = 0, bitcnt = 0, o = 0;
    const bits = n => {
      while (bitcnt < n) { if (pos >= src.length) throw fail('inflate', 'unexpected end'); bitbuf |= src[pos++] << bitcnt; bitcnt += 8; }
      const v = bitbuf & ((1 << n) - 1); bitbuf >>>= n; bitcnt -= n; return v;
    };
    const decode = h => {
      let code = 0, first = 0, index = 0;
      for (let l = 1; l < 16; l++) {
        code |= bits(1);
        const c = h.count[l];
        if (code - c < first) return h.symbol[index + (code - first)];
        index += c; first = (first + c) << 1; code <<= 1;
      }
      throw fail('inflate', 'bad code');
    };
    const put = b => { if (o >= max) throw fail('toolarge'); out[o++] = b; };
    const codes = (lc, dc) => {
      for (;;) {
        let s = decode(lc);
        if (s < 256) put(s);
        else if (s === 256) return;
        else {
          s -= 257; if (s >= 29) throw fail('inflate', 'bad length');
          const len = LBASE[s] + bits(LEXT[s]);
          const ds = decode(dc); if (ds >= 30) throw fail('inflate', 'bad distance');
          const dist = DBASE[ds] + bits(DEXT[ds]);
          if (dist > o) throw fail('inflate', 'distance too far');
          for (let i = 0; i < len; i++) put(out[o - dist]);
        }
      }
    };
    let last;
    do {
      last = bits(1);
      const type = bits(2);
      if (type === 0) {
        bitbuf = 0; bitcnt = 0;
        if (pos + 4 > src.length) throw fail('inflate', 'unexpected end');
        const len = src[pos] | src[pos + 1] << 8, nlen = src[pos + 2] | src[pos + 3] << 8; pos += 4;
        if (len !== (~nlen & 0xFFFF) || pos + len > src.length) throw fail('inflate', 'bad stored block');
        for (let i = 0; i < len; i++) put(src[pos++]);
      } else if (type === 1) {
        if (!FIXED) {
          const l = new Uint8Array(288); l.fill(8, 0, 144); l.fill(9, 144, 256); l.fill(7, 256, 280); l.fill(8, 280, 288);
          FIXED = [huff(l, 288), huff(new Uint8Array(30).fill(5), 30)];
        }
        codes(FIXED[0], FIXED[1]);
      } else if (type === 2) {
        const nlen = bits(5) + 257, ndist = bits(5) + 1, ncode = bits(4) + 4;
        if (nlen > 286 || ndist > 30) throw fail('inflate', 'bad counts');
        const cl = new Uint8Array(19);
        for (let i = 0; i < ncode; i++) cl[ORDER[i]] = bits(3);
        const ch = huff(cl, 19), ll = new Uint8Array(nlen + ndist);
        for (let i = 0; i < nlen + ndist;) {
          const s = decode(ch);
          if (s < 16) { ll[i++] = s; continue; }
          let v = 0, rep;
          if (s === 16) { if (!i) throw fail('inflate', 'repeat with no length'); v = ll[i - 1]; rep = 3 + bits(2); }
          else if (s === 17) rep = 3 + bits(3);
          else rep = 11 + bits(7);
          if (i + rep > nlen + ndist) throw fail('inflate', 'too many lengths');
          while (rep--) ll[i++] = v;
        }
        codes(huff(ll.subarray(0, nlen), nlen), huff(ll.subarray(nlen), ndist));
      } else throw fail('inflate', 'bad block type');
    } while (!last);
    return out.slice(0, o);
  }

  // ---- DecompressionStream when there is one, the JS inflater when not
  async function inflate(bytes, opts) {
    if (!(opts && opts.forceJS) && typeof DecompressionStream === 'function') {
      let ds = null;
      try { ds = new DecompressionStream('deflate-raw'); } catch (e) { ds = null; }   // older engines: 'deflate-raw' unknown
      if (ds) {
        const reader = new Blob([bytes]).stream().pipeThrough(ds).getReader();
        const parts = []; let total = 0;
        try {
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            total += value.length;
            if (total > MAX_BODY) { reader.cancel().catch(() => {}); throw fail('toolarge'); }
            parts.push(value);
          }
        } catch (e) { throw e.piko ? e : fail('inflate', String(e && e.message || e)); }
        const out = new Uint8Array(total); let o = 0;
        for (const p of parts) { out.set(p, o); o += p.length; }
        return out;
      }
    }
    return inflateRaw(bytes, MAX_BODY);
  }

  // ---- the name: never markup (the page sets textContent). Controls, bidi overrides and zero-width characters go (a ZWJ
  //      inside an emoji stays, as in the app's VisitLink.trimmedName), then 8 characters (grapheme clusters) at most
  function cleanName(s) {
    s = s.normalize('NFC').replace(/[\u0000-\u001F\u007F-\u009F\u00AD\u061C\u200B\u200C\u200E\u200F\u202A-\u202E\u2060-\u206F\uFEFF\uFFF9-\uFFFB]/g, '').replace(/\s+/g, ' ').trim();
    let g;
    if (typeof Intl !== 'undefined' && Intl.Segmenter) g = Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s), x => x.segment);
    else g = Array.from(s);
    return g.slice(0, 8).join('');
  }

  // ---- the body (after decompression): see SPEC.md
  function parse(b) {
    let i = 0;
    const need = n => { if (i + n > b.length) throw fail('format', 'short body'); };
    const u8 = () => { need(1); return b[i++]; };
    const flags = u8();
    if (flags & 0xF8) throw fail('format', 'unknown flags');
    const v = { species: flags & 1 ? 'cat' : 'dog', since: null, look: null, name: '', palette: [], frames: {}, order: [] };
    if (flags & 2) { need(2); v.since = b[i] | b[i + 1] << 8; i += 2; }
    if (flags & 4) {
      const n = u8(); if (n > 16) throw fail('format', 'breed id');
      need(n); const id = String.fromCharCode(...b.subarray(i, i + n)); i += n;
      if (!/^[a-z0-9]*$/.test(id)) throw fail('format', 'breed id');
      const coat = u8(), acc = u8(); need(6);
      v.look = { breed: id, coat, accessory: ACCESSORIES[acc] || 'none', accessoryRGB: [b[i], b[i + 1], b[i + 2]], mix: [b[i + 3], b[i + 4], b[i + 5]] };
      i += 6;
    }
    const nl = u8(); if (nl > MAX_NAME_BYTES) throw fail('format', 'name too long');
    need(nl);
    let name;
    try { name = new TextDecoder('utf-8', { fatal: true }).decode(b.subarray(i, i + nl)); } catch (e) { throw fail('format', 'name not UTF-8'); }
    i += nl; v.name = cleanName(name);
    const P = u8(); if (P < 1 || P > MAX_PAL) throw fail('format', 'palette');
    need(P * 3);
    for (let k = 0; k < P; k++, i += 3) v.palette.push([b[i], b[i + 1], b[i + 2]]);
    const F = u8(); if (F < 1 || F > MAX_FRAMES) throw fail('format', 'frames');
    const heads = [];
    for (let k = 0; k < F; k++) {
      const role = u8(), w = u8(), h = u8();
      if (!w || !h || w > MAX_SIDE || h > MAX_SIDE) throw fail('format', 'frame size');
      heads.push({ role, w, h });
    }
    for (const { role, w, h } of heads) {
      need(w * h);
      const idx = b.subarray(i, i + w * h); i += w * h;
      for (let k = 0; k < idx.length; k++) if (idx[k] > P) throw fail('format', 'index out of palette');
      const key = ROLES[role];
      if (key && !v.frames[key]) { v.frames[key] = { w, h, idx }; v.order.push(key); }   // unknown roles: skipped (newer apps)
    }
    // up to 3 zero bytes may follow (the encoder adds them so the link never ends in '-' or '_')
    if (b.length - i > 3 || b.subarray(i).some(x => x !== 0)) throw fail('format', 'trailing bytes');
    if (!v.frames.sit) throw fail('format', 'no sitting frame');
    return v;
  }

  /** The link's own part of a fragment (location.hash, with or without the '#'): percent-decoded, and only the base64url
      run (anything a messenger glued on after the link, like 。」, is dropped). */
  function run(fragment) {
    let s = String(fragment || '').replace(/^#/, '');
    try { s = decodeURIComponent(s); } catch (e) { /* keep as is */ }
    return (s.match(/^[A-Za-z0-9_-]*/) || [''])[0];
  }

  /** fragment: location.hash (with or without the '#'). Resolves to the visit, or rejects with e.code. */
  async function decode(fragment, opts) {
    const s = run(fragment);
    if (s.length < 8) throw fail('empty');
    const raw = fromB64url(s);
    if (raw[0] !== 1) throw fail('version', 'version ' + raw[0]);
    if (raw.length < 7) throw fail('empty');
    const method = raw[1], sum = (raw[2] | raw[3] << 8 | raw[4] << 16 | raw[5] << 24) >>> 0, payload = raw.subarray(6);
    let body;
    if (method === 0) { if (payload.length > MAX_BODY) throw fail('toolarge'); body = payload; }
    else if (method === 1) body = await inflate(payload, opts);
    else throw fail('method', 'method ' + method);   // a method this page doesn't know: a newer app
    if (crc32(body) !== sum) throw fail('checksum');
    const v = parse(body);
    v.version = 1; v.bytes = raw.length;
    return v;
  }

  /** RGBA pixels of one frame (transparent where the index is 0). */
  function rgba(v, f) {
    const px = new Uint8ClampedArray(f.w * f.h * 4);
    for (let k = 0; k < f.idx.length; k++) {
      const c = f.idx[k]; if (!c) continue;
      const p = v.palette[c - 1]; px[k * 4] = p[0]; px[k * 4 + 1] = p[1]; px[k * 4 + 2] = p[2]; px[k * 4 + 3] = 255;
    }
    return px;
  }

  const api = { decode, run, parse, inflateRaw, crc32, rgba, cleanName, ROLES, MAX_BODY };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PikoVisit = api;
})(typeof self !== 'undefined' ? self : this);
