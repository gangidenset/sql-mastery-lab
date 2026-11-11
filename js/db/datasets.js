// =============================================================
// 練習用データセット定義
//  - base      : 新システム（customers / orders ...）にデータが入った状態
//  - migration : 新システムのテーブルが空。旧システム(legacy_*)から移行する練習用
//  - bulk      : migration + 大量データ（legacy_sales）。件数は引数で制御（上限あり）
// すべてアプリ内のPostgreSQL（PGlite）上にだけ作成されます。外部DBには接続しません。
// =============================================================

export const BULK_LIMITS = { min: 1000, max: 200000, default: 20000 };

// 現在のDBを空にするSQL（ユーザーが作ったスキーマも含めて削除）
export const WIPE_SQL = `
DO $$
DECLARE s text;
BEGIN
  FOR s IN SELECT nspname FROM pg_namespace
           WHERE nspname NOT IN ('pg_catalog','information_schema','pg_toast')
             AND nspname NOT LIKE 'pg\\_temp%' AND nspname NOT LIKE 'pg\\_toast\\_temp%'
  LOOP
    EXECUTE format('DROP SCHEMA %I CASCADE', s);
  END LOOP;
END $$;
CREATE SCHEMA public;
SET search_path TO public;
`;

const SCHEMA_SQL = `
-- ---------- 新システム ----------
CREATE TABLE products (
  product_id   integer PRIMARY KEY,
  product_name varchar(100) NOT NULL,
  category     varchar(30)  NOT NULL,
  price        numeric(10,0) NOT NULL CHECK (price >= 0),
  stock        integer NOT NULL DEFAULT 0,
  is_active    boolean NOT NULL DEFAULT true
);
COMMENT ON TABLE products IS '商品マスタ（新システム）。価格は税込。';

CREATE TABLE customers (
  customer_id    serial PRIMARY KEY,
  legacy_cust_no varchar(10) UNIQUE,
  name           varchar(100) NOT NULL,
  email          varchar(255) UNIQUE,
  phone          varchar(20),
  prefecture     varchar(10),
  postal_code    varchar(8),
  address        varchar(200),
  status         varchar(10) NOT NULL DEFAULT 'ACTIVE'
                 CHECK (status IN ('ACTIVE','INACTIVE','SUSPENDED')),
  points         integer NOT NULL DEFAULT 0 CHECK (points >= 0),
  registered_at  date NOT NULL
);
COMMENT ON TABLE customers IS '顧客（新システム）。legacy_cust_no は旧システムの顧客番号（追跡用）。';

CREATE TABLE orders (
  order_id      serial PRIMARY KEY,
  legacy_ord_no varchar(10) UNIQUE,
  customer_id   integer NOT NULL REFERENCES customers(customer_id),
  order_date    date NOT NULL,
  status        varchar(10) NOT NULL
                CHECK (status IN ('NEW','SHIPPED','COMPLETED','CANCELLED')),
  total_amount  numeric(12,0) NOT NULL DEFAULT 0
);
COMMENT ON TABLE orders IS '注文（新システム）。total_amount は税込金額。';
CREATE INDEX idx_orders_customer ON orders(customer_id);

CREATE TABLE order_items (
  order_id   integer NOT NULL REFERENCES orders(order_id),
  line_no    integer NOT NULL,
  product_id integer NOT NULL REFERENCES products(product_id),
  quantity   integer NOT NULL CHECK (quantity > 0),
  unit_price numeric(10,0) NOT NULL,
  PRIMARY KEY (order_id, line_no)
);
COMMENT ON TABLE order_items IS '注文詳細（新システム）。1注文に複数行。';

CREATE TABLE code_master (
  code_type varchar(20) NOT NULL,
  old_code  varchar(10) NOT NULL,
  new_code  varchar(20),
  label     varchar(50) NOT NULL,
  PRIMARY KEY (code_type, old_code)
);
COMMENT ON TABLE code_master IS '旧コード→新コードの対応表。new_code が NULL のものは移行対象外。';

CREATE TABLE migration_rejects (
  reject_id    serial PRIMARY KEY,
  source_table varchar(50) NOT NULL,
  source_key   varchar(50) NOT NULL,
  reason       varchar(200) NOT NULL
);
COMMENT ON TABLE migration_rejects IS '移行対象外・移行できなかったデータの記録用（空で用意）。';

-- ---------- 旧システム（制約なし＝ステージング扱い） ----------
CREATE TABLE legacy_customers (
  cust_no   varchar(10),
  cust_nm   varchar(100),
  mail_addr varchar(255),
  tel_no    varchar(20),
  pref_cd   varchar(2),
  sts_kbn   char(1),
  reg_ymd   varchar(10),
  point_bal varchar(10),
  del_flg   char(1)
);
COMMENT ON TABLE legacy_customers IS '旧顧客（旧システム）。日付・数値も文字列で保存。制約なし。';

CREATE TABLE legacy_customer_addresses (
  cust_no   varchar(10),
  addr_type char(1),
  zip_cd    varchar(7),
  addr1     varchar(100),
  addr2     varchar(100)
);
COMMENT ON TABLE legacy_customer_addresses IS '旧顧客住所。addr_type 1=自宅 2=勤務先（1顧客に複数行あり）。';

CREATE TABLE legacy_orders (
  ord_no  varchar(10),
  cust_no varchar(10),
  ord_ymd varchar(8),
  ord_sts varchar(2),
  amt_txt varchar(20)
);
COMMENT ON TABLE legacy_orders IS '旧注文。amt_txt は「税抜」金額の文字列（新システムは税込）。';

CREATE TABLE legacy_order_details (
  ord_no       varchar(10),
  line_no      varchar(3),
  item_cd      varchar(10),
  qty_txt      varchar(10),
  unit_prc_txt varchar(10)
);
COMMENT ON TABLE legacy_order_details IS '旧注文明細。item_cd は code_master(ITEM) で新商品IDに変換。単価は税込。';
`;

