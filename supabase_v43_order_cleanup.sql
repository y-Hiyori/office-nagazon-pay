-- ============================================================
-- NAGAZON v43 追加SQL
--   決済が完了していない注文（未払い・失敗・未払い取消）を
--   管理者が削除するためのログとRPC
--   実行場所：Supabase Dashboard → SQL Editor → 全行実行（1回だけでOK）
-- ============================================================

-- ---------- 1) 削除ログ（後から確認できるように内容を残す） ----------
create table if not exists public.order_deletion_logs (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null,
  status           text,
  total            integer,
  user_id          uuid,
  name             text,
  email            text,
  order_created_at timestamptz,
  deleted_by       uuid,
  deleted_at       timestamptz not null default now(),
  snapshot         jsonb
);

create index if not exists idx_odl_order on public.order_deletion_logs(order_id);
create index if not exists idx_odl_deleted on public.order_deletion_logs(deleted_at desc);

alter table public.order_deletion_logs enable row level security;

drop policy if exists odl_admin_select on public.order_deletion_logs;
create policy odl_admin_select on public.order_deletion_logs
  for select
  using (
    exists (select 1 from public.profiles p
             where p.id = auth.uid() and coalesce(p.is_admin, false))
  );

grant select on public.order_deletion_logs to authenticated;
grant all    on public.order_deletion_logs to service_role;

-- ---------- 2) 未払い注文の削除（サーバー専用） ----------
--   ・支払済み（paid_atあり / status=paid）は絶対に削除しない
--   ・クーポン使用回数だけは戻す
--   ・注文・明細・申請・ポイント履歴を削除
create or replace function public.admin_delete_unpaid_order(
  p_order_id uuid,
  p_admin_id uuid
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_code  record;
  v_items jsonb;
begin
  select * into v_order
    from public.orders
   where id = p_order_id
   for update;

  if v_order.id is null then
    return json_build_object('ok', false, 'error', 'NOT_FOUND');
  end if;

  if lower(coalesce(v_order.status, '')) = 'paid' or v_order.paid_at is not null then
    return json_build_object('ok', false, 'error', 'PAID');
  end if;

  select coalesce(jsonb_agg(to_jsonb(oi)), '[]'::jsonb)
    into v_items
    from public.order_items oi
   where oi.order_id = p_order_id;

  insert into public.order_deletion_logs
    (order_id, status, total, user_id, name, email, order_created_at, deleted_by, snapshot)
  values
    (v_order.id, v_order.status, v_order.total, v_order.user_id, v_order.name, v_order.email,
     v_order.created_at, p_admin_id,
     jsonb_build_object('order', to_jsonb(v_order), 'items', v_items));

  -- クーポンを使っていた場合は使用回数を戻す
  for v_code in
    select code from public.coupon_redemptions where order_id = p_order_id
  loop
    update public.coupons
       set used_count = greatest(0, coalesce(used_count, 0) - 1)
     where code = v_code.code;
  end loop;
  delete from public.coupon_redemptions where order_id = p_order_id;

  delete from public.order_cancel_requests where order_id = p_order_id;
  delete from public.order_lot_consumptions where order_id = p_order_id;
  delete from public.point_transactions where order_id = p_order_id;
  delete from public.order_items where order_id = p_order_id;
  delete from public.orders where id = p_order_id;

  return json_build_object('ok', true, 'deleted', true);
end;
$$;

revoke all on function public.admin_delete_unpaid_order(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_delete_unpaid_order(uuid, uuid) to service_role;

notify pgrst, 'reload schema';
