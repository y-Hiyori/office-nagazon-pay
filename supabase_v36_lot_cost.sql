-- ============================================================
-- NAGAZON v36 追加SQL
--   ① 同じ商品でもロットごとに原価が違う場合に、実際に仕入れた原価で
--      売上・利益を計算できるようにする（消費したロットを記録）
--   ② ゲスト購入でもロットを消費（在庫とロットの一致を保つ）
-- 実行場所：Supabase Dashboard → SQL Editor → 全行実行（1回だけでOK）
-- ※ v26・v33・v35 のSQLを実行済みの前提です
-- ============================================================

-- ---------- 1) 購入時に消費したロット（原価つき）の記録 ----------
create table if not exists public.order_lot_consumptions (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null,
  product_id integer not null,
  lot_id     uuid,
  cost       integer not null default 0,   -- そのロットの仕入れ原価（1個）
  qty        integer not null default 1,   -- このロットから使った個数
  sale       boolean not null default false,
  created_at timestamptz not null default now(),
  unique (order_id, lot_id)
);

create index if not exists idx_olc_order   on public.order_lot_consumptions(order_id);
create index if not exists idx_olc_product on public.order_lot_consumptions(product_id);

comment on table public.order_lot_consumptions is
  '購入時に消費した入荷ロット（実際の仕入れ原価）。売上・利益はこの原価で計算します';

alter table public.order_lot_consumptions enable row level security;

drop policy if exists olc_admin_all on public.order_lot_consumptions;
create policy olc_admin_all on public.order_lot_consumptions
  for all
  using (
    exists (select 1 from public.profiles p
             where p.id = auth.uid() and coalesce(p.is_admin, false))
  )
  with check (
    exists (select 1 from public.profiles p
             where p.id = auth.uid() and coalesce(p.is_admin, false))
  );

-- ---------- 2) 購入時：ロットを消費しつつ、原価を記録する ----------
create or replace function public.consume_lots_for_order(p_order_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  l record;
  v_left  integer;
  v_count integer := 0;
begin
  -- すでに消費済みなら何もしない（画面の再読み込みでも二重に減らない）
  if exists (select 1 from public.orders o
              where o.id = p_order_id and o.lots_consumed_at is not null) then
    return json_build_object('ok', true, 'skipped', true);
  end if;

  for r in
    select oi.product_id as product_id,
           sum(greatest(0, coalesce(oi.quantity, 0)))::integer as qty
      from public.order_items oi
     where oi.order_id = p_order_id
       and oi.product_id is not null
     group by oi.product_id
  loop
    v_left := coalesce(r.qty, 0);
    continue when v_left <= 0;

    for l in
      select id,
             coalesce(remaining, 0) as remaining,
             coalesce(cost, 0)      as cost,
             (sale_price is not null) as is_sale
        from public.product_lots
       where product_id = r.product_id
         and coalesce(remaining, 0) > 0
       order by (sale_price is not null) desc,
                expiry_date asc nulls last,
                created_at asc
    loop
      exit when v_left <= 0;

      if l.remaining <= v_left then
        insert into public.order_lot_consumptions (order_id, product_id, lot_id, cost, qty, sale)
        values (p_order_id, r.product_id, l.id, l.cost, l.remaining, l.is_sale)
        on conflict (order_id, lot_id) do nothing;

        delete from public.product_lots where id = l.id;
        v_left  := v_left - l.remaining;
        v_count := v_count + 1;
      else
        insert into public.order_lot_consumptions (order_id, product_id, lot_id, cost, qty, sale)
        values (p_order_id, r.product_id, l.id, l.cost, v_left, l.is_sale)
        on conflict (order_id, lot_id) do nothing;

        update public.product_lots
           set remaining = remaining - v_left, updated_at = now()
         where id = l.id;
        v_left  := 0;
        v_count := v_count + 1;
      end if;
    end loop;

    -- ロットが足りない分は商品の標準原価で記録（原価を追えるようにする）
    if v_left > 0
       and not exists (
         select 1 from public.order_lot_consumptions c
          where c.order_id = p_order_id
            and c.product_id = r.product_id
            and c.lot_id is null
       ) then
      insert into public.order_lot_consumptions (order_id, product_id, lot_id, cost, qty, sale)
      select p_order_id, r.product_id, null, coalesce(p.cost, 0), v_left, false
        from public.products p where p.id = r.product_id;
    end if;
  end loop;

  -- 残り0のロットは残さない
  delete from public.product_lots l
   using public.order_items oi
   where oi.order_id = p_order_id
     and l.product_id = oi.product_id
     and coalesce(l.remaining, 0) <= 0;

  -- 「合計◯個限定」セールの残りを消費（per_order は在庫がある限り続く）
  update public.products p
     set sale_remaining = greatest(
           0,
           coalesce(p.sale_remaining, 0)
           - least(
               coalesce((
                 select sum(greatest(0, coalesce(oi.quantity, 0)))
                   from public.order_items oi
                  where oi.order_id = p_order_id and oi.product_id = p.id
               ), 0),
               coalesce(p.sale_remaining, 0)
             )
         )
   where p.sale_price is not null
     and coalesce(p.sale_mode, 'total') = 'total'
     and coalesce(p.sale_remaining, 0) > 0
     and exists (select 1 from public.order_items oi
                  where oi.order_id = p_order_id and oi.product_id = p.id);

  update public.orders set lots_consumed_at = now() where id = p_order_id;

  return json_build_object('ok', true, 'lots_consumed', v_count);
end;
$$;

grant execute on function public.consume_lots_for_order(uuid) to anon, authenticated;

-- ---------- 3) 既存の注文を救済（ロット原価が無い注文に標準原価を記録） ----------
--    ※ すでにロットが消えている過去の注文は、商品の標準原価で補完します
insert into public.order_lot_consumptions (order_id, product_id, lot_id, cost, qty, sale)
select oi.order_id,
       oi.product_id,
       null,
       greatest(0, coalesce(p.cost, 0)),
       sum(greatest(0, coalesce(oi.quantity, 0)))::integer,
       false
  from public.order_items oi
  join public.products p on p.id = oi.product_id
 where oi.product_id is not null
   and not exists (
     select 1 from public.order_lot_consumptions c
      where c.order_id = oi.order_id and c.product_id = oi.product_id
   )
 group by oi.order_id, oi.product_id, p.cost;

-- ---------- 確認用（任意） ----------
-- select order_id, product_id, cost, qty, sale, created_at
--   from public.order_lot_consumptions order by created_at desc limit 30;
-- ロット原価の合計と、商品標準原価との差を確認
-- select c.order_id, p.name,
--        sum(c.cost * c.qty) as 実際の原価, p.cost * sum(c.qty) as 標準原価
--   from public.order_lot_consumptions c join public.products p on p.id = c.product_id
--  group by c.order_id, p.name, p.cost order by c.order_id desc limit 20;
