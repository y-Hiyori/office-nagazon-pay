-- ============================================================
-- NAGAZON v44 追加SQL
--   セールの適用期間・反映オンオフ
--   実行場所：Supabase Dashboard → SQL Editor → 全行実行（1回だけでOK）
-- ============================================================

-- ---------- 1) columns ----------
alter table public.products
  add column if not exists sale_starts_at timestamptz,
  add column if not exists sale_ends_at   timestamptz,
  add column if not exists sale_active    boolean not null default true;

comment on column public.products.sale_starts_at is 'セール開始日時（null=すぐ開始）';
comment on column public.products.sale_ends_at   is 'セール終了日時（null=無期限）';
comment on column public.products.sale_active    is 'セールの反映オンオフ（false=停止中）';

-- ---------- 2) セール設定RPC（期間・オンオフ対応） ----------
drop function if exists public.set_product_sale(integer, integer, integer, text);

create or replace function public.set_product_sale(
  p_product_id integer,
  p_sale_price integer,
  p_qty        integer,
  p_mode       text default 'total',
  p_starts_at  timestamptz default null,
  p_ends_at    timestamptz default null,
  p_active     boolean default true
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row   public.products;
  v_mode  text;
  v_same  boolean;
begin
  if not exists (
    select 1 from public.profiles p
     where p.id = auth.uid() and coalesce(p.is_admin, false)
  ) then
    raise exception 'admin only';
  end if;

  v_mode := case when p_mode = 'per_order' then 'per_order' else 'total' end;

  if p_starts_at is not null and p_ends_at is not null and p_ends_at <= p_starts_at then
    raise exception 'sale period is invalid';
  end if;

  select * into v_row from public.products where id = p_product_id for update;
  if v_row.id is null then
    raise exception 'product not found: %', p_product_id;
  end if;

  -- 解除：数量0、または価格が未指定(null)
  if coalesce(p_qty, 0) <= 0 or p_sale_price is null then
    update public.products
       set sale_price = null,
           sale_qty = 0,
           sale_remaining = 0,
           sale_mode = v_mode,
           sale_starts_at = null,
           sale_ends_at = null,
           sale_active = true
     where id = p_product_id
    returning * into v_row;
  else
    -- 価格・個数・方式が同じなら、売れた分（残り個数）を維持する
    v_same :=
      v_row.sale_price is not distinct from greatest(0, p_sale_price)
      and coalesce(v_row.sale_qty, 0) = p_qty
      and coalesce(v_row.sale_mode, 'total') = v_mode;

    update public.products
       set sale_price = greatest(0, p_sale_price),
           sale_qty = p_qty,
           sale_remaining = case
             when v_same then least(greatest(0, coalesce(v_row.sale_remaining, 0)), p_qty)
             else p_qty
           end,
           sale_mode = v_mode,
           sale_starts_at = p_starts_at,
           sale_ends_at = p_ends_at,
           sale_active = coalesce(p_active, true)
     where id = p_product_id
    returning * into v_row;
  end if;

  return json_build_object(
    'product_id',     v_row.id,
    'sale_price',     v_row.sale_price,
    'sale_qty',       v_row.sale_qty,
    'sale_remaining', v_row.sale_remaining,
    'sale_mode',      v_row.sale_mode,
    'sale_starts_at', v_row.sale_starts_at,
    'sale_ends_at',   v_row.sale_ends_at,
    'sale_active',    v_row.sale_active
  );
end;
$$;

grant execute on function public.set_product_sale(integer, integer, integer, text, timestamptz, timestamptz, boolean) to authenticated;

-- ---------- 3) 反映オンオフだけ切り替えるRPC ----------
create or replace function public.set_product_sale_active(
  p_product_id integer,
  p_active     boolean
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

  update public.products
     set sale_active = coalesce(p_active, true)
   where id = p_product_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'product not found: %', p_product_id;
  end if;

  return json_build_object(
    'product_id', v_row.id,
    'sale_active', v_row.sale_active
  );
end;
$$;

grant execute on function public.set_product_sale_active(integer, boolean) to authenticated;

-- ---------- 4) セール残数の消費は「実施中」のときだけ ----------
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
      delete from public.product_lots where id = r.id;
      v_left := v_left - coalesce(r.remaining, 0);
    else
      update public.product_lots
         set remaining = remaining - v_left, updated_at = now()
       where id = r.id;
      v_left := 0;
    end if;
  end loop;

  delete from public.product_lots
   where product_id = p_product_id and coalesce(remaining, 0) <= 0;

  -- 「合計◯個限定」セールの残りを消費（実施中のみ／per_order は在庫がある限り続く）
  update public.products p
     set sale_remaining = greatest(0, coalesce(p.sale_remaining, 0)
                                   - least(greatest(0, coalesce(p_qty, 0)),
                                           coalesce(p.sale_remaining, 0)))
   where p.id = p_product_id
     and p.sale_price is not null
     and coalesce(p.sale_mode, 'total') = 'total'
     and coalesce(p.sale_remaining, 0) > 0
     and coalesce(p.sale_active, true)
     and (p.sale_starts_at is null or p.sale_starts_at <= now())
     and (p.sale_ends_at is null or p.sale_ends_at >= now());

  return v_left;
