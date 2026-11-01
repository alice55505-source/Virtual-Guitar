'use strict';

/* ========== 樂理資料 ========== */
const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
// 調：名稱、主音半音數、用升記號或降記號拼音（依主音 0~11 排序）
const MAJOR_KEYS = [
  ['C', 0, FLAT], ['Db', 1, FLAT], ['D', 2, SHARP], ['Eb', 3, FLAT], ['E', 4, SHARP], ['F', 5, FLAT],
  ['F#', 6, SHARP], ['G', 7, SHARP], ['Ab', 8, FLAT], ['A', 9, SHARP], ['Bb', 10, FLAT], ['B', 11, SHARP],
];
const MINOR_KEYS = [
  ['Cm', 0, FLAT], ['C#m', 1, SHARP], ['Dm', 2, FLAT], ['Ebm', 3, FLAT], ['Em', 4, SHARP], ['Fm', 5, FLAT],
  ['F#m', 6, SHARP], ['Gm', 7, FLAT], ['G#m', 8, SHARP], ['Am', 9, SHARP], ['Bbm', 10, FLAT], ['Bm', 11, SHARP],
];

const QUALITY = {
  '': [0, 4, 7],
  m: [0, 3, 7],
  '7': [0, 4, 7, 10],
  sus4: [0, 5, 7],
  dim: [0, 3, 6],
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  m7b5: [0, 3, 6, 10],
  sus2: [0, 2, 7],
  '7sus4': [0, 5, 7, 10],
};
const SUFFIX = { m7b5: 'm7♭5' };

// 和弦變化選項：原和弦 / 7 / maj7 / sus2 / sus4
const MODS = [
  ['', '原和弦'], ['7', '7'], ['maj7', 'maj7'], ['sus2', 'sus2'], ['sus4', 'sus4'],
];
const MOD_MAP = {
  '7': { '': '7', m: 'm7', dim: 'm7b5', sus4: '7sus4' },
  maj7: { '': 'maj7', m: 'm7', dim: 'm7b5' },
  sus2: { '': 'sus2', m: 'sus2' },
  sus4: { '': 'sus4', m: 'sus4', '7': '7sus4' },
};
function quality(ch) {
  const base = CHORDS[ch.i].q;
  return (ch.mod && MOD_MAP[ch.mod][base]) || base;
}

// 和弦鍵：級數、相對主音的半音、性質
const CHORD_SETS = {
  major: [
    { deg: 'I', off: 0, q: '', dia: true },
    { deg: 'ii', off: 2, q: 'm', dia: true },
    { deg: 'iii', off: 4, q: 'm', dia: true },
    { deg: 'IV', off: 5, q: '', dia: true },
    { deg: 'V', off: 7, q: '', dia: true },
    { deg: 'vi', off: 9, q: 'm', dia: true },
    { deg: 'Vsus4', off: 7, q: 'sus4' },
    { deg: 'V7', off: 7, q: '7' },
    { deg: 'III', off: 4, q: '' },
    { deg: 'II', off: 2, q: '' },
    { deg: '♭VII', off: 10, q: '' },
    { deg: 'iv', off: 5, q: 'm' },
  ],
  minor: [
    { deg: 'i', off: 0, q: 'm', dia: true },
    { deg: '♭III', off: 3, q: '', dia: true },
    { deg: 'iv', off: 5, q: 'm', dia: true },
    { deg: 'v', off: 7, q: 'm', dia: true },
    { deg: '♭VI', off: 8, q: '', dia: true },
    { deg: '♭VII', off: 10, q: '', dia: true },
    { deg: 'V', off: 7, q: '' },
    { deg: 'V7', off: 7, q: '7' },
    { deg: 'Vsus4', off: 7, q: 'sus4' },
    { deg: 'ii°', off: 2, q: 'dim' },
    { deg: 'IV', off: 5, q: '' },
    { deg: 'I', off: 0, q: '' },
  ],
};
let CHORDS = CHORD_SETS.major;
const keyTable = () => (state.scale === 'minor' ? MINOR_KEYS : MAJOR_KEYS);

