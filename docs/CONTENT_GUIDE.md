# 教材の追加・修正ガイド

レッスンは `js/content/level*.js` の配列に1オブジェクトとして書きます。画面・進捗・採点は自動で対応します。

## レッスン

```js
{
  id: 'ch26', level: 3, chapter: 26, title: '…', difficulty: 3, minutes: 60,
  prereq: ['ch18'],            // 前提レッスン
  dataset: 'migration',        // base | migration | bulk
  setup: '',                   // このレッスンの練習DBに追加で流すSQL（任意）
  summary, goal, usage,        // 学習内容 / 1.学習目標 / 2.実務での利用場面
  terms: [['用語', '説明']],    // 3.用語
  syntax: '...',               // 4.基本構文
  examples: [{ title, sql }],  // 5.具体例（6.実行結果はアプリで実際に実行）
  explanation: 'Markdown',     // 7.解説（**太字**、`code`、- 箇条書き、| 表 |、```sql）
  exercises: [ ... ],          // 8〜11
  mistakes: [], errorChecks: [], practice: [],   // 12〜14
  quiz: [{ q, options: [], answer: 0, explain }], // 15
}
```

## 演習（exercises）

| type | 必須項目 | 採点 |
|---|---|---|
| choice | options, answerIndex | 選択肢 |
| predict | predictSql, options, answerIndex | 選択肢（その後に実際に実行して確認） |
| fill | template（`{{正解}}` が空欄になる） | 空欄を埋めたSQLを実行して採点 |
| fix | starter（誤ったSQL）, answer | 実行して採点 |
| write / investigate | answer | 実行して採点 |
| deliverable | template（成果物ID）, minRows | 成果物の入力行数 |

採点オプション: `ordered`（並び順も比較）, `checkNames`（列名も比較）, `compare: 'none'`（結果ではなく状態で採点）, `check`（実行後に流して比較するSQL）, `allowDiff`（比較しないテーブル）, `mustInclude` / `mustNotInclude`（`[正規表現, メッセージ]`）, `requireSafe`（WHEREなし更新などを不合格に）, `setup`, `dataset`, `bulkRows`。

追加したら `node tests/content.test.mjs` で、模範解答が採点に通ること・誤り修正問題の元SQLが不合格になることを確認してください。
