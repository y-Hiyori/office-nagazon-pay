-- ============================================================
-- NAGAZON v25 追加SQL
--   ① ロットは「1個＝1件」に統一
--   ② 購入したらロットを削除（残り0ではなく行ごと消す）
--   ③ 在庫数とロット件数を必ず一致させる（既存のズレを今すぐ修正）
--   ④ 以後ズレないよう、ロットの増減で在庫数が自動計算されるトリガを追加
-- 実行場所：Supabase Dashboard → SQL Editor → 全行実行（1回だけでOK）
-- ※ supabase_v17_lots.sql / v19 / v20 を実行済みの前提です
-- ============================================================

-- ---------- 1) 購入時にロットを消費（1個＝1件なので、使ったロットは行ごと削除） ----------
create or replace function public.consume_lots(p_product_id integer, p_qty integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_left integer;
  r record;
begin
  v_left := greatest(0, coalesce(p_qty, 0));
  if v_left = 0 then
    return 0;
  end if;

  for r in
    select id, remaining
      from public.product_lots
     where product_id = p_product_id
       and coalesce(remaining, 0) > 0
     order by (sale_price is not null) desc,
              expiry_date asc nulls last,
              created_at asc
  loop
    exit when v_left <= 0;

    if coalesce(r.remaining, 0) <= v_left then
      -- 1個＝1件：使ったロットは削除する
      delete from public.product_lots where id = r.id;
      v_left := v_left - coalesce(r.remaining, 0);
    else
      update public.product_lots
         set remaining = remaining - v_left, updated_at = now()
       where id = r.id;
      v_left := 0;
    end if;
  end loop;

  -- 残り0のロットは残さない
  delete from public.product_lots
   where product_id = p_product_id and coalesce(remaining, 0) <= 0;

  return v_left;
end;
$$;

grant execute on function public.consume_lots(integer, integer) to anon, authenticated;

-- ---------- 2) ロットの増減で 商品の在庫数を自動計算（ズレ防止） ----------
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
     set stock = (
       select count(*) from public.product_lots l
        where l.product_id = v_pid and coalesce(l.remaining, 0) > 0
     )
   where p.id = v_pid;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_product_lots_sync_stock on public.product_lots;
create trigger trg_product_lots_sync_stock
after insert or delete or update of remaining, quantity on public.product_lots
for each row execute function public.tg_product_lots_sync_stock();

-- ---------- 3) 1商品ぶんの在庫とロットを一致させる ----------
create or replace function public.sync_product_lots(p_product_id integer)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stock   integer;
  v_cost    integer;
  v_count   integer;
  v_split   integer := 0;
  v_added   integer := 0;
  v_removed integer := 0;
begin
  select greatest(0, coalesce(stock, 0)), greatest(0, coalesce(cost, 0))
    into v_stock, v_cost
    from public.products where id = p_product_id;
  if not found then
    raise exception 'product not found: %', p_product_id;
  end if;

  -- 残り0のロットは削除
  delete from public.product_lots
   where product_id = p_product_id and coalesce(remaining, 0) <= 0;

  -- 複数個入りのロットを1個ずつに分割
  with src as (
    select id, remaining from public.product_lots
     where product_id = p_product_id and coalesce(remaining, 0) > 1
  ), ins as (
    insert into public.product_lots
      (product_id, lot_label, cost, quantity, remaining,
       expiry_date, expiry_type, received_at, memo, no_expiry)
    select l.product_id, l.lot_label, l.cost, 1, 1,
           l.expiry_date, l.expiry_type, l.received_at, l.memo, coalesce(l.no_expiry, false)
      from public.product_lots l
      join src on src.id = l.id
      cross join generate_series(1, src.remaining - 1)
    returning 1
  )
  select count(*) into v_split from ins;

  update public.product_lots
     set quantity = 1, remaining = 1, updated_at = now()
   where product_id = p_product_id and (quantity > 1 or remaining > 1);

  select count(*) into v_count from public.product_lots where product_id = p_product_id;

  -- 多いぶんは削除（期限なし → 期限が遠い順 → 新しい順）
  if v_count > v_stock then
    delete from public.product_lots l
     using (
       select id from public.product_lots
        where product_id = p_product_id
        order by (no_expiry is true) desc,
                 expiry_date desc nulls first,
                 created_at desc
        limit (v_count - v_stock)
     ) d
     where l.id = d.id;
    v_removed := v_count - v_stock;
  end if;

  -- 足りないぶんは在庫調整ロットとして自動作成
  if v_stock > v_count then
    insert into public.product_lots
      (product_id, lot_label, cost, quantity, remaining,
       expiry_date, expiry_type, received_at, memo, no_expiry)
    select p_product_id, '在庫調整（自動作成）', v_cost, 1, 1,
           null, 'best_before', current_date, '在庫数に合わせて自動作成', true
      from generate_series(1, v_stock - v_count);
    v_added := v_stock - v_count;
  end if;

  -- 在庫数をロット件数に合わせる
  update public.products
     set stock = (select count(*) from public.product_lots where product_id = p_product_id)
   where id = p_product_id;

  return json_build_object(
    'product_id',  p_product_id,
    'stock',       v_stock,
    'lots_before', v_count,
    'lots_split',  v_split,
    'lots_added',  v_added,
    'lots_removed', v_removed,
    'lots_after',  (select count(*) from public.product_lots where product_id = p_product_id)
  );
end;
$$;

grant execute on function public.sync_product_lots(integer) to authenticated;

-- ---------- 4) 全商品いっきに一致させる ----------
create or replace function public.sync_all_product_lots()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_done integer := 0;
  v_changed integer := 0;
  v_before integer;
  v_res json;
begin
  for r in select id from public.products order by id loop
    v_done := v_done + 1;

    select count(*) into v_before from public.product_lots where product_id = r.id;

    v_res := public.sync_product_lots(r.id);

    if (v_res->>'lots_after')::integer <> v_before
       or (v_res->>'lots_split')::integer > 0 then
      v_changed := v_changed + 1;
    end if;
  end loop;

  return json_build_object('products', v_done, 'changed', v_changed);
end;
$$;

grant execute on function public.sync_all_product_lots() to authenticated;

-- ---------- 5) 今すぐ全商品を一致させる（ここで既存のズレが直ります） ----------
select public.sync_all_product_lots() as result;

-- ---------- 確認用（任意） ----------
-- select p.id, p.name, p.stock,
--        (select count(*) from public.product_lots l where l.product_id = p.id) as lots
--   from public.products p
--  where p.stock <> (select count(*) from public.product_lots l where l.product_id = p.id);
-- ↑ 何も出なければ在庫とロットが完全に一致しています
