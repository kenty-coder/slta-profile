#!/usr/bin/env node
// ききとりチャレンジ 音声ファイル作成スクリプト
// 作成者: KENTA SHINKAWA
//
// js/data.js に書かれた単語・数字・文章の部品・ほめ言葉を、
// Microsoft Azure の音声合成（Speech サービス）で mp3 にして audio/ に保存します。
// Node.js 22 以上で動きます（追加のインストールは不要）。
//
// ■ 準備
//   Azure ポータルで「音声サービス（Speech）」のリソースを作り、キーと地域を確認します。
//   キーはこのファイルや他のファイルに書かず、実行するときに環境変数で渡してください。
//
// ■ 使い方（プロジェクトのフォルダで）
//   AZURE_SPEECH_KEY=（キー） node tools/generate-audio.mjs
//
//   Windows (PowerShell) の場合:
//     $env:AZURE_SPEECH_KEY="（キー）"; node tools/generate-audio.mjs
//
// ■ 環境変数
//   AZURE_SPEECH_KEY     必須。Speech サービスのキー
//   AZURE_SPEECH_REGION  地域。既定は japaneast
//   AZURE_SPEECH_VOICE   声。既定は ja-JP-NanamiNeural
//
// ■ オプション
//   --dry-run        作らずに一覧だけ表示（キー不要）
//   --show-ssml      --dry-run と一緒に使うと、送る SSML も表示
//   --force          既にあるファイルも作り直す
//   --only w/inu     名前に「w/inu」を含むものだけ（複数は --only w/inu,d/3 または --only を繰り返す）
//                    例: --only d/ → 数字だけ、--only p/ → ほめ言葉だけ
//   --help           この説明を表示
//
// ■ 読み方がおかしいとき
//   下の SAY_OVERRIDES に「音声ファイル名: 読ませたい文字」を足して、
//   node tools/generate-audio.mjs --force --only （その名前） で作り直します。
//   js/data.js は変更しなくて構いません。

