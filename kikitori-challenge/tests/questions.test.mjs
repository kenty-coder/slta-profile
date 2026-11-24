// questions.js のテスト（node --test tests/）
// 作成者: KENTA SHINKAWA
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COURSES, SESSION_LENGTH, WORDS, DIGITS, SENTENCE_PARTS, SENTENCE_PATTERNS } from '../js/data.js';
import { generateSession, choiceCount } from '../js/questions.js';

const TRIALS = 300; // レベルごとのランダム試行回数（1回 = 10問）

// 種つきの乱数（mulberry32）。失敗したとき同じ問題を再現できる
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const levels = (id) => Array.from({ length: COURSES[id].maxLen - COURSES[id].minLen + 1 }, (_, i) => COURSES[id].minLen + i);
const unique = (list) => new Set(list).size === list.length;
const SLOT_KIND = { time: 'time', subject: 'ga', partner: 'to', place: 'de', object: 'wo', verb: 'verb', verbIntransitive: 'verb' };
const ALL_PARTS = new Set(Object.values(SENTENCE_PARTS).flat());

// 全コース・全レベルを trials 回ずつ作って check に渡す
function forEachSession(courseId, trials, check) {
  for (const length of levels(courseId)) {
    for (let t = 0; t < trials; t++) {
      const seed = length * 100000 + t;
      // 半分は種つき、残りは本物の Math.random（省略時の動き）
      const session = t % 2 === 0 ? generateSession(courseId, length, seeded(seed)) : generateSession(courseId, length);
      check(session, length, `${courseId} length=${length} trial=${t}`);
    }
  }
}

// どのコースにも共通の約束
function checkCommon(session, length, where) {
  assert.equal(session.length, SESSION_LENGTH, `${where}: 10問`);
  assert.equal(SESSION_LENGTH, 10);
  session.forEach((q, i) => {
    const at = `${where} q${i + 1}「${q.answerText}」`;
    assert.equal(q.items.length, length, `${at}: items の数`);
    assert.ok(unique(q.items.map((it) => it.key)), `${at}: items に重複なし`);
    assert.ok(unique(q.choices.map((it) => it.key)), `${at}: choices に重複なし`);
    for (const it of q.items) assert.ok(q.choices.includes(it), `${at}: choices が ${it.key} を含む`);
    assert.equal(q.answerText, q.items.map((it) => it.text).join('　'), `${at}: answerText は全角空白区切り`);
    for (const it of [...q.items, ...q.choices]) {
      assert.equal(typeof it.key, 'string', at);
      assert.equal(typeof it.audio, 'string', at);
      assert.equal(typeof it.label, 'string', at);
    }
    if (i > 0) assert.notEqual(q.answerText, session[i - 1].answerText, `${at}: 前の問題と同じ`);
  });
  assert.ok(unique(session.map((q) => q.answerText)), `${where}: 10問の中に同じ問題がない`);
}

test('カードの枚数: 2〜3 → 6、4〜5 → 9、6〜7 → 12', () => {
  assert.deepEqual([2, 3, 4, 5, 6, 7].map(choiceCount), [6, 6, 9, 9, 12, 12]);
});

test('単語: 全レベルで10問、重複なし、choices の枚数、img の重複なし', () => {
  forEachSession('words', TRIALS, (session, length, where) => {
    checkCommon(session, length, where);
    for (const q of session) {
      assert.equal(q.choices.length, choiceCount(length), `${where}: choices の枚数`);
      for (const it of q.choices) assert.ok(WORDS.includes(it), `${where}: 単語データにある`);
      assert.ok(unique(q.choices.map((it) => it.img)), `${where}: 同じ絵が2枚ない`);
      assert.ok(q.choices.every((it) => typeof it.img === 'string' && it.img.startsWith('img/w/')), where);
    }
  });
});

test('単語: 例「いぬ　とけい　かさ」の形になる', () => {
  const [q] = generateSession('words', 3, seeded(1));
  assert.match(q.answerText, /^[^　 ]+　[^　 ]+　[^　 ]+$/);
});

test('単語: choices は並びが混ざっている（正解が先頭に固まらない）', () => {
  let sameOrder = 0;
  let total = 0;
  for (let t = 0; t < 200; t++) {
    for (const q of generateSession('words', 3, seeded(t))) {
      total++;
      if (q.items.every((it, i) => q.choices[i] === it)) sameOrder++;
    }
  }
  assert.ok(sameOrder < total * 0.1, `正解どおりの並びが多すぎる: ${sameOrder}/${total}`);
});

