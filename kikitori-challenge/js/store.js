// ききとりチャレンジ 記録とレベル判定（端末内保存）
// 作成者: KENTA SHINKAWA
//
// 保存先は localStorage のキー `kikitori-challenge` ひとつだけ。
// 保存の形（schemaVersion 1）:
//   {
//     schemaVersion: 1,
//     settings: { fontSize, rate, gapMs, sfxVolume },
//     courses: { words: { length, history: [...] }, digits: {...}, sentences: {...} }
//   }
// アプリを更新しても記録が消えないように、読み込むたびに
//   ・知らない項目はそのまま残す
//   ・足りない項目、おかしな値は既定値で補う
// という方針で整えています。localStorage が使えない環境（プライベートモード、node）
// では、そのページを開いている間だけメモリに覚えます。

import { COURSES } from './data.js';

export const STORAGE_KEY = 'kikitori-challenge';
export const SCHEMA_VERSION = 1;
export const HISTORY_LIMIT = 200; // コースごとに残す履歴の最大件数

export const DEFAULT_SETTINGS = Object.freeze({
  fontSize: 'large',
  rate: 1.0,
  gapMs: 1000,
  sfxVolume: 0.7,
});

const FONT_SIZES = ['large', 'xlarge', 'xxlarge'];
const MODES = ['pointing', 'paper'];
const LIMITS = { rate: [0.7, 1.3], gapMs: [300, 3000], sfxVolume: [0, 1] };

// ---- 保存先（localStorage が無理ならメモリ）----
let injected; // テスト用に差し替えた保存先（undefined = 差し替えなし、null = 保存先なし）
let memory = null; // 最後に書いた内容の控え
let useMemory = false; // 直近の書き込みが localStorage に届かなかった

function backend() {
  if (injected !== undefined) return injected;
  try {
    const ls = globalThis.localStorage;
    return ls && typeof ls.getItem === 'function' ? ls : null;
  } catch {
    return null; // 取得するだけで例外になるブラウザ設定がある
  }
}

function readRaw(key) {
  if (useMemory) return key === STORAGE_KEY ? memory : null;
  const b = backend();
  if (!b) return key === STORAGE_KEY ? memory : null;
  try {
    return b.getItem(key);
  } catch {
    return key === STORAGE_KEY ? memory : null;
  }
}

function writeRaw(text) {
  memory = text;
  const b = backend();
  if (!b) {
    useMemory = true;
    return;
  }
  try {
    b.setItem(STORAGE_KEY, text);
    useMemory = false;
  } catch {
    useMemory = true; // 容量超過・保存禁止など。以後はメモリの内容を正とする
  }
}

// ---- 値を整える ----
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function clampNumber(value, [min, max], fallback) {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function normalizeSettings(raw) {
  const src = isObject(raw) ? raw : {};
  return {
    ...src, // 知らない項目は残す
    fontSize: FONT_SIZES.includes(src.fontSize) ? src.fontSize : DEFAULT_SETTINGS.fontSize,
    rate: clampNumber(src.rate, LIMITS.rate, DEFAULT_SETTINGS.rate),
    gapMs: Math.round(clampNumber(src.gapMs, LIMITS.gapMs, DEFAULT_SETTINGS.gapMs)),
    sfxVolume: clampNumber(src.sfxVolume, LIMITS.sfxVolume, DEFAULT_SETTINGS.sfxVolume),
  };
}

function normalizeLength(value, course) {
  const n = clampNumber(value, [course.minLen, course.maxLen], course.minLen);
  return Math.round(n);
}

function normalizeEntry(e, course) {
  if (!isObject(e)) return null;
  const total = Number(e.total);
  const correct = Number(e.correct);
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(correct)) return null;
  const time = typeof e.date === 'string' ? Date.parse(e.date) : NaN;
  return {
    ...e,
    date: Number.isFinite(time) ? e.date : new Date(0).toISOString(),
    mode: MODES.includes(e.mode) ? e.mode : 'pointing',
    length: normalizeLength(e.length, course),
    correct: Math.min(total, Math.max(0, Math.round(correct))),
    total: Math.round(total),
  };
}

function normalizeCourse(raw, course) {
  const src = isObject(raw) ? raw : {};
  const history = Array.isArray(src.history)
    ? src.history.map((e) => normalizeEntry(e, course)).filter(Boolean).slice(0, HISTORY_LIMIT)
    : [];
  return { ...src, length: normalizeLength(src.length, course), history };
}

