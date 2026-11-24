// ききとりチャレンジ 訓練用紙の印刷
// 作成者: KENTA SHINKAWA
// A4縦1枚に、10問分の書き込み欄を作って印刷します。
// 見た目は css/print.css（クラス名は ps- で始まる）にあります。

import { COURSES, SESSION_LENGTH } from './data.js';

const ROOT_ID = 'print-root';
const TITLE = 'ききとりチャレンジ　訓練用紙';
const CREDIT = '© KENTA SHINKAWA';

const escapeHTML = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// コースと個数を、ありえる範囲に整える（変な値が来ても用紙が崩れないように）
function normalize(courseId, length) {
  const course = COURSES[courseId] || COURSES.words;
  const n = Math.round(Number(length));
  const len = Number.isFinite(n) ? Math.min(course.maxLen, Math.max(course.minLen, n)) : course.minLen;
  return { course, len };
}

// date を渡すと日付を印字、渡さなければ手書き用の空欄にする
function dateParts(date) {
  if (date === undefined || date === null || date === '') return null;
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() };
}

function dateHTML(date) {
  const p = dateParts(date);
  const blank = (kind, value) =>
    `<span class="ps-date-blank ps-date-blank--${kind}">${value === undefined ? '' : escapeHTML(value)}</span>`;
  return (
    `<div class="ps-date">` +
    `${blank('year', p ? p.y : undefined)}<span class="ps-date-unit">年</span>` +
    `${blank('md', p ? p.m : undefined)}<span class="ps-date-unit">月</span>` +
    `${blank('md', p ? p.d : undefined)}<span class="ps-date-unit">日</span>` +
    `</div>`
  );
}

function rowHTML(number, course, len) {
  const inner =
    course.id === 'sentences'
      ? '<div class="ps-line"></div>'
      : Array.from({ length: len }, () => '<div class="ps-cell"></div>').join('');
  return (
    `<li class="ps-row">` +
    `<div class="ps-num">${number}</div>` +
    `<div class="ps-box">${inner}</div>` +
    `<div class="ps-mark">〇・×</div>` +
    `</li>`
  );
}

/**
 * 訓練用紙のHTML（文字列）を作る。画面での見本表示にも使えます。
 * @param {{ courseId: string, length: number, date?: Date|string }} options
 * @returns {string}
 */
export function buildSheetHTML({ courseId, length, date } = {}) {
  const { course, len } = normalize(courseId, length);
  const rows = Array.from({ length: SESSION_LENGTH }, (_, i) => rowHTML(i + 1, course, len)).join('');
  return (
    `<section class="ps-sheet ps-sheet--${course.id}" data-length="${len}">` +
    `<header class="ps-header">` +
    `<h1 class="ps-title">${TITLE}</h1>` +
    `<div class="ps-meta">` +
    `<div class="ps-course">${escapeHTML(course.label)}　${len}${escapeHTML(course.unit)}</div>` +
    dateHTML(date) +
    `</div>` +
    `</header>` +
    `<ol class="ps-rows">${rows}</ol>` +
    `<footer class="ps-footer">` +
    `<div class="ps-total">${SESSION_LENGTH}問中<span class="ps-total-blank"></span>問 正解</div>` +
    `<div class="ps-credit">${CREDIT}</div>` +
    `</footer>` +
    `</section>`
  );
}

/**
 * 訓練用紙を印刷する。
 * @param {{ courseId: string, length: number }} options
 */
export function printSheet({ courseId, length } = {}) {
  let root = document.getElementById(ROOT_ID);
  if (!root) {
    root = document.createElement('div');
    root.id = ROOT_ID;
  }
  if (root.parentNode !== document.body) document.body.appendChild(root);
  root.innerHTML = buildSheetHTML({ courseId, length });

  // 印刷が終わったら（やめた場合も）中身を片付ける
  const cleanup = () => {
    window.removeEventListener('afterprint', cleanup);
    root.innerHTML = '';
  };
  window.addEventListener('afterprint', cleanup);

  window.print();
}