// 拍號：每拍幾個步（八分音符）、幾拍、刷法（D 下刷 / U 上刷 / - 空）、
// 分解和弦（弦號：最低音弦算 1，1 = 根音）、拍子單位
const METERS = {
  '4/4': { spb: 2, beats: 4, strum: 'D-DU-UDU', arp: '14546454', unit: '♩' },
  '3/4': { spb: 2, beats: 3, strum: 'D-DUDU', arp: '145654', unit: '♩' },
  '6/8': { spb: 3, beats: 2, strum: 'DDUDDU', arp: '145654', unit: '♩.' },
  '3/2': { spb: 4, beats: 3, strum: 'D-DU-UDUD-DU', arp: '145464546454', unit: '𝅗𝅥' },
  '2/2': { spb: 4, beats: 2, strum: 'D-DU-UDU', arp: '14546454', unit: '𝅗𝅥' },
  '9/8': { spb: 3, beats: 3, strum: 'DDUDDUDDU', arp: '145654654', unit: '♩.' },
  '6/4': { spb: 2, beats: 6, strum: 'D-DUDUD-DUDU', arp: '145654145654', unit: '♩' },
};

/* ========== 狀態 ========== */
const state = {
  mode: 'sheet',
  key: 0,
  sheet: null,
  scale: 'major',
  mod: '',
  meter: '4/4',
  bpm: 80,
  pattern: 'strum',
};
try { Object.assign(state, JSON.parse(localStorage.getItem('vg-settings') || '{}')); } catch (_) {}
if (!METERS[state.meter]) state.meter = '4/4';
if (!CHORD_SETS[state.scale]) state.scale = 'major';
delete state.change; delete state.v2;
CHORDS = CHORD_SETS[state.scale];
state.mod = ''; // 和弦變化列已移除，一律用原和弦
if (state.sheet === null || state.sheet === undefined) state.sheet = state.key;
// 升降 Key：shift = 要彈的調 − 譜上的調（−6 ~ +6 半音）
if (typeof state.shift !== 'number') {
  const d = ((state.key - state.sheet) % 12 + 12) % 12;
  state.shift = d > 6 ? d - 12 : d;
}
delete state.mode;
const syncKey = () => { state.key = ((state.sheet + state.shift) % 12 + 12) % 12; };
syncKey();
const save = () => { try { localStorage.setItem('vg-settings', JSON.stringify(state)); } catch (_) {} };

let current = null;   // 正在彈的和弦 {i, mod}
let pending = null;   // 等下一拍生效的和弦 {i, mod}
const same = (a, b) => !!a && !!b && a.i === b.i && a.mod === b.mod;
let playing = false;

/* ========== 和弦名稱 / 音高 ========== */
// view: 'sheet' 譜上的和弦名 / 'abs' 實際彈出的和弦名
function chordName(ch, view = 'sheet') {
  const c = CHORDS[ch.i];
  const k = keyTable()[view === 'abs' ? state.key : state.sheet];
  const q = quality(ch);
  return k[2][(k[1] + c.off) % 12] + (SUFFIX[q] || q);
}
function rootPc(ch) { return (state.key + CHORDS[ch.i].off) % 12; }

// 產生 6 弦的 MIDI 音高：低音根音在 E2~D#3，往上依序疊和弦音（間隔 ≥3 半音，像吉他弦距）
function voicing(ch) {
  const pc = rootPc(ch);
  const iv = QUALITY[quality(ch)];
  const set = new Set(iv.map((x) => (x + pc) % 12));
  let bass = 40 + ((pc - 4 + 12) % 12);
  const notes = [bass];
  let n = bass;
  while (notes.length < 6) {
    n++;
    if (set.has(n % 12) && n - notes[notes.length - 1] >= 3) notes.push(n);
  }
  // 確保每個和弦音都有：缺的音替換掉重複的音（不動低音）
  for (const pcNeed of set) {
    if (notes.some((x) => x % 12 === pcNeed)) continue;
    for (let k = notes.length - 1; k >= 1; k--) {
      const cnt = notes.filter((x) => x % 12 === notes[k] % 12).length;
      if (cnt < 2) continue;
      const cand = [1, -1, 2, -2, 3, -3].map((d) => notes[k] + d).find((x) => x % 12 === pcNeed);
      if (cand !== undefined) { notes[k] = cand; break; }
    }
  }
  notes.sort((x, y) => x - y);
  return notes;
}

/* ========== 音訊：Karplus-Strong 撥弦 ========== */
let ctx = null, master = null;
const bufCache = new Map();
const strings = new Array(6).fill(null); // 每條弦目前發聲中的 {src, gain}
const voices = []; // 所有已排程的音 {src, gain, t}

