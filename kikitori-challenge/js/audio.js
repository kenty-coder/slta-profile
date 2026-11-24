// ききとりチャレンジ 音声（読み上げ・効果音）
// 作成者: KENTA SHINKAWA
//
// 読み上げ: <audio> を1つだけ作り、src を差し替えて順番に再生します。
//           （iOS Safari は「ユーザーの操作で一度再生した audio 要素」なら
//             その後は操作なしでも続けて再生できるため。最初のタップで unlock() を呼ぶこと）
// 代読    : 音声ファイルが無い・読めない項目だけ、端末の音声合成（speechSynthesis）で読みます。
//           tools/generate-audio.mjs で mp3 を作るまでの一時的な代替です。
// 効果音  : Web Audio API でその場で合成します（ファイル不要）。
//
// どの関数も例外を外へ出さず、Promise は必ず resolve します（音が出なくてもアプリは止まりません）。

const LOAD_TIMEOUT_MS = 4000;      // この時間内に鳴り始めなければ代読へ
const MISSING_RETRY_MS = 60000;    // 読めなかったファイルを再び試すまでの時間
const TTS_START_TIMEOUT_MS = 2500; // 音声合成がこの時間内に始まらなければあきらめる

const clamp = (v, lo, hi, def) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def;
};
const hasWindow = typeof window !== 'undefined';

// ------------------------------------------------------------
// 再生の状態
// ------------------------------------------------------------
let el = null;            // 使い回す audio 要素
let session = 0;          // 再生のたびに増える番号。番号が変わったら古い再生は打ち切り
let active = false;       // 読み上げ中か
let cancelPending = null; // いま待っている処理（再生・間・代読）を即終了させる関数
let unlocked = false;
let currentUtterance = null; // Chrome で発話中に破棄されないよう参照を持つ
const missing = new Map();   // 読めなかった音声ファイル -> 記録した時刻

function getEl() {
  if (el || !hasWindow || typeof Audio === 'undefined') return el;
  try {
    el = new Audio();
    el.preload = 'auto';
    el.setAttribute('playsinline', '');
    el.setAttribute('webkit-playsinline', '');
  } catch {
    el = null;
  }
  return el;
}

function applyRate(a, rate) {
  try {
    // 速さを変えても声の高さは変えない
    a.preservesPitch = true;
    a.mozPreservesPitch = true;
    a.webkitPreservesPitch = true;
    a.defaultPlaybackRate = rate; // src を替えると playbackRate はこの値に戻る
    a.playbackRate = rate;
  } catch { /* 無視 */ }
}

function isMissing(url) {
  const t = missing.get(url);
  if (t === undefined) return false;
  if (Date.now() - t > MISSING_RETRY_MS) { missing.delete(url); return false; }
  return true;
}

// 無音の短い WAV（iOS の解錠用）
let silentUrl = null;
function getSilentUrl() {
  if (silentUrl) return silentUrl;
  const rate = 8000, n = 400; // 0.05 秒
  const buf = new ArrayBuffer(44 + n);
  const v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
  str(36, 'data'); v.setUint32(40, n, true);
  for (let i = 0; i < n; i++) v.setUint8(44 + i, 128);
  let bin = '';
  new Uint8Array(buf).forEach((b) => { bin += String.fromCharCode(b); });
  silentUrl = 'data:audio/wav;base64,' + btoa(bin);
  return silentUrl;
}

// ------------------------------------------------------------
// 公開: 解錠
// ------------------------------------------------------------
/** 最初のタップ（ユーザー操作の中）で呼ぶ。何度呼んでもよい。 */
export function unlock() {
  try {
    // iOS: 消音スイッチが入っていても効果音が鳴るように（対応している版のみ）
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* 無視 */ }

    const ctx = getCtx();
    if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {});

    if (unlocked) return;
    unlocked = true;

    const a = getEl();
    if (a && !active) {
      const mySession = session;
      a.muted = true;
      a.src = getSilentUrl();
      const restore = () => { if (session === mySession && !active) { try { a.pause(); } catch { /* 無視 */ } } a.muted = false; };
      const p = a.play();
      if (p && p.then) p.then(restore, () => { a.muted = false; }); else restore();
    }

    // 音声合成（代読）も、最初の発話はユーザー操作の中で行う必要がある端末がある
    const synth = hasWindow && window.speechSynthesis;
    if (synth && typeof SpeechSynthesisUtterance !== 'undefined' && !synth.speaking && !synth.pending) {
      synth.getVoices(); // 声の一覧の読み込みを始めさせる
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      u.lang = 'ja-JP';
      synth.speak(u);
    }
  } catch { /* 解錠に失敗しても続行 */ }
}

