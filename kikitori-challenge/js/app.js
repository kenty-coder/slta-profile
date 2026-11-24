// ききとりチャレンジ 画面の動き  作成：KENTA SHINKAWA
// 1ページの中で画面（ホーム → やり方 → 課題 → 結果、設定、記録）を切り替えます。
// 記録は store.js、出題は questions.js、音は audio.js、用紙は print.js が担当。

import { SESSION_LENGTH, COURSES, WORDS, SENTENCE_PARTS, PRAISES, LEVELUP_PHRASE, allAudioItems } from './data.js';
import * as store from './store.js';
import { generateSession } from './questions.js';
import * as audio from './audio.js';
import { printSheet } from './print.js';
import { launchConfetti, stopConfetti } from './confetti.js';

const APP_VERSION = '1.0.0';
const AUTHOR = 'KENTA SHINKAWA';
const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩', '⑪', '⑫'];
const MODE_LABEL = { pointing: '指さし', paper: '用紙' };

const app = document.getElementById('app');
const sfx = audio.sfx || {};
const play = (name) => { try { sfx[name] && sfx[name](); } catch (e) { /* 音が出なくても続ける */ } };

// ---------- 小さな道具 ----------
function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}

const svg = (body) => `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
const ICON = {
  speaker: svg('<path d="M8 19v10h8l10 8V11l-10 8H8z"/><path d="M32 18c2.5 3.5 2.5 8.500 0 12"/><path d="M37 13c5 6.500 5 15.500 0 22"/>'),
  replay: svg('<path d="M10 24a14 14 0 1 0 4.500-10.200"/><path d="M9 8v8h8"/>'),
  ear: svg('<path d="M16 21c0-7 5-12 11.500-12S39 14 39 20.500c0 4.500-2 7-4.500 9.500-2 2-3 3.500-3.500 6-.700 3-3 5-6 5-3.500 0-6-2.500-6-5.500"/><path d="M22 21.500c0-3.500 2.500-6 5.500-6s5.500 2.300 5.500 5.500c0 2-1 3.300-2.300 4.300"/><path class="wave" d="M9 16c-1.600 3.700-1.600 8.300 0 12"/><path class="wave wave2" d="M3.500 12c-3 6.500-3 13.500 0 20"/>'),
  hand: svg('<path d="M19 26V10a3 3 0 0 1 6 0v12"/><path d="M25 21a3 3 0 0 1 6 0v3"/><path d="M31 23a3 3 0 0 1 6 0v8c0 7-4 11-10 11h-2c-4 0-6-1.500-8.500-5L11 29.500a3 3 0 0 1 5-3.300l3 3.800"/>'),
  pencil: svg('<path d="M8 40l3-11L32 8l8 8-21 21-11 3z"/><path d="M27 13l8 8"/>'),
  printer: svg('<path d="M14 18V7h20v11"/><rect x="6" y="18" width="36" height="16" rx="3"/><path d="M14 29h20v12H14z"/>'),
  gear: svg('<circle cx="24" cy="24" r="6"/><path d="M24 5v6M24 37v6M5 24h6M37 24h6M10.600 10.600l4.200 4.200M33.200 33.200l4.200 4.200M10.600 37.400l4.200-4.200M33.200 14.800l4.200-4.200"/>'),
  back: svg('<path d="M28 10L14 24l14 14"/>'),
  next: svg('<path d="M20 10l14 14-14 14"/>'),
  check: svg('<circle cx="24" cy="24" r="19"/><path d="M14.500 24.500l6.500 6.500 13-14"/>'),
};
const icon = (name) => h('span', { class: 'ico', html: ICON[name], style: 'display:contents' });

function btn(label, onclick, cls = '', attrs = {}) {
  return h('button', { type: 'button', class: `btn ${cls}`, onclick, ...attrs }, label);
}

function unitText(courseId, n) { return `${n}${COURSES[courseId].unit}`; }

// 画面を入れ替える。focus=true なら見出しへフォーカスを移す
function mount(screen, focus) {
  app.replaceChildren(screen);
  if (focus) {
    window.scrollTo(0, 0);
    const head = screen.querySelector('h1');
    if (head) { head.setAttribute('tabindex', '-1'); try { head.focus({ preventScroll: true }); } catch (e) { head.focus(); } }
  }
}

// 別の画面へ移る（音と紙吹雪を止めてから）
let screenToken = 0;
function go(screen) {
  screenToken++;
  stopAudio();
  stopConfetti();
  mount(screen, true);
}
function stopAudio() { try { audio.stop(); } catch (e) { /* 無視 */ } }

function applySettings() {
  const s = store.getSettings();
  document.documentElement.dataset.font = s.fontSize;
  try { audio.setSfxVolume(s.sfxVolume); } catch (e) { /* 無視 */ }
  return s;
}

// 確認ダイアログ（大きなボタンで。はい→true）
function confirmDialog({ title, text, yes, no, danger = false }) {
  return new Promise((resolve) => {
    const prev = document.activeElement;
    const close = (v) => {
      document.removeEventListener('keydown', onKey, true);
      back.remove();
      if (prev && prev.isConnected) { try { prev.focus(); } catch (e) { /* 無視 */ } }
      resolve(v);
    };
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(false); } };
    const noBtn = btn(no, () => close(false), 'btn--primary btn--big');
    const back = h('div', { class: 'modal-back' },
      h('div', { class: 'modal', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'modal-title' },
        h('h2', { id: 'modal-title' }, title),
        text ? h('p', {}, text) : null,
        h('div', { class: 'btns' }, noBtn, btn(yes, () => close(true), danger ? 'btn--quiet' : ''))));
    document.addEventListener('keydown', onKey, true);
    document.body.append(back);
    noBtn.focus();
  });
}

// ---------- ホーム ----------
function showHome() {
  session = null;
  const list = h('div', { class: 'course-list course-list--home' },
    Object.values(COURSES).map((c) => h('button', { type: 'button', class: 'btn course-btn', onclick: () => showMode(c.id) },
      h('span', {}, c.label),
      h('span', { class: 'level' }, `いま：${unitText(c.id, store.getLength(c.id))}`))));
  go(h('section', { class: 'screen screen--home' },
    h('div', { class: 'topbar' }, h('span', { class: 'spacer' }),
      btn([icon('gear'), '設定'], showSettings, 'btn--quiet')),
    h('div', { class: 'home-title' }, h('h1', {}, 'ききとりチャレンジ'), h('p', {}, '聞いて おぼえる 練習です')),
    list,
    h('div', { class: 'home-foot' }, btn('記録を見る', () => showHistory('words'), 'btn--quiet btn--small'))));
}

// ---------- やり方を選ぶ ----------
function showMode(courseId) {
  const c = COURSES[courseId];
  const length = store.getLength(courseId);
  go(h('section', { class: 'screen' },
    h('div', { class: 'topbar' }, btn([icon('back'), 'もどる'], showHome, 'btn--quiet'), h('h1', {}, c.label)),
    h('p', { class: 'lead' }, `いま：${unitText(courseId, length)}　／　1回 ${SESSION_LENGTH}問`),
    h('p', { class: 'lead' }, '答え方を えらんでください。'),
    h('div', { class: 'mode-list' },
      h('div', { class: 'mode-card' },
        btn([icon('hand'), h('span', {}, '指さしで 答える', h('small', {}, courseId === 'digits' ? '聞いた順番に 数字を押します' : '聞いた順番に 絵を押します'))],
          () => startSession(courseId, 'pointing'), 'btn--primary btn--big btn--block')),
      h('div', { class: 'mode-card' },
        btn([icon('pencil'), h('span', {}, '用紙に書いて 答える', h('small', {}, '聞いたあと 紙に書きます'))],
          () => startSession(courseId, 'paper'), 'btn--primary btn--big btn--block'),
        btn([icon('printer'), '用紙を印刷する'], () => {
          try { printSheet({ courseId, length }); } catch (e) { console.warn(e); }
        }, 'btn--block')))));
}

// ---------- 課題（共通） ----------
let session = null; // { courseId, mode, length, questions, index, results, picked, phase, afterPlay, praise }
let lastPraiseKey = null;

function pickPraise() {
  const pool = PRAISES.filter((p) => p.key !== lastPraiseKey);
  const p = pool[Math.floor(Math.random() * pool.length)] || PRAISES[0];
  lastPraiseKey = p.key;
  return p;
}

function startSession(courseId, mode) {
  const length = store.getLength(courseId);
  let questions;
  try { questions = generateSession(courseId, length); } catch (e) { console.error(e); questions = null; }
  if (!Array.isArray(questions) || questions.length === 0) {
    confirmDialog({ title: '問題を用意できませんでした', text: 'もう一度 ためしてください。', yes: 'ホームへ', no: 'とじる' }).then((y) => y && showHome());
    return;
  }
  session = { courseId, mode, length, questions, index: 0, results: [], picked: [], phase: 'ready', afterPlay: mode === 'paper' ? 'writing' : 'answer', praise: null };
  try { audio.preload && audio.preload(questions.flatMap((q) => q.items)); } catch (e) { /* 任意 */ }
  screenToken++;
  stopAudio(); stopConfetti();
  renderTask(true);
}

async function quitSession() {
  const ok = await confirmDialog({ title: '練習を やめますか？', text: 'とちゅうでやめた回は 記録されません。', yes: 'やめる', no: 'つづける' });
  if (ok) showHome();
}

async function listen() {
  const s = session;
  if (!s || s.phase === 'playing') return;
  if (s.phase === 'ready') s.afterPlay = s.mode === 'paper' ? 'writing' : 'answer';
  else s.afterPlay = s.phase;
  s.phase = 'playing';
  const token = ++screenToken;
  renderTask(false);
  const st = store.getSettings();
  try { await audio.playSequence(s.questions[s.index].items, { rate: st.rate, gapMs: st.gapMs }); } catch (e) { console.warn(e); }
  if (session !== s || token !== screenToken || s.phase !== 'playing') return;
  s.phase = s.afterPlay;
  renderTask(false);
}

function nextQuestion() {
  const s = session;
  if (!s) return;
  stopAudio();
  s.index++;
  s.picked = [];
  s.praise = null;
  s.phase = 'ready';
  screenToken++;
  if (s.index >= s.questions.length) finishSession();
  else renderTask(true);
}

function taskHeader(s) {
  const total = s.questions.length;
  return h('div', { class: 'topbar' },
    btn('やめる', quitSession, 'btn--quiet'),
    h('div', { class: 'progress' },
      h('h1', {}, '第', h('b', {}, String(s.index + 1)), `問／${total}問`),
      h('div', { class: 'dots', 'aria-hidden': 'true' },
        s.questions.map((_, i) => h('span', { class: i < s.index ? 'done' : i === s.index ? 'now' : '' })))));
}

function cardEl(item, courseId, { tag = 'button', order = null } = {}) {
  const el = h(tag, { class: 'card', 'aria-label': item.text || item.label, ...(tag === 'button' ? { type: 'button' } : {}) });
  el.append(h('span', { class: 'badge', 'aria-hidden': 'true' }, order != null ? String(order) : ''));
  if (!item.img) {
    el.append(h('span', { class: 'num' }, item.label));
    return el;
  }
  const pic = h('span', { class: 'pic' });
  const img = h('img', { src: item.img, alt: '', draggable: 'false', decoding: 'async' });
  let captioned = courseId === 'sentences';
  img.addEventListener('error', () => {
    // 絵が読めないときは文字で代わりに出す
    pic.replaceChildren(h('span', { class: 'fallback' }, item.label));
    const cap = el.querySelector('.cap');
    if (cap) cap.remove();
    captioned = false;
  }, { once: true });
  pic.append(img);
  el.append(pic);
  if (captioned) el.append(h('span', { class: 'cap', style: `--len:${Math.max(4, [...item.label].length)}` }, item.label));
  return el;
}

function listeningEl() {
  return h('div', { class: 'stage', role: 'status' },
    h('div', { class: 'listening' }, h('span', { html: ICON.ear, style: 'display:contents' }), h('p', { class: 'big-text' }, '聞いてください')));
}

function readyEl() {
  return h('div', { class: 'stage' },
    btn([icon('speaker'), '音声を聞く'], listen, 'btn--primary btn--huge listen-btn'),
    h('p', { class: 'hint' }, 'ボタンを押すと 音声が流れます'));
}

function answerRow(q, courseId) {
  return h('div', { class: `answer-row${q.items.length > 4 ? ' many' : ''}` },
    q.items.map((it, i) => { const c = cardEl(it, courseId, { tag: 'div', order: i + 1 }); c.classList.add('shown'); return c; }));
}

function renderTask(focus) {
  const s = session;
  if (!s) return;
  const q = s.questions[s.index];
  const isLast = s.index === s.questions.length - 1;
  const nextLabel = isLast ? '結果を見る' : '次へ';
  const screen = h('section', { class: 'screen screen--fixed' }, taskHeader(s));

  if (s.phase === 'ready') screen.append(readyEl());
  else if (s.phase === 'playing') screen.append(listeningEl());
  else if (s.mode === 'pointing') renderPointing(screen, s, q, nextLabel);
  else renderPaper(screen, s, q, nextLabel);

  mount(screen, focus);
}

// ---------- 指さし（ポインティング） ----------
function renderPointing(screen, s, q, nextLabel) {
  const need = q.items.length;

  if (s.phase === 'feedback') {
    if (s.praise) {
      screen.append(h('div', { class: 'stage', role: 'status' },
        h('span', { class: 'praise-mark', html: ICON.check }),
        h('p', { class: 'praise' }, s.praise.text)));
    } else {
      screen.append(h('div', { class: 'stage stage--scroll', role: 'status' },
        h('p', { class: 'answer-title' }, '正しい順番は こちらです'),
        answerRow(q, s.courseId),
        h('p', { class: `answer-text${s.courseId === 'digits' ? ' digits' : q.items.length > 4 ? ' answer-text--long' : ''}` }, q.answerText)));
    }
    screen.append(h('div', { class: 'actions' }, h('div', { class: 'wide' }, btn([nextLabel, icon('next')], nextQuestion, 'btn--primary btn--big btn--block'))));
    return;
  }

  // 答える
  const n = q.choices.length;
  const cls = `grid n${n <= 6 ? 6 : n <= 9 ? 9 : 12} ${s.courseId === 'digits' ? 'digits' : 'pics'}`;
  const cards = new Map();
  const grid = h('div', { class: cls });
  const undo = btn('ひとつ もどす', () => { s.picked.pop(); update(); });
  const slot = h('div', { class: 'slot wide', 'aria-live': 'polite' });
  const decide = btn('これで決定', () => judgePointing(), 'btn--accent');

  function update() {
    for (const [key, el] of cards) {
      const i = s.picked.indexOf(key);
      el.classList.toggle('picked', i >= 0);
      el.setAttribute('aria-pressed', i >= 0 ? 'true' : 'false');
      el.querySelector('.badge').textContent = i >= 0 ? String(i + 1) : '';
    }
    undo.disabled = s.picked.length === 0;
    if (s.picked.length >= need) slot.replaceChildren(decide);
    else slot.replaceChildren(`あと ${need - s.picked.length}つ えらんでください`);
  }

  for (const item of q.choices) {
    const el = cardEl(item, s.courseId);
    el.addEventListener('click', () => {
      if (s.picked.includes(item.key) || s.picked.length >= need) return; // 同じカードは二度選べない
      s.picked.push(item.key);
      play('tap');
      update();
    });
    cards.set(item.key, el);
    grid.append(el);
  }
  update();

  screen.append(
    h('p', { class: 'hint hint--answer' }, '聞いた順番に 押してください'),
    grid,
    h('div', { class: 'actions actions--answer' }, btn([icon('replay'), 'もう一度聞く'], listen), undo, slot));
}

function judgePointing() {
  const s = session;
  if (!s || s.phase !== 'answer') return;
  const q = s.questions[s.index];
  if (s.picked.length !== q.items.length) return;
  const correct = q.items.every((it, i) => it.key === s.picked[i]);
  s.results.push(correct);
  s.phase = 'feedback';
  s.praise = correct ? pickPraise() : null;
  renderTask(false);
  if (correct) {
    play('correct');
    try { Promise.resolve(audio.playPhrase(s.praise)).catch(() => {}); } catch (e) { /* 無視 */ }
  }
}

// ---------- 訓練用紙 ----------
function renderPaper(screen, s, q, nextLabel) {
  const mark = CIRCLED[s.index] || String(s.index + 1);

  if (s.phase === 'writing') {
    screen.append(
      h('div', { class: 'stage' },
        h('span', { class: 'praise-mark', html: ICON.pencil, style: 'color:var(--ink);width:4rem;height:4rem' }),
        h('p', { class: 'paper-num' }, '用紙の', h('b', {}, mark), 'に', h('br'), '書いてください'),
        h('p', { class: 'hint' }, 'ゆっくりで だいじょうぶです')),
      h('div', { class: 'actions' },
        h('div', { class: 'wide' }, btn([icon('replay'), 'もう一度聞く'], listen, 'btn--block')),
        h('div', { class: 'wide' }, btn('書けました（答えを見る）', () => { s.phase = 'reveal'; renderTask(false); }, 'btn--primary btn--big btn--block'))));
    return;
  }

  if (s.phase === 'reveal') {
    screen.append(
      h('div', { class: 'stage stage--scroll' },
        h('p', { class: 'answer-title' }, `${mark} の答え`),
        h('p', { class: `answer-text answer-text--big${s.courseId === 'digits' ? ' digits' : ''}` }, q.answerText),
        h('p', { class: 'hint', style: 'display:block' }, '書いたものと くらべてください')),
      h('div', { class: 'judge' },
        btn([h('span', { class: 'sym', 'aria-hidden': 'true' }, '〇'), '合っていた'], () => judgePaper(true), 'btn--primary'),
        btn([h('span', { class: 'sym', 'aria-hidden': 'true' }, '×'), 'ちがっていた'], () => judgePaper(false))));
    return;
  }

  // 〇のあと（控えめにほめる）
  screen.append(
    h('div', { class: 'stage', role: 'status' },
      h('span', { class: 'praise-mark', html: ICON.check, style: 'width:4.5rem;height:4.5rem' }),
      h('p', { class: 'praise', style: 'font-size:1.8rem' }, s.praise ? s.praise.text : '')),
    h('div', { class: 'actions' }, h('div', { class: 'wide' }, btn([nextLabel, icon('next')], nextQuestion, 'btn--primary btn--big btn--block'))));
}

function judgePaper(ok) {
  const s = session;
  if (!s || s.phase !== 'reveal') return;
  s.results.push(ok);
  if (!ok) { nextQuestion(); return; } // ×のときは何も言わず次へ
  s.praise = pickPraise();
  s.phase = 'feedback';
  renderTask(false);
  play('correct');
}

// ---------- 結果 ----------
function finishSession() {
  const s = session;
  session = null;
  let r;
  try { r = store.recordSession(s.courseId, s.mode, s.results); } catch (e) { console.error(e); }
  if (!r) {
    const correct = s.results.filter(Boolean).length;
    r = { correct, total: s.results.length, change: 'stay', oldLength: s.length, newLength: s.length };
  }
  const up = r.change === 'up'; // 'down' は 'stay' と全く同じ見た目にする（下がったことは出さない）
  const again = () => startSession(s.courseId, s.mode);
  const screen = h('section', { class: `screen result${up ? ' result--up' : ''}` },
    h('h1', {}, up ? LEVELUP_PHRASE.text : 'おつかれさまでした'),
    h('p', { class: 'score' }, `${r.total}問中`, h('b', {}, String(r.correct)), '問 正解'),
    up ? h('p', { class: 'next-level' }, '次は ', h('b', {}, unitText(s.courseId, r.newLength)), ' に挑戦です') : null,
    h('div', { class: 'btns' },
      btn('もう一度やる', again, 'btn--primary btn--big'),
      btn('ホームへ', showHome, 'btn--big')));
  go(screen);
  const token = screenToken;
  if (up) {
    launchConfetti({ duration: 6500 });
    play('fanfare');
    setTimeout(() => {
      if (token !== screenToken) return;
      try { Promise.resolve(audio.playPhrase(LEVELUP_PHRASE)).catch(() => {}); } catch (e) { /* 無視 */ }
    }, 1300);
  } else {
    play('done');
  }
}

// ---------- 設定 ----------
const FONT_OPTS = [['large', '大'], ['xlarge', '特大'], ['xxlarge', '最大']];
const RATE_OPTS = [[0.8, 'ゆっくり'], [1.0, 'ふつう'], [1.2, 'はやい']];
const GAP_OPTS = [[500, 'みじかい'], [1000, 'ふつう'], [1500, 'ながい'], [2500, 'とてもながい']];

function nearest(opts, value) {
  if (typeof value !== 'number') return value;
  return opts.reduce((a, b) => (Math.abs(b[0] - value) < Math.abs(a[0] - value) ? b : a))[0];
}

function segmented(name, title, opts, current, onChange) {
  const cur = nearest(opts, current);
  const labels = opts.map(([value, label], i) => {
    const input = h('input', { type: 'radio', name, id: `${name}-${i}`, value: String(value), checked: value === cur });
    input.checked = value === cur;
    const lab = h('label', { class: value === cur ? 'on' : '', for: `${name}-${i}` }, input, label);
    input.addEventListener('change', () => {
      labels.forEach((l) => l.classList.toggle('on', l === lab));
      onChange(value);
    });
    return lab;
  });
  return h('div', { class: 'field', role: 'radiogroup', 'aria-labelledby': `${name}-title` },
    h('h2', { id: `${name}-title` }, title), h('div', { class: 'seg' }, labels));
}

function showSettings() {
  const s = store.getSettings();
  let lastTap = 0;
  const range = h('input', { type: 'range', id: 'sfx-volume', min: '0', max: '1', step: '0.05', 'aria-labelledby': 'vol-title' });
  range.value = String(s.sfxVolume);
  range.addEventListener('input', () => {
    const v = Number(range.value);
    store.saveSettings({ sfxVolume: v });
    try { audio.setSfxVolume(v); } catch (e) { /* 無視 */ }
    const now = Date.now();
    if (now - lastTap > 180) { lastTap = now; play('tap'); }
  });

  const tryBtn = btn([icon('speaker'), 'ためしに聞く'], async () => {
    const st = store.getSettings();
    stopAudio();
    try { await audio.playSequence([WORDS[0], WORDS[5]], { rate: st.rate, gapMs: st.gapMs }); } catch (e) { console.warn(e); }
  }, 'btn--primary btn--block');

  go(h('section', { class: 'screen' },
    h('div', { class: 'topbar' }, btn([icon('back'), 'もどる'], showHome, 'btn--quiet'), h('h1', {}, '設定')),
    segmented('font', '文字の大きさ', FONT_OPTS, s.fontSize, (v) => { store.saveSettings({ fontSize: v }); applySettings(); }),
    segmented('rate', '話す速さ', RATE_OPTS, s.rate, (v) => store.saveSettings({ rate: v })),
    segmented('gap', '単語の間隔', GAP_OPTS, s.gapMs, (v) => store.saveSettings({ gapMs: v })),
    h('div', { class: 'field' }, tryBtn),
    h('div', { class: 'field' }, h('h2', { id: 'vol-title' }, '効果音の音量'),
      h('div', { class: 'volume' }, h('span', {}, '小'), range, h('span', {}, '大'))),
    h('div', { class: 'settings-foot' },
      btn('記録を すべて消す', async () => {
        const ok = await confirmDialog({ title: '記録を すべて消しますか？', text: 'これまでの記録・レベル・設定が 最初の状態にもどります。元にはもどせません。', yes: 'すべて消す', no: '消さない', danger: true });
        if (!ok) return;
        try { store.resetAll(); } catch (e) { console.error(e); }
        applySettings();
        showHome();
      }, 'btn--quiet btn--small'),
      h('p', {}, `バージョン ${APP_VERSION}`),
      h('p', {}, `作成：${AUTHOR}`))));
}

// ---------- 記録 ----------
function formatDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime()) || d.getTime() === 0) return '日付なし';
  const p = (n) => String(n).padStart(2, '0');
  const y = d.getFullYear() === new Date().getFullYear() ? '' : `${d.getFullYear()}年`;
  return `${y}${d.getMonth() + 1}月${d.getDate()}日 ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function showHistory(courseId) {
  let list = [];
  try { list = store.getHistory(courseId); } catch (e) { console.error(e); }
  const tabs = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'コース' },
    Object.values(COURSES).map((c) => btn(c.label.replace('コース', ''), () => showHistory(c.id), 'tab',
      { role: 'tab', 'aria-selected': c.id === courseId ? 'true' : 'false', 'aria-label': c.label })));
  const body = list.length === 0
    ? h('p', { class: 'empty' }, 'まだ記録がありません。')
    : h('ul', { class: 'history' }, list.map((e) => h('li', {},
      h('span', { class: 'when' }, formatDate(e.date)),
      h('span', { class: 'what' }, `${MODE_LABEL[e.mode] || ''}　${unitText(courseId, e.length)}`),
      h('span', { class: 'sc' }, `${e.total}問中 `, h('b', {}, String(e.correct)), '問'))));
  go(h('section', { class: 'screen' },
    h('div', { class: 'topbar' }, btn([icon('back'), 'もどる'], showHome, 'btn--quiet'), h('h1', {}, '記録')),
    tabs,
    h('p', { class: 'now-level' }, `${COURSES[courseId].label}　いま：${unitText(courseId, store.getLength(courseId))}`),
    body));
}

