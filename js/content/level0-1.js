// LEVEL 0：データベースの基礎 / LEVEL 1：SQLの基礎
// 各レッスンの構成は docs/CONTENT_GUIDE.md を参照。
export default [
// ------------------------------------------------------------------
{
  id: 'ch01', level: 0, chapter: 1, title: 'データベースとは何か', difficulty: 1, minutes: 30, prereq: [], dataset: 'base',
  summary: 'テーブル・行・列、主キーと外部キー、SQLの種類、DB移行の全体像をつかむ',
  goal: 'データベースとテーブルの基本用語を説明でき、SQLで表の中身を表示できるようになる。DB移行で何をするのかの全体像を知る。',
  usage: '移行案件のキックオフでは「移行元のテーブルは何本？主キーは？」という会話から始まります。用語が分かれば、会議資料やテーブル定義書が読めるようになります。',
  terms: [
    ['データベース（DB）', 'データを整理して保存し、検索・更新できるようにした仕組み。Excelのブックのようなイメージ。'],
    ['テーブル（表）', 'データを入れる表。Excelのシートに近い。例: customers（顧客）'],
    ['行（レコード）', '表の1行＝1件のデータ。例: 顧客1人分。'],
    ['列（カラム）', '表の縦の項目。例: name（氏名）、email（メール）'],
    ['主キー（PRIMARY KEY）', '1行を必ず特定できる列。重複もNULLも禁止。例: customer_id'],
    ['外部キー（FOREIGN KEY）', '別テーブルの主キーを参照する列。例: orders.customer_id は customers.customer_id を参照'],
    ['リレーショナルDB', '複数のテーブルを「キー」でつなげて管理するDB。PostgreSQL, Oracle, MySQL, SQL Server など'],
    ['スキーマ', 'テーブルをまとめる「フォルダ」のようなもの。この練習環境では public を使用'],
    ['SQL', 'DBに命令する言語。DDL（作る）、DML（データ操作）、DQL（検索）、DCL（権限）、TCL（トランザクション）に分類される'],
    ['DB移行', '古いシステムのデータを新しいシステムのDBへ、形を変えながら正しく引っ越す作業'],
  ],
  syntax: 'SELECT 列名, 列名 FROM テーブル名;\nSELECT * FROM テーブル名;   -- * は「すべての列」',
  examples: [
    { title: '顧客テーブルの中身を5件だけ見る', sql: 'SELECT * FROM customers LIMIT 5;' },
    { title: 'この練習DBにあるテーブルの一覧', sql: "SELECT table_name\nFROM information_schema.tables\nWHERE table_schema = 'public'\nORDER BY table_name;" },
  ],
  explanation: `**テーブルは「表」**です。customers テーブルの1行が顧客1人、列が「名前」「メール」などの項目です。

SQLの分類（覚え方：何をする命令か）
- **DDL**（Data Definition Language）: CREATE / ALTER / DROP … 表そのものを作る・変える
- **DML**（Data Manipulation Language）: INSERT / UPDATE / DELETE … データを入れる・変える・消す
- **DQL**（Data Query Language）: SELECT … データを取り出す
- **DCL**（Data Control Language）: GRANT / REVOKE … 権限を与える
- **TCL**（Transaction Control Language）: BEGIN / COMMIT / ROLLBACK … まとめて確定・取り消し

**DB移行で発生する作業**の流れ:
1. 移行元の調査（どんなテーブル・データがあるか、汚れたデータはないか）
2. 移行先の設計（新しい表の形）とデータマッピング（どの列をどの列へ、どう変換するか）
3. 移行SQLの作成とテスト
4. 本番移行（停止時間内に実行）
5. 検証（件数・内容が正しいか）と、問題があれば修正・切り戻し

このアプリでは、旧システムのテーブルに **legacy_** という名前が付いています。`,
  exercises: [
    { id: 'e1', type: 'choice', title: '主キーの性質', prompt: '主キー（PRIMARY KEY）の説明として正しいものはどれですか？',
      options: ['同じ値を何度でも登録できる', '1行を特定するための列で、重複もNULLも許されない', '必ず文字列型でなければならない', '1つのテーブルに何個でも作れる'], answerIndex: 1,
      hints: ['「この人はこの番号」と1人を特定できる列です。'], explain: '主キーは行を一意（ただ1つ）に特定する列です。重複とNULLが禁止されます。1テーブルに主キーは1つ（複数列の組み合わせで1つにすることは可能）。' },
    { id: 'e2', type: 'choice', title: 'SQLの分類', prompt: 'INSERT / UPDATE / DELETE はどの分類ですか？',
      options: ['DDL', 'DML', 'DCL', 'TCL'], answerIndex: 1,
      hints: ['データ（中身）を操作する命令です。'], explain: 'データを操作するのでDML（Data Manipulation Language）です。表そのものを作るCREATEはDDLです。' },
    { id: 'e3', type: 'write', title: '商品テーブルを全件表示', prompt: '商品テーブル **products** のすべての列・すべての行を表示してください。',
      starter: '-- ここにSQLを書いて Ctrl+Enter で実行\n', answer: 'SELECT * FROM products;',
      hints: ['すべての列は * で表します。', 'SELECT * FROM テーブル名; の形です。'], explain: 'SELECT * FROM products; で全列・全行が表示されます。実務では必要な列だけを書くのが基本ですが、まず中身を確認するときは * を使います。' },
    { id: 'e4', type: 'choice', title: 'DB移行の最初の作業', prompt: 'DB移行プロジェクトで、移行SQLを書く前にまずやるべきことはどれですか？',
      options: ['移行先のテーブルを全部削除する', '移行元のテーブル構造とデータの中身を調査する', '本番環境でいきなり移行を実行する', '移行後の検証を省略できるか相談する'], answerIndex: 1,
      hints: ['何があるか分からないものは、正しく運べません。'], explain: '移行元の調査が最初です。データに想定外の値（存在しない日付、重複、NULLなど）がないかを調べてから設計・SQL作成に進みます。' },
  ],
  mistakes: ['テーブル名のスペルミス（customer と customers）', 'SQLの最後の ; の付け忘れ（1文なら動きますが、複数文では必要）', '* を多用して不要な列まで取ってしまう'],
  errorChecks: ['relation "xxx" does not exist → テーブル名を一覧で確認', 'syntax error → SELECT と FROM の順番、カンマを確認'],
  practice: ['本番DBで SELECT * を大きなテーブルに実行すると、大量データで負荷をかけることがあります。LIMIT を付ける習慣を。', '移行案件ではまず「テーブル一覧」「件数」を資料にまとめます。'],
  quiz: [
    { q: '外部キーの役割は？', options: ['行を並び替える', '別テーブルの行を参照し、存在しない値の登録を防ぐ', '検索を速くする', 'パスワードを暗号化する'], answer: 1, explain: '外部キーは「参照先に存在する値しか入れられない」というルールを作ります。' },
    { q: 'COMMIT はどの分類？', options: ['DDL', 'DML', 'TCL', 'DQL'], answer: 2, explain: 'トランザクション制御なのでTCLです。' },
    { q: 'DB移行で「移行後の検証」が必要な理由は？', options: ['SQLがエラーにならなければ正しいとは限らないから', '検証は形式的な作業だから', 'DBの速度を上げるため', '法律で決まっているから'], answer: 0, explain: 'エラーなく実行できても、変換ミスや取りこぼしがあり得ます。件数・内容を比較して確かめます。' },
  ],
},
// ------------------------------------------------------------------
{
  id: 'ch02', level: 0, chapter: 2, title: 'テーブル構造を理解する', difficulty: 1, minutes: 40, prereq: ['ch01'], dataset: 'base',
  summary: 'テーブル定義・データ型・NULLと空文字・制約・インデックス・ER図の読み方',
  goal: 'テーブル定義（列名・型・NULL可否・制約）を読み取り、NULLと空文字の違いを説明できる。',
  usage: '移行では「旧システムの列は文字列だが、新システムでは日付型」といった型の違いが一番の落とし穴です。テーブル定義書を正確に読むことが最初の仕事になります。',
  terms: [
    ['データ型', '列に入れられる値の種類。integer（整数）, numeric（小数も正確に扱う数値）, varchar(n)（最大n文字の文字列）, date（日付）, timestamp（日時）, boolean（真偽）'],
    ['NULL', '「値がない／不明」を表す特別な状態。0でも空文字でもない'],
    ['空文字', "長さ0の文字列 ''。「値はあるが中身が空」"],
    ['制約', 'データのルール。NOT NULL（必須）、UNIQUE（重複禁止）、PRIMARY KEY、FOREIGN KEY、CHECK（条件）'],
    ['インデックス', '本の索引のように検索を速くする仕組み。作りすぎると登録が遅くなる'],
    ['ER図', 'テーブル（Entity）と関係（Relationship）を図にしたもの。線は外部キーのつながり'],
    ['information_schema', 'DB自身の構造（テーブル・列など）を調べるための特別なテーブル群'],
  ],
  syntax: "SELECT column_name, data_type, is_nullable\nFROM information_schema.columns\nWHERE table_name = 'テーブル名'\nORDER BY ordinal_position;",
  examples: [
    { title: 'customers の列定義を調べる', sql: "SELECT column_name, data_type, character_maximum_length, is_nullable\nFROM information_schema.columns\nWHERE table_name = 'customers'\nORDER BY ordinal_position;" },
    { title: 'NULL と 空文字 の違い（顧客2と12の電話番号）', sql: "SELECT customer_id, phone,\n       phone IS NULL AS is_null,\n       phone = ''    AS is_empty\nFROM customers\nWHERE customer_id IN (2, 12);" },
  ],
  explanation: `顧客2の電話は **NULL**（登録されていない）、顧客12の電話は **空文字**（空で登録されている）です。画面ではどちらも空欄に見えますが、DBでは別物です。

- NULL を探すには \`IS NULL\` を使います（\`= NULL\` は使えません）
- 空文字は \`= ''\` で探せます
- NULL に対する \`phone = ''\` の結果は true でも false でもなく **NULL** になります

**ER図の読み方（この練習DB）**
- customers 1 ── 多 orders（1人の顧客が何回も注文）
- orders 1 ── 多 order_items（1注文に複数の明細）
- products 1 ── 多 order_items

構造ビューア（左メニュー）で、主キー🔑・外部キー🔗・インデックスを確認できます。`,
  exercises: [
    { id: 'e1', type: 'write', title: 'orders の列定義', prompt: 'information_schema.columns を使って、**orders** テーブルの列名（column_name）とデータ型（data_type）を、定義順（ordinal_position）に表示してください。',
      starter: "SELECT column_name, data_type\nFROM information_schema.columns\nWHERE \n", answer: "SELECT column_name, data_type\nFROM information_schema.columns\nWHERE table_name = 'orders'\nORDER BY ordinal_position;", ordered: true,
      hints: ["WHERE table_name = 'orders'", 'ORDER BY ordinal_position で定義順に並びます。'], explain: 'information_schema.columns はDBの構造を表すテーブルです。移行元の調査でも同じSQLで列一覧を作れます。' },
    { id: 'e2', type: 'choice', title: 'NULLと空文字', prompt: "電話番号が NULL の顧客と、空文字 '' の顧客の違いとして正しいものは？",
      options: ['どちらも同じ意味で、DB上も区別されない', "NULLは「値がない」、'' は「長さ0の文字列という値がある」。DB上は区別される", "'' は数値の0と同じ", 'NULLは = NULL で検索できる'], answerIndex: 1,
      hints: ['例の2つ目のSQLの結果を見比べてみましょう。'], explain: "NULLと空文字は別物です。移行では旧システムが空文字、新システムがNULLで「未入力」を表すなど、扱いが違うことがよくあります（第11章・シナリオFで練習）。" },
    { id: 'e3', type: 'predict', title: '結果を予測', prompt: '次のSQLの結果（件数）はいくつになるでしょう？予測してから「実行して確認」で確かめましょう。',
      predictSql: 'SELECT COUNT(*) FROM customers WHERE phone IS NULL;', options: ['3', '4', '5', '15'], answerIndex: 1,
      hints: ['空文字の顧客12は NULL ではありません。'], explain: 'phone が NULL なのは顧客2, 5, 9, 14 の4件です。顧客12は空文字なので含まれません。' },
    { id: 'e4', type: 'choice', title: '外部キー', prompt: 'orders.customer_id には customers.customer_id への外部キーがあります。存在しない customer_id=999 で注文をINSERTするとどうなりますか？',
      options: ['自動で顧客999が作られる', 'エラーになり登録できない', 'customer_id が NULL に変換される', '警告だけ出て登録される'], answerIndex: 1,
      hints: ['外部キーは「参照先に存在する値しか入れられない」ルールです。'], explain: '外部キー違反（foreign key constraint）でエラーになります。移行で「親（顧客）を先に、子（注文）を後に」入れる理由です。' },
  ],
  mistakes: ['= NULL で検索してしまう（常に結果0件）', 'varchar の長さを確認せず移行して「value too long」エラー', 'numeric と integer の違いを意識しない（小数点以下が切れる）'],
  errorChecks: ['value too long for type character varying(n) → 列の長さ不足。移行元の最大長を length() で調べる', 'violates not-null constraint → 必須列に値がない'],
  practice: ['テーブル定義書と実際のDBがずれていることはよくあります。必ず information_schema で実物を確認しましょう。', '旧システムでは日付を文字列（varchar）で保存していることが多いです（このアプリの legacy_customers.reg_ymd もそうです）。'],
  quiz: [
    { q: "phone = '' の条件で NULL の行は選ばれる？", options: ['選ばれる', '選ばれない'], answer: 1, explain: "NULLとの比較結果はNULLになり、WHERE では「真」以外は選ばれません。" },
    { q: '金額を扱うのに適した型は？', options: ['varchar', 'numeric', 'boolean', 'date'], answer: 1, explain: 'numeric は小数を誤差なく扱えるため金額に向いています。' },
    { q: 'インデックスを作りすぎるとどうなる？', options: ['何も変わらない', 'INSERT/UPDATEが遅くなる', 'データが消える', '主キーが無効になる'], answer: 1, explain: 'インデックスもデータ更新のたびに更新されるため、書き込みが遅くなります。大量移行では一時的に外すこともあります。' },
  ],
},
// ------------------------------------------------------------------
{
  id: 'ch03', level: 1, chapter: 3, title: 'SELECT：データを取り出す', difficulty: 1, minutes: 40, prereq: ['ch02'], dataset: 'base',
  summary: 'SELECT / FROM / AS / DISTINCT / LIMIT / ORDER BY',
  goal: '必要な列だけを取り出し、別名・重複除外・並び替え・件数制限ができる。',
  usage: '移行元データの確認、移行結果の目視チェック、検証レポート作成など、すべての作業の基本です。',
  terms: [['AS', '列に別名を付ける。例: name AS 氏名'], ['DISTINCT', '重複した行を1つにまとめる'], ['ORDER BY', '並び替え。ASC=昇順（小さい順・既定）、DESC=降順'], ['LIMIT', '表示する最大件数']],
  syntax: 'SELECT [DISTINCT] 列1 [AS 別名], 列2\nFROM テーブル\nORDER BY 列 [ASC|DESC]\nLIMIT 件数;',
  examples: [
    { title: '必要な列だけ・別名付き', sql: 'SELECT name AS 氏名, prefecture AS 都道府県\nFROM customers\nLIMIT 5;' },
    { title: '価格の安い順', sql: 'SELECT product_name, price\nFROM products\nORDER BY price ASC;' },
    { title: 'カテゴリの種類（重複なし）', sql: 'SELECT DISTINCT category FROM products ORDER BY category;' },
  ],
  explanation: `SQLは **SELECT（何を）→ FROM（どこから）→ ORDER BY（どの順で）→ LIMIT（何件）** の順に書きます。

- ORDER BY を書かないと **並び順は保証されません**。検証や比較では必ず ORDER BY を付けましょう。
- DISTINCT は「行全体」の重複をまとめます。NULL も1種類として表示されます。
- 別名に日本語を使う場合、記号や空白を含むときは "ダブルクォート" で囲みます。`,
  exercises: [
    { id: 'e1', type: 'write', title: '列を選ぶ', prompt: '顧客（customers）の **name** と **email** を表示してください（並び順は問いません）。', starter: 'SELECT \nFROM customers;', answer: 'SELECT name, email FROM customers;',
      hints: ['列名はカンマで区切ります。'], explain: '必要な列だけを書くと、結果が見やすく、通信量も減ります。' },
    { id: 'e2', type: 'fill', title: '穴埋め：並び替え', prompt: '商品名と価格を、価格の高い順に表示するSQLを完成させてください。',
      template: 'SELECT product_name, price\n{{FROM}} products\n{{ORDER}} BY price {{DESC}};', answer: 'SELECT product_name, price FROM products ORDER BY price DESC;', ordered: true,
      hints: ['テーブルを指定するキーワードは？', '降順は DESC です。'], explain: 'ORDER BY price DESC で価格の高い順になります。' },
    { id: 'e3', type: 'write', title: '重複を除く', prompt: '顧客が住んでいる **prefecture（都道府県）** の一覧を、重複なしで表示してください。', answer: 'SELECT DISTINCT prefecture FROM customers;',
      hints: ['SELECT の直後に DISTINCT。'], explain: 'NULL（都道府県未登録の顧客6）も1行として表示されます。' },
    { id: 'e4', type: 'fix', title: '誤りを修正', prompt: '登録日が古い顧客3人を表示したいのですが、エラーになります。修正してください。',
      starter: 'SELECT name AS 氏名, registered_at\nFROM customer\nORDER BY registered_at\nLIMIT 3;', answer: 'SELECT name AS 氏名, registered_at FROM customers ORDER BY registered_at LIMIT 3;', ordered: true,
      hints: ['エラーメッセージの relation "customer" に注目。', 'テーブル一覧で正しい名前を確認しましょう。'], explain: 'テーブル名は customers（複数形）です。' },
    { id: 'e5', type: 'write', title: '上位N件', prompt: '価格が高い商品の **上位3件** の product_name と price を、高い順に表示してください。', answer: 'SELECT product_name, price FROM products ORDER BY price DESC LIMIT 3;', ordered: true,
      hints: ['ORDER BY ... DESC と LIMIT を組み合わせます。'], explain: 'LIMIT は ORDER BY の後に書きます。' },
  ],
  mistakes: ['ORDER BY を書かずに「上位3件」を取る（毎回結果が変わり得る）', 'SELECT name, FROM ...（最後のカンマ）', 'DISTINCT を列ごとの重複除外と誤解する（行全体が対象）'],
  errorChecks: ['syntax error at or near "FROM" → 直前のカンマを確認', 'column does not exist → 列名を構造パネルで確認'],
  practice: ['検証用SQLは必ず ORDER BY を付けて、移行元と移行先を同じ順に並べて比較します。', '本番の大きなテーブルを調べるときは LIMIT を付けてから実行しましょう。'],
  quiz: [
    { q: 'ORDER BY を省略したときの並び順は？', options: ['主キー順が保証される', '登録順が保証される', '保証されない'], answer: 2, explain: 'たまたま主キー順に見えても保証はありません。' },
    { q: 'LIMIT 5 の意味は？', options: ['5列だけ表示', '最大5行を表示', '5行目から表示'], answer: 1, explain: '最大5行です。' },
  ],
},
// ------------------------------------------------------------------
{
  id: 'ch04', level: 1, chapter: 4, title: 'WHERE：条件で絞り込む', difficulty: 1, minutes: 50, prereq: ['ch03'], dataset: 'base',
  summary: '比較演算子 / AND / OR / NOT / IN / BETWEEN / LIKE / IS NULL',
  goal: '条件を組み合わせて必要な行だけを取り出せる。NULLを含む条件を正しく書ける。',
  usage: '「移行対象は削除フラグが0の顧客だけ」「2020年以降の注文だけ」のように、移行対象の選別は WHERE で行います。',
  terms: [['比較演算子', '= <> (等しくない) < > <= >='], ['AND / OR / NOT', 'かつ / または / 否定。AND が OR より先に評価される'], ['IN', '候補のどれかに一致'], ['BETWEEN a AND b', 'a以上b以下（両端を含む）'], ['LIKE', "あいまい検索。% は0文字以上、_ は1文字"], ['IS NULL', 'NULLかどうかの判定']],
  syntax: "SELECT 列 FROM テーブル\nWHERE 条件1 AND (条件2 OR 条件3);",
  examples: [
    { title: '大阪府の有効な顧客', sql: "SELECT customer_id, name\nFROM customers\nWHERE prefecture = '大阪府' AND status = 'ACTIVE';" },
    { title: 'IN と BETWEEN', sql: "SELECT order_id, order_date, status\nFROM orders\nWHERE status IN ('NEW', 'SHIPPED')\n  AND order_date BETWEEN '2024-04-01' AND '2024-09-30';" },
    { title: 'LIKE（メールアドレスに「.k@」を含む）', sql: "SELECT name, email FROM customers WHERE email LIKE '%.k@%';" },
  ],
  explanation: `**AND は OR より先に評価**されます。迷ったら ( ) で囲みましょう。

\`\`\`sql
WHERE status = 'ACTIVE' OR status = 'INACTIVE' AND prefecture = '東京都'
-- ↑ これは ACTIVE全員 + (INACTIVEかつ東京都) という意味になる
\`\`\`

**NULLの落とし穴**
- \`phone = NULL\` は常に「不明」となり、1件も選ばれません → \`phone IS NULL\`
- \`prefecture <> '東京都'\` では prefecture が NULL の行は**選ばれません**（NULLとの比較は不明）`,
  exercises: [
    { id: 'e1', type: 'write', title: '等しい', prompt: '東京都（prefecture）の顧客の customer_id と name を表示してください。', answer: "SELECT customer_id, name FROM customers WHERE prefecture = '東京都';",
      hints: ["文字列は 'シングルクォート' で囲みます。"], explain: "WHERE prefecture = '東京都' で絞り込めます。" },
    { id: 'e2', type: 'write', title: 'BETWEEN', prompt: '価格が **3000円以上10000円以下** の商品の product_name と price を表示してください。', answer: 'SELECT product_name, price FROM products WHERE price BETWEEN 3000 AND 10000;',
      hints: ['BETWEEN は両端を含みます。'], explain: 'price >= 3000 AND price <= 10000 と同じ意味です。' },
    { id: 'e3', type: 'fill', title: '穴埋め：LIKE と IN', prompt: "メールが '@example.com' で終わり、ステータスが INACTIVE または SUSPENDED の顧客を表示します。",
      template: "SELECT name, email\nFROM customers\nWHERE email {{LIKE}} '%@example.com'\n  AND status {{IN}} ('INACTIVE', 'SUSPENDED');", answer: "SELECT name, email FROM customers WHERE email LIKE '%@example.com' AND status IN ('INACTIVE','SUSPENDED');",
      hints: ['あいまい検索のキーワードは？', '候補のどれかに一致させるキーワードは？'], explain: 'メールがNULLの顧客4は LIKE の条件で除外されます。' },
    { id: 'e4', type: 'fix', title: 'NULLの検索を修正', prompt: '電話番号が登録されていない（NULLの）顧客を探したいのに、結果が0件になります。修正してください。',
      starter: 'SELECT customer_id, name\nFROM customers\nWHERE phone = NULL;', answer: 'SELECT customer_id, name FROM customers WHERE phone IS NULL;', mustInclude: [['is\\s+null', 'IS NULL を使って判定してください']],
      hints: ['NULL は = で比較できません。'], explain: 'NULL判定は IS NULL です。= NULL は常に「不明」になり、何も選ばれません。' },
    { id: 'e5', type: 'write', title: '未入力をすべて探す', prompt: "電話番号が「未入力」（NULL **または** 空文字 ''）の顧客の customer_id と name を表示してください。", answer: "SELECT customer_id, name FROM customers WHERE phone IS NULL OR phone = '';",
      hints: ['2つの条件を OR でつなぎます。'], explain: "移行元調査では「NULLと空文字の両方」を数えるのが鉄則です。" },
    { id: 'e6', type: 'predict', title: '結果を予測：<> とNULL', prompt: '次のSQLの結果は？（顧客は全15人、東京都は4人、都道府県NULLが1人）', predictSql: "SELECT COUNT(*) FROM customers WHERE prefecture <> '東京都';",
      options: ['11', '10', '15', '4'], answerIndex: 1, hints: ['NULLとの比較は「真」になりません。'], explain: '15 − 4（東京都）− 1（NULL）= 10件。NULLも含めたいなら OR prefecture IS NULL、または IS DISTINCT FROM を使います（第11章）。' },
  ],
  mistakes: ['= NULL と書く', 'AND と OR の優先順位を忘れる', "日付を '2024/1/1' のように曖昧な形式で書く（'YYYY-MM-DD' が安全）"],
  errorChecks: ['結果が0件 → NULLとの比較、大文字小文字、前後の空白を疑う', 'operator does not exist: integer = text → 型が違う。値のクォートを確認'],
  practice: ['DELETE/UPDATE の前には、同じ WHERE で SELECT して対象を確認するのが鉄則です（第6章）。', '移行対象の条件（WHERE）は仕様書に明記し、レビューを受けましょう。'],
  quiz: [
    { q: "LIKE 'C00_1' に一致するのは？", options: ['C0011', 'C001', 'C00011'], answer: 0, explain: '_ はちょうど1文字です。' },
    { q: 'BETWEEN 1 AND 10 に 10 は含まれる？', options: ['含まれる', '含まれない'], answer: 0, explain: '両端を含みます。' },
    { q: 'NOT IN の候補に NULL が含まれると？', options: ['NULLは無視される', '結果が1件も返らないことがある', 'エラーになる'], answer: 1, explain: 'x NOT IN (1, NULL) は「不明」になり行が選ばれません。第9章で詳しく扱います。' },
  ],
},
// ------------------------------------------------------------------
{
  id: 'ch05', level: 1, chapter: 5, title: '集計：COUNT / SUM / GROUP BY', difficulty: 2, minutes: 50, prereq: ['ch04'], dataset: 'base',
  summary: 'COUNT / SUM / AVG / MIN / MAX / GROUP BY / HAVING',
  goal: '件数・合計・平均を求め、グループごとに集計し、集計結果で絞り込める。',
  usage: '移行検証の基本は「件数」と「合計」の比較です。ステータス別件数、顧客別売上など、集計SQLは毎日使います。',
  terms: [['集計関数', 'COUNT（件数）SUM（合計）AVG（平均）MIN（最小）MAX（最大）'], ['COUNT(*)', '行数を数える'], ['COUNT(列)', 'その列がNULLでない行を数える'], ['GROUP BY', '指定した列の値ごとにグループを作って集計'], ['HAVING', '集計した結果に対する条件（WHEREは集計前の条件）']],
  syntax: 'SELECT グループ列, 集計関数(列)\nFROM テーブル\nWHERE 集計前の条件\nGROUP BY グループ列\nHAVING 集計後の条件;',
  examples: [
    { title: '全体の集計', sql: 'SELECT COUNT(*) AS 件数, SUM(total_amount) AS 合計, AVG(total_amount) AS 平均, MIN(order_date), MAX(order_date)\nFROM orders;' },
    { title: 'カテゴリ別の商品数と平均価格', sql: 'SELECT category, COUNT(*) AS 商品数, ROUND(AVG(price)) AS 平均価格\nFROM products\nGROUP BY category\nORDER BY 商品数 DESC;' },
  ],
  explanation: `**COUNT(*) と COUNT(列) の違い**が移行調査で重要です。COUNT(phone) は phone が NULL の行を数えません（空文字は数えます）。

**WHERE と HAVING**
- WHERE: グループにする前の行を絞る（例: キャンセル以外の注文だけ）
- HAVING: 集計結果を絞る（例: 注文が2回以上の顧客だけ）

GROUP BY を使うとき、SELECT に書ける列は「GROUP BY に書いた列」か「集計関数」だけです。`,
  exercises: [
    { id: 'e1', type: 'write', title: 'COUNT(*) と COUNT(列)', prompt: '顧客の総数と、電話番号（phone）がNULLでない顧客数を1行で表示してください。', answer: 'SELECT COUNT(*), COUNT(phone) FROM customers;',
      hints: ['COUNT(列) はNULLを数えません。'], explain: '15件と11件。空文字の顧客12は「NULLではない」ので数えられます。' },
    { id: 'e2', type: 'write', title: 'GROUP BY', prompt: '注文（orders）のステータス（status）ごとの件数を表示してください。', answer: 'SELECT status, COUNT(*) FROM orders GROUP BY status;',
      hints: ['GROUP BY status'], explain: '移行検証では「旧ステータス別件数」と「新ステータス別件数」を比較します。' },
    { id: 'e3', type: 'write', title: 'WHERE + SUM', prompt: "キャンセル（status = 'CANCELLED'）を除いた注文の total_amount の合計を表示してください。", answer: "SELECT SUM(total_amount) FROM orders WHERE status <> 'CANCELLED';",
      hints: ['集計前に WHERE で除外します。'], explain: '売上の検証では、どのステータスを含めるかを仕様で決めておく必要があります。' },
    { id: 'e4', type: 'write', title: 'HAVING', prompt: '注文が **2回以上** ある顧客の customer_id と注文件数を表示してください。', answer: 'SELECT customer_id, COUNT(*) FROM orders GROUP BY customer_id HAVING COUNT(*) >= 2;',
      hints: ['集計結果の条件は HAVING。'], explain: 'HAVING COUNT(*) >= 2。重複データの調査（同じメールが2件以上）にも同じ形を使います。' },
    { id: 'e5', type: 'fix', title: 'WHERE と HAVING の修正', prompt: '平均価格が10000円を超えるカテゴリを表示したいのですがエラーになります。修正してください。',
      starter: 'SELECT category, AVG(price)\nFROM products\nWHERE AVG(price) > 10000\nGROUP BY category;', answer: 'SELECT category, AVG(price) FROM products GROUP BY category HAVING AVG(price) > 10000;',
      hints: ['集計関数は WHERE の中では使えません。'], explain: '集計結果に対する条件は HAVING に書き、GROUP BY の後に置きます。' },
  ],
  mistakes: ['SELECT にGROUP BYしていない列を書く（エラー）', 'WHERE に集計関数を書く', 'SUM の結果がNULLになる（対象0件のとき）。COALESCE(SUM(x),0) で対処'],
  errorChecks: ['must appear in the GROUP BY clause → GROUP BY に列を追加するか集計関数で囲む', 'aggregate functions are not allowed in WHERE → HAVING へ'],
  practice: ['件数だけでなく「合計」「最小・最大」も比較すると、変換ミス（桁ずれ等）に気づけます。', 'AVG は整数でも小数で返ります。表示用には ROUND を使います。'],
  quiz: [
    { q: 'COUNT(email) は email が NULL の行を数える？', options: ['数える', '数えない'], answer: 1, explain: 'COUNT(列) はNULL以外を数えます。' },
    { q: '「売上合計が10万円以上の顧客」の条件はどこに書く？', options: ['WHERE', 'HAVING', 'ORDER BY'], answer: 1, explain: '集計後の条件なので HAVING。' },
  ],
},
// ------------------------------------------------------------------
{
  id: 'ch06', level: 1, chapter: 6, title: 'データ登録・更新・削除', difficulty: 2, minutes: 60, prereq: ['ch05'], dataset: 'base',
  summary: 'INSERT / UPDATE / DELETE、誤更新を防ぐ手順',
  goal: 'データの登録・更新・削除ができ、事前確認のSELECTとWHERE句で誤更新を防げる。',
  usage: '移行では大量のINSERT、データ修正のUPDATEを行います。WHEREの書き忘れで全件更新…は現場で実際に起きる重大事故です。',
  terms: [['INSERT', '行を追加'], ['UPDATE', '既存行の値を変更'], ['DELETE', '行を削除'], ['RETURNING', '変更した行を結果として返す（PostgreSQL）'], ['確認用SELECT', '更新前に、同じWHEREで対象行を確認するSELECT']],
  syntax: "INSERT INTO テーブル (列1, 列2) VALUES (値1, 値2), (値1, 値2);\nUPDATE テーブル SET 列 = 値 WHERE 条件;\nDELETE FROM テーブル WHERE 条件;",
  examples: [
    { title: '更新前の確認 → 更新（RETURNINGで変更行を表示）', sql: "-- ① まず対象を確認\nSELECT product_id, stock FROM products WHERE product_id = 5;\n-- ② 確認できたら更新\nUPDATE products SET stock = stock + 10 WHERE product_id = 5 RETURNING product_id, stock;" },
    { title: '1件登録', sql: "INSERT INTO products (product_id, product_name, category, price, stock)\nVALUES (99, 'お試し商品', 'その他', 100, 1)\nRETURNING *;" },
  ],
  explanation: `**誤更新を防ぐ手順（必ずこの順番で）**
1. 更新したい行を **SELECT で確認**（件数も見る）
2. 同じ WHERE で UPDATE / DELETE
3. 影響件数（「○行に影響」）が1の結果と一致するか確認
4. 本番では BEGIN … COMMIT で囲み、おかしければ ROLLBACK（第19章）

この練習DBはいつでも「DBを初期化」で元に戻せます。安心して試してください。ただし、エディタは WHERE のない UPDATE/DELETE を実行前に警告します。`,
  exercises: [
    { id: 'e1', type: 'write', title: 'INSERT', prompt: "商品を1件登録してください。product_id=11、product_name='USBメモリ 64GB'、category='ストレージ'、price=1980、stock=50（is_active は既定値のまま）。", compare: 'none',
      answer: "INSERT INTO products (product_id, product_name, category, price, stock) VALUES (11, 'USBメモリ 64GB', 'ストレージ', 1980, 50);",
      hints: ['INSERT INTO products (列...) VALUES (値...);', '列名を明示すると、列の順番を気にせずに済みます。'], explain: '列リストを省略すると定義順にすべての値が必要になり、移行SQLでは事故のもとです。列名は必ず書きましょう。' },
    { id: 'e2', type: 'write', title: 'UPDATE', prompt: '商品ID 5（USB-Cハブ）の在庫（stock）を 30 に更新してください。', compare: 'none', requireSafe: true,
      answer: 'UPDATE products SET stock = 30 WHERE product_id = 5;', hints: ['WHERE product_id = 5 を忘れずに。'], explain: '主キーで対象を指定するのが最も安全です。' },
    { id: 'e3', type: 'fix', title: '危険なUPDATEを修正', prompt: '「2022年1月1日より前に登録した顧客」だけを休眠（INACTIVE）にしたいのですが、このSQLは全員を休眠にしてしまいます。修正してください。', compare: 'none', requireSafe: true,
      starter: "UPDATE customers\nSET status = 'INACTIVE';", answer: "UPDATE customers SET status = 'INACTIVE' WHERE registered_at < '2022-01-01';",
      hints: ['WHERE registered_at < ...'], explain: "WHERE がないと全行が更新されます。実行前に SELECT ... WHERE registered_at < '2022-01-01' で4件であることを確認しましょう。" },
    { id: 'e4', type: 'write', title: 'DELETE', prompt: '販売終了で注文実績のない商品ID 7 を削除してください。', compare: 'none', requireSafe: true,
      answer: 'DELETE FROM products WHERE product_id = 7;', hints: ['DELETE FROM テーブル WHERE 条件;'], explain: '注文明細から参照されている商品を削除しようとすると外部キー違反になります（商品7は参照されていないので削除可能）。' },
    { id: 'e5', type: 'write', title: '複数行INSERT', prompt: "2件まとめて登録してください: (12, 'マウスパッド', '周辺機器', 980, 100) と (13, 'モニターアーム', 'モニター', 8980, 15)。列は product_id, product_name, category, price, stock の順。", compare: 'none',
      answer: "INSERT INTO products (product_id, product_name, category, price, stock) VALUES (12, 'マウスパッド', '周辺機器', 980, 100), (13, 'モニターアーム', 'モニター', 8980, 15);",
      hints: ['VALUES (…), (…) のようにカンマで並べます。'], explain: '複数行を1文で登録すると、1件ずつより高速です。' },
    { id: 'e6', type: 'choice', title: '更新前の確認', prompt: '本番DBでデータを更新するときの手順として最も適切なものは？',
      options: ['UPDATE を実行してから、結果をSELECTで確認する', '同じWHEREでSELECTして対象件数を確認 → トランザクション内でUPDATE → 件数と内容を確認してCOMMIT', 'WHERE は省略して全件更新し、あとで戻す', 'エラーが出なければ確認不要'], answerIndex: 1,
      hints: ['戻せない操作の前に確認します。'], explain: '事前確認SELECT＋トランザクション＋影響件数の確認が基本です。' },
  ],
  mistakes: ['WHERE の書き忘れ', 'INSERT で列リストを省略', '文字列にダブルクォートを使う（"abc" は列名扱い）'],
  errorChecks: ['duplicate key value violates unique constraint → 主キーが重複。既に同じIDがないか確認', 'violates foreign key constraint → 参照されている行を消そうとしている/参照先がない'],
  practice: ['本番での更新作業は「作業手順書」に SQL・期待件数・確認SQL・戻し方 を書いてから実施します（第25章）。', 'UPDATE ... RETURNING で変更後の値をその場で確認できます。'],
  quiz: [
    { q: 'DELETE FROM orders; を実行すると？', options: ['エラーになる', '全件削除を試みる', '最初の1件だけ消える'], answer: 1, explain: 'WHERE がないと全件が対象です（外部キーで止まることはあります）。' },
    { q: 'UPDATE の影響件数が想定と違ったら？', options: ['そのままCOMMIT', 'ROLLBACKして原因を調べる'], answer: 1, explain: 'トランザクション内なら ROLLBACK で取り消せます。' },
  ],
},
// ------------------------------------------------------------------
{
  id: 'ch07', level: 1, chapter: 7, title: 'テーブルの作成・変更', difficulty: 2, minutes: 60, prereq: ['ch06'], dataset: 'base',
  summary: 'CREATE TABLE / ALTER TABLE / DROP TABLE / TRUNCATE / 制約 / インデックス',
  goal: '型と制約を指定してテーブルを作成・変更でき、DROP / TRUNCATE / DELETE の違いを説明できる。',
  usage: '移行先テーブルの作成、作業用テーブル（ステージング、対応表）の作成、列追加などで使います。',
  terms: [['CREATE TABLE', 'テーブルを作る'], ['ALTER TABLE', '列の追加・削除、型の変更、制約の追加'], ['DROP TABLE', 'テーブルごと削除（構造も消える）'], ['TRUNCATE', '全行を高速に削除（構造は残る）'], ['CHECK制約', '値の条件。例: CHECK (price >= 0)'], ['CREATE INDEX', 'インデックスを作る']],
  syntax: 'CREATE TABLE テーブル名 (\n  列名 型 [NOT NULL] [DEFAULT 値],\n  ...,\n  PRIMARY KEY (列),\n  FOREIGN KEY (列) REFERENCES 親テーブル(列)\n);\nALTER TABLE テーブル名 ADD COLUMN 列名 型;\nCREATE INDEX インデックス名 ON テーブル名(列);',
  examples: [
    { title: '作業用テーブルを作って消す', sql: 'CREATE TABLE work_memo (\n  memo_id integer PRIMARY KEY,\n  body    text NOT NULL\n);\nINSERT INTO work_memo VALUES (1, \'テスト\');\nSELECT * FROM work_memo;\nDROP TABLE work_memo;' },
  ],
  explanation: `**DELETE / TRUNCATE / DROP の違い**
| 操作 | 行 | 構造 | WHERE | 速度 |
|---|---|---|---|---|
| DELETE | 条件に合う行を削除 | 残る | 使える | 遅い（1行ずつ） |
| TRUNCATE | 全行削除 | 残る | 使えない | 速い |
| DROP | 全部消える | 消える | — | — |

PostgreSQLでは CREATE / ALTER / DROP も **トランザクションで取り消せます**（Oracle や MySQL では自動確定されるなど、DBによって違います）。`,
  exercises: [
    { id: 'e1', type: 'write', title: 'CREATE TABLE', prompt: '仕入先テーブル **suppliers** を作成してください。\n- supplier_id: integer, 主キー\n- supplier_name: varchar(100), 必須（NOT NULL）\n- phone: varchar(20), 任意', compare: 'none',
      check: "SELECT c.column_name, c.data_type, c.character_maximum_length, c.is_nullable,\n EXISTS (SELECT 1 FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey) WHERE i.indisprimary AND i.indrelid = 'suppliers'::regclass AND a.attname = c.column_name) AS is_pk\nFROM information_schema.columns c WHERE c.table_name = 'suppliers' ORDER BY c.ordinal_position",
      checkLabel: 'テーブル定義（列・型・NULL可否・主キー）の確認',
      answer: 'CREATE TABLE suppliers (\n  supplier_id integer PRIMARY KEY,\n  supplier_name varchar(100) NOT NULL,\n  phone varchar(20)\n);',
      hints: ['列名 型 制約 をカンマで区切って並べます。'], explain: '主キーには自動的に NOT NULL と UNIQUE が付きます。' },
    { id: 'e2', type: 'write', title: 'ALTER TABLE', prompt: 'products テーブルに **supplier_id**（integer, NULL可）列を追加してください。', compare: 'none',
      check: "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'products' ORDER BY ordinal_position",
      answer: 'ALTER TABLE products ADD COLUMN supplier_id integer;', hints: ['ALTER TABLE ... ADD COLUMN 列名 型;'], explain: '既存行の新しい列は NULL（またはDEFAULT値）になります。' },
    { id: 'e3', type: 'write', title: 'インデックス', prompt: '都道府県で検索することが多いので、customers の **prefecture** 列にインデックスを作成してください（名前は自由）。', compare: 'none',
      check: "SELECT count(*) AS prefecture_index FROM pg_indexes WHERE tablename = 'customers' AND indexdef LIKE '%(prefecture)'",
      answer: 'CREATE INDEX idx_customers_prefecture ON customers(prefecture);', hints: ['CREATE INDEX 名前 ON テーブル(列);'], explain: 'インデックス名は「idx_テーブル_列」のように規則を決めると管理しやすくなります。' },
    { id: 'e4', type: 'write', title: '外部キーとCHECK制約', prompt: '商品レビューテーブル **product_reviews** を作成してください。\n- review_id: integer 主キー\n- product_id: integer 必須、products(product_id) への外部キー\n- rating: integer、1〜5のみ（CHECK制約）', compare: 'none',
      check: "SELECT contype, count(*) FROM pg_constraint WHERE conrelid = 'product_reviews'::regclass AND contype IN ('p','f','c') GROUP BY contype ORDER BY contype",
      checkLabel: '制約（主キー・外部キー・CHECK）の確認',
      answer: 'CREATE TABLE product_reviews (\n  review_id integer PRIMARY KEY,\n  product_id integer NOT NULL REFERENCES products(product_id),\n  rating integer CHECK (rating BETWEEN 1 AND 5)\n);',
      hints: ['REFERENCES products(product_id)', 'CHECK (rating BETWEEN 1 AND 5)'], explain: '制約はデータの品質を守る最後の砦です。移行時は制約違反のデータがエラーとして見つかります。' },
    { id: 'e5', type: 'choice', title: 'DELETE / TRUNCATE / DROP', prompt: '移行のリハーサルで、移行先テーブルの「中身だけ」を高速に空にしてやり直したい。適切なのは？',
      options: ['DROP TABLE', 'TRUNCATE', 'DELETE（WHEREなし）を1行ずつ', 'ALTER TABLE'], answerIndex: 1,
      hints: ['構造は残したい、行は全部消したい。'], explain: 'TRUNCATE は構造を残して全行を高速に削除します。外部キーで参照されている場合は TRUNCATE 親, 子 のように一緒に指定するか CASCADE が必要です。' },
  ],
  mistakes: ['本番で DROP と TRUNCATE を取り違える', 'NOT NULL 列を既存データがある表に DEFAULT なしで追加してエラー', 'インデックスを作りすぎる'],
  errorChecks: ['relation already exists → 同名テーブルがある（IF NOT EXISTS か、DROP後に作成）', 'cannot truncate a table referenced in a foreign key → 子テーブルも一緒に'],
  practice: ['移行先のDDLはファイルで管理し、レビューを受けます。', '型の変更（ALTER COLUMN TYPE）はデータ量が多いと時間がかかり、テーブルをロックします。'],
  quiz: [
    { q: 'TRUNCATE で WHERE は使える？', options: ['使える', '使えない'], answer: 1, explain: '全行削除のみ。条件付きなら DELETE。' },
    { q: 'PostgreSQLで BEGIN; DROP TABLE x; ROLLBACK; の後 x は？', options: ['消えている', '残っている'], answer: 1, explain: 'PostgreSQLのDDLはトランザクションで取り消せます。' },
  ],
},
];
