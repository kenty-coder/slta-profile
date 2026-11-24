// store.js のテスト（node --test tests/）
// 作成者: KENTA SHINKAWA
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { COURSES } from '../js/data.js';
import {
  getSettings, saveSettings, getLength, recordSession, getHistory, resetAll,
  _setStorageForTest, STORAGE_KEY, SCHEMA_VERSION, HISTORY_LIMIT, DEFAULT_SETTINGS,
} from '../js/store.js';

// localStorage の代わり
function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
}
const results = (correct, total = 10) => Array.from({ length: total }, (_, i) => i < correct);
const saved = (s) => JSON.parse(s.getItem(STORAGE_KEY));
const COURSE_IDS = Object.keys(COURSES);

let storage;
beforeEach(() => {
  storage = fakeStorage();
  _setStorageForTest(storage);
});

test('初期値: レベルは各コースの minLen、設定は既定値、履歴は空', () => {
  for (const id of COURSE_IDS) {
    assert.equal(getLength(id), COURSES[id].minLen);
    assert.deepEqual(getHistory(id), []);
  }
  assert.deepEqual(getSettings(), { ...DEFAULT_SETTINGS });
  assert.deepEqual(getSettings(), { fontSize: 'large', rate: 1.0, gapMs: 1000, sfxVolume: 0.7 });
});

test('レベル境界: 0〜10問正解のすべてで、8以上は上がる・7は維持・6以下は下がる', () => {
  for (const id of COURSE_IDS) {
    for (let correct = 0; correct <= 10; correct++) {
      _setStorageForTest(fakeStorage({ [STORAGE_KEY]: JSON.stringify({ courses: { [id]: { length: 4 } } }) }));
      const r = recordSession(id, 'pointing', results(correct));
      const expected = correct >= 8 ? 'up' : correct === 7 ? 'stay' : 'down';
      assert.equal(r.change, expected, `${id} ${correct}/10`);
      assert.equal(r.oldLength, 4);
      assert.equal(r.newLength, 4 + { up: 1, stay: 0, down: -1 }[expected]);
      assert.equal(r.correct, correct);
      assert.equal(r.total, 10);
      assert.equal(r.rate, correct / 10);
      assert.equal(r.atMax, false);
      assert.equal(getLength(id), r.newLength);
    }
  }
});

test('8/10 で上がる、7/10 は維持、6/10 で下がる（続けて記録）', () => {
  assert.equal(recordSession('words', 'pointing', results(8)).change, 'up');
  assert.equal(getLength('words'), 3);
  assert.equal(recordSession('words', 'pointing', results(7)).change, 'stay');
  assert.equal(getLength('words'), 3);
  assert.equal(recordSession('words', 'pointing', results(6)).change, 'down');
  assert.equal(getLength('words'), 2);
});

test('下限で止まる: change は stay、レベルは minLen のまま', () => {
  for (const id of COURSE_IDS) {
    const min = COURSES[id].minLen;
    for (let i = 0; i < 3; i++) {
      const r = recordSession(id, 'pointing', results(0));
      assert.equal(r.change, 'stay');
      assert.equal(r.oldLength, min);
      assert.equal(r.newLength, min);
      assert.equal(r.atMax, false);
    }
    assert.equal(getLength(id), min);
  }
});

test('上限で止まる: 上限に届いた回は up + atMax、その後は stay + atMax', () => {
  for (const id of COURSE_IDS) {
    const { minLen, maxLen } = COURSES[id];
    for (let len = minLen; len < maxLen; len++) {
      const r = recordSession(id, 'pointing', results(10));
      assert.equal(r.change, 'up');
      assert.equal(r.newLength, len + 1);
      assert.equal(r.atMax, len + 1 === maxLen);
    }
    for (let i = 0; i < 3; i++) {
      const r = recordSession(id, 'pointing', results(10));
      assert.equal(r.change, 'stay');
      assert.equal(r.oldLength, maxLen);
      assert.equal(r.newLength, maxLen);
      assert.equal(r.atMax, true);
    }
    assert.equal(getLength(id), maxLen);
    // 上限で7割は維持（atMax のまま）、6割で下がる
    assert.deepEqual(
      (({ change, atMax }) => ({ change, atMax }))(recordSession(id, 'pointing', results(7))),
      { change: 'stay', atMax: true },
    );
    const down = recordSession(id, 'pointing', results(6));
    assert.equal(down.change, 'down');
    assert.equal(down.atMax, false);
    assert.equal(getLength(id), maxLen - 1);
  }
});

