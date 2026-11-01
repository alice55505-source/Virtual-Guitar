'use strict';
/* ========== 詩歌樂譜（資料來源同 hymn 詩歌本） ========== */
const HYMN_REMOTE = 'https://raw.githubusercontent.com/cmeng-git/hymnchtv/master/hymnchtv/src/main/assets/';
const HYMN_TW = 'https://raw.githubusercontent.com/alice55505-source/hymn/main/';
const HYMN_CATS = {
  db: { label: '大本', score: HYMN_REMOTE + 'lyrics_db_score/db', text: HYMN_REMOTE + 'lyrics_db_text/db' },
  bb: { label: '補充本', score: HYMN_REMOTE + 'lyrics_bb_score/bb', text: HYMN_REMOTE + 'lyrics_bb_text/bb' },
  xg: { label: '新詩', score: HYMN_REMOTE + 'lyrics_xg_score/xg', text: HYMN_REMOTE + 'lyrics_xg_text/xg' },
  xb: { label: '新頌', score: HYMN_REMOTE + 'lyrics_xb_score/xb', text: HYMN_REMOTE + 'lyrics_xb_text/xb' },
  er: { label: '兒詩', score: HYMN_REMOTE + 'lyrics_er_score/', text: HYMN_REMOTE + 'lyrics_er_text/er' },
  tw: { label: '台語', score: HYMN_TW + 'tw/score/tw', text: HYMN_TW + 'tw/text/tw' },
  my: { label: '我的' }, // 自己匯入的圖片（my-songs.js）
};

const OCR_CATS = { db: true, bb: true, xb: true }; // 這幾本的樂譜和弦字型可辨識
const FU_OFFSET = 780; // 大本附1~附6 存成 db781~db786（同 hymn 詩歌本）
let hasFu = false;
const hymnLabel = (cat, num) => cat === 'my' ? (myName(num) || '我的詩歌')
  : HYMN_CATS[cat].label + ' ' + (cat === 'db' && num > FU_OFFSET ? '附' + (num - FU_OFFSET) : num);
let hymn = null; // 目前開啟的詩歌 {cat, num, title}
let pickCat = 'db';
const songPrefs = (() => { try { return JSON.parse(localStorage.getItem('vg-songs') || '{}'); } catch (_) { return {}; } })();
let recent = (() => { try { return JSON.parse(localStorage.getItem('vg-recent') || '[]'); } catch (_) { return []; } })();
const saveSongs = () => { try { localStorage.setItem('vg-songs', JSON.stringify(songPrefs)); localStorage.setItem('vg-recent', JSON.stringify(recent)); } catch (_) {} };

// 每首歌記住自己的升降 Key、速度、刷法
window.onSave = () => {
  if (!hymn) return;
  const p = { shift: state.shift, bpm: state.bpm, pattern: state.pattern };
  // 匯入的圖片沒有調號資料，連調、大小調、拍號一起記
  if (hymn.cat === 'my') Object.assign(p, { sheet: state.sheet, scale: state.scale, meter: state.meter });
  songPrefs[hymn.cat + hymn.num] = p;
  saveSongs();
};

