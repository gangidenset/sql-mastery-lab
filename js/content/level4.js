// LEVEL 4：DB移行プロジェクト実践
import { MIG_CUSTOMERS, MIG_ORDERS_FULL, FULL_MIGRATION } from './migration-sql.js';

const DELTA_SETUP = FULL_MIGRATION + `
ALTER TABLE legacy_orders ADD COLUMN upd_ts timestamp;
UPDATE legacy_orders SET upd_ts = '2023-12-01 00:00:00';
CREATE TABLE sync_control (sync_name varchar(30) PRIMARY KEY, last_sync_at timestamp NOT NULL);
INSERT INTO sync_control VALUES ('orders', '2024-01-01 00:00:00');
INSERT INTO legacy_orders VALUES ('O0019', 'C0003', '20240105', '01', '5000', '2024-01-05 10:00:00');
UPDATE legacy_orders SET ord_sts = '03', upd_ts = '2024-01-06 09:00:00' WHERE ord_no = 'O0012';`;

const DELTA_UPSERT = `INSERT INTO orders (order_id, legacy_ord_no, customer_id, order_date, status, total_amount)
SELECT substr(o.ord_no, 2)::integer, o.ord_no, c.customer_id, o.ord_ymd::date, st.new_code,
       round(regexp_replace(o.amt_txt, '[,¥]', '', 'g')::numeric * 1.1)
FROM legacy_orders o
JOIN customers c    ON c.legacy_cust_no = o.cust_no
JOIN code_master st ON st.code_type = 'ORDER_STATUS' AND st.old_code = o.ord_sts
WHERE o.upd_ts > (SELECT last_sync_at FROM sync_control WHERE sync_name = 'orders')
  AND pg_input_is_valid(o.ord_ymd, 'date')
  AND regexp_replace(o.amt_txt, '[,¥]', '', 'g') ~ '^[0-9]+$'
ON CONFLICT (legacy_ord_no) DO UPDATE
  SET status = EXCLUDED.status, order_date = EXCLUDED.order_date, total_amount = EXCLUDED.total_amount;`;