test('文章コースの上限は6、単語・数字は7', () => {
  for (const id of COURSE_IDS) for (let i = 0; i < 20; i++) recordSession(id, 'pointing', results(10));
  assert.equal(getLength('words'), 7);
  assert.equal(getLength('digits'), 7);
  assert.equal(getLength('sentences'), 6);
});

test('コースは独立: 1つのコースの記録は他のコースのレベル・履歴を変えない', () => {
  recordSession('words', 'pointing', results(10));
  recordSession('words', 'pointing', results(10));
  recordSession('digits', 'paper', results(9));
  assert.equal(getLength('words'), 4);
  assert.equal(getLength('digits'), 3);
  assert.equal(getLength('sentences'), 2);
  assert.equal(getHistory('words').length, 2);
  assert.equal(getHistory('digits').length, 1);
  assert.equal(getHistory('sentences').length, 0);
});

test('ポインティングと訓練用紙はレベルを共有する', () => {
  recordSession('words', 'pointing', results(8));
  recordSession('words', 'paper', results(8));
  assert.equal(getLength('words'), 4);
  assert.deepEqual(getHistory('words').map((h) => h.mode), ['paper', 'pointing']);
});

test('10問以外でも割合で判定する（8割以上 / 7割未満）', () => {
  const start = () => _setStorageForTest(fakeStorage({ [STORAGE_KEY]: JSON.stringify({ courses: { words: { length: 4 } } }) }));
  const cases = [[4, 5, 'up'], [3, 4, 'stay'], [7, 9, 'stay'], [2, 3, 'down'], [16, 20, 'up'], [14, 20, 'stay'], [13, 20, 'down']];
  for (const [c, t, expected] of cases) {
    start();
    assert.equal(recordSession('words', 'pointing', results(c, t)).change, expected, `${c}/${t}`);
  }
});

test('結果が空のときは記録もレベル変更もしない', () => {
  const r = recordSession('words', 'pointing', []);
  assert.deepEqual(r, { correct: 0, total: 0, rate: 0, change: 'stay', oldLength: 2, newLength: 2, atMax: false });
  assert.equal(getHistory('words').length, 0);
  assert.equal(recordSession('words', 'pointing', undefined).total, 0);
});

test('履歴: 新しい順、その回の個数・正答数・日時・モードを持つ', () => {
  recordSession('digits', 'pointing', results(9), new Date('2026-01-02T03:04:05.000Z'));
  recordSession('digits', 'paper', results(5), new Date('2026-01-03T03:04:05.000Z'));
  assert.deepEqual(getHistory('digits'), [
    { date: '2026-01-03T03:04:05.000Z', mode: 'paper', length: 3, correct: 5, total: 10 },
    { date: '2026-01-02T03:04:05.000Z', mode: 'pointing', length: 2, correct: 9, total: 10 },
  ]);
  // 日時を省略すると今の日時（ISO）
  recordSession('digits', 'pointing', results(7));
  const { date } = getHistory('digits')[0];
  assert.equal(new Date(date).toISOString(), date);
  assert.ok(Math.abs(Date.now() - Date.parse(date)) < 60_000);
});

test('履歴を書き換えても保存内容は変わらない', () => {
  recordSession('words', 'pointing', results(9));
  const h = getHistory('words');
  h[0].correct = 0;
  h.push({});
  assert.equal(getHistory('words').length, 1);
  assert.equal(getHistory('words')[0].correct, 9);
});

