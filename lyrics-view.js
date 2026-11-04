'use strict';
/* ========== 歌詞和弦：歌詞上方標和弦，點和弦就彈 ==========
 * 和弦位置：先從樂譜圖片自動對位（chord-lyrics.js），可以手動修改，改過的存在手機。
 * 位置用「這一段第幾個字」記；每一節共用第一節的位置，副歌另外一組。
 * 和弦用「距譜上主音幾個半音 + 性質」記，換調、升降 Key 會跟著變。
 */
const isHan = (ch) => /[㐀-鿿豈-﫿]/.test(ch);
const MARK = /^[（(]?(副歌?|[一二三四五六七八九十]+)[)）]?$/;
let lyrView = (() => { try { return localStorage.getItem('vg-view') === 'lyrics'; } catch (_) { return false; } })();
let lyrEdit = false;
// 歌詞字體大小（px），記在手機
let lyrFont = (() => { try { return +localStorage.getItem('vg-lyr-font') || 24; } catch (_) { return 24; } })();
function setLyrFont(v) {
  lyrFont = Math.max(16, Math.min(44, v));
  try { localStorage.setItem('vg-lyr-font', lyrFont); } catch (_) {}
  $('lyricsBox').style.setProperty('--lyr-font', lyrFont + 'px');
}

// 文字檔 → 段落 [{label, chorus, lines}]
function parseLyricBlocks(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  let i = lines.findIndex((l) => MARK.test(l));
  const blocks = [];
  if (i < 0) {
    // 沒有段落標記：跳過標題區（到調號那一行為止）
    let k = lines.findIndex((l) => /[大小][調调]/.test(l));
    if (k < 0) k = 2;
    blocks.push({ label: '', chorus: false, lines: [] });
    for (const l of lines.slice(k + 1)) if (l) blocks[0].lines.push(s2t(l));
  } else {
    for (; i < lines.length; i++) {
      const l = lines[i];
      if (!l) continue;
      const m = l.match(MARK);
      if (m) blocks.push({ label: m[1].startsWith('副') ? '副' : m[1], chorus: m[1].startsWith('副'), lines: [] });
      else if (blocks.length) blocks[blocks.length - 1].lines.push(s2t(l));
    }
  }
  return blocks.filter((b) => b.lines.length);
}
const hanCount = (block) => (block ? block.lines.join('').split('').filter(isHan).length : 0);

// 自動對位：把樂譜每一行的「第幾個字」接起來，對到 第一節＋副歌 的字
async function autoChordMap(pages, blocks, sheetKey) {
  const map = { verse: {}, chorus: {} };
  const v = blocks.find((b) => !b.chorus), c = blocks.find((b) => b.chorus);
  const V = hanCount(v), C = hanCount(c);
  const rows = [];
  for (const u of pages) {
    try { rows.push(...chordLyricRows(await loadImageData(u))); } catch (_) {}
  }
  const total = rows.reduce((s, r) => s + r.chars, 0);
  if (!total || !V) return map;
  const scale = total === V + C ? 1 : (V + C) / total;
  let off = 0;
  for (const r of rows) {
    for (const ch of r.chords) {
      const g = Math.round((off + ch.k) * scale);
      const chord = { off: (ch.r - sheetKey + 12) % 12, q: (ch.m ? 'm' : '') + (ch.seven ? '7' : '') };
      if (g < V) map.verse[g] = chord;
      else if (C) map.chorus[Math.min(C - 1, g - V)] = chord;
    }
    off += r.chars;
  }
  return map;
}

/* ---------- 雲端（functions/api/chords.js）：大家共用改過的和弦；手機只留一份快取給離線用 ---------- */
const lyrStoreKey = () => 'vg-cl-' + hymn.cat + hymn.num;
const songId = () => hymn.cat + hymn.num;
const readCache = () => { try { return JSON.parse(localStorage.getItem(lyrStoreKey()) || 'null'); } catch (_) { return null; } };
const writeCache = (d) => { try { if (d) localStorage.setItem(lyrStoreKey(), JSON.stringify(d)); else localStorage.removeItem(lyrStoreKey()); } catch (_) {} };
let editKey = (() => { try { return localStorage.getItem('vg-edit-key2') || ''; } catch (_) { return ''; } })();

