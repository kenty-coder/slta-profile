// ききとりチャレンジ 教材データ（単語・数字・文章の部品・ほめ言葉）
// 作成者: KENTA SHINKAWA
// このファイルが「絵」「音声」「出題」すべての元になります。
// 単語を増やすときは WORDS に1行足し、同じ id の絵 (img/w/<id>.svg) を置き、
// tools/generate-audio.mjs を実行して音声を作ります。

export const SESSION_LENGTH = 10; // 1回は10問で固定

export const COURSES = {
  words: { id: 'words', label: '単語コース', unit: 'こ', minLen: 2, maxLen: 7 },
  digits: { id: 'digits', label: '数字コース', unit: 'けた', minLen: 2, maxLen: 7 },
  sentences: { id: 'sentences', label: '文章コース', unit: '語文', minLen: 2, maxLen: 6 },
};

// [id, かな表示, 読み上げ用の表記]
const W = [
  ['inu', 'いぬ', 'いぬ'], ['neko', 'ねこ', 'ねこ'], ['tori', 'とり', 'とり'], ['sakana', 'さかな', 'さかな'], ['uma', 'うま', 'うま'],
  ['ringo', 'りんご', 'りんご'], ['mikan', 'みかん', 'みかん'], ['banana', 'バナナ', 'バナナ'], ['pan', 'パン', 'パン'],
  ['tamago', 'たまご', 'たまご'], ['gohan', 'ごはん', 'ご飯'], ['ocha', 'おちゃ', 'お茶'], ['mizu', 'みず', 'みず'], ['gyunyu', 'ぎゅうにゅう', '牛乳'],
  ['tokei', 'とけい', '時計'], ['megane', 'めがね', '眼鏡'], ['kasa', 'かさ', 'かさ'], ['kutsu', 'くつ', 'くつ'], ['boshi', 'ぼうし', '帽子'],
  ['kaban', 'かばん', 'かばん'], ['saifu', 'さいふ', '財布'], ['kagi', 'かぎ', 'かぎ'], ['denwa', 'でんわ', '電話'], ['hon', 'ほん', 'ほん'],
  ['shinbun', 'しんぶん', '新聞'], ['enpitsu', 'えんぴつ', '鉛筆'], ['hasami', 'はさみ', 'ハサミ'], ['koppu', 'コップ', 'コップ'],
  ['hashi', 'はし', 'はし'], ['supun', 'スプーン', 'スプーン'], ['haburashi', 'はブラシ', '歯ブラシ'], ['taoru', 'タオル', 'タオル'], ['kusuri', 'くすり', 'くすり'],
  ['isu', 'いす', '椅子'], ['tsukue', 'つくえ', 'つくえ'], ['beddo', 'ベッド', 'ベッド'], ['terebi', 'テレビ', 'テレビ'], ['mado', 'まど', 'まど'],
  ['doa', 'ドア', 'ドア'], ['denki', 'でんき', '電気'],
  ['kuruma', 'くるま', 'くるま'], ['densha', 'でんしゃ', '電車'], ['basu', 'バス', 'バス'], ['jitensha', 'じてんしゃ', '自転車'],
  ['hikoki', 'ひこうき', '飛行機'], ['fune', 'ふね', 'ふね'],
  ['hana', 'はな', 'はな'], ['yama', 'やま', 'やま'], ['tsuki', 'つき', 'つき'], ['ie', 'いえ', 'いえ'],
  // ---- 追加分（2回目）----
  ['ushi', 'うし', 'うし'], ['buta', 'ぶた', 'ぶた'], ['saru', 'さる', 'さる'], ['zo', 'ぞう', 'ぞう'], ['usagi', 'うさぎ', 'うさぎ'],
  ['suika', 'すいか', 'スイカ'], ['budo', 'ぶどう', 'ぶどう'], ['ichigo', 'いちご', 'いちご'], ['tomato', 'トマト', 'トマト'],
  ['ninjin', 'にんじん', '人参'], ['daikon', 'だいこん', '大根'], ['tamanegi', 'たまねぎ', '玉ねぎ'], ['onigiri', 'おにぎり', 'おにぎり'],
  ['udon', 'うどん', 'うどん'], ['sushi', 'すし', '寿司'], ['tofu', 'とうふ', '豆腐'], ['kohi', 'コーヒー', 'コーヒー'], ['biru', 'ビール', 'ビール'],
  ['shatsu', 'シャツ', 'シャツ'], ['zubon', 'ズボン', 'ズボン'], ['kutsushita', 'くつした', '靴下'], ['tebukuro', 'てぶくろ', '手袋'],
  ['masuku', 'マスク', 'マスク'], ['tsue', 'つえ', 'つえ'], ['hocho', 'ほうちょう', '包丁'], ['nabe', 'なべ', 'なべ'], ['yakan', 'やかん', 'やかん'],
  ['sara', 'さら', 'さら'], ['sekken', 'せっけん', '石鹸'], ['kushi', 'くし', 'くし'], ['kagami', 'かがみ', 'かがみ'], ['rimokon', 'リモコン', 'リモコン'],
  ['karenda', 'カレンダー', 'カレンダー'], ['tegami', 'てがみ', '手紙'], ['okane', 'おかね', 'お金'], ['gomibako', 'ごみばこ', 'ゴミ箱'],
  ['hoki', 'ほうき', 'ほうき'], ['futon', 'ふとん', '布団'], ['makura', 'まくら', 'まくら'],
  ['reizoko', 'れいぞうこ', '冷蔵庫'], ['sentakuki', 'せんたくき', '洗濯機'], ['eakon', 'エアコン', 'エアコン'], ['toire', 'トイレ', 'トイレ'],
  ['ofuro', 'おふろ', 'お風呂'], ['kaidan', 'かいだん', '階段'],
  ['takushi', 'タクシー', 'タクシー'], ['kyukyusha', 'きゅうきゅうしゃ', '救急車'], ['posuto', 'ポスト', 'ポスト'], ['hoshi', 'ほし', 'ほし'], ['kumo', 'くも', 'くも'],
];

