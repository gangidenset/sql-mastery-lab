// LEVEL 5：総合演習（課題1〜5）と総合試験
import { MIG_CUSTOMERS, MIG_ORDERS_FULL, MIG_ITEMS, FULL_MIGRATION } from './migration-sql.js';
const R = String.raw;

const ADDR_UPDATE = `WITH r AS (
  SELECT a.*, ROW_NUMBER() OVER (PARTITION BY a.cust_no ORDER BY a.addr_type) AS rn
  FROM legacy_customer_addresses a
)
UPDATE customers c
SET postal_code = substr(r.zip_cd, 1, 3) || '-' || substr(r.zip_cd, 4),
    address     = r.addr1 || COALESCE(' ' || r.addr2, '')
FROM r
WHERE r.rn = 1 AND r.cust_no = c.legacy_cust_no;`;

// 説明文の評価で使うキーワード（含まれているかを自己点検の目安として表示）
const TXT = {
  survey: { label: '移行元DBの調査結果', min: 120, keywords: ['件数', 'NULL', '重複', '不正'], placeholder: '調査したテーブル・件数・見つかった問題（NULL、重複、不正な値）と具体例を書いてください。' },
  design: { label: '移行先DBの設計（理由を含む）', min: 100, keywords: ['主キー', '型'], placeholder: '移行先の構造、主キー・型・NULL許可の決定とその理由。' },
  mapping: { label: 'データマッピング表（要約）', min: 100, keywords: ['変換'], placeholder: '移行先列 ← 移行元列：変換ルール、を列ごとに。詳細は成果物「データマッピング表」でも作成できます。' },
  procedure: { label: '移行手順書', min: 150, keywords: ['件数', '確認', 'COMMIT'], placeholder: '1. 事前確認 2. 移行SQL実行 3. 件数確認 … のように、手順・期待値・確認方法・NG時の対応を順に。' },
  failure: { label: '障害時の対応計画', min: 100, keywords: ['ROLLBACK', '再実行'], placeholder: '途中で失敗したときの判断・復旧手順・再実行方法。' },
  rollback: { label: '切り戻し計画', min: 80, keywords: ['判断', '旧システム'], placeholder: '切り戻しの判断基準（時刻・不整合条件）、判断者、手順。' },
  report: { label: '移行完了報告書', min: 120, keywords: ['件数', '対象外', '検証'], placeholder: '移行件数、対象外件数と理由、検証結果、残課題。' },
  test: { label: 'テスト結果', min: 80, keywords: ['正常', '異常'], placeholder: 'テストケースと結果（正常系・異常系・境界値）。' },
  reason: { label: '設計・方法の選択理由', min: 120, keywords: ['理由'], placeholder: 'なぜその方法（SQL・順序・検証）を選んだのか。' },
  estimate: { label: '処理時間の見積もり', min: 80, keywords: ['秒', '件'], placeholder: '計測結果（件数・秒）と本番件数での見積もり、安全係数。' },
};

