-- ============================================================
-- NAGAZON 発送機能 v2（発送目安・発送ステータス）
-- Supabase Dashboard → SQL Editor で全行実行してください
--   products: 発送目安（最短〜最長＋単位：営業日/日）
--   orders  : 発送ステータス（発送準備中 ⇔ 発送完了）＋発送完了メール送信済みフラグ
-- すべて「add column if not exists」なので何度実行しても安全です
-- ============================================================

-- 1) 商品に発送目安を追加（任意）
--    shipping_lead_min : 最短（例: 3）
--    shipping_lead_max : 最長（例: 5）
--    shipping_lead_unit: 'business_days'（営業日） / 'days'（日）
alter table products
  add column if not exists shipping_lead_min integer;

alter table products
  add column if not exists shipping_lead_max integer;

alter table products
  add column if not exists shipping_lead_unit text not null default 'business_days';

-- 2) 注文に発送ステータスを追加
--    shipping_status: 'preparing'（発送準備中） / 'shipped'（発送完了） / NULL（発送注文でない）
--    ※ 発送完了メールは管理者が手動で送る運用なので、このSQLにメール関連の列は含めません
alter table orders
  add column if not exists shipping_status text;

-- 3) 既存の発送注文を「発送準備中」に初期化
update orders
   set shipping_status = 'preparing'
 where fulfillment_type = 'shipping'
   and shipping_status is null;
