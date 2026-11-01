'use strict';
/* ========== 從樂譜圖片讀出和弦的調 ==========
 * 樂譜上的和弦是洋紅色字。找出所有和弦字母（A~G，含降記號、小調 m），
 * 再找最符合這些和弦的調（主和弦、IV、V 加權；最後一個和弦通常是主和弦）。
 * 左上角的調是原調，和弦常被移到吉他好彈的調（例：原調 A♭ → 和弦 G）。
 */
const OCR_W = 12, OCR_H = 16;
const OCR_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function isPink(r, g, b) { return r > 120 && r - g > 45 && b - g > 15 && r >= b - 30; }

function loadImageData(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, 0, 0);
      try { resolve(g.getImageData(0, 0, c.width, c.height)); } catch (e) { reject(e); }
    };
    img.onerror = reject;
    img.src = url;
  });
}

// 洋紅色像素的連通區塊，再把互相重疊的區塊合併成一個字
function findGlyphs(data) {
  const { width: w, height: h } = data, px = data.data;
  const mask = new Uint8Array(w * h);
  for (let i = 0, p = 0; i < w * h; i++, p += 4) mask[i] = isPink(px[p], px[p + 1], px[p + 2]) ? 1 : 0;
  const seen = new Uint8Array(w * h);
  const comps = [];
  const stack = [];
  for (let s = 0; s < w * h; s++) {
    if (!mask[s] || seen[s]) continue;
    seen[s] = 1; stack.push(s);
    let x0 = w, y0 = h, x1 = 0, y1 = 0, n = 0;
    while (stack.length) {
      const q = stack.pop(), x = q % w, y = (q - x) / w;
      n++;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const k = ny * w + nx;
        if (mask[k] && !seen[k]) { seen[k] = 1; stack.push(k); }
      }
    }
    if (n >= 4) comps.push({ x0, y0, x1, y1 });
  }
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 0; i < comps.length; i++) {
      for (let j = i + 1; j < comps.length; j++) {
        const a = comps[i], b = comps[j];
        if (a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 + 1 && b.y0 <= a.y1 + 1) {
          a.x0 = Math.min(a.x0, b.x0); a.y0 = Math.min(a.y0, b.y0);
          a.x1 = Math.max(a.x1, b.x1); a.y1 = Math.max(a.y1, b.y1);
          comps.splice(j, 1); changed = true; break outer;
        }
      }
    }
  }
  return { comps, mask, w };
}

function glyphVector(mask, w, c) {
  const gw = c.x1 - c.x0 + 1, gh = c.y1 - c.y0 + 1, v = [];
  for (let j = 0; j < OCR_H; j++) for (let i = 0; i < OCR_W; i++) {
    const xa = c.x0 + i * gw / OCR_W, xb = c.x0 + (i + 1) * gw / OCR_W;
    const ya = c.y0 + j * gh / OCR_H, yb = c.y0 + (j + 1) * gh / OCR_H;
    let cnt = 0, tot = 0;
    for (let y = Math.floor(ya); y < Math.max(Math.floor(ya) + 1, Math.floor(yb + 0.999)); y++)
      for (let x = Math.floor(xa); x < Math.max(Math.floor(xa) + 1, Math.floor(xb + 0.999)); x++) { tot++; cnt += mask[y * w + x]; }
    v.push(cnt / tot);
  }
  return v;
}

let ocrTemplates = null;
function classifyGlyph(v, ar) {
  if (!ocrTemplates) ocrTemplates = CHORD_TEMPLATES.map(([l, a, s]) => [l, a, [...s].map((ch) => +ch / 9)]);
  let best = 9, label = null;
  for (const [l, a, t] of ocrTemplates) {
    let d = 0;
    for (let k = 0; k < v.length; k++) { const e = v[k] - t[k]; d += e * e; }
    d = d / v.length + (ar - a) * (ar - a);
    if (d < best) { best = d; label = l; }
  }
  return [label, best];
}

