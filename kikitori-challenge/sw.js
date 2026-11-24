// ききとりチャレンジ サービスワーカー  作成：KENTA SHINKAWA
//
// ねらい
//  ・GitHub を更新したら、患者さんが次に開いたとき自動で新しい内容になる
//      → 画面・プログラム（HTML/JS/CSS/manifest）は毎回ネットワークを先に見に行く（ネットワーク優先）。
//        つながらないときだけ、前回保存した分を使う。キャッシュ名を手で書き換える必要はない。
//  ・音声と絵は、保存済みをすぐ返しつつ裏で新しいものに入れ替える（stale-while-revalidate）
//  ・一度開いていれば圏外でも動く
//  ・練習の記録（localStorage）には一切さわらない。更新しても記録は消えない。
const CACHE = 'kikitori-challenge-cache';
const NETWORK_TIMEOUT_MS = 5000;

// 画面を動かすのに最低限必要なもの（インストール時に保存。1つ失敗しても止めない）
const CORE = [
  './', 'index.html', 'manifest.webmanifest',
  'css/style.css', 'css/print.css',
  'js/app.js', 'js/data.js', 'js/store.js', 'js/questions.js', 'js/audio.js', 'js/print.js', 'js/confetti.js',
  'img/icon.svg', 'img/icon-192.png',
];

const okToCache = (res) => res && res.status === 200 && res.type === 'basic';

async function put(req, res) {
  if (!okToCache(res)) return;
  try { const c = await caches.open(CACHE); await c.put(req, res); } catch (e) { /* 容量不足などは無視 */ }
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(Promise.allSettled(CORE.map(async (u) => {
    const res = await fetch(u, { cache: 'no-cache' });
    await put(u, res);
  })));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n !== CACHE && n.startsWith('kikitori')).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

function isShell(req, url) {
  if (req.mode === 'navigate') return true;
  const p = url.pathname;
  return p.endsWith('/') || /\.(html|js|mjs|css|webmanifest|json)$/.test(p);
}

async function fromCache(req, isNav) {
  const c = await caches.open(CACHE);
  let hit = await c.match(req, { ignoreSearch: true });
  if (!hit && isNav) hit = (await c.match('./')) || (await c.match('index.html'));
  return hit;
}

// ネットワーク優先。遅すぎる／つながらないときは保存済みを使う
async function networkFirst(req) {
  const isNav = req.mode === 'navigate';
  const net = fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }).then((res) => {
    if (okToCache(res)) put(req.url, res.clone());
    return res;
  });
  const timeout = new Promise((resolve) => setTimeout(resolve, NETWORK_TIMEOUT_MS, null));
  try {
    const res = await Promise.race([net, timeout]);
    if (res && (res.ok || res.type === 'opaqueredirect')) return res;
    const cached = await fromCache(req, isNav);
    if (cached) { net.catch(() => {}); return cached; }
    return res || (await net);
  } catch (e) {
    const cached = await fromCache(req, isNav);
    if (cached) return cached;
    throw e;
  }
}

// 保存済みをすぐ返し、裏で更新
async function staleWhileRevalidate(url, event) {
  const c = await caches.open(CACHE);
  const cached = await c.match(url);
  const net = fetch(url).then((res) => { if (okToCache(res)) put(url, res.clone()); return res; });
  if (cached) { event.waitUntil(net.catch(() => {})); return cached; }
  return net;
}

// 音声は端末によって「一部分だけ」要求してくる（Range）。保存済みから切り出して返す
async function ranged(req, event) {
  const res = await staleWhileRevalidate(req.url, event);
  if (!res || res.status !== 200) return res;
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.get('range') || '');
  if (!m || (m[1] === '' && m[2] === '')) return res;
  const buf = await res.arrayBuffer();
  const size = buf.byteLength;
  let start; let end;
  if (m[1] === '') { start = Math.max(0, size - Number(m[2])); end = size - 1; }
  else { start = Number(m[1]); end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1); }
  if (start >= size || start > end) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  }
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    statusText: 'Partial Content',
    headers: {
      'Content-Type': res.headers.get('Content-Type') || 'application/octet-stream',
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Content-Length': String(end - start + 1),
      'Accept-Ranges': 'bytes',
    },
  });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (isShell(req, url)) { event.respondWith(networkFirst(req)); return; }
  if (req.headers.has('range')) { event.respondWith(ranged(req, event)); return; }
  event.respondWith(staleWhileRevalidate(req.url, event));
});

// 画面側から「この音声・絵を先に保存しておいて」と頼まれたとき（圏外でも使えるように）
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type !== 'warm' || !Array.isArray(data.urls)) return;
  event.waitUntil((async () => {
    const c = await caches.open(CACHE);
    const queue = data.urls.filter((u) => typeof u === 'string' && u.startsWith(self.location.origin));
    const worker = async () => {
      while (queue.length) {
        const u = queue.shift();
        try {
          if (await c.match(u)) continue;
          const res = await fetch(u);
          if (okToCache(res)) await c.put(u, res);
        } catch (e) { return; /* 圏外になったら中止。次に開いたとき続きから */ }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
  })());
});