// ------------------------------------------------------------
// 1項目の再生（ファイル → だめなら代読 → だめなら無音）
// ------------------------------------------------------------
// 戻り値: 'ok'（鳴った）/ 'fail'（鳴らせなかった）/ 'cancel'（打ち切り）
function playFile(url, rate, my) {
  return new Promise((resolve) => {
    const a = getEl();
    if (!a || !url || isMissing(url)) { resolve('fail'); return; }

    let finished = false;
    let timer = null;
    const finish = (result) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      a.removeEventListener('ended', onEnded);
      a.removeEventListener('error', onError);
      a.removeEventListener('playing', onPlaying);
      if (cancelPending === cancel) cancelPending = null;
      resolve(result);
    };
    const cancel = () => finish('cancel');
    const onEnded = () => { if (a.ended) finish('ok'); };
    const onError = () => {
      if (!a.error) return;
      missing.set(url, Date.now());
      finish('fail');
    };
    const onPlaying = () => {
      // 鳴り始めた。あとは終わるのを待つ（念のため、長さ＋余裕で見張る）
      clearTimeout(timer);
      const d = Number.isFinite(a.duration) && a.duration > 0 ? a.duration : 12;
      timer = setTimeout(() => finish('ok'), (d / rate) * 1000 + 3000);
    };

    cancelPending = cancel;
    a.addEventListener('ended', onEnded);
    a.addEventListener('error', onError);
    a.addEventListener('playing', onPlaying);
    timer = setTimeout(() => { try { a.pause(); } catch { /* 無視 */ } finish('fail'); }, LOAD_TIMEOUT_MS);

    try {
      a.muted = false;
      a.src = url;
      applyRate(a, rate);
      const p = a.play();
      if (p && p.catch) {
        p.catch(() => {
          if (my !== session) finish('cancel');
          else finish('fail'); // 読めない・再生が許可されていない など
        });
      }
    } catch {
      finish('fail');
    }
  });
}

// 代読に渡す文字。かなの方が読み間違い（「家」→うち 等）が起きにくい。
// 数字は「4」→し／よん のゆれを避けるため say（ひらがな）を使う。
function fallbackText(item) {
  const text = item && item.text != null ? String(item.text) : '';
  const say = item && item.say != null ? String(item.say) : '';
  if (/^[0-9０-９]+$/.test(text)) return say || text;
  return text || say;
}

function pickJaVoice(voices) {
  const ja = voices.filter((v) => /^ja([-_]|$)/i.test(v.lang || ''));
  return ja.find((v) => v.localService) || ja[0] || null;
}

function speak(text, rate, my) {
  return new Promise((resolve) => {
    const synth = hasWindow && window.speechSynthesis;
    if (!synth || typeof SpeechSynthesisUtterance === 'undefined' || !text) { resolve('fail'); return; }

    let finished = false;
    let startTimer = null;
    let maxTimer = null;
    const finish = (result) => {
      if (finished) return;
      finished = true;
      clearTimeout(startTimer);
      clearTimeout(maxTimer);
      currentUtterance = null;
      if (cancelPending === cancel) cancelPending = null;
      resolve(result);
    };
    const cancel = () => { try { synth.cancel(); } catch { /* 無視 */ } finish('cancel'); };

    try {
      const voices = synth.getVoices() || [];
      const voice = pickJaVoice(voices);
      // 日本語の声が1つも無い端末では、外国語の声で読ませない
      if (voices.length > 0 && !voice) { resolve('fail'); return; }

      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'ja-JP';
      if (voice) u.voice = voice;
      u.rate = clamp(rate, 0.5, 2, 1);
      u.onstart = () => clearTimeout(startTimer);
      u.onend = () => finish(my === session ? 'ok' : 'cancel');
      u.onerror = () => finish(my === session ? 'fail' : 'cancel');

      cancelPending = cancel;
      currentUtterance = u;
      if (synth.speaking || synth.pending) synth.cancel();
      synth.speak(u);
      startTimer = setTimeout(() => { try { synth.cancel(); } catch { /* 無視 */ } finish('fail'); }, TTS_START_TIMEOUT_MS);
      maxTimer = setTimeout(() => finish('ok'), 15000);
    } catch {
      finish('fail');
    }
  });
}