test('数字: 全レベルで10問、1〜9、重複なし、choices は常に 1〜9 の数字順', () => {
  forEachSession('digits', TRIALS, (session, length, where) => {
    checkCommon(session, length, where);
    for (const q of session) {
      for (const it of q.items) assert.ok(DIGITS.includes(it), `${where}: 1〜9`);
      assert.deepEqual(q.choices.map((it) => it.label), ['1', '2', '3', '4', '5', '6', '7', '8', '9'], `${where}: 数字順の9枚`);
      assert.deepEqual(q.choices, DIGITS);
      assert.match(q.answerText, /^[1-9](　[1-9])*$/);
    }
  });
});

test('数字: choices を書き換えても教材データは壊れない', () => {
  const [q] = generateSession('digits', 3, seeded(2));
  q.choices.reverse();
  q.choices.pop();
  assert.equal(DIGITS.length, 9);
  assert.deepEqual(DIGITS.map((d) => d.label), ['1', '2', '3', '4', '5', '6', '7', '8', '9']);
  assert.equal(generateSession('digits', 3, seeded(3))[0].choices.length, 9);
});

test('文章: 全レベルで10問、型どおり、動詞の objects / places と矛盾しない、が/と は別人', () => {
  forEachSession('sentences', TRIALS, (session, length, where) => {
    checkCommon(session, length, where);
    const pattern = SENTENCE_PATTERNS[length];
    for (const q of session) {
      const at = `${where}「${q.answerText}」`;
      assert.deepEqual(q.items.map((it) => it.kind), pattern.map((slot) => SLOT_KIND[slot]), `${at}: 型どおりの並び`);
      const by = Object.fromEntries(q.items.map((it) => [it.kind, it]));
      const verb = by.verb;
      assert.ok(verb && Array.isArray(verb.objects) && Array.isArray(verb.places), `${at}: 動詞がある`);
      assert.equal(q.items.at(-1), verb, `${at}: 動詞は最後`);
      if (by.wo) assert.ok(verb.objects.includes(by.wo.id), `${at}: ${by.wo.text} ${verb.text} は言えない`);
      else assert.equal(verb.objects.length, 0, `${at}: 「なにを」が要る動詞なのに無い`);
      if (by.de) assert.ok(verb.places.includes(by.de.id), `${at}: ${by.de.text} ${verb.text} は言えない`);
      if (by.to) assert.notEqual(by.to.id, by.ga.id, `${at}: 「が」と「と」が同じ人`);
      assert.ok(by.ga, `${at}: 「だれが」がある`);
    }
  });
});

test('文章: choices は 6/9/12 枚、同じ種類の部品だけ、key も img も重複なし', () => {
  forEachSession('sentences', TRIALS, (session, length, where) => {
    for (const q of session) {
      const at = `${where}「${q.answerText}」`;
      assert.equal(q.choices.length, choiceCount(length), `${at}: choices の枚数`);
      assert.equal(q.choices.length, length <= 3 ? 6 : length <= 5 ? 9 : 12);
      assert.ok(unique(q.choices.map((it) => it.key)), `${at}: key の重複`);
      const imgs = q.choices.map((it) => it.img);
      assert.ok(imgs.every((img) => typeof img === 'string' && img.length > 0), `${at}: 絵がある`);
      assert.ok(unique(imgs), `${at}: 同じ絵が2枚ある ${imgs.join(', ')}`);
      const kinds = new Set(q.items.map((it) => it.kind));
      for (const it of q.choices) {
        assert.ok(ALL_PARTS.has(it), `${at}: 文章の部品にある ${it.key}`);
        assert.ok(kinds.has(it.kind), `${at}: 文に出てこない種類 ${it.key}`);
      }
    }
  });
});

test('文章: 選択肢の「〜を」は音声を作る対象（どれかの動詞で使うもの）だけ', () => {
  const used = new Set(SENTENCE_PARTS.verbs.flatMap((v) => v.objects));
  forEachSession('sentences', 100, (session, _length, where) => {
    for (const q of session) {
      for (const it of q.choices) if (it.kind === 'wo') assert.ok(used.has(it.id), `${where}: ${it.key}`);
    }
  });
});