// 出題の1単位（Item）の形: { key, text, say, audio, img, label }
//   key   : 一意の名前
//   text  : 画面・答えに出す文字（かな）
//   say   : 音声合成に渡す文字
//   audio : 音声ファイルの場所
//   img   : 絵の場所（数字は null）
//   label : カードに文字で出すとき用（数字は '3' など）
export const WORDS = W.map(([id, kana, say]) => ({
  key: `w:${id}`, id, text: kana, say, audio: `audio/w/${id}.mp3`, img: `img/w/${id}.svg`, label: kana,
}));
export const wordById = Object.fromEntries(WORDS.map((w) => [w.id, w]));

const D = [['1', 'いち'], ['2', 'に'], ['3', 'さん'], ['4', 'よん'], ['5', 'ご'], ['6', 'ろく'], ['7', 'なな'], ['8', 'はち'], ['9', 'きゅう']];
export const DIGITS = D.map(([n, kana]) => ({
  key: `d:${n}`, id: n, text: n, say: kana, audio: `audio/d/${n}.mp3`, img: null, label: n,
}));

// ---- 文章コースの部品 ----
const part = (kind, id, kana, sayBase, particle = '', imgPath = `img/s/${id}.svg`) => ({
  key: `s:${kind}:${id}`, id, kind, text: kana + particle, say: sayBase + particle,
  audio: `audio/s/${kind}_${id}.mp3`, img: imgPath, label: kana + particle,
});

const TIMES = [['asa', 'あさ', 'あさ'], ['hiru', 'ひる', 'ひる'], ['yoru', 'よる', 'よる']];
const PERSONS = [
  ['otoko', 'おとこのひと', '男の人'], ['onna', 'おんなのひと', '女の人'], ['otokonoko', 'おとこのこ', '男の子'],
  ['onnanoko', 'おんなのこ', '女の子'], ['ojiisan', 'おじいさん', 'おじいさん'], ['obaasan', 'おばあさん', 'おばあさん'],
];
const PLACES = [['koen', 'こうえん', '公園'], ['daidokoro', 'だいどころ', '台所'], ['eki', 'えき', 'えき'], ['mise', 'みせ', 'みせ'], ['heya', 'へや', '部屋']];