function initAudio() {
  if (ctx) return;
  ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
  const body = ctx.createBiquadFilter();
  body.type = 'peaking'; body.frequency.value = 220; body.Q.value = 1; body.gain.value = 4;
  const low = ctx.createBiquadFilter();
  low.type = 'lowshelf'; low.frequency.value = 160; low.gain.value = 5;
  const air = ctx.createBiquadFilter();
  air.type = 'highshelf'; air.frequency.value = 4000; air.gain.value = -6;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.ratio.value = 4;
  master = ctx.createGain(); master.gain.value = 0.8;
  master.connect(low); low.connect(body); body.connect(air); air.connect(comp); comp.connect(ctx.destination);
  prewarm();
}

function pluckBuffer(midi) {
  if (bufCache.has(midi)) return bufCache.get(midi);
  const sr = ctx.sampleRate;
  const f = 440 * Math.pow(2, (midi - 69) / 12);
  const N = Math.max(2, Math.floor(sr / f - 0.5));
  const len = Math.floor(sr * 3);
  const out = new Float32Array(len);
  // 激發：低通後的雜訊
  let lp = 0;
  for (let i = 0; i < N; i++) {
    lp += 0.55 * ((Math.random() * 2 - 1) - lp);
    out[i] = lp;
  }
  const decay = 0.996 + Math.min(0.0035, (midi - 40) * 0.00006);
  for (let i = N; i < len; i++) {
    out[i] = decay * 0.5 * (out[i - N] + out[i - N - 1 < 0 ? 0 : i - N - 1]);
  }
  // 正規化
  let peak = 0;
  for (let i = 0; i < N * 4; i++) peak = Math.max(peak, Math.abs(out[i]));
  if (peak > 0) for (let i = 0; i < len; i++) out[i] /= peak;
  const buf = ctx.createBuffer(1, len, sr);
  buf.copyToChannel(out, 0);
  const rate = f / (sr / (N + 0.5)); // 修正整數延遲造成的音高誤差
  const item = { buf, rate };
  bufCache.set(midi, item);
  return item;
}

function muteString(s, t) {
  const v = strings[s];
  if (!v) return;
  v.gain.gain.cancelScheduledValues(t);
  v.gain.gain.setValueAtTime(v.gain.gain.value || v.vel, t);
  v.gain.gain.linearRampToValueAtTime(0, t + 0.03);
  try { v.src.stop(t + 0.05); } catch (_) {}
  strings[s] = null;
}

function playString(s, midi, t, vel) {
  muteString(s, t);
  const { buf, rate } = pluckBuffer(midi);
  const src = ctx.createBufferSource();
  src.buffer = buf; src.playbackRate.value = rate;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vel * 0.22, t);
  src.connect(g); g.connect(master);
  src.start(t);
  src.stop(t + 3);
  strings[s] = { src, gain: g, vel: vel * 0.22 };
  const now = ctx.currentTime;
  for (let k = voices.length - 1; k >= 0; k--) if (voices[k].t + 3 < now) voices.splice(k, 1);
  voices.push({ src, gain: g, t, s, vel: vel * 0.22 });
}

// 立刻消掉所有聲音：已在響的淡出，還沒開始的（排程中的舊和弦）直接取消
function cutAll(now) {
  for (const v of voices) {
    if (v.t > now) { try { v.src.stop(0); } catch (_) {} v.gain.disconnect(); continue; }
    v.gain.gain.cancelScheduledValues(now);
    v.gain.gain.setValueAtTime(v.gain.gain.value, now);
    v.gain.gain.linearRampToValueAtTime(0, now + 0.025);
    try { v.src.stop(now + 0.04); } catch (_) {}
  }
  voices.length = 0;
  strings.fill(null);
}

