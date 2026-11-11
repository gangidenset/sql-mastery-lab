// DB移行実践ラボ：シナリオ A〜J
// 各シナリオの steps は「採点付きの演習」です（grader.js で実行結果・最終状態を比較）。
import { MIG_CUSTOMERS, MIG_ORDERS_BASIC, MIG_ORDERS_FULL, MIG_ITEMS, FULL_MIGRATION } from './migration-sql.js';
const R = String.raw;

const CLEAN_AMT = "regexp_replace(amt_txt, '[,¥]', '', 'g')";

const NAIVE_CUSTOMERS = `INSERT INTO customers (customer_id, legacy_cust_no, name, email, phone, status, registered_at)
SELECT substr(cust_no, 2)::integer, cust_no, cust_nm, mail_addr, tel_no, 'ACTIVE', reg_ymd::date
FROM legacy_customers
WHERE del_flg = '0' AND sts_kbn <> '9' AND pg_input_is_valid(reg_ymd, 'date') AND cust_no <> 'C0016';`;

const ADDR_UPDATE = `WITH r AS (
  SELECT a.*, ROW_NUMBER() OVER (PARTITION BY a.cust_no ORDER BY a.addr_type) AS rn
  FROM legacy_customer_addresses a
)
UPDATE customers c
SET postal_code = substr(r.zip_cd, 1, 3) || '-' || substr(r.zip_cd, 4),
    address     = r.addr1 || COALESCE(' ' || r.addr2, '')
FROM r
WHERE r.rn = 1 AND r.cust_no = c.legacy_cust_no;`;

const ADDR_TABLE = `CREATE TABLE customer_addresses (
  address_id   serial PRIMARY KEY,
  customer_id  integer NOT NULL REFERENCES customers(customer_id),
  address_type varchar(10) NOT NULL CHECK (address_type IN ('HOME', 'WORK')),
  postal_code  varchar(8),
  address      varchar(200) NOT NULL
);`;

const REJECT_CUSTOMERS = `WITH r AS (
  SELECT l.*, ROW_NUMBER() OVER (PARTITION BY lower(trim(l.mail_addr)) ORDER BY l.reg_ymd, l.cust_no) AS rn
  FROM legacy_customers l
)
INSERT INTO migration_rejects (source_table, source_key, reason)
SELECT 'legacy_customers', cust_no,
       CASE WHEN del_flg = '1' THEN '削除済'
            WHEN sts_kbn = '9' THEN '退会'
            WHEN NOT pg_input_is_valid(reg_ymd, 'date') THEN '不正日付'
            ELSE '重複' END
FROM r
WHERE del_flg = '1' OR sts_kbn = '9' OR NOT pg_input_is_valid(reg_ymd, 'date')
   OR (rn > 1 AND mail_addr IS NOT NULL);`;

const CORRUPT_I = `UPDATE customers SET phone = '080-6666-0008' WHERE legacy_cust_no = 'C0003';
UPDATE customers SET points = 980  WHERE legacy_cust_no = 'C0001';
UPDATE customers SET points = 1200 WHERE legacy_cust_no = 'C0005';
UPDATE orders SET total_amount = total_amount - 1 WHERE legacy_ord_no = 'O0006';`;

const EXPECTED_CUST_I = R`SELECT cust_no AS legacy_cust_no,
       CASE WHEN tel_no ~ '^[0-9]{11}$' THEN regexp_replace(tel_no, '^([0-9]{3})([0-9]{4})([0-9]{4})$', '\1-\2-\3') END AS phone,
       CASE WHEN replace(point_bal, ',', '') ~ '^[0-9]+$' THEN replace(point_bal, ',', '')::integer ELSE 0 END AS points
FROM legacy_customers`;

const LOG_SETUP = MIG_CUSTOMERS + '\n' + MIG_ORDERS_BASIC.replace('WHERE pg_input_is_valid', "WHERE o.ord_no <= 'O0006' AND pg_input_is_valid") + `
CREATE TABLE migration_log (step varchar(30) PRIMARY KEY, status varchar(10) NOT NULL, row_count integer);
INSERT INTO migration_log VALUES ('customers', 'DONE', 16), ('orders', 'FAILED', NULL), ('order_items', 'PENDING', NULL);`;

const SALES_INSERT = `INSERT INTO sales (sale_id, customer_code, sale_date, amount, region_cd)
SELECT sale_no, cust_no, to_date(sale_ymd, 'YYYYMMDD'), amt_txt::numeric, region_cd
FROM legacy_sales
WHERE amt_txt ~ '^[0-9]+$'`;

