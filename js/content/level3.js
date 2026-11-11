// LEVEL 3：DB移行に必要なSQL
import { MIG_CUSTOMERS, MIG_ORDERS_BASIC, MIG_ORDERS_FULL, MIG_ITEMS, FULL_MIGRATION } from './migration-sql.js';

const R = String.raw;

// 期待値計算用：旧顧客を移行ルールで変換した「あるべき姿」
export const EXPECTED_CUSTOMERS_CTE = R`expected AS (
  SELECT l.cust_no,
         CASE WHEN replace(l.point_bal, ',', '') ~ '^[0-9]+$' THEN replace(l.point_bal, ',', '')::integer ELSE 0 END AS points,
         st.new_code AS status
  FROM legacy_customers l
  JOIN code_master st ON st.code_type = 'CUST_STATUS' AND st.old_code = l.sts_kbn
)`;

export default [
// ------------------------------------------------------------------
{
  id: 'ch14', level: 3, chapter: 14, title: '移行元DBの分析', difficulty: 3, minutes: 80, prereq: ['ch11', 'ch13'], dataset: 'migration',
  summary: 'テーブル・カラム・件数・NULL・重複・日付範囲・最小最大・不正データ・業務ルール・対象判定',
  goal: '移行元の構造とデータを体系的に調査（プロファイリング）し、移行対象と対象外を判定できる。',
  usage: '移行の最初の成果物「移行元調査結果」を作る作業です。ここで見つけた問題が、後のマッピング仕様・移行SQL・テストケースになります。',
  terms: [['プロファイリング', 'データの特徴（件数、NULL率、値の種類、最小/最大、パターン）を調べること'], ['業務ルール', '「退会者は移行しない」など、業務担当者が決める判断基準'], ['移行対象外', '移行しないと決めたデータ。理由と件数を記録して報告する']],
  syntax: "-- 件数\nSELECT COUNT(*) FROM legacy_customers;\n-- 値の種類と件数\nSELECT sts_kbn, COUNT(*) FROM legacy_customers GROUP BY sts_kbn ORDER BY 1;\n-- 範囲\nSELECT MIN(reg_ymd), MAX(reg_ymd) FROM legacy_customers;",
  examples: [
    { title: '旧システムのテーブル一覧（legacy_ で始まる）', sql: "SELECT table_name FROM information_schema.tables\nWHERE table_schema = 'public' AND table_name LIKE 'legacy\\_%'\nORDER BY table_name;" },
    { title: '列ごとのプロファイル（legacy_customers.pref_cd）', sql: "SELECT pref_cd, COUNT(*) AS cnt, m.label\nFROM legacy_customers l\nLEFT JOIN code_master m ON m.code_type = 'PREF' AND m.old_code = l.pref_cd\nGROUP BY pref_cd, m.label ORDER BY pref_cd;" },
  ],
  explanation: `**調査チェックリスト**（このレッスンと移行ラボの「構造比較」「検証ツール」で実践）
1. テーブル一覧と件数
2. 列一覧と型（文字列で保存された日付・数値はないか）
3. 列ごとの NULL・空文字の件数
4. キー候補の重複（主キーがない旧テーブルは特に）
5. 日付の範囲（未来日・古すぎる日・存在しない日）
6. 数値の最小・最大（マイナス・桁あふれ）
7. コード値の種類（コードマスタにない値）
8. 参照整合性（孤立データ）
9. 業務ルールの確認（退会者・テストデータ・削除フラグ）

調査結果は「件数」と「具体例」をセットで記録し、**対応方針は業務担当者と合意**します。`,
  exercises: [
    { id: 'e1', type: 'investigate', title: 'テーブル別件数', prompt: '旧システムの4テーブル（legacy_customers, legacy_customer_addresses, legacy_orders, legacy_order_details）の件数を、table_name と cnt の2列で4行表示してください。', dataset: 'migration',
      answer: "SELECT 'legacy_customers' AS table_name, COUNT(*) AS cnt FROM legacy_customers UNION ALL SELECT 'legacy_customer_addresses', COUNT(*) FROM legacy_customer_addresses UNION ALL SELECT 'legacy_orders', COUNT(*) FROM legacy_orders UNION ALL SELECT 'legacy_order_details', COUNT(*) FROM legacy_order_details;",
      hints: ['UNION ALL で複数のSELECTの結果を縦につなげます。', "SELECT 'テーブル名' AS table_name, COUNT(*) AS cnt FROM ..."], explain: 'テーブル名を文字列として出力し、UNION ALL でまとめるのは調査で頻出の書き方です。' },
    { id: 'e2', type: 'investigate', title: 'カラム一覧と型', prompt: '旧注文（legacy_orders）の列名・データ型・最大長（column_name, data_type, character_maximum_length）を定義順に表示してください。',
      answer: "SELECT column_name, data_type, character_maximum_length FROM information_schema.columns WHERE table_name = 'legacy_orders' ORDER BY ordinal_position;", ordered: true,
      hints: ['第2章と同じ information_schema.columns です。'], explain: '日付（ord_ymd）も金額（amt_txt）も文字列型です。移行先では date / numeric への変換が必要だと分かります。' },
    { id: 'e3', type: 'investigate', title: '日付範囲の調査', prompt: '旧注文の注文日（ord_ymd）の最小値 min_ymd と最大値 max_ymd を表示してください。', answer: 'SELECT MIN(ord_ymd) AS min_ymd, MAX(ord_ymd) AS max_ymd FROM legacy_orders;',
      hints: ['MIN / MAX は文字列にも使えます。'], explain: "最大値が '20231331'（13月）！文字列の MIN/MAX は辞書順なので、YYYYMMDD 形式なら範囲の確認に使えますが、不正な値もそのまま出てきます。" },
    { id: 'e4', type: 'investigate', title: 'コード値の分布', prompt: "旧顧客のステータス区分（sts_kbn）ごとに、sts_kbn、code_master（CUST_STATUS）の label、件数 cnt を表示してください。", answer: "SELECT l.sts_kbn, m.label, COUNT(*) AS cnt FROM legacy_customers l LEFT JOIN code_master m ON m.code_type = 'CUST_STATUS' AND m.old_code = l.sts_kbn GROUP BY l.sts_kbn, m.label;",
      hints: ['LEFT JOIN code_master してから GROUP BY。'], explain: '退会（9）が1件あることが分かります。' },
    { id: 'e5', type: 'investigate', title: '移行対象の判定', prompt: "業務ルール「削除フラグ del_flg='1' は対象外（削除済）」「sts_kbn='9' は対象外（退会）」「それ以外は対象」に従い、区分 category（'対象' / '対象外_削除済' / '対象外_退会'）ごとの件数 cnt を表示してください。", answer: "SELECT CASE WHEN del_flg = '1' THEN '対象外_削除済' WHEN sts_kbn = '9' THEN '対象外_退会' ELSE '対象' END AS category, COUNT(*) AS cnt FROM legacy_customers GROUP BY 1;",
      hints: ['CASE で区分を作って GROUP BY。', 'GROUP BY 1 は「SELECTの1列目」でグループ化する書き方です。'], explain: '対象18件・削除済1件・退会1件。さらに重複や不正日付の扱いは次の章以降で決めます。' },
    { id: 'e6', type: 'choice', title: '業務ルールの確認', prompt: "調査で「同じメールアドレスの顧客が2件（C0008とC0016）」見つかりました。エンジニアとして正しい対応は？",
      options: ['新しい方を勝手に削除して移行する', '両方そのまま移行する（重複は気にしない）', '件数・具体例を整理して業務担当者に報告し、残す方のルールを決めてもらう', '移行対象から両方とも除外する'], answerIndex: 2,
      hints: ['データの意味を決めるのは誰でしょう。'], explain: 'どちらを残すか（古い方/新しい方/最終利用日）はビジネス判断です。決まったルールは仕様書に記録します。このアプリの仕様では「登録日が古い方を残す」です。' },
  ],
  mistakes: ['件数だけ見て中身を見ない', '「たぶんテストデータ」と勝手に判断して除外する', '調査結果を記録せず口頭で済ませる'],
  errorChecks: ['UNION ALL で each UNION query must have the same number of columns → 各SELECTの列数をそろえる'],
  practice: ['本番データの調査は、本番に負荷をかけないよう検証環境のコピーや夜間に実行することがあります。', '個人情報を含むデータの調査結果を資料に貼るときはマスキングします。'],
  quiz: [
    { q: '移行元調査で見つけた不正データの扱いを決めるのは？', options: ['SQLを書いた人の判断', '業務担当者と合意して仕様化'], answer: 1, explain: '業務ルールとして合意します。' },
    { q: "文字列 'YYYYMMDD' の MAX で注意すべき点は？", options: ['正しい日付だけが対象になる', '不正な値（13月など）も辞書順で比較される'], answer: 1, explain: '文字列比較なので不正な日付も混ざります。' },
  ],
},
// ------------------------------------------------------------------
{
  id: 'ch15', level: 3, chapter: 15, title: '移行先DBの設計', difficulty: 3, minutes: 70, prereq: ['ch07', 'ch14'], dataset: 'migration',
  summary: '構造比較、カラム名・型・NULL許可・デフォルト値の変更、主キー・外部キー・インデックスの設計',
  goal: '移行元と移行先の構造差分を洗い出し、移行に必要なテーブル設計（列追加・制約）ができる。',
  usage: '「旧システムの住所は1顧客に複数行、新システムでは1列」のような構造の違いをどう吸収するかを設計します。',
  terms: [['構造比較', '移行元・移行先の列名・型・NULL許可・制約を並べて差分を確認すること'], ['サロゲートキー', '業務上の意味を持たない連番の主キー（customer_id）'], ['ナチュラルキー', '業務上の番号（旧顧客番号など）'], ['トレーサビリティ', '移行後のデータから移行元の行をたどれること（legacy_cust_no列など）']],
  syntax: "SELECT table_name, column_name, data_type, is_nullable, column_default\nFROM information_schema.columns\nWHERE table_name IN ('legacy_customers', 'customers')\nORDER BY table_name, ordinal_position;",
  examples: [
    { title: '旧顧客と新顧客の列を並べて比較', sql: "SELECT table_name, ordinal_position AS no, column_name, data_type, character_maximum_length AS len, is_nullable\nFROM information_schema.columns\nWHERE table_name IN ('legacy_customers', 'customers')\nORDER BY table_name, ordinal_position;" },
  ],
  explanation: `移行ラボの **「構造比較」** で、2つのテーブルを並べて差分を確認できます。

**設計時の判断ポイント**
- **主キー**: 旧番号をそのまま使う？新しく採番する？ → このアプリの仕様では「数字部分を維持」＋「旧番号を legacy_cust_no に保存（トレーサビリティ）」
- **NULL許可**: 新システムで NOT NULL にする列に、移行元でNULLがないか（ある場合は既定値 or 対象外）
- **型と長さ**: 移行元の最大長を超えないか（\`SELECT MAX(length(列))\`）
- **1対多の構造**: 住所が複数ある → 新テーブル（customer_addresses）を作る or 代表1件だけ移行
- **インデックス**: 移行中は書き込みが遅くなるので、大量移行後に作成する選択肢もある`,
  exercises: [
    { id: 'e1', type: 'investigate', title: '必須で既定値のない列', prompt: '移行先 customers で、NOT NULL かつ DEFAULT（既定値）がない列の column_name を定義順に表示してください（＝移行時に必ず値を用意すべき列）。', answer: "SELECT column_name FROM information_schema.columns WHERE table_name = 'customers' AND is_nullable = 'NO' AND column_default IS NULL ORDER BY ordinal_position;", ordered: true,
      hints: ["is_nullable = 'NO' AND column_default IS NULL"], explain: 'name と registered_at。旧データに不正な登録日がある行は、このままでは移行できないと分かります。' },
    { id: 'e2', type: 'investigate', title: '長さの確認', prompt: '旧顧客の氏名（cust_nm）とメール（mail_addr）の最大文字数を max_name_len、max_mail_len として表示してください。', answer: 'SELECT MAX(length(cust_nm)) AS max_name_len, MAX(length(mail_addr)) AS max_mail_len FROM legacy_customers;',
      hints: ['MAX(length(列))'], explain: '移行先の varchar(100) / varchar(255) に収まることを確認できます。' },
    { id: 'e3', type: 'write', title: '移行管理列の追加', prompt: '移行日時を記録するため、customers に **migrated_at**（timestamptz, NULL可）列を追加してください。', compare: 'none',
      check: "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'customers' ORDER BY ordinal_position",
      answer: 'ALTER TABLE customers ADD COLUMN migrated_at timestamptz;', hints: ['ALTER TABLE ... ADD COLUMN'], explain: '移行の実行単位（バッチ）や日時を記録しておくと、障害時の調査や部分的なやり直しがしやすくなります。' },
    { id: 'e4', type: 'write', title: '1対多のための新テーブル', prompt: '旧住所（自宅・勤務先の複数行）を保持するため、**customer_addresses** を作成してください。\n- address_id: serial 主キー\n- customer_id: integer 必須、customers(customer_id) への外部キー\n- address_type: varchar(10) 必須、\'HOME\' か \'WORK\' のみ（CHECK）\n- postal_code: varchar(8)\n- address: varchar(200) 必須', compare: 'none',
      check: "SELECT (SELECT string_agg(column_name || ':' || data_type || ':' || is_nullable, ', ' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_name = 'customer_addresses') AS cols, (SELECT string_agg(contype::text, '' ORDER BY contype) FROM pg_constraint WHERE conrelid = 'customer_addresses'::regclass AND contype IN ('p','f','c')) AS cons",
      checkLabel: 'テーブル定義と制約の確認',
      answer: "CREATE TABLE customer_addresses (\n  address_id serial PRIMARY KEY,\n  customer_id integer NOT NULL REFERENCES customers(customer_id),\n  address_type varchar(10) NOT NULL CHECK (address_type IN ('HOME', 'WORK')),\n  postal_code varchar(8),\n  address varchar(200) NOT NULL\n);",
      hints: ["CHECK (address_type IN ('HOME','WORK'))", 'serial は「自動採番される integer」です。'], explain: '移行元の構造をそのまま持ち込むのではなく、新システムの業務に合う形に設計し直します。' },
    { id: 'e5', type: 'choice', title: '主キーの設計', prompt: '旧顧客番号 C0001 を新システムでどう扱うのがよいでしょう？（このアプリの方針）',
      options: ['捨てて新しい連番だけにする', '新しい主キーとは別に legacy_cust_no 列に保存し、移行元をたどれるようにする', '氏名を主キーにする', 'メールアドレスを主キーにする'], answerIndex: 1,
      hints: ['移行後に「この顧客は旧システムのどれ？」と聞かれたら…'], explain: '旧番号を保存しておくと、検証（突き合わせ）・問い合わせ対応・差分移行がすべて楽になります。' },
    { id: 'e6', type: 'choice', title: 'NULL許可の変更', prompt: '新システムで email を NOT NULL にしたいが、旧データにメール未登録の顧客がいる。どうする？',
      options: ['そのまま移行してエラーになったら考える', 'ダミーのメールを勝手に入れる', '件数を報告し「NULL可にする／既定値を決める／対象外にする」を業務担当者と決める', '旧データのメールを削除する'], answerIndex: 2,
      hints: ['仕様の変更は合意が必要。'], explain: '設計上の制約と移行元データが矛盾するときは、選択肢と影響を整理して合意します。' },
  ],
  mistakes: ['移行元をそのまま新テーブルにコピーする設計', '新しい制約に旧データが違反しないか確認しない', 'トレーサビリティ用の列を持たない'],
  errorChecks: ['there is no unique constraint matching given keys for referenced table → 参照先列に主キー/UNIQUEが必要'],
  practice: ['テーブル定義比較表（成果物テンプレートあり）に、列ごとの差分と対応方針を書きます。'],
  quiz: [
    { q: '大量移行の前にインデックスを外すことがある理由は？', options: ['検索を速くするため', '書き込み（INSERT）を速くするため'], answer: 1, explain: '移行後にまとめて作成した方が速い場合があります（主キー・一意制約は重複検出に必要なので注意）。' },
  ],
},
// ------------------------------------------------------------------
{
  id: 'ch16', level: 3, chapter: 16, title: 'データマッピング', difficulty: 3, minutes: 80, prereq: ['ch15', 'ch12'], dataset: 'migration',
  summary: 'カラム対応表、1対1・1対多・統合・複数テーブル・コード変換・欠損処理・業務ルール変換',
  goal: '移行元→移行先の変換ルール（マッピング）をSELECT文で表現し、結果を確認できる。',
  usage: 'マッピング仕様書の各行は、最終的に移行SQLの SELECT 句の1列になります。INSERTする前にSELECTだけで変換結果を確認するのが鉄則です。',
  terms: [['データマッピング', '移行元の列と移行先の列の対応、変換方法を定義すること'], ['1対1', '列をそのまま（または簡単な変換で）移す'], ['1対多 / 多対1', '1行を複数行に分ける / 複数行・複数列を1つにまとめる'], ['マッピング仕様書', '移行先列・移行元列・変換ルール・例・備考を表にした文書']],
  syntax: "SELECT 移行元列          AS 移行先列,       -- 1対1\n       NULLIF(trim(列),'') AS 移行先列,       -- 欠損の正規化\n       m.new_code          AS 移行先列,       -- コード変換\n       列A || ' ' || 列B   AS 移行先列        -- 統合\nFROM 移行元 LEFT JOIN code_master m ON ...;",
  examples: [
    { title: 'マッピング結果をSELECTで確認（一部の列）', sql: "SELECT cust_no AS legacy_cust_no,\n       cust_nm AS name,\n       NULLIF(lower(trim(mail_addr)), '') AS email\nFROM legacy_customers\nWHERE del_flg = '0' AND sts_kbn <> '9'\nORDER BY cust_no\nLIMIT 6;" },
  ],
  explanation: `**マッピング仕様書の例（customers）**
| 移行先 | 移行元 | 変換ルール |
|---|---|---|
| customer_id | cust_no | 数字部分を integer に（C0001→1） |
| legacy_cust_no | cust_no | そのまま |
| name | cust_nm | そのまま |
| email | mail_addr | 前後空白除去・小文字化、空ならNULL |
| phone | tel_no | 11桁なら 3-4-4 形式、それ以外NULL |
| prefecture | pref_cd | code_master(PREF) で変換、変換不可はNULL |
| status | sts_kbn | code_master(CUST_STATUS) で変換 |
| points | point_bal | カンマ除去後0以上の整数ならその値、他は0 |
| registered_at | reg_ymd | 日付に変換、不正な日付の行は対象外 |
| postal_code / address | legacy_customer_addresses | 自宅(1)を優先、なければ勤務先。郵便番号は 3-4 形式、住所は addr1 と addr2 を空白で連結 |

成果物テンプレート「データマッピング表」でこの表を作り、CSVでエクスポートできます。`,
  exercises: [
    { id: 'e1', type: 'write', title: '1対1と正規化', prompt: "移行対象（del_flg='0' かつ sts_kbn<>'9'）の旧顧客について、legacy_cust_no（cust_no）、name（cust_nm）、email（前後空白除去・小文字化し、空ならNULL）を cust_no 順に表示してください。", answer: "SELECT cust_no AS legacy_cust_no, cust_nm AS name, NULLIF(lower(trim(mail_addr)), '') AS email FROM legacy_customers WHERE del_flg = '0' AND sts_kbn <> '9' ORDER BY cust_no;", ordered: true,
      hints: ["NULLIF(lower(trim(mail_addr)), '')"], explain: 'C0006 の空白、C0015 の大文字が正規化されます。' },
    { id: 'e2', type: 'write', title: 'コード変換（2種類）', prompt: "移行対象の旧顧客の cust_no、prefecture（code_master の PREF で変換）、status（CUST_STATUS で変換）を表示してください。変換できない都道府県は NULL のまま残すこと。", answer: "SELECT l.cust_no, p.new_code AS prefecture, s.new_code AS status FROM legacy_customers l LEFT JOIN code_master p ON p.code_type = 'PREF' AND p.old_code = l.pref_cd LEFT JOIN code_master s ON s.code_type = 'CUST_STATUS' AND s.old_code = l.sts_kbn WHERE l.del_flg = '0' AND l.sts_kbn <> '9';",
      hints: ['code_master を2回、別名を変えて LEFT JOIN します（p と s）。'], explain: '同じテーブルを異なる目的で2回結合するときは別名で区別します。' },
    { id: 'e3', type: 'write', title: '書式の変換', prompt: R`移行対象の旧顧客の cust_no と phone を表示してください。phone は tel_no が11桁の数字なら '090-1111-0001' のような 3-4-4 形式、それ以外（空文字・NULL）は NULL。`, answer: R`SELECT cust_no, CASE WHEN tel_no ~ '^[0-9]{11}$' THEN regexp_replace(tel_no, '^([0-9]{3})([0-9]{4})([0-9]{4})$', '\1-\2-\3') END AS phone FROM legacy_customers WHERE del_flg = '0' AND sts_kbn <> '9';`,
      hints: [R`regexp_replace(tel_no, '^([0-9]{3})([0-9]{4})([0-9]{4})$', '\1-\2-\3')`, R`( ) で囲んだ部分を \1 \2 \3 で参照できます。`], explain: 'substr で切り出して || でつなぐ方法でもOKです。' },
    { id: 'e4', type: 'write', title: '1対多 → 1行（複数カラムの統合）', prompt: "旧住所から、顧客ごとに代表住所を1件選んでください。ルール: 自宅（addr_type='1'）を優先、なければ勤務先。**legacy_customers に存在する顧客だけ**。列: cust_no、postal_code（'1000001'→'100-0001'）、address（addr1 と addr2 を半角空白で連結。addr2 が NULL なら addr1 のみ）。", answer: "WITH r AS (SELECT a.*, ROW_NUMBER() OVER (PARTITION BY a.cust_no ORDER BY a.addr_type) AS rn FROM legacy_customer_addresses a WHERE EXISTS (SELECT 1 FROM legacy_customers c WHERE c.cust_no = a.cust_no)) SELECT cust_no, substr(zip_cd, 1, 3) || '-' || substr(zip_cd, 4) AS postal_code, addr1 || COALESCE(' ' || addr2, '') AS address FROM r WHERE rn = 1;",
      hints: ['ROW_NUMBER() OVER (PARTITION BY cust_no ORDER BY addr_type) で自宅が1番になります。', "COALESCE(' ' || addr2, '')：addr2 がNULLなら ' ' || NULL も NULL になる性質を利用。"], explain: '7件。C9999 は顧客が存在しない孤立データなので除外。' },
    { id: 'e5', type: 'choice', title: '欠損値の処理方針', prompt: "旧ポイント point_bal に '' や 'abc' や '-100' がある。仕様として最も望ましい決め方は？", options: ['エンジニアが0にすると決めて黙って実装', '値のパターンごとに件数と例を示し、補正（カンマ除去）・既定値（0）・対象外のどれにするか業務担当者と決め、仕様書に記録する', 'すべてNULLにする', 'エラーにして移行を止める'], answerIndex: 1,
      hints: ['ポイントは顧客の財産です。'], explain: '金額やポイントは顧客に影響するため、特に慎重に合意します。このアプリの仕様は「カンマ除去後の整数のみ採用、他は0（対象外リストに記録）」です。' },
  ],
  mistakes: ['INSERT を書く前に SELECT で変換結果を確認しない', 'JOIN で行が増える（1対多）ことに気づかない', '連結時の NULL（|| は NULL を含むと全体が NULL）'],
  errorChecks: ['行数が移行元より多い → 1対多のJOINによる重複', "連結結果がNULL → || の片方がNULL。COALESCE か concat() を使う"],
  practice: ['マッピング仕様は「移行元の値の例 → 移行先の値」を必ず添えるとレビューで誤解が減ります。'],
  quiz: [
    { q: "'東京' || NULL の結果は？", options: ["'東京'", 'NULL'], answer: 1, explain: '|| はNULLを含むとNULL。concat() はNULLを空文字扱い。' },
  ],
},
// ------------------------------------------------------------------
{
  id: 'ch17', level: 3, chapter: 17, title: 'データ移行SQLの作成', difficulty: 4, minutes: 100, prereq: ['ch16', 'ch09'], dataset: 'migration',
  summary: 'INSERT INTO SELECT、変換・抽出・JOIN・CTE、親子の順序、主キーの維持、重複防止、再実行設計',
  goal: 'マッピング仕様を INSERT INTO ... SELECT に落とし込み、親→子の順で、再実行しても重複しない移行SQLを書ける。',
  usage: 'これが移行作業の本体です。本番では手順書に沿って、ここで作ったSQLを順番に実行します。',
  terms: [['INSERT INTO ... SELECT', 'SELECTの結果をそのまま別テーブルに登録'], ['冪等（べきとう）', '何回実行しても結果が同じになる性質。再実行しても重複しない移行SQL'], ['ON CONFLICT', '一意制約に違反したときの動き（DO NOTHING / DO UPDATE）を指定（PostgreSQL）'], ['setval', 'シーケンス（自動採番）の現在値を設定']],
  syntax: 'INSERT INTO 移行先 (列1, 列2, ...)\nSELECT 変換式1, 変換式2, ...\nFROM 移行元\n[JOIN ...]\nWHERE 移行対象の条件\n  AND NOT EXISTS (SELECT 1 FROM 移行先 x WHERE x.キー = 移行元.キー);',
  examples: [
    { title: '移行前に件数を確認 → 移行 → 件数を確認', sql: "SELECT COUNT(*) AS 対象件数 FROM legacy_customers WHERE del_flg = '0' AND sts_kbn = '3';\nINSERT INTO customers (customer_id, legacy_cust_no, name, status, registered_at)\nSELECT substr(cust_no, 2)::integer, cust_no, cust_nm, 'SUSPENDED', reg_ymd::date\nFROM legacy_customers WHERE del_flg = '0' AND sts_kbn = '3'\nRETURNING customer_id, legacy_cust_no, name;" },
  ],
  explanation: `**移行SQLの基本形**（このアプリの完成版は「移行ラボ → 参考：模範移行SQL」で見られます）

\`\`\`sql
INSERT INTO customers (customer_id, legacy_cust_no, name, ...)
SELECT substr(cust_no, 2)::integer, cust_no, cust_nm, ...
FROM legacy_customers
WHERE del_flg = '0' AND sts_kbn <> '9';
\`\`\`

**親→子の順番**: customers → orders → order_items。子を先に入れると外部キー違反。削除・やり直しは逆順。

**主キーの維持と採番**: 旧番号の数字部分を customer_id に入れたら、最後に
\`SELECT setval('customers_customer_id_seq', (SELECT max(customer_id) FROM customers));\`
でシーケンスを合わせないと、新システム稼働後の新規登録で「ID重複」エラーになります。

**再実行を考慮した設計（冪等性）**: 移行は途中で失敗することがあります。
- \`WHERE NOT EXISTS (移行先に既にある)\` で未移行分だけ登録
- または \`ON CONFLICT (キー) DO NOTHING\`
- または「移行先を空にしてから全件やり直す」手順（TRUNCATE → 再実行）`,
  exercises: [
    { id: 'e1', type: 'write', title: 'INSERT INTO SELECT（基本）', prompt: "旧顧客のうち、**sts_kbn='1'（有効）かつ del_flg='0'、かつ reg_ymd が8桁の数字で日付として正しい** 行を customers に移行してください。\n移行する列: customer_id（cust_no の数字部分）、legacy_cust_no（cust_no）、name（cust_nm）、email（小文字・前後空白除去、空ならNULL）、status（'ACTIVE'）、registered_at（reg_ymd を日付に）\n※メール重複の C0016 は除外してください（cust_no <> 'C0016'）。", compare: 'none',
      answer: "INSERT INTO customers (customer_id, legacy_cust_no, name, email, status, registered_at)\nSELECT substr(cust_no, 2)::integer, cust_no, cust_nm, NULLIF(lower(trim(mail_addr)), ''), 'ACTIVE', to_date(reg_ymd, 'YYYYMMDD')\nFROM legacy_customers\nWHERE sts_kbn = '1' AND del_flg = '0'\n  AND reg_ymd ~ '^[0-9]{8}$' AND pg_input_is_valid(reg_ymd, 'date')\n  AND cust_no <> 'C0016';",
      hints: ["reg_ymd ~ '^[0-9]{8}$' AND pg_input_is_valid(reg_ymd, 'date')", 'substr(cust_no, 2)::integer で C0001 → 1', 'まず INSERT を外して SELECT 部分だけ実行し、12件になるか確認しましょう。'],
      explain: '12件が移行されます。C0016 を除外しないと、C0008 とメールが重複して一意制約違反になります（試してみましょう）。' },
    { id: 'e2', type: 'write', title: '全ルールを適用した顧客移行', prompt: "マッピング仕様（第16章の表）のすべてのルールで顧客を移行してください（住所は除く）。\n- 対象: del_flg='0' かつ sts_kbn<>'9'\n- メール重複（lower(trim(mail_addr))）は reg_ymd が古い方（同じなら cust_no の小さい方）を残す。メールNULLは重複扱いしない\n- reg_ymd が日付として不正な行は対象外\n- 列: customer_id, legacy_cust_no, name, email, phone, prefecture, status, points, registered_at\n- 最後にシーケンスを setval で合わせる", compare: 'none',
      answer: MIG_CUSTOMERS,
      hints: ['ROW_NUMBER() OVER (PARTITION BY lower(trim(mail_addr)) ORDER BY reg_ymd, cust_no) を WITH 句で付けて rn = 1 だけ。', 'WHERE (rn = 1 OR mail_addr IS NULL)', "points: CASE WHEN replace(point_bal, ',', '') ~ '^[0-9]+$' THEN replace(point_bal, ',', '')::integer ELSE 0 END", "reg_ymd::date は '2022/03/10' のような形式も日付として読めます。"],
      explain: '16件。対象18件のうち C0014（不正日付）と C0016（重複）が対象外です。対象外の行は検証で「なぜ移行されていないか」を説明できるようにしておきます。' },
    { id: 'e3', type: 'write', title: 'JOINを使った注文の移行', prompt: "顧客の移行が完了している状態です。旧注文を orders に移行してください。\n- order_id: ord_no の数字部分、legacy_ord_no: ord_no\n- customer_id: 移行済み顧客（customers.legacy_cust_no = cust_no）の customer_id。顧客が移行されていない注文は対象外\n- status: code_master(ORDER_STATUS) で変換。変換できないものは対象外\n- order_date: ord_ymd を日付に。不正な日付は対象外\n- total_amount: amt_txt からカンマと¥を除いた値が整数なら、その1.1倍を四捨五入（税抜→税込）。整数にならないものは対象外", compare: 'none',
      setup: MIG_CUSTOMERS, answer: MIG_ORDERS_BASIC,
      hints: ['customers と code_master を INNER JOIN すると、変換できない行は自然に除外されます。', "round(regexp_replace(amt_txt, '[,¥]', '', 'g')::numeric * 1.1)", '日付と金額のチェックは WHERE に。'],
      explain: "10件。C0016（重複で未移行）の注文 O0018 はこの時点では移行されません → 次の演習で付け替えます。" },
    { id: 'e4', type: 'write', title: '再実行しても重複しない移行', prompt: "注文移行の途中で障害が起き、O0001〜O0005 だけが登録された状態です。**同じSQLを何度実行しても重複エラーにならず**、残りの注文が移行されるように e3 と同じルールで移行してください。", compare: 'none',
      setup: MIG_CUSTOMERS + "\n" + MIG_ORDERS_BASIC.replace("WHERE pg_input_is_valid", "WHERE o.ord_no <= 'O0005' AND pg_input_is_valid"),
      answer: MIG_ORDERS_BASIC.replace(";\nSELECT setval", "\n  AND NOT EXISTS (SELECT 1 FROM orders x WHERE x.legacy_ord_no = o.ord_no);\nSELECT setval"),
      mustInclude: [['not\\s+exists|on\\s+conflict', 'NOT EXISTS か ON CONFLICT を使って、再実行しても重複しないようにしてください']],
      hints: ['e3 の答えをそのまま実行すると duplicate key エラーになります（試してみましょう）。', 'AND NOT EXISTS (SELECT 1 FROM orders x WHERE x.legacy_ord_no = o.ord_no)', 'または ON CONFLICT (legacy_ord_no) DO NOTHING'],
      explain: 'NOT EXISTS を付けると「まだ移行されていない行だけ」が対象になり、何度実行しても同じ結果（冪等）になります。' },
    { id: 'e5', type: 'write', title: '子テーブル（明細）の移行', prompt: "顧客・注文の移行が完了しています。旧明細（legacy_order_details）を order_items に移行してください。\n- order_id: 親注文（orders.legacy_ord_no = ord_no）の order_id。親が移行されていない明細は対象外\n- product_id: code_master(ITEM) で item_cd を変換（new_code を integer に）。変換できないものは対象外\n- line_no / quantity / unit_price: 文字列を数値に", compare: 'none',
      setup: MIG_CUSTOMERS + "\n" + MIG_ORDERS_BASIC,
      answer: "INSERT INTO order_items (order_id, line_no, product_id, quantity, unit_price)\nSELECT o.order_id, d.line_no::integer, m.new_code::integer, d.qty_txt::integer, d.unit_prc_txt::numeric\nFROM legacy_order_details d\nJOIN orders o ON o.legacy_ord_no = d.ord_no\nJOIN code_master m ON m.code_type = 'ITEM' AND m.old_code = d.item_cd;",
      hints: ['orders と code_master を JOIN。'], explain: '8件。O0009（親注文が対象外）と O0018（未移行）、P777（未知の商品）の明細が除外されます。' },
    { id: 'e6', type: 'write', title: 'CTEで重複顧客の注文を付け替え', prompt: "顧客・注文（e3まで）が移行済みです。重複統合で移行されなかった C0016 の注文（O0018）を、残した方の顧客（C0008）の注文として移行してください。\n考え方: 旧顧客ごとに「残す側の顧客番号」（同じメールの中で reg_ymd・cust_no が最も古い cust_no）を WITH 句で作り、それを使って JOIN する。**既に移行済みの注文は重複させない**こと。", compare: 'none',
      setup: MIG_CUSTOMERS + "\n" + MIG_ORDERS_BASIC, answer: MIG_ORDERS_FULL,
      hints: ['FIRST_VALUE(cust_no) OVER (PARTITION BY lower(trim(mail_addr)) ORDER BY reg_ymd, cust_no) AS master_no', 'customers c ON c.legacy_cust_no = m.master_no', 'NOT EXISTS で移行済みを除外すれば、全注文を対象にしても O0018 だけが追加されます。'],
      explain: 'O0018 が customer_id=8 として追加され、注文は11件になります。重複統合では「子データの付け替え」を忘れがちです。' },
    { id: 'e7', type: 'choice', title: '移行順序', prompt: 'customers / orders / order_items をやり直すため、移行先の中身を消して再移行したい。正しい順番は？',
      options: ['削除: customers → orders → order_items、登録: 同じ順', '削除: order_items → orders → customers、登録: customers → orders → order_items', '削除も登録も順番は関係ない', '削除: orders → customers → order_items'], answerIndex: 1,
      hints: ['外部キーは「子が親を参照」します。'], explain: '削除は子から、登録は親から。TRUNCATE なら TRUNCATE order_items, orders, customers; のように一度に指定できます。' },
  ],
  mistakes: ['いきなり INSERT して件数を確認しない', 'シーケンスを合わせ忘れて、稼働後に新規登録がエラーに', '再実行で二重登録', '1対多の JOIN で行が増えて重複登録'],
  errorChecks: ['duplicate key value violates unique constraint → 再実行による重複、または移行元の重複', 'violates foreign key constraint → 親の未移行・順番違い', 'null value in column violates not-null constraint → 変換結果がNULLの行がある（変換式・対象条件を確認）'],
  practice: ['本番移行SQLは「1ファイル1テーブル」「先頭に目的・対象件数の見込み・前提条件」をコメントで書くとレビュー・運用しやすくなります。', '移行対象外の行は migration_rejects のようなテーブルに理由付きで記録しておくと、報告書がすぐ作れます。'],
  quiz: [
    { q: '冪等な移行SQLとは？', options: ['速い移行SQL', '何度実行しても同じ結果になる移行SQL', 'エラーにならない移行SQL'], answer: 1, explain: '再実行しても重複や二重計上が起きないことです。' },
    { q: '旧番号をIDにした後にやるべきことは？', options: ['何もしない', 'シーケンスを最大値に合わせる（setval）'], answer: 1, explain: '新規登録で採番される値と重複しないようにします。' },
  ],
},
// ------------------------------------------------------------------
{
  id: 'ch18', level: 3, chapter: 18, title: 'データ検証', difficulty: 4, minutes: 90, prereq: ['ch17'], dataset: 'migration',
  summary: '件数・主キー・カラム値・NULL・重複・集計値の比較、漏れ・余分の検出、修正と再検証、記録',
  goal: '移行元と移行先を突き合わせて、件数・キー・内容の不整合を検出し、修正・再検証できる。',
  usage: '「移行しました」ではなく「移行して、これだけ検証して、問題ありませんでした」と報告するのがプロの仕事です。',
  terms: [['突き合わせ', '移行元と移行先をキーで結び、差異を探すこと'], ['移行漏れ', '移行元（対象）にあるのに移行先にない'], ['余分なレコード', '移行先にあるのに移行元（対象）にない'], ['EXCEPT', '左の結果から右の結果にある行を除く（差分を出す）']],
  syntax: '-- 件数比較\nSELECT (SELECT COUNT(*) FROM 移行元 WHERE 対象条件) AS src, (SELECT COUNT(*) FROM 移行先) AS dst;\n-- 内容の差分（変換後の期待値 EXCEPT 実際の値）\nSELECT キー, 列 FROM 期待値\nEXCEPT\nSELECT キー, 列 FROM 移行先;',
  examples: [
    { title: '移行先の状態（完全移行後）を確認', sql: 'SELECT (SELECT COUNT(*) FROM customers) AS customers,\n       (SELECT COUNT(*) FROM orders) AS orders,\n       (SELECT COUNT(*) FROM order_items) AS items;' },
    { title: '旧ステータス別件数と新ステータス別件数を並べる', sql: "SELECT m.new_code AS status,\n       (SELECT COUNT(*) FROM legacy_customers l WHERE l.sts_kbn = m.old_code AND l.del_flg = '0') AS legacy_cnt,\n       (SELECT COUNT(*) FROM customers c WHERE c.status = m.new_code) AS new_cnt\nFROM code_master m WHERE m.code_type = 'CUST_STATUS' AND m.new_code IS NOT NULL;" },
  ],
  explanation: `**検証の観点（この順に深くなる）**
1. **件数**: 移行元（対象）＝移行先＋対象外として説明できる件数か
2. **キー**: 漏れ（元にあって先にない）・余分（先にあって元にない）がないか
3. **内容**: 列ごとに「変換ルールを適用した期待値」と「実際の値」が一致するか
4. **集計値**: 金額合計・ポイント合計・ステータス別件数
5. **NULL・重複**: 移行先で想定外のNULLや重複がないか

**件数が一致しても安心できない**（シナリオI）。内容の比較（EXCEPT や IS DISTINCT FROM）まで行います。

このレッスンの演習は、移行が完了した状態（＋一部に不具合を仕込んだ状態）から始まります。移行ラボの **「検証ツール」** でも同じ検証を対話的に実行できます。`,
  exercises: [
    { id: 'e1', type: 'write', title: '件数比較', prompt: "1行で src_target（移行対象の旧顧客数: del_flg='0' かつ sts_kbn<>'9'）、dst_count（customers の件数）、diff（src_target − dst_count）を表示してください。", setup: FULL_MIGRATION,
      answer: "SELECT (SELECT COUNT(*) FROM legacy_customers WHERE del_flg = '0' AND sts_kbn <> '9') AS src_target, (SELECT COUNT(*) FROM customers) AS dst_count, (SELECT COUNT(*) FROM legacy_customers WHERE del_flg = '0' AND sts_kbn <> '9') - (SELECT COUNT(*) FROM customers) AS diff;",
      hints: ['スカラーサブクエリを3つ並べます。', 'WITH 句で件数を先に出してから引き算しても OK。'], explain: '18 − 16 = 2。この「2」を説明できなければ検証は完了しません（次の演習）。' },
    { id: 'e2', type: 'investigate', title: '移行漏れの検出', prompt: '移行対象なのに customers に存在しない（legacy_cust_no で一致しない）旧顧客の cust_no を表示してください。', setup: FULL_MIGRATION,
      answer: "SELECT l.cust_no FROM legacy_customers l WHERE l.del_flg = '0' AND l.sts_kbn <> '9' AND NOT EXISTS (SELECT 1 FROM customers c WHERE c.legacy_cust_no = l.cust_no);",
      hints: ['NOT EXISTS か LEFT JOIN ... IS NULL。'], explain: 'C0014（不正日付）と C0016（重複統合）。どちらも仕様どおりの対象外なので「説明できる差」です。' },
    { id: 'e3', type: 'investigate', title: '余分なレコードの検出', prompt: '何者かが移行先に手でデータを入れてしまいました。customers のうち、legacy_cust_no が NULL か、旧顧客に存在しない行の customer_id、legacy_cust_no、name を表示してください。',
      setup: FULL_MIGRATION + "\nINSERT INTO customers (customer_id, legacy_cust_no, name, status, registered_at) VALUES (900, 'C0099', '試験 データ', 'ACTIVE', '2024-01-01'), (901, NULL, '手入力 さん', 'ACTIVE', '2024-01-02');",
      answer: 'SELECT c.customer_id, c.legacy_cust_no, c.name FROM customers c WHERE c.legacy_cust_no IS NULL OR NOT EXISTS (SELECT 1 FROM legacy_customers l WHERE l.cust_no = c.legacy_cust_no);',
      hints: ['legacy_cust_no IS NULL OR NOT EXISTS (...)'], explain: '2件（C0099 と NULL）。実は NOT EXISTS は「相手が見つからない」ので legacy_cust_no が NULL の行も検出できます。一方、NOT IN や INNER JOIN を使った書き方では NULL の行が漏れるため、IS NULL を明示しておくと意図が読み手に伝わります。' },
    { id: 'e4', type: 'investigate', title: '内容の不整合（件数は一致）', prompt: "件数は一致していますが、一部の顧客の points と status が移行ルールと違っています。移行ルールで変換した期待値（points: カンマ除去後0以上の整数ならその値・他は0、status: CUST_STATUS 変換）と customers を比較し、**どちらかが違う**顧客の legacy_cust_no を表示してください。",
      setup: FULL_MIGRATION + "\nUPDATE customers SET points = 0 WHERE legacy_cust_no = 'C0008';\nUPDATE customers SET status = 'ACTIVE' WHERE legacy_cust_no = 'C0010';",
      answer: R`WITH ${EXPECTED_CUSTOMERS_CTE}
SELECT c.legacy_cust_no
FROM customers c JOIN expected e ON e.cust_no = c.legacy_cust_no
WHERE c.points IS DISTINCT FROM e.points OR c.status IS DISTINCT FROM e.status;`,
      hints: ['WITH 句で期待値（cust_no, points, status）を作り、customers と legacy_cust_no で JOIN。', 'IS DISTINCT FROM で比較（NULLがあっても正しく比較できる）。', '(SELECT legacy_cust_no, points, status FROM customers) EXCEPT (期待値) でもOK。'],
      explain: 'C0008（ポイント2500→0）と C0010（INACTIVE→ACTIVE）。件数比較だけでは絶対に見つからない不整合です。' },
    { id: 'e5', type: 'write', title: '集計値の比較', prompt: '移行された注文について、移行元の税込換算合計 src_total（移行された ord_no の amt_txt からカンマ・¥を除き ×1.1 を四捨五入した値の合計）と、移行先 orders の total_amount 合計 dst_total を1行で表示してください。', setup: FULL_MIGRATION,
      answer: "SELECT (SELECT SUM(round(regexp_replace(l.amt_txt, '[,¥]', '', 'g')::numeric * 1.1)) FROM legacy_orders l WHERE EXISTS (SELECT 1 FROM orders o WHERE o.legacy_ord_no = l.ord_no)) AS src_total, (SELECT SUM(total_amount) FROM orders) AS dst_total;",
      hints: ['移行された注文だけを対象にするため EXISTS で絞ります。', '四捨五入は1件ごとに行ってから合計（合計してから四捨五入すると端数がずれる）。'], explain: '一致すれば変換式が正しく適用されています。端数処理の単位（明細ごと・注文ごと・合計）も仕様で決めておく必要があります。' },
    { id: 'e6', type: 'write', title: '不整合の修正と再検証', prompt: "e4 の不整合（C0008 の points、C0010 の status）を、**移行元から正しい値を計算して** UPDATE で修正してください（値を直接書き込むのではなく、legacy_customers と code_master を使うこと）。修正後、e4 の検証SQLで0件になることを確かめましょう。",
      setup: FULL_MIGRATION + "\nUPDATE customers SET points = 0 WHERE legacy_cust_no = 'C0008';\nUPDATE customers SET status = 'ACTIVE' WHERE legacy_cust_no = 'C0010';", compare: 'none', requireSafe: true,
      answer: R`WITH ${EXPECTED_CUSTOMERS_CTE}
UPDATE customers c
SET points = e.points, status = e.status
FROM expected e
WHERE e.cust_no = c.legacy_cust_no
  AND (c.points IS DISTINCT FROM e.points OR c.status IS DISTINCT FROM e.status);`,
      mustInclude: [['legacy_customers', 'legacy_customers（移行元）から正しい値を計算してください']],
      hints: ['UPDATE customers c SET ... FROM (期待値) e WHERE e.cust_no = c.legacy_cust_no', 'WHERE に「違っている行だけ」の条件を入れると、影響件数（2件）で確認できます。'],
      explain: '修正SQLも移行SQLと同じルールから計算するのがポイント。手で値を書くと別のミスを生みます。修正後は必ず再検証し、結果を記録します。' },
    { id: 'e7', type: 'choice', title: '検証の十分性', prompt: '移行元対象18件・移行先16件。差の2件は仕様どおりの対象外と確認できた。次にやるべきことは？',
      options: ['件数の説明ができたので完了', '内容（列ごとの値）と集計値の比較、NULL・重複のチェックも行い、結果を記録する', '対象外の2件を無理やり移行する', '何もしない'], answerIndex: 1,
      hints: ['シナリオIを思い出しましょう。'], explain: '件数・キー・内容・集計の各観点を確認し、検証結果報告書に記録します。' },
  ],
  mistakes: ['件数だけで完了とする', '検証SQLを移行SQLと同じ人が同じ発想で書く（同じ誤りを見逃す）→ レビューや別観点で', '検証結果を記録しない'],
  errorChecks: ['EXCEPT で each EXCEPT query must have the same number of columns → 両側の列数・型をそろえる'],
  practice: ['検証SQLとその結果（件数・差分0件など）を「検証結果報告書」に貼り、日時と実施者を記録します。', '本番移行では「移行直後に流す検証SQLセット」を事前に用意し、リハーサルで所要時間も測っておきます。'],
  quiz: [
    { q: '件数一致・内容不一致を見つける方法は？', options: ['COUNT(*) を比べる', '期待値と実際の値を EXCEPT や IS DISTINCT FROM で比べる'], answer: 1, explain: '内容の比較が必要です。' },
  ],
},
// ------------------------------------------------------------------
{
  id: 'ch19', level: 3, chapter: 19, title: 'トランザクションと障害対応', difficulty: 4, minutes: 80, prereq: ['ch17'], dataset: 'base',
  summary: 'BEGIN / COMMIT / ROLLBACK / SAVEPOINT、途中失敗、ロールバック範囲、冪等性、復旧手順、切り戻し',
  goal: 'トランザクションで処理をまとめて確定・取り消しでき、途中失敗からの復旧と再実行を設計できる。',
  usage: '移行バッチが途中で失敗したとき、「どこまで入ったか分からない」状態を作らないのがトランザクションです。',
  terms: [['トランザクション', '複数の処理を「全部成功」か「全部取り消し」にまとめる単位'], ['BEGIN / COMMIT', '開始 / 確定'], ['ROLLBACK', '取り消し（BEGIN時点に戻る）'], ['SAVEPOINT', 'トランザクション内の途中地点。ROLLBACK TO で途中まで戻せる'], ['冪等性', '何度実行しても同じ結果'], ['切り戻し', '移行を中止して旧システムに戻すこと']],
  syntax: 'BEGIN;\n  ...処理...\n  SAVEPOINT s1;\n  ...処理...\n  ROLLBACK TO SAVEPOINT s1;  -- s1 まで戻る\nCOMMIT;  -- または ROLLBACK;',
  examples: [
    { title: 'ROLLBACK で取り消し', sql: "BEGIN;\nDELETE FROM order_items WHERE order_id = 1001;\nSELECT COUNT(*) AS 削除後 FROM order_items WHERE order_id = 1001;\nROLLBACK;\nSELECT COUNT(*) AS 取り消し後 FROM order_items WHERE order_id = 1001;" },
    { title: 'エラーが起きるとトランザクションは中断状態になる', expectError: true, sql: "BEGIN;\nUPDATE products SET stock = stock - 1 WHERE product_id = 1;\nSELECT 1/0;  -- エラー\n-- この後は ROLLBACK するまで何も実行できない（エディタで続けて確認してみよう）" },
  ],
  explanation: `**トランザクションの状態**: エディタ上部に「トランザクション中」と表示されている間は、変更は確定していません。

**この練習環境（PGlite）での注意**
- 1つの接続（セッション）だけで動いているため、**他の接続から見える・見えない（分離レベル）やロック待ち** は体験できません（第20章で説明のみ）。
- BEGIN / COMMIT / ROLLBACK / SAVEPOINT / ROLLBACK TO / RELEASE は実際に動作します。
- PostgreSQLでは DDL（CREATE / DROP）もトランザクションで取り消せます。**Oracle や MySQL では DDL は自動コミット**されるなど、DBにより挙動が違います。

**途中失敗への備え（移行バッチ設計）**
1. テーブル単位・バッチ単位でトランザクションを区切る（全部を1トランザクションにすると、失敗時のやり直しが大きく、ログも膨らむ）
2. 再実行しても重複しない（NOT EXISTS / ON CONFLICT）
3. どこまで完了したか記録する（移行ログテーブル）
4. 失敗したら：原因調査 → 修正 → 未完了分だけ再実行 → 検証
5. 切り戻し判断の基準（時間・不整合件数）を事前に決めておく`,
  exercises: [
    { id: 'e1', type: 'write', title: 'BEGIN と COMMIT', prompt: "トランザクションの中で2件の商品を登録して確定してください: (21, 'ペンタブレット', '周辺機器', 9800, 10) と (22, 'スピーカー', 'オーディオ', 5980, 25)。列は product_id, product_name, category, price, stock。", compare: 'none',
      answer: "BEGIN;\nINSERT INTO products (product_id, product_name, category, price, stock) VALUES (21, 'ペンタブレット', '周辺機器', 9800, 10);\nINSERT INTO products (product_id, product_name, category, price, stock) VALUES (22, 'スピーカー', 'オーディオ', 5980, 25);\nCOMMIT;",
      mustInclude: [['\\bbegin\\b|start\\s+transaction', 'BEGIN でトランザクションを開始してください'], ['\\bcommit\\b', 'COMMIT で確定してください']], hints: ['BEGIN; ... ; COMMIT;'], explain: 'COMMIT するまで変更は確定しません。COMMIT を忘れると、採点では取り消されます。' },
    { id: 'e2', type: 'write', title: 'ROLLBACK', prompt: '誤って order_items を全件削除してしまうSQLを、トランザクション内で実行し **ROLLBACK で取り消して** ください。最後に order_items の件数を SELECT COUNT(*) で表示すること。',
      answer: 'BEGIN;\nDELETE FROM order_items;\nROLLBACK;\nSELECT COUNT(*) FROM order_items;', mustInclude: [['\\brollback\\b', 'ROLLBACK を使ってください'], ['delete\\s+from\\s+order_items', 'DELETE FROM order_items を実行してから取り消してください']],
      hints: ['BEGIN; DELETE FROM order_items; ROLLBACK; SELECT COUNT(*) FROM order_items;'], explain: '28件に戻っています。本番作業では、更新系SQLを BEGIN の中で実行し、影響件数を見てから COMMIT/ROLLBACK を判断します。' },
    { id: 'e3', type: 'write', title: 'SAVEPOINT', prompt: "1つのトランザクションで次を行ってください。\n① PCカテゴリの商品価格を1.1倍（UPDATE）\n② SAVEPOINT を作る\n③ 商品ID 7 を削除\n④ ③だけを取り消す（ROLLBACK TO SAVEPOINT）\n⑤ COMMIT\n結果として、PCの値上げは確定し、商品7は残ります。", compare: 'none',
      answer: "BEGIN;\nUPDATE products SET price = price * 1.1 WHERE category = 'PC';\nSAVEPOINT before_delete;\nDELETE FROM products WHERE product_id = 7;\nROLLBACK TO SAVEPOINT before_delete;\nCOMMIT;",
      mustInclude: [['\\bsavepoint\\b', 'SAVEPOINT を使ってください'], ['rollback\\s+to', 'ROLLBACK TO SAVEPOINT を使ってください']], hints: ['SAVEPOINT 名前; … ROLLBACK TO SAVEPOINT 名前;'], explain: '大きな移行処理の中で「この段階からやり直す」ための仕組みです。' },
    { id: 'e4', type: 'write', title: '再実行で差分を反映（UPSERT）', dataset: 'migration', prompt: "顧客は移行済みですが、その後旧システムで C0001 の氏名が変更されました。顧客移行SQLを **ON CONFLICT (legacy_cust_no) DO UPDATE** を使って再実行可能な形にし、変更を反映してください（name, email, phone, prefecture, status, points を更新）。何度実行しても結果が同じになること。", compare: 'none',
      setup: MIG_CUSTOMERS + "\nUPDATE legacy_customers SET cust_nm = '佐藤 花子（新姓）' WHERE cust_no = 'C0001';",
      answer: MIG_CUSTOMERS.replace(/\n  AND pg_input_is_valid\(s\.reg_ymd, 'date'\);/, "\n  AND pg_input_is_valid(s.reg_ymd, 'date')\nON CONFLICT (legacy_cust_no) DO UPDATE\n  SET name = EXCLUDED.name, email = EXCLUDED.email, phone = EXCLUDED.phone,\n      prefecture = EXCLUDED.prefecture, status = EXCLUDED.status, points = EXCLUDED.points;"),
      mustInclude: [['on\\s+conflict', 'ON CONFLICT を使ってください']],
      hints: ['第17章 e2 の移行SQLの最後に ON CONFLICT (legacy_cust_no) DO UPDATE SET name = EXCLUDED.name, ... を付けます。', 'EXCLUDED は「登録しようとした新しい値」を表します。'],
      explain: 'UPSERT（あれば更新・なければ登録）は差分移行・再実行の強い味方です。ただし「何を上書きしてよいか」は業務ルールで決めます（新システム側で更新された値を消してしまう危険）。' },
    { id: 'e5', type: 'choice', title: 'ロールバックの範囲', prompt: '10万件の移行を1つのトランザクションで実行し、9万件目でエラーになった。PostgreSQLではどうなる？',
      options: ['9万件は登録済みのまま残る', 'トランザクション全体が取り消され、0件の状態に戻る（ROLLBACKが必要）', '自動的にエラーの行だけスキップされる', 'エラーの行以外はCOMMITされる'], answerIndex: 1,
      hints: ['トランザクションは「全部か、ゼロか」。'], explain: '全部取り消されます。安全ですが、やり直しに同じ時間がかかります。そのため大量データは「バッチ単位のトランザクション＋冪等な再実行」で設計します（第20章）。' },
    { id: 'e6', type: 'choice', title: '切り戻し計画', prompt: '切り戻し計画で事前に決めておくべきこととして最も重要なのは？',
      options: ['担当者の好きなタイミングで判断する', '切り戻しの判断基準（期限時刻・許容できない不整合の条件）と、判断者・手順・所要時間', '切り戻しはしない前提で考える', '移行SQLのファイル名'], answerIndex: 1,
      hints: ['夜中の作業中に迷わないために。'], explain: '「何時までに検証が終わらなければ切り戻す」「重要データの不整合が1件でもあれば切り戻す」など、客観的な基準を決めます（成果物テンプレートあり）。' },
  ],
  mistakes: ['COMMIT 忘れ（接続を切ると取り消される）', 'エラー後に ROLLBACK せず次のSQLを実行して「current transaction is aborted」', '巨大な1トランザクションで失敗時の影響が大きい'],
  errorChecks: ['current transaction is aborted → ROLLBACK（または ROLLBACK TO SAVEPOINT）', 'savepoint does not exist → BEGIN の中で作ったか、名前のスペル', 'there is no transaction in progress → BEGIN していないのに COMMIT/ROLLBACK した（警告のみ）'],
  practice: ['本番作業は「BEGIN → 更新 → 件数確認 → COMMIT」をペアで声に出して確認する現場もあります。', '長時間のトランザクションは他の処理をブロックしたり、ログを増やしたりします。'],
  quiz: [
    { q: 'エラーで中断したトランザクションで次にすべきことは？', options: ['COMMIT', 'ROLLBACK', '何もしない'], answer: 1, explain: 'ROLLBACK で抜けます。' },
    { q: 'MySQL(InnoDB) の DROP TABLE は ROLLBACK で戻せる？', options: ['戻せる', '戻せない（暗黙のコミット）'], answer: 1, explain: 'DBによってDDLの扱いが違うので、本番環境のDBの仕様を必ず確認します。' },
  ],
},
// ------------------------------------------------------------------
{
  id: 'ch20', level: 3, chapter: 20, title: '大量データの移行', difficulty: 4, minutes: 80, prereq: ['ch19'], dataset: 'bulk',
  summary: '一括と分割、バッチ処理、主キー範囲での分割、時間計測・見積もり、インデックスと書き込み、ロック、ログ、再実行',
  goal: '大量データを主キー範囲で分割して移行し、件数・時間を見積もり、バッチ単位で再実行・検証できる。',
  usage: '本番の停止時間（例: 土曜22時〜日曜6時）に収まるかは、リハーサルでの実測と見積もりで決まります。',
  terms: [['一括移行', '全件を1回で移行。シンプルだが失敗時のやり直しが大きい'], ['分割移行（バッチ）', '主キー範囲などで小分けに移行。進捗管理・再実行がしやすい'], ['スループット', '1秒あたりの処理件数'], ['ロック', '同時に同じデータを変更しないための仕組み。大量更新は他の処理を待たせる'], ['WAL / トランザクションログ', '変更の記録。大量更新でディスクを消費する']],
  syntax: "INSERT INTO 移行先 (...)\nSELECT ... FROM 移行元\nWHERE id BETWEEN 1 AND 5000;      -- バッチ1\n-- 次は 5001〜10000 ...",
  examples: [
    { title: 'データ量の確認（件数・サイズ）', sql: "SELECT COUNT(*) AS rows,\n       pg_size_pretty(pg_total_relation_size('legacy_sales')) AS size,\n       MIN(sale_no), MAX(sale_no)\nFROM legacy_sales;" },
    { title: '分割の範囲を計算する（5000件ずつ）', sql: 'SELECT b AS batch_no, (b - 1) * 5000 + 1 AS from_no, b * 5000 AS to_no\nFROM generate_series(1, (SELECT CEIL(MAX(sale_no) / 5000.0)::int FROM legacy_sales)) AS b;' },
  ],
  explanation: `この演習の legacy_sales は既定で **2万件**（移行ラボのシナリオJで 1,000〜200,000件に変更可）。ブラウザ内で動くため、本番の性能とは大きく異なります。**件数と時間の「比率」で見積もる練習** と考えてください。

**見積もりの考え方**
- リハーサルで1万件 = 0.8秒なら、1,000万件 ≒ 800秒（≒13分）…ただし件数が増えるとメモリ・インデックス・ログの影響で比例しないことが多い → 余裕（×1.5〜2）を見る

**分割移行の設計**
1. 主キー（連番）の範囲でバッチを切る（WHERE sale_no BETWEEN a AND b）
2. バッチごとにトランザクション → 失敗時はそのバッチだけやり直し
3. 冪等にする（NOT EXISTS / ON CONFLICT DO NOTHING）
4. 進捗（どのバッチまで完了したか）を記録
5. 移行後の検証（件数・合計）もバッチ単位 or 全体で

**この環境で体験できないこと**: 実際のロック待ち、ディスク容量不足、ネットワーク転送時間、本番並みのデータ量（安全のため最大20万件・実行は10秒で打ち切り）。`,
  exercises: [
    { id: 'e1', type: 'investigate', title: '件数と変換不能件数', prompt: "legacy_sales の総件数 total と、金額 amt_txt が整数に変換できない件数 invalid を1行で表示してください。", bulkRows: 20000,
      answer: "SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE amt_txt !~ '^[0-9]+$') AS invalid FROM legacy_sales;",
      hints: ["amt_txt !~ '^[0-9]+$'（!~ は「一致しない」）"], explain: '20000件中20件が変換不能（\'ERR\'）。大量データでも事前に変換不能件数を数えておけば、移行中の失敗を防げます。' },
    { id: 'e2', type: 'write', title: '主キー範囲でバッチ移行', prompt: "最初のバッチとして sale_no が **1〜5000** の行を sales に移行してください（変換できない金額の行は対象外）。\n列: sale_id = sale_no、customer_code = cust_no、sale_date = sale_ymd を日付に、amount = amt_txt を数値に、region_cd = region_cd", compare: 'none', bulkRows: 20000,
      answer: "INSERT INTO sales (sale_id, customer_code, sale_date, amount, region_cd)\nSELECT sale_no, cust_no, to_date(sale_ymd, 'YYYYMMDD'), amt_txt::numeric, region_cd\nFROM legacy_sales\nWHERE sale_no BETWEEN 1 AND 5000 AND amt_txt ~ '^[0-9]+$';",
      hints: ['WHERE sale_no BETWEEN 1 AND 5000', "AND amt_txt ~ '^[0-9]+$'"], explain: '4995件（ERRの5件を除く）。実行時間（エディタに表示）を記録し、全体の時間を見積もりましょう。' },
    { id: 'e3', type: 'write', title: '再実行可能なバッチ', prompt: "バッチ2（5001〜10000）の途中で障害が起き、5001〜6000 だけ登録されています。バッチ2（5001〜10000）を **再実行しても重複しない形で** 実行してください。", compare: 'none', bulkRows: 20000,
      setup: "INSERT INTO sales SELECT sale_no, cust_no, to_date(sale_ymd, 'YYYYMMDD'), amt_txt::numeric, region_cd FROM legacy_sales WHERE sale_no BETWEEN 1 AND 6000 AND amt_txt ~ '^[0-9]+$';",
      answer: "INSERT INTO sales (sale_id, customer_code, sale_date, amount, region_cd)\nSELECT sale_no, cust_no, to_date(sale_ymd, 'YYYYMMDD'), amt_txt::numeric, region_cd\nFROM legacy_sales\nWHERE sale_no BETWEEN 5001 AND 10000 AND amt_txt ~ '^[0-9]+$'\nON CONFLICT (sale_id) DO NOTHING;",
      mustInclude: [['not\\s+exists|on\\s+conflict', 'NOT EXISTS か ON CONFLICT で重複を防いでください']], hints: ['ON CONFLICT (sale_id) DO NOTHING'], explain: 'バッチ単位で冪等にしておけば、「失敗したバッチをもう一度流す」だけで復旧できます。' },
    { id: 'e4', type: 'write', title: '大量データの検証', prompt: "全件の移行が終わった状態です。移行対象（金額が整数）の件数 src_cnt・金額合計 src_sum と、sales の件数 dst_cnt・金額合計 dst_sum を1行で表示してください。", bulkRows: 20000,
      setup: "INSERT INTO sales SELECT sale_no, cust_no, to_date(sale_ymd, 'YYYYMMDD'), amt_txt::numeric, region_cd FROM legacy_sales WHERE amt_txt ~ '^[0-9]+$';",
      answer: "SELECT (SELECT COUNT(*) FROM legacy_sales WHERE amt_txt ~ '^[0-9]+$') AS src_cnt, (SELECT SUM(amt_txt::numeric) FROM legacy_sales WHERE amt_txt ~ '^[0-9]+$') AS src_sum, (SELECT COUNT(*) FROM sales) AS dst_cnt, (SELECT SUM(amount) FROM sales) AS dst_sum;",
      hints: ['スカラーサブクエリを4つ。'], explain: '大量データでは全件の目視は不可能なので、件数・合計・最小最大・キー範囲・サンプリングで検証します。' },
    { id: 'e5', type: 'choice', title: 'インデックスと書き込み性能', prompt: '1億件を移行先に登録する。移行先テーブルには検索用インデックスが5つある。性能面で一般的に有効な方法は？',
      options: ['インデックスをさらに増やす', '（主キー等の重複検出に必要なもの以外の）検索用インデックスを移行後に作成する。ただし作成時間も見積もる', '全件を1つのINSERT文で入れる', 'インデックスは性能に無関係'], answerIndex: 1,
      hints: ['1行登録するたびに5つの索引も更新されます。'], explain: 'インデックス作成時間も停止時間に含まれる点に注意。必ずリハーサルで実測します。' },
    { id: 'e6', type: 'choice', title: 'ロック', prompt: '稼働中のシステムで大量の UPDATE を1トランザクションで行うと、何が起きやすい？',
      options: ['他の処理が対象行のロック解除を待たされ、画面が固まる', '何も起きない', 'データが自動で圧縮される', 'インデックスが消える'], answerIndex: 0,
      hints: ['同じ行を更新しようとする処理は待たされます。'], explain: '稼働中の大量更新は小分けにし、時間帯を選びます。この練習環境は1接続のためロック待ちは発生しません。' },
  ],
  mistakes: ['リハーサルをせずに所要時間を推測で決める', 'すべてを1トランザクションにしてログ・メモリを圧迫', '分割範囲の境界（BETWEEN の両端）で重複・漏れ'],
  errorChecks: ['実行時間の上限 → バッチを小さく', 'out of memory → 1回の処理件数を減らす'],
  practice: ['移行バッチの実行ログ（開始・終了時刻、件数、結果）を必ず残します。', '本番と同じ件数・同じ性能のリハーサル環境が理想。用意できない場合は余裕を大きく見積もります。'],
  quiz: [
    { q: 'BETWEEN 1 AND 5000 の次のバッチは？', options: ['BETWEEN 5000 AND 10000', 'BETWEEN 5001 AND 10000'], answer: 1, explain: 'BETWEEN は両端を含むので、5000 を重複させないよう 5001 から。' },
  ],
},
// ------------------------------------------------------------------
{
  id: 'ch21', level: 3, chapter: 21, title: 'SQLの性能改善', difficulty: 4, minutes: 70, prereq: ['ch20'], dataset: 'bulk',
  summary: '実行計画、EXPLAIN / EXPLAIN ANALYZE、インデックス、全件走査、JOINの性能、使われにくい条件、改善前後の比較',
  goal: 'EXPLAIN で実行計画を読み、インデックスが使われる書き方に改善し、効果を測定できる。',
  usage: '「検証SQLが遅くて停止時間内に終わらない」「移行SQLが本番で想定の10倍かかった」…原因を突き止めるのが実行計画です。',
  terms: [['実行計画', 'DBがSQLをどう処理するかの手順（どの順に、どの方法で読むか）'], ['EXPLAIN', '実行計画を表示（実行はしない）'], ['EXPLAIN ANALYZE', '実際に実行して、実測時間付きで表示（UPDATE等も実行されるので注意）'], ['Seq Scan', 'テーブルを全件読む（全件走査）'], ['Index Scan / Bitmap Index Scan', 'インデックスを使って必要な行だけ読む'], ['cost', '実行計画上の見積もりコスト（単位は相対値）']],
  syntax: 'EXPLAIN SELECT ...;\nEXPLAIN ANALYZE SELECT ...;\n-- 更新系は取り消し前提で\nBEGIN; EXPLAIN ANALYZE UPDATE ...; ROLLBACK;',
  examples: [
    { title: '全件走査（Seq Scan）の実行計画', sql: "EXPLAIN ANALYZE\nSELECT COUNT(*) FROM legacy_sales WHERE cust_no = 'C0005';" },
    { title: 'インデックスを作って比較', sql: "CREATE INDEX idx_ls_cust ON legacy_sales(cust_no);\nANALYZE legacy_sales;\nEXPLAIN ANALYZE\nSELECT COUNT(*) FROM legacy_sales WHERE cust_no = 'C0005';" },
  ],
  explanation: `**実行計画の読み方（最低限）**
- 一番内側（インデントが深い行）から実行されます
- \`Seq Scan on テーブル\` … 全件読み。大きなテーブルで少数行を探すなら改善候補
- \`Index Scan\` / \`Bitmap Heap Scan\` … インデックス利用
- \`actual time=... rows=...\`（ANALYZE時） … 実測。見積もり rows と実測 rows が大きく違う → 統計情報が古い（ANALYZE）

**インデックスが使われにくい条件**
- 列に関数や計算をかける: \`WHERE substr(sale_ymd, 1, 6) = '202301'\` → \`WHERE sale_ymd BETWEEN '20230101' AND '20230131'\`
- 先頭が % の LIKE: \`LIKE '%abc'\`
- 型が違う比較（暗黙の型変換）
- 該当行が多すぎる（全体の大半）→ 全件読む方が速いとDBが判断

**この環境（PGlite）での注意**: EXPLAIN / EXPLAIN ANALYZE は実際に動きます。ただし、ブラウザ内の単一プロセスで、データも小さいため、時間の絶対値は本番の参考になりません。**計画の形（Seq Scan → Index Scan）の変化と、相対的な差** を見てください。`,
  exercises: [
    { id: 'e1', type: 'write', title: 'EXPLAIN を実行', prompt: "legacy_sales から cust_no = 'C0005' の行数を数えるSQLの実行計画を EXPLAIN ANALYZE で表示してください（結果の内容は採点しません。Seq Scan を確認しましょう）。", compare: 'none', bulkRows: 20000,
      answer: "EXPLAIN ANALYZE SELECT COUNT(*) FROM legacy_sales WHERE cust_no = 'C0005';", mustInclude: [['^\\s*explain\\b', 'EXPLAIN を使ってください']],
      hints: ['先頭に EXPLAIN ANALYZE を付けるだけです。'], explain: 'Seq Scan on legacy_sales と表示されます。Filter で何行捨てたか（Rows Removed by Filter）にも注目。' },
    { id: 'e2', type: 'write', title: 'インデックスの作成', prompt: '販売日での検索を速くするため、legacy_sales の **sale_ymd** にインデックスを作成してください（名前は自由）。', compare: 'none', bulkRows: 20000,
      check: "SELECT count(*) AS idx FROM pg_indexes WHERE tablename = 'legacy_sales' AND indexdef LIKE '%(sale_ymd)'",
      answer: 'CREATE INDEX idx_legacy_sales_ymd ON legacy_sales(sale_ymd);', hints: ['CREATE INDEX 名前 ON テーブル(列);'], explain: '作成後は ANALYZE で統計情報を更新すると、適切な計画が選ばれやすくなります。' },
    { id: 'e3', type: 'fix', title: 'インデックスが使われない書き方を修正', prompt: "sale_ymd にインデックスがある状態です。2023年1月の件数を数えるこのSQLは、列に関数をかけているためインデックスを使えません。**同じ結果のまま**、インデックスを使える条件に書き換えてください。", bulkRows: 20000,
      setup: 'CREATE INDEX idx_legacy_sales_ymd ON legacy_sales(sale_ymd);\nANALYZE legacy_sales;',
      starter: "SELECT COUNT(*)\nFROM legacy_sales\nWHERE substr(sale_ymd, 1, 6) = '202301';", answer: "SELECT COUNT(*) FROM legacy_sales WHERE sale_ymd BETWEEN '20230101' AND '20230131';",
      mustNotInclude: [['substr\\s*\\(\\s*sale_ymd|left\\s*\\(\\s*sale_ymd|to_char|::\\s*date|to_date', '列に関数や型変換をかけない条件にしてください']],
      hints: ["範囲条件: sale_ymd BETWEEN '20230101' AND '20230131'", "LIKE '202301%' でも（ロケール設定によっては）インデックスが使えます。"], explain: 'EXPLAIN で Bitmap Index Scan に変わることを確認しましょう。YYYYMMDD 形式の文字列なので範囲比較で正しく絞れます。' },
    { id: 'e4', type: 'choice', title: 'EXPLAIN ANALYZE の注意', prompt: '本番DBで EXPLAIN ANALYZE DELETE FROM big_table WHERE ...; を実行するとどうなる？',
      options: ['計画が表示されるだけで削除はされない', '実際に削除が実行される（BEGIN〜ROLLBACKで囲まないと確定する）', 'エラーになる', '自動でロールバックされる'], answerIndex: 1,
      hints: ['ANALYZE は「実際に実行して測る」。'], explain: '更新系の EXPLAIN ANALYZE は BEGIN; … ROLLBACK; で囲むのが鉄則です。' },
    { id: 'e5', type: 'choice', title: '遅いSQLの分析手順', prompt: '移行検証SQLが遅い。最初にやるべきことは？',
      options: ['とりあえずインデックスを全列に作る', 'EXPLAIN（可能なら ANALYZE）で、どの処理（全件走査・JOIN・ソート）に時間がかかっているかを確認する', 'サーバーを買い替える', 'SQLを短く書き直す'], answerIndex: 1,
      hints: ['推測するな、計測せよ。'], explain: 'ボトルネックを特定してから対策します。改善前後の実行計画と時間を記録しておくと、レビュー資料になります。' },
  ],
  mistakes: ['推測でインデックスを追加する', 'EXPLAIN ANALYZE を本番の更新系SQLでそのまま実行', '小さなデータでの速さを本番でも同じと考える'],
  errorChecks: ['計画が変わらない → ANALYZE で統計情報を更新、条件の型・関数を確認'],
  practice: ['改善前後で「実行計画」「実行時間」「結果件数（同じであること）」を記録します。', 'インデックスは検索を速くする代わりに更新を遅くする、というトレードオフを常に意識します。'],
  quiz: [
    { q: "WHERE lower(email) = 'a@x.com' で email の通常インデックスは使われる？", options: ['使われる', '使われにくい（関数インデックスが必要）'], answer: 1, explain: 'CREATE INDEX ... ON t (lower(email)) のような関数インデックスなら使えます。' },
  ],
},
];