// dir: 'D' 下刷 / 'U' 上刷；bass: true 時從根音開始刷並加重根音，false 時跳過低音弦讓根音繼續響
function strum(notes, t, dir, vel, dur, bass = true) {
  const span = Math.min(0.04, dur * 0.35);
  if (dir === 'D') {
    if (bass) {
      // 根音先出、最重，其餘弦隨後刷下
      playString(0, notes[0], t, Math.min(1.5, vel * 1.45));
      for (let s = 1; s < 6; s++) playString(s, notes[s], t + 0.012 + (span * (s - 1)) / 5, vel * 0.85);
    } else {
      // 反拍下刷：只刷 2~6 弦
      for (let s = 2; s < 6; s++) playString(s, notes[s], t + (span * (s - 2)) / 4, vel * 0.75);
    }
  } else {
    // 上刷只刷高音 4 條弦，較輕
    for (let k = 0; k < 4; k++) {
      const s = 5 - k;
      playString(s, notes[s], t + (span * k) / 4, vel * 0.6);
    }
  }
}

function stopAll() {
  if (!ctx) return;
  cutAll(ctx.currentTime);
}

// 預先算好常用音高的撥弦聲，避免第一次按某和弦時卡頓
function prewarm() {
  let m = 40;
  const job = () => {
    for (let k = 0; k < 4 && m <= 80; k++, m++) pluckBuffer(m);
    if (m <= 80) setTimeout(job, 0);
  };
  job();
}

/* ========== 排程器 ========== */
let step = 0, nextTime = 0, timer = null, lastChord = null;
const visQueue = [];

function stepDur() {
  const m = METERS[state.meter];
  return 60 / state.bpm / m.spb;
}

// 已排程的拍點時間（用來判斷按鍵最接近哪一拍）
let beatHist = [];
let pendingAt = 0; // 對齊拍子模式：pending 和弦生效的時間

// 取消 time 之後已排程的音，並把排程退回到那個時間點（節拍格線不變）
function rewindFrom(time) {
  for (let k = voices.length - 1; k >= 0; k--) {
    const v = voices[k];
    if (v.t >= time - 1e-4) {
      try { v.src.stop(0); } catch (_) {}
      v.gain.disconnect();
      voices.splice(k, 1);
    }
  }
  strings.fill(null);
  for (const v of voices) if (!strings[v.s] || strings[v.s].t <= v.t) strings[v.s] = v;
  const k = visQueue.findIndex((v) => v.t >= time - 1e-4);
  if (k >= 0) {
    step = visQueue[k].step;
    nextTime = visQueue[k].t;
    visQueue.length = k;
  }
  beatHist = beatHist.filter((b) => b < time - 1e-4);
}

// 下一拍的時間
function nextBeatTime(now) {
  const fut = beatHist.filter((b) => b > now);
  if (fut.length) return Math.min(...fut);
  const spb = METERS[state.meter].spb;
  return nextTime + ((spb - (step % spb)) % spb) * stepDur();
}
function lastBeatTime(now) {
  const past = beatHist.filter((b) => b <= now);
  return past.length ? Math.max(...past) : -Infinity;
}

// 立即換和弦：取消已排程的舊和弦、馬上刷一下新和弦，節拍格線不變
let quietUntil = 0;
function changeNow() {
  const now = ctx.currentTime;
  rewindFrom(now);
  cutAll(now);
  const t = now + 0.005;
  const notes = voicing(current);
  lastChord = current;
  if (state.pattern === 'arp') playString(0, notes[0], t, 1);
  else strum(notes, t, 'D', 1, stepDur());
  // 太靠近的下一拍就不重複刷，避免連兩下
  quietUntil = now + Math.min(0.12, stepDur() * 0.6);
  scheduler();
}

function scheduleStep(i, t) {
  const m = METERS[state.meter];
  const dur = stepDur();
  const isBeat = i % m.spb === 0;
  if (isBeat) { beatHist.push(t); if (beatHist.length > 16) beatHist.shift(); }
  if (pending !== null) {
    const due = isBeat && t >= pendingAt - 1e-3;
    if (due) { current = pending; pending = null; }
  }
  const chord = current;
  visQueue.push({ t, step: i, chord });
  if (chord === null) return;

  const notes = voicing(chord);
  const accent = i === 0 ? 1 : isBeat ? 0.85 : 0.7;
  if (!same(lastChord, chord)) {
    for (let s = 0; s < 6; s++) muteString(s, t);
    lastChord = chord;
    // 換和弦的那一拍一定從根音完整下刷（就算刷法這一格是空拍）
    if (t >= quietUntil) {
      if (state.pattern === 'arp') playString(0, notes[0], t, 1);
      else strum(notes, t, 'D', Math.max(accent, 0.9), dur, true);
    }
    return;
  }
  if (t < quietUntil) return;

  if (state.pattern === 'strum') {
    const c = m.strum[i];
    if (c === 'D' || c === 'U') strum(notes, t, c, accent, dur, isBeat);
  } else if (state.pattern === 'beat') {
    if (isBeat) strum(notes, t, 'D', accent, dur);
  } else {
    // 分解和弦：照拍號的弦號順序（4/4：根音 4 5 4 6 4 5 4）
    const s = +m.arp[i] - 1;
    playString(s, notes[s], t, s === 0 ? 1.1 : accent * 0.85);
  }
}

