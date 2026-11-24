// access.js のテスト（node --test tests/）
// 作成者: KENTA SHINKAWA
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isCode, withinGrace, isStale, takeCodeFromUrl, checkCode, GRACE_MS, RECHECK_MS } from '../js/access.js';

const DAY = 24 * 60 * 60 * 1000;
const now = Date.UTC(2026, 10, 24);

test('合言葉は6けたの数字だけ', () => {
  assert.equal(isCode('123456'), true);
  for (const v of ['12345', '1234567', '12345a', '１２３４５６', '', null, 123456]) assert.equal(isCode(v), false);
});

test('通信できなくても、最後の ok から14日以内は使える', () => {
  assert.equal(GRACE_MS, 14 * DAY);
  assert.equal(withinGrace({ code: '123456', status: 'ok', checkedAt: now - 13 * DAY }, now), true);
  assert.equal(withinGrace({ code: '123456', status: 'ok', checkedAt: now - 15 * DAY }, now), false);
  assert.equal(withinGrace({ code: '123456', status: 'stopped', checkedAt: now }, now), false);
  assert.equal(withinGrace({ code: '123456', status: 'ok', checkedAt: 0 }, now), false);
  assert.equal(withinGrace(null, now), false);
});

test('1時間たったら確かめ直す', () => {
  assert.equal(isStale({ checkedAt: now - RECHECK_MS + 1000 }, now), false);
  assert.equal(isStale({ checkedAt: now - RECHECK_MS }, now), true);
});

test('?k= を取り出し、URL から消す（ほかの引数は残す）', () => {
  const calls = [];
  const hist = { state: null, replaceState: (s, t, u) => calls.push(u) };
  assert.equal(takeCodeFromUrl({ href: 'https://example.com/app/?k=123456&x=1#a' }, hist), '123456');
  assert.deepEqual(calls, ['/app/?x=1#a']);
  assert.equal(takeCodeFromUrl({ href: 'https://example.com/app/?k=abc' }, hist), null);
  assert.equal(calls[1], '/app/');
  assert.equal(takeCodeFromUrl({ href: 'https://example.com/app/' }, hist), null);
  assert.equal(calls.length, 2);
});

test('check_code の呼び方と、結果の読み取り', async () => {
  let seen;
  const reply = (value, ok = true) => async (url, init) => { seen = { url, init }; return { ok, json: async () => value }; };
  assert.equal(await checkCode('123456', { fetchImpl: reply('ok') }), 'ok');
  assert.equal(seen.url, 'https://zmajpgygyqucfzdklybq.supabase.co/rest/v1/rpc/check_code');
  assert.equal(seen.init.method, 'POST');
  assert.equal(seen.init.headers['Content-Type'], 'application/json');
  assert.ok(seen.init.headers.apikey.startsWith('sb_publishable_'));
  assert.deepEqual(JSON.parse(seen.init.body), { p_code: '123456' });
  assert.equal(await checkCode('123456', { fetchImpl: reply('stopped') }), 'stopped');
  assert.equal(await checkCode('123456', { fetchImpl: reply('unknown') }), 'unknown');
  assert.equal(await checkCode('123456', { fetchImpl: reply({ message: 'x' }, false) }), 'offline');
  assert.equal(await checkCode('123456', { fetchImpl: reply('へんな値') }), 'offline');
  assert.equal(await checkCode('123456', { fetchImpl: async () => { throw new TypeError('Failed to fetch'); } }), 'offline');
});
