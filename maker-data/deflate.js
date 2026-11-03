/* Pikomofu: raw DEFLATE (RFC 1951) that writes the very bytes zlib 1.2.12 writes at level 5 (windowBits -15, memLevel 8,
   the default strategy), which is what Apple's COMPRESSION_ZLIB is (checked against compression_encode_buffer). The app
   compresses its visit links with it (Shared/VisitLink.swift), so a link made on the web is byte for byte the link the app
   would make for the same pet. A port of zlib's deflate_slow (deflate.c) and trees.c, for this one setting only; the
   names are zlib's. Checked by Tools/site/maker/check-deflate.cjs (against zlib on many inputs) and check-links.mjs
   (against the app's own links). Works as a classic <script> (window.PikoDeflate) and in Node (require). */
(function (root) {
  'use strict';
  const L_CODES = 286, D_CODES = 30, BL_CODES = 19, HEAP_SIZE = 2 * L_CODES + 1, MAX_BITS = 15, MAX_BL_BITS = 7;
  const LITERALS = 256, END_BLOCK = 256, REP_3_6 = 16, REPZ_3_10 = 17, REPZ_11_138 = 18, LENGTH_CODES = 29;
  const MIN_MATCH = 3, MAX_MATCH = 258, MIN_LOOKAHEAD = MAX_MATCH + MIN_MATCH + 1, TOO_FAR = 4096, WIN_INIT = MAX_MATCH;
  // level 5: good_length, max_lazy, nice_length, max_chain
  const GOOD = 8, LAZY = 16, NICE = 32, CHAIN = 32;
  const extra_lbits = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
  const extra_dbits = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
  const extra_blbits = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 3, 7];
  const bl_order = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

  // a tree is a Uint16Array of pairs: [2n] = Freq (later Code), [2n+1] = Dad (later Len), the two unions of zlib's ct_data
  const static_ltree = new Uint16Array((L_CODES + 2) * 2), static_dtree = new Uint16Array(D_CODES * 2);
  const _dist_code = new Uint8Array(512), _length_code = new Uint8Array(256);
  const base_length = new Int32Array(LENGTH_CODES), base_dist = new Int32Array(D_CODES);

  function bi_reverse(code, len) { let res = 0; do { res |= code & 1; code >>>= 1; res <<= 1; } while (--len > 0); return res >>> 1; }
  function gen_codes(tree, max_code, bl_count) {
    const next_code = new Uint16Array(MAX_BITS + 1);
    let code = 0;
    for (let bits = 1; bits <= MAX_BITS; bits++) { code = (code + bl_count[bits - 1]) << 1; next_code[bits] = code; }
    for (let n = 0; n <= max_code; n++) {
      const len = tree[n * 2 + 1];
      if (len === 0) continue;
      tree[n * 2] = bi_reverse(next_code[len]++, len);
    }
  }
  (function tr_static_init() {
    let length = 0, code;
    for (code = 0; code < LENGTH_CODES - 1; code++) {
      base_length[code] = length;
      for (let n = 0; n < (1 << extra_lbits[code]); n++) _length_code[length++] = code;
    }
    _length_code[length - 1] = code;
    let dist = 0;
    for (code = 0; code < 16; code++) {
      base_dist[code] = dist;
      for (let n = 0; n < (1 << extra_dbits[code]); n++) _dist_code[dist++] = code;
    }
    dist >>= 7;
    for (; code < D_CODES; code++) {
      base_dist[code] = dist << 7;
      for (let n = 0; n < (1 << (extra_dbits[code] - 7)); n++) _dist_code[256 + dist++] = code;
    }
    const bl_count = new Uint16Array(MAX_BITS + 1);
    let n = 0;
    while (n <= 143) { static_ltree[n * 2 + 1] = 8; n++; bl_count[8]++; }
    while (n <= 255) { static_ltree[n * 2 + 1] = 9; n++; bl_count[9]++; }
    while (n <= 279) { static_ltree[n * 2 + 1] = 7; n++; bl_count[7]++; }
    while (n <= 287) { static_ltree[n * 2 + 1] = 8; n++; bl_count[8]++; }
    gen_codes(static_ltree, L_CODES + 1, bl_count);
    for (n = 0; n < D_CODES; n++) { static_dtree[n * 2 + 1] = 5; static_dtree[n * 2] = bi_reverse(n, 5); }
  })();
  const d_code = dist => dist < 256 ? _dist_code[dist] : _dist_code[256 + (dist >>> 7)];
  const L_STAT = { tree: static_ltree, extra: extra_lbits, base: LITERALS + 1, elems: L_CODES, max_length: MAX_BITS };
  const D_STAT = { tree: static_dtree, extra: extra_dbits, base: 0, elems: D_CODES, max_length: MAX_BITS };
  const BL_STAT = { tree: null, extra: extra_blbits, base: 0, elems: BL_CODES, max_length: MAX_BL_BITS };

  function deflateRaw(input) {
    const w_size = 1 << 15, w_mask = w_size - 1, window_size = 2 * w_size;
    const hash_size = 1 << 15, hash_mask = hash_size - 1, hash_shift = 5;
    const lit_bufsize = 1 << 14, sym_end = (lit_bufsize - 1) * 3, MAX_DIST = w_size - MIN_LOOKAHEAD;
    const window = new Uint8Array(window_size), head = new Uint16Array(hash_size), prev = new Uint16Array(w_size);
    const sym_buf = new Uint8Array(lit_bufsize * 3);
    const dyn_ltree = new Uint16Array(HEAP_SIZE * 2), dyn_dtree = new Uint16Array((2 * D_CODES + 1) * 2), bl_tree = new Uint16Array((2 * BL_CODES + 1) * 2);
    const l_desc = { dyn: dyn_ltree, max_code: 0, stat: L_STAT }, d_desc = { dyn: dyn_dtree, max_code: 0, stat: D_STAT }, bl_desc = { dyn: bl_tree, max_code: 0, stat: BL_STAT };
    const heap = new Int32Array(2 * L_CODES + 1), depth = new Uint8Array(2 * L_CODES + 1), bl_count = new Uint16Array(MAX_BITS + 1);
    let heap_len = 0, heap_max = 0, opt_len = 0, static_len = 0, sym_next = 0, matches = 0;
    let strstart = 0, block_start = 0, lookahead = 0, insert = 0, ins_h = 0, high_water = 0;
    let match_length = MIN_MATCH - 1, prev_length = MIN_MATCH - 1, match_available = 0, match_start = 0, prev_match = 0;
    let next_in = 0, avail_in = input.length;

    // ---- output, least significant bit first (the bytes zlib's 16-bit bi_buf comes out as)
    let out = new Uint8Array(Math.max(64, input.length + (input.length >> 3) + 64)), pending = 0, bi_buf = 0, bi_valid = 0;
    function put_byte(b) {
      if (pending === out.length) { const o = new Uint8Array(out.length * 2); o.set(out); out = o; }
      out[pending++] = b & 0xFF;
    }
    function send_bits(value, length) {
      bi_buf |= value << bi_valid; bi_valid += length;
      while (bi_valid >= 8) { put_byte(bi_buf); bi_buf >>>= 8; bi_valid -= 8; }
    }
    function bi_windup() { if (bi_valid > 0) put_byte(bi_buf); bi_buf = 0; bi_valid = 0; }
    const send_code = (c, tree) => send_bits(tree[c * 2], tree[c * 2 + 1]);

    // ---- trees.c
    function init_block() {
      for (let n = 0; n < L_CODES; n++) dyn_ltree[n * 2] = 0;
      for (let n = 0; n < D_CODES; n++) dyn_dtree[n * 2] = 0;
      for (let n = 0; n < BL_CODES; n++) bl_tree[n * 2] = 0;
      dyn_ltree[END_BLOCK * 2] = 1;
      opt_len = static_len = 0; sym_next = matches = 0;
    }
    const smaller = (tree, n, m) => tree[n * 2] < tree[m * 2] || (tree[n * 2] === tree[m * 2] && depth[n] <= depth[m]);
    function pqdownheap(tree, k) {
      const v = heap[k];
      let j = k << 1;
      while (j <= heap_len) {
        if (j < heap_len && smaller(tree, heap[j + 1], heap[j])) j++;
        if (smaller(tree, v, heap[j])) break;
        heap[k] = heap[j]; k = j; j <<= 1;
      }
      heap[k] = v;
    }
    function gen_bitlen(desc) {
      const tree = desc.dyn, max_code = desc.max_code, stree = desc.stat.tree, extra = desc.stat.extra, base = desc.stat.base, max_length = desc.stat.max_length;
      let h, n, m, bits, xbits, f, overflow = 0;
      for (bits = 0; bits <= MAX_BITS; bits++) bl_count[bits] = 0;
      tree[heap[heap_max] * 2 + 1] = 0;
      for (h = heap_max + 1; h < HEAP_SIZE; h++) {
        n = heap[h];
        bits = tree[tree[n * 2 + 1] * 2 + 1] + 1;
        if (bits > max_length) { bits = max_length; overflow++; }
        tree[n * 2 + 1] = bits;
        if (n > max_code) continue;
        bl_count[bits]++;
        xbits = 0;
        if (n >= base) xbits = extra[n - base];
        f = tree[n * 2];
        opt_len += f * (bits + xbits);
        if (stree) static_len += f * (stree[n * 2 + 1] + xbits);
      }
      if (overflow === 0) return;
      do {
        bits = max_length - 1;
        while (bl_count[bits] === 0) bits--;
        bl_count[bits]--; bl_count[bits + 1] += 2; bl_count[max_length]--;
        overflow -= 2;
      } while (overflow > 0);
      for (bits = max_length; bits !== 0; bits--) {
        n = bl_count[bits];
        while (n !== 0) {
          m = heap[--h];
          if (m > max_code) continue;
          if (tree[m * 2 + 1] !== bits) { opt_len += (bits - tree[m * 2 + 1]) * tree[m * 2]; tree[m * 2 + 1] = bits; }
          n--;
        }
      }
    }
    function build_tree(desc) {
      const tree = desc.dyn, stree = desc.stat.tree, elems = desc.stat.elems;
      let n, m, max_code = -1, node;
      heap_len = 0; heap_max = HEAP_SIZE;
      for (n = 0; n < elems; n++) {
        if (tree[n * 2] !== 0) { heap[++heap_len] = max_code = n; depth[n] = 0; }
        else tree[n * 2 + 1] = 0;
      }
      while (heap_len < 2) {
        node = heap[++heap_len] = (max_code < 2 ? ++max_code : 0);
        tree[node * 2] = 1; depth[node] = 0; opt_len--;
        if (stree) static_len -= stree[node * 2 + 1];
      }
      desc.max_code = max_code;
      for (n = heap_len >> 1; n >= 1; n--) pqdownheap(tree, n);
      node = elems;
      do {
        n = heap[1]; heap[1] = heap[heap_len--]; pqdownheap(tree, 1);
        m = heap[1];
        heap[--heap_max] = n; heap[--heap_max] = m;
        tree[node * 2] = tree[n * 2] + tree[m * 2];
        depth[node] = (depth[n] >= depth[m] ? depth[n] : depth[m]) + 1;
        tree[n * 2 + 1] = tree[m * 2 + 1] = node;
        heap[1] = node++;
        pqdownheap(tree, 1);
      } while (heap_len >= 2);
      heap[--heap_max] = heap[1];
      gen_bitlen(desc);
      gen_codes(tree, max_code, bl_count);
    }
    function scan_tree(tree, max_code) {
      let prevlen = -1, curlen, nextlen = tree[1], count = 0, max_count = 7, min_count = 4;
      if (nextlen === 0) { max_count = 138; min_count = 3; }
      tree[(max_code + 1) * 2 + 1] = 0xFFFF;
      for (let n = 0; n <= max_code; n++) {
        curlen = nextlen; nextlen = tree[(n + 1) * 2 + 1];
        if (++count < max_count && curlen === nextlen) continue;
        else if (count < min_count) bl_tree[curlen * 2] += count;
        else if (curlen !== 0) { if (curlen !== prevlen) bl_tree[curlen * 2]++; bl_tree[REP_3_6 * 2]++; }
        else if (count <= 10) bl_tree[REPZ_3_10 * 2]++;
        else bl_tree[REPZ_11_138 * 2]++;
        count = 0; prevlen = curlen;
        if (nextlen === 0) { max_count = 138; min_count = 3; }
        else if (curlen === nextlen) { max_count = 6; min_count = 3; }
        else { max_count = 7; min_count = 4; }
      }
    }
    function send_tree(tree, max_code) {
      let prevlen = -1, curlen, nextlen = tree[1], count = 0, max_count = 7, min_count = 4;
      if (nextlen === 0) { max_count = 138; min_count = 3; }
      for (let n = 0; n <= max_code; n++) {
        curlen = nextlen; nextlen = tree[(n + 1) * 2 + 1];
        if (++count < max_count && curlen === nextlen) continue;
        else if (count < min_count) { do { send_code(curlen, bl_tree); } while (--count !== 0); }
        else if (curlen !== 0) {
          if (curlen !== prevlen) { send_code(curlen, bl_tree); count--; }
          send_code(REP_3_6, bl_tree); send_bits(count - 3, 2);
        } else if (count <= 10) { send_code(REPZ_3_10, bl_tree); send_bits(count - 3, 3); }
        else { send_code(REPZ_11_138, bl_tree); send_bits(count - 11, 7); }
        count = 0; prevlen = curlen;
        if (nextlen === 0) { max_count = 138; min_count = 3; }
        else if (curlen === nextlen) { max_count = 6; min_count = 3; }
        else { max_count = 7; min_count = 4; }
      }
    }
    function build_bl_tree() {
      scan_tree(dyn_ltree, l_desc.max_code);
      scan_tree(dyn_dtree, d_desc.max_code);
      build_tree(bl_desc);
      let max_blindex;
      for (max_blindex = BL_CODES - 1; max_blindex >= 3; max_blindex--) if (bl_tree[bl_order[max_blindex] * 2 + 1] !== 0) break;
      opt_len += 3 * (max_blindex + 1) + 5 + 5 + 4;
      return max_blindex;
    }
    function send_all_trees(lcodes, dcodes, blcodes) {
      send_bits(lcodes - 257, 5); send_bits(dcodes - 1, 5); send_bits(blcodes - 4, 4);
      for (let rank = 0; rank < blcodes; rank++) send_bits(bl_tree[bl_order[rank] * 2 + 1], 3);
      send_tree(dyn_ltree, lcodes - 1);
      send_tree(dyn_dtree, dcodes - 1);
    }
    function compress_block(ltree, dtree) {
      let sx = 0;
      if (sym_next !== 0) do {
        let dist = sym_buf[sx++]; dist += sym_buf[sx++] << 8; let lc = sym_buf[sx++];
        if (dist === 0) send_code(lc, ltree);
        else {
          let code = _length_code[lc];
          send_code(code + LITERALS + 1, ltree);
          let extra = extra_lbits[code];
          if (extra !== 0) { lc -= base_length[code]; send_bits(lc, extra); }
          dist--;
          code = d_code(dist);
          send_code(code, dtree);
          extra = extra_dbits[code];
          if (extra !== 0) { dist -= base_dist[code]; send_bits(dist, extra); }
        }
      } while (sx < sym_next);
      send_code(END_BLOCK, ltree);
    }
    function tr_stored_block(buf, stored_len, last) {
      send_bits(last, 3);   // STORED_BLOCK << 1 is 0
      bi_windup();
      put_byte(stored_len & 0xFF); put_byte(stored_len >> 8);
      put_byte(~stored_len & 0xFF); put_byte((~stored_len >> 8) & 0xFF);
      for (let i = 0; i < stored_len; i++) put_byte(window[buf + i]);
    }
    function tr_flush_block(buf, stored_len, last) {   // buf: an index into window, or -1 (zlib's NULL)
      build_tree(l_desc);
      build_tree(d_desc);
      const max_blindex = build_bl_tree();
      let opt_lenb = (opt_len + 3 + 7) >>> 3;
      const static_lenb = (static_len + 3 + 7) >>> 3;
      if (static_lenb <= opt_lenb) opt_lenb = static_lenb;
      if (stored_len + 4 <= opt_lenb && buf !== -1) tr_stored_block(buf, stored_len, last);
      else if (static_lenb === opt_lenb) { send_bits((1 << 1) + last, 3); compress_block(static_ltree, static_dtree); }
      else {
        send_bits((2 << 1) + last, 3);
        send_all_trees(l_desc.max_code + 1, d_desc.max_code + 1, max_blindex + 1);
        compress_block(dyn_ltree, dyn_dtree);
      }
      init_block();
      if (last) bi_windup();
    }
    function tally(dist, lc) {
      sym_buf[sym_next++] = dist & 0xFF; sym_buf[sym_next++] = (dist >> 8) & 0xFF; sym_buf[sym_next++] = lc;
      if (dist === 0) dyn_ltree[lc * 2]++;
      else { matches++; dist--; dyn_ltree[(_length_code[lc] + LITERALS + 1) * 2]++; dyn_dtree[d_code(dist) * 2]++; }
      return sym_next === sym_end;
    }
    function flush_block(last) {
      tr_flush_block(block_start >= 0 ? block_start : -1, strstart - block_start, last);
      block_start = strstart;
    }

    // ---- deflate.c
    function slide_hash() {
      for (let n = 0; n < hash_size; n++) { const m = head[n]; head[n] = m >= w_size ? m - w_size : 0; }
      for (let n = 0; n < w_size; n++) { const m = prev[n]; prev[n] = m >= w_size ? m - w_size : 0; }
    }
    function fill_window() {
      let n, more;
      do {
        more = window_size - lookahead - strstart;
        if (strstart >= w_size + MAX_DIST) {
          window.copyWithin(0, w_size, w_size + w_size - more);
          match_start -= w_size; strstart -= w_size; block_start -= w_size;
          if (insert > strstart) insert = strstart;
          slide_hash();
          more += w_size;
        }
        if (avail_in === 0) break;
        n = Math.min(avail_in, more);
        window.set(input.subarray(next_in, next_in + n), strstart + lookahead);
        next_in += n; avail_in -= n;
        lookahead += n;
        if (lookahead + insert >= MIN_MATCH) {
          let str = strstart - insert;
          ins_h = window[str];
          ins_h = ((ins_h << hash_shift) ^ window[str + 1]) & hash_mask;
          while (insert) {
            ins_h = ((ins_h << hash_shift) ^ window[str + MIN_MATCH - 1]) & hash_mask;
            prev[str & w_mask] = head[ins_h];
            head[ins_h] = str;
            str++; insert--;
            if (lookahead + insert < MIN_MATCH) break;
          }
        }
      } while (lookahead < MIN_LOOKAHEAD && avail_in !== 0);
      if (high_water < window_size) {
        const curr = strstart + lookahead;
        let init;
        if (high_water < curr) {
          init = Math.min(window_size - curr, WIN_INIT);
          window.fill(0, curr, curr + init);
          high_water = curr + init;
        } else if (high_water < curr + WIN_INIT) {
          init = Math.min(curr + WIN_INIT - high_water, window_size - high_water);
          window.fill(0, high_water, high_water + init);
          high_water += init;
        }
      }
    }
    function insert_string(str) {
      ins_h = ((ins_h << hash_shift) ^ window[str + MIN_MATCH - 1]) & hash_mask;
      const h = prev[str & w_mask] = head[ins_h];
      head[ins_h] = str;
      return h;
    }
    function longest_match(cur_match) {
      let chain_length = CHAIN, scan = strstart, match, len, best_len = prev_length, nice_match = NICE;
      const limit = strstart > MAX_DIST ? strstart - MAX_DIST : 0;
      const strend = strstart + MAX_MATCH;
      let scan_end1 = window[scan + best_len - 1], scan_end = window[scan + best_len];
      if (prev_length >= GOOD) chain_length >>= 2;
      if (nice_match > lookahead) nice_match = lookahead;
      do {
        match = cur_match;
        if (window[match + best_len] !== scan_end || window[match + best_len - 1] !== scan_end1 ||
            window[match] !== window[scan] || window[++match] !== window[scan + 1]) continue;
        // scan[2] and match[2] are equal when the others are (the hash), as zlib assumes: compared from the fourth byte
        scan += 2; match++;
        do {} while (window[++scan] === window[++match] && window[++scan] === window[++match] &&
                     window[++scan] === window[++match] && window[++scan] === window[++match] &&
                     window[++scan] === window[++match] && window[++scan] === window[++match] &&
                     window[++scan] === window[++match] && window[++scan] === window[++match] && scan < strend);
        len = MAX_MATCH - (strend - scan);
        scan = strend - MAX_MATCH;
        if (len > best_len) {
          match_start = cur_match;
          best_len = len;
          if (len >= nice_match) break;
          scan_end1 = window[scan + best_len - 1];
          scan_end = window[scan + best_len];
        }
      } while ((cur_match = prev[cur_match & w_mask]) > limit && --chain_length !== 0);
      return best_len <= lookahead ? best_len : lookahead;
    }
    function deflate_slow() {   // with Z_FINISH and all the input at hand
      let hash_head, bflush;
      for (;;) {
        if (lookahead < MIN_LOOKAHEAD) {
          fill_window();
          if (lookahead === 0) break;
        }
        hash_head = 0;
        if (lookahead >= MIN_MATCH) hash_head = insert_string(strstart);
        prev_length = match_length; prev_match = match_start;
        match_length = MIN_MATCH - 1;
        if (hash_head !== 0 && prev_length < LAZY && strstart - hash_head <= MAX_DIST) {
          match_length = longest_match(hash_head);
          if (match_length <= 5 && (match_length === MIN_MATCH && strstart - match_start > TOO_FAR)) match_length = MIN_MATCH - 1;
        }
        if (prev_length >= MIN_MATCH && match_length <= prev_length) {
          const max_insert = strstart + lookahead - MIN_MATCH;
          bflush = tally(strstart - 1 - prev_match, prev_length - MIN_MATCH);
          lookahead -= prev_length - 1;
          prev_length -= 2;
          do { if (++strstart <= max_insert) insert_string(strstart); } while (--prev_length !== 0);
          match_available = 0;
          match_length = MIN_MATCH - 1;
          strstart++;
          if (bflush) flush_block(0);
        } else if (match_available) {
          bflush = tally(0, window[strstart - 1]);
          if (bflush) flush_block(0);
          strstart++;
          lookahead--;
        } else {
          match_available = 1;
          strstart++;
          lookahead--;
        }
      }
      if (match_available) { tally(0, window[strstart - 1]); match_available = 0; }
      insert = strstart < MIN_MATCH - 1 ? strstart : MIN_MATCH - 1;
      flush_block(1);
    }

    init_block();
    deflate_slow();
    return out.slice(0, pending);
  }

  const api = { deflateRaw };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PikoDeflate = api;
})(typeof self !== 'undefined' ? self : this);