function scheduler() {
  const m = METERS[state.meter];
  const total = m.strum.length;
  while (nextTime < ctx.currentTime + 0.12) {
    if (step >= total) step = 0;
    scheduleStep(step, nextTime);
    nextTime += stepDur();
    step = (step + 1) % total;
  }
}

function start() {
  initAudio();
  if (ctx.state === 'suspended') ctx.resume();
  if (current === null) current = { i: 0, mod: state.mod };
  pending = null;
  step = 0;
  beatHist = [];
  quietUntil = 0;
  lastChord = null;
  nextTime = ctx.currentTime + 0.06;
  playing = true;
  timer = setInterval(scheduler, 25);
  scheduler();
  requestWakeLock();
  render();
}

function stop() {
  playing = false;
  clearInterval(timer); timer = null;
  stopAll();
  visQueue.length = 0;
  pending = null;
  releaseWakeLock();
  render();
  drawBeat(-1);
}

/* ========== 起音：簡譜 1~7 ========== */
const SOLFEGE = [['Do', 0], ['Re', 2], ['Mi', 4], ['Fa', 5], ['Sol', 7], ['La', 9], ['Ti', 11]];
// 首調唱名：大調 Do = 主音；小調用 La 小調（Do = 主音往上 3 個半音）
function doPc() { return (state.key + (state.scale === 'minor' ? 3 : 0)) % 12; }
// Do 放在好唱的音域：G3 ~ F#4
function doMidi() { return 55 + ((doPc() - 7 + 12) % 12); }
function noteName(pc) {
  const names = keyTable()[state.key][2];
  return names[pc % 12];
}

// 柔和的持續音（像風琴），方便對音
let lastTone = null;
function playTone(midi, t, len = 0.7) {
  // 連按時先收掉上一個音
  if (lastTone) {
    lastTone.gain.cancelScheduledValues(t);
    lastTone.gain.setValueAtTime(lastTone.gain.value, t);
    lastTone.gain.linearRampToValueAtTime(0, t + 0.03);
  }
  const f = 440 * Math.pow(2, (midi - 69) / 12);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.28, t + 0.03);
  g.gain.setValueAtTime(0.28, t + len - 0.2);
  g.gain.linearRampToValueAtTime(0, t + len);
  g.connect(master);
  lastTone = g;
  [[1, 'triangle', 1], [2, 'sine', 0.25]].forEach(([mul, type, amp]) => {
    const o = ctx.createOscillator();
    const og = ctx.createGain();
    o.type = type; o.frequency.value = f * mul; og.gain.value = amp;
    o.connect(og); og.connect(g);
    o.start(t); o.stop(t + len + 0.05);
  });
}

function playSolfege(k) {
  initAudio();
  if (ctx.state === 'suspended') ctx.resume();
  playTone(doMidi() + SOLFEGE[k][1], ctx.currentTime + 0.01);
}

/* ========== 螢幕常亮 ========== */
let wakeLock = null;
async function requestWakeLock() {
  try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } catch (_) {}
}
function releaseWakeLock() { try { wakeLock && wakeLock.release(); } catch (_) {} wakeLock = null; }
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && playing) requestWakeLock();
});

/* ========== 介面 ========== */
const $ = (id) => document.getElementById(id);
const sheetSel = $('sheetSel'), shiftVal = $('shiftVal'), scaleSel = $('scaleSel'), patternSel = $('patternSel');
const bpmVal = $('bpmVal'), bpmUnit = $('bpmUnit');
const pad = $('pad'), beatsEl = $('beats'), stepsEl = $('steps');
const chordNameEl = $('chordName'), chordSubEl = $('chordSub'), playBtn = $('playBtn');