// 讀雲端：有 → 用雲端並快取；雲端沒有 → 只保留舊版「只存在手機」的修改；連不到 → 用快取
async function loadSavedMap() {
  const cache = readCache();
  try {
    const r = await fetch('api/chords?song=' + songId(), { cache: 'no-store' });
    if (r.ok) { const d = await r.json(); writeCache(d); return d; }
    if (r.status === 404) {
      if (cache && !cache.updated) return Object.assign(cache, { localOnly: true }); // 舊版只存在這支手機的修改
      writeCache(null);
      return null;
    }
  } catch (_) {}
  return cache;
}

// 存到雲端（要密碼）
async function saveMap() {
  const data = { map: hymn.lyr.map, sheet: hymn.lyr.sheet };
  try {
    const r = await fetch('api/chords?song=' + songId(), { method: 'PUT', headers: { 'X-Edit-Key': editKey, 'content-type': 'application/json' }, body: JSON.stringify(data) });
    if (r.status === 401) { editKey = ''; try { localStorage.removeItem('vg-edit-key2'); } catch (_) {} alert('編輯密碼錯誤，請重新輸入'); return false; }
    if (!r.ok) throw new Error(r.status);
    data.updated = new Date().toISOString();
    writeCache(data);
    hymn.lyr.localOnly = false;
    return true;
  } catch (_) {
    alert('上傳失敗（沒有網路或雲端尚未設定），這次修改沒有存到雲端');
    return false;
  }
}

// 進入編輯前確認密碼（記在這支手機，之後不用再輸入）
async function unlockEdit() {
  if (editKey) return true;
  const pw = prompt('請輸入編輯密碼（只有負責的同工可以改和弦）');
  if (!pw) return false;
  try {
    const r = await fetch('api/auth', { method: 'POST', headers: { 'X-Edit-Key': pw } });
    if (r.status === 401) { alert('密碼錯誤'); return false; }
    if (!r.ok) throw new Error(r.status);
  } catch (_) { alert('連不到雲端，暫時不能修改'); return false; }
  editKey = pw;
  try { localStorage.setItem('vg-edit-key2', pw); } catch (_) {}
  return true;
}

// 開歌時呼叫：準備歌詞與和弦（自動或已存的）
async function prepareLyrics(text, pages) {
  const h = hymn;
  const blocks = text ? parseLyricBlocks(text) : [];
  h.lyr = { blocks, map: { verse: {}, chorus: {} }, sheet: state.sheet, auto: false, seq: [] };
  lyrPos = -1;
  updateLyrButtons();
  if (!blocks.length) return;
  const saved = await loadSavedMap();
  if (hymn !== h) return;
  if (saved) {
    h.lyr.map = saved.map;
    h.lyr.localOnly = !!saved.localOnly;
    // 存的時候的主音跟現在不同（例如改了譜上的調）：換算成現在的
    const d = (saved.sheet - state.sheet + 12) % 12;
    if (d) for (const part of ['verse', 'chorus']) for (const k in h.lyr.map[part]) h.lyr.map[part][k].off = (h.lyr.map[part][k].off + d) % 12;
    h.lyr.sheet = state.sheet;
  } else if (OCR_CATS[h.cat] && pages && pages.length) {
    const m = await autoChordMap(pages, blocks, state.sheet);
    if (hymn !== h) return;
    h.lyr.map = m; h.lyr.auto = true;
  }
  if (lyrView) renderLyrics();
}

function updateLyrButtons() {
  const has = !!(hymn && hymn.lyr && hymn.lyr.blocks.length);
  $('stepBar').style.display = has && lyrView && !lyrEdit ? '' : 'none';
  $('lyrBtn').style.display = has ? '' : 'none';
  $('lyrBtn').textContent = lyrView ? '🎼 樂譜' : '📝 歌詞';
  $('lyrEditBtn').style.display = has && lyrView ? '' : 'none';
  $('lyrEditBtn').textContent = lyrEdit ? '✓ 完成' : '✎ 改和弦';
  $('lyrEditBtn').classList.toggle('on', lyrEdit);
  document.body.classList.toggle('lyr-view', has && lyrView);
}

