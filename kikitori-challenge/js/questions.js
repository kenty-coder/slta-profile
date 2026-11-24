// ききとりチャレンジ 出題（1回10問を作る）
// 作成者: KENTA SHINKAWA
//
// generateSession(courseId, length, rng?) -> Question[10]
//   Question = { items, choices, answerText }
//     items      : 正解の並び（data.js の Item）
//     choices    : ポインティング用のカード（items を全部含む）
//     answerText : 答えの文字（全角空白区切り）
// 乱数は第3引数で差し替えられます（省略時 Math.random）。

import { COURSES, SESSION_LENGTH, WORDS, DIGITS, SENTENCE_PARTS, SENTENCE_PATTERNS } from './data.js';

const SEPARATOR = '　'; // 全角空白
const MAX_RETRY = 60; // 同じ問題を避けるための作り直し回数の上限

// ---- 乱数の小道具 ----
function randomIndex(n, rng) {
  const i = Math.floor(rng() * n);
  return Math.min(n - 1, Math.max(0, Number.isFinite(i) ? i : 0));
}
const pick = (list, rng) => list[randomIndex(list.length, rng)];

function shuffle(list, rng) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1, rng);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** カードの枚数: 2〜3 → 6枚、4〜5 → 9枚、6〜7 → 12枚 */
export function choiceCount(length) {
  if (length <= 3) return 6;
  if (length <= 5) return 9;
  return 12;
}

const answerOf = (items) => items.map((it) => it.text).join(SEPARATOR);

// ---- 単語 ----
function wordQuestion(length, rng) {
  const pool = shuffle(WORDS, rng);
  const items = pool.slice(0, length);
  const choices = shuffle(pool.slice(0, choiceCount(length)), rng);
  return { items, choices, answerText: answerOf(items) };
}

// ---- 数字 ----
function digitQuestion(length, rng) {
  const items = shuffle(DIGITS, rng).slice(0, length);
  return { items, choices: [...DIGITS], answerText: answerOf(items) }; // カードは常に 1〜9 の順
}

// ---- 文章 ----
const P = SENTENCE_PARTS;
const INTRANSITIVE = P.verbs.filter((v) => v.objects.length === 0);
const TRANSITIVE = P.verbs.filter((v) => v.objects.length > 0);
const objectById = Object.fromEntries(P.objects.map((o) => [o.id, o]));
const placeById = Object.fromEntries(P.places.map((o) => [o.id, o]));
// 「〜を」は、どれかの動詞で実際に使うもの（＝音声があるもの）だけを選択肢にも使う
const USED_OBJECTS = P.objects.filter((o) => TRANSITIVE.some((v) => v.objects.includes(o.id)));

// 型の中の名前 → 紛らわしい選択肢を取ってくる元
const DISTRACTOR_POOL = {
  time: P.times,
  subject: P.subjects,
  partner: P.partners,
  place: P.places,
  object: USED_OBJECTS,
  verb: P.verbs,
  verbIntransitive: P.verbs,
};

function sentenceQuestion(length, rng) {
  const pattern = SENTENCE_PATTERNS[length];
  if (!pattern) throw new Error(`questions: ${length}語文の型がありません`);

  // 動詞を先に決め、それに合う「なにを」「どこで」を選ぶ
  const verb = pick(pattern.includes('verbIntransitive') ? INTRANSITIVE : TRANSITIVE, rng);
  const subject = pick(P.subjects, rng);
  const chosen = {
    verb,
    verbIntransitive: verb,
    subject,
    time: pick(P.times, rng),
    object: verb.objects.length ? objectById[pick(verb.objects, rng)] : null,
    place: verb.places.length ? placeById[pick(verb.places, rng)] : null,
    partner: pick(P.partners.filter((p) => p.id !== subject.id), rng), // 「が」と「と」は別の人
  };
  const items = pattern.map((slot) => {
    const item = chosen[slot];
    if (!item) throw new Error(`questions: 「${slot}」に入る部品がありません（動詞 ${verb.id}）`);
    return item;
  });

  // 紛らわしい選択肢: 文に出てくる種類から順番に1枚ずつ足す。
  // 同じ絵が2枚にならないよう、key だけでなく img でも重複を見る（「〜が」と「〜と」は同じ絵）。
  const keys = new Set(items.map((it) => it.key));
  const imgs = new Set(items.map((it) => it.img).filter(Boolean));
  const pools = shuffle(pattern, rng).map((slot) => shuffle(DISTRACTOR_POOL[slot], rng));
  const choices = [...items];
  const want = choiceCount(length);
  let added = true;
  while (choices.length < want && added) {
    added = false;
    for (const pool of pools) {
      if (choices.length >= want) break;
      const i = pool.findIndex((c) => !keys.has(c.key) && !(c.img && imgs.has(c.img)));
      if (i < 0) continue;
      const [c] = pool.splice(i, 1);
      keys.add(c.key);
      if (c.img) imgs.add(c.img);
      choices.push(c);
      added = true;
    }
  }
  return { items, choices: shuffle(choices, rng), answerText: answerOf(items) };
}

const MAKERS = { words: wordQuestion, digits: digitQuestion, sentences: sentenceQuestion };

/**
 * 1回分（10問）を作る。
 * @param {string} courseId 'words' | 'digits' | 'sentences'
 * @param {number} length 一度に聞く個数（コースの範囲外なら範囲内に丸める）
 * @param {() => number} [rng] 0以上1未満を返す乱数。省略時 Math.random
 * @returns {{items: object[], choices: object[], answerText: string}[]}
 */
export function generateSession(courseId, length, rng = Math.random) {
  const course = Object.hasOwn(COURSES, courseId) ? COURSES[courseId] : null;
  if (!course) throw new Error(`questions: 知らないコースです: ${String(courseId)}`);
  const n = Number(length);
  const len = Math.min(course.maxLen, Math.max(course.minLen, Number.isFinite(n) ? Math.round(n) : course.minLen));
  const make = MAKERS[courseId];

  // 10問の中に同じ問題を入れない（当然、続くこともない）。
  // どうしても作れないとき（乱数が偏っている等）は、そのまま進めて止まらないようにする。
  const session = [];
  const seen = new Set();
  for (let i = 0; i < SESSION_LENGTH; i++) {
    let q = make(len, rng);
    for (let t = 0; t < MAX_RETRY && seen.has(q.answerText); t++) q = make(len, rng);
    seen.add(q.answerText);
    session.push(q);
  }
  return session;
}