export const CAPSTONES = [
{
  id: 'cap1', no: 1, title: '古い顧客管理DBから新しい顧客管理DBへ移行する', dataset: 'migration',
  story: '旧顧客（legacy_customers, legacy_customer_addresses）を新しい customers へ移行します。移行仕様（第16章の表）のすべてのルールを適用し、代表住所も設定します。移行できない行は migration_rejects に理由付きで記録し、件数をすべて説明できる状態にしてください。',
  steps: [
    { id: 's1', type: 'investigate', title: '調査：対象・対象外の判定', prompt: "旧顧客を区分 category（'移行'、'対象外_削除済'、'対象外_退会'、'対象外_不正日付'、'対象外_重複'）に分類し、件数 cnt を表示してください（優先順: 削除済→退会→不正日付→重複）。",
      answer: "WITH r AS (SELECT l.*, ROW_NUMBER() OVER (PARTITION BY lower(trim(mail_addr)) ORDER BY reg_ymd, cust_no) AS rn FROM legacy_customers l)\nSELECT CASE WHEN del_flg = '1' THEN '対象外_削除済' WHEN sts_kbn = '9' THEN '対象外_退会' WHEN NOT pg_input_is_valid(reg_ymd, 'date') THEN '対象外_不正日付' WHEN rn > 1 AND mail_addr IS NOT NULL THEN '対象外_重複' ELSE '移行' END AS category, COUNT(*) AS cnt\nFROM r GROUP BY 1;",
      hints: ['シナリオEの考え方に「移行」の区分を加えます。'], explain: '移行16・各対象外1件ずつ。' },
    { id: 's2', type: 'write', title: '移行SQL（顧客＋住所＋対象外記録）', prompt: "トランザクションの中で、①顧客の移行（全ルール、setvalまで）、②代表住所の更新、③対象外の記録（source_table='legacy_customers'、reason は s1 の区分から '対象外_' を除いた文字列: 削除済/退会/不正日付/重複）を行い COMMIT してください。", compare: 'none', allowDiff: ['migration_rejects'],
      check: "SELECT source_key, reason FROM migration_rejects WHERE source_table = 'legacy_customers' ORDER BY source_key", checkLabel: '対象外の記録（reject_id 以外）',
      answer: 'BEGIN;\n' + MIG_CUSTOMERS + '\n' + ADDR_UPDATE + `\nWITH r AS (SELECT l.*, ROW_NUMBER() OVER (PARTITION BY lower(trim(mail_addr)) ORDER BY reg_ymd, cust_no) AS rn FROM legacy_customers l)
INSERT INTO migration_rejects (source_table, source_key, reason)
SELECT 'legacy_customers', cust_no, CASE WHEN del_flg = '1' THEN '削除済' WHEN sts_kbn = '9' THEN '退会' WHEN NOT pg_input_is_valid(reg_ymd, 'date') THEN '不正日付' ELSE '重複' END
FROM r WHERE del_flg = '1' OR sts_kbn = '9' OR NOT pg_input_is_valid(reg_ymd, 'date') OR (rn > 1 AND mail_addr IS NOT NULL);
COMMIT;`,
      mustInclude: [['\\bbegin\\b', 'BEGIN〜COMMIT で囲んでください'], ['\\bcommit\\b', 'COMMIT で確定してください']], requireSafe: true,
      hints: ['第17章 e2、シナリオD s1、シナリオE s2 を組み合わせます。'], explain: '本番では、この1本のスクリプトを手順書に沿って実行します。' },
    { id: 's3', type: 'investigate', title: '検証SQL：件数・内容', prompt: "移行後の検証を1行で: total（旧顧客数）、migrated（customers 件数）、rejected（対象外記録数）、unexplained（total−migrated−rejected）、bad_email（customers の email に大文字・前後空白・空文字が残っている件数）。",
      setup: MIG_CUSTOMERS + '\n' + ADDR_UPDATE + "\nINSERT INTO migration_rejects (source_table, source_key, reason) VALUES ('legacy_customers','C0012','退会'),('legacy_customers','C0014','不正日付'),('legacy_customers','C0016','重複'),('legacy_customers','C0017','削除済');",
      answer: "SELECT (SELECT COUNT(*) FROM legacy_customers) AS total, (SELECT COUNT(*) FROM customers) AS migrated, (SELECT COUNT(*) FROM migration_rejects WHERE source_table = 'legacy_customers') AS rejected, (SELECT COUNT(*) FROM legacy_customers) - (SELECT COUNT(*) FROM customers) - (SELECT COUNT(*) FROM migration_rejects WHERE source_table = 'legacy_customers') AS unexplained, (SELECT COUNT(*) FROM customers WHERE email = '' OR email <> lower(trim(email))) AS bad_email;",
      hints: ['シナリオE s3 とシナリオF s3 の組み合わせです。'], explain: 'unexplained=0、bad_email=0 が合格の目安です。' },
  ],
  texts: ['survey', 'design', 'mapping', 'procedure', 'failure', 'rollback', 'report'],
},
{
  id: 'cap2', no: 2, title: '複数テーブルに分散しているデータを統合する', dataset: 'migration',
  story: '営業部門から「顧客ごとに、自宅住所・勤務先住所・注文回数・最終注文日・購入金額合計が1行で分かる表がほしい」と依頼されました。顧客・注文の移行は完了しています。旧住所（複数行）と新注文を統合して customer_profiles テーブルを作ります。',
  setupAll: FULL_MIGRATION,
  steps: [
    { id: 's1', type: 'write', title: '統合先テーブルの作成', prompt: "customer_profiles を作成してください。\n- customer_id: integer 主キー、customers への外部キー\n- name: varchar(100) NOT NULL\n- home_address: varchar(200)\n- work_address: varchar(200)\n- order_count: integer NOT NULL DEFAULT 0\n- last_order_date: date\n- total_amount: numeric(12,0) NOT NULL DEFAULT 0", compare: 'none', setup: FULL_MIGRATION,
      check: "SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name = 'customer_profiles' ORDER BY ordinal_position", checkLabel: 'テーブル定義の確認',
      answer: 'CREATE TABLE customer_profiles (\n  customer_id integer PRIMARY KEY REFERENCES customers(customer_id),\n  name varchar(100) NOT NULL,\n  home_address varchar(200),\n  work_address varchar(200),\n  order_count integer NOT NULL DEFAULT 0,\n  last_order_date date,\n  total_amount numeric(12,0) NOT NULL DEFAULT 0\n);',
      hints: ['第7章・第15章の CREATE TABLE。'], explain: '集計結果を持つテーブルは「いつ時点の集計か」を明記する運用ルールも必要です。' },
    { id: 's2', type: 'write', title: '統合データの登録', prompt: "全顧客を customer_profiles に登録してください。\n- home_address / work_address: 旧住所の addr_type '1' / '2'（addr1 と addr2 を半角空白で連結）。なければNULL\n- order_count / last_order_date / total_amount: キャンセル（CANCELLED）以外の注文で集計。注文がなければ 0 / NULL / 0", compare: 'none',
      setup: FULL_MIGRATION + '\nCREATE TABLE customer_profiles (customer_id integer PRIMARY KEY REFERENCES customers(customer_id), name varchar(100) NOT NULL, home_address varchar(200), work_address varchar(200), order_count integer NOT NULL DEFAULT 0, last_order_date date, total_amount numeric(12,0) NOT NULL DEFAULT 0);',
      answer: "INSERT INTO customer_profiles (customer_id, name, home_address, work_address, order_count, last_order_date, total_amount)\nSELECT c.customer_id, c.name,\n  (SELECT a.addr1 || COALESCE(' ' || a.addr2, '') FROM legacy_customer_addresses a WHERE a.cust_no = c.legacy_cust_no AND a.addr_type = '1'),\n  (SELECT a.addr1 || COALESCE(' ' || a.addr2, '') FROM legacy_customer_addresses a WHERE a.cust_no = c.legacy_cust_no AND a.addr_type = '2'),\n  COALESCE(o.cnt, 0), o.last_date, COALESCE(o.total, 0)\nFROM customers c\nLEFT JOIN (SELECT customer_id, COUNT(*) AS cnt, MAX(order_date) AS last_date, SUM(total_amount) AS total\n           FROM orders WHERE status <> 'CANCELLED' GROUP BY customer_id) o ON o.customer_id = c.customer_id;",
      hints: ['注文は先に顧客単位で集計してから LEFT JOIN（集計前に JOIN すると住所の行数分だけ重複します）。', '住所は addr_type ごとのスカラーサブクエリ、または CASE と MAX で横持ちにします。'], explain: '「先に集計してから結合」が、複数テーブル統合で重複を防ぐコツです。' },
    { id: 's3', type: 'investigate', title: '統合結果の検証', prompt: "統合の検証を1行で: profiles（customer_profiles 件数）、customers（customers 件数）、amount_diff（customer_profiles.total_amount の合計 − キャンセル以外の orders.total_amount の合計）、work_cnt（work_address が入っている件数）。",
      setup: FULL_MIGRATION + "\nCREATE TABLE customer_profiles (customer_id integer PRIMARY KEY REFERENCES customers(customer_id), name varchar(100) NOT NULL, home_address varchar(200), work_address varchar(200), order_count integer NOT NULL DEFAULT 0, last_order_date date, total_amount numeric(12,0) NOT NULL DEFAULT 0);\nINSERT INTO customer_profiles SELECT c.customer_id, c.name, (SELECT a.addr1 || COALESCE(' ' || a.addr2, '') FROM legacy_customer_addresses a WHERE a.cust_no = c.legacy_cust_no AND a.addr_type = '1'), (SELECT a.addr1 || COALESCE(' ' || a.addr2, '') FROM legacy_customer_addresses a WHERE a.cust_no = c.legacy_cust_no AND a.addr_type = '2'), COALESCE(o.cnt, 0), o.last_date, COALESCE(o.total, 0) FROM customers c LEFT JOIN (SELECT customer_id, COUNT(*) AS cnt, MAX(order_date) AS last_date, SUM(total_amount) AS total FROM orders WHERE status <> 'CANCELLED' GROUP BY customer_id) o ON o.customer_id = c.customer_id;",
      answer: "SELECT (SELECT COUNT(*) FROM customer_profiles) AS profiles, (SELECT COUNT(*) FROM customers) AS customers, (SELECT SUM(total_amount) FROM customer_profiles) - (SELECT SUM(total_amount) FROM orders WHERE status <> 'CANCELLED') AS amount_diff, (SELECT COUNT(*) FROM customer_profiles WHERE work_address IS NOT NULL) AS work_cnt;",
      hints: ['amount_diff が 0 なら、重複計上も漏れもありません。'], explain: '件数16=16、差額0、勤務先2件（C0001, C0008）。' },
  ],
  texts: ['survey', 'design', 'mapping', 'test', 'report'],
},
{
  id: 'cap3', no: 3, title: '文字列の金額データを数値型に変換する', dataset: 'migration',
  story: "旧注文の金額（amt_txt, 税抜・文字列）を新システムの total_amount（numeric, 税込）に変換して移行します。'2,700'、'¥5800' は補正して採用、'N/A'・空文字は対象外として記録します。端数は1注文ごとに四捨五入します。顧客の移行は完了しています。",
  steps: [
    { id: 's1', type: 'investigate', title: '値のパターン分類', prompt: "旧注文を金額のパターン pattern（'数値'＝数字のみ、'補正可'＝カンマ・¥除去で数字のみ、'変換不可'＝それ以外）に分類し、件数 cnt を表示してください。",
      answer: "SELECT CASE WHEN amt_txt ~ '^[0-9]+$' THEN '数値' WHEN regexp_replace(amt_txt, '[,¥]', '', 'g') ~ '^[0-9]+$' THEN '補正可' ELSE '変換不可' END AS pattern, COUNT(*) AS cnt FROM legacy_orders GROUP BY 1;",
      hints: ['CASE の順番に注意（数字のみ → 補正可 → それ以外）。'], explain: '数値14・補正可2・変換不可2。' },
    { id: 's2', type: 'write', title: '変換・移行・対象外記録', prompt: "トランザクションの中で、①注文の移行（全ルール・付け替え込み・税込変換）、②金額が変換不可の注文を migration_rejects に記録（source_table='legacy_orders'、reason='金額変換不可'）して COMMIT してください。", compare: 'none', allowDiff: ['migration_rejects'], setup: MIG_CUSTOMERS,
      check: "SELECT source_key, reason FROM migration_rejects ORDER BY source_key", checkLabel: '対象外の記録（reject_id 以外）',
      answer: 'BEGIN;\n' + MIG_ORDERS_FULL + "\nINSERT INTO migration_rejects (source_table, source_key, reason)\nSELECT 'legacy_orders', ord_no, '金額変換不可' FROM legacy_orders WHERE regexp_replace(amt_txt, '[,¥]', '', 'g') !~ '^[0-9]+$';\nCOMMIT;",
      mustInclude: [['\\bbegin\\b', 'BEGIN〜COMMIT で囲んでください']], requireSafe: true,
      hints: ['第17章 e6 の注文移行SQL＋シナリオB s2。'], explain: '注文11件、対象外記録2件。' },
    { id: 's3', type: 'investigate', title: '金額の検証', prompt: "1行で: src_total（移行された注文の旧金額を補正・×1.1・四捨五入した合計）、dst_total（orders.total_amount の合計）、mismatch（1件ずつ比較して不一致の件数）。", setup: FULL_MIGRATION,
      answer: "SELECT (SELECT SUM(round(regexp_replace(l.amt_txt, '[,¥]', '', 'g')::numeric * 1.1)) FROM legacy_orders l JOIN orders o ON o.legacy_ord_no = l.ord_no) AS src_total, (SELECT SUM(total_amount) FROM orders) AS dst_total, (SELECT COUNT(*) FROM legacy_orders l JOIN orders o ON o.legacy_ord_no = l.ord_no WHERE o.total_amount IS DISTINCT FROM round(regexp_replace(l.amt_txt, '[,¥]', '', 'g')::numeric * 1.1)) AS mismatch;",
      hints: ['合計の一致だけでなく、1件ずつの不一致件数も見ます（入れ替わりは合計では分からない）。'], explain: '合計一致・不一致0件。' },
  ],
  texts: ['survey', 'mapping', 'test', 'failure', 'report'],
},
{
  id: 'cap4', no: 4, title: '重複・欠損データを分析し、移行対象を決定する', dataset: 'migration',
  story: '業務担当者と合意した判定ルールを、すべての旧顧客について「移行する／しない」の判定表（customer_migration_decisions）にまとめます。判定表は業務担当者のレビューにかけ、承認後の移行SQLの対象条件になります。',
  steps: [
    { id: 's1', type: 'investigate', title: '重複と欠損の分析', prompt: "移行対象（del_flg='0' かつ sts_kbn<>'9'）の旧顧客について1行で: dup_groups（メール（小文字・前後空白除去）が2件以上あるグループ数）、no_mail（メールがNULL・空・空白のみの件数）、no_tel（電話がNULL・空の件数）、bad_date（登録日が日付として不正な件数）。",
      answer: "SELECT (SELECT COUNT(*) FROM (SELECT lower(trim(mail_addr)) FROM legacy_customers WHERE del_flg = '0' AND sts_kbn <> '9' AND mail_addr IS NOT NULL GROUP BY 1 HAVING COUNT(*) > 1) d) AS dup_groups, COUNT(*) FILTER (WHERE NULLIF(trim(mail_addr), '') IS NULL) AS no_mail, COUNT(*) FILTER (WHERE NULLIF(tel_no, '') IS NULL) AS no_tel, COUNT(*) FILTER (WHERE NOT pg_input_is_valid(reg_ymd, 'date')) AS bad_date FROM legacy_customers WHERE del_flg = '0' AND sts_kbn <> '9';",
      hints: ['FILTER を使うと1回の走査で複数の件数を出せます。'], explain: '重複1グループ、メールなし1件、電話なし5件、不正日付1件。' },
    { id: 's2', type: 'write', title: '判定表の作成と登録', prompt: "customer_migration_decisions（cust_no varchar(10) 主キー、decision varchar(10) NOT NULL で 'MIGRATE' か 'EXCLUDE'（CHECK制約）、reason varchar(50)）を作成し、全旧顧客を登録してください。reason は EXCLUDE のとき '削除済' / '退会' / '不正日付' / '重複'（この優先順）、MIGRATE のとき NULL。", compare: 'none',
      answer: "CREATE TABLE customer_migration_decisions (\n  cust_no varchar(10) PRIMARY KEY,\n  decision varchar(10) NOT NULL CHECK (decision IN ('MIGRATE', 'EXCLUDE')),\n  reason varchar(50)\n);\nWITH r AS (SELECT l.*, ROW_NUMBER() OVER (PARTITION BY lower(trim(mail_addr)) ORDER BY reg_ymd, cust_no) AS rn FROM legacy_customers l),\nj AS (SELECT cust_no, CASE WHEN del_flg = '1' THEN '削除済' WHEN sts_kbn = '9' THEN '退会' WHEN NOT pg_input_is_valid(reg_ymd, 'date') THEN '不正日付' WHEN rn > 1 AND mail_addr IS NOT NULL THEN '重複' END AS reason FROM r)\nINSERT INTO customer_migration_decisions (cust_no, decision, reason)\nSELECT cust_no, CASE WHEN reason IS NULL THEN 'MIGRATE' ELSE 'EXCLUDE' END, reason FROM j;",
      hints: ['WITH 句を2段（rn を付ける → 理由を決める）にすると読みやすくなります。'], explain: '20行（MIGRATE 16、EXCLUDE 4）。' },
    { id: 's3', type: 'write', title: '判定表を使った移行', prompt: "判定表で MIGRATE の顧客だけを移行してください（変換ルールは第17章 e2 と同じ。ただし対象条件は判定表を使う）。", compare: 'none',
      setup: "CREATE TABLE customer_migration_decisions (cust_no varchar(10) PRIMARY KEY, decision varchar(10) NOT NULL CHECK (decision IN ('MIGRATE','EXCLUDE')), reason varchar(50));\nINSERT INTO customer_migration_decisions SELECT cust_no, CASE WHEN cust_no IN ('C0012','C0014','C0016','C0017') THEN 'EXCLUDE' ELSE 'MIGRATE' END, CASE cust_no WHEN 'C0012' THEN '退会' WHEN 'C0014' THEN '不正日付' WHEN 'C0016' THEN '重複' WHEN 'C0017' THEN '削除済' END FROM legacy_customers;",
      answer: R`INSERT INTO customers (customer_id, legacy_cust_no, name, email, phone, prefecture, status, points, registered_at)
SELECT substr(l.cust_no, 2)::integer, l.cust_no, l.cust_nm, NULLIF(lower(trim(l.mail_addr)), ''),
       CASE WHEN l.tel_no ~ '^[0-9]{11}$' THEN regexp_replace(l.tel_no, '^([0-9]{3})([0-9]{4})([0-9]{4})$', '\1-\2-\3') END,
       p.new_code, st.new_code,
       CASE WHEN replace(l.point_bal, ',', '') ~ '^[0-9]+$' THEN replace(l.point_bal, ',', '')::integer ELSE 0 END,
       l.reg_ymd::date
FROM legacy_customers l
JOIN customer_migration_decisions d ON d.cust_no = l.cust_no AND d.decision = 'MIGRATE'
JOIN code_master st ON st.code_type = 'CUST_STATUS' AND st.old_code = l.sts_kbn
LEFT JOIN code_master p ON p.code_type = 'PREF' AND p.old_code = l.pref_cd;
SELECT setval('customers_customer_id_seq', (SELECT max(customer_id) FROM customers));`,
      mustInclude: [['customer_migration_decisions', '判定表（customer_migration_decisions）を使ってください']],
      hints: ['判定表と JOIN して decision = \'MIGRATE\' に絞ります。'], explain: '対象の判定（業務判断）と変換（技術）を分けると、判定ルールが変わっても移行SQLを直さずに済みます。' },
  ],
  texts: ['survey', 'reason', 'test', 'report'],
},
{
  id: 'cap5', no: 5, title: '大量データの移行を計画・実行・検証する', dataset: 'bulk', bulk: true,
  story: '旧売上（legacy_sales）を sales に移行します。本番の件数は 3,000万件、停止時間は6時間の想定です。練習環境で分割移行・再実行・検証を実践し、計測結果から本番の処理時間を見積もり、障害対応と切り戻しを設計してください。',
  steps: [
    { id: 's1', type: 'investigate', title: 'バッチ計画', prompt: "10000件ごとのバッチ計画を表示してください: batch_no、from_no、to_no、target_cnt（その範囲で金額が整数の件数）。batch_no は1から。", bulkRows: 20000,
      answer: "SELECT b AS batch_no, (b - 1) * 10000 + 1 AS from_no, b * 10000 AS to_no, (SELECT COUNT(*) FROM legacy_sales WHERE sale_no BETWEEN (b - 1) * 10000 + 1 AND b * 10000 AND amt_txt ~ '^[0-9]+$') AS target_cnt FROM generate_series(1, (SELECT CEIL(MAX(sale_no) / 10000.0)::int FROM legacy_sales)) AS b;",
      hints: ['第20章の例：generate_series でバッチ番号を作ります。'], explain: 'バッチごとの件数が分かれば、進捗や再実行の範囲を管理できます。' },
    { id: 's2', type: 'write', title: '失敗バッチの再実行', prompt: "バッチ1は完了、バッチ2（10001〜20000）が途中（15000まで）で失敗した状態です。バッチ2を冪等に再実行してください（トランザクション内で）。", compare: 'none', bulkRows: 20000,
      setup: "INSERT INTO sales SELECT sale_no, cust_no, to_date(sale_ymd, 'YYYYMMDD'), amt_txt::numeric, region_cd FROM legacy_sales WHERE sale_no <= 15000 AND amt_txt ~ '^[0-9]+$';",
      answer: "BEGIN;\nINSERT INTO sales (sale_id, customer_code, sale_date, amount, region_cd)\nSELECT sale_no, cust_no, to_date(sale_ymd, 'YYYYMMDD'), amt_txt::numeric, region_cd\nFROM legacy_sales\nWHERE sale_no BETWEEN 10001 AND 20000 AND amt_txt ~ '^[0-9]+$'\nON CONFLICT (sale_id) DO NOTHING;\nCOMMIT;",
      mustInclude: [['on\\s+conflict|not\\s+exists', 'ON CONFLICT か NOT EXISTS で冪等にしてください'], ['\\bbegin\\b', 'トランザクション内で実行してください']], hints: ['第20章 e3。'], explain: 'バッチ単位のトランザクション＋冪等なSQLなら「失敗したバッチを流し直す」だけで復旧できます。' },
    { id: 's3', type: 'investigate', title: '全体検証', prompt: "移行完了後の検証を1行で: src_cnt, dst_cnt, src_sum, dst_sum, min_date, max_date（sales の sale_date の最小・最大）, missing（移行対象なのに sales にない件数）。", bulkRows: 20000,
      setup: "INSERT INTO sales SELECT sale_no, cust_no, to_date(sale_ymd, 'YYYYMMDD'), amt_txt::numeric, region_cd FROM legacy_sales WHERE amt_txt ~ '^[0-9]+$';",
      answer: "SELECT (SELECT COUNT(*) FROM legacy_sales WHERE amt_txt ~ '^[0-9]+$') AS src_cnt, (SELECT COUNT(*) FROM sales) AS dst_cnt, (SELECT SUM(amt_txt::numeric) FROM legacy_sales WHERE amt_txt ~ '^[0-9]+$') AS src_sum, (SELECT SUM(amount) FROM sales) AS dst_sum, (SELECT MIN(sale_date) FROM sales) AS min_date, (SELECT MAX(sale_date) FROM sales) AS max_date, (SELECT COUNT(*) FROM legacy_sales l WHERE amt_txt ~ '^[0-9]+$' AND NOT EXISTS (SELECT 1 FROM sales s WHERE s.sale_id = l.sale_no)) AS missing;",
      hints: ['件数・合計・範囲・漏れの4観点。'], explain: '大量データの検証は「全件の集計値」＋「キーの突き合わせ」の組み合わせが基本です。' },
  ],
  texts: ['estimate', 'procedure', 'failure', 'rollback', 'report'],
},
];