// 字底部兩列有幾段：m 有 2~3 隻腳，7 只有 1 段
function bottomRuns(mask, w, c) {
  let best = 0;
  for (let y = c.y1 - 1; y <= c.y1; y++) {
    let runs = 0, prev = 0;
    for (let x = c.x0; x <= c.x1; x++) { const v = mask[y * w + x]; if (v && !prev) runs++; prev = v; }
    best = Math.max(best, runs);
  }
  return best;
}

// 讀出和弦序列（由上到下、由左到右）：[{r: 根音 0~11, m: 是否小和弦}]
function readChords(data) {
  const { comps, mask, w } = findGlyphs(data);
  const letters = [], others = [];
  for (const c of comps) {
    const h = c.y1 - c.y0 + 1;
    if (h >= 12 && h <= 22) {
      const [l, d] = classifyGlyph(glyphVector(mask, w, c), (c.x1 - c.x0 + 1) / h);
      if (l && OCR_PC[l[0]] !== undefined && d < 0.08) {
        // E 和 F 只差底下一橫：看最底兩列有沒有橫線
        if (l[0] === 'E' || l[0] === 'F') {
          let n = 0;
          for (let y = c.y1 - 1; y <= c.y1; y++) for (let x = c.x0; x <= c.x1; x++) n += mask[y * w + x];
          const isE = n / (2 * (c.x1 - c.x0 + 1)) > 0.45;
          c.l = (isE ? 'E' : 'F') + l.slice(1);
        } else c.l = l;
        letters.push(c); continue;
      }
    }
    others.push(c);
  }
  // 小字（m、7、b）常被反鋸齒切成幾段，左右相鄰 ≤2px 的先併起來
  others.sort((a, b) => a.x0 - b.x0);
  for (let i = 0; i < others.length; i++) {
    for (let j = i + 1; j < others.length; j++) {
      const a = others[i], b = others[j];
      if (b.x0 - a.x1 > 2) continue;
      if (a.y0 > b.y1 || b.y0 > a.y1) continue;
      if (Math.max(a.y1, b.y1) - Math.min(a.y0, b.y0) > 12) continue;
      a.x0 = Math.min(a.x0, b.x0); a.x1 = Math.max(a.x1, b.x1);
      a.y0 = Math.min(a.y0, b.y0); a.y1 = Math.max(a.y1, b.y1);
      others.splice(j, 1); j = i;
    }
  }
  const res = letters.map((f) => {
    const h = f.y1 - f.y0 + 1;
    let flat = false, minor = f.l.endsWith('m'), seven = false;
    for (const c of others) {
      const ch = c.y1 - c.y0 + 1, cw = c.x1 - c.x0 + 1;
      if (!(f.x1 - 1 <= c.x0 && c.x0 <= f.x1 + h * 0.7) || ch >= h * 0.8 || ch < h * 0.35) continue;
      if (c.y0 < f.y0 - h * 0.4 || c.y1 > f.y1 + h * 0.4) continue;
      if (c.y0 <= f.y0 + h * 0.2 && c.y1 <= f.y0 + h * 0.75) flat = true; // 右上小 b
      else if (c.y1 >= f.y1 - 3 && c.y0 >= f.y0 + h * 0.35) { if (bottomRuns(mask, w, c) >= 2) minor = true; else seven = true; } // 右下小 m（底部有 2~3 隻腳）／7
    }
    return { x: f.x0, y: f.y0, y1: f.y1, r: (OCR_PC[f.l[0]] - (flat ? 1 : 0) + 12) % 12, m: minor, seven };
  });
  res.sort((a, b) => a.y - b.y || a.x - b.x);
  const rows = [];
  for (const c of res) {
    if (rows.length && Math.abs(rows[rows.length - 1][0].y - c.y) <= 8) rows[rows.length - 1].push(c);
    else rows.push([c]);
  }
  return rows.flatMap((r) => r.sort((a, b) => a.x - b.x));
}