function renderLyrics() {
  const box = $('lyricsBox');
  updateLyrButtons();
  if (!hymn || !hymn.lyr || !lyrView) { box.innerHTML = ''; return; }
  const { blocks, map } = hymn.lyr;
  box.innerHTML = '';
  hymn.lyr.seq = []; // 照歌詞順序的所有和弦（點一下換下一個用）
  box.insertAdjacentHTML('beforeend', '<div class="lyr-zoom"><button data-z="-3">A−</button><button data-z="3">A＋</button></div>');
  box.querySelectorAll('.lyr-zoom button').forEach((b) => { b.onclick = () => setLyrFont(lyrFont + +b.dataset.z); });
  if (lyrEdit) box.insertAdjacentHTML('beforeend', '<div class="lyr-tip">點字加和弦、點和弦修改，改完自動存到雲端給大家用；每一節共用第一節的和弦位置。<button id="lyrReset">還原自動</button></div>');
  else if (hymn.lyr.localOnly) box.insertAdjacentHTML('beforeend', '<div class="lyr-tip">這首是之前只存在這支手機的修改；按「✎ 改和弦」輸入密碼後會上傳給大家。</div>');
  else if (hymn.lyr.auto) box.insertAdjacentHTML('beforeend', '<div class="lyr-tip">和弦位置是自動對的，有錯可按「✎ 改和弦」修正。點和弦就會彈。</div>');
  blocks.forEach((b) => {
    const part = b.chorus ? 'chorus' : 'verse';
    const bm = map[part] || {};
    const el = document.createElement('div');
    el.className = 'lyr-block' + (b.chorus ? ' chorus' : '');
    if (b.label) el.insertAdjacentHTML('beforeend', '<div class="lyr-label">' + (b.chorus ? '副歌' : b.label) + '</div>');
    let k = 0;
    b.lines.forEach((line) => {
      const ln = document.createElement('div');
      ln.className = 'lyr-line';
      for (const ch of line) {
        const cell = document.createElement('span');
        cell.className = 'lc';
        if (isHan(ch)) {
          const c = bm[k];
          cell.dataset.part = part; cell.dataset.k = k;
          if (c) { cell.dataset.seq = hymn.lyr.seq.length; hymn.lyr.seq.push(c); }
          cell.innerHTML = '<span class="chip' + (c ? '' : ' empty') + '">' + (c ? chordName(c) : '') + '</span><span class="t"></span>';
          cell.querySelector('.t').textContent = ch;
          k++;
        } else {
          cell.innerHTML = '<span class="chip empty"></span><span class="t p"></span>';
          cell.querySelector('.t').textContent = ch;
        }
        ln.appendChild(cell);
      }
      el.appendChild(ln);
    });
    box.appendChild(el);
  });
  if (lyrPos >= hymn.lyr.seq.length) lyrPos = -1;
  markSeq(false);
  const rs = $('lyrReset');
  if (rs) rs.onclick = async () => {
    if (!confirm('清除大家共用的修改，回到自動對位？')) return;
    try {
      const r = await fetch('api/chords?song=' + songId(), { method: 'DELETE', headers: { 'X-Edit-Key': editKey } });
      if (!r.ok) throw new Error(r.status);
    } catch (_) { alert('雲端刪除失敗，請確認網路'); return; }
    writeCache(null);
    hymn.lyr.map = { verse: {}, chorus: {} };
    box.innerHTML = '<div class="lyr-tip">重新對位中…</div>';
    if (OCR_CATS[hymn.cat] && hymn.pages) { hymn.lyr.map = await autoChordMap(hymn.pages, hymn.lyr.blocks, state.sheet); hymn.lyr.auto = true; }
    hymn.lyr.sheet = state.sheet;
    renderLyrics();
  };
}

// 點和弦 → 彈；編輯模式點字 → 選和弦
function onLyricsTap(e) {
  const cell = e.target.closest('.lc');
  if (!cell || cell.dataset.k === undefined || !hymn || !hymn.lyr) return;
  const part = cell.dataset.part, k = +cell.dataset.k;
  const c = hymn.lyr.map[part][k];
  if (lyrEdit) { openChordEditor(part, k); return; }
  if (c && e.target.closest('.chip')) { e.preventDefault(); goSeq(+cell.dataset.seq); }
}