import { readFile, writeFile, mkdir, rename, stat, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_FILE = path.join(ROOT, 'js', 'data.js');

const OUTPUT_FORMAT = 'audio-24khz-96kbitrate-mono-mp3';
const REQUEST_INTERVAL_MS = 300; // 1件ごとの間隔
const MAX_TRIES = 5;             // 429 / 5xx / 通信エラー時の最大試行回数
const REQUEST_TIMEOUT_MS = 30000;

// ------------------------------------------------------------
// 読み方の上書き表（キーは data.js の audio の値）
//   漢字1文字などで読みがゆれるものを、かなで指定します。
//   数字は data.js の say が既にひらがな（いち、に…）なのでそのまま使います。
// ------------------------------------------------------------
const SAY_OVERRIDES = {
  'audio/w/ie.mp3': 'いえ',        // 家 →「うち」と読まれないように
  'audio/w/tsuki.mp3': 'つき',     // 月 →「がつ／げつ」と読まれないように
  'audio/w/sakana.mp3': 'さかな',  // 魚 →「うお」と読まれないように
  'audio/w/megane.mp3': 'メガネ',  // 眼鏡 →「がんきょう」と読まれないように
  'audio/s/wo_megane.mp3': 'メガネを',
  'audio/s/wo_tsuki.mp3': 'つきを',
};

// 種類ごとの話し方（rate: 話す速さ、style: 感情表現）
const STYLE_BY_KIND = {
  w: { rate: '-5%' },                 // 単語
  d: { rate: '-8%' },                 // 数字（1〜2拍と短いので少しゆっくり）
  s: { rate: '-5%' },                 // 文章の部品
  p: { rate: '0%', style: 'cheerful', styleDegree: '1.2' }, // ほめ言葉は明るく
};

// mstts:express-as の cheerful が使える声（ここに無い声では感情表現を付けません）
const VOICES_WITH_CHEERFUL = new Set(['ja-JP-NanamiNeural']);

// 語頭・語尾の無音（長すぎると間隔の設定とずれるので短く固定）
const LEADING_SILENCE_MS = 40;
const TAILING_SILENCE_MS = 120;

// ------------------------------------------------------------
// SSML の組み立て
// ------------------------------------------------------------
export function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/** 'audio/w/inu.mp3' → 'w' */
export function kindOf(audioPath) {
  const m = /^audio\/([a-z]+)\//.exec(audioPath);
  return m ? m[1] : 'w';
}

/** 実際に読ませる文字を決める（上書き表 → data.js の say）。短い語が言い切りの調子になるよう句点を付ける */
export function spokenText(item) {
  const base = (SAY_OVERRIDES[item.audio] ?? item.say).trim();
  return /[。！？!?]$/.test(base) ? base : base + '。';
}

/**
 * 1項目分の SSML を作る。
 * useStyle=false にすると感情表現（express-as）を付けない。
 */
export function buildSsml(item, voice, { useStyle = true } = {}) {
  const conf = STYLE_BY_KIND[kindOf(item.audio)] ?? STYLE_BY_KIND.w;
  let body = `<prosody rate="${conf.rate}">${escapeXml(spokenText(item))}</prosody>`;
  if (useStyle && conf.style && VOICES_WITH_CHEERFUL.has(voice)) {
    body = `<mstts:express-as style="${conf.style}" styledegree="${conf.styleDegree}">${body}</mstts:express-as>`;
  }
  return (
    '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" ' +
    'xmlns:mstts="http://www.w3.org/2001/mstts" xml:lang="ja-JP">' +
    `<voice name="${escapeXml(voice)}">` +
    `<mstts:silence type="Leading-exact" value="${LEADING_SILENCE_MS}ms"/>` +
    `<mstts:silence type="Tailing-exact" value="${TAILING_SILENCE_MS}ms"/>` +
    body +
    '</voice></speak>'
  );
}

/** SSML に感情表現が入っているか */
const hasStyle = (ssml) => ssml.includes('<mstts:express-as');

// ------------------------------------------------------------
// 補助
// ------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class FatalError extends Error {} // 続けても無駄な失敗（キーの間違いなど）

async function loadItems() {
  // data.js は ES Modules。package.json が無くても読めるよう、中身を直接取り込む
  const src = await readFile(DATA_FILE, 'utf8');
  const mod = await import('data:text/javascript;base64,' + Buffer.from(src, 'utf8').toString('base64'));
  if (typeof mod.allAudioItems !== 'function') throw new FatalError('js/data.js に allAudioItems() が見つかりません。');
  const seen = new Set();
  const items = [];
  for (const it of mod.allAudioItems()) {
    if (!it || !it.audio || !it.say) continue;
    if (!/^audio\/[A-Za-z0-9_\-/]+\.mp3$/.test(it.audio) || it.audio.includes('..')) {
      throw new FatalError(`音声ファイルの場所が想定外です: ${it.audio}`);
    }
    if (seen.has(it.audio)) continue;
    seen.add(it.audio);
    items.push({ audio: it.audio, say: it.say });
  }
  return items;
}

async function fileExists(p) {
  try { return (await stat(p)).size > 0; } catch { return false; }
}

function parseArgs(argv) {
  const opts = { dryRun: false, force: false, showSsml: false, help: false, only: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--force') opts.force = true;
    else if (a === '--show-ssml') opts.showSsml = true;
    else if (a === '--help' || a === '-h') opts.help = true;
    else if (a === '--only' || a.startsWith('--only=')) {
      const v = a === '--only' ? argv[++i] : a.slice('--only='.length);
      if (!v || v.startsWith('--')) throw new FatalError('--only のあとに絞り込む文字を書いてください。例: --only w/inu');
      opts.only.push(...v.split(',').map((s) => s.trim()).filter(Boolean));
    } else {
      throw new FatalError(`分からないオプションです: ${a}\n使い方は node tools/generate-audio.mjs --help で確認できます。`);
    }
  }
  return opts;
}

async function printHelp() {
  // ファイル冒頭のコメントをそのまま説明として出す
  const src = await readFile(fileURLToPath(import.meta.url), 'utf8');
  const lines = src.split('\n').slice(1);
  const end = lines.findIndex((l) => !l.startsWith('//'));
  console.log(lines.slice(0, end).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
}

// ------------------------------------------------------------
// Azure 音声合成
// ------------------------------------------------------------
async function requestOnce({ region, key, ssml }) {
  const res = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': key,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': OUTPUT_FORMAT,
      'User-Agent': 'tts-audio-generator',
    },
    body: ssml,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (res.ok) {
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 200) throw new Error('受け取った音声が空でした');
    return { ok: true, buf };
  }
  const detail = (await res.text().catch(() => '')).slice(0, 200);
  return { ok: false, status: res.status, retryAfter: Number(res.headers.get('retry-after')) || 0, detail };
}

/** 1項目を合成して mp3 のデータを返す。429/5xx/通信エラーは待って再試行 */
async function synthesize(item, { region, key, voice }) {
  let ssml = buildSsml(item, voice);
  let lastError = '';
  for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
    let r;
    try {
      r = await requestOnce({ region, key, ssml });
    } catch (e) {
      lastError = `通信エラー（${e.cause?.code || e.name || e.message}）`;
      r = null;
    }
    if (r?.ok) return r.buf;
    if (r) {
      if (r.status === 401 || r.status === 403) {
        throw new FatalError(
          `Azure に拒否されました（${r.status}）。AZURE_SPEECH_KEY と AZURE_SPEECH_REGION（今は ${region}）が正しいか確認してください。`,
        );
      }
      if (r.status === 400 && hasStyle(ssml)) {
        // この声では感情表現が使えない可能性。外してやり直す（回数には数えない）
        ssml = buildSsml(item, voice, { useStyle: false });
        attempt--;
        continue;
      }
      lastError = `HTTP ${r.status}${r.detail ? ' ' + r.detail : ''}`;
      const retryable = r.status === 429 || r.status === 408 || r.status >= 500;
      if (!retryable) {
        if (r.status === 400) lastError += `（声の名前 ${voice} が正しいか確認してください）`;
        break;
      }
    }
    if (attempt < MAX_TRIES) {
      const waitMs = Math.min(60000, Math.max((r?.retryAfter || 0) * 1000, 1000 * 2 ** attempt));
      console.log(`    … ${lastError}。${Math.round(waitMs / 1000)}秒待って再試行します（${attempt}/${MAX_TRIES - 1}）`);
      await sleep(waitMs);
    }
  }
  throw new Error(lastError || '不明な失敗');
}