// 動詞: objects が空のものは「〜が ねる」のような2語文用
const VERBS = [
  { id: 'neru', kana: 'ねる', say: '寝る', objects: [], places: [] },
  { id: 'aruku', kana: 'あるく', say: '歩く', objects: [], places: [] },
  { id: 'hashiru', kana: 'はしる', say: '走る', objects: [], places: [] },
  { id: 'warau', kana: 'わらう', say: '笑う', objects: [], places: [] },
  { id: 'suwaru', kana: 'すわる', say: '座る', objects: [], places: [] },
  { id: 'taberu', kana: 'たべる', say: '食べる', objects: ['ringo', 'mikan', 'banana', 'pan', 'tamago', 'gohan'], places: ['daidokoro', 'koen', 'heya', 'mise'] },
  { id: 'nomu', kana: 'のむ', say: '飲む', objects: ['ocha', 'mizu', 'gyunyu', 'kusuri'], places: ['daidokoro', 'heya', 'koen', 'eki'] },
  { id: 'yomu', kana: 'よむ', say: '読む', objects: ['hon', 'shinbun'], places: ['heya', 'koen', 'eki', 'daidokoro'] },
  { id: 'kau', kana: 'かう', say: '買う', objects: ['ringo', 'mikan', 'banana', 'pan', 'tamago', 'kasa', 'kutsu', 'boshi', 'kaban', 'hon', 'shinbun', 'hana', 'tokei', 'megane'], places: ['mise', 'eki'] },
  { id: 'arau', kana: 'あらう', say: '洗う', objects: ['koppu', 'taoru', 'kutsu', 'hashi', 'supun'], places: ['daidokoro', 'koen'] },
  { id: 'miru', kana: 'みる', say: '見る', objects: ['tokei', 'hana', 'tsuki', 'densha', 'hikoki', 'tori'], places: ['koen', 'eki', 'heya'] },
  { id: 'sagasu', kana: 'さがす', say: '探す', objects: ['megane', 'saifu', 'kagi', 'kasa', 'denwa', 'boshi'], places: ['heya', 'eki', 'mise', 'koen', 'daidokoro'] },
];

export const SENTENCE_PARTS = {
  times: TIMES.map(([id, k, s]) => part('time', id, k, s)),                 // 「あさ」
  subjects: PERSONS.map(([id, k, s]) => part('ga', id, k, s, 'が')),         // 「おとこのひとが」
  partners: PERSONS.map(([id, k, s]) => part('to', id, k, s, 'と')),         // 「おんなのひとと」
  places: PLACES.map(([id, k, s]) => part('de', id, k, s, 'で')),            // 「こうえんで」
  // 「りんごを」: 絵は単語コースと同じものを使う
  objects: WORDS.map((w) => part('wo', w.id, w.text, w.say, 'を', w.img)),
  verbs: VERBS.map((v) => ({ ...part('verb', v.id, v.kana, v.say), objects: v.objects, places: v.places })),
};

// 文の型（語文の数 → 部品の並び）
//   2語文: だれが / どうする            例) ねこ…ではなく人: おじいさんが ねる
//   3語文: だれが / なにを / どうする
//   4語文: だれが / どこで / なにを / どうする
//   5語文: いつ / だれが / どこで / なにを / どうする
//   6語文: いつ / だれが / だれと / どこで / なにを / どうする
export const SENTENCE_PATTERNS = {
  2: ['subject', 'verbIntransitive'],
  3: ['subject', 'object', 'verb'],
  4: ['subject', 'place', 'object', 'verb'],
  5: ['time', 'subject', 'place', 'object', 'verb'],
  6: ['time', 'subject', 'partner', 'place', 'object', 'verb'],
};

// ---- ほめ言葉（正解のとき、ランダムに1つ）----
const phrase = (id, text) => ({ key: `p:${id}`, id, text, say: text, audio: `audio/p/${id}.mp3`, img: null, label: text });
export const PRAISES = [
  phrase('bacchiri', 'バッチリです！'),
  phrase('sonochoshi', 'その調子です！'),
  phrase('omigoto', 'お見事です！'),
  phrase('seikai', '正解です！'),
  phrase('sasuga', 'さすがです！'),
  phrase('iikanji', 'いい感じです！'),
];
export const LEVELUP_PHRASE = phrase('levelup', 'レベルアップ！バッチリです！');

// 音声ファイルを作るべき全項目（重複なし）: [{ audio, say }]
export function allAudioItems() {
  const p = SENTENCE_PARTS;
  // 文章で実際に使う「〜を」だけ作る
  const usedObj = new Set(p.verbs.flatMap((v) => v.objects));
  const list = [
    ...WORDS, ...DIGITS, ...p.times, ...p.subjects, ...p.partners, ...p.places,
    ...p.objects.filter((o) => usedObj.has(o.id)), ...p.verbs, ...PRAISES, LEVELUP_PHRASE,
  ];
  return list.map(({ audio, say }) => ({ audio, say }));
}
