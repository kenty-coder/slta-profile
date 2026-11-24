// ききとりチャレンジ 合言葉による利用の確認  作成：KENTA SHINKAWA
//
// 担当者から受け取った「合言葉（6けたの数字）」が使えるかどうかを、サーバーに問い合わせます。
// ・保存先は localStorage の別キー（kikitori-access）。練習の記録（kikitori-challenge）には一切さわりません。
// ・ここには画面の部品は置きません（画面は app.js）。保存・通信・判断だけを担当します。

export const ACCESS_KEY = 'kikitori-access';
export const GRACE_MS = 14 * 24 * 60 * 60 * 1000; // 通信できなくても、最後の確認から14日間は使える
export const RECHECK_MS = 60 * 60 * 1000;         // 開いたままのときは、1時間たったら確かめ直す
export const TIMEOUT_MS = 10000;

const API_URL = 'https://zmajpgygyqucfzdklybq.supabase.co';
const API_KEY = 'sb_publishable_R-wtpsYgIM7FgHIms-42dg_yjt1VHjO'; // 公開してよいキー

const CODE_RE = /^\d{6}$/;
export const isCode = (v) => typeof v === 'string' && CODE_RE.test(v);

// ---- 保存（localStorage が使えない設定のときは、このページを開いている間だけ覚える）----
let memory = null;

function storage() {
  try {
    const ls = globalThis.localStorage;
    return ls && typeof ls.getItem === 'function' ? ls : null;
  } catch {
    return null;
  }
}

function normalize(raw) {
  if (!raw || typeof raw !== 'object' || !isCode(raw.code)) return null;
  const checkedAt = Number(raw.checkedAt);
  return {
    code: raw.code,
    status: raw.status === 'stopped' ? 'stopped' : 'ok',
    checkedAt: Number.isFinite(checkedAt) && checkedAt > 0 ? checkedAt : 0,
  };
}

/** 保存してある合言葉。無ければ null。{ code, status: 'ok'|'stopped', checkedAt } */
export function load() {
  const s = storage();
  if (s) {
    try {
      const text = s.getItem(ACCESS_KEY);
      if (text != null) return normalize(JSON.parse(text));
      if (!memory) return null;
    } catch { /* 読めないときは控えを使う */ }
  }
  return memory ? { ...memory } : null;
}

/** 確認できた結果を保存する。status は 'ok' か 'stopped'。 */
export function save(code, status, now = Date.now()) {
  const rec = normalize({ code, status, checkedAt: now });
  if (!rec) return null;
  memory = rec;
  const s = storage();
  if (s) { try { s.setItem(ACCESS_KEY, JSON.stringify(rec)); } catch { /* 保存できなくても続ける */ } }
  return { ...rec };
}

/** 保存してある合言葉を消す（練習の記録は消しません）。 */
export function clear() {
  memory = null;
  const s = storage();
  if (s) { try { s.removeItem(ACCESS_KEY); } catch { /* 無視 */ } }
}

/** 通信できないとき、そのまま使ってよいか（最後に ok を確認してから14日以内）。 */
export function withinGrace(rec, now = Date.now()) {
  if (!rec || rec.status !== 'ok' || !rec.checkedAt) return false;
  const age = now - rec.checkedAt;
  return age <= GRACE_MS && age > -GRACE_MS; // 端末の時計が大きくずれている場合は確かめ直す
}

/** 前回の確認から時間がたっていて、確かめ直したほうがよいか。 */
export function isStale(rec, now = Date.now()) {
  return !rec || Math.abs(now - rec.checkedAt) >= RECHECK_MS;
}

/**
 * URL の ?k=123456 を合言葉として取り出し、URL からは消す（リンクやQRコードで渡せるように）。
 * 合言葉らしくない値は使わない（その場合も URL からは消す）。
 */
export function takeCodeFromUrl(loc = globalThis.location, hist = globalThis.history) {
  try {
    const url = new URL(loc.href);
    if (!url.searchParams.has('k')) return null;
    const value = (url.searchParams.get('k') || '').trim();
    url.searchParams.delete('k');
    try { hist.replaceState(hist.state, '', url.pathname + url.search + url.hash); } catch { /* 消せなくても続ける */ }
    return isCode(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * 合言葉をサーバーに確かめる。
 * @returns {Promise<'ok'|'stopped'|'unknown'|'offline'>} 'offline' は通信できなかったとき
 */
export async function checkCode(code, { fetchImpl = globalThis.fetch, timeoutMs = TIMEOUT_MS } = {}) {
  if (!isCode(code)) return 'unknown';
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
  try {
    const res = await fetchImpl(`${API_URL}/rest/v1/rpc/check_code`, {
      method: 'POST',
      headers: { apikey: API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_code: code }),
      cache: 'no-store',
      signal: ctrl ? ctrl.signal : undefined,
    });
    if (!res.ok) return 'offline';
    const value = await res.json();
    return value === 'ok' || value === 'stopped' || value === 'unknown' ? value : 'offline';
  } catch {
    return 'offline';
  } finally {
    if (timer) clearTimeout(timer);
  }
}