function buildKeys() {
  for (const sel of [sheetSel]) {
    sel.innerHTML = '';
    keyTable().forEach((k, i) => sel.add(new Option(k[0], i)));
  }
}
buildKeys();
Object.keys(METERS).forEach((m) => {
  const b = document.createElement('button');
  b.textContent = m; b.dataset.meter = m;
  $('meterSeg').appendChild(b);
});

const solButtons = SOLFEGE.map(([name], k) => {
  const b = document.createElement('button');
  b.innerHTML = '<span class="n">' + (k + 1) + '</span><span class="s">' + name + '</span><span class="d"></span>';
  b.addEventListener('pointerdown', (e) => { e.preventDefault(); playSolfege(k); });
  $('solfege').appendChild(b);
  return b;
});

const padButtons = CHORDS.map((c, i) => {
  const b = document.createElement('button');
  b.className = c.dia ? 'diatonic' : '';
  b.innerHTML = '<span class="n"></span><span class="d"></span>';
  b.addEventListener('pointerdown', (e) => { e.preventDefault(); pressChord(i); });
  pad.appendChild(b);
  return b;
});

function pressChord(i) {
  const ch = { i, mod: state.mod };
  if (!playing) {
    current = ch;
    start();
    return;
  }
  if (same(ch, current) && pending === null) return;
  {
    // 對齊拍子：剛過拍點不久 → 算那一拍，馬上換；否則等下一拍
    const now = ctx.currentTime;
    const beatDur = stepDur() * METERS[state.meter].spb;
    const grace = Math.min(0.18, beatDur * 0.3);
    if (now - lastBeatTime(now) <= grace) {
      current = ch; pending = null; changeNow();
    } else if (same(ch, current)) {
      if (pending) { pending = null; rewindFrom(nextBeatTime(now)); }
    } else {
      pendingAt = nextBeatTime(now);
      pending = ch;
      rewindFrom(pendingAt);
      scheduler();
    }
  }
  render();
}



function buildSteps() {
  const m = METERS[state.meter];
  beatsEl.innerHTML = '';
  for (let b = 0; b < m.beats; b++) {
    const d = document.createElement('i');
    if (b === 0) d.className = 'first';
    beatsEl.appendChild(d);
  }
  stepsEl.innerHTML = '';
  const total = m.strum.length;
  for (let i = 0; i < total; i++) {
    const s = document.createElement('span');
    let c = '';
    if (state.pattern === 'strum') c = { D: '↓', U: '↑' }[m.strum[i]] || '·';
    else if (state.pattern === 'beat') c = i % m.spb === 0 ? '↓' : '·';
    else c = m.arp[i] === '1' ? '根' : m.arp[i];
    s.textContent = c;
    if (i % m.spb === 0) s.classList.add('beat');
    stepsEl.appendChild(s);
  }
}

function render() {
  // 模式
  document.querySelectorAll('#meterSeg button').forEach((b) => b.classList.toggle('on', b.dataset.meter === state.meter));
  sheetSel.value = state.sheet;
  scaleSel.value = state.scale;
  patternSel.value = state.pattern;
  bpmVal.textContent = state.bpm;
  bpmUnit.textContent = METERS[state.meter].unit;

  const view = 'sheet';
  const sameAsAbs = state.shift === 0;
  const keyName = keyTable()[state.key][0];
  solButtons.forEach((b, k) => { b.querySelector('.d').textContent = noteName(doPc() + SOLFEGE[k][1]); });
  $('doLabel').textContent = '1 = ' + noteName(doPc()) + (state.scale === 'minor' ? '（6 = ' + keyName.replace('m', '') + '）' : '');
  shiftVal.innerHTML = state.shift === 0
    ? '原調 <small>' + keyName + '</small>'
    : (state.shift > 0 ? '升 ' : '降 ') + Math.abs(state.shift) + ' <small>' + keyName + ' 調</small>';
  padButtons.forEach((b, i) => {
    const ch = { i, mod: state.mod };
    b.querySelector('.n').textContent = chordName(ch, view);
    b.querySelector('.d').textContent = CHORDS[i].deg + (sameAsAbs ? '' : '  (' + chordName(ch, 'abs') + ')');
    b.classList.toggle('on', playing && !!current && current.i === i);
    b.classList.toggle('pending', !!pending && pending.i === i);
  });

  const show = pending !== null ? pending : current;
  if (show === null) {
    chordNameEl.textContent = '—';
    chordNameEl.classList.remove('pending');
  } else {
    chordNameEl.textContent = chordName(show, view);
    chordNameEl.classList.toggle('pending', pending !== null);
  }
  const actual = show !== null && !sameAsAbs ? ' ・ 實際 ' + chordName(show, 'abs') : '';
  chordSubEl.textContent = sameAsAbs
    ? keyName + ' 調'
    : '譜 ' + keyTable()[state.sheet][0] + ' → 實際 ' + keyName + ' 調' + actual;

  playBtn.textContent = playing ? '■ 停止' : '▶ 開始';
  playBtn.classList.toggle('stop', playing);
}