test('文章: 例「おとこのひとが　こうえんで　パンを　たべる」の形、2語文は「〜が どうする」', () => {
  for (let t = 0; t < 50; t++) {
    for (const q of generateSession('sentences', 4, seeded(t))) {
      assert.match(q.answerText, /^[^　]+が　[^　]+で　[^　]+を　[^　]+$/);
    }
    for (const q of generateSession('sentences', 2, seeded(t))) {
      assert.match(q.answerText, /^[^　]+が　[^　]+$/);
      assert.equal(q.items[1].objects.length, 0, '2語文は「なにを」の要らない動詞');
    }
    for (const q of generateSession('sentences', 6, seeded(t))) {
      assert.match(q.answerText, /^[^　]+　[^　]+が　[^　]+と　[^　]+で　[^　]+を　[^　]+$/);
    }
  }
});

test('文章: すべての動詞・人・場所・時が出題される（偏って出ない部品がない）', () => {
  const seen = new Set();
  for (const length of levels('sentences')) {
    for (let t = 0; t < 400; t++) {
      for (const q of generateSession('sentences', length, seeded(900000 + length * 1000 + t))) {
        for (const it of q.items) seen.add(it.key);
      }
    }
  }
  const p = SENTENCE_PARTS;
  const usedObj = new Set(p.verbs.flatMap((v) => v.objects));
  const expected = [...p.times, ...p.subjects, ...p.partners, ...p.places, ...p.verbs, ...p.objects.filter((o) => usedObj.has(o.id))];
  const missing = expected.filter((it) => !seen.has(it.key)).map((it) => it.key);
  assert.deepEqual(missing, []);
});

test('単語・数字: すべての項目が出題される', () => {
  const seen = new Set();
  for (let t = 0; t < 200; t++) {
    for (const id of ['words', 'digits']) {
      for (const q of generateSession(id, 3, seeded(t))) for (const it of q.items) seen.add(it.key);
    }
  }
  assert.deepEqual([...WORDS, ...DIGITS].filter((it) => !seen.has(it.key)).map((it) => it.key), []);
});

test('同じ種なら同じ問題、違う種なら違う問題（乱数を差し替えられる）', () => {
  for (const id of Object.keys(COURSES)) {
    const a = generateSession(id, 3, seeded(42)).map((q) => q.answerText);
    const b = generateSession(id, 3, seeded(42)).map((q) => q.answerText);
    const c = generateSession(id, 3, seeded(43)).map((q) => q.answerText);
    assert.deepEqual(a, b);
    assert.notDeepEqual(a, c);
  }
});

test('範囲外の個数は範囲内に丸め、知らないコースはエラー', () => {
  assert.equal(generateSession('words', 1)[0].items.length, 2);
  assert.equal(generateSession('words', 99)[0].items.length, 7);
  assert.equal(generateSession('sentences', 7)[0].items.length, 6);
  assert.equal(generateSession('digits', 0)[0].items.length, 2);
  assert.equal(generateSession('digits', undefined)[0].items.length, 2);
  assert.equal(generateSession('digits', '4')[0].items.length, 4);
  assert.throws(() => generateSession('nazo', 3), /知らないコース/);
  assert.throws(() => generateSession('constructor', 3), /知らないコース/);
});

test('偏った乱数（いつも同じ値）でも止まらず10問返す', () => {
  for (const rng of [() => 0, () => 0.5, () => 0.999999999, () => 1, () => NaN]) {
    for (const id of Object.keys(COURSES)) {
      for (const length of levels(id)) {
        const session = generateSession(id, length, rng);
        assert.equal(session.length, 10);
        for (const q of session) {
          assert.equal(q.items.length, length);
          assert.ok(unique(q.choices.map((it) => it.key)));
          for (const it of q.items) assert.ok(q.choices.includes(it));
        }
      }
    }
  }
});

test('教材データを書き換えない（何度出題しても data.js の中身は同じ）', () => {
  const before = JSON.stringify({ WORDS, DIGITS, SENTENCE_PARTS });
  for (const id of Object.keys(COURSES)) for (const length of levels(id)) for (let t = 0; t < 30; t++) generateSession(id, length);
  assert.equal(JSON.stringify({ WORDS, DIGITS, SENTENCE_PARTS }), before);
});
