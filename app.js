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
// 相對音準時的參考調：大調用 C，小調用 Am（C 調的關係小調）
const REF = { major: 0, minor: 9 };

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

// 拍號：每拍幾個步（八分音符）、幾拍、刷法（D 下刷 / U 上刷 / - 空）、拍子單位
const METERS = {
  '4/4': { spb: 2, beats: 4, strum: 'D-DU-UDU', unit: '♩' },
  '3/4': { spb: 2, beats: 3, strum: 'D-DUDU', unit: '♩' },
  '6/8': { spb: 3, beats: 2, strum: 'DDUDDU', unit: '♩.' },
  '3/2': { spb: 4, beats: 3, strum: 'D-DU-UDUD-DU', unit: '𝅗𝅥' },
  '2/2': { spb: 4, beats: 2, strum: 'D-DU-UDU', unit: '𝅗𝅥' },
  '9/8': { spb: 3, beats: 3, strum: 'DDUDDUDDU', unit: '♩.' },
  '6/4': { spb: 2, beats: 6, strum: 'D-DUDUD-DUDU', unit: '♩' },
};

/* ========== 狀態 ========== */
const state = {
  mode: 'abs',
  key: 0,
  scale: 'major',
  mod: '',
  meter: '4/4',
  bpm: 80,
  pattern: 'strum',
  change: 'now',
};
try { Object.assign(state, JSON.parse(localStorage.getItem('vg-settings') || '{}')); } catch (_) {}
if (!METERS[state.meter]) state.meter = '4/4';
if (!CHORD_SETS[state.scale]) state.scale = 'major';
CHORDS = CHORD_SETS[state.scale];
if (!MODS.some((m) => m[0] === state.mod)) state.mod = '';
const save = () => { try { localStorage.setItem('vg-settings', JSON.stringify(state)); } catch (_) {} };

let current = null;   // 正在彈的和弦 {i, mod}
let pending = null;   // 等下一小節的和弦 {i, mod}
const same = (a, b) => !!a && !!b && a.i === b.i && a.mod === b.mod;
let playing = false;