const MASTER_DATA_SQL = `
INSERT INTO products VALUES
 (1,'ノートPC 14インチ','PC',128000,12,true),
 (2,'ワイヤレスマウス','周辺機器',2980,150,true),
 (3,'メカニカルキーボード','周辺機器',15800,40,true),
 (4,'27インチモニター','モニター',39800,20,true),
 (5,'USB-Cハブ','周辺機器',4980,0,true),
 (6,'外付けSSD 1TB','ストレージ',13800,35,true),
 (7,'Webカメラ','周辺機器',6980,18,false),
 (8,'デスクトップPC','PC',158000,5,true),
 (9,'HDMIケーブル 2m','ケーブル',1280,300,true),
 (10,'ノイズキャンセリングヘッドホン','オーディオ',32800,9,true);

INSERT INTO code_master VALUES
 ('CUST_STATUS','1','ACTIVE','有効'),
 ('CUST_STATUS','2','INACTIVE','休眠'),
 ('CUST_STATUS','3','SUSPENDED','利用停止'),
 ('CUST_STATUS','9',NULL,'退会（移行対象外）'),
 ('ORDER_STATUS','01','NEW','受付'),
 ('ORDER_STATUS','02','SHIPPED','出荷済'),
 ('ORDER_STATUS','03','COMPLETED','完了'),
 ('ORDER_STATUS','09','CANCELLED','キャンセル'),
 ('PREF','01','北海道','北海道'),
 ('PREF','04','宮城県','宮城県'),
 ('PREF','13','東京都','東京都'),
 ('PREF','14','神奈川県','神奈川県'),
 ('PREF','23','愛知県','愛知県'),
 ('PREF','27','大阪府','大阪府'),
 ('PREF','40','福岡県','福岡県'),
 ('ITEM','P001','1','ノートPC 14インチ'),
 ('ITEM','P002','2','ワイヤレスマウス'),
 ('ITEM','P003','3','メカニカルキーボード'),
 ('ITEM','P004','4','27インチモニター'),
 ('ITEM','P008','8','デスクトップPC'),
 ('ITEM','P009','9','HDMIケーブル 2m');

INSERT INTO legacy_customers VALUES
 ('C0001','佐藤 花子','hanako.sato@example.com','09011110001','13','1','20190401','1200','0'),
 ('C0002','鈴木 一郎','ichiro.suzuki@example.com','','27','1','20190512','300','0'),
 ('C0003','高橋 美咲','misaki.t@example.com','08022220003','40','1','20190720','0','0'),
 ('C0004','田中 健',NULL,'09033330004','13','2','20181103','50','0'),
 ('C0005','伊藤 さくら','sakura.ito@example.com',NULL,'01','1','20200115','980','0'),
 ('C0006','渡辺 翔',' sho.watanabe@example.com ','07044440006','','1','20200308','','0'),
 ('C0007','山本 結衣','yui.yamamoto@example.com','09055550007','27','3','20200630','0','0'),
 ('C0008','中村 大輔','daisuke.n@example.com','08066660008','23','1','20200901','2500','0'),
 ('C0009','小林 陽菜','hina.k@example.com',NULL,'40','1','20210214','150','0'),
 ('C0010','加藤 蓮','ren.kato@example.com','09077770010','13','2','20210401','0','0'),
 ('C0011','吉田 美月','mizuki.y@example.com','09088880011','14','1','20210819','640','0'),
 ('C0012','退会 太郎','taikai@example.com',NULL,'13','9','20170101','0','0'),
 ('C0013','佐々木 優','yu.sasaki@example.com','08099990013','04','1','20210322','75','0'),
 ('C0014','松本 葵','aoi.matsumoto@example.com',NULL,'40','1','20210631','0','0'),
 ('C0015','井上 拓海','TAKUMI.INOUE@EXAMPLE.COM','07000000015','27','1','20210927','310','0'),
 ('C0016','中村 大輔','daisuke.n@example.com','08066660008','23','1','20220105','0','0'),
 ('C0017','テスト ユーザー','test@example.com',NULL,'13','1','20220201','0','1'),
 ('C0018','木村 拓也','takuya.k@example.com','09012340018','13','1','2022/03/10','1,500','0'),
 ('C0019','林 美咲','misaki.h@example.com',NULL,'99','1','20220415','abc','0'),
 ('C0020','清水 健太','kenta.s@example.com','08043210020','40','1','20220520','-100','0');

INSERT INTO legacy_customer_addresses VALUES
 ('C0001','1','1000001','東京都千代田区千代田1-1',NULL),
 ('C0001','2','1000005','東京都千代田区丸の内1-9-1','本社ビル8F'),
 ('C0002','1','5300001','大阪府大阪市北区梅田3-1-1',NULL),
 ('C0003','1','8120011','福岡県福岡市博多区博多駅前2-1-1','ハイツ博多201'),
 ('C0005','1','0600001','北海道札幌市中央区北一条西2',NULL),
 ('C0008','1','4500002','愛知県名古屋市中村区名駅1-1-4',NULL),
 ('C0008','2','4600008','愛知県名古屋市中区栄3-5-1','栄タワー12F'),
 ('C0011','1','2200012','神奈川県横浜市西区みなとみらい2-2-1',NULL),
 ('C0013','1','9800021','宮城県仙台市青葉区中央1-1-1',NULL),
 ('C9999','1','1500001','東京都渋谷区神宮前1-1-1',NULL);

INSERT INTO legacy_orders VALUES
 ('O0001','C0001','20230110','03','10000'),
 ('O0002','C0002','20230115','03','2,700'),
 ('O0003','C0001','20230203','03','36182'),
 ('O0004','C0003','20230220','09','29818'),
 ('O0005','C0005','20230305','03','17073'),
 ('O0006','C0008','20230318','02','216000'),
 ('O0007','C0008','20230402','01','25091'),
 ('O0008','C0002','20230425','03','¥5800'),
 ('O0009','C9999','20230511','03','12000'),
 ('O0010','C0011','20230530','99','29818'),
 ('O0011','C0001','20230614','03','N/A'),
 ('O0012','C0013','20230701','01','14364'),
 ('O0013','C0012','20230719','03','6345'),
 ('O0014','C0015','20230808','09','36182'),
 ('O0015','C0008','20230830','03',''),
 ('O0016','C0017','20230901','03','1000'),
 ('O0017','C0009','20231331','03','5000'),
 ('O0018','C0016','20231010','03','8000');

INSERT INTO legacy_order_details VALUES
 ('O0001','1','P002','2','2980'),
 ('O0003','1','P004','1','39800'),
 ('O0005','1','P003','1','15800'),
 ('O0005','2','P002','1','2980'),
 ('O0006','1','P008','1','158000'),
 ('O0006','2','P004','2','39800'),
 ('O0007','1','P009','5','1280'),
 ('O0009','1','P001','1','128000'),
 ('O0012','1','P003','1','15800'),
 ('O0018','1','P009','5','1280'),
 ('O0018','2','P777','1','999');
`;