export default [
// ------------------------------------------------------------------
{
  id: 'ch22', level: 4, chapter: 22, title: 'DB移行の計画', difficulty: 3, minutes: 60, prereq: ['ch18'], dataset: 'migration',
  summary: '対象調査、テーブル一覧、データ量、依存関係、対象/対象外、移行方式、手順、見積もり、リスク',
  goal: '移行対象と依存関係を調べて移行順序を決め、移行方式・手順・時間・リスクを計画書にまとめられる。',
  usage: '計画書はプロジェクトの全員（業務・インフラ・開発）が同じ前提で動くための地図です。',
  terms: [['移行方式', '一括移行（ビッグバン）/ 段階移行 / 並行稼働 など'], ['依存関係', '外部キーなどで、先に移行が必要なテーブル同士の関係'], ['リスク', '起こりうる問題と、その影響・対策']],
  syntax: "-- 外部キーの依存関係（子 → 親）\nSELECT conrelid::regclass AS child, confrelid::regclass AS parent\nFROM pg_constraint WHERE contype = 'f';",
  examples: [
    { title: '全テーブルの件数（新旧）', sql: "-- 統計情報（ANALYZE時点の推定件数）\nSELECT relname AS table_name, reltuples::bigint AS approx_rows\nFROM pg_class\nWHERE relkind = 'r' AND relnamespace = 'public'::regnamespace\nORDER BY relname;" },
  ],
  explanation: `**移行計画書の主な項目**（成果物テンプレート「DB移行計画書」）
1. 目的・範囲（対象システム、対象テーブル、対象外）
2. 移行方式と理由（例: 停止時間内に一括移行。データ量が少なく、並行稼働のコストが大きいため）
3. 移行順序（依存関係から決定：親 → 子）
4. スケジュール（リハーサル回数、本番日、停止時間）
5. 体制と役割（実行者・確認者・判断者）
6. 検証方針（件数・内容・集計、業務担当者の確認）
7. リスクと対策、切り戻し方針

**移行方式の選び方**（環境や要件で答えは変わります）
- データ量が少なく停止時間を取れる → 一括移行がシンプル
- データ量が多い・停止時間が短い → 事前移行＋差分移行（第23章）
- リスクを抑えたい → 段階移行（機能・拠点ごと）や並行稼働（コスト大）`,
  exercises: [
    { id: 'e1', type: 'investigate', title: '依存関係の調査', prompt: '新システムの外部キーについて、子テーブル child と参照先の親テーブル parent を表示してください（pg_constraint の contype = \'f\'）。テーブル名は ::regclass::text で文字列にしてください。',
      answer: "SELECT conrelid::regclass::text AS child, confrelid::regclass::text AS parent FROM pg_constraint WHERE contype = 'f';",
      hints: ["SELECT conrelid::regclass::text, confrelid::regclass::text FROM pg_constraint WHERE contype = 'f'"], explain: 'orders→customers、order_items→orders、order_items→products。ここから「customers・products → orders → order_items」の移行順が導けます。' },
    { id: 'e2', type: 'write', title: '作業時間の見積もり', prompt: "リハーサルで「旧注文1000件の移行に2秒」かかりました。本番の旧注文が **1,500,000件** のとき、単純比例での見積もり秒数 est_sec と、安全係数1.5倍を掛けた分数 est_min_safe（小数点以下切り上げ）を1行で表示してください。", answer: 'SELECT 1500000 / 1000.0 * 2 AS est_sec, CEIL(1500000 / 1000.0 * 2 * 1.5 / 60) AS est_min_safe;',
      hints: ['est_sec = 1500000 / 1000 * 2', 'CEIL(秒 * 1.5 / 60)'], explain: '3000秒、安全係数込みで75分。データ量が増えると比例しないことも多いため、可能なら本番相当の件数でリハーサルします。' },
    { id: 'e3', type: 'choice', title: '移行方式の選定', prompt: 'データ量2億件・業務停止は最大4時間・リハーサルでの一括移行は9時間。適切な方針は？',
      options: ['一括移行で強行する', '停止前に大部分を事前移行し、停止中は差分だけ移行する方式を検討する', '停止時間を無視する', '移行をあきらめる'], answerIndex: 1,
      hints: ['停止時間に収まらないなら…'], explain: '事前移行＋差分移行（第23章）や、データの分割移行を検討します。どの方式が使えるかはDB製品・構成・業務要件によって変わります。' },
    { id: 'e4', type: 'choice', title: 'リスクの洗い出し', prompt: '移行計画のリスクとして「移行元に想定外の不正データがあり、本番で移行SQLが失敗する」を挙げた。最も有効な対策は？',
      options: ['本番当日に気合で対応する', '本番直前のデータでリハーサルし、不正データ検出SQLを本番手順の最初に組み込む（検出時の判断基準も決める）', 'リスク表に書くだけ', 'SQLを短くする'], answerIndex: 1,
      hints: ['リスクには「予防策」と「発生時の対応」をセットで。'], explain: 'データは日々変わるため、本番直前の再調査が重要です。' },
  ],
  mistakes: ['依存関係を確認せずに移行順を決める', 'リハーサルなしの時間見積もり', '対象外データの扱いを計画書に書かない'],
  errorChecks: [],
  practice: ['計画書は「決まっていないこと（TBD）」を明示し、期限と担当を付けて潰していきます。'],
  quiz: [
    { q: '移行順序を決める根拠になるのは？', options: ['テーブル名のアルファベット順', '外部キーなどの依存関係'], answer: 1, explain: '親を先に、子を後に。' },
  ],
},
// ------------------------------------------------------------------
{
  id: 'ch23', level: 4, chapter: 23, title: 'ダウンタイムと切り替え', difficulty: 4, minutes: 70, prereq: ['ch22', 'ch19'], dataset: 'migration',
  summary: 'ダウンタイム、停止可能時間、事前移行、差分移行、同期、最終同期、切り替え・切り戻し', setup: DELTA_SETUP,
  goal: '事前移行＋差分移行の仕組みを理解し、更新日時を使った差分抽出・反映SQLを書ける。切り替え・切り戻しの手順を説明できる。',
  usage: '「月曜朝までに新システムで業務開始」という制約の中で、停止時間を最小にするための設計です。',
  terms: [['ダウンタイム', 'システムを止めて利用できない時間'], ['事前移行', '停止前に、変更されにくい大部分のデータを移行しておく'], ['差分移行', '事前移行の後に変更・追加されたデータだけを移行'], ['最終同期', '停止直後に最後の差分を反映すること'], ['切り替え', '利用者の接続先を新システムに変えること'], ['CDC', 'Change Data Capture。変更を検知して連携する仕組み（製品により実現方法が異なる）']],
  syntax: "-- 前回同期以降に変更された行\nSELECT * FROM 移行元 WHERE 更新日時 > (SELECT last_sync_at FROM sync_control);\n-- 反映（あれば更新、なければ登録）\nINSERT ... ON CONFLICT (キー) DO UPDATE SET ...;",
  examples: [
    { title: '差分移行の準備状態（このレッスンの練習DB）', sql: "-- このレッスンは「2024-01-01 に事前移行済み」の状態から始まります\nSELECT * FROM sync_control;\nSELECT ord_no, ord_sts, upd_ts FROM legacy_orders ORDER BY upd_ts DESC LIMIT 3;" },
  ],
  explanation: `**差分を見つける方法（DBや構成によって使える方法が違います）**
1. 更新日時列（upd_ts）で抽出 … 旧システムに正確な更新日時がある場合。削除は検出できないので別の工夫が必要
2. 全件比較（ハッシュ比較） … 確実だが時間がかかる
3. DBの機能（PostgreSQLの論理レプリケーション、Oracle GoldenGate、SQL Server CDC など） … 製品・ライセンス・権限に依存
4. アプリ側で変更ログを残す

**単一の方法がすべての環境に使えるわけではありません**。移行元・移行先のDB製品、ネットワーク、権限、データ量、停止可能時間によって選びます。

**切り替え当日の流れ（例）**
1. 旧システム停止（更新を止める） → 2. 最終差分移行 → 3. 検証（件数・内容・業務担当者の確認）→ 4. 判定（Go / 切り戻し）→ 5. 切り替え → 6. 稼働後監視

**切り戻し**: 判定でNGなら、新システムを使わず旧システムを再開します。旧システムを停止後に一切変更していなければ、旧システムを再開するだけで戻れます。新システムで業務を始めた後の切り戻しは、新システムで発生したデータを旧に戻す必要があり難易度が跳ね上がります。`,
  exercises: [
    { id: 'e1', type: 'investigate', title: '差分の抽出', prompt: "前回同期日時（sync_control の sync_name='orders' の last_sync_at）より後に更新された旧注文の ord_no を表示してください。", setup: DELTA_SETUP,
      answer: "SELECT ord_no FROM legacy_orders WHERE upd_ts > (SELECT last_sync_at FROM sync_control WHERE sync_name = 'orders');",
      hints: ['WHERE upd_ts > (SELECT last_sync_at ...)'], explain: 'O0012（ステータス変更）と O0019（新規）の2件が差分です。' },
    { id: 'e2', type: 'write', title: '差分の反映（UPSERT）', prompt: "差分（e1の2件）を orders に反映してください。新規は登録、既存は status・order_date・total_amount を更新します（移行ルールは第17章と同じ。ON CONFLICT (legacy_ord_no) を使用）。最後に sync_control の last_sync_at を '2024-01-07 00:00:00' に更新してください。", setup: DELTA_SETUP, compare: 'none', requireSafe: true,
      answer: DELTA_UPSERT + "\nUPDATE sync_control SET last_sync_at = '2024-01-07 00:00:00' WHERE sync_name = 'orders';",
      hints: ['第17章の注文移行SQLに「差分条件」と「ON CONFLICT ... DO UPDATE」を足します。', '同期日時の更新を忘れると、次回も同じ差分を処理してしまいます（冪等なら害はありませんが無駄です）。'],
      explain: 'O0012 が COMPLETED に更新、O0019 が新規登録されます。差分移行も冪等に作ることで、失敗時に再実行できます。' },
    { id: 'e3', type: 'choice', title: '差分移行の弱点', prompt: '更新日時（upd_ts）による差分抽出で「検出できない」変更は？', options: ['新規登録', '更新', '物理削除（行そのものが消える）', 'どれも検出できる'], answerIndex: 2,
      hints: ['消えた行には更新日時もありません。'], explain: '削除は「移行元に存在しない移行先の行」を突き合わせる、削除ログを残す、論理削除フラグを使う、などの別手段が必要です。' },
    { id: 'e4', type: 'choice', title: '切り戻し条件', prompt: '切り替え前の検証で、注文金額の合計が移行元と1件分ずれていた。判定基準に「金額の不一致は1件でもNG」とある。どうする？',
      options: ['小さなずれなのでGO', '基準どおりNGとし、原因を短時間で特定・修正・再検証できるか判断。期限内に解消できなければ切り戻し', '判定を先延ばしにして切り替える', '旧システムのデータを修正して合わせる'], answerIndex: 1,
      hints: ['事前に決めた基準に従う。'], explain: '当日の判断は事前に合意した基準で行います。期限（例: 午前4時）を過ぎたら自動的に切り戻す、と決めておく現場もあります。' },
  ],
  mistakes: ['差分抽出の境界（> か >=）で取りこぼし・二重処理', '削除の差分を考慮しない', '切り戻しの判断基準・期限を決めずに当日を迎える'],
  errorChecks: ['ON CONFLICT にはキー列の UNIQUE/主キー制約が必要（there is no unique or exclusion constraint matching the ON CONFLICT specification）'],
  practice: ['同期日時は「抽出を開始した時刻」で記録するのが安全（抽出中の更新を次回拾うため）。', '切り替え手順書には、各手順の担当・開始予定時刻・所要時間・確認方法・NG時の対応を書きます。'],
  quiz: [
    { q: '旧システムを停止した後、新システムで業務を開始する前の切り戻しは？', options: ['旧システムを再開すればよい（比較的容易）', '常に不可能'], answer: 0, explain: '新システムで業務データが発生する前なら容易です。' },
  ],
},
// ------------------------------------------------------------------
{
  id: 'ch24', level: 4, chapter: 24, title: 'SQLレビューとテスト', difficulty: 4, minutes: 70, prereq: ['ch18'], dataset: 'migration',
  summary: 'SQLレビュー、テストデータ、正常系・異常系・境界値・NULL・重複・大量データのテスト、結果記録、不具合管理',
  goal: '移行SQLをレビュー観点に沿って点検し、テストケース（正常・異常・境界・NULL・重複）を設計して結果を記録できる。',
  usage: '移行SQLの不具合は本番で見つかると致命的です。レビューとテストで事前に潰します。',
  terms: [['正常系テスト', '想定どおりの入力で正しく動くか'], ['異常系テスト', '不正な入力（不正日付・変換不能値）で正しく除外・記録されるか'], ['境界値テスト', '条件の境目（0、最大長、日付の月末、BETWEENの両端）'], ['テストケース', '入力・期待結果・実際の結果・判定を表にしたもの']],
  syntax: '-- テストデータを追加して移行SQLを流し、期待結果と比較\nINSERT INTO legacy_customers VALUES (...境界値...);',
  examples: [
    { title: 'テスト用データを追加して変換結果を確認（境界値: 2月29日・ポイント0）', sql: "INSERT INTO legacy_customers VALUES\n ('T0001','境界 うるう','leap@example.com','09000000000','13','1','20240229','0','0'),\n ('T0002','境界 平年','nonleap@example.com','09000000001','13','1','20230229','0','0');\nSELECT cust_no, reg_ymd, pg_input_is_valid(reg_ymd, 'date') AS valid FROM legacy_customers WHERE cust_no LIKE 'T%';" },
  ],
  explanation: `**SQLレビューの観点**
1. 対象条件（WHERE）は仕様どおりか（削除フラグ・退会・重複・不正値）
2. JOIN で行が増えない／減らないか（1対多、INNER と LEFT）
3. 変換式は仕様どおりか（コード・端数処理・NULL・空文字）
4. 再実行しても安全か（冪等）
5. 親子の順序・シーケンスの調整
6. 性能（大量データで現実的な時間か）
7. 危険な操作（WHEREなしの更新・削除、本番DBへの接続先）

**テストケースの例**
| No | 観点 | 入力 | 期待結果 |
|---|---|---|---|
| 1 | 正常系 | 有効な顧客 | 移行される |
| 2 | 異常系 | reg_ymd='20210631' | 移行されない（対象外） |
| 3 | 境界値 | reg_ymd='20240229' | 移行される（うるう年） |
| 4 | NULL | mail_addr=NULL | email=NULLで移行 |
| 5 | 重複 | 同じメール2件 | 古い方のみ移行 |

成果物テンプレート「移行テスト仕様書」「SQLレビュー記録」に記録できます。`,
  exercises: [
    { id: 'e1', type: 'fix', title: 'レビュー：移行SQLの不具合修正', prompt: "後輩が書いた顧客移行SQL（の SELECT 部分）をレビューします。仕様（対象: del_flg='0' かつ sts_kbn<>'9'、ステータスは code_master で変換）に対して2つの不具合があります。修正して、正しい cust_no と status の一覧（cust_no 順）を出してください。",
      starter: "SELECT l.cust_no, m.new_code AS status\nFROM legacy_customers l\nLEFT JOIN code_master m ON m.old_code = l.sts_kbn\nWHERE l.sts_kbn <> '9'\nORDER BY l.cust_no;",
      answer: "SELECT l.cust_no, m.new_code AS status FROM legacy_customers l LEFT JOIN code_master m ON m.code_type = 'CUST_STATUS' AND m.old_code = l.sts_kbn WHERE l.del_flg = '0' AND l.sts_kbn <> '9' ORDER BY l.cust_no;", ordered: true,
      hints: ["code_master には '01' や '1' など、いろいろなコード種別が入っています。code_type を指定しないとどうなる？", '削除フラグの条件は？'],
      explain: "① code_type の指定漏れ（他種別の '1' などと一致して行が増える・誤変換の危険）、② del_flg の条件漏れ。レビューでは「JOIN条件にキー全体を指定しているか」を必ず確認します。" },
    { id: 'e2', type: 'investigate', title: 'NULLのテスト', prompt: "移行後の検証です。「移行元でメールが NULL・空文字・空白のみ」の顧客数 src_null と、「移行先で email が NULL」の顧客数 dst_null を1行で表示してください（移行元は移行された顧客だけを数える）。", setup: MIG_CUSTOMERS,
      answer: "SELECT (SELECT COUNT(*) FROM legacy_customers l WHERE NULLIF(trim(l.mail_addr), '') IS NULL AND EXISTS (SELECT 1 FROM customers c WHERE c.legacy_cust_no = l.cust_no)) AS src_null, (SELECT COUNT(*) FROM customers WHERE email IS NULL) AS dst_null;",
      hints: ["NULLIF(trim(mail_addr), '') IS NULL で「NULL・空文字・空白のみ」をまとめて判定"], explain: '1件ずつで一致（C0004）。NULLの扱いが仕様どおりに変換されたことのテストになります。' },
    { id: 'e3', type: 'choice', title: 'テストの分類', prompt: "「ポイント '1,500'（カンマ付き）は 1500 として移行される」ことを確認するテストは？", options: ['正常系', '異常系（補正される入力のテスト）', '性能テスト', '負荷テスト'], answerIndex: 1,
      hints: ['想定外の形式の入力です。'], explain: '想定外の入力が仕様どおりに補正・除外されるかを確認するのは異常系テストです。' },
    { id: 'e4', type: 'choice', title: '不具合管理', prompt: 'リハーサルで移行SQLの不具合を見つけた。適切な対応は？', options: ['口頭で伝えてその場で直す', '不具合管理表に「現象・原因・影響範囲・修正内容・再テスト結果」を記録し、修正SQLもレビューを通す', '本番で直す', '黙って直す'], answerIndex: 1,
      hints: ['同じ問題が別のテーブルでも起きていないか、も確認できるように。'], explain: '記録が残っていれば、類似不具合の横展開や、本番判定の根拠になります。' },
  ],
  mistakes: ['正常系しかテストしない', 'テスト結果を記録しない', 'レビューで「動くか」だけを見て「仕様どおりか」を見ない'],
  errorChecks: [],
  practice: ['テストデータは「どの仕様を確かめるためのデータか」を1行ずつ説明できるように作ります。'],
  quiz: [
    { q: "日付 '20240229' は？", options: ['うるう年なので正しい日付', '存在しない日付'], answer: 0, explain: '2024年はうるう年。2023-02-29 は存在しません。境界値テストの定番です。' },
  ],
},
// ------------------------------------------------------------------
{
  id: 'ch25', level: 4, chapter: 25, title: '移行成果物の作成', difficulty: 3, minutes: 60, prereq: ['ch22'], dataset: 'migration',
  summary: '移行対象一覧、テーブル定義書、マッピング表、移行SQL一覧、手順書、テスト仕様書、検証結果、障害対応、切り戻し、完了報告',
  goal: '移行作業の成果物を、アプリのテンプレートに入力してMarkdown / CSVで出力できる。',
  usage: '成果物は「誰が見ても同じ作業を再現でき、結果を確認できる」ための記録です。監査や引き継ぎにも使われます。',
  terms: [['移行手順書', '本番当日に実行する手順。SQL・期待件数・確認方法・NG時の対応を順に書く'], ['検証結果報告書', '実施した検証SQLと結果、判定'], ['移行完了報告書', '移行の結果（件数・対象外・課題）を関係者に報告する文書']],
  syntax: '-- 成果物には「実行したSQL」と「その結果」をセットで残す\n-- 例: 件数の記録\nSELECT COUNT(*) FROM customers;  -- 16件（2024-xx-xx 23:10 実施者: ○○）',
  examples: [
    { title: '移行対象一覧の元データを作る', sql: "SELECT table_name,\n       CASE WHEN table_name LIKE 'legacy\\_%' THEN '移行元' ELSE '移行先' END AS kind\nFROM information_schema.tables\nWHERE table_schema = 'public'\nORDER BY kind, table_name;" },
  ],
  explanation: `左メニューの **「成果物」** に、以下の12種類のテンプレートがあります。入力内容はブラウザに保存され、Markdown（表はCSVも）でダウンロードできます。

- DB移行計画書 / 移行対象一覧 / テーブル定義比較表 / データマッピング表
- 移行SQL一覧 / SQLレビュー記録 / 移行テスト仕様書 / 移行検証結果
- 障害対応記録 / 切り戻し計画書 / 移行作業手順書 / 移行完了報告書

**良い成果物の条件**
- 第三者が読んで同じ作業ができる（前提・手順・期待値が書いてある）
- 数字に根拠がある（件数の横に、それを出したSQLがある）
- 対象外・未解決の課題が隠れていない`,
  exercises: [
    { id: 'e1', type: 'deliverable', title: '移行対象一覧を作成', prompt: '「成果物」→「移行対象一覧」を開き、少なくとも **3テーブル分の行** を入力して保存してください（例: legacy_customers → customers、件数、対象条件）。入力後、このページに戻って「判定」を押してください。', template: 'target-list', minRows: 3,
      hints: ['第14章の調査SQLで件数を出して転記しましょう。'], explain: '移行対象一覧は、移行の範囲を関係者で合意するための基本資料です。' },
    { id: 'e2', type: 'deliverable', title: 'データマッピング表を作成', prompt: '「成果物」→「データマッピング表」で、customers の列について少なくとも **5行** のマッピング（移行先列・移行元列・変換ルール・例）を入力して保存してください。', template: 'mapping', minRows: 5,
      hints: ['第16章の表が参考になります。'], explain: 'マッピング表は移行SQLの設計図です。CSVでエクスポートしてExcelで共有できます。' },
    { id: 'e3', type: 'choice', title: '手順書に必要な情報', prompt: '移行作業手順書の1手順に「必ず」書くべき情報の組み合わせは？', options: ['SQLだけ', '実行するSQL・期待される結果（件数等）・確認方法・NG時の対応・担当者', '担当者の名前だけ', '作業の感想'], answerIndex: 1,
      hints: ['深夜に別の人が読んでも実行できるように。'], explain: '期待値と確認方法がないと、作業が成功したかを判断できません。' },
    { id: 'e4', type: 'choice', title: '完了報告', prompt: '移行完了報告書に「対象外として移行しなかった2件」をどう書く？', options: ['書かない', '件数・理由（不正日付、重複統合）・該当キー・今後の対応（業務側で手入力 等）を明記する', '「一部移行できませんでした」とだけ書く', '移行したことにする'], answerIndex: 1,
      hints: ['後から問い合わせが来たときに答えられるように。'], explain: '対象外の明細と理由は、移行の品質を説明する大事な情報です。' },
  ],
  mistakes: ['結果の数字だけでSQLを残さない', 'テンプレートの項目を埋めることが目的化する'],
  errorChecks: [],
  practice: ['成果物はバージョン管理（日付・版数）し、レビューと承認の記録を残します。'],
  quiz: [
    { q: '検証結果報告書に必ず残すべきものは？', options: ['検証SQLと結果、実施日時と実施者', '感想'], answer: 0, explain: '再現性と証跡のためです。' },
  ],
},
];
