'use strict';

/* ========== 樂理資料 ========== */
const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
// 調：名稱、主音半音數、用升記號或降記號拼音
const KEYS = [
  ['C', 0, FLAT], ['Db', 1, FLAT], ['D', 2, SHARP], ['Eb', 3, FLAT], ['E', 4, SHARP], ['F', 5, FLAT],
  ['F#', 6, SHARP], ['G', 7, SHARP], ['Ab', 8, FLAT], ['A', 9, SHARP], ['Bb', 10, FLAT], ['B', 11, SHARP],
];

const QUALITY = {
  '': [0, 4, 7],
  m: [0, 3, 7],
  '7': [0, 4, 7, 10],
  sus4: [0, 5, 7],
};

// 和弦鍵：級數、相對主音的半音、性質（以 C 調表示）
const CHORDS = [
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
];

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
  meter: '4/4',
  bpm: 80,
  pattern: 'strum',
  change: 'now',
};
try { Object.assign(state, JSON.parse(localStorage.getItem('vg-settings') || '{}')); } catch (_) {}
if (!METERS[state.meter]) state.meter = '4/4';
const save = () => { try { localStorage.setItem('vg-settings', JSON.stringify(state)); } catch (_) {} };

let current = null;   // 正在彈的和弦 index
let pending = null;   // 等下一小節的和弦 index
let playing = false;

/* ========== 和弦名稱 / 音高 ========== */
function chordName(i, transpose) {
  const c = CHORDS[i];
  const k = KEYS[transpose ? state.key : 0];
  const names = k[2];
  return names[(k[1] + c.off) % 12] + c.q;
}
function rootPc(i) { return (KEYS[state.key][1] + CHORDS[i].off) % 12; }

// 產生 6 弦的 MIDI 音高：低音根音在 E2~D#3，往上依序疊和弦音（間隔 ≥3 半音，像吉他弦距）
function voicing(i) {
  const pc = rootPc(i);
  const iv = QUALITY[CHORDS[i].q];
  const set = new Set(iv.map((x) => (x + pc) % 12));
  let bass = 40 + ((pc - 4 + 12) % 12);
  const notes = [bass];
  let n = bass;
  while (notes.length < 6) {
    n++;
    if (set.has(n % 12) && n - notes[notes.length - 1] >= 3) notes.push(n);
  }
  return notes;
}

/* ========== 音訊：Karplus-Strong 撥弦 ========== */
let ctx = null, master = null;
const bufCache = new Map();
const strings = new Array(6).fill(null); // 每條弦目前發聲中的 {src, gain}

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
  for (let s = 0; s < 6; s++) muteString(s, ctx.currentTime);
}

/* ========== 排程器 ========== */
let step = 0, nextTime = 0, timer = null, lastChord = null;
const visQueue = [];

function stepDur() {
  const m = METERS[state.meter];
  return 60 / state.bpm / m.spb;
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
  if (lastChord !== chord) {
    for (let s = 0; s < 6; s++) muteString(s, t);
    lastChord = chord;
  }
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
  if (current === null) current = 0;
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
const keySel = $('keySel'), patternSel = $('patternSel'), changeSel = $('changeSel');
const bpm = $('bpm'), bpmVal = $('bpmVal'), bpmUnit = $('bpmUnit');
const pad = $('pad'), beatsEl = $('beats'), stepsEl = $('steps');
const chordNameEl = $('chordName'), chordSubEl = $('chordSub'), playBtn = $('playBtn');

KEYS.forEach((k, i) => keySel.add(new Option(k[0] + ' 調', i)));
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
  if (!playing) {
    current = i;
    start();
    return;
  }
  if (i === current && pending === null) return;
  if (state.change === 'bar') pending = i === current ? null : i;
  else { current = i; pending = null; }
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
  patternSel.value = state.pattern;
  changeSel.value = state.change;
  bpm.value = state.bpm;
  bpmVal.textContent = state.bpm;
  bpmUnit.textContent = METERS[state.meter].unit;

  const abs = state.mode === 'abs';
  padButtons.forEach((b, i) => {
    b.querySelector('.n').textContent = chordName(i, abs);
    b.querySelector('.d').textContent = CHORDS[i].deg + (abs ? '' : '  (' + chordName(i, true) + ')');
    b.classList.toggle('on', i === current && playing);
    b.classList.toggle('pending', i === pending);
  });

  const show = pending !== null ? pending : current;
  if (show === null) {
    chordNameEl.textContent = '—';
    chordNameEl.classList.remove('pending');
  } else {
    chordNameEl.textContent = chordName(show, abs);
    chordNameEl.classList.toggle('pending', pending !== null);
  }
  const keyName = KEYS[state.key][0];
  if (abs) {
    chordSubEl.textContent = keyName + ' 調';
  } else {
    const capo = KEYS[state.key][1];
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
keySel.addEventListener('change', () => { state.key = +keySel.value; save(); lastChord = null; render(); });
patternSel.addEventListener('change', () => { state.pattern = patternSel.value; save(); buildSteps(); });
changeSel.addEventListener('change', () => { state.change = changeSel.value; save(); });

function setBpm(v) {
  state.bpm = Math.max(30, Math.min(240, Math.round(v)));
  save(); render();
}
bpm.addEventListener('input', () => setBpm(+bpm.value));
$('bpmDown').addEventListener('click', () => setBpm(state.bpm - 1));
$('bpmUp').addEventListener('click', () => setBpm(state.bpm + 1));

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