async function saveFile(dest, buf) {
  await mkdir(path.dirname(dest), { recursive: true });
  const tmp = dest + '.tmp';
  await writeFile(tmp, buf);
  await rename(tmp, dest); // 途中で止まっても壊れたファイルを残さない
}

// ------------------------------------------------------------
// 本体
// ------------------------------------------------------------
async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) { await printHelp(); return 0; }

  const region = (process.env.AZURE_SPEECH_REGION || 'japaneast').trim().toLowerCase();
  const voice = (process.env.AZURE_SPEECH_VOICE || 'ja-JP-NanamiNeural').trim();
  const key = (process.env.AZURE_SPEECH_KEY || '').trim();
  if (!/^[a-z0-9]+$/.test(region)) throw new FatalError(`AZURE_SPEECH_REGION の値が正しくありません: ${region}（例: japaneast）`);

  const all = await loadItems();
  const items = opts.only.length ? all.filter((it) => opts.only.some((o) => it.audio.includes(o))) : all;
  if (items.length === 0) {
    throw new FatalError(`--only ${opts.only.join(',')} に当てはまるものがありません（全部で ${all.length} 件。--dry-run で一覧を確認できます）。`);
  }

  // 何をするか決める
  const plan = [];
  for (const it of items) {
    const dest = path.join(ROOT, ...it.audio.split('/'));
    const exists = await fileExists(dest);
    plan.push({ ...it, dest, exists, todo: opts.force || !exists });
  }
  const todo = plan.filter((p) => p.todo);

  if (opts.dryRun) {
    console.log(`【一覧のみ】声: ${voice} ／ 地域: ${region}`);
    for (const p of plan) {
      const mark = p.todo ? (p.exists ? '作り直す' : '作る　　') : '済み　　';
      console.log(`${mark}  ${p.audio.padEnd(30)} 「${spokenText(p)}」`);
      if (opts.showSsml) console.log(`          ${buildSsml(p, voice)}`);
    }
    console.log(`\n対象 ${plan.length} 件（作る ${todo.length} 件、済み ${plan.length - todo.length} 件）。実際には作っていません。`);
    return 0;
  }

  if (todo.length === 0) {
    console.log(`対象 ${plan.length} 件はすべて作成済みです（作り直すときは --force）。`);
    return 0;
  }

  if (!key) {
    throw new FatalError(
      [
        'Azure 音声サービスのキーが設定されていません。',
        '環境変数 AZURE_SPEECH_KEY にキーを入れて、もう一度実行してください。',
        '  例) AZURE_SPEECH_KEY=（キー） node tools/generate-audio.mjs',
        '  Windows (PowerShell) の例) $env:AZURE_SPEECH_KEY="（キー）"; node tools/generate-audio.mjs',
        'キーはファイルに書かないでください。作る内容の確認だけなら --dry-run が使えます。',
      ].join('\n'),
    );
  }

  console.log(`音声を作ります: ${todo.length} 件（済み ${plan.length - todo.length} 件は飛ばします）／ 声: ${voice} ／ 地域: ${region}`);
  let ok = 0;
  const failed = [];
  for (let i = 0; i < todo.length; i++) {
    const p = todo[i];
    const head = `[${String(i + 1).padStart(3)}/${todo.length}] ${p.audio}`;
    try {
      const buf = await synthesize(p, { region, key, voice });
      await saveFile(p.dest, buf);
      ok++;
      console.log(`${head}  できました（${Math.round(buf.length / 1024)}KB）「${spokenText(p)}」`);
    } catch (e) {
      await rm(p.dest + '.tmp', { force: true }).catch(() => {});
      if (e instanceof FatalError) {
        console.error(`${head}  失敗`);
        console.error(`\n${e.message}`);
        console.error(`ここで中止しました（成功 ${ok} 件、残り ${todo.length - ok} 件）。`);
        return 1;
      }
      failed.push(p.audio);
      console.error(`${head}  失敗: ${e.message}`);
    }
    if (i < todo.length - 1) await sleep(REQUEST_INTERVAL_MS);
  }

  console.log(`\n終わりました。成功 ${ok} 件 ／ 失敗 ${failed.length} 件 ／ 済みで飛ばした ${plan.length - todo.length} 件`);
  if (failed.length) {
    console.log('失敗したもの:');
    failed.forEach((f) => console.log(`  ${f}`));
    console.log('もう一度同じコマンドを実行すると、失敗した分だけ作り直します。');
    return 1;
  }
  return 0;
}

// 直接実行されたときだけ動かす（他から import して SSML の関数だけ使うこともできる）
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(
    (code) => { process.exitCode = code; },
    (e) => {
      console.error(e instanceof FatalError ? e.message : `思わぬエラーで止まりました: ${e?.stack || e}`);
      process.exitCode = 1;
    },
  );
}
