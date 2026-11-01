'use strict';
/* ========== 旋律播放（只播旋律） ==========
 * 旋律檔來自 hymnchtv：大本 dm{編號}.mid（附1~6 = 781~786）、補充本 bm{編號}.mid（部分有）。
 * 依目前的速度、實際調（含升降 Key）播放。
 */
const MIDI_BASE = 'https://raw.githubusercontent.com/cmeng-git/hymnchtv/master/hymnchtv/src/main/res/raw/';
const MIDI_PREFIX = { db: 'dm', bb: 'bm' };

// 讀 MIDI：回傳 {tpb, notes: [{t: 開始 tick, d: 長度 tick, p: 音高}]}
function parseMidi(buf) {
  const v = new DataView(buf);
  let pos = 0;
  const str = (n) => { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(v.getUint8(pos + i)); return s; };
  if (str(4) !== 'MThd') throw new Error('not midi');
  const ntrk = v.getUint16(pos + 10), tpb = v.getUint16(pos + 12);
  pos += 8 + v.getUint32(pos + 4);
  const notes = [];
  for (let k = 0; k < ntrk && pos < buf.byteLength; k++) {
    if (str(4) !== 'MTrk') break;
    const end = pos + 8 + v.getUint32(pos + 4);
    pos += 8;
    let t = 0, status = 0;
    const open = {};
    const vlq = () => { let n = 0, b; do { b = v.getUint8(pos++); n = (n << 7) | (b & 0x7f); } while (b & 0x80); return n; };
    while (pos < end) {
      t += vlq();
      let b = v.getUint8(pos);
      if (b & 0x80) { status = b; pos++; } else b = status;
      const type = status & 0xf0;
      if (status === 0xff) { pos++; const len = vlq(); pos += len; continue; }
      if (status === 0xf0 || status === 0xf7) { const len = vlq(); pos += len; continue; }
      if (type === 0x90 || type === 0x80) {
        const p = v.getUint8(pos++), vel = v.getUint8(pos++);
        if (type === 0x90 && vel > 0) open[p] = t;
        else if (open[p] !== undefined) { notes.push({ t: open[p], d: t - open[p], p }); delete open[p]; }
      } else if (type === 0xc0 || type === 0xd0) pos += 1;
      else pos += 2;
    }
    pos = end;
  }
  notes.sort((a, b) => a.t - b.t);
  const t0 = notes.length ? notes[0].t : 0;
  notes.forEach((n) => { n.t -= t0; });
  return { tpb, notes };
}

// 估計旋律的主音（Krumhansl 調性曲線，依音長加權）
const KS = {
  major: [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88],
  minor: [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17],
};
function melodyTonic(notes, scale) {
  const h = new Array(12).fill(0);
  notes.forEach((n) => { h[n.p % 12] += n.d; });
  const prof = KS[scale] || KS.major;
  const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  const mh = mean(h), mp = mean(prof);
  let best = -2, key = 0;
  for (let k = 0; k < 12; k++) {
    let num = 0, dh = 0, dp = 0;
    for (let i = 0; i < 12; i++) {
      const a = h[(i + k) % 12] - mh, b = prof[i] - mp;
      num += a * b; dh += a * a; dp += b * b;
    }
    const r = num / Math.sqrt(dh * dp || 1);
    if (r > best) { best = r; key = k; }
  }
  return key;
}

const UNIT_TICKS = { 四分音符: 1, 八分音符: 0.5, 二分音符: 2, 附點四分音符: 1.5 };

let mel = null; // 播放中的旋律
function melodyPlaying() { return !!mel; }

function startMelody(song, onEnd) {
  stopMelody();
  initAudio();
  if (ctx.state === 'suspended') ctx.resume();
  const tonic = melodyTonic(song.notes, state.scale);
  mel = { song, tonic, idx: 0, onEnd, voices: [] };
  mel.secPerTick = secPerTick(song);
  mel.t0 = ctx.currentTime + 0.15;
  mel.timer = setInterval(scheduleMelody, 25);
  scheduleMelody();
}

function secPerTick(song) {
  const beatTicks = song.tpb * (UNIT_TICKS[METERS[state.meter].unit] || 1);
  return 60 / state.bpm / beatTicks;
}

// 移到實際的調；再整個移八度，讓旋律大約落在 C4~C5 附近好跟唱
function transposeOf() {
  let s = (state.key - mel.tonic + 12) % 12;
  if (s > 6) s -= 12;
  const ps = mel.song.notes.map((n) => n.p).sort((a, b) => a - b);
  const med = ps[ps.length >> 1];
  while (med + s > 72) s -= 12;
  while (med + s < 60) s += 12;
  return s;
}

function scheduleMelody() {
  if (!mel) return;
  // 速度改了就接續目前位置換算
  const spt = secPerTick(mel.song);
  if (Math.abs(spt - mel.secPerTick) > 1e-9) {
    const posTick = (ctx.currentTime - mel.t0) / mel.secPerTick;
    mel.secPerTick = spt;
    mel.t0 = ctx.currentTime - posTick * spt;
  }
  const notes = mel.song.notes;
  const shift = transposeOf();
  while (mel.idx < notes.length) {
    const n = notes[mel.idx];
    const t = mel.t0 + n.t * mel.secPerTick;
    if (t > ctx.currentTime + 0.15) break;
    if (t >= ctx.currentTime - 0.05) mel.voices.push(melodyNote(n.p + shift, t, Math.max(0.08, n.d * mel.secPerTick)));
    mel.idx++;
  }
  const last = notes[notes.length - 1];
  if (mel.idx >= notes.length && ctx.currentTime > mel.t0 + (last.t + last.d) * mel.secPerTick + 0.2) {
    const cb = mel.onEnd;
    stopMelody();
    if (cb) cb();
  }
}

// 旋律音色：柔和的三角波＋一點泛音，音長照譜
function melodyNote(midi, t, len) {
  const f = 440 * Math.pow(2, (midi - 69) / 12);
  const g = ctx.createGain();
  const rel = Math.min(0.12, len * 0.3);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.3, t + 0.02);
  g.gain.setValueAtTime(0.26, t + Math.max(0.03, len - rel));
  g.gain.linearRampToValueAtTime(0, t + len);
  g.connect(master);
  const oscs = [[1, 'triangle', 1], [2, 'sine', 0.2]].map(([mul, type, amp]) => {
    const o = ctx.createOscillator(), og = ctx.createGain();
    o.type = type; o.frequency.value = f * mul; og.gain.value = amp;
    o.connect(og); og.connect(g);
    o.start(t); o.stop(t + len + 0.05);
    return o;
  });
  return { g, oscs };
}

function stopMelody() {
  if (!mel) return;
  clearInterval(mel.timer);
  const now = ctx.currentTime;
  mel.voices.forEach((v) => {
    try {
      v.g.gain.cancelScheduledValues(now);
      v.g.gain.setValueAtTime(v.g.gain.value, now);
      v.g.gain.linearRampToValueAtTime(0, now + 0.04);
      v.oscs.forEach((o) => o.stop(now + 0.06));
    } catch (_) {}
  });
  mel = null;
}

// 讀這首的旋律檔；沒有就回傳 null
async function loadMelody(cat, num) {
  const prefix = MIDI_PREFIX[cat];
  if (!prefix) return null;
  try {
    const res = await fetch(MIDI_BASE + prefix + num + '.mid');
    if (!res.ok) return null;
    const song = parseMidi(await res.arrayBuffer());
    return song.notes.length ? song : null;
  } catch (_) {
    return null;
  }
}