/* ========== 和弦名稱 / 音高 ========== */
function chordName(ch, transpose) {
  const c = CHORDS[ch.i];
  const k = keyTable()[transpose ? state.key : REF[state.scale]];
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
  const air = ctx.createBiquadFilter();
  air.type = 'highshelf'; air.frequency.value = 4000; air.gain.value = -6;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.ratio.value = 4;
  master = ctx.createGain(); master.gain.value = 0.8;
  master.connect(body); body.connect(air); air.connect(comp); comp.connect(ctx.destination);
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
  voices.push({ src, gain: g, t });
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

function strum(notes, t, dir, vel, dur) {
  const span = Math.min(0.035, dur * 0.35);
  if (dir === 'D') {
    for (let s = 0; s < 6; s++) playString(s, notes[s], t + (span * s) / 5, vel * (0.85 + 0.03 * s));
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

// 立即換和弦：取消已排程的舊和弦、馬上刷一下新和弦，節拍格線不變
let quietUntil = 0;
function changeNow() {
  const now = ctx.currentTime;
  cutAll(now);
  const k = visQueue.findIndex((v) => v.t > now);
  if (k >= 0) {
    step = visQueue[k].step;
    nextTime = visQueue[k].t;
    visQueue.length = k;
  }
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
  if (i === 0 && pending !== null) {
    current = pending; pending = null;
  }
  const chord = current;
  visQueue.push({ t, step: i, chord });
  if (chord === null) return;

  const notes = voicing(chord);
  if (!same(lastChord, chord)) {
    for (let s = 0; s < 6; s++) muteString(s, t);
    lastChord = chord;
  }
  if (t < quietUntil) return;
  const isBeat = i % m.spb === 0;
  const accent = i === 0 ? 1 : isBeat ? 0.85 : 0.7;

  if (state.pattern === 'strum') {
    const c = m.strum[i];
    if (c === 'D' || c === 'U') strum(notes, t, c, accent, dur);
  } else if (state.pattern === 'beat') {
    if (isBeat) strum(notes, t, 'D', accent, dur);
  } else {
    // 分解和弦：小節第一拍彈根音，中段彈第 5 弦，其餘輪流高音弦
    const total = m.strum.length;
    const half = m.beats % 2 === 0 ? total / 2 : -1;
    let s;
    if (i === 0) s = 0;
    else if (i === half) s = 1;
    else s = [2, 3, 4, 5, 4, 3][(i - 1) % 6];
    playString(s, notes[s], t, accent * 0.95);
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
const keySel = $('keySel'), scaleSel = $('scaleSel'), patternSel = $('patternSel'), changeSel = $('changeSel');
const bpmVal = $('bpmVal'), bpmUnit = $('bpmUnit');
const pad = $('pad'), beatsEl = $('beats'), stepsEl = $('steps');
const chordNameEl = $('chordName'), chordSubEl = $('chordSub'), playBtn = $('playBtn');

function buildKeys() {
  keySel.innerHTML = '';
  keyTable().forEach((k, i) => keySel.add(new Option(k[0], i)));
}
buildKeys();
Object.keys(METERS).forEach((m) => {
  const b = document.createElement('button');
  b.textContent = m; b.dataset.meter = m;
  $('meterSeg').appendChild(b);
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
  if (state.change === 'bar') pending = same(ch, current) ? null : ch;
  else { current = ch; pending = null; changeNow(); }
  render();
}

const modSeg = $('modSeg');
MODS.forEach(([v, label]) => {
  const b = document.createElement('button');
  b.textContent = label; b.dataset.mod = v;
  modSeg.appendChild(b);
});
modSeg.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  state.mod = b.dataset.mod; save(); render();
});

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
    else c = '♪';
    s.textContent = c;
    if (i % m.spb === 0) s.classList.add('beat');
    stepsEl.appendChild(s);
  }
}

function render() {
  // 模式
  document.querySelectorAll('#modeSeg button').forEach((b) => b.classList.toggle('on', b.dataset.mode === state.mode));
  document.querySelectorAll('#meterSeg button').forEach((b) => b.classList.toggle('on', b.dataset.meter === state.meter));
  keySel.value = state.key;
  scaleSel.value = state.scale;
  modSeg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.mod === state.mod));
  patternSel.value = state.pattern;
  changeSel.value = state.change;
  bpmVal.textContent = state.bpm;
  bpmUnit.textContent = METERS[state.meter].unit;

  const abs = state.mode === 'abs';
  padButtons.forEach((b, i) => {
    const ch = { i, mod: state.mod };
    b.querySelector('.n').textContent = chordName(ch, abs);
    b.querySelector('.d').textContent = CHORDS[i].deg + (abs ? '' : '  (' + chordName(ch, true) + ')');
    b.classList.toggle('on', playing && !!current && current.i === i);
    b.classList.toggle('pending', !!pending && pending.i === i);
  });

  const show = pending !== null ? pending : current;
  if (show === null) {
    chordNameEl.textContent = '—';
    chordNameEl.classList.remove('pending');
  } else {
    chordNameEl.textContent = chordName(show, abs);
    chordNameEl.classList.toggle('pending', pending !== null);
  }
  const keyName = keyTable()[state.key][0];
  if (abs) {
    chordSubEl.textContent = keyName + ' 調';
  } else {
    const capo = (state.key - REF[state.scale] + 12) % 12;
    chordSubEl.textContent = '實際 ' + keyName + ' 調' + (capo ? ' ・ 移調夾第 ' + capo + ' 格' : '');
    if (show !== null) chordSubEl.textContent += ' ・ 實際 ' + chordName(show, true);
  }

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
      if (item.step === 0) render(); // 下一小節換和弦時更新畫面
    }
  }
  requestAnimationFrame(frame);
}

/* ========== 事件 ========== */
$('modeSeg').addEventListener('click', (e) => {
  const m = e.target.closest('button'); if (!m) return;
  state.mode = m.dataset.mode; save(); render();
});
$('meterSeg').addEventListener('click', (e) => {
  const m = e.target.closest('button'); if (!m) return;
  state.meter = m.dataset.meter; save();
  if (playing) { step = 0; visQueue.length = 0; }
  buildSteps(); render();
});
scaleSel.addEventListener('change', () => {
  state.scale = scaleSel.value;
  CHORDS = CHORD_SETS[state.scale];
if (!MODS.some((m) => m[0] === state.mod)) state.mod = '';
  save(); buildKeys(); lastChord = null; render();
});
keySel.addEventListener('change', () => { state.key = +keySel.value; save(); lastChord = null; render(); });
patternSel.addEventListener('change', () => { state.pattern = patternSel.value; save(); buildSteps(); });
changeSel.addEventListener('change', () => { state.change = changeSel.value; save(); });

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