export const SCENARIOS = [
{
  id: 'A', title: 'カラム名が新システムで変更されている', dataset: 'migration', tables: ['legacy_customers', 'customers'],
  story: '旧システムの顧客テーブルは cust_no / cust_nm / mail_addr / tel_no / reg_ymd という略語の列名でした。新システムでは legacy_cust_no / name / email / phone / registered_at に変わっています。まず「構造比較」タブで2つのテーブルを比べてから始めましょう。',
  steps: [
    { id: 's1', type: 'write', title: '新しい列名で旧データを表示', prompt: "旧顧客 C0001 の1行を、新システムの列名（legacy_cust_no, name, email, phone, registered_at）の別名を付けて表示してください（値は変換せずそのまま）。", checkNames: true,
      answer: "SELECT cust_no AS legacy_cust_no, cust_nm AS name, mail_addr AS email, tel_no AS phone, reg_ymd AS registered_at FROM legacy_customers WHERE cust_no = 'C0001';",
      hints: ['AS で別名を付けます。採点では列名も比較します。'], explain: '別名を付けたSELECTは、そのままマッピングの確認になります。' },
    { id: 's2', type: 'write', title: '列名を対応させて移行', prompt: "問題のあるデータを除いた旧顧客（このシナリオでは事前に C0012, C0014, C0016, C0017 を削除済み）を customers に移行してください。\n列: customer_id（cust_no の数字部分）、legacy_cust_no、name、email（小文字・前後空白除去、空ならNULL）、status（code_master の CUST_STATUS で変換）、registered_at（reg_ymd を日付に）", compare: 'none',
      setup: "DELETE FROM legacy_customers WHERE cust_no IN ('C0012','C0014','C0016','C0017');",
      answer: "INSERT INTO customers (customer_id, legacy_cust_no, name, email, status, registered_at)\nSELECT substr(l.cust_no, 2)::integer, l.cust_no, l.cust_nm, NULLIF(lower(trim(l.mail_addr)), ''), m.new_code, l.reg_ymd::date\nFROM legacy_customers l\nJOIN code_master m ON m.code_type = 'CUST_STATUS' AND m.old_code = l.sts_kbn;",
      hints: ['INSERT の列リスト（新しい名前）と SELECT の式（古い名前）の順番を合わせます。'], explain: '16件。列名の対応表（マッピング）を見ながら、INSERT 側と SELECT 側の順番を1対1でそろえるのがコツです。' },
    { id: 's3', type: 'investigate', title: '列の対応を検証', prompt: '移行元の氏名（cust_nm）と移行先の氏名（name）が一致しない顧客を、legacy_cust_no と name で表示してください（EXCEPT を使用）。正しく移行できていれば0件です。',
      setup: "DELETE FROM legacy_customers WHERE cust_no IN ('C0012','C0014','C0016','C0017');\nINSERT INTO customers (customer_id, legacy_cust_no, name, email, status, registered_at) SELECT substr(l.cust_no, 2)::integer, l.cust_no, l.cust_nm, NULLIF(lower(trim(l.mail_addr)), ''), m.new_code, l.reg_ymd::date FROM legacy_customers l JOIN code_master m ON m.code_type = 'CUST_STATUS' AND m.old_code = l.sts_kbn;",
      answer: 'SELECT cust_no AS legacy_cust_no, cust_nm AS name FROM legacy_customers EXCEPT SELECT legacy_cust_no, name FROM customers;', mustInclude: [['\\bexcept\\b', 'EXCEPT を使ってください']],
      hints: ['(旧: キー, 値) EXCEPT (新: キー, 値)'], explain: '0件＝すべての顧客の氏名が一致。列ごとに同じ検証を行えば、列の取り違え（name と email を逆に入れた等）を確実に検出できます。' },
  ],
},
{
  id: 'B', title: '文字列の金額を数値型に変換する', dataset: 'migration', tables: ['legacy_orders', 'migration_rejects'],
  story: "旧注文の金額 amt_txt は文字列で、'2,700' や '¥5800'、'N/A'、空文字が混ざっています。新システムの total_amount は numeric 型です。変換できる値・補正すれば変換できる値・変換できない値に分類し、変換できない行は理由付きで記録します。",
  steps: [
    { id: 's1', type: 'investigate', title: 'そのままでは数値にならない値', prompt: "amt_txt が数字だけでできていない（そのまま numeric に変換できない）注文の ord_no と amt_txt を表示してください。", answer: "SELECT ord_no, amt_txt FROM legacy_orders WHERE amt_txt !~ '^[0-9]+$';",
      hints: ["!~ '^[0-9]+$'"], explain: "4件。'2,700' と '¥5800' は記号を取り除けば救える値、'N/A' と '' は変換できない値です。" },
    { id: 's2', type: 'write', title: '変換できない行を記録', prompt: "カンマと円記号を除去しても数値にならない注文を migration_rejects に登録してください。source_table='legacy_orders'、source_key=ord_no、reason='金額が数値に変換できない'。", compare: 'none', allowDiff: ['migration_rejects'],
      check: 'SELECT source_table, source_key, reason FROM migration_rejects ORDER BY source_key', checkLabel: 'migration_rejects の内容（reject_id 以外）',
      answer: `INSERT INTO migration_rejects (source_table, source_key, reason)\nSELECT 'legacy_orders', ord_no, '金額が数値に変換できない'\nFROM legacy_orders\nWHERE ${CLEAN_AMT} !~ '^[0-9]+$';`,
      hints: [`${CLEAN_AMT} で記号を除去`, 'INSERT INTO migration_rejects (source_table, source_key, reason) SELECT ...'], explain: 'O0011 と O0015。対象外の記録は、移行完了報告書の「対象外一覧」にそのまま使えます。' },
    { id: 's3', type: 'write', title: '変換結果の集計', prompt: "変換できる注文（記号除去後に整数）の件数 convertible と、その税抜金額の合計 total_ex_tax を1行で表示してください。", answer: `SELECT COUNT(*) AS convertible, SUM(${CLEAN_AMT}::numeric) AS total_ex_tax FROM legacy_orders WHERE ${CLEAN_AMT} ~ '^[0-9]+$';`,
      hints: ['WHERE で変換可能な行に絞ってから SUM。'], explain: '移行後の合計値と比較する「基準値」になります（シナリオIの集計比較）。' },
  ],
},
{
  id: 'C', title: 'ステータスコードを新コードに変換する', dataset: 'migration', tables: ['legacy_orders', 'code_master', 'orders'],
  story: "旧注文のステータスは '01','02','03','09' の2桁コード。新システムでは 'NEW','SHIPPED','COMPLETED','CANCELLED' です。code_master に対応表がありますが、旧データに対応表にないコードが混ざっているかもしれません。",
  steps: [
    { id: 's1', type: 'investigate', title: '対応表にないコードの検出', prompt: "code_master（ORDER_STATUS）に存在しない旧ステータス ord_sts と、その件数 cnt を表示してください。", answer: "SELECT o.ord_sts, COUNT(*) AS cnt FROM legacy_orders o WHERE NOT EXISTS (SELECT 1 FROM code_master m WHERE m.code_type = 'ORDER_STATUS' AND m.old_code = o.ord_sts) GROUP BY o.ord_sts;",
      hints: ['NOT EXISTS で対応表にない行を絞ってから GROUP BY。'], explain: "'99' が1件。業務担当者に意味を確認します（このアプリの仕様では対象外）。" },
    { id: 's2', type: 'write', title: '新旧コード別件数の対応表', prompt: '旧ステータス ord_sts、変換後の new_code（変換できなければNULL）、件数 cnt を表示してください。すべての旧注文を含めること。', answer: "SELECT o.ord_sts, m.new_code, COUNT(*) AS cnt FROM legacy_orders o LEFT JOIN code_master m ON m.code_type = 'ORDER_STATUS' AND m.old_code = o.ord_sts GROUP BY o.ord_sts, m.new_code;",
      hints: ['LEFT JOIN + GROUP BY'], explain: '合計18件になることを確認しましょう（件数の網羅性の確認）。' },
    { id: 's3', type: 'write', title: '移行後のステータス検証', prompt: '移行が完了した状態です。新ステータス status ごとに、移行された注文の旧ステータスから数えた件数 legacy_cnt と、orders の件数 new_cnt を表示してください。', setup: FULL_MIGRATION,
      answer: "SELECT m.new_code AS status, COUNT(*) AS legacy_cnt, (SELECT COUNT(*) FROM orders o2 WHERE o2.status = m.new_code) AS new_cnt FROM legacy_orders l JOIN code_master m ON m.code_type = 'ORDER_STATUS' AND m.old_code = l.ord_sts WHERE EXISTS (SELECT 1 FROM orders o WHERE o.legacy_ord_no = l.ord_no) GROUP BY m.new_code;",
      hints: ['移行された注文（EXISTS で orders にあるもの）だけを旧側で数えます。', 'new_cnt はスカラーサブクエリで。'], explain: 'すべての行で legacy_cnt = new_cnt なら、ステータス変換は正しく行われています。' },
  ],
},
{
  id: 'D', title: '複数テーブルに分かれたデータを統合する', dataset: 'migration', tables: ['legacy_customers', 'legacy_customer_addresses', 'customers'],
  story: '旧システムでは顧客と住所が別テーブル（住所は自宅・勤務先の複数行）でした。新システムの customers には代表住所（postal_code, address）を持たせ、勤務先も含む全住所は customer_addresses に保持します。顧客の移行は完了しています。',
  steps: [
    { id: 's1', type: 'write', title: '代表住所を customers に統合', prompt: "customers の postal_code（'1000001'→'100-0001'）と address（addr1 と addr2 を半角空白で連結）を、旧住所から更新してください。自宅（addr_type='1'）を優先し、なければ勤務先。", setup: MIG_CUSTOMERS, compare: 'none', requireSafe: true,
      answer: ADDR_UPDATE, hints: ['第16章 e4 の SELECT を UPDATE ... FROM に組み込みます。', 'UPDATE customers c SET ... FROM (代表住所) r WHERE r.cust_no = c.legacy_cust_no'], explain: '7件更新。UPDATE ... FROM は「別テーブルの値で更新」する PostgreSQL の書き方です（DBによって構文が違います）。' },
    { id: 's2', type: 'write', title: '全住所を別テーブルへ', prompt: "customer_addresses テーブル（作成済み）に、移行済み顧客の全住所を登録してください。address_type は '1'→'HOME'、'2'→'WORK'。customer_id は customers から取得。", setup: MIG_CUSTOMERS + '\n' + ADDR_TABLE, compare: 'none', allowDiff: ['customer_addresses'],
      check: 'SELECT customer_id, address_type, postal_code, address FROM customer_addresses ORDER BY customer_id, address_type', checkLabel: 'customer_addresses の内容（address_id 以外）',
      answer: "INSERT INTO customer_addresses (customer_id, address_type, postal_code, address)\nSELECT c.customer_id, CASE a.addr_type WHEN '1' THEN 'HOME' WHEN '2' THEN 'WORK' END,\n       substr(a.zip_cd, 1, 3) || '-' || substr(a.zip_cd, 4), a.addr1 || COALESCE(' ' || a.addr2, '')\nFROM legacy_customer_addresses a\nJOIN customers c ON c.legacy_cust_no = a.cust_no;",
      hints: ['customers と JOIN すると、顧客が存在しない C9999 は自然に除外されます。'], explain: '9件。1対多のデータを「代表1件」と「全件」の両方の形で持つのは、よくある設計です。' },
    { id: 's3', type: 'investigate', title: '統合の検証', prompt: '住所を持つ旧顧客（legacy_customers に存在する顧客のみ）の人数 src と、address が入っている customers の人数 dst を1行で表示してください。', setup: MIG_CUSTOMERS + '\n' + ADDR_UPDATE,
      answer: 'SELECT (SELECT COUNT(DISTINCT a.cust_no) FROM legacy_customer_addresses a JOIN legacy_customers l ON l.cust_no = a.cust_no) AS src, (SELECT COUNT(*) FROM customers WHERE address IS NOT NULL) AS dst;',
      hints: ['COUNT(DISTINCT cust_no) で「人数」を数えます（行数ではなく）。'], explain: '7人ずつで一致。行数（10）で比べると一致しないので、何を単位に比較するかが大切です。' },
  ],
},
{
  id: 'E', title: '不要なデータ・重複データを除外する', dataset: 'migration', tables: ['legacy_customers', 'migration_rejects'],
  story: '旧顧客には、削除済み・退会・登録日が不正・メール重複の行があります。移行しない行は理由を付けて migration_rejects に記録し、「全件 = 移行 + 対象外」で説明できるようにします。',
  steps: [
    { id: 's1', type: 'investigate', title: '除外理由ごとの件数', prompt: "除外理由 reason ごとの件数 cnt を表示してください。理由は優先順に: del_flg='1' → '削除済'、sts_kbn='9' → '退会'、reg_ymd が日付として不正 → '不正日付'、メール重複（小文字・前後空白除去で同じメールの2件目以降。reg_ymd, cust_no の古い順、メールNULLは除く）→ '重複'。除外されない行は含めないこと。",
      answer: REJECT_CUSTOMERS.replace("INSERT INTO migration_rejects (source_table, source_key, reason)\nSELECT 'legacy_customers', cust_no,\n       CASE", 'SELECT CASE').replace("ELSE '重複' END\nFROM r", "ELSE '重複' END AS reason, COUNT(*) AS cnt\nFROM r").replace('OR (rn > 1 AND mail_addr IS NOT NULL);', 'OR (rn > 1 AND mail_addr IS NOT NULL)\nGROUP BY 1;'),
      hints: ['WITH 句で ROW_NUMBER を付けてから、CASE で理由を作ります。', 'WHERE で除外対象だけに絞り、GROUP BY 1。'], explain: '4種類×1件。優先順位を決めておかないと、複数の理由に当てはまる行が二重に数えられます。' },
    { id: 's2', type: 'write', title: '対象外を記録', prompt: "s1 と同じルールで、除外される旧顧客を migration_rejects に登録してください（source_table='legacy_customers'、source_key=cust_no、reason=s1の理由）。", compare: 'none', allowDiff: ['migration_rejects'],
      check: 'SELECT source_table, source_key, reason FROM migration_rejects ORDER BY source_key', checkLabel: 'migration_rejects の内容（reject_id 以外）',
      answer: REJECT_CUSTOMERS, hints: ['s1 の SELECT を INSERT INTO migration_rejects (...) SELECT に変えます。'], explain: '対象外の記録が残っていれば、完了報告で「なぜ移行されていないか」を1件ずつ説明できます。' },
    { id: 's3', type: 'write', title: '件数の説明', prompt: '移行と対象外の記録が終わった状態です。旧顧客の総数 total、移行件数 migrated、対象外件数 rejected、説明できない件数 unexplained（total − migrated − rejected）を1行で表示してください。', setup: MIG_CUSTOMERS + '\n' + REJECT_CUSTOMERS,
      answer: "SELECT (SELECT COUNT(*) FROM legacy_customers) AS total, (SELECT COUNT(*) FROM customers) AS migrated, (SELECT COUNT(*) FROM migration_rejects WHERE source_table = 'legacy_customers') AS rejected, (SELECT COUNT(*) FROM legacy_customers) - (SELECT COUNT(*) FROM customers) - (SELECT COUNT(*) FROM migration_rejects WHERE source_table = 'legacy_customers') AS unexplained;",
      hints: ['スカラーサブクエリで3つの件数を出して引き算。'], explain: '20 = 16 + 4、unexplained = 0。この「0」が移行完了報告の根拠になります。' },
  ],
},
{
  id: 'F', title: 'NULLの扱いが新旧システムで異なる', dataset: 'migration', tables: ['legacy_customers', 'customers'],
  story: "旧システムは「未入力」を空文字 '' で保存することがあり、新システムは NULL で表す仕様です。前任者が値をそのまま移行してしまったため、customers に空文字や前後の空白が残っています。",
  steps: [
    { id: 's1', type: 'investigate', title: '空文字とNULLの実態調査', prompt: "旧顧客の mail_addr, tel_no, pref_cd, point_bal について、列名 column_name、空文字の件数 empty_cnt、NULLの件数 null_cnt を4行で表示してください（UNION ALL）。",
      answer: "SELECT 'mail_addr' AS column_name, COUNT(*) FILTER (WHERE mail_addr = '') AS empty_cnt, COUNT(*) FILTER (WHERE mail_addr IS NULL) AS null_cnt FROM legacy_customers UNION ALL SELECT 'tel_no', COUNT(*) FILTER (WHERE tel_no = ''), COUNT(*) FILTER (WHERE tel_no IS NULL) FROM legacy_customers UNION ALL SELECT 'pref_cd', COUNT(*) FILTER (WHERE pref_cd = ''), COUNT(*) FILTER (WHERE pref_cd IS NULL) FROM legacy_customers UNION ALL SELECT 'point_bal', COUNT(*) FILTER (WHERE point_bal = ''), COUNT(*) FILTER (WHERE point_bal IS NULL) FROM legacy_customers;",
      hints: ["COUNT(*) FILTER (WHERE 列 = '')", 'UNION ALL で4つの SELECT をつなぐ。'], explain: '同じ「未入力」でも空文字とNULLが混在しています。新システムの仕様（NULLに統一）に合わせた変換が必要です。' },
    { id: 's2', type: 'write', title: '移行先のデータを正規化', prompt: "前任者がそのまま移行した customers を修正してください: email は前後空白除去・小文字化し空ならNULL、phone は空文字ならNULL。**変更が必要な行だけ** を更新するのが望ましいです。", setup: NAIVE_CUSTOMERS, compare: 'none', requireSafe: true,
      answer: "UPDATE customers\nSET email = NULLIF(lower(trim(email)), ''),\n    phone = NULLIF(phone, '')\nWHERE email IS DISTINCT FROM NULLIF(lower(trim(email)), '')\n   OR phone = '';",
      hints: ["NULLIF(lower(trim(email)), '')", "WHERE で変更が必要な行に絞ると、影響件数で確認しやすくなります（WHERE 1=1 は不可）。"], explain: '本来は移行SQLの段階で NULLIF を入れるべきでした。移行後の修正は「修正SQL」として手順書・不具合管理に記録します。' },
    { id: 's3', type: 'investigate', title: '正規化の検証', prompt: "customers に「空文字のphone」「空文字のemail」「前後に空白があるか大文字を含むemail」が残っていないか、該当件数 bad_cnt を1件の値で表示してください（0件なら正しい）。", setup: NAIVE_CUSTOMERS + "\nUPDATE customers SET email = NULLIF(lower(trim(email)), ''), phone = NULLIF(phone, '') WHERE email IS DISTINCT FROM NULLIF(lower(trim(email)), '') OR phone = '';",
      answer: "SELECT COUNT(*) AS bad_cnt FROM customers WHERE phone = '' OR email = '' OR email <> lower(trim(email));",
      hints: ["email <> lower(trim(email)) で「正規化されていない」ことを判定。"], explain: '0件。検証SQLは「あってはならない状態の件数＝0」という形にしておくと、手順書の判定基準に書きやすくなります。' },
  ],
},
{
  id: 'G', title: '外部キーの依存関係を考慮して複数テーブルを移行する', dataset: 'migration', tables: ['customers', 'orders', 'order_items'],
  story: '顧客・注文・注文明細を空の状態から一気に移行します。外部キーがあるため順番を間違えるとエラーになります。第17章で作ったSQLを、正しい順番の1本のスクリプトにまとめましょう。',
  steps: [
    { id: 's1', type: 'choice', title: '移行順序', prompt: 'customers / orders / order_items / products（移行済みマスタ）の依存関係から、移行の順番として正しいものは？', options: ['order_items → orders → customers', 'customers → orders → order_items', 'orders → customers → order_items', 'どの順でもよい'], answerIndex: 1,
      hints: ['orders.customer_id → customers、order_items.order_id → orders'], explain: '親（参照される側）から子（参照する側）の順です。' },
    { id: 's2', type: 'write', title: '3テーブルの一括移行スクリプト', prompt: "顧客 → 注文 → 明細 の順に、移行仕様のすべてのルール（重複顧客の注文付け替えを含む）で移行してください。トランザクション（BEGIN〜COMMIT）で囲み、途中で失敗したら何も残らないようにすること。", compare: 'none',
      answer: 'BEGIN;\n' + FULL_MIGRATION + '\nCOMMIT;', mustInclude: [['\\bbegin\\b', 'BEGIN で開始してください'], ['\\bcommit\\b', 'COMMIT で確定してください']],
      hints: ['第17章 e2（顧客）、e6（注文・付け替え込み）、e5（明細）を順に並べます。', '各移行の後に setval を忘れずに。'], explain: '顧客16・注文11・明細9。テーブルごとにトランザクションを分ける設計もあります（失敗時にどこからやり直すかで選ぶ）。' },
    { id: 's3', type: 'investigate', title: '親子の整合性検証', prompt: "移行後、明細を持たない注文の legacy_ord_no を表示してください（親だけ移行されて子が落ちた可能性の確認）。", setup: FULL_MIGRATION,
      answer: 'SELECT o.legacy_ord_no FROM orders o WHERE NOT EXISTS (SELECT 1 FROM order_items i WHERE i.order_id = o.order_id);',
      hints: ['NOT EXISTS'], explain: '旧システムでも明細がなかった注文（O0002 など）か、明細が移行で落ちた注文かを、legacy_order_details と照合して説明できるようにします。' },
  ],
},
{
  id: 'H', title: '移行が途中で失敗した：復旧と再実行', dataset: 'migration', tables: ['migration_log', 'orders', 'order_items'],
  story: '本番リハーサルで、注文移行が O0006 まで登録したところでサーバーが停止しました（トランザクションを分けていなかったため、途中まで確定しています）。migration_log には orders=FAILED と記録されています。安全に復旧し、最後まで移行してください。',
  steps: [
    { id: 's1', type: 'investigate', title: '状況の確認', prompt: 'まず現状を把握します。orders に未登録の旧注文 ord_no を表示してください（対象外になるものも含めて全部）。', setup: LOG_SETUP,
      answer: 'SELECT l.ord_no FROM legacy_orders l WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.legacy_ord_no = l.ord_no);',
      hints: ['NOT EXISTS で未登録を探す。'], explain: '12件。このうち移行対象は O0007, O0012, O0014, O0018 の4件です。' },
    { id: 's2', type: 'write', title: '冪等な再実行', prompt: "トランザクションの中で、①注文の残りを移行（付け替え込み・重複しない形）、②明細を移行、③ migration_log の orders と order_items を status='DONE'、row_count=それぞれの件数（orders / order_items テーブルの件数）に更新、して COMMIT してください。", setup: LOG_SETUP, compare: 'none', requireSafe: true,
      answer: "BEGIN;\n" + MIG_ORDERS_FULL + "\n" + MIG_ITEMS + "\nUPDATE migration_log SET status = 'DONE', row_count = (SELECT COUNT(*) FROM orders) WHERE step = 'orders';\nUPDATE migration_log SET status = 'DONE', row_count = (SELECT COUNT(*) FROM order_items) WHERE step = 'order_items';\nCOMMIT;",
      mustInclude: [['\\bbegin\\b', 'BEGIN でトランザクションを開始してください'], ['not\\s+exists|on\\s+conflict', '重複しない形（NOT EXISTS / ON CONFLICT）で移行してください']],
      hints: ['第17章 e6 の注文移行SQLは NOT EXISTS 付きなので、そのまま再実行できます。', '明細の移行にも NOT EXISTS を付けておくと、明細の途中失敗にも強くなります。'], explain: '途中まで確定したデータを消さずに「残りだけ」を流せるのが冪等な移行SQLの強みです。' },
    { id: 's3', type: 'investigate', title: '再実行後の検証', prompt: "1行で、orders の件数 orders_cnt、order_items の件数 items_cnt、legacy_ord_no が重複している件数 dup_cnt（重複していなければ0）を表示してください。", setup: LOG_SETUP + '\n' + MIG_ORDERS_FULL + '\n' + MIG_ITEMS,
      answer: 'SELECT (SELECT COUNT(*) FROM orders) AS orders_cnt, (SELECT COUNT(*) FROM order_items) AS items_cnt, (SELECT COUNT(*) FROM (SELECT legacy_ord_no FROM orders GROUP BY legacy_ord_no HAVING COUNT(*) > 1) d) AS dup_cnt;',
      hints: ['重複件数は GROUP BY ... HAVING COUNT(*) > 1 の結果をさらに COUNT。'], explain: '11件・9件・重複0。障害対応記録には「原因・影響範囲・復旧手順・再実行結果・検証結果」を残します。' },
  ],
},
{
  id: 'I', title: '件数は一致するが内容に不整合がある', dataset: 'migration', tables: ['customers', 'orders'],
  story: '移行後の件数チェックは全テーブルで一致しました。ところが業務担当者から「ポイントがおかしい顧客がいる」と連絡が。移行先のデータに不整合が混ざっています（このシナリオでは意図的に混入させています）。',
  steps: [
    { id: 's1', type: 'write', title: '件数の確認', prompt: 'customers の件数 customers と orders の件数 orders を1行で表示してください。', setup: FULL_MIGRATION + '\n' + CORRUPT_I,
      answer: 'SELECT (SELECT COUNT(*) FROM customers) AS customers, (SELECT COUNT(*) FROM orders) AS orders;', hints: ['スカラーサブクエリ2つ。'], explain: '16件・11件。仕様どおりの件数ですが…' },
    { id: 's2', type: 'investigate', title: '顧客の内容不整合を特定', prompt: "移行ルールで計算した期待値（phone: 11桁なら3-4-4形式・他はNULL、points: カンマ除去後0以上の整数・他は0）と customers の値を比較し、phone か points が違う顧客の legacy_cust_no を表示してください。", setup: FULL_MIGRATION + '\n' + CORRUPT_I,
      answer: `SELECT legacy_cust_no FROM (\n  SELECT legacy_cust_no, phone, points FROM customers\n  EXCEPT\n  ${EXPECTED_CUST_I.replace(/\n/g, '\n  ')}\n) diff;`,
      hints: ['(移行先の値) EXCEPT (期待値) で「期待と違う移行先の行」が出ます。', '期待値は legacy_customers から、移行SQLと同じ式で作ります。'], explain: 'C0001・C0003・C0005。C0001 と C0005 はポイントが入れ替わっているため、合計値の比較では検出できません。' },
    { id: 's3', type: 'investigate', title: '注文金額の不整合を特定', prompt: "orders の total_amount が、移行元 amt_txt（記号除去・×1.1・四捨五入）と一致しない注文の legacy_ord_no を表示してください。", setup: FULL_MIGRATION + '\n' + CORRUPT_I,
      answer: `SELECT o.legacy_ord_no FROM orders o JOIN legacy_orders l ON l.ord_no = o.legacy_ord_no WHERE o.total_amount IS DISTINCT FROM round(${CLEAN_AMT.replace('amt_txt', 'l.amt_txt')}::numeric * 1.1);`,
      hints: ['orders と legacy_orders を JOIN して、期待値と比較。'], explain: 'O0006（1円のずれ）。金額は1円のずれでも重大な不整合です。' },
    { id: 's4', type: 'write', title: '修正と再検証', prompt: '見つかった不整合を、移行元から計算した正しい値で修正してください（customers の phone・points、orders の total_amount）。修正後、s2・s3 の検証SQLが0件になることを確かめましょう。', setup: FULL_MIGRATION + '\n' + CORRUPT_I, compare: 'none', requireSafe: true,
      answer: `UPDATE customers c\nSET phone = e.phone, points = e.points\nFROM (${EXPECTED_CUST_I}) e\nWHERE e.legacy_cust_no = c.legacy_cust_no\n  AND (c.phone IS DISTINCT FROM e.phone OR c.points IS DISTINCT FROM e.points);\nUPDATE orders o\nSET total_amount = round(${CLEAN_AMT.replace('amt_txt', 'l.amt_txt')}::numeric * 1.1)\nFROM legacy_orders l\nWHERE l.ord_no = o.legacy_ord_no\n  AND o.total_amount IS DISTINCT FROM round(${CLEAN_AMT.replace('amt_txt', 'l.amt_txt')}::numeric * 1.1);`,
      mustInclude: [['legacy_customers', '移行元（legacy_customers）から値を計算してください'], ['legacy_orders', '移行元（legacy_orders）から値を計算してください']],
      hints: ['UPDATE ... FROM (期待値) e WHERE キー一致 AND 値が違う', '値を手で書き込むと、別の誤りを生む原因になります。'], explain: '顧客3件・注文1件を修正。修正後に検証SQLを再実行し、0件の結果を検証結果報告書に記録します。' },
  ],
},
{
  id: 'J', title: '大量データの移行に時間がかかる：処理方法を改善', dataset: 'bulk', tables: ['legacy_sales', 'sales'], bulk: true,
  story: '旧売上 legacy_sales を新しい sales に移行します。件数は上の「データ件数」で 1,000〜200,000件に変更できます（変更するとリセット）。一括移行と分割移行の時間・扱いやすさを比べ、検証まで行いましょう。※ブラウザ内の小さなDBなので、時間の絶対値ではなく比較で考えてください。',
  steps: [
    { id: 's1', type: 'write', title: '一括移行して時間を計測', prompt: "金額が整数の行をすべて、1つの INSERT で sales に移行してください（列: sale_id=sale_no, customer_code=cust_no, sale_date=sale_ymdを日付に, amount=amt_txtを数値に, region_cd）。実行時間をメモしておきましょう。", compare: 'none',
      answer: SALES_INSERT + ';', hints: ["WHERE amt_txt ~ '^[0-9]+$'"], explain: 'エディタ右上の実行時間が、一括移行の所要時間です。' },
    { id: 's2', type: 'write', title: '主キー範囲で分割移行（DOブロック）', prompt: "同じ移行を、sale_no の **5000件ごとの範囲** に分けて行ってください。DOブロック（PL/pgSQL）のループで、各範囲を INSERT し、ON CONFLICT DO NOTHING で再実行しても安全にすること。", compare: 'none',
      answer: `DO $$\nDECLARE\n  b integer;\n  max_no integer := (SELECT MAX(sale_no) FROM legacy_sales);\nBEGIN\n  FOR b IN 0 .. (max_no - 1) / 5000 LOOP\n    ${SALES_INSERT.replace(/\n/g, '\n    ')}\n      AND sale_no BETWEEN b * 5000 + 1 AND (b + 1) * 5000\n    ON CONFLICT (sale_id) DO NOTHING;\n    RAISE NOTICE 'batch % done', b + 1;\n  END LOOP;\nEND $$;`,
      mustInclude: [['\\bloop\\b|between', '範囲（BETWEEN）やループで分割してください'], ['on\\s+conflict|not\\s+exists', 'ON CONFLICT か NOT EXISTS で再実行に備えてください']],
      hints: ['DO $$ DECLARE b integer; BEGIN FOR b IN 0..N LOOP ... END LOOP; END $$;', '範囲: sale_no BETWEEN b*5000+1 AND (b+1)*5000'],
      explain: '同じ結果になります。本番の移行ツールでは、バッチごとにCOMMITし、進捗をログに記録します（DOブロック内のCOMMITは環境によって制限があるため、ここでは1トランザクションで実行しています）。' },
    { id: 's3', type: 'write', title: '地域別の検証', prompt: "移行完了後の検証です。地域 region_cd ごとに、移行対象（金額が整数）の件数 src_cnt と金額合計 src_sum、sales の件数 dst_cnt と金額合計 dst_sum を表示してください。", setup: SALES_INSERT + ';',
      answer: "SELECT l.region_cd, l.src_cnt, l.src_sum, s.dst_cnt, s.dst_sum FROM (SELECT region_cd, COUNT(*) AS src_cnt, SUM(amt_txt::numeric) AS src_sum FROM legacy_sales WHERE amt_txt ~ '^[0-9]+$' GROUP BY region_cd) l FULL OUTER JOIN (SELECT region_cd, COUNT(*) AS dst_cnt, SUM(amount) AS dst_sum FROM sales GROUP BY region_cd) s ON s.region_cd = l.region_cd;",
      hints: ['移行元と移行先をそれぞれ GROUP BY してから、region_cd で結合。', '片方にしかない地域も見えるよう FULL OUTER JOIN が安全です。'], explain: '全体の合計だけでなく、区分ごとに比べると、どこで差が出たかを素早く絞り込めます。' },
  ],
},
];

export function getScenario(id) { return SCENARIOS.find((s) => s.id === id); }
