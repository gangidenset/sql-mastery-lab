// LEVEL 2：SQLの応用
export default [
// ------------------------------------------------------------------
{
  id: 'ch08', level: 2, chapter: 8, title: 'JOIN：テーブルを結合する', difficulty: 2, minutes: 70, prereq: ['ch05'], dataset: 'base',
  summary: 'INNER / LEFT / RIGHT / FULL OUTER JOIN、結合による重複、結合漏れの検出',
  goal: '複数テーブルを正しい条件で結合し、JOINの種類による結果の違いと「重複」「漏れ」を説明できる。',
  usage: '移行では「旧注文の顧客番号 → 新顧客ID」の変換、移行元と移行先の突き合わせ（漏れ・余分の検出）にJOINを使います。',
  terms: [['INNER JOIN', '両方のテーブルに一致する行だけ'], ['LEFT JOIN', '左のテーブルは全行残し、右に一致がなければNULL'], ['RIGHT JOIN', 'LEFTの逆（右を全行残す）'], ['FULL OUTER JOIN', '両方の全行を残す（突き合わせ検証で便利）'], ['結合条件（ON）', 'どの列同士を結びつけるか'], ['テーブル別名', 'FROM customers c のように短い名前を付ける']],
  syntax: 'SELECT a.列, b.列\nFROM テーブルA a\n[INNER|LEFT|RIGHT|FULL OUTER] JOIN テーブルB b\n  ON a.キー = b.キー;',
  examples: [
    { title: 'INNER JOIN：注文と顧客名', sql: 'SELECT o.order_id, o.order_date, c.name\nFROM orders o\nJOIN customers c ON c.customer_id = o.customer_id\nORDER BY o.order_id\nLIMIT 5;' },
    { title: '3テーブル結合：注文1006の明細と商品名', sql: 'SELECT i.order_id, i.line_no, p.product_name, i.quantity, i.unit_price\nFROM order_items i\nJOIN products p ON p.product_id = i.product_id\nWHERE i.order_id = 1006\nORDER BY i.line_no;' },
    { title: 'FULL OUTER JOIN：旧顧客と新顧客をメールで突き合わせ', sql: "SELECT l.cust_no, c.customer_id, coalesce(lower(trim(l.mail_addr)), c.email) AS mail\nFROM legacy_customers l\nFULL OUTER JOIN customers c ON c.email = lower(trim(l.mail_addr))\nWHERE l.cust_no IS NULL OR c.customer_id IS NULL\nORDER BY mail;" },
  ],
  explanation: `**JOINの種類と行数**
- INNER JOIN: 一致しない行は消えます → 「注文のない顧客」は出てこない
- LEFT JOIN: 左側は必ず残ります → 一致しない右側の列は NULL
- 右側がNULLの行だけを選ぶ（\`WHERE 右.キー IS NULL\`）と **「相手がいない行＝漏れ」** を検出できます

**結合による重複**: 1対多のテーブルを結合すると、「1」側の行が「多」の数だけ増えます。注文（1）と明細（多）を結合してから注文金額を SUM すると、明細の数だけ金額が重複して合計が大きくなります。`,
  exercises: [
    { id: 'e1', type: 'write', title: 'INNER JOIN', prompt: 'すべての注文について、order_id、order_date、顧客の name を表示してください。', answer: 'SELECT o.order_id, o.order_date, c.name FROM orders o JOIN customers c ON c.customer_id = o.customer_id;',
      hints: ['orders と customers を customer_id で結合します。'], explain: '別名（o, c）を使うと短く書けます。' },
    { id: 'e2', type: 'write', title: 'LEFT JOIN と COUNT', prompt: '**全顧客**の customer_id、name、注文件数を表示してください（注文がない顧客は0件）。', answer: 'SELECT c.customer_id, c.name, COUNT(o.order_id) FROM customers c LEFT JOIN orders o ON o.customer_id = c.customer_id GROUP BY c.customer_id, c.name;',
      hints: ['顧客を全員残すので LEFT JOIN。', 'COUNT(*) だと注文がない顧客も1になります。COUNT(o.order_id) を使いましょう。'], explain: 'COUNT(o.order_id) は右側がNULLの行を数えないので、注文なしの顧客は0になります。' },
    { id: 'e3', type: 'investigate', title: '一度も注文していない顧客', prompt: 'LEFT JOIN を使って、一度も注文していない顧客の customer_id と name を表示してください。', answer: 'SELECT c.customer_id, c.name FROM customers c LEFT JOIN orders o ON o.customer_id = c.customer_id WHERE o.order_id IS NULL;',
      mustInclude: [['left\\s+(outer\\s+)?join', 'LEFT JOIN を使って解いてください']], hints: ['結合相手がいない行は、右側の列がNULLになります。'], explain: 'この「LEFT JOIN + IS NULL」は移行漏れの検出でそのまま使う形です。' },
    { id: 'e4', type: 'write', title: '3テーブル結合', prompt: '注文 1009 の明細について order_id、line_no、product_name、quantity を表示してください。', answer: 'SELECT i.order_id, i.line_no, p.product_name, i.quantity FROM order_items i JOIN products p ON p.product_id = i.product_id WHERE i.order_id = 1009;',
      hints: ['order_items と products を product_id で結合。'], explain: '明細と商品マスタの結合は、移行後の目視確認でよく使います。' },
    { id: 'e5', type: 'fix', title: '結合による重複を修正', prompt: '顧客ごとの注文金額（total_amount）の合計を出したいのに、明細の多い顧客の金額が大きくなりすぎます。正しい合計（name と合計）になるよう修正してください。',
      starter: 'SELECT c.name, SUM(o.total_amount)\nFROM customers c\nJOIN orders o ON c.customer_id = o.customer_id\nJOIN order_items i ON o.order_id = i.order_id\nGROUP BY c.name;', answer: 'SELECT c.name, SUM(o.total_amount) FROM customers c JOIN orders o ON c.customer_id = o.customer_id GROUP BY c.name;',
      hints: ['合計に明細（order_items）は必要ですか？', '1注文に明細が2行あると、注文金額が2回足されます。'], explain: '集計に不要なテーブルを結合すると行が増えて合計が狂います。検証SQLでは特に注意。' },
    { id: 'e6', type: 'investigate', title: '結合漏れ（孤立データ）の検出', prompt: '旧注文（legacy_orders）のうち、旧顧客（legacy_customers）に存在しない顧客番号（cust_no）を持つ注文の ord_no と cust_no を表示してください。', answer: 'SELECT o.ord_no, o.cust_no FROM legacy_orders o LEFT JOIN legacy_customers c ON c.cust_no = o.cust_no WHERE c.cust_no IS NULL;',
      hints: ['legacy_orders を左にして LEFT JOIN。'], explain: '参照先が存在しない「孤立データ」は外部キーのある新システムには入れられません。移行対象外にするか、業務担当者に確認します。' },
    { id: 'e7', type: 'choice', title: 'FULL OUTER JOIN の使いどころ', prompt: '移行元と移行先の両方の「片方にしかないデータ」を1つのSQLで一覧したい。最適なJOINは？', options: ['INNER JOIN', 'LEFT JOIN', 'FULL OUTER JOIN', 'CROSS JOIN'], answerIndex: 2,
      hints: ['両側を全部残したい。'], explain: 'FULL OUTER JOIN で両側を残し、どちらかのキーが NULL の行を選べば「移行漏れ」と「余分なデータ」を同時に見つけられます。' },
  ],
  mistakes: ['ON の条件を書き忘れて直積（全組み合わせ）になる', 'LEFT JOIN の右テーブル条件を WHERE に書いて INNER JOIN と同じ結果にしてしまう（ON に書く）', '1対多の結合後に SUM して重複計上'],
  errorChecks: ['column reference is ambiguous → テーブル別名.列名 で指定', '結果が異常に多い → 結合条件の不足・1対多の重複を疑う'],
  practice: ['結合前後で件数を確認する習慣を（COUNT(*)）。', '移行のキー変換（旧番号→新ID）は JOIN で行い、変換できなかった行を必ず別途数えます。'],
  quiz: [
    { q: 'LEFT JOIN で右側に一致がない行の右側の列は？', options: ['0', "''", 'NULL'], answer: 2, explain: 'NULLになります。' },
    { q: 'LEFT JOIN b ON ... WHERE b.status = \'X\' と書くと？', options: ['LEFT JOINのまま', '実質 INNER JOIN と同じ結果になる'], answer: 1, explain: 'b がNULLの行は WHERE で落ちます。右側の条件は ON に書きます。' },
  ],
},
// ------------------------------------------------------------------
{
  id: 'ch09', level: 2, chapter: 9, title: 'サブクエリ', difficulty: 3, minutes: 60, prereq: ['ch08'], dataset: 'base',
  summary: '単一値・複数行のサブクエリ、EXISTS / NOT EXISTS、IN との使い分け',
  goal: 'SQLの中にSQLを書いて条件や値に使える。NOT IN の落とし穴を避け、NOT EXISTS を使える。',
  usage: '「移行先にまだ存在しない行だけ INSERT する」（再実行対策）は NOT EXISTS の代表的な使い方です。',
  terms: [['サブクエリ', 'かっこ内に書いた別のSELECT'], ['スカラーサブクエリ', '1行1列（1つの値）を返すサブクエリ'], ['EXISTS', 'サブクエリが1行でも返せば真'], ['NOT EXISTS', '1行も返さなければ真（存在しないことの確認）'], ['相関サブクエリ', '外側の行の値を使うサブクエリ']],
  syntax: 'SELECT ... WHERE 列 > (SELECT AVG(列) FROM ...);\nSELECT ... WHERE 列 IN (SELECT 列 FROM ...);\nSELECT ... FROM a WHERE NOT EXISTS (SELECT 1 FROM b WHERE b.key = a.key);',
  examples: [
    { title: '最も新しい注文日の注文', sql: 'SELECT order_id, order_date FROM orders\nWHERE order_date = (SELECT MAX(order_date) FROM orders);' },
    { title: 'EXISTS：注文したことがある顧客', sql: 'SELECT c.customer_id, c.name FROM customers c\nWHERE EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.customer_id)\nORDER BY c.customer_id;' },
  ],
  explanation: `**NOT IN の落とし穴**: \`x NOT IN (1, 2, NULL)\` は、x が 1 でも 2 でもなくても「NULLと等しくないか不明」になり、**結果は0件**になります。サブクエリの結果にNULLが混ざる可能性があるときは **NOT EXISTS** を使いましょう。

**IN と EXISTS の使い分け**
- 値のリストと比べる・サブクエリの結果が小さい → IN が読みやすい
- 「存在するか」を確かめる・NULLが混ざる可能性 → EXISTS / NOT EXISTS が安全
- 最近のPostgreSQLでは性能差は小さいことが多いですが、実行計画で確認します（第21章）`,
  exercises: [
    { id: 'e1', type: 'write', title: '単一値のサブクエリ', prompt: '平均価格より高い商品の product_name と price を表示してください。', answer: 'SELECT product_name, price FROM products WHERE price > (SELECT AVG(price) FROM products);',
      hints: ['WHERE price > (SELECT AVG(price) FROM products)'], explain: 'サブクエリの平均（40542円）と比較しています。' },
    { id: 'e2', type: 'write', title: 'IN', prompt: '一度でも注文したことがある顧客の name を表示してください（IN を使用）。', answer: 'SELECT name FROM customers WHERE customer_id IN (SELECT customer_id FROM orders);', mustInclude: [['\\bin\\s*\\(\\s*select', 'IN (SELECT ...) を使って解いてください']],
      hints: ['customer_id IN (SELECT customer_id FROM orders)'], explain: 'JOINで書くと重複が出るため DISTINCT が必要になりますが、IN なら重複しません。' },
    { id: 'e3', type: 'write', title: 'NOT EXISTS', prompt: '一度も注文明細（order_items）に登場していない商品の product_id と product_name を NOT EXISTS で表示してください。', answer: 'SELECT p.product_id, p.product_name FROM products p WHERE NOT EXISTS (SELECT 1 FROM order_items i WHERE i.product_id = p.product_id);', mustInclude: [['not\\s+exists', 'NOT EXISTS を使って解いてください']],
      hints: ['外側の p.product_id を内側で使います（相関サブクエリ）。'], explain: 'SELECT 1 の「1」に意味はありません。行が存在するかだけを見ています。' },
    { id: 'e4', type: 'fix', title: '複数行サブクエリの誤り', prompt: '受付中（NEW）の注文をしている顧客名を出したいのですが、エラーになります。修正してください。',
      starter: "SELECT name FROM customers\nWHERE customer_id = (SELECT customer_id FROM orders WHERE status = 'NEW');", answer: "SELECT name FROM customers WHERE customer_id IN (SELECT customer_id FROM orders WHERE status = 'NEW');",
      hints: ['サブクエリが複数行を返すときは = ではなく…'], explain: 'NEWの注文は3件あるため、= では比較できません（more than one row returned by a subquery）。IN を使います。' },
    { id: 'e5', type: 'predict', title: 'NOT IN と NULL', prompt: '次のSQLの結果（件数）は？（商品は10件）', predictSql: 'SELECT COUNT(*) FROM products WHERE product_id NOT IN (2, 5, NULL);', options: ['8', '7', '0', '10'], answerIndex: 2,
      hints: ['NULL と「等しくない」は真？偽？'], explain: '候補にNULLがあると、どの行も「不明」になり0件です。移行の重複チェックで NOT IN を使うと、検出漏れの原因になります。' },
  ],
  mistakes: ['= に複数行サブクエリを使う', 'NOT IN に NULL が含まれる', '相関サブクエリで外側の別名を付け忘れて、意図しない列を参照する'],
  errorChecks: ['more than one row returned by a subquery → IN を使う／条件で1行に絞る', '結果が0件 → NOT IN と NULL を疑う'],
  practice: ['INSERT ... SELECT ... WHERE NOT EXISTS (移行先に既にあるか) は、再実行しても重複しない移行SQLの基本形です（第17章）。'],
  quiz: [
    { q: 'EXISTS (SELECT 1 ...) の「1」は？', options: ['1件だけ取る意味', '特に意味はない（存在確認だけ）'], answer: 1, explain: '何をSELECTしても結果は同じです。' },
    { q: 'サブクエリにNULLが混ざりうるとき、「存在しない」の判定に安全なのは？', options: ['NOT IN', 'NOT EXISTS'], answer: 1, explain: 'NOT EXISTS はNULLの影響を受けません。' },
  ],
},
// ------------------------------------------------------------------
{
  id: 'ch10', level: 2, chapter: 10, title: 'CASE WHEN：条件分岐と値の変換', difficulty: 2, minutes: 50, prereq: ['ch08'], dataset: 'base',
  summary: '条件分岐、値・コード体系・ステータスの変換、CASEと集計',
  goal: 'CASE式で値を変換でき、コードマスタとのJOINによる変換との違いを説明できる。',
  usage: '旧システムのステータス「1/2/9」を新システムの「ACTIVE/INACTIVE」に変換するなど、データ変換の中心です。',
  terms: [['CASE式', '条件に応じて値を返す式。上から順に評価し、最初に当てはまったものを返す'], ['ELSE', 'どれにも当てはまらないときの値。省略するとNULL'], ['コードマスタ', '旧コードと新コードの対応表（このDBでは code_master）']],
  syntax: "CASE\n  WHEN 条件1 THEN 値1\n  WHEN 条件2 THEN 値2\n  ELSE 値3\nEND\n\nCASE 列 WHEN 'A' THEN 'x' WHEN 'B' THEN 'y' END  -- 単純CASE",
  examples: [
    { title: '在庫の状態を表示', sql: "SELECT product_name, stock,\n  CASE WHEN stock = 0 THEN '在庫切れ'\n       WHEN stock < 10 THEN '残りわずか'\n       ELSE '在庫あり' END AS 在庫状況\nFROM products ORDER BY stock;" },
    { title: 'コードマスタで変換（JOIN方式）', sql: "SELECT l.cust_no, l.sts_kbn, m.new_code, m.label\nFROM legacy_customers l\nLEFT JOIN code_master m ON m.code_type = 'CUST_STATUS' AND m.old_code = l.sts_kbn\nORDER BY l.cust_no LIMIT 8;" },
  ],
  explanation: `**CASE方式 と コードマスタ（JOIN）方式**
- CASE: SQLの中に変換ルールを直接書く。少数の固定的な変換向き
- JOIN: 対応表で変換。コードが多い・業務側がメンテする場合に向く。**LEFT JOIN** にして、変換できなかった（未知の）コードを NULL として検出できるようにするのがコツ

CASE は **上から順に** 評価されます。広い条件（price >= 10000）を先に書くと、狭い条件（price >= 50000）に到達しません。

ELSE を書かないと NULL になります。移行では「想定外の値」を見逃さないよう、ELSE で '★不明' などの目印を付けて調査することもあります。`,
  exercises: [
    { id: 'e1', type: 'write', title: '価格帯に分類', prompt: "商品の product_name と、price_band（10000円未満 '低'、50000円未満 '中'、それ以外 '高'）を表示してください。", answer: "SELECT product_name, CASE WHEN price < 10000 THEN '低' WHEN price < 50000 THEN '中' ELSE '高' END AS price_band FROM products;",
      hints: ['小さい方の条件から順に書くと簡単です。'], explain: 'CASE は最初に真になった WHEN の値を返します。' },
    { id: 'e2', type: 'write', title: 'ステータスコードの変換（CASE）', prompt: "旧顧客（legacy_customers）の cust_no と、sts_kbn を新コードに変換した値（'1'→'ACTIVE'、'2'→'INACTIVE'、'3'→'SUSPENDED'、それ以外はNULL）を表示してください。", answer: "SELECT cust_no, CASE sts_kbn WHEN '1' THEN 'ACTIVE' WHEN '2' THEN 'INACTIVE' WHEN '3' THEN 'SUSPENDED' END FROM legacy_customers;",
      hints: ["sts_kbn は文字型なので '1' のようにクォートします。"], explain: 'ELSE を省略すると NULL。退会(9)は NULL になります。' },
    { id: 'e3', type: 'write', title: 'コードマスタで変換', prompt: "旧注文（legacy_orders）の ord_no、ord_sts と、code_master（code_type = 'ORDER_STATUS'）で変換した new_code を表示してください。**変換できない注文も表示**すること。", answer: "SELECT o.ord_no, o.ord_sts, m.new_code FROM legacy_orders o LEFT JOIN code_master m ON m.code_type = 'ORDER_STATUS' AND m.old_code = o.ord_sts;",
      hints: ['変換できない行も残すので LEFT JOIN。', "code_type の条件は ON に書きます。"], explain: "ord_sts = '99' は対応表にないので new_code が NULL になります。未知コードの検出にそのまま使えます。" },
    { id: 'e4', type: 'write', title: 'CASE と集計', prompt: '注文を1行で集計してください: completed_count（COMPLETED の件数）、cancelled_count（CANCELLED の件数）、other_count（それ以外）。', answer: "SELECT COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) AS completed_count, COUNT(CASE WHEN status = 'CANCELLED' THEN 1 END) AS cancelled_count, COUNT(CASE WHEN status NOT IN ('COMPLETED','CANCELLED') THEN 1 END) AS other_count FROM orders;",
      hints: ['COUNT(CASE WHEN 条件 THEN 1 END) は条件に合う行だけ数えます。', 'SUM(CASE WHEN 条件 THEN 1 ELSE 0 END) でも同じです。'], explain: 'PostgreSQLでは COUNT(*) FILTER (WHERE 条件) とも書けます。' },
    { id: 'e5', type: 'fix', title: 'CASEの順番を修正', prompt: "50000円以上を '高'、10000円以上を '中'、それ以外を '低' にしたいのに、'高' が1件も出ません。修正してください（列: product_name, price_band）。",
      starter: "SELECT product_name,\n  CASE WHEN price >= 10000 THEN '中'\n       WHEN price >= 50000 THEN '高'\n       ELSE '低' END AS price_band\nFROM products;", answer: "SELECT product_name, CASE WHEN price >= 50000 THEN '高' WHEN price >= 10000 THEN '中' ELSE '低' END AS price_band FROM products;",
      hints: ['158000円は最初の WHEN で何になりますか？'], explain: '広い条件を先に書くと、後ろの条件に到達しません。' },
  ],
  mistakes: ['WHEN の順番ミス', 'ELSE の書き忘れで想定外の値がNULLになるのに気づかない', 'コードマスタを INNER JOIN して未知コードの行を黙って落とす'],
  errorChecks: ['CASE types text and integer cannot be matched → すべての THEN/ELSE を同じ型に', 'invalid input syntax → 数値列と文字列コードを比較していないか'],
  practice: ['変換後に「新コード別件数」と「旧コード別件数」を突き合わせると変換漏れが分かります。', '変換ルールはマッピング仕様書に記載し、業務担当者の承認を得ます（第16章）。'],
  quiz: [
    { q: 'CASE で ELSE を省略して、どれにも当てはまらないと？', options: ['エラー', "''", 'NULL'], answer: 2, explain: 'NULLになります。' },
    { q: '未知のコードを検出しやすいのは？', options: ['INNER JOIN で変換', 'LEFT JOIN で変換して NULL を探す'], answer: 1, explain: 'LEFT JOIN なら変換できない行も残ります。' },
  ],
},
// ------------------------------------------------------------------
{
  id: 'ch11', level: 2, chapter: 11, title: 'NULLとデータ品質', difficulty: 3, minutes: 70, prereq: ['ch10'], dataset: 'base',
  summary: 'COALESCE / NULLIF / IS DISTINCT FROM、欠損・重複・異常値の調査',
  goal: 'NULLを安全に扱い、欠損値・重複・異常値を調査するSQLを書ける。',
  usage: '移行前のデータ品質調査（プロファイリング）は、移行の成否を左右します。「想定外のデータ」を移行前に見つけるのが仕事です。',
  terms: [['COALESCE(a, b, ...)', '最初の NULL でない値を返す'], ['NULLIF(a, b)', 'a = b なら NULL、違えば a を返す（空文字→NULL変換に便利）'], ['IS DISTINCT FROM', 'NULLも値として比較する「等しくない」'], ['trim / lower', '前後の空白除去 / 小文字化（重複判定の前処理）'], ['正規表現 ~', "パターン一致。'^[0-9]+$' は「数字だけ」"]],
  syntax: "COALESCE(phone, '未登録')\nNULLIF(phone, '')\na IS DISTINCT FROM b\n値 ~ '^[0-9]+$'",
  examples: [
    { title: 'NULLの比較の違い', sql: "SELECT NULL = NULL AS eq, NULL IS NULL AS is_null,\n       NULL IS DISTINCT FROM NULL AS dist, 1 IS DISTINCT FROM NULL AS dist2;" },
    { title: '旧顧客メールの正規化前後', sql: "SELECT cust_no, '[' || mail_addr || ']' AS raw, lower(trim(mail_addr)) AS normalized\nFROM legacy_customers\nWHERE cust_no IN ('C0006','C0015','C0004');" },
  ],
  explanation: `**NULLの性質**: NULL を含む比較・計算の結果は NULL（不明）です。\`NULL = NULL\` も NULL。

**データ品質調査の定番パターン**
1. 欠損: \`COUNT(*) - COUNT(列)\`、空文字は \`COUNT(CASE WHEN 列 = '' THEN 1 END)\`
2. 重複: \`GROUP BY 正規化した値 HAVING COUNT(*) > 1\`
3. 異常値: 型に合わない文字列（正規表現）、範囲外の値（マイナス、未来日付）
4. 参照整合性: 参照先が存在しない値（第8章）

正規化（lower, trim）をしてから比較しないと、'ABC@x.com' と ' abc@x.com ' を別人と判定してしまいます。`,
  exercises: [
    { id: 'e1', type: 'write', title: 'COALESCE と NULLIF', prompt: "顧客の customer_id と、phone_display（電話番号。NULL **または空文字** のときは '未登録'）を表示してください。", answer: "SELECT customer_id, COALESCE(NULLIF(phone, ''), '未登録') AS phone_display FROM customers;",
      hints: ["NULLIF(phone, '') で空文字をNULLにしてから COALESCE。"], explain: "COALESCE(phone, '未登録') だけでは空文字が残ります。" },
    { id: 'e2', type: 'write', title: 'IS DISTINCT FROM', prompt: "都道府県が東京都**以外**の顧客（都道府県がNULLの顧客も含む）の customer_id を、IS DISTINCT FROM で表示してください。", answer: "SELECT customer_id FROM customers WHERE prefecture IS DISTINCT FROM '東京都';", mustInclude: [['is\\s+distinct\\s+from', 'IS DISTINCT FROM を使って解いてください']],
      hints: ['<> では NULL の行が漏れます。'], explain: '11件になります。移行前後の値比較（変更検出）では IS DISTINCT FROM が必須です。' },
    { id: 'e3', type: 'investigate', title: '欠損値の調査', prompt: "旧顧客（legacy_customers）について、値が「NULLまたは空文字」の件数を1行で表示してください。列: mail_missing（mail_addr）、tel_missing（tel_no）、pref_missing（pref_cd）、point_missing（point_bal）。", answer: "SELECT COUNT(*) FILTER (WHERE mail_addr IS NULL OR mail_addr = '') AS mail_missing, COUNT(*) FILTER (WHERE tel_no IS NULL OR tel_no = '') AS tel_missing, COUNT(*) FILTER (WHERE pref_cd IS NULL OR pref_cd = '') AS pref_missing, COUNT(*) FILTER (WHERE point_bal IS NULL OR point_bal = '') AS point_missing FROM legacy_customers;",
      hints: ["COUNT(CASE WHEN 列 IS NULL OR 列 = '' THEN 1 END)", 'FILTER (WHERE ...) も使えます。'], explain: '欠損の件数は移行仕様（欠損時にどうするか）を決める材料になります。' },
    { id: 'e4', type: 'investigate', title: '重複データの調査', prompt: '旧顧客で、メールアドレス（**前後の空白を除き小文字にした値**）が重複しているものを、mail と件数 cnt で表示してください。', answer: 'SELECT lower(trim(mail_addr)) AS mail, COUNT(*) AS cnt FROM legacy_customers GROUP BY lower(trim(mail_addr)) HAVING COUNT(*) > 1;',
      hints: ['GROUP BY lower(trim(mail_addr)) HAVING COUNT(*) > 1'], explain: 'C0008 と C0016 が同一人物の可能性があります。どちらを残すかは業務ルールで決めます（第14章）。' },
    { id: 'e5', type: 'investigate', title: '異常値の調査', prompt: "旧顧客のポイント（point_bal）が「0以上の整数として正しくない」行の cust_no と point_bal を表示してください（数字以外を含む、空文字、マイナスなど）。", answer: "SELECT cust_no, point_bal FROM legacy_customers WHERE NOT (point_bal ~ '^[0-9]+$');",
      hints: ["正しい値のパターン: '^[0-9]+$'（数字が1文字以上だけ）", 'NOT (...) で反転。NULLがある場合は OR point_bal IS NULL も必要です。'], explain: "空文字・'1,500'・'abc'・'-100' の4件。カンマ付きは変換すれば救えるかもしれない、など値ごとに対応を検討します。" },
    { id: 'e6', type: 'choice', title: 'NULLの比較', prompt: 'SELECT NULL = NULL; の結果は？', options: ['true', 'false', 'NULL（不明）', 'エラー'], answerIndex: 2,
      hints: ['例1を実行してみましょう。'], explain: 'NULL同士の比較も NULL です。NULLを等しいとみなしたいときは IS NOT DISTINCT FROM。' },
  ],
  mistakes: ['空文字を欠損として数え忘れる', '正規化せずに重複を数える', 'COALESCE で欠損を隠してしまい、品質問題が見えなくなる'],
  errorChecks: ['invalid regular expression → 正規表現の書き方（\\ や [ ] の閉じ忘れ）', '件数が合わない → NULLと空文字の両方を条件に入れたか'],
  practice: ['調査結果は「列ごとの欠損件数・重複件数・異常値の例」として表にまとめ、業務担当者に対応方針を確認します。', '異常値を勝手に修正しないこと。修正ルールは合意してから。'],
  quiz: [
    { q: "NULLIF('', '') の結果は？", options: ["''", 'NULL'], answer: 1, explain: '2つが等しいので NULL。' },
    { q: "'A' IS DISTINCT FROM NULL は？", options: ['true', 'false', 'NULL'], answer: 0, explain: 'NULLを値として扱うので true。' },
  ],
},
// ------------------------------------------------------------------
{
  id: 'ch12', level: 2, chapter: 12, title: 'CTEとウィンドウ関数', difficulty: 3, minutes: 70, prereq: ['ch11'], dataset: 'base',
  summary: 'WITH句、ROW_NUMBER / RANK / LAG / LEAD / PARTITION BY、重複検出と最新レコード抽出',
  goal: '複雑なSQLをWITH句で分割でき、ウィンドウ関数で順位付け・重複検出・最新行の抽出ができる。',
  usage: '「同一顧客が複数いたら最新の1件だけ移行」「履歴テーブルから最新状態を取り出す」は移行の頻出パターンです。',
  terms: [['CTE（WITH句）', 'SQLの中で名前を付けた一時的な結果。段階的に処理を書ける'], ['ウィンドウ関数', '行をまとめずに、グループ内での順位・前後の値などを計算'], ['PARTITION BY', 'ウィンドウ関数のグループ分け'], ['ROW_NUMBER', 'グループ内の連番（同順位なし）'], ['RANK', '同じ値は同順位、次は飛ぶ（1,1,3）'], ['LAG / LEAD', '前の行 / 次の行の値']],
  syntax: 'WITH 名前 AS (\n  SELECT ...\n)\nSELECT ... FROM 名前;\n\nROW_NUMBER() OVER (PARTITION BY グループ列 ORDER BY 並び列 DESC)',
  examples: [
    { title: 'WITH句：顧客別の売上を出してから絞る', sql: "WITH sales AS (\n  SELECT customer_id, SUM(total_amount) AS total\n  FROM orders WHERE status <> 'CANCELLED'\n  GROUP BY customer_id\n)\nSELECT * FROM sales ORDER BY total DESC LIMIT 3;" },
    { title: 'ROW_NUMBER：顧客ごとの注文に連番', sql: 'SELECT customer_id, order_id, order_date,\n  ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY order_date) AS 何回目\nFROM orders ORDER BY customer_id, order_date;' },
  ],
  explanation: `**GROUP BY との違い**: GROUP BY は行をまとめて1行にします。ウィンドウ関数は **行を残したまま** 計算結果を横に付けます。

**最新レコードの抽出（定番）**
\`\`\`sql
WITH ranked AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY キー ORDER BY 日付 DESC) AS rn
  FROM テーブル
)
SELECT * FROM ranked WHERE rn = 1;
\`\`\`
ウィンドウ関数は WHERE に直接書けないので、WITH句（またはサブクエリ）で包んでから絞ります。

**重複の検出**: 同じキーで rn > 1 の行が「重複（2件目以降）」です。`,
  exercises: [
    { id: 'e1', type: 'write', title: 'WITH句', prompt: "WITH句を使い、キャンセルを除く注文金額の顧客別合計を求め、合計が **100000より大きい** 顧客の customer_id と total を表示してください。", answer: "WITH t AS (SELECT customer_id, SUM(total_amount) AS total FROM orders WHERE status <> 'CANCELLED' GROUP BY customer_id) SELECT customer_id, total FROM t WHERE total > 100000;", mustInclude: [['^\\s*with\\b', 'WITH句を使って解いてください']],
      hints: ['HAVING でも書けますが、ここでは WITH で。'], explain: '段階に分けて書くと、各段階を単独で実行して確認できるのが利点です。' },
    { id: 'e2', type: 'write', title: '最新レコードの抽出', prompt: '各顧客の **最新の注文**（order_date が最も新しい）の customer_id、order_id、order_date を表示してください。', answer: 'WITH r AS (SELECT customer_id, order_id, order_date, ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY order_date DESC) AS rn FROM orders) SELECT customer_id, order_id, order_date FROM r WHERE rn = 1;',
      hints: ['ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY order_date DESC)', 'rn = 1 の行が最新です。'], explain: '10人分の10行。PostgreSQL固有の DISTINCT ON でも書けますが、ROW_NUMBER は多くのDBで使えます。' },
    { id: 'e3', type: 'write', title: 'RANK', prompt: 'カテゴリごとに価格の高い順の順位を付け、category、product_name、price、rnk（RANK）を表示してください。', answer: 'SELECT category, product_name, price, RANK() OVER (PARTITION BY category ORDER BY price DESC) AS rnk FROM products;',
      hints: ['RANK() OVER (PARTITION BY category ORDER BY price DESC)'], explain: '同じ価格があれば同順位になります。' },
    { id: 'e4', type: 'write', title: 'LAG', prompt: '顧客1の注文について、order_id、order_date、前回の注文日 prev_date を注文日順に表示してください。', answer: 'SELECT order_id, order_date, LAG(order_date) OVER (ORDER BY order_date) AS prev_date FROM orders WHERE customer_id = 1 ORDER BY order_date;', ordered: true,
      hints: ['LAG(order_date) OVER (ORDER BY order_date)'], explain: '最初の注文の prev_date は NULL です。差分移行や時系列の異常検出に使います。' },
    { id: 'e5', type: 'investigate', title: 'ROW_NUMBERで重複検出', prompt: '旧顧客をメールアドレス（lower(trim(mail_addr))）でグループ化し、登録日（reg_ymd）が古い順に番号を付けたとき、**2番目以降（重複側）** になる顧客の cust_no を表示してください。', answer: 'WITH r AS (SELECT cust_no, ROW_NUMBER() OVER (PARTITION BY lower(trim(mail_addr)) ORDER BY reg_ymd) AS rn FROM legacy_customers) SELECT cust_no FROM r WHERE rn > 1;',
      hints: ['PARTITION BY lower(trim(mail_addr)) ORDER BY reg_ymd'], explain: 'C0016 が重複側です。「古い方を残す」か「新しい方を残す」かは業務ルールで決めます。' },
  ],
  mistakes: ['ウィンドウ関数を WHERE に書く（エラー）', 'ROW_NUMBER の ORDER BY に同じ値があり、どちらが1になるか不定（タイブレークに主キーを追加）', 'RANK と ROW_NUMBER の取り違え'],
  errorChecks: ['window functions are not allowed in WHERE → WITH句で包む', 'column "rn" does not exist → 別名は同じSELECTのWHEREで使えない'],
  practice: ['重複排除のルール（どれを残すか）は、必ずタイブレーク（同点時の決め方）まで仕様化します。例: 登録日が古い順、同じなら顧客番号の小さい順。'],
  quiz: [
    { q: 'RANK で 100, 100, 90 の順位は？', options: ['1,2,3', '1,1,2', '1,1,3'], answer: 2, explain: 'RANKは同順位の後を飛ばします（DENSE_RANKなら1,1,2）。' },
    { q: 'ウィンドウ関数の結果で絞るには？', options: ['WHERE に直接書く', 'WITH句やサブクエリで包んで外側でWHERE'], answer: 1, explain: 'ウィンドウ関数はWHEREの後に計算されるためです。' },
  ],
},
// ------------------------------------------------------------------
{
  id: 'ch13', level: 2, chapter: 13, title: '日付・文字列・数値の処理', difficulty: 3, minutes: 70, prereq: ['ch11'], dataset: 'base',
  summary: 'CAST・型変換、日付変換、文字列操作、数値変換、タイムゾーン、変換できない値への対応',
  goal: '文字列で保存された日付・金額を安全に型変換し、変換できない値を検出・除外できる。',
  usage: '旧システムの「20240401」「1,200」のような文字列を、新システムの date / numeric 型へ変換するのは移行の中心作業です。',
  terms: [['CAST(値 AS 型) / 値::型', '型変換'], ['to_date(文字列, 書式)', "書式を指定して日付に変換。'YYYYMMDD' など"], ['to_char(値, 書式)', '日付・数値を書式付き文字列に'], ['regexp_replace', '正規表現で置換。カンマや記号の除去に使う'], ['pg_input_is_valid(値, 型)', '値がその型として正しいか（エラーを出さずに）判定（PostgreSQL 16以降）'], ['timestamptz', 'タイムゾーン付き日時。AT TIME ZONE で地域の時刻に変換']],
  syntax: "CAST('2024-04-01' AS date)\n'1200'::integer\nto_date('20240401', 'YYYYMMDD')\nto_char(order_date, 'YYYY-MM')\nregexp_replace('1,200', '[^0-9]', '', 'g')\npg_input_is_valid('20210631', 'date')",
  examples: [
    { title: 'いろいろな変換', sql: "SELECT '20240401'::date AS d1,\n       to_char(date '2024-04-01', 'YYYY年MM月DD日') AS d2,\n       '1,200'::text AS raw, replace('1,200', ',', '')::integer AS num,\n       length('佐藤 花子') AS len, substr('C0012', 2)::integer AS no;" },
    { title: '変換できるかを事前に判定', sql: "SELECT cust_no, reg_ymd, pg_input_is_valid(reg_ymd, 'date') AS ok_date,\n       point_bal, pg_input_is_valid(point_bal, 'integer') AS ok_int\nFROM legacy_customers ORDER BY cust_no;" },
    { title: 'タイムゾーン：UTCの日時を日本時間で表示', sql: "SELECT timestamptz '2024-04-01 00:00:00+00' AT TIME ZONE 'Asia/Tokyo' AS jst;" },
  ],
  explanation: `**変換できない値への対応（3つの選択肢）**
1. 除外する（WHERE で変換可能な行だけ）→ 除外した行は必ず記録
2. 補正する（カンマ・円記号を除去してから変換）→ 補正ルールを仕様化
3. NULL や既定値にする（CASE WHEN 変換可能 THEN 変換 ELSE NULL END）

**1行でも変換できない値があると、SQL全体がエラーで止まります**。大量データの移行で最後の1行で失敗…を防ぐため、事前に検出しましょう。

**日付の注意**
- '20210631'（6月31日）は存在しない日付 → date への変換はエラー
- '2022/03/10' のように形式が違う値も混ざる → 形式チェック（正規表現）と妥当性チェック（pg_input_is_valid）を分けて考える

**タイムゾーン**: 旧システムが日本時間で保存、新システムがUTCで保存、のように基準が違うと9時間ずれます。日付の境界（深夜0時〜9時）の注文が前日扱いになる不具合が典型です。`,
  exercises: [
    { id: 'e1', type: 'write', title: '文字列の結合', prompt: "商品の表示用文字列 label を作ってください。形式: 商品名 || '：' || 価格 || '円'（例: ワイヤレスマウス：2980円）。列は product_id と label。", answer: "SELECT product_id, product_name || '：' || price || '円' AS label FROM products;",
      hints: ['|| で文字列をつなぎます。数値は自動で文字列になります。'], explain: 'concat() 関数でも書けます。concat は NULL を空文字として扱う点が || と違います。' },
    { id: 'e2', type: 'write', title: '日付の書式と月別集計', prompt: "注文を月別（to_char(order_date, 'YYYY-MM') AS ym）に集計し、ym と件数を ym の昇順で表示してください。", answer: "SELECT to_char(order_date, 'YYYY-MM') AS ym, COUNT(*) FROM orders GROUP BY ym ORDER BY ym;", ordered: true,
      hints: ["to_char(order_date, 'YYYY-MM')"], explain: 'date_trunc(\'month\', order_date) でも月単位にまとめられます。' },
    { id: 'e3', type: 'investigate', title: '存在しない日付の検出', prompt: "旧顧客の登録日 reg_ymd のうち、**日付として正しくない** 値を持つ行の cust_no と reg_ymd を表示してください（pg_input_is_valid を使用）。", answer: "SELECT cust_no, reg_ymd FROM legacy_customers WHERE NOT pg_input_is_valid(reg_ymd, 'date');",
      hints: ["pg_input_is_valid(reg_ymd, 'date') が false の行"], explain: "C0014 の '20210631' が該当。'2022/03/10' は日付としては正しく読めますが、形式は仕様と違う（形式チェックは正規表現 '^[0-9]{8}$' で別途）。" },
    { id: 'e4', type: 'write', title: '金額文字列を数値に', prompt: "旧注文の ord_no と amount_num を表示してください。amount_num は amt_txt から **カンマと円記号（¥）を除去** し、数字だけになった値は numeric に変換、それ以外（'N/A'、空文字など）は NULL とします。", answer: "SELECT ord_no, CASE WHEN regexp_replace(amt_txt, '[,¥]', '', 'g') ~ '^[0-9]+$' THEN regexp_replace(amt_txt, '[,¥]', '', 'g')::numeric END AS amount_num FROM legacy_orders;",
      hints: ["regexp_replace(amt_txt, '[,¥]', '', 'g') で除去", "CASE WHEN 除去後 ~ '^[0-9]+$' THEN 除去後::numeric END"], explain: '変換可否を判定してから CAST するので、1行もエラーになりません。' },
    { id: 'e5', type: 'write', title: 'タイムゾーン変換', prompt: "UTCの日時 '2024-12-31 15:30:00+00' を日本時間（Asia/Tokyo）の日時に変換し、列名 jst で表示してください。", answer: "SELECT timestamptz '2024-12-31 15:30:00+00' AT TIME ZONE 'Asia/Tokyo' AS jst;", checkNames: true,
      hints: ["timestamptz '...' AT TIME ZONE 'Asia/Tokyo'"], explain: 'UTC 15:30 は日本時間では翌日 0:30 です。日付が変わる点に注意。' },
    { id: 'e6', type: 'choice', title: '変換エラーへの対応', prompt: "10万件の移行SQLで、99,999件目の金額が 'N/A' だったため CAST エラーで全体が失敗しました。再発防止として最も適切なのは？",
      options: ['エラーが出た行を手で直して再実行を繰り返す', '移行前に変換できない値を検出し、除外・補正ルールを決めてから、変換可能かを判定するSQLにする', '金額列を移行先でも文字列型にする', 'エラーを無視する設定にする'], answerIndex: 1,
      hints: ['移行前の調査と、安全な変換式。'], explain: '事前検出 → ルール決定 → 安全な変換 → 除外行の記録、が基本です。' },
  ],
  mistakes: ['変換可否を確認せずに CAST', 'to_date の書式違い（YYYY/MM/DD と YYYYMMDD）', 'タイムゾーンを意識せず日付を比較'],
  errorChecks: ['invalid input syntax for type integer → 数字以外の文字が混ざっている', 'date/time field value out of range → 存在しない日付', 'invalid input syntax for type date → 形式が違う'],
  practice: ['変換ルールは「入力例 → 出力例」の表で仕様書に残すと、レビューしやすくなります。', '金額の端数処理（四捨五入/切り捨て）は業務ルールで決め、round / trunc を使い分けます。'],
  quiz: [
    { q: "'2024-13-01'::date は？", options: ['2025-01-01になる', 'エラーになる', 'NULLになる'], answer: 1, explain: '13月は存在しないためエラー。' },
    { q: '旧:日本時間、新:UTC のとき、日本時間 2024-04-01 08:00 はUTCで？', options: ['2024-04-01 17:00', '2024-03-31 23:00', '2024-04-01 08:00'], answer: 1, explain: '日本時間はUTC+9なので9時間戻します。日付が前日になります。' },
  ],
},
];
