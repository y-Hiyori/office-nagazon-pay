-- ============================================================
-- NAGAZON 管理者用 売上集計RPC（売上ページの安定化）
-- 売上状況ページはフロントから直接 orders / order_items を
-- 読んでいましたが、RLS等の影響で商品別一覧が空になることが
-- ありました。管理者専用の「まとめ読みRPC」に切り替えることで
-- 確実に全データを取得できるようになります。
--
-- 実行場所：Supabase Dashboard → SQL Editor → 全行実行
-- （1回だけ実行すればOK。置き換えたい場合はコメント末尾参照）
-- ============================================================

create or replace function public.admin_sales_summary(p_start timestamptz, p_end timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_admin boolean;
  v_orders jsonb;
  v_items  jsonb;
begin
  -- 管理者チェック（本人以外は実行不可）
  select coalesce(p.is_admin, false) into v_is_admin
    from profiles p
   where p.id = auth.uid();

  if v_is_admin is not true then
    raise exception 'ADMIN_ONLY';
  end if;

  -- 期間内の支払済み注文（作成日時昇順）
  select coalesce(jsonb_agg(to_jsonb(o) order by o.created_at asc), '[]'::jsonb)
    into v_orders
    from orders o
   where o.status = 'paid'
     and o.created_at >= p_start
     and o.created_at <  p_end;

  -- 期間内の支払済み注文に紐づく注文明細（RLSを介さず読める）
  select coalesce(jsonb_agg(to_jsonb(i)), '[]'::jsonb)
    into v_items
    from order_items i
    join orders o on o.id = i.order_id
   where o.status = 'paid'
     and o.created_at >= p_start
     and o.created_at <  p_end;

  return jsonb_build_object(
    'orders', v_orders,
    'items',  v_items
  );
end;
$$;

-- 上書き（作り直し）する場合：
-- drop function if exists public.admin_sales_summary(timestamptz, timestamptz);
-- の後に、上の create or replace を再度実行してください。
