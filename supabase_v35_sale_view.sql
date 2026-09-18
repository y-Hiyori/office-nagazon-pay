-- ============================================================
-- NAGAZON v35 追加SQL
--   product_sale_lots（赤い UNRESTRICTED 警告が出ているビュー）への対応
--   ・ビューはRLSを設定できないため、Supabase が「RLS未設定」として赤く警告します
--   ・安全な形（security_invoker）に作り直して、警告の対象から外します
--   ・アプリは v35 以降、products テーブルから直接セール情報を読むので
--     ビューが無くても動きます（＝削除しても壊れません）
-- 実行場所：Supabase Dashboard → SQL Editor → 全行実行（1回だけでOK）
-- ※ supabase_v26_sale_mode.sql 実行済みの前提です
-- ============================================================

-- ---------- 1) ビューを安全な形（security_invoker）で作り直す ----------
--    参照する人の権限で products を読む＝行レベルセキュリティ（RLS）が効きます
drop view if exists public.product_sale_lots;

create view public.product_sale_lots
with (security_invoker = true)
as
  select p.id                            as product_id,
         p.sale_price                    as sale_price,
         coalesce(p.sale_mode, 'total')  as sale_mode,
         greatest(0, coalesce(p.sale_qty, 0)) as sale_qty,
         case when coalesce(p.sale_mode, 'total') = 'per_order'
              then greatest(0, coalesce(p.stock, 0))::bigint
              else greatest(0, coalesce(p.sale_remaining, 0))::bigint
         end                             as remaining
    from public.products p
   where p.sale_price is not null
     and ( (coalesce(p.sale_mode, 'total') = 'per_order' and coalesce(p.stock, 0) > 0)
        or (coalesce(p.sale_mode, 'total') = 'total'      and coalesce(p.sale_remaining, 0) > 0) );

-- お客様（未ログイン）でもセール表示ができるように読み取りを許可
grant select on public.product_sale_lots to anon, authenticated;

-- ---------- 2) 動作確認 ----------
-- select * from public.product_sale_lots;

-- ---------- 3) （任意）ビュー自体を消したい場合 ----------
--   アプリ（v35以降）は products から直接読むため、消しても動きます。
--   テーブル一覧から行ごと消したいときは下の2行のコメントを外して実行してください。
-- drop view if exists public.product_sale_lots;