// ---------- 起動 ----------
function guardGestures() {
  const stop = (e) => e.preventDefault();
  document.addEventListener('contextmenu', stop);
  document.addEventListener('dragstart', stop);
  document.addEventListener('gesturestart', stop);
  document.addEventListener('dblclick', stop);
  // iOS のダブルタップ拡大を抑える
  let lastEnd = 0;
  document.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastEnd < 320 && !(e.target instanceof HTMLInputElement)) e.preventDefault();
    lastEnd = now;
  }, { passive: false });
}

function unlockOnFirstTouch() {
  const events = ['pointerdown', 'touchend', 'click', 'keydown'];
  let count = 0;
  const fn = () => {
    try { audio.unlock(); } catch (e) { /* 無視 */ }
    // 端末によって解除に使える操作が違うので、最初の数回は呼ぶ
    if (++count >= 3) events.forEach((ev) => window.removeEventListener(ev, fn, true));
  };
  events.forEach((ev) => window.addEventListener(ev, fn, true));
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('sw.js');
      reg.update().catch(() => {});
      const ready = await navigator.serviceWorker.ready;
      // 音声と絵を裏で保存しておく（圏外でも使えるように）。通信量を節約する設定のときは控える
      const conn = navigator.connection;
      if (!ready.active || (conn && conn.saveData) || navigator.onLine === false) return;
      const p = SENTENCE_PARTS;
      const imgs = [...WORDS, ...p.times, ...p.subjects, ...p.partners, ...p.places, ...p.verbs].map((x) => x.img).filter(Boolean);
      const urls = [...new Set([...allAudioItems().map((x) => x.audio), ...imgs])].map((u) => new URL(u, document.baseURI).href);
      setTimeout(() => { try { ready.active.postMessage({ type: 'warm', urls }); } catch (e) { /* 無視 */ } }, 3000);
    } catch (e) { /* サービスワーカーが使えなくても、ふつうに動く */ }
  });
}

function init() {
  applySettings();
  guardGestures();
  unlockOnFirstTouch();
  // 画面を離れたら音を止める
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopAudio(); });
  window.addEventListener('pagehide', stopAudio);
  showHome();
  registerServiceWorker();
}

init();
