-- ============================================================
-- NAGAZON v42 追加SQL
--   注文キャンセル（PayPay返金）＋ お客様からのキャンセル申請
--   実行場所：Supabase Dashboard → SQL Editor → 全行実行（1回だけでOK）
-- ============================================================

-- ---------- 1) orders にキャンセル・返金の記録 ----------
alter table public.orders
  add column if not exists canceled_at        timestamptz,
  add column if not exists canceled_by        uuid,
  add column if not exists cancel_reason      text,
  add column if not exists refund_id          text,
  add column if not exists refund_amount      integer,
  add column if not exists refunded_at        timestamptz,
  add column if not exists refund_started_at  timestamptz,
  add column if not exists points_revoked_at  timestamptz;

create index if not exists idx_orders_status_created
  on public.orders (status, created_at desc);

-- ---------- 2) キャンセル申請テーブル ----------
create table if not exists public.order_cancel_requests (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders(id) on delete cascade,
  user_id     uuid,
  reason      text,
  status      text not null default 'requested'
              check (status in ('requested', 'approved', 'rejected')),
  admin_note  text,
  handled_at  timestamptz,
  handled_by  uuid,
  created_at  timestamptz not null default now()
);

create index if not exists idx_ocr_order  on public.order_cancel_requests(order_id);
create index if not exists idx_ocr_status on public.order_cancel_requests(status, created_at desc);

-- 同じ注文で「申請中」は1件だけ
create unique index if not exists uq_ocr_requested_order
  on public.order_cancel_requests(order_id)
  where status = 'requested';

alter table public.order_cancel_requests enable row level security;

drop policy if exists ocr_select_own on public.order_cancel_requests;
create policy ocr_select_own on public.order_cancel_requests
  for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.profiles p
       where p.id = auth.uid() and coalesce(p.is_admin, false)
    )
  );

drop policy if exists ocr_admin_update on public.order_cancel_requests;
create policy ocr_admin_update on public.order_cancel_requests
  for update
  using (
    exists (select 1 from public.profiles p
             where p.id = auth.uid() and coalesce(p.is_admin, false))
  )
  with check (
    exists (select 1 from public.profiles p
             where p.id = auth.uid() and coalesce(p.is_admin, false))
  );

grant select on public.order_cancel_requests to authenticated;
grant all    on public.order_cancel_requests to service_role;

-- ---------- 3) お客様：キャンセル申請 ----------
create or replace function public.request_order_cancel(
  p_order_id uuid,
  p_reason   text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_order public.orders;
  v_id    uuid;
begin
  if v_uid is null then
    return json_build_object('ok', false, 'error', 'UNAUTHORIZED');
  end if;

  select * into v_order
    from public.orders
   where id = p_order_id
   for update;

  if v_order.id is null then
    return json_build_object('ok', false, 'error', 'NOT_FOUND');
  end if;
  if v_order.user_id is distinct from v_uid then
    return json_build_object('ok', false, 'error', 'FORBIDDEN');
  end if;
  if lower(coalesce(v_order.status, '')) <> 'paid' then
    return json_build_object('ok', false, 'error', 'NOT_PAID');
  end if;
  if coalesce(v_order.fulfillment_type, 'pickup') = 'shipping' then
    if coalesce(v_order.shipping_status, 'preparing') = 'shipped' then
      return json_build_object('ok', false, 'error', 'ALREADY_SHIPPED');
    end if;
  elsif v_order.created_at < now() - interval '48 hours' then
    -- 受取商品（発送以外）は注文から2日以内だけ申請できる
    return json_build_object('ok', false, 'error', 'EXPIRED');
  end if;

  select id into v_id
    from public.order_cancel_requests
   where order_id = p_order_id and status = 'requested'
   limit 1;
  if v_id is not null then
    return json_build_object('ok', true, 'already', true, 'requestId', v_id);
  end if;

  -- 過去に却下された申請があれば、それを再申請として使う
  update public.order_cancel_requests
     set status = 'requested',
         reason = nullif(btrim(coalesce(p_reason, '')), ''),
         admin_note = null,
         handled_at = null,
         handled_by = null,
         created_at = now()
   where order_id = p_order_id and status = 'rejected'
   returning id into v_id;

  if v_id is null then
    insert into public.order_cancel_requests (order_id, user_id, reason, status)
    values (p_order_id, v_uid, nullif(btrim(coalesce(p_reason, '')), ''), 'requested')
    returning id into v_id;
  end if;

  return json_build_object('ok', true, 'requestId', v_id);
end;
$$;

grant execute on function public.request_order_cancel(uuid, text) to authenticated;

-- ---------- 4) 管理者：申請を却下 ----------
create or replace function public.reject_order_cancel(
  p_order_id   uuid,
  p_admin_note text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer := 0;
begin
  if not exists (
    select 1 from public.profiles p
     where p.id = auth.uid() and coalesce(p.is_admin, false)
  ) then
    return json_build_object('ok', false, 'error', 'NOT_ADMIN');
  end if;

  update public.order_cancel_requests
     set status = 'rejected',
         admin_note = nullif(btrim(coalesce(p_admin_note, '')), ''),
         handled_at = now(),
         handled_by = auth.uid()
   where order_id = p_order_id and status = 'requested';

  get diagnostics v_n = row_count;
  return json_build_object('ok', true, 'rejected', v_n);
end;
$$;

grant execute on function public.reject_order_cancel(uuid, text) to authenticated;

-- ---------- 5) 返金確定（サーバー専用） ----------
--   ・在庫/ロットを戻す
--   ・クーポン使用回数を戻す
--   ・使用ポイントを返還／付与ポイントを取り消す（任意）
--   ・注文を canceled にする
--   ※ フロントから直接は実行できない（service_role のみ）
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

  -- 合計◯個限定セールの残数を戻す
  update public.products p
     set sale_remaining = least(
           coalesce(p.sale_qty, 0),
           coalesce(p.sale_remaining, 0) + q.qty
         )
    from (
      select oi.product_id,
             sum(greatest(0, coalesce(oi.quantity, 0)))::integer as qty
        from public.order_items oi
       where oi.order_id = p_order_id
       group by oi.product_id
    ) q
   where p.id = q.product_id
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

-- ---------- 6) スキーマ再読み込み ----------
notify pgrst, 'reload schema';