const BASE_DATA_SQL = `
INSERT INTO customers (customer_id,name,email,phone,prefecture,postal_code,address,status,points,registered_at) VALUES
 (1,'佐藤 花子','hanako.sato@example.com','090-1111-0001','東京都','100-0001','東京都千代田区千代田1-1','ACTIVE',1200,'2021-04-01'),
 (2,'鈴木 一郎','ichiro.suzuki@example.com',NULL,'大阪府','530-0001','大阪府大阪市北区梅田3-1-1','ACTIVE',300,'2021-05-12'),
 (3,'高橋 美咲','misaki.t@example.com','080-2222-0003','福岡県',NULL,NULL,'ACTIVE',0,'2021-07-20'),
 (4,'田中 健',NULL,'090-3333-0004','東京都',NULL,NULL,'INACTIVE',50,'2020-11-03'),
 (5,'伊藤 さくら','sakura.ito@example.com',NULL,'北海道',NULL,NULL,'ACTIVE',980,'2022-01-15'),
 (6,'渡辺 翔','sho.watanabe@example.com','070-4444-0006',NULL,NULL,NULL,'ACTIVE',0,'2022-03-08'),
 (7,'山本 結衣','yui.yamamoto@example.com','090-5555-0007','大阪府',NULL,NULL,'SUSPENDED',0,'2022-06-30'),
 (8,'中村 大輔','daisuke.n@example.com','080-6666-0008','愛知県','450-0002','愛知県名古屋市中村区名駅1-1-4','ACTIVE',2500,'2022-09-01'),
 (9,'小林 陽菜','hina.k@example.com',NULL,'福岡県',NULL,NULL,'ACTIVE',150,'2023-02-14'),
 (10,'加藤 蓮','ren.kato@example.com','090-7777-0010','東京都',NULL,NULL,'INACTIVE',0,'2023-04-01'),
 (11,'吉田 美月','mizuki.y@example.com','090-8888-0011','神奈川県',NULL,NULL,'ACTIVE',640,'2023-08-19'),
 (12,'山田 太郎','taro.yamada@example.com','','東京都',NULL,NULL,'ACTIVE',0,'2024-01-05'),
 (13,'佐々木 優','yu.sasaki@example.com','080-9999-0013','宮城県',NULL,NULL,'ACTIVE',75,'2024-03-22'),
 (14,'松本 葵','aoi.matsumoto@example.com',NULL,'福岡県',NULL,NULL,'ACTIVE',0,'2024-06-10'),
 (15,'井上 拓海','takumi.inoue@example.com','070-0000-0015','大阪府',NULL,NULL,'ACTIVE',310,'2024-09-27');
SELECT setval('customers_customer_id_seq', 15);

INSERT INTO orders (order_id,customer_id,order_date,status) VALUES
 (1001,1,'2024-01-10','COMPLETED'),(1002,2,'2024-01-15','COMPLETED'),
 (1003,1,'2024-02-03','COMPLETED'),(1004,3,'2024-02-20','CANCELLED'),
 (1005,5,'2024-03-05','COMPLETED'),(1006,8,'2024-03-18','COMPLETED'),
 (1007,8,'2024-04-02','SHIPPED'),  (1008,2,'2024-04-25','COMPLETED'),
 (1009,9,'2024-05-11','COMPLETED'),(1010,11,'2024-05-30','SHIPPED'),
 (1011,1,'2024-06-14','COMPLETED'),(1012,13,'2024-07-01','NEW'),
 (1013,5,'2024-07-19','COMPLETED'),(1014,15,'2024-08-08','CANCELLED'),
 (1015,8,'2024-08-30','COMPLETED'),(1016,3,'2024-09-12','COMPLETED'),
 (1017,12,'2024-10-05','SHIPPED'), (1018,9,'2024-10-28','NEW'),
 (1019,11,'2024-11-11','COMPLETED'),(1020,15,'2024-12-01','NEW');
SELECT setval('orders_order_id_seq', 1020);

INSERT INTO order_items VALUES
 (1001,1,1,1,128000),(1001,2,2,1,2980),
 (1002,1,2,2,2980),(1002,2,9,3,1280),
 (1003,1,4,1,39800),
 (1004,1,10,1,32800),
 (1005,1,3,1,15800),(1005,2,2,1,2980),
 (1006,1,8,1,158000),(1006,2,4,2,39800),
 (1007,1,6,2,13800),
 (1008,1,9,5,1280),
 (1009,1,1,1,128000),(1009,2,6,1,13800),(1009,3,2,1,2980),
 (1010,1,10,1,32800),
 (1011,1,5,2,4980),
 (1012,1,3,1,15800),
 (1013,1,5,1,4980),
 (1014,1,4,1,39800),
 (1015,1,2,3,2980),(1015,2,9,2,1280),
 (1016,1,6,1,13800),
 (1017,1,1,1,128000),
 (1018,1,10,2,32800),
 (1019,1,3,1,15800),(1019,2,5,1,4980),
 (1020,1,9,10,1280);

UPDATE orders o SET total_amount = s.total
FROM (SELECT order_id, SUM(quantity * unit_price) AS total FROM order_items GROUP BY order_id) s
WHERE o.order_id = s.order_id;
`;