test(`履歴はコースごとに最大 ${HISTORY_LIMIT} 件、古いものから消える`, () => {
  for (let i = 0; i < HISTORY_LIMIT + 30; i++) {
    recordSession('words', 'pointing', results(7), new Date(Date.UTC(2026, 0, 1, 0, i)));
  }
  recordSession('digits', 'pointing', results(7));
  const h = getHistory('words');
  assert.equal(h.length, HISTORY_LIMIT);
  assert.equal(h[0].date, new Date(Date.UTC(2026, 0, 1, 0, HISTORY_LIMIT + 29)).toISOString());
  assert.equal(h.at(-1).date, new Date(Date.UTC(2026, 0, 1, 0, 30)).toISOString());
  assert.equal(getHistory('digits').length, 1);
  assert.equal(saved(storage).courses.words.history.length, HISTORY_LIMIT);
});

test('知らないモードは pointing として記録、知らないコースはエラー', () => {
  recordSession('words', 'nazo', results(7));
  assert.equal(getHistory('words')[0].mode, 'pointing');
  assert.throws(() => getLength('nazo'), /知らないコース/);
  assert.throws(() => recordSession('toString', 'pointing', results(7)), /知らないコース/);
  assert.throws(() => getHistory(undefined), /知らないコース/);
});

test('保存データは schemaVersion を持ち、キーは kikitori-challenge', () => {
  recordSession('words', 'pointing', results(8));
  assert.equal(STORAGE_KEY, 'kikitori-challenge');
  assert.deepEqual([...storage.map.keys()], ['kikitori-challenge']);
  const data = saved(storage);
  assert.equal(data.schemaVersion, SCHEMA_VERSION);
  assert.equal(data.courses.words.length, 3);
});

test('保存した内容は、別の画面（読み込み直し）でも同じ', () => {
  recordSession('sentences', 'paper', results(10));
  saveSettings({ fontSize: 'xxlarge' });
  const text = storage.getItem(STORAGE_KEY);
  _setStorageForTest(fakeStorage({ [STORAGE_KEY]: text }));
  assert.equal(getLength('sentences'), 3);
  assert.equal(getHistory('sentences').length, 1);
  assert.equal(getSettings().fontSize, 'xxlarge');
});

test('壊れた JSON からの復帰: 既定値で動き、その後は普通に保存できる', () => {
  const broken = ['{こわれた', '', 'null', '123', '"moji"', '[]', '[1,2]', 'true', '{"courses":', 'undefined'];
  for (const text of broken) {
    const s = fakeStorage({ [STORAGE_KEY]: text });
    _setStorageForTest(s);
    assert.equal(getLength('words'), 2, text);
    assert.deepEqual(getSettings(), { ...DEFAULT_SETTINGS }, text);
    assert.deepEqual(getHistory('digits'), [], text);
    assert.equal(recordSession('words', 'pointing', results(8)).newLength, 3, text);
    assert.equal(getLength('words'), 3, text);
    assert.equal(saved(s).schemaVersion, SCHEMA_VERSION, text);
  }
});

test('中身の型がおかしいデータでも落ちず、既定値で補う', () => {
  const weird = [
    { settings: 'x', courses: 5 },
    { settings: [], courses: [] },
    { settings: null, courses: { words: null, digits: 'a', sentences: [] } },
    { courses: { words: { length: 'たくさん', history: 'なし' } } },
    { courses: { words: { length: null, history: [null, 1, 'a', {}, { correct: 'x', total: 10 }, { correct: 3, total: 0 }] } } },
    { settings: { fontSize: 'tiny', rate: 'はやい', gapMs: null, sfxVolume: NaN } },
  ];
  for (const w of weird) {
    _setStorageForTest(fakeStorage({ [STORAGE_KEY]: JSON.stringify(w) }));
    assert.equal(getLength('words'), 2);
    assert.deepEqual(getHistory('words'), []);
    assert.deepEqual(getSettings(), { ...DEFAULT_SETTINGS });
    assert.equal(recordSession('words', 'paper', results(9)).change, 'up');
  }
});