function normalize(raw) {
  const src = isObject(raw) ? raw : {};
  const srcCourses = isObject(src.courses) ? src.courses : {};
  const courses = { ...srcCourses }; // 今は無いコースの記録も捨てない
  for (const id of Object.keys(COURSES)) courses[id] = normalizeCourse(srcCourses[id], COURSES[id]);
  const version = Number.isInteger(src.schemaVersion) ? src.schemaVersion : 0;
  return {
    ...src,
    // 新しい版のアプリが書いたデータを古い版で開いても、版の番号は下げない
    schemaVersion: Math.max(version, SCHEMA_VERSION),
    settings: normalizeSettings(src.settings),
    courses,
  };
}

function load() {
  const text = readRaw(STORAGE_KEY);
  if (text == null || text === '') return normalize(null);
  try {
    return normalize(JSON.parse(text));
  } catch {
    return normalize(null); // 壊れたデータは既定値からやり直す
  }
}

function save(state) {
  let text;
  try {
    text = JSON.stringify(state);
  } catch {
    return;
  }
  writeRaw(text);
}

function courseOf(courseId) {
  const course = Object.hasOwn(COURSES, courseId) ? COURSES[courseId] : null;
  if (!course) throw new Error(`store: 知らないコースです: ${String(courseId)}`);
  return course;
}

// ---- 公開する関数 ----

/** 設定を返す。 */
export function getSettings() {
  return load().settings;
}

/** 設定の一部を書き換えて保存し、整えた後の設定を返す。 */
export function saveSettings(partial) {
  const state = load();
  state.settings = normalizeSettings({ ...state.settings, ...(isObject(partial) ? partial : {}) });
  save(state);
  return state.settings;
}

/** 今のレベル（一度に聞く個数）。コースごとに別々。 */
export function getLength(courseId) {
  courseOf(courseId);
  return load().courses[courseId].length;
}

/**
 * 1回分（10問）の結果を記録し、次のレベルを決める。
 * 正答率8割以上で +1、7割未満で -1、その間はそのまま。上限・下限では止まる。
 * ポインティングと訓練用紙は同じレベルを共有する。
 * @param {string} courseId 'words' | 'digits' | 'sentences'
 * @param {'pointing'|'paper'} mode
 * @param {boolean[]} results 各問の正誤
 * @param {Date} [now] 記録する日時（省略時は今。テスト用）
 */
export function recordSession(courseId, mode, results, now = new Date()) {
  const course = courseOf(courseId);
  const state = load();
  const entry = state.courses[courseId];
  const oldLength = entry.length;

  const list = Array.isArray(results) ? results : [];
  const total = list.length;
  const correct = list.filter((r) => r === true).length;
  if (total === 0) {
    // 1問もやっていないときは記録もレベル変更もしない
    return { correct: 0, total: 0, rate: 0, change: 'stay', oldLength, newLength: oldLength, atMax: oldLength >= course.maxLen };
  }

  // 小数の誤差を避けるため整数で比べる（8割以上 / 7割未満）
  let newLength = oldLength;
  if (correct * 10 >= total * 8) newLength = Math.min(course.maxLen, oldLength + 1);
  else if (correct * 10 < total * 7) newLength = Math.max(course.minLen, oldLength - 1);
  const change = newLength > oldLength ? 'up' : newLength < oldLength ? 'down' : 'stay';

  const date = now instanceof Date && Number.isFinite(now.getTime()) ? now : new Date();
  entry.length = newLength;
  entry.history.unshift({
    date: date.toISOString(),
    mode: MODES.includes(mode) ? mode : 'pointing',
    length: oldLength, // その回に練習した個数
    correct,
    total,
  });
  entry.history.length = Math.min(entry.history.length, HISTORY_LIMIT);
  save(state);

  return { correct, total, rate: correct / total, change, oldLength, newLength, atMax: newLength >= course.maxLen };
}

/** 練習の履歴（新しい順）。コースごとに別々。 */
export function getHistory(courseId) {
  courseOf(courseId);
  return load().courses[courseId].history.map(({ date, mode, length, correct, total }) => ({ date, mode, length, correct, total }));
}

/** 記録と設定をすべて消して、最初の状態に戻す。 */
export function resetAll() {
  memory = null;
  const b = backend();
  if (!b) return;
  try {
    b.removeItem(STORAGE_KEY);
    useMemory = false;
  } catch {
    useMemory = true; // 消せなかった場合も、このページでは空の状態として扱う
  }
}

/**
 * テスト専用: 保存先を差し替える。
 * getItem / setItem / removeItem を持つもの、null（保存先なし）、undefined（元に戻す）。
 */
export function _setStorageForTest(storage) {
  injected = storage;
  memory = null;
  useMemory = false;
}