/* ---------- 點一下換下一個和弦 ---------- */
let lyrPos = -1; // 目前彈到第幾個和弦（-1 = 還沒開始）
function goSeq(i) {
  const seq = hymn && hymn.lyr && hymn.lyr.seq;
  if (!seq || !seq.length) return;
  if (i >= seq.length) { lyrPos = -1; if (playing) stop(); markSeq(); return; } // 唱完了
  lyrPos = Math.max(0, i);
  const c = seq[lyrPos];
  pressChordObj({ off: c.off, q: c.q });
  markSeq(true);
}
// 框出目前的和弦、淡淡標出下一個，並捲到看得到
function markSeq(scroll) {
  const box = $('lyricsBox');
  box.querySelectorAll('.lc.cur, .lc.nxt').forEach((e) => e.classList.remove('cur', 'nxt'));
  const cur = box.querySelector('.lc[data-seq="' + lyrPos + '"]');
  const nxt = box.querySelector('.lc[data-seq="' + (lyrPos + 1) + '"]');
  if (cur) cur.classList.add('cur');
  if (nxt) nxt.classList.add('nxt');
  if (scroll && cur) cur.scrollIntoView({ block: 'center', behavior: 'smooth' });
  const seq = (hymn && hymn.lyr && hymn.lyr.seq) || [];
  const n = seq[lyrPos + 1];
  $('stepNext').innerHTML = lyrPos < 0
    ? (seq.length ? '▶ 從頭開始：<b>' + chordName(seq[0]) + '</b>' : '這首還沒有和弦')
    : n ? '下一個 <b>' + chordName(n) + '</b> ▶' : '■ 結束';
  $('stepPrev').disabled = lyrPos <= 0;
}

function openChordEditor(part, k) {
  const pop = $('chordPop');
  const grid = $('chordPopGrid');
  grid.innerHTML = '';
  CHORD_SETS[state.scale].forEach((c) => {
    const b = document.createElement('button');
    b.textContent = chordName({ off: c.off, q: c.q });
    b.onclick = () => setLyrChord(part, k, { off: c.off, q: c.q });
    grid.appendChild(b);
  });
  $('chordPopDel').onclick = () => setLyrChord(part, k, null);
  pop.classList.remove('hidden');
}
function setLyrChord(part, k, c) {
  if (c) hymn.lyr.map[part][k] = c; else delete hymn.lyr.map[part][k];
  hymn.lyr.auto = false;
  hymn.lyr.sheet = state.sheet;
  saveMap();
  $('chordPop').classList.add('hidden');
  renderLyrics();
}

$('lyricsBox').addEventListener('pointerdown', onLyricsTap);
setLyrFont(lyrFont);
$('lyrBtn').addEventListener('click', () => {
  lyrView = !lyrView; lyrEdit = false;
  try { localStorage.setItem('vg-view', lyrView ? 'lyrics' : 'score'); } catch (_) {}
  renderLyrics();
});
$('lyrEditBtn').addEventListener('click', async () => {
  if (!lyrEdit && !(await unlockEdit())) return;
  lyrEdit = !lyrEdit;
  // 舊版只存在手機的修改：解鎖後順便上傳給大家
  if (lyrEdit && hymn && hymn.lyr && hymn.lyr.localOnly) await saveMap();
  renderLyrics();
});
// 歌詞版可以把和弦鍵、起音收起來，讓歌詞有更多空間（記在手機）
let padHidden = (() => { try { return localStorage.getItem('vg-pad-hidden') === '1'; } catch (_) { return false; } })();
function applyPadHidden() {
  document.body.classList.toggle('pad-hidden', padHidden);
  $('padToggle').innerHTML = padHidden ? '展開<br>按鍵' : '收起<br>按鍵';
}
$('padToggle').addEventListener('click', () => {
  padHidden = !padHidden;
  try { localStorage.setItem('vg-pad-hidden', padHidden ? '1' : '0'); } catch (_) {}
  applyPadHidden();
});
applyPadHidden();
$('stepNext').addEventListener('pointerdown', (e) => { e.preventDefault(); goSeq(lyrPos + 1); });
$('stepPrev').addEventListener('pointerdown', (e) => { e.preventDefault(); if (lyrPos > 0) goSeq(lyrPos - 1); });
$('chordPopCancel').addEventListener('click', () => $('chordPop').classList.add('hidden'));
$('chordPop').addEventListener('click', (e) => { if (e.target.id === 'chordPop') $('chordPop').classList.add('hidden'); });
