-- ============================================================
-- NAGAZON ポイント履歴 v1
-- 1) ポイント履歴テーブルを作成
-- 2) 既存RPCを「履歴記録付き」に置き換え（挙動は従来通り）
-- 3) ポイント失効（付与から365日間未使用で自動失効）
-- 4) 会員向け：履歴取得RPC
-- 実行場所：Supabase Dashboard → SQL Editor → 全行実行
-- ============================================================

-- ---------- その1：ポイント履歴テーブル ----------
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

-- RLS：本人の履歴だけ読める（RPC経由でも実行される保険）
alter table public.point_transactions enable row level security;

drop policy if exists point_tx_select_own on public.point_transactions;
create policy point_tx_select_own on public.point_transactions
  for select using (auth.uid() = user_id);

-- ---------- その2：既存RPCの置き換え（履歴記録を追加） ----------
-- 既存定義と引数が違う場合に備えて、一度削除してから作り直す
drop function if exists public.points_award_for_order(uuid);
drop function if exists public.points_use_for_order(uuid, integer);
drop function if exists public.points_get_my_wallet();

-- 購入時のポイント付与（従来挙動 ＋ 履歴記録）
create or replace function points_award_for_order(p_order_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_total integer := 0;
  v_balance integer := 0;
begin
  -- ゲスト（user_id = null）は付与しない
  select user_id into v_user from orders where id = p_order_id;
  if v_user is null then
    return 0;
  end if;

  -- 二重付与防止
  perform 1 from orders where id = p_order_id and points_awarded_at is not null;
  if found then
    select coalesce(points_earned, 0) into v_total from orders where id = p_order_id;
    return v_total;
  end if;

  -- 商品ごとの付与ポイント × 数量 を合計
  select coalesce(sum(oi.quantity * coalesce(p.earn_points, 0)), 0)
    into v_total
    from order_items oi
    join products p on p.id = oi.product_id
   where oi.order_id = p_order_id;

  -- 財布へ加算（行が無ければ作成）
  update points_wallet
     set balance = coalesce(balance, 0) + v_total, updated_at = now()
   where user_id = v_user;
  if not found then
    insert into points_wallet (user_id, balance, updated_at)
    values (v_user, v_total, now());
  end if;

  select coalesce(balance, 0) into v_balance from points_wallet where user_id = v_user;

  -- 履歴記録（0 pt の時は記録しない）
  if v_total > 0 then
    insert into point_transactions (user_id, type, amount, balance_after, order_id, description, created_at)
    values (v_user, 'earn', v_total, v_balance, p_order_id,
            format('購入で %s pt 付与', v_total), now());
  end if;

  -- 注文に付与記録
  update orders
     set points_earned = v_total, points_awarded_at = now()
   where id = p_order_id;

  return v_total;
end;
$$;

-- 決済時のポイント使用（従来挙動 ＋ 履歴記録 ＋ 二重使用防止）
create or replace function points_use_for_order(p_order_id uuid, p_points integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_points integer;
  v_balance integer;
begin
  select user_id into v_user from orders where id = p_order_id;
  if v_user is null then
    return false;
  end if;

  v_points := greatest(0, coalesce(p_points, 0));
  if v_points = 0 then
    return true;
  end if;

  -- 二重使用防止：この注文の使用履歴が既にあれば何もしない
  perform 1 from point_transactions
   where user_id = v_user and order_id = p_order_id and type = 'use';
  if found then
    return true;
  end if;

  -- 残高チェック
  select coalesce(balance, 0) into v_balance from points_wallet where user_id = v_user;
  if v_points > v_balance then
    raise exception 'INSUFFICIENT_POINTS';
  end if;

  -- 差し引き
  update points_wallet
     set balance = balance - v_points, updated_at = now()
   where user_id = v_user;

  select coalesce(balance, 0) into v_balance from points_wallet where user_id = v_user;

  -- 履歴記録
  insert into point_transactions (user_id, type, amount, balance_after, order_id, description, created_at)
  values (v_user, 'use', -v_points, v_balance, p_order_id,
          format('決済で %s pt 使用', v_points), now());

  return true;
end;
$$;

-- 保有ポイント取得（従来通り：balance / available）
create or replace function points_get_my_wallet()
returns table (balance integer, available integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
begin
  select coalesce(balance, 0) into v_balance from points_wallet where user_id = auth.uid();
  if v_balance is null then v_balance := 0; end if;
  return query select v_balance, v_balance;
end;
$$;

-- ---------- その3：会員向け ポイント履歴取得 ----------
create or replace function points_get_my_history()
returns setof point_transactions
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    select * from point_transactions
     where user_id = auth.uid()
     order by created_at desc, id desc;
end;
$$;

-- ---------- その4：失効処理 ----------
-- 付与から p_days 日以上経過した「未使用ポイント」を失効させる（FIFO方式）
create or replace function points_expire_older_than(p_days integer default 365)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cutoff timestamptz := now() - make_interval(days => greatest(coalesce(p_days, 365), 1));
  v_total_expired integer := 0;
  v_earn_old integer;
  v_earn_new integer;
  v_spent integer;
  v_unused_old integer;
  v_balance integer;
  r record;
begin
  for r in select user_id from points_wallet loop
    -- 古い獲得（カットオフ前）
    select coalesce(sum(amount), 0) into v_earn_old
      from point_transactions
     where user_id = r.user_id and type = 'earn' and created_at < v_cutoff;

    -- 新しい獲得（カットオフ以降）
    select coalesce(sum(amount), 0) into v_earn_new
      from point_transactions
     where user_id = r.user_id and type = 'earn' and created_at >= v_cutoff;

    -- 使用済み・失効済みの合計
    select coalesce(sum(-amount), 0) into v_spent
      from point_transactions
     where user_id = r.user_id and type in ('use', 'expire');

    -- FIFO：古いポイントのうち「まだ使われていない分」
    v_unused_old := v_earn_old - greatest(0, v_spent - v_earn_new);

    if v_unused_old > 0 then
      update points_wallet set balance = balance - v_unused_old, updated_at = now()
       where user_id = r.user_id;
      select coalesce(balance, 0) into v_balance from points_wallet where user_id = r.user_id;

      insert into point_transactions (user_id, type, amount, balance_after, description, created_at)
      values (r.user_id, 'expire', -v_unused_old, v_balance,
              format('%s日間獲得ポイントが未使用のため失効', greatest(coalesce(p_days, 365), 1)),
              now());

      v_total_expired := v_total_expired + v_unused_old;
    end if;
  end loop;

  return v_total_expired;
end;
$$;

-- ---------- その5：失効の自動実行（毎日 20:00 UTC ＝ 日本時間 5:00） ----------
-- ※ pg_cron は Supabase の拡張機能として SQL から有効化できます（追加料金なし）
create extension if not exists pg_cron;

select cron.unschedule('nagazon-points-expire-daily')
 where exists (select 1 from pg_extension where extname = 'pg_cron')
   and exists (select 1 from cron.job where jobname = 'nagazon-points-expire-daily');

select cron.schedule('nagazon-points-expire-daily', '0 20 * * *',
  $$ select public.points_expire_older_than(365); $$);

-- 手動で失効を実行したい場合（テスト用）
-- select public.points_expire_older_than(365);