// 找最符合的調：[音程, 權重, 應為小和弦]
const KEY_WEIGHTS = {
  major: { 0: [3, 0], 5: [2, 0], 7: [2, 0], 9: [1, 1], 2: [1, 1], 4: [0.5, 1] },
  minor: { 0: [3, 1], 5: [2, 1], 7: [2, 0], 3: [1, 0], 8: [1, 0], 10: [1, 0] },
};
function bestKey(seq, scale, orig) {
  const W = KEY_WEIGHTS[scale];
  let best = -1, key = null;
  for (let K = 0; K < 12; K++) {
    let s = 0;
    for (const c of seq) {
      const e = W[(c.r - K + 12) % 12];
      if (e) s += e[0] * ((c.m ? 1 : 0) === e[1] ? 1 : 0.4);
    }
    if (seq.length && seq[seq.length - 1].r === K) s += 3; // 結尾和弦
    if (orig === K) s += 2; // 原調優先
    if (s > best) { best = s; key = K; }
  }
  return [key, best];
}

// 回傳 {key: 0~11, scale}；scale 沒給（譜上沒標大小調）就自己判斷；讀不到回傳 null
async function detectChordKey(url, scale, orig) {
  try {
    const data = await loadImageData(url);
    const seq = readChords(data);
    if (seq.length < 3) return null;
    if (scale) return { key: bestKey(seq, scale, orig)[0], scale };
    const [kM, sM] = bestKey(seq, 'major', null), [km, sm] = bestKey(seq, 'minor', null);
    return sm > sM ? { key: km, scale: 'minor' } : { key: kM, scale: 'major' };
  } catch (_) {
    return null;
  }
}

/* ========== 照譜播放：找小節線，把和弦排到第幾小節第幾格 ========== */
// 小節線：細的深色直線。各本樂譜粗細、深淺、長度不同，
// 所以先找所有「左右都空白」的細直線，再取一頁中重複最多、最長的那種長度
function findSystems(data) {
  const { width: w, height: h, data: px } = data;
  const dk = new Uint8Array(w * h);
  for (let i = 0, p = 0; i < w * h; i++, p += 4) dk[i] = Math.max(px[p], px[p + 1], px[p + 2]) < 170 ? 1 : 0;
  const fill = (x, y0, y1) => {
    if (x < 0 || x >= w) return 0;
    let n = 0; for (let y = y0; y < y1; y++) n += dk[y * w + x];
    return n / (y1 - y0);
  };
  const runs = [];
  for (let x = 0; x < w; x++) {
    let y = 0;
    while (y < h) {
      if (dk[y * w + x]) {
        const y0 = y;
        while (y < h && dk[y * w + x]) y++;
        const L = y - y0;
        if (L >= 15 && L <= 50 && fill(x - 2, y0, y) < 0.25 && fill(x + 2, y0, y) < 0.25 &&
            fill(x - 3, y0, y) < 0.25 && fill(x + 3, y0, y) < 0.25) runs.push([x, y0, y - 1]);
      } else y++;
    }
  }
  const cnt = {};
  for (const r of runs) { const L = r[2] - r[1] + 1; cnt[L] = (cnt[L] || 0) + 1; }
  let best = 0;
  for (const L of Object.keys(cnt).map(Number).sort((a, b) => b - a)) {
    let n = 0; for (let d = -2; d <= 2; d++) n += cnt[L + d] || 0;
    if (n >= 6) { best = L; break; }
  }
  if (!best) return [];
  const segs = runs.filter((r) => Math.abs(r[2] - r[1] + 1 - best) <= 3);
  const systems = [];
  for (const [x, y0, y1] of segs) {
    const s = systems.find((sy) => Math.abs(sy.y0 - y0) <= 4);
    if (s) s.xs.push(x); else systems.push({ y0, y1, xs: [x] });
  }
  const colHas = (x, s) => { for (let y = s.y0 + 6; y <= s.y1 - 6; y++) if (dk[y * w + x]) return true; return false; };
  for (const s of systems) {
    s.xs.sort((a, b) => a - b);
    const m = [];
    for (const x of s.xs) { if (m.length && x - m[m.length - 1] <= 6) m[m.length - 1] = x; else m.push(x); }
    s.xs = m;
    s.start = 0; while (s.start < w && !colHas(s.start, s)) s.start++;
    s.end = w - 1; while (s.end > 0 && !colHas(s.end, s)) s.end--;
  }
  return systems.filter((s) => s.xs.length >= 2).sort((a, b) => a.y0 - b.y0);
}

