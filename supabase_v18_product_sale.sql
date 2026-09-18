-- ============================================================
-- NAGAZON v18 追加SQL（修正版 / 2026-09-19）
--   セール（セール価格・セール販売の個数）を「商品ごと」で管理し、
--   商品管理画面から設定できるようにする
--
--   修正点：v17のビューは remaining が bigint（sum集計）だったため
--           CREATE OR REPLACE VIEW が 42P16 で失敗していました。
--           ビューを drop してから作り直す方式に変更しています。
--
-- 実行場所：Supabase Dashboard → SQL Editor → 全行実行（1回だけでOK）
-- ※ v17 の supabase_v17_lots.sql を実行済みの状態で流してください
-- ============================================================

-- ---------- 1) 商品にセール用の項目を追加 ----------
alter table public.products
  add column if not exists sale_price     integer,
  add column if not exists sale_qty       integer default 0,
  add column if not exists sale_remaining integer default 0;

comment on column public.products.sale_price     is 'セール価格（円）。null/0=セールなし';
comment on column public.products.sale_qty       is 'セールで販売する個数（設定値）';
comment on column public.products.sale_remaining is 'セールの残り個数（購入で減る／0で通常価格に戻る）';

-- ---------- 2) お客様向けビューを「商品単位のセール」に作り直す ----------
-- 旧ビューは remaining が bigint なので drop してから再作成する
drop view if exists public.product_sale_lots;

create view public.product_sale_lots as
  select id                          as product_id,
         sale_price                  as sale_price,
         sale_remaining::bigint      as remaining
    from public.products
   where coalesce(sale_price, 0) > 0
     and coalesce(sale_remaining, 0) > 0;

grant select on public.product_sale_lots to anon, authenticated;

-- ---------- 3) セール設定（商品管理画面から呼ぶ） ----------
-- p_sale_price<=0 または p_qty<=0 を渡すと「セール解除」
create or replace function public.set_product_sale(
  p_product_id integer,
  p_sale_price integer,
  p_qty        integer
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.products;
begin
  if not exists (
    select 1 from public.profiles p
     where p.id = auth.uid() and coalesce(p.is_admin, false)
  ) then
    raise exception 'admin only';
  end if;

  if coalesce(p_sale_price, 0) <= 0 or coalesce(p_qty, 0) <= 0 then
    update public.products
       set sale_price = null, sale_qty = 0, sale_remaining = 0
     where id = p_product_id
    returning * into v_row;
  else
    update public.products
       set sale_price = p_sale_price, sale_qty = p_qty, sale_remaining = p_qty
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
    'sale_remaining', v_row.sale_remaining
  );
end;
$$;

grant execute on function public.set_product_sale(integer, integer, integer) to authenticated;

-- ---------- 4) ロット単位の古いセール設定をクリア（商品単位に統一） ----------
update public.product_lots set sale_price = null where sale_price is not null;

-- ---------- 5) 購入時の消費：セール分 → ロット（期限が近い順） ----------
create or replace function public.consume_lots(p_product_id integer, p_qty integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_left integer;
  v_sale integer;
  r record;
begin
  v_left := greatest(0, coalesce(p_qty, 0));
  if v_left = 0 then
    return 0;
  end if;

  -- ① セール分を先に消費
  select coalesce(sale_remaining, 0) into v_sale
    from public.products
   where id = p_product_id
     for update;

  if coalesce(v_sale, 0) > 0 then
    if v_sale >= v_left then
      update public.products
         set sale_remaining = v_sale - v_left
       where id = p_product_id;
      return 0;
    else
      update public.products set sale_remaining = 0 where id = p_product_id;
      v_left := v_left - v_sale;
    end if;
  end if;

  -- ② ロットを期限が近い順に消費
  for r in
    select id, remaining
      from public.product_lots
     where product_id = p_product_id
       and remaining > 0
     order by expiry_date asc nulls last,
              created_at asc
  loop
    exit when v_left <= 0;

    if r.remaining <= v_left then
      update public.product_lots set remaining = 0, updated_at = now() where id = r.id;
      v_left := v_left - r.remaining;
    else
      update public.product_lots set remaining = remaining - v_left, updated_at = now() where id = r.id;
      v_left := 0;
    end if;
  end loop;

  return v_left;
end;
$$;

grant execute on function public.consume_lots(integer, integer) to anon, authenticated;

-- ---------- 6) 確認用（任意） ----------
-- select id, name, price, sale_price, sale_qty, sale_remaining from public.products order by id;
-- select * from public.product_sale_lots;