function wait(ms, my) {
  return new Promise((resolve) => {
    if (my !== session || !(ms > 0)) { resolve(); return; }
    let timer = null;
    const done = () => {
      clearTimeout(timer);
      if (cancelPending === done) cancelPending = null;
      resolve();
    };
    cancelPending = done;
    timer = setTimeout(done, ms);
  });
}

// 鳴ったら true
async function playOne(item, rate, my) {
  if (!item) return false;
  let r = await playFile(item.audio, rate, my);
  if (r === 'ok') return true;
  if (r === 'cancel' || my !== session) return false;
  r = await speak(fallbackText(item), rate, my);
  return r === 'ok';
}

// ------------------------------------------------------------
// 公開: 読み上げ
// ------------------------------------------------------------
/**
 * items の音声を順に再生する。各音声が終わってから gapMs 待って次へ。
 * 最後まで再生するか、stop()／新しい再生で打ち切られると resolve（reject はしない）。
 */
export async function playSequence(items, { rate = 1, gapMs = 1000 } = {}) {
  stop();
  const my = ++session;
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  const r = clamp(rate, 0.5, 2, 1);
  const gap = clamp(gapMs, 0, 10000, 1000);
  if (list.length === 0) return;
  active = true;
  try {
    for (let i = 0; i < list.length; i++) {
      if (my !== session) break;
      const sounded = await playOne(list[i], r, my);
      if (my !== session) break;
      // 鳴らせなかった項目のあとは待たずに次へ
      if (sounded && i < list.length - 1) await wait(gap, my);
    }
  } catch { /* 何があっても止めない */ } finally {
    if (my === session) active = false;
  }
}

/** ほめ言葉などを1つ再生する。 */
export function playPhrase(item) {
  return playSequence([item], { rate: 1, gapMs: 0 });
}

/** 読み上げを即停止する。再生中の playSequence / playPhrase は resolve する。 */
export function stop() {
  session++;
  active = false;
  try { if (el) el.pause(); } catch { /* 無視 */ }
  try {
    const synth = hasWindow && window.speechSynthesis;
    if (synth && (synth.speaking || synth.pending)) synth.cancel();
  } catch { /* 無視 */ }
  const c = cancelPending;
  cancelPending = null;
  if (c) { try { c(); } catch { /* 無視 */ } }
}

export function isPlaying() {
  return active;
}

/**
 * 先読み（任意）。ブラウザのキャッシュを温め、無いファイルを先に見つけておく
 * （無いと分かっている項目は、待ち時間なしで代読に切り替わる）。
 */
export function preload(items) {
  try {
    if (typeof fetch !== 'function') return;
    const urls = [...new Set((Array.isArray(items) ? items : []).map((it) => it && it.audio).filter(Boolean))];
    let i = 0;
    const next = () => {
      if (i >= urls.length) return;
      const url = urls[i++];
      fetch(url)
        .then((res) => {
          if (res.ok) { missing.delete(url); return res.arrayBuffer(); }
          if (res.status === 404 || res.status === 410) missing.set(url, Date.now());
          return null;
        })
        .catch(() => {})
        .then(next);
    };
    for (let k = 0; k < 3; k++) next(); // 同時に3つまで
  } catch { /* 無視 */ }
}

// ------------------------------------------------------------
// 効果音（Web Audio API で合成）
// ------------------------------------------------------------
let ctx = null;
let master = null;
let sfxVolume = 0.7;

function getCtx() {
  if (ctx || !hasWindow) return ctx;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = sfxVolume;
    master.connect(ctx.destination);
  } catch {
    ctx = null;
    master = null;
  }
  return ctx;
}

/** 効果音の音量（0〜1） */
export function setSfxVolume(v) {
  sfxVolume = clamp(v, 0, 1, 0.7);
  try { if (master && ctx) master.gain.setValueAtTime(sfxVolume, ctx.currentTime); } catch { /* 無視 */ }
}