test('範囲外のレベルは範囲内に直す', () => {
  _setStorageForTest(fakeStorage({ [STORAGE_KEY]: JSON.stringify({
    courses: { words: { length: 99 }, digits: { length: -3 }, sentences: { length: 7 } },
  }) }));
  assert.equal(getLength('words'), 7);
  assert.equal(getLength('digits'), 2);
  assert.equal(getLength('sentences'), 6);
});

test('旧データに項目が足りない場合は既定値で補い、あるものは残す', () => {
  // schemaVersion も settings の一部も、コースの一部も無い古い形
  const old = {
    settings: { rate: 0.8 },
    courses: {
      words: { length: 5, history: [{ date: '2025-12-01T00:00:00.000Z', length: 4, correct: 9, total: 10 }] },
    },
  };
  const s = fakeStorage({ [STORAGE_KEY]: JSON.stringify(old) });
  _setStorageForTest(s);
  assert.deepEqual(getSettings(), { fontSize: 'large', rate: 0.8, gapMs: 1000, sfxVolume: 0.7 });
  assert.equal(getLength('words'), 5);
  assert.equal(getLength('digits'), 2);
  assert.equal(getLength('sentences'), 2);
  // mode が無い履歴は pointing として読む
  assert.deepEqual(getHistory('words'), [{ date: '2025-12-01T00:00:00.000Z', mode: 'pointing', length: 4, correct: 9, total: 10 }]);
  assert.deepEqual(getHistory('sentences'), []);
  // 記録を足しても元の記録は消えない
  recordSession('words', 'pointing', results(8));
  recordSession('sentences', 'pointing', results(8));
  assert.equal(getLength('words'), 6);
  assert.equal(getHistory('words').length, 2);
  assert.equal(getHistory('words')[1].date, '2025-12-01T00:00:00.000Z');
  assert.equal(saved(s).schemaVersion, SCHEMA_VERSION);
  assert.equal(saved(s).settings.rate, 0.8);
});

test('未知の項目は残す（新しい版が足した項目を古い版が消さない）', () => {
  const future = {
    schemaVersion: 7,
    extraTop: { a: 1 },
    settings: { rate: 1.2, theme: 'dark' },
    courses: {
      words: { length: 3, best: 6, history: [{ date: '2026-02-01T00:00:00.000Z', mode: 'paper', length: 3, correct: 7, total: 10, memo: 'つかれ気味' }] },
      songs: { length: 4, history: [] },
    },
  };
  const s = fakeStorage({ [STORAGE_KEY]: JSON.stringify(future) });
  _setStorageForTest(s);
  saveSettings({ gapMs: 1500 });
  recordSession('words', 'pointing', results(10));
  const data = saved(s);
  assert.equal(data.schemaVersion, 7, '版の番号は下げない');
  assert.deepEqual(data.extraTop, { a: 1 });
  assert.equal(data.settings.theme, 'dark');
  assert.equal(data.settings.rate, 1.2);
  assert.equal(data.settings.gapMs, 1500);
  assert.equal(data.courses.words.best, 6);
  assert.equal(data.courses.words.length, 4);
  assert.equal(data.courses.words.history[1].memo, 'つかれ気味');
  assert.deepEqual(data.courses.songs, { length: 4, history: [] });
  assert.equal(data.courses.digits.length, 2);
});

test('設定: 一部だけ書き換え、範囲内に丸め、おかしな値は既定値', () => {
  assert.deepEqual(saveSettings({ fontSize: 'xlarge' }), { fontSize: 'xlarge', rate: 1.0, gapMs: 1000, sfxVolume: 0.7 });
  assert.deepEqual(saveSettings({ rate: 0.9, gapMs: 2000 }), { fontSize: 'xlarge', rate: 0.9, gapMs: 2000, sfxVolume: 0.7 });
  assert.deepEqual(getSettings(), { fontSize: 'xlarge', rate: 0.9, gapMs: 2000, sfxVolume: 0.7 });
  // 範囲の外は端に寄せる
  assert.deepEqual(saveSettings({ rate: 5, gapMs: 10, sfxVolume: -1 }), { fontSize: 'xlarge', rate: 1.3, gapMs: 300, sfxVolume: 0 });
  assert.deepEqual(saveSettings({ rate: 0.1, gapMs: 99999, sfxVolume: 3 }), { fontSize: 'xlarge', rate: 0.7, gapMs: 3000, sfxVolume: 1 });
  // スライダーの値（文字列）も受け付ける
  assert.equal(saveSettings({ rate: '1.1' }).rate, 1.1);
  // おかしな値は既定値
  assert.deepEqual(saveSettings({ fontSize: 'small', rate: NaN, gapMs: 'abc', sfxVolume: null }), { ...DEFAULT_SETTINGS });
  // 引数なし・変な引数でも落ちない
  assert.deepEqual(saveSettings(), { ...DEFAULT_SETTINGS });
  assert.deepEqual(saveSettings('x'), { ...DEFAULT_SETTINGS });
  // 設定を変えてもレベルは変わらない
  recordSession('words', 'pointing', results(10));
  saveSettings({ fontSize: 'xxlarge' });
  assert.equal(getLength('words'), 3);
});

