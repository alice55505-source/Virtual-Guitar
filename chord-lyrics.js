'use strict';
/* ========== 歌詞和弦：從樂譜圖片找出「每個和弦在第一節歌詞的第幾個字」 ==========
 * 1. 找小節線 → 每一行譜（system）的位置
 * 2. 每行譜下方第一行黑字 = 第一節歌詞（副歌行就是副歌）；切成一個一個字（標點不算）
 * 3. 和弦對到正下方最近的字
 * 回傳 rows：[{chars: 字數, chords: [{k: 第幾個字, r, m, seven}]}]（照樂譜由上到下）
 */
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

// 一行譜下方的第一行歌詞，切成字
function lyricRowChars(dk, w, h, sys, yEnd) {
  // 水平投影找文字行
  const rowHas = (y) => { let n = 0; for (let x = sys.start; x < sys.end; x++) n += dk[y * w + x]; return n; };
  let y = sys.y1 + 2;
  const lines = [];
  while (y < yEnd && lines.length < 2) {
    while (y < yEnd && rowHas(y) < 2) y++;
    const y0 = y;
    while (y < yEnd && rowHas(y) >= 1) y++;
    if (y - y0 >= 10) lines.push([y0, y - 1]);
  }
  if (!lines.length) return null;
  const [ly0, ly1] = lines[0];
  const lh = ly1 - ly0 + 1;
  // 垂直投影切字：起點在譜的開頭附近（左邊的「一)」「副)」不算）
  const colHas = (x) => { for (let yy = ly0; yy <= ly1; yy++) if (dk[yy * w + x]) return true; return false; };
  const runs = [];
  for (let x = Math.max(0, sys.start - 6); x < w; x++) {
    if (!colHas(x)) continue;
    const x0 = x; while (x < w && colHas(x)) x++;
    runs.push([x0, x - 1]);
  }
  // 中文字由幾塊組成：相鄰而且合起來不超過一個字寬就併起來
  const chars = [];
  for (const r of runs) {
    const last = chars[chars.length - 1];
    if (last && r[1] - last[0] + 1 <= lh * 1.15 && r[0] - last[1] - 1 <= lh * 0.35) last[1] = r[1];
    else chars.push([r[0], r[1]]);
  }
  // 太窄的是標點；太扁的是破折號（─）
  const tall = (c) => {
    let a = ly1, b = ly0;
    for (let yy = ly0; yy <= ly1; yy++) for (let x = c[0]; x <= c[1]; x++) if (dk[yy * w + x]) { if (yy < a) a = yy; if (yy > b) b = yy; break; }
    return b - a + 1;
  };
  return { y0: ly0, y1: ly1, chars: chars.filter((c) => c[1] - c[0] + 1 >= lh * 0.5 && tall(c) >= lh * 0.35).map((c) => ({ x0: c[0], x1: c[1], cx: (c[0] + c[1]) / 2 })) };
}

function chordLyricRows(data) {
  const { width: w, height: h, data: px } = data;
  const dk = new Uint8Array(w * h);
  for (let i = 0, p = 0; i < w * h; i++, p += 4) {
    const r = px[p], g = px[p + 1], b = px[p + 2];
    dk[i] = Math.max(r, g, b) < 120 ? 1 : 0;
  }
  const systems = findSystems(data);
  const chords = readChords(data);
  const rows = [];
  systems.forEach((s, i) => {
    const next = systems[i + 1];
    const yEnd = next ? next.y0 - 30 : h;
    const lr = lyricRowChars(dk, w, h, s, yEnd);
    if (!lr || !lr.chars.length) return;
    const row = { chars: lr.chars.length, box: lr, chords: [] };
    for (const c of chords) {
      const gap = s.y0 - c.y1;
      if (gap <= 0 || gap > 60) continue;
      const nx = c.x + (c.y1 - c.y) * 0.3; // 和弦字母左邊對齊音符，音符中心再往右一點
      let best = 0, bd = 1e9;
      lr.chars.forEach((ch, k) => { const d = Math.abs(ch.cx - nx); if (d < bd) { bd = d; best = k; } });
      row.chords.push({ k: best, r: c.r, m: c.m, seven: c.seven, x: c.x });
    }
    row.chords.sort((a, b) => a.k - b.k);
    rows.push(row);
  });
  return rows;
}