// 音を1つ鳴らす。t: 開始（秒・今から）, dur: 長さ, peak: 大きさ
function tone(c, t0, { freq, t = 0, dur = 0.3, peak = 0.2, type = 'sine', attack = 0.008, cutoff = 0, detune = 0 }) {
  const start = t0 + t;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (detune) osc.detune.setValueAtTime(detune, start);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.linearRampToValueAtTime(peak, start + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  if (cutoff > 0) {
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(cutoff, start);
    f.Q.value = 0.5;
    osc.connect(f);
    f.connect(g);
  } else {
    osc.connect(g);
  }
  g.connect(master);
  osc.start(start);
  osc.stop(start + dur + 0.05);
}

// 効果音を鳴らす共通処理。音が出せない状態なら黙ってやめる。
function playSfx(build) {
  try {
    if (sfxVolume <= 0) return;
    const c = getCtx();
    if (!c || !master) return;
    const go = () => { try { build(c, c.currentTime + 0.01); } catch { /* 無視 */ } };
    if (c.state === 'running') { go(); return; }
    // 止まっているときは起こしてみる。すぐ起きなければ鳴らさない（後から遅れて鳴るのを防ぐ）
    const asked = Date.now();
    c.resume().then(() => { if (Date.now() - asked < 400) go(); }).catch(() => {});
  } catch { /* 無視 */ }
}

// 音名 → 周波数
const N = {
  G4: 392.0, C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880.0,
  C6: 1046.5, E6: 1318.51, G6: 1567.98, C7: 2093.0,
};

export const sfx = {
  /** ボタンを押したときの小さなクリック */
  tap() {
    playSfx((c, t0) => {
      tone(c, t0, { freq: 740, dur: 0.06, peak: 0.12, type: 'triangle', attack: 0.003 });
    });
  },

  /** 正解：明るく短い2音 */
  correct() {
    playSfx((c, t0) => {
      [[N.G5, 0], [N.C6, 0.11]].forEach(([freq, t]) => {
        tone(c, t0, { freq, t, dur: 0.42, peak: 0.2 });
        tone(c, t0, { freq: freq * 2, t, dur: 0.2, peak: 0.04 }); // 輝きを少し
      });
    });
  },

  /** 10問終了：穏やかな音 */
  done() {
    playSfx((c, t0) => {
      [[N.C5, 0], [N.E5, 0.2], [N.G5, 0.4]].forEach(([freq, t]) => {
        tone(c, t0, { freq, t, dur: 1.3, peak: 0.15, attack: 0.03 });
      });
      tone(c, t0, { freq: N.C6, t: 0.62, dur: 1.4, peak: 0.1, attack: 0.04 });
    });
  },

  /** レベルアップ：華やかなファンファーレ（約2.2秒） */
  fanfare() {
    playSfx((c, t0) => {
      // 金管風の音色（のこぎり波を丸めたもの＋少しずらした重ね）
      const brass = (freq, t, dur, peak) => {
        tone(c, t0, { freq, t, dur, peak, type: 'sawtooth', attack: 0.02, cutoff: 2200 });
        tone(c, t0, { freq, t, dur, peak: peak * 0.6, type: 'triangle', attack: 0.02, detune: 6 });
      };
      // 上昇フレーズ
      brass(N.G4, 0.0, 0.2, 0.11);
      brass(N.C5, 0.14, 0.2, 0.11);
      brass(N.E5, 0.28, 0.2, 0.11);
      brass(N.G5, 0.42, 0.3, 0.12);
      // 和音（ハ長調）を伸ばす
      const chordAt = 0.66;
      [N.C5, N.E5, N.G5, N.C6].forEach((freq) => brass(freq, chordAt, 1.5, 0.075));
      tone(c, t0, { freq: N.C5 / 2, t: chordAt, dur: 1.5, peak: 0.1, attack: 0.03 }); // 低音の支え
      // きらめき
      [[N.C6, 0.0], [N.E6, 0.09], [N.G6, 0.18], [N.C7, 0.27]].forEach(([freq, dt]) => {
        tone(c, t0, { freq, t: chordAt + 0.12 + dt, dur: 0.7, peak: 0.05 });
      });
    });
  },
};
