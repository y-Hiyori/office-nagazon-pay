-- ============================================================
-- NAGAZON v37 追加SQL
--   在庫数（products.stock）を「ロット残数の合計」に一本化する
--   ・購入でロットが減れば、在庫数も必ず同じ数だけ減る
--   ・商品追加時に「1件の太いロット」を作ってもズレない（合計で数える）
--   ・購入処理が二重に走っても在庫が二重に減らない（絶対値で上書き）
-- 実行場所：Supabase Dashboard → SQL Editor → 全行実行（1回だけでOK）
-- ※ supabase_v25_lot_sync.sql 実行済みの前提
-- ============================================================

-- ---------- 1) ロットの増減で 商品の在庫数を「ロット残数の合計」に合わせる ----------
--    ※ v25 は「件数（count）」で数えていたため、太いロット（quantity>1）だと
--       在庫が1件ぶんに潰れてしまいました。合計（sum）に直します。
create or replace function public.tg_product_lots_sync_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pid integer;
begin
  v_pid := coalesce(new.product_id, old.product_id);
  update public.products p
     set stock = coalesce((
       select sum(l.remaining)
         from public.product_lots l
        where l.product_id = v_pid
          and coalesce(l.remaining, 0) > 0
     ), 0)
   where p.id = v_pid;
  return coalesce(new, old);
end;
$$;

-- ---------- 2) トリガを設置（今のDBには入っていませんでした） ----------
drop trigger if exists trg_product_lots_sync_stock on public.product_lots;
create trigger trg_product_lots_sync_stock
after insert or delete or update of remaining, quantity on public.product_lots
for each row execute function public.tg_product_lots_sync_stock();

-- ---------- 3) 既存データを一致させる（ロットがある商品だけ） ----------
update public.products p
   set stock = coalesce((
     select sum(l.remaining)
       from public.product_lots l
      where l.product_id = p.id
        and coalesce(l.remaining, 0) > 0
   ), 0)
 where exists (select 1 from public.product_lots l where l.product_id = p.id);

-- ---------- 4) 入荷ロット消費トリガを「status更新時のみ」に限定 ----------
--    ゲスト購入は「注文を paid で作成 → あとで商品明細を挿入」の順のため、
--    INSERT 時に発火すると明細が無く、ロットを消費しないまま
--    lots_consumed_at だけが立って以後の消費がスキップされていました。
--    status が paid に「更新」された時だけ発火させます。
drop trigger if exists trg_orders_consume_lots on public.orders;
create trigger trg_orders_consume_lots
after update of status on public.orders
for each row execute function public.tg_orders_consume_lots();

-- ---------- 確認用（任意） ----------
-- select p.id, p.name, p.stock,
--        (select coalesce(sum(l.remaining),0) from public.product_lots l where l.product_id=p.id) as lots_remaining
--   from public.products p
--  where p.stock <> (select coalesce(sum(l.remaining),0) from public.product_lots l where l.product_id=p.id);
-- ↑ 何も出なければ在庫とロットが完全に一致しています