export const TEXT_SPECS = TXT;

// ------------------------------------------------------------------
// 総合試験：既存の移行演習データに「新しい異常データ」を追加した環境で実施
// ------------------------------------------------------------------
export const EXAM_SETUP = `INSERT INTO legacy_customers VALUES
 ('C0021','新井 新','','08011112222','13','1','20230105','200','0'),
 ('C0022','高橋 美咲','MISAKI.T@example.com ','08022220003','40','1','20230301','50','0'),
 ('C0023','岡田 誤','okada@example.com','09033334444','27','1','20240230','0','0'),
 ('C0024','森 正','mori@example.com',NULL,'04','2','20230710','1,000','0');
INSERT INTO legacy_orders VALUES
 ('O0020','C0022','20230315','03','8,000'),
 ('O0021','C0021','20230120','02','1.5万'),
 ('O0022','C0024','20230801','03','3000');
INSERT INTO legacy_order_details VALUES
 ('O0020','1','P002','2','2980'),
 ('O0022','1','P009','2','1280');`;

export const EXAM_TASKS = [
  { id: 'x1', axis: ['target'], weight: 8, type: 'investigate', title: '既存DBの調査：移行される顧客数', prompt: "試験用データ（旧顧客24件）に移行仕様のすべてのルール（削除済・退会・不正日付・メール重複は対象外）を適用したとき、**移行される顧客数** migrate_cnt を1つの値で表示してください。",
    answer: "WITH r AS (SELECT l.*, ROW_NUMBER() OVER (PARTITION BY lower(trim(mail_addr)) ORDER BY reg_ymd, cust_no) AS rn FROM legacy_customers l) SELECT COUNT(*) AS migrate_cnt FROM r WHERE del_flg = '0' AND sts_kbn <> '9' AND pg_input_is_valid(reg_ymd, 'date') AND (rn = 1 OR mail_addr IS NULL);" },
  { id: 'x2', axis: ['quality', 'exception'], weight: 8, type: 'investigate', title: 'データ品質の確認：対象外になる顧客', prompt: "移行対象（del_flg='0' かつ sts_kbn<>'9'）のうち、不正日付またはメール重複で **移行されない** 旧顧客の cust_no を表示してください。",
    answer: "WITH r AS (SELECT l.*, ROW_NUMBER() OVER (PARTITION BY lower(trim(mail_addr)) ORDER BY reg_ymd, cust_no) AS rn FROM legacy_customers l) SELECT cust_no FROM r WHERE del_flg = '0' AND sts_kbn <> '9' AND (NOT pg_input_is_valid(reg_ymd, 'date') OR (rn > 1 AND mail_addr IS NOT NULL));" },
  { id: 'x3', axis: ['design', 'types'], weight: 8, type: 'write', compare: 'none', title: '移行先テーブルの設計', prompt: "旧顧客番号と新顧客IDの対応表 customer_id_map を作成してください。\n- legacy_cust_no: varchar(10) 主キー\n- customer_id: integer NOT NULL、customers(customer_id) への外部キー\n- migrated_on: date NOT NULL",
    check: "SELECT (SELECT string_agg(column_name || ':' || data_type || ':' || is_nullable, ', ' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_name = 'customer_id_map') AS cols, (SELECT string_agg(contype::text, '' ORDER BY contype) FROM pg_constraint WHERE conrelid = 'customer_id_map'::regclass AND contype IN ('p','f')) AS cons",
    answer: 'CREATE TABLE customer_id_map (\n  legacy_cust_no varchar(10) PRIMARY KEY,\n  customer_id integer NOT NULL REFERENCES customers(customer_id),\n  migrated_on date NOT NULL\n);' },
  { id: 'x4', axis: ['correct', 'target', 'types', 'exception'], weight: 14, type: 'write', compare: 'none', title: '移行SQLの作成：顧客', prompt: "試験用データの旧顧客を、移行仕様のすべてのルールで customers に移行してください（setval まで）。",
    answer: MIG_CUSTOMERS },
  { id: 'x5', axis: ['correct', 'types', 'exception'], weight: 14, type: 'write', compare: 'none', title: '移行処理の実行：注文と明細', prompt: "顧客の移行が完了しています。注文（重複顧客の付け替え・税込変換・不正値の除外を含む）と明細を移行してください。",
    setupExtra: MIG_CUSTOMERS, answer: MIG_ORDERS_FULL + '\n' + MIG_ITEMS },
  { id: 'x6', axis: ['verify', 'integrity'], weight: 12, required: true, type: 'investigate', title: 'データ検証：漏れと金額', prompt: "移行完了後の検証を1行で: missing_cust（移行対象なのに customers にない旧顧客数。del_flg='0' かつ sts_kbn<>'9' を対象とする）、missing_order（顧客が移行済みで、ステータス・日付・金額が変換可能なのに orders にない旧注文数）、amount_mismatch（移行された注文で total_amount が旧金額の補正・×1.1・四捨五入と違う件数）。",
    setupExtra: FULL_MIGRATION,
    answer: "SELECT (SELECT COUNT(*) FROM legacy_customers l WHERE del_flg = '0' AND sts_kbn <> '9' AND NOT EXISTS (SELECT 1 FROM customers c WHERE c.legacy_cust_no = l.cust_no)) AS missing_cust, (SELECT COUNT(*) FROM legacy_orders l JOIN customers c ON c.legacy_cust_no = l.cust_no JOIN code_master m ON m.code_type = 'ORDER_STATUS' AND m.old_code = l.ord_sts WHERE pg_input_is_valid(l.ord_ymd, 'date') AND regexp_replace(l.amt_txt, '[,¥]', '', 'g') ~ '^[0-9]+$' AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.legacy_ord_no = l.ord_no)) AS missing_order, (SELECT COUNT(*) FROM legacy_orders l JOIN orders o ON o.legacy_ord_no = l.ord_no WHERE o.total_amount IS DISTINCT FROM round(regexp_replace(l.amt_txt, '[,¥]', '', 'g')::numeric * 1.1)) AS amount_mismatch;" },
  { id: 'x7', axis: ['integrity', 'safety'], weight: 12, required: true, type: 'write', compare: 'none', requireSafe: true, title: '不整合の検出・修正・再検証', prompt: "移行後に、顧客 C0024 の points と注文 O0022 の total_amount が誤って書き換えられていました。移行元から正しい値を計算して修正してください（値の直接指定ではなく、legacy_customers / legacy_orders から計算すること。変更が必要な行だけを更新）。",
    setupExtra: FULL_MIGRATION + "\nUPDATE customers SET points = 1 WHERE legacy_cust_no = 'C0024';\nUPDATE orders SET total_amount = 0 WHERE legacy_ord_no = 'O0022';",
    mustInclude: [['legacy_customers', 'legacy_customers から値を計算してください'], ['legacy_orders', 'legacy_orders から値を計算してください']],
    answer: "UPDATE customers c SET points = CASE WHEN replace(l.point_bal, ',', '') ~ '^[0-9]+$' THEN replace(l.point_bal, ',', '')::integer ELSE 0 END FROM legacy_customers l WHERE l.cust_no = c.legacy_cust_no AND c.points IS DISTINCT FROM CASE WHEN replace(l.point_bal, ',', '') ~ '^[0-9]+$' THEN replace(l.point_bal, ',', '')::integer ELSE 0 END;\nUPDATE orders o SET total_amount = round(regexp_replace(l.amt_txt, '[,¥]', '', 'g')::numeric * 1.1) FROM legacy_orders l WHERE l.ord_no = o.legacy_ord_no AND o.total_amount IS DISTINCT FROM round(regexp_replace(l.amt_txt, '[,¥]', '', 'g')::numeric * 1.1);" },
  { id: 'x8', axis: ['failure', 'safety'], weight: 10, type: 'write', compare: 'none', title: 'トランザクションの設計', prompt: "顧客・注文は移行済みです。明細の移行を、①トランザクションで囲み、②移行前に SAVEPOINT を作り、③移行後に「明細の件数が期待値（この試験データでは11件）でなければ ROLLBACK TO SAVEPOINT できる」構成で書いてください（ここでは件数を SELECT で確認し、そのまま COMMIT してよい）。",
    setupExtra: MIG_CUSTOMERS + '\n' + MIG_ORDERS_FULL,
    mustInclude: [['\\bbegin\\b', 'BEGIN が必要です'], ['\\bsavepoint\\b', 'SAVEPOINT が必要です'], ['\\bcommit\\b', 'COMMIT が必要です']],
    answer: 'BEGIN;\nSAVEPOINT before_items;\n' + MIG_ITEMS + '\nSELECT COUNT(*) FROM order_items;\nCOMMIT;' },
];

