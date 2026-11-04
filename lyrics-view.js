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

const lyrStoreKey = () => 'vg-cl-' + hymn.cat + hymn.num;
function loadSavedMap() { try { return JSON.parse(localStorage.getItem(lyrStoreKey()) || 'null'); } catch (_) { return null; } }
function saveMap() { try { localStorage.setItem(lyrStoreKey(), JSON.stringify({ map: hymn.lyr.map, sheet: hymn.lyr.sheet })); } catch (_) {} }

// 開歌時呼叫：準備歌詞與和弦（自動或已存的）
async function prepareLyrics(text, pages) {
  const h = hymn;
  const blocks = text ? parseLyricBlocks(text) : [];
  h.lyr = { blocks, map: { verse: {}, chorus: {} }, sheet: state.sheet, auto: false };
  updateLyrButtons();
  if (!blocks.length) return;
  const saved = loadSavedMap();
  if (saved) {
    h.lyr.map = saved.map;
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
  box.insertAdjacentHTML('beforeend', '<div class="lyr-zoom"><button data-z="-3">A−</button><button data-z="3">A＋</button></div>');
  box.querySelectorAll('.lyr-zoom button').forEach((b) => { b.onclick = () => setLyrFont(lyrFont + +b.dataset.z); });
  if (lyrEdit) box.insertAdjacentHTML('beforeend', '<div class="lyr-tip">點字加和弦、點和弦修改；每一節共用第一節的和弦位置。<button id="lyrReset">還原自動</button></div>');
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
  const rs = $('lyrReset');
  if (rs) rs.onclick = async () => {
    if (!confirm('清除自己改的和弦，回到自動對位？')) return;
    try { localStorage.removeItem(lyrStoreKey()); } catch (_) {}
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
  if (c && e.target.closest('.chip')) { e.preventDefault(); pressChordObj({ off: c.off, q: c.q }); }
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
$('lyrEditBtn').addEventListener('click', () => { lyrEdit = !lyrEdit; renderLyrics(); });
$('chordPopCancel').addEventListener('click', () => $('chordPop').classList.add('hidden'));
$('chordPop').addEventListener('click', (e) => { if (e.target.id === 'chordPop') $('chordPop').classList.add('hidden'); });