// 回傳 {bars: [{page, pieces:[{x0,x1,y0,y1}], ch:[{frac: 小節內位置 0~1, r: 根音, q: 性質}]}], pickup}
function buildBars(pages) {
  const pieces = [];
  let assigned = 0, total = 0;
  pages.forEach(({ systems, chords }, page) => {
    systems.forEach((s, si) => {
      const inner = s.xs.filter((x) => x > s.start + 5);
      const edges = [s.start].concat(inner);
      const closed = s.end - edges[edges.length - 1] <= 25;
      if (!closed) edges.push(s.end + 4);
      for (let k = 0; k + 1 < edges.length; k++) {
        pieces.push({
          page, sysKey: page + ':' + si, x0: edges[k], x1: edges[k + 1], y0: s.y0, y1: s.y1,
          lead: k === 0, trail: !closed && k === edges.length - 2, ch: [],
        });
      }
    });
    // 和弦放到正下方那一行譜的對應段落
    for (const c of chords) {
      let best = null;
      for (const pc of pieces) {
        if (pc.page !== page) continue;
        const gap = pc.y0 - c.y1;
        if (gap > 0 && gap < 60 && c.x >= pc.x0 - 12 && c.x < pc.x1 - 4 && (!best || gap <= best.gap)) best = { pc, gap };
      }
      if (best) { best.pc.ch.push(c); assigned++; }
    }
    total += chords.length;
  });
  // 一半以上的和弦對不到小節，代表小節線沒找對，不提供照譜播放
  if (!pieces.length || assigned < total * 0.6) return null;
  const widths = pieces.filter((p) => !p.lead && !p.trail).map((p) => p.x1 - p.x0).sort((a, b) => a - b);
  const med = widths.length ? widths[widths.length >> 1] : Math.max(...pieces.map((p) => p.x1 - p.x0));
  // 組成小節：行尾沒結束的半小節 + 下一行開頭的半小節 = 一小節；第一行開頭太短 = 弱起
  const bars = [];
  let pickup = null;
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i], w = p.x1 - p.x0;
    if (i === 0 && p.lead && w < med * 0.75) { pickup = p; continue; }
    const last = bars[bars.length - 1];
    if (p.lead && last && last.open) { last.pieces.push(p); last.open = false; continue; }
    bars.push({ pieces: [p], open: p.trail && w < med * 0.9 });
  }
  // 和弦換算成小節內第幾格（八分音符格）
  return {
    pickup,
    bars: bars.map((b) => {
      const total = b.pieces.reduce((s, p) => s + p.x1 - p.x0, 0);
      let off = 0;
      const ch = [];
      for (const p of b.pieces) {
        for (const c of p.ch) {
          const frac = (off + c.x + 2 - p.x0) / total;
          ch.push({ frac: Math.max(0, Math.min(0.999, frac)), r: c.r, q: (c.m ? 'm' : '') + (c.seven ? '7' : '') });
        }
        off += p.x1 - p.x0;
      }
      ch.sort((a, b) => a.frac - b.frac);
      return { page: b.pieces[0].page, pieces: b.pieces, ch };
    }),
  };
}

// 讀整首（多頁）：回傳 {key, scale, timeline}
async function analyzeScore(urls, scale, orig) {
  const pages = [];
  for (const u of urls) {
    try {
      const data = await loadImageData(u);
      pages.push({ systems: findSystems(data), chords: readChords(data), w: data.width });
    } catch (_) { pages.push({ systems: [], chords: [], w: 1 }); }
  }
  const all = pages.flatMap((p) => p.chords);
  if (all.length < 3) return null;
  let key, sc = scale;
  if (scale) key = bestKey(all, scale, orig)[0];
  else {
    const [kM, sM] = bestKey(all, 'major', null), [km, sm] = bestKey(all, 'minor', null);
    if (sm > sM) { key = km; sc = 'minor'; } else { key = kM; sc = 'major'; }
  }
  return { key, scale: sc, timeline: buildBars(pages), sizes: pages.map((p) => p.w) };
}