export const EXAM_TEXTS = [
  { id: 't1', axis: ['reason'], weight: 6, label: '設計理由の説明（なぜその移行方法・順序・検証を選んだか）', min: 200, keywords: ['理由', '重複', '検証', '順'] },
  { id: 't2', axis: ['failure'], weight: 4, label: '障害時の対応（途中で失敗したら・不整合が見つかったら・切り戻しの判断）', min: 150, keywords: ['ROLLBACK', '再実行', '切り戻し'] },
  { id: 't4', axis: ['perf'], weight: 4, label: '性能面の考慮（本番が大量データの場合のバッチ分割・インデックス・時間見積もり）', min: 120, keywords: ['バッチ', 'インデックス', '時間'] },
  { id: 't3', axis: ['procedure'], weight: 4, label: '移行手順書（手順・期待件数・確認方法・NG時の対応）', min: 200, keywords: ['件数', '確認', 'COMMIT'] },
];

export const EXAM_AXES = {
  correct: 'SQLの正確性', integrity: 'データの整合性', target: '移行対象の選定', types: 'データ型の扱い', exception: '例外データへの対応',
  safety: 'SQLの安全性', perf: '性能面の考慮', failure: '障害時の対応', verify: '検証の十分性', reason: '設計理由の説明',
  design: '移行先の設計', quality: 'データ品質の確認', procedure: '移行手順書',
};