test('resetAll: 記録も設定も最初の状態に戻る', () => {
  recordSession('words', 'pointing', results(10));
  recordSession('digits', 'paper', results(10));
  saveSettings({ fontSize: 'xxlarge', rate: 0.8 });
  resetAll();
  assert.equal(storage.getItem(STORAGE_KEY), null);
  for (const id of COURSE_IDS) {
    assert.equal(getLength(id), COURSES[id].minLen);
    assert.deepEqual(getHistory(id), []);
  }
  assert.deepEqual(getSettings(), { ...DEFAULT_SETTINGS });
});

test('保存先が無い環境（node など）でもメモリで動く', () => {
  _setStorageForTest(null);
  assert.equal(getLength('words'), 2);
  assert.equal(recordSession('words', 'pointing', results(8)).change, 'up');
  assert.equal(recordSession('words', 'paper', results(9)).change, 'up');
  assert.equal(getLength('words'), 4);
  assert.equal(getHistory('words').length, 2);
  assert.equal(saveSettings({ sfxVolume: 0.2 }).sfxVolume, 0.2);
  assert.equal(getSettings().sfxVolume, 0.2);
  resetAll();
  assert.equal(getLength('words'), 2);
  assert.deepEqual(getSettings(), { ...DEFAULT_SETTINGS });
});

test('差し替えなし（本物の globalThis.localStorage が無い／使えない）でも落ちない', () => {
  _setStorageForTest(undefined);
  resetAll();
  assert.equal(getLength('digits'), 2);
  assert.equal(recordSession('digits', 'pointing', results(10)).newLength, 3);
  assert.equal(getLength('digits'), 3);
  resetAll();
  assert.equal(getLength('digits'), 2);
});

test('書き込みできない保存先（プライベートモード・容量超過）でもメモリで続けられる', () => {
  const s = fakeStorage({ [STORAGE_KEY]: JSON.stringify({ courses: { words: { length: 4 } } }) });
  s.setItem = () => { throw new Error('QuotaExceededError'); };
  _setStorageForTest(s);
  assert.equal(getLength('words'), 4, '読むことはできる');
  assert.equal(recordSession('words', 'pointing', results(9)).newLength, 5);
  assert.equal(getLength('words'), 5, '書けなくても今の画面では進む');
  assert.equal(recordSession('words', 'pointing', results(2)).newLength, 4);
  assert.equal(getHistory('words').length, 2);
  assert.equal(saveSettings({ rate: 1.2 }).rate, 1.2);
  assert.equal(getSettings().rate, 1.2);
});

test('読み書きとも例外になる保存先でも落ちない', () => {
  const boom = () => { throw new Error('SecurityError'); };
  _setStorageForTest({ getItem: boom, setItem: boom, removeItem: boom });
  assert.equal(getLength('sentences'), 2);
  assert.equal(recordSession('sentences', 'paper', results(8)).newLength, 3);
  assert.equal(getLength('sentences'), 3);
  assert.equal(getHistory('sentences').length, 1);
  resetAll();
  assert.equal(getLength('sentences'), 2);
  assert.deepEqual(getHistory('sentences'), []);
});