let lastVisStep = -1;
function drawBeat(i) {
  const m = METERS[state.meter];
  const beat = i < 0 ? -1 : Math.floor(i / m.spb);
  beatsEl.querySelectorAll('i').forEach((d, b) => d.classList.toggle('on', b === beat));
  stepsEl.querySelectorAll('span').forEach((s, k) => s.classList.toggle('on', k === i));
}

function frame() {
  if (ctx && playing) {
    let changed = false, item = null;
    while (visQueue.length && visQueue[0].t <= ctx.currentTime) { item = visQueue.shift(); changed = true; }
    if (changed && item.step !== lastVisStep) {
      lastVisStep = item.step;
      drawBeat(item.step);
      if (item.step % METERS[state.meter].spb === 0) render(); // 換和弦生效時更新畫面
    }
  }
  requestAnimationFrame(frame);
}

/* ========== 事件 ========== */
$('meterSeg').addEventListener('click', (e) => {
  const m = e.target.closest('button'); if (!m) return;
  state.meter = m.dataset.meter; save();
  if (playing) { step = 0; visQueue.length = 0; beatHist = []; }
  buildSteps(); render();
});
scaleSel.addEventListener('change', () => {
  state.scale = scaleSel.value;
  CHORDS = CHORD_SETS[state.scale];
  save(); buildKeys(); lastChord = null; render();
});
sheetSel.addEventListener('change', () => { state.sheet = +sheetSel.value; syncKey(); save(); lastChord = null; render(); });
function setShift(v) {
  state.shift = Math.max(-6, Math.min(6, v));
  syncKey(); save(); lastChord = null; render();
}
$('keyDown').addEventListener('click', () => setShift(state.shift - 1));
$('keyUp').addEventListener('click', () => setShift(state.shift + 1));
shiftVal.addEventListener('click', () => setShift(0));
patternSel.addEventListener('change', () => { state.pattern = patternSel.value; save(); buildSteps(); });

function setBpm(v) {
  state.bpm = Math.max(30, Math.min(240, Math.round(v)));
  save(); render();
}
// −/＋：點一下 ±1，按住會連續加減（越按越快）
function holdRepeat(el, delta) {
  let t = null, n = 0;
  const tick = () => { setBpm(state.bpm + delta * (n > 15 ? 5 : 1)); n++; t = setTimeout(tick, n > 3 ? 80 : 300); };
  const end = () => { clearTimeout(t); t = null; };
  el.addEventListener('pointerdown', (e) => { e.preventDefault(); n = 0; end(); tick(); });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => el.addEventListener(ev, end));
}
holdRepeat($('bpmDown'), -1);
holdRepeat($('bpmUp'), 1);

let taps = [];
$('tap').addEventListener('pointerdown', (e) => {
  e.preventDefault();
  const now = performance.now();
  taps = taps.filter((t) => now - t < 2500);
  taps.push(now);
  const el = e.currentTarget;
  el.classList.add('hit'); setTimeout(() => el.classList.remove('hit'), 90);
  if (taps.length >= 2) {
    const gaps = taps.slice(1).map((t, i) => t - taps[i]);
    const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    setBpm(60000 / avg);
  }
});

playBtn.addEventListener('click', () => (playing ? stop() : start()));

// 鍵盤：1~9、0、-、= 對應 12 個和弦；空白鍵開始/停止
const KEYMAP = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='];
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT') return;
  if (e.code === 'Space') { e.preventDefault(); playing ? stop() : start(); return; }
  const k = KEYMAP.indexOf(e.key);
  if (k >= 0) pressChord(k);
});

buildSteps();
render();
requestAnimationFrame(frame);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
