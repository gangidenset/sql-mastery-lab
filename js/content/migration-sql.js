// 移行演習で共通して使う「模範的な移行SQL」。
// レッスン・シナリオ・総合演習の「前提状態（setup）」と模範解答に使います。
// 業務ルール（このアプリの移行仕様）:
//  採番: customer_id は旧顧客番号の数字部分（C0001→1）、order_id は旧注文番号の数字部分（O0001→1）を維持する。
//        明示的にIDを入れた後は、シーケンスを setval で最大値に合わせる。
//  顧客: del_flg='0' かつ sts_kbn<>'9'（退会）を対象。メール重複（小文字・前後空白除去）は登録日が古い方を残す。
//        登録日が日付として不正な行は対象外。電話は11桁なら 3-4-4 形式、それ以外NULL。
//        都道府県は code_master(PREF)、ステータスは code_master(CUST_STATUS) で変換。
//        ポイントはカンマ除去後に0以上の整数ならその値、それ以外は0。
//  注文: 顧客が移行済み（重複統合された顧客の注文は残す側の顧客へ付け替え）、ステータスが変換可能、
//        日付が正しい、金額（カンマ・¥除去後）が整数のものを対象。金額は税抜→税込（×1.1、四捨五入）。
//  明細: 親注文が移行済みで、商品コードが code_master(ITEM) で変換できるもの。

export const MIG_CUSTOMERS = String.raw`WITH src AS (
  SELECT l.*,
         ROW_NUMBER() OVER (PARTITION BY lower(trim(l.mail_addr)) ORDER BY l.reg_ymd, l.cust_no) AS rn
  FROM legacy_customers l
  WHERE l.del_flg = '0' AND l.sts_kbn <> '9'
)
INSERT INTO customers (customer_id, legacy_cust_no, name, email, phone, prefecture, status, points, registered_at)
SELECT substr(s.cust_no, 2)::integer,
       s.cust_no,
       s.cust_nm,
       NULLIF(lower(trim(s.mail_addr)), ''),
       CASE WHEN s.tel_no ~ '^[0-9]{11}$'
            THEN regexp_replace(s.tel_no, '^([0-9]{3})([0-9]{4})([0-9]{4})$', '\1-\2-\3') END,
       p.new_code,
       st.new_code,
       CASE WHEN replace(s.point_bal, ',', '') ~ '^[0-9]+$'
            THEN replace(s.point_bal, ',', '')::integer ELSE 0 END,
       s.reg_ymd::date
FROM src s
JOIN code_master st ON st.code_type = 'CUST_STATUS' AND st.old_code = s.sts_kbn
LEFT JOIN code_master p ON p.code_type = 'PREF' AND p.old_code = s.pref_cd
WHERE (s.rn = 1 OR s.mail_addr IS NULL)
  AND pg_input_is_valid(s.reg_ymd, 'date');
SELECT setval('customers_customer_id_seq', (SELECT max(customer_id) FROM customers));`;

// 重複顧客の付け替えを考慮しない（基本形の）注文移行
export const MIG_ORDERS_BASIC = String.raw`INSERT INTO orders (order_id, legacy_ord_no, customer_id, order_date, status, total_amount)
SELECT substr(o.ord_no, 2)::integer,
       o.ord_no,
       c.customer_id,
       o.ord_ymd::date,
       st.new_code,
       round(regexp_replace(o.amt_txt, '[,¥]', '', 'g')::numeric * 1.1)
FROM legacy_orders o
JOIN customers c    ON c.legacy_cust_no = o.cust_no
JOIN code_master st ON st.code_type = 'ORDER_STATUS' AND st.old_code = o.ord_sts
WHERE pg_input_is_valid(o.ord_ymd, 'date')
  AND regexp_replace(o.amt_txt, '[,¥]', '', 'g') ~ '^[0-9]+$';
SELECT setval('orders_order_id_seq', (SELECT max(order_id) FROM orders));`;

// 重複統合を考慮し、再実行しても重複しない注文移行（完成形）
export const MIG_ORDERS_FULL = String.raw`WITH cust_map AS (
  SELECT cust_no,
         FIRST_VALUE(cust_no) OVER (PARTITION BY lower(trim(mail_addr)) ORDER BY reg_ymd, cust_no) AS master_no
  FROM legacy_customers
  WHERE del_flg = '0' AND sts_kbn <> '9' AND mail_addr IS NOT NULL
  UNION ALL
  SELECT cust_no, cust_no FROM legacy_customers
  WHERE del_flg = '0' AND sts_kbn <> '9' AND mail_addr IS NULL
)
INSERT INTO orders (order_id, legacy_ord_no, customer_id, order_date, status, total_amount)
SELECT substr(o.ord_no, 2)::integer,
       o.ord_no,
       c.customer_id,
       o.ord_ymd::date,
       st.new_code,
       round(regexp_replace(o.amt_txt, '[,¥]', '', 'g')::numeric * 1.1)
FROM legacy_orders o
JOIN cust_map m     ON m.cust_no = o.cust_no
JOIN customers c    ON c.legacy_cust_no = m.master_no
JOIN code_master st ON st.code_type = 'ORDER_STATUS' AND st.old_code = o.ord_sts
WHERE pg_input_is_valid(o.ord_ymd, 'date')
  AND regexp_replace(o.amt_txt, '[,¥]', '', 'g') ~ '^[0-9]+$'
  AND NOT EXISTS (SELECT 1 FROM orders x WHERE x.legacy_ord_no = o.ord_no);
SELECT setval('orders_order_id_seq', (SELECT max(order_id) FROM orders));`;

export const MIG_ITEMS = String.raw`INSERT INTO order_items (order_id, line_no, product_id, quantity, unit_price)
SELECT o.order_id,
       d.line_no::integer,
       m.new_code::integer,
       d.qty_txt::integer,
       d.unit_prc_txt::numeric
FROM legacy_order_details d
JOIN orders o      ON o.legacy_ord_no = d.ord_no
JOIN code_master m ON m.code_type = 'ITEM' AND m.old_code = d.item_cd
WHERE NOT EXISTS (SELECT 1 FROM order_items x WHERE x.order_id = o.order_id AND x.line_no = d.line_no::integer);`;

// 移行対象（顧客）を判定する式：検証で何度も使う
export const CUSTOMER_TARGET_WHERE = "del_flg = '0' AND sts_kbn <> '9'";

export const FULL_MIGRATION = [MIG_CUSTOMERS, MIG_ORDERS_FULL, MIG_ITEMS].join('\n');
