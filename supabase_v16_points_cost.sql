-- ============================================================
-- NAGAZON v16 追加SQL（ポイント使用額の復元・管理者用ポイント履歴・仕入れ原価）
-- 実行場所：Supabase Dashboard → SQL Editor → 全行実行（1回だけでOK）
-- ============================================================

-- ---------- 1) 商品の仕入れ原価カラム ----------
alter table public.products
  add column if not exists cost integer;

comment on column public.products.cost is '商品原価（1個あたり・円）。売上・粗利計算に使用';

-- ---------- 2) ポイント履歴テーブル（無ければ作成） ----------
create table if not exists public.point_transactions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  type          text not null check (type in ('earn', 'use', 'expire', 'adjust')),
  amount        integer not null check (amount <> 0),
  balance_after integer not null default 0,
  order_id      uuid references public.orders(id) on delete set null,
  description   text,
  created_at    timestamptz not null default now()
);

create index if not exists idx_point_tx_user_time
  on public.point_transactions (user_id, created_at desc);

alter table public.point_transactions enable row level security;

drop policy if exists point_tx_select_own on public.point_transactions;
create policy point_tx_select_own on public.point_transactions
  for select using (auth.uid() = user_id);

-- ---------- 3) 過去注文の「ポイント使用額」を復元 ----------
-- PayPay併用の注文で points_used が保存されていなかったため、
-- 「小計 − 割引 − 入金」をポイント使用額として補正します。
update public.orders
   set points_used = greatest(0, coalesce(subtotal, 0) - coalesce(discount_amount, 0) - coalesce(total, 0))
 where status = 'paid'
   and coalesce(points_used, 0) = 0
   and greatest(0, coalesce(subtotal, 0) - coalesce(discount_amount, 0) - coalesce(total, 0)) > 0;

update public.orders
   set points_applied = true
 where coalesce(points_used, 0) > 0;

-- ---------- 4) 管理者用：指定ユーザーのポイント履歴 ----------
create or replace function public.admin_point_history(p_user_id uuid, p_limit integer default 200)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_admin boolean;
  v_rows jsonb;
  v_balance integer;
begin
  select coalesce(p.is_admin, false) into v_is_admin
    from public.profiles p
   where p.id = auth.uid();

  if v_is_admin is not true then
    raise exception 'ADMIN_ONLY';
  end if;

  select coalesce(jsonb_agg(t order by t.created_at desc), '[]'::jsonb)
    into v_rows
    from (
      select id, user_id, type, amount, balance_after, order_id, description, created_at
        from public.point_transactions
       where user_id = p_user_id
       order by created_at desc
       limit greatest(1, least(coalesce(p_limit, 200), 1000))
    ) t;

  select coalesce(w.balance, 0) into v_balance
    from public.points_wallet w
   where w.user_id = p_user_id;

  return jsonb_build_object(
    'balance', coalesce(v_balance, 0),
    'transactions', v_rows
  );
end;
$$;

grant execute on function public.admin_point_history(uuid, integer) to authenticated;

-- 確認用（任意）
-- select public.admin_point_history('<ユーザーUUID>'::uuid, 50);
