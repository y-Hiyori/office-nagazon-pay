-- ============================================================
-- NAGAZON v23 追加SQL
--   セール価格を「0円（無料）」にできるようにする
--   ・sale_price = 0 かつ sale_remaining > 0 → 0円セール中（有効）
--   ・sale_price = null → セールなし
--   ・セール解除は p_qty=0 を渡す（価格0円は解除ではなく有効な設定）
-- 実行場所：Supabase Dashboard → SQL Editor → 全行実行（1回だけでOK）
-- ※ v18 の supabase_v18_product_sale.sql を実行済みの前提です
-- ============================================================

comment on column public.products.sale_price is
  'セール価格（円）。null=セールなし／0=0円セール（有効）';

-- ---------- 1) お客様向けビュー：0円セールも対象にする ----------
--    「セールなし」は sale_price=null で判定するため、0円も有効として通します
create or replace view public.product_sale_lots as
  select id                     as product_id,
         sale_price             as sale_price,
         sale_remaining::bigint as remaining
    from public.products
   where sale_price is not null
     and coalesce(sale_remaining, 0) > 0;

grant select on public.product_sale_lots to anon, authenticated;

-- ---------- 2) セール設定：0円を許可／解除は qty=0 で ----------
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

  -- 解除：数量0、または価格が未指定(null)
  if coalesce(p_qty, 0) <= 0 or p_sale_price is null then
    update public.products
       set sale_price = null, sale_qty = 0, sale_remaining = 0
     where id = p_product_id
    returning * into v_row;
  else
    -- 価格0円でもそのまま設定する
    update public.products
       set sale_price = greatest(0, p_sale_price),
           sale_qty = p_qty,
           sale_remaining = p_qty
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

-- ---------- 確認用（任意） ----------
-- select id, name, price, sale_price, sale_qty, sale_remaining from public.products
--  where sale_price is not null order by id;
-- select * from public.product_sale_lots;
