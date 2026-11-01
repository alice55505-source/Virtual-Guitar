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

// 讀出和弦序列（由上到下、由左到右）：[{r: 根音 0~11, m: 是否小和弦}]
function readChords(data) {
  const { comps, mask, w } = findGlyphs(data);
  const letters = [], others = [];
  for (const c of comps) {
    const h = c.y1 - c.y0 + 1;
    if (h >= 12 && h <= 22) {
      const [l, d] = classifyGlyph(glyphVector(mask, w, c), (c.x1 - c.x0 + 1) / h);
      if (l && OCR_PC[l[0]] !== undefined && d < 0.08) { c.l = l; letters.push(c); continue; }
    }
    others.push(c);
  }
  const res = letters.map((f) => {
    const h = f.y1 - f.y0 + 1;
    let flat = false, minor = f.l.endsWith('m');
    for (const c of others) {
      const ch = c.y1 - c.y0 + 1, cw = c.x1 - c.x0 + 1;
      if (!(f.x1 - 1 <= c.x0 && c.x0 <= f.x1 + h * 0.7) || ch >= h * 0.8 || ch < h * 0.35) continue;
      if (c.y0 < f.y0 - h * 0.4 || c.y1 > f.y1 + h * 0.4) continue;
      if (c.y0 <= f.y0 + h * 0.2 && c.y1 <= f.y0 + h * 0.75) flat = true; // 右上小 b
      else if (c.y1 >= f.y1 - 3 && c.y0 >= f.y0 + h * 0.35 && cw >= ch * 1.1) minor = true; // 右下小 m
    }
    return { x: f.x0, y: f.y0, r: (OCR_PC[f.l[0]] - (flat ? 1 : 0) + 12) % 12, m: minor };
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