// 從歌詞檔開頭找「降A大调4/4」「b小調 4/4」之類的調號與拍號
const LETTER = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function parseKey(text) {
  const lines = text.split(/\r?\n/).slice(0, 8);
  for (const line of lines) {
    const m = line.trim().match(/(降|升)?\s*([A-Ga-g])\s*([#♯b♭])?\s*([大小])[調调]\s*(\d+\s*\/\s*\d+)?/);
    if (!m) continue;
    let pc = LETTER[m[2].toUpperCase()];
    if (m[1] === '降' || m[3] === 'b' || m[3] === '♭') pc -= 1;
    if (m[1] === '升' || m[3] === '#' || m[3] === '♯') pc += 1;
    return {
      pc: (pc + 12) % 12,
      scale: m[4] === '小' ? 'minor' : 'major',
      meter: m[5] ? m[5].replace(/\s/g, '') : null,
      label: m[0].trim(),
    };
  }
  return null;
}

async function openHymn(cat, num) {
  const c = HYMN_CATS[cat];
  if (playing) stop();
  hymn = { cat, num, title: '' };
  document.body.classList.add('score-mode');
  document.body.classList.remove('show-settings');
  $('hymnTitle').textContent = hymnLabel(cat, num);
  $('hymnMeta').textContent = '';
  closePicker();
  recent = [{ cat, num }].concat(recent.filter((r) => !(r.cat === cat && r.num === num))).slice(0, 8);
  saveSongs();
  if (cat === 'my') { openMySong(num); return; }
  loadScore(cat, num);

  let info = null;
  try {
    const res = await fetch(c.text + num + '.txt');
    if (res.ok) {
      const text = await res.text();
      const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      hymn.title = s2t(lines[1] || '');
      info = parseKey(text);
    }
  } catch (_) {}
  if (!hymn || hymn.cat !== cat || hymn.num !== num) return;
  $('hymnTitle').textContent = hymnLabel(cat, num) + (hymn.title ? ' ' + hymn.title : '');
  // 大本／補充本／新頌的和弦常移到吉他好彈的調，要從樂譜上的和弦判斷
  let chordKey = null;
  if (OCR_CATS[cat]) {
    $('hymnMeta').textContent = '讀取樂譜和弦中…';
    chordKey = await detectChordKey(c.score + num + '.png', info ? info.scale : null, info ? info.pc : null);
    if (!hymn || hymn.cat !== cat || hymn.num !== num) return;
  }
  applySong(info, chordKey);
}

// 依譜設定調、大小調、拍號；再套用這首歌上次的升降 Key／速度／刷法
function applySong(info, chordKey) {
  if (playing) stop();
  const pref = songPrefs[hymn.cat + hymn.num] || {};
  let meta = '';
  if (info) {
    state.scale = info.scale;
    CHORDS = CHORD_SETS[state.scale];
    state.sheet = chordKey ? chordKey.key : info.pc;
    if (info.meter && METERS[info.meter]) state.meter = info.meter;
    const kt = keyTable();
    meta = chordKey && chordKey.key !== info.pc
      ? '和弦 ' + kt[chordKey.key][0] + ' 調（原調 ' + kt[info.pc][0] + '）'
      : kt[info.pc][0] + ' 調';
    if (info.meter) meta += ' ' + info.meter + (METERS[info.meter] ? '' : '（拍號請手動選）');
  } else if (chordKey) {
    state.scale = chordKey.scale;
    CHORDS = CHORD_SETS[state.scale];
    state.sheet = chordKey.key;
    meta = '和弦 ' + keyTable()[chordKey.key][0] + ' 調';
  } else {
    meta = '譜上沒標調，請手動設定';
  }
  if (hymn.cat === 'my') {
    if (pref.sheet !== undefined) {
      state.scale = pref.scale; CHORDS = CHORD_SETS[state.scale]; state.sheet = pref.sheet;
      if (pref.meter && METERS[pref.meter]) state.meter = pref.meter;
      meta = keyTable()[state.sheet][0] + ' 調 ' + state.meter;
    } else if (!chordKey) meta = '請按 ⚙ 設定選調和拍號（會記住）';
  }
  state.shift = pref.shift || 0;
  if (pref.bpm) state.bpm = pref.bpm;
  if (pref.pattern) state.pattern = pref.pattern;
  syncKey();
  lastChord = null;
  current = null;
  $('hymnMeta').textContent = meta;
  save();
  buildSteps();
  render();
}

async function loadScore(cat, num) {
  const base = HYMN_CATS[cat].score + num;
  const box = $('scoreScroll');
  box.innerHTML = '<div class="score-msg">樂譜載入中…</div>';
  // 主頁 + 可能的續頁 a~e
  const extra = await Promise.all(['a', 'b', 'c', 'd', 'e'].map((s) =>
    fetch(base + s + '.png', { method: 'HEAD' }).then((r) => (r.ok ? base + s + '.png' : null)).catch(() => null)));
  if (!hymn || hymn.cat !== cat || hymn.num !== num) return;
  const pages = [base + '.png'].concat(extra.filter(Boolean));
  box.innerHTML = '';
  pages.forEach((src, k) => {
    const wrap = document.createElement('div');
    wrap.className = 'score-page';
    const img = new Image();
    img.alt = '樂譜 ' + (k + 1);
    img.onerror = () => { if (k === 0) box.innerHTML = '<div class="score-msg">這首沒有樂譜圖片</div>'; else wrap.remove(); };
    img.src = src;
    wrap.appendChild(img);
    box.appendChild(wrap);
  });
  box.scrollTop = 0;
}

// 匯入的詩歌：圖片從手機裡讀出來
let myUrls = [];
async function openMySong(id) {
  const box = $('scoreScroll');
  myUrls.forEach((u) => URL.revokeObjectURL(u));
  myUrls = [];
  box.innerHTML = '<div class="score-msg">載入中…</div>';
  let rec = null;
  try { rec = await myGet(id); } catch (_) {}
  if (!hymn || hymn.cat !== 'my' || hymn.num !== id) return;
  if (!rec) { box.innerHTML = '<div class="score-msg">找不到這首（可能已刪除）</div>'; return; }
  $('hymnTitle').textContent = rec.name;
  box.innerHTML = '';
  myUrls = rec.images.map((b) => URL.createObjectURL(b));
  myUrls.forEach((src, k) => {
    const wrap = document.createElement('div');
    wrap.className = 'score-page';
    const img = new Image();
    img.alt = '樂譜 ' + (k + 1);
    img.src = src;
    wrap.appendChild(img);
    box.appendChild(wrap);
  });
  box.scrollTop = 0;
  // 沒存過設定：試著從圖上的洋紅色和弦判斷調（詩歌本截圖可以，一般照片通常讀不到）
  let chordKey = null;
  const pref = songPrefs['my' + id] || {};
  if (pref.sheet === undefined && myUrls[0]) {
    $('hymnMeta').textContent = '讀取樂譜和弦中…';
    chordKey = await detectChordKey(myUrls[0], null, null, 800);
    if (!hymn || hymn.cat !== 'my' || hymn.num !== id) return;
  }
  applySong(null, chordKey);
}

// 上一首／下一首：台語詩歌編號不連續，照目錄跳；其他詩本 ±1（大本 780 之後是附1~附6）
let twList = null;
async function stepHymn(dir) {
  if (!hymn) return;
  const { cat, num } = hymn;
  let next = null;
  if (cat === 'my') {
    const k = myList.findIndex((m) => m.id === num);
    next = k >= 0 && myList[k + dir] ? myList[k + dir].id : null;
  } else if (cat === 'tw') {
    if (!twList) {
      try {
        const t = await (await fetch(HYMN_TW + 'tw/toc.txt')).text();
        twList = [...t.matchAll(/#(\d+)/g)].map((m) => +m[1]).sort((a, b) => a - b);
      } catch (_) { twList = []; }
    }
    const k = twList.indexOf(num);
    next = k >= 0 ? twList[k + dir] : twList.find((n) => (dir > 0 ? n > num : n < num));
  } else {
    next = num + dir;
    if (cat === 'db' && next > FU_OFFSET + 6) next = null;
  }
  if (next !== null && next !== undefined && next >= 1) openHymn(cat, next);
}

function closeHymn() {
  if (playing) stop();
  hymn = null;
  document.body.classList.remove('score-mode', 'show-settings');
  $('scoreScroll').innerHTML = '';
}

/* ---------- 選歌 ---------- */
function openPicker() {
  $('hymnPicker').classList.remove('hidden');
  renderPicker();
  if (pickCat !== 'my') setTimeout(() => $('hymnNum').focus(), 50);
}
function closePicker() { $('hymnPicker').classList.add('hidden'); }

function renderPicker() {
  $('hymnCats').innerHTML = '';
  Object.entries(HYMN_CATS).forEach(([k, c]) => {
    const b = document.createElement('button');
    b.textContent = c.label;
    b.classList.toggle('on', k === pickCat);
    b.onclick = () => { pickCat = k; if (k !== 'db') hasFu = false; renderPicker(); if (k !== 'my') $('hymnNum').focus(); };
    $('hymnCats').appendChild(b);
  });
  $('hymnRecent').innerHTML = '';
  recent.forEach((r) => {
    const b = document.createElement('button');
    b.textContent = hymnLabel(r.cat, r.num);
    b.onclick = () => openHymn(r.cat, r.num);
    $('hymnRecent').appendChild(b);
  });
  // 我的：列出匯入的詩歌，可開啟、刪除、匯入新的
  const my = pickCat === 'my';
  $('pickerNum').style.display = my ? 'none' : '';
  $('myWrap').style.display = my ? '' : 'none';
  if (my) renderMyList();
  $('hymnFu').style.display = pickCat === 'db' ? '' : 'none';
  $('hymnFu').classList.toggle('on', hasFu);
  $('hymnNum').placeholder = hasFu ? '附詩歌 1～6' : '輸入詩歌編號';
  $('hymnRecentWrap').style.display = recent.length ? '' : 'none';
}

function renderMyList() {
  const box = $('myList');
  box.innerHTML = myList.length ? '' : '<div class="picker-note">還沒有匯入的詩歌</div>';
  myList.forEach((m) => {
    const row = document.createElement('div');
    row.className = 'my-row';
    const open = document.createElement('button');
    open.className = 'my-open';
    open.textContent = m.name;
    open.onclick = () => openHymn('my', m.id);
    const del = document.createElement('button');
    del.className = 'my-del';
    del.textContent = '刪除';
    del.onclick = async () => {
      if (!confirm('刪除「' + m.name + '」？')) return;
      await myDelete(m.id);
      delete songPrefs['my' + m.id];
      recent = recent.filter((r) => !(r.cat === 'my' && r.num === m.id));
      saveSongs();
      await myRefresh();
      if (hymn && hymn.cat === 'my' && hymn.num === m.id) closeHymn();
      renderPicker();
    };
    row.append(open, del);
    box.appendChild(row);
  });
}

function submitPicker() {
  const n = parseInt($('hymnNum').value, 10);
  if (!n || n < 1) { $('hymnNum').focus(); return; }
  const fu = hasFu && pickCat === 'db';
  if (fu && n > 6) { alert('大本附詩歌編號為 1 至 6'); return; }
  $('hymnNum').value = '';
  hasFu = false;
  openHymn(pickCat, fu ? FU_OFFSET + n : n);
}

$('hymnBtn').addEventListener('click', openPicker);
$('myImport').addEventListener('click', () => $('myFile').click());
$('myFile').addEventListener('change', async (e) => {
  const files = e.target.files;
  if (!files || !files.length) return;
  const id = await myImport(files);
  e.target.value = '';
  if (id) openHymn('my', id);
});
myRefresh().then(() => { if (!$('hymnPicker').classList.contains('hidden')) renderPicker(); });
$('hymnPickerClose').addEventListener('click', closePicker);
$('hymnGo').addEventListener('click', submitPicker);
$('hymnFu').addEventListener('click', () => { hasFu = !hasFu; renderPicker(); $('hymnNum').focus(); });
$('hymnNum').addEventListener('keydown', (e) => { if (e.key === 'Enter') submitPicker(); });
$('hymnPicker').addEventListener('click', (e) => { if (e.target.id === 'hymnPicker') closePicker(); });
$('hymnClose').addEventListener('click', closeHymn);
$('hymnSwitch').addEventListener('click', openPicker);
$('prevHymn').addEventListener('click', () => stepHymn(-1));
$('nextHymn').addEventListener('click', () => stepHymn(1));
$('settingsBtn').addEventListener('click', () => document.body.classList.toggle('show-settings'));