end;
$$;

grant execute on function public.consume_lots(integer, integer) to anon, authenticated;

-- ---------- 5) キャンセル時のセール残数戻しは「セールで買った分」だけ ----------
create or replace function public.apply_order_cancel(
  p_order_id            uuid,
  p_admin_id            uuid,
  p_reason              text,
  p_refund_id           text,
  p_refund_amount       integer,
  p_revoke_earned       boolean default true
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order        public.orders;
  v_lot          record;
  v_item         record;
  v_code         record;
  v_restored     integer;
  v_balance      integer;
  v_after        integer;
  v_used         integer;
  v_earned       integer;
  v_revoke       integer;
  v_shortfall    integer;
begin
  select * into v_order
    from public.orders
   where id = p_order_id
   for update;

  if v_order.id is null then
    return json_build_object('ok', false, 'error', 'NOT_FOUND');
  end if;

  if lower(coalesce(v_order.status, '')) = 'canceled' then
    return json_build_object('ok', true, 'already', true, 'status', 'canceled');
  end if;

  if lower(coalesce(v_order.status, '')) <> 'paid' then
    return json_build_object('ok', false, 'error', 'NOT_PAID', 'status', v_order.status);
  end if;

  -- 在庫（ロット）を戻す
  for v_lot in
    select * from public.order_lot_consumptions where order_id = p_order_id
  loop
    insert into public.product_lots
      (id, product_id, lot_label, cost, quantity, remaining, sale_price, memo, created_at, updated_at)
    values
      (coalesce(v_lot.lot_id, gen_random_uuid()), v_lot.product_id, 'キャンセル戻し',
       coalesce(v_lot.cost, 0), greatest(0, coalesce(v_lot.qty, 0)), greatest(0, coalesce(v_lot.qty, 0)),
       case when v_lot.sale then
         (select p.sale_price from public.products p where p.id = v_lot.product_id)
       else null end,
       '注文キャンセルで戻し', now(), now())
    on conflict (id) do update
      set remaining = public.product_lots.remaining + excluded.remaining,
          updated_at = now();
  end loop;

  -- ロット記録が無い（古い注文など）分を補う
  for v_item in
    select oi.product_id,
           sum(greatest(0, coalesce(oi.quantity, 0)))::integer as qty
      from public.order_items oi
     where oi.order_id = p_order_id
       and oi.product_id is not null
     group by oi.product_id
  loop
    select coalesce(sum(c.qty), 0) into v_restored
      from public.order_lot_consumptions c
     where c.order_id = p_order_id and c.product_id = v_item.product_id;

    if v_item.qty > v_restored then
      insert into public.product_lots
        (product_id, lot_label, cost, quantity, remaining, memo)
      select v_item.product_id, 'キャンセル戻し', coalesce(p.cost, 0),
             v_item.qty - v_restored, v_item.qty - v_restored, '注文キャンセルで戻し'
        from public.products p
       where p.id = v_item.product_id;
    end if;
  end loop;

  -- 合計◯個限定セールの残数を戻す（セール価格で買った分だけ）
  update public.products p
     set sale_remaining = least(
           coalesce(p.sale_qty, 0),
           coalesce(p.sale_remaining, 0) + q.qty
         )
    from (
      select oi.product_id,
             sum(case when oi.is_sale then greatest(0, coalesce(oi.quantity, 0)) else 0 end)::integer as qty
        from public.order_items oi
       where oi.order_id = p_order_id
       group by oi.product_id
    ) q
   where p.id = q.product_id
     and q.qty > 0
     and p.sale_price is not null
     and coalesce(p.sale_mode, 'total') = 'total'
     and p.sale_qty is not null;

  -- クーポンの使用回数を戻す
  for v_code in
    select code from public.coupon_redemptions where order_id = p_order_id
  loop
    update public.coupons
       set used_count = greatest(0, coalesce(used_count, 0) - 1)
     where code = v_code.code;
  end loop;
  delete from public.coupon_redemptions where order_id = p_order_id;

  -- ポイント（使用分の返還／付与分の取り消し）
  v_used   := greatest(0, coalesce(v_order.points_used, 0));
  v_earned := case
                when p_revoke_earned and v_order.points_awarded_at is not null
                  then greatest(0, coalesce(v_order.points_earned, 0))
                else 0
              end;

  if v_order.user_id is not null and (v_used > 0 or v_earned > 0) then
    select coalesce(balance, 0) into v_balance
      from public.points_wallet
     where user_id = v_order.user_id
     for update;

    if not found then
      insert into public.points_wallet (user_id, balance, updated_at)
      values (v_order.user_id, 0, now());
      v_balance := 0;
    end if;

    v_after := v_balance + v_used;

    if v_used > 0 then
      perform public.points_insert_tx(
        v_order.user_id, 'adjust', v_used, v_after, p_order_id,
        format('注文キャンセルで使用ポイント %s pt を返還', v_used)
      );
    end if;

    if v_earned > 0 then
      v_revoke := least(v_after, v_earned);
      v_after := v_after - v_revoke;
      v_shortfall := v_earned - v_revoke;

      if v_revoke > 0 then
        perform public.points_insert_tx(
          v_order.user_id, 'adjust', -v_revoke, v_after, p_order_id,
          format('注文キャンセルで付与ポイント %s pt を取り消し%s',
                 v_revoke,
                 case when v_shortfall > 0 then format('（残高不足のため %s pt は取消不可）', v_shortfall) else '' end)
        );
      end if;

      update public.orders
         set points_revoked_at = now()
       where id = p_order_id;
    end if;

    update public.points_wallet
       set balance = v_after, updated_at = now()
     where user_id = v_order.user_id;
  end if;

  -- 申請を「承認済み」に
  update public.order_cancel_requests
     set status = 'approved',
         handled_at = now(),
         handled_by = p_admin_id
   where order_id = p_order_id and status = 'requested';

  -- 注文をキャンセル済みに
  update public.orders
     set status = 'canceled',
         canceled_at = now(),
         canceled_by = p_admin_id,
         cancel_reason = nullif(btrim(coalesce(p_reason, '')), ''),
         refund_id = coalesce(p_refund_id, refund_id),
         refund_amount = coalesce(p_refund_amount, 0),
         refunded_at = case when coalesce(p_refund_amount, 0) > 0 then now() else refunded_at end,
         refund_started_at = null
   where id = p_order_id;

  return json_build_object(
    'ok', true,
    'status', 'canceled',
    'refundAmount', coalesce(p_refund_amount, 0),
    'refundId', p_refund_id
  );
end;
$$;

revoke all on function public.apply_order_cancel(uuid, uuid, text, text, integer, boolean) from public, anon, authenticated;
grant execute on function public.apply_order_cancel(uuid, uuid, text, text, integer, boolean) to service_role;

notify pgrst, 'reload schema';
