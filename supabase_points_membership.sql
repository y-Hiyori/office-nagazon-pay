-- ============================================================
-- NAGAZON 会員価格 ＋ 購入時付与ポイント
-- Supabase Dashboard → SQL Editor で全行実行してください
-- ============================================================

-- 1) 商品に「会員価格」と「購入時付与ポイント」を追加
alter table products
  add column if not exists member_price integer;
alter table products
  add column if not exists earn_points integer not null default 0;

-- 2) 注文に「獲得ポイント」記録用カラムを追加（付与済み判定にも使用）
alter table orders
  add column if not exists points_earned integer not null default 0;
alter table orders
  add column if not exists points_awarded_at timestamptz;

-- 3) 決済完了後に呼ぶ付与関数（ログインユーザーのみ・商品ごとの earn_points × 数量）
create or replace function points_award_for_order(p_order_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_total integer := 0;
begin
  -- 注文の持ち主を取得（ゲストは user_id = null → 付与しない）
  select user_id into v_user from orders where id = p_order_id;
  if v_user is null then
    return 0;
  end if;

  -- 既に付与済みなら何もしない（二重付与防止）
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

  -- 注文に付与記録
  update orders
     set points_earned = v_total, points_awarded_at = now()
   where id = p_order_id;

  return v_total;
end;
$$;