function bulkSql(rows) {
  const n = clampBulk(rows);
  return `
CREATE TABLE legacy_sales (
  sale_no   integer,
  cust_no   varchar(10),
  sale_ymd  varchar(8),
  amt_txt   varchar(12),
  region_cd varchar(2)
);
COMMENT ON TABLE legacy_sales IS '旧売上（大量データ演習用・${n}件）。amt_txt は税込金額の文字列。';
INSERT INTO legacy_sales
SELECT g,
       'C' || lpad(((g % 20) + 1)::text, 4, '0'),
       to_char(date '2022-01-01' + (g % 730), 'YYYYMMDD'),
       CASE WHEN g % 997 = 0 THEN 'ERR' ELSE ((g * 37) % 50000 + 100)::text END,
       lpad(((g % 7) + 1)::text, 2, '0')
FROM generate_series(1, ${n}) AS g;

CREATE TABLE sales (
  sale_id       integer PRIMARY KEY,
  customer_code varchar(10) NOT NULL,
  sale_date     date NOT NULL,
  amount        numeric(12,0) NOT NULL,
  region_cd     varchar(2) NOT NULL
);
COMMENT ON TABLE sales IS '新売上（大量データ移行の移行先）。';
ANALYZE legacy_sales;
`;
}

export function clampBulk(rows) {
  const n = Math.round(Number(rows) || BULK_LIMITS.default);
  return Math.min(BULK_LIMITS.max, Math.max(BULK_LIMITS.min, n));
}

