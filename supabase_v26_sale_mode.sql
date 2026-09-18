-- ============================================================
-- NAGAZON v26 追加SQL
--   ① セールの2パターン
--        ・合計◯個限定（設定個数が売れたらセール終了）
--        ・1会計で◯個まで（それ以上は通常価格）
--   ② 在庫を減らす＝ロット（1個＝1件）を削除
--   ③ 購入履歴に「セールで買った」ことを残す
-- 実行場所：Supabase Dashboard → SQL Editor → 全行実行（1回だけでOK）
-- ※ v17〜v25 のSQLを実行済みの前提です
-- ============================================================

-- ---------- 1) セールの種類を持たせる ----------
alter table public.products
  add column if not exists sale_mode text not null default 'total';

comment on column public.products.sale_mode is
  'total=合計◯個限定（sale_qty個売れたら終了）／per_order=1会計につきsale_qty個まで';

alter table public.products drop constraint if exists products_sale_mode_check;
alter table public.products
  add constraint products_sale_mode_check check (sale_mode in ('total', 'per_order'));

-- ---------- 2) 公開ビュー（列が変わるので作り直し） ----------
drop view if exists public.product_sale_lots;

create view public.product_sale_lots as
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

grant select on public.product_sale_lots to anon, authenticated;

-- ---------- 3) セール設定（モード付き） ----------
drop function if exists public.set_product_sale(integer, integer, integer);

create or replace function public.set_product_sale(
  p_product_id integer,
  p_sale_price integer,
  p_qty        integer,
  p_mode       text default 'total'
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.products;
  v_mode text;
begin
  if not exists (
    select 1 from public.profiles p
     where p.id = auth.uid() and coalesce(p.is_admin, false)
  ) then
    raise exception 'admin only';
  end if;

  v_mode := case when p_mode = 'per_order' then 'per_order' else 'total' end;

  -- 解除：数量0、または価格が未指定(null)
  if coalesce(p_qty, 0) <= 0 or p_sale_price is null then
    update public.products
       set sale_price = null, sale_qty = 0, sale_remaining = 0, sale_mode = v_mode
     where id = p_product_id
    returning * into v_row;
  else
    update public.products
       set sale_price = greatest(0, p_sale_price),
           sale_qty = p_qty,
           sale_remaining = p_qty,
           sale_mode = v_mode
     where id = p_product_id
    returning * into v_row;
  end if;

  if v_row.id is null then
    raise exception 'product not found: %', p_product_id;
  end if;

  return json_build_object(
    'product_id',     v_row.id,
    'sale_price',     v_row.sale_price,
    'sale_qty',       v_row.sale_qty,
    'sale_remaining', v_row.sale_remaining,
    'sale_mode',      v_row.sale_mode
  );
end;
$$;

grant execute on function public.set_product_sale(integer, integer, integer, text) to authenticated;

-- ---------- 4) 購入履歴用の列（セールで買ったか） ----------
alter table public.order_items
  add column if not exists is_sale boolean not null default false;
alter table public.order_items
  add column if not exists original_price integer;
alter table public.order_items
  add column if not exists sale_mode text;

comment on column public.order_items.is_sale is 'セール価格で購入した明細かどうか';
comment on column public.order_items.original_price is 'セール時の通常価格（比較用）';

-- ---------- 5) 購入時にロットを1個ずつ削除＋合計限定セールを消費 ----------
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
      -- 1個＝1件：使ったロットは行ごと削除する
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

  -- 「合計◯個限定」セールの残りを消費（per_order は在庫がある限り続く）
  update public.products p
     set sale_remaining = greatest(0, coalesce(p.sale_remaining, 0)
                                   - least(greatest(0, coalesce(p_qty, 0)),
                                           coalesce(p.sale_remaining, 0)))
   where p.id = p_product_id
     and p.sale_price is not null
     and coalesce(p.sale_mode, 'total') = 'total'
     and coalesce(p.sale_remaining, 0) > 0;

  return v_left;
end;
$$;

grant execute on function public.consume_lots(integer, integer) to anon, authenticated;

-- ---------- 確認用（任意） ----------
-- select id, name, sale_price, sale_qty, sale_remaining, sale_mode from public.products
--  where sale_price is not null order by id;
-- select * from public.product_sale_lots;
