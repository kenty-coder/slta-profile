// `node --test tests/` 用の入口。
// Node 21 以降はフォルダ名を渡すと「tests/index.js」を1つのテストファイルとして実行するため、
// ここから各テストを読み込みます。（`node --test` だけでも *.test.mjs は自動で見つかります）
// 作成者: KENTA SHINKAWA
import('./store.test.mjs');
import('./questions.test.mjs');