export const DATASETS = {
  base: {
    label: '基本データ（新システムにデータあり）',
    description: '顧客15件・注文20件・商品10件など。SELECTやJOINの練習用。旧システムのテーブル（legacy_*）も入っています。',
  },
  migration: {
    label: '移行演習データ（新システムが空）',
    description: 'customers / orders / order_items が空の状態。legacy_* から移行する練習用。',
  },
  bulk: {
    label: '大量データ演習（legacy_sales）',
    description: '移行演習データ＋旧売上データ（件数を指定、最大20万件）。',
  },
};

// データセットを構築するSQL（WIPE後に実行）
export function buildDatasetSql(id, opts = {}) {
  const parts = [SCHEMA_SQL, MASTER_DATA_SQL];
  if (id === 'base') parts.push(BASE_DATA_SQL);
  if (id === 'bulk') parts.push(bulkSql(opts.bulkRows));
  if (!DATASETS[id]) throw new Error('unknown dataset: ' + id);
  parts.push('ANALYZE;');
  return parts.join('\n');
}

// 各データの学習目的（構造ビューアとREADMEで表示）
export const DATA_NOTES = [
  ['customers', '基本の顧客データ。phone に NULL と空文字（ID=12）が混在し、NULLと空文字の違いを学びます。注文のない顧客（4,6,7,10,14）は LEFT JOIN の練習用。'],
  ['orders / order_items', '注文と注文詳細。total_amount は明細合計と一致するので、集計値の検証に使えます。CANCELLED の注文は集計対象外の判断練習に。'],
  ['products', 'ID=7 は販売終了（is_active=false）で一度も注文されていない商品。NOT EXISTS の練習用。'],
  ['code_master', '旧コード→新コードの対応表。CUST_STATUS の 9（退会）は new_code が NULL＝移行対象外。ORDER_STATUS に 99 は存在しない（未知コードの検出練習）。'],
  ['legacy_customers', '旧顧客。C0012=退会、C0017=削除フラグ（テストデータ）、C0016=C0008の重複、C0014=存在しない日付(6/31)、C0018=日付がスラッシュ区切り・ポイントがカンマ付き、C0019=未知の都道府県コード99・ポイントが"abc"、C0020=マイナスポイント、C0006=メール前後の空白・空の都道府県・空のポイント、C0015=大文字メール、C0002=電話が空文字。'],
  ['legacy_customer_addresses', '1顧客に自宅(1)と勤務先(2)の複数行がある（1対多）。C9999 は顧客が存在しない孤立データ。'],
  ['legacy_orders', '金額は税抜の文字列（新システムは税込＝カラムの意味が違う）。"2,700" "¥5800" "N/A" 空文字などの変換できない値、未知ステータス99、存在しない顧客C9999、退会顧客やテスト顧客の注文、存在しない日付(2023-13-31)、重複顧客C0016の注文を含みます。'],
  ['legacy_order_details', '旧注文明細。P777 は code_master に存在しない商品コード。O0009 は親注文が移行対象外になる明細。'],
  ['legacy_sales / sales', '大量データ演習用（bulk データセットのみ）。997件に1件 "ERR" という変換できない金額が入っています。'],
  ['migration_rejects', '移行できなかった行を記録するための空テーブル。'],
];
