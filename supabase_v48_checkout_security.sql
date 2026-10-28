-- ============================================================
-- NAGAZON v48 追加SQL
--   決済まわりの不具合・不正防止
--   1) 誰でも他人のアカウントを削除できてしまう delete_user_by_admin を管理者限定に修正
--   2) 0円購入を Edge Function（service role）に一本化したため、
--      クライアントからの注文作成・更新・在庫減算・ポイント操作を禁止
--   3) ポイント残高の直接更新（自分で残高を増やせる穴）を禁止
--   4) クーポン使用記録を注文の user_id で正しく残す
-- 実行場所：Supabase Dashboard → SQL Editor（または Management API）
-- ============================================================

-- ---------- 1) 管理者以外はユーザー削除できないようにする ----------
create or replace function public.delete_user_by_admin(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null
     or not exists (
       select 1 from public.profiles p
        where p.id = auth.uid() and coalesce(p.is_admin, false)
     ) then
    raise exception 'not allowed';
  end if;

  if target_user_id = auth.uid() then
    raise exception 'cannot delete yourself';
  end if;

  delete from auth.users where id = target_user_id;
end;
$$;

revoke all on function public.delete_user_by_admin(uuid) from public, anon;
grant execute on function public.delete_user_by_admin(uuid) to authenticated, service_role;

-- ---------- 2) クライアントからの注文書き込みを停止 ----------
-- 0円購入は guest-checkout（service role）が、
-- PayPay注文は VPS の決済API（service role）が作成する。
drop policy if exists orders_insert_own on public.orders;
drop policy if exists orders_update_own on public.orders;
drop policy if exists order_items_insert_own on public.order_items;

-- ---------- 3) ポイント残高の直接更新を停止 ----------
-- 付与・使用・調整は SECURITY DEFINER 関数だけが行う。
drop policy if exists points_wallet_insert_own on public.points_wallet;
drop policy if exists wallet_insert on public.points_wallet;
drop policy if exists points_wallet_update_own on public.points_wallet;
drop policy if exists wallet_update on public.points_wallet;

-- ---------- 4) 内部処理用RPCを service_role 専用にする ----------
revoke execute on function public.decrement_stock(integer, integer) from public, anon, authenticated;
revoke execute on function public.decrement_stock_for_order(uuid) from public, anon, authenticated;
revoke execute on function public.consume_lots(integer, integer) from public, anon, authenticated;
revoke execute on function public.consume_lots_for_order(uuid) from public, anon, authenticated;
revoke execute on function public.sync_product_lots(integer) from public, anon, authenticated;
revoke execute on function public.sync_all_product_lots() from public, anon, authenticated;

revoke execute on function public.coupon_redeem(text, uuid, text) from public, anon, authenticated;

revoke execute on function public.points_award_for_order(uuid) from public, anon, authenticated;
revoke execute on function public.points_use_for_order(uuid, integer) from public, anon, authenticated;
revoke execute on function public.points_spend_for_order(uuid, integer) from public, anon, authenticated;
revoke execute on function public.points_insert_tx(uuid, text, integer, integer, uuid, text) from public, anon, authenticated;
revoke execute on function public.points_reserve_for_order(uuid, integer) from public, anon, authenticated;
revoke execute on function public.points_reserve_for_order_as(uuid, uuid, integer) from public, anon, authenticated;
revoke execute on function public.points_finalize_for_order(uuid) from public, anon, authenticated;
revoke execute on function public.points_finalize_for_order_as(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.points_release_for_order(uuid) from public, anon, authenticated;
revoke execute on function public.points_release_for_order_as(uuid, uuid) from public, anon, authenticated;
revoke execute on function public._ensure_points_wallet(uuid) from public, anon, authenticated;
revoke execute on function public.use_my_points(integer) from public, anon, authenticated;

-- ポイント欄だけを後から書き換えられるRPCは廃止（キャンセル時の返還悪用を防ぐ）
drop function if exists public.set_order_points_used(uuid, text, integer);

-- ---------- 5) クーポン使用記録（注文の user_id を正しく保存） ----------
create or replace function public.coupon_redeem_for_order(p_order_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code  text;
  v_email text;
  v_user  uuid;
  v_total integer;
  v_row   public.coupons;
  v_used  integer;
  v_n     integer;
begin
  select o.coupon_code, o.email, o.user_id, o.total
    into v_code, v_email, v_user, v_total
    from public.orders o
   where o.id = p_order_id;

  if v_code is null or btrim(v_code) = '' then
    return json_build_object('ok', true, 'skipped', true);
  end if;

  v_code  := upper(btrim(v_code));
  v_email := lower(btrim(coalesce(v_email, '')));

  select * into v_row from public.coupons where code = v_code;
  if v_row.code is null then
    return json_build_object('ok', false, 'error', 'coupon not found');
  end if;

  if v_row.per_user_limit is not null then
    select count(*)::integer into v_used
      from public.coupon_redemptions r
     where r.code = v_code
       and (
         (v_user is not null and r.user_id = v_user)
         or (v_email <> '' and lower(coalesce(r.email, '')) = v_email)
       );

    if v_used >= v_row.per_user_limit then
      return json_build_object('ok', false, 'error', 'per user limit reached', 'used', v_used);
    end if;
  end if;

  insert into public.coupon_redemptions (code, order_id, user_id, email, total)
  values (v_code, p_order_id, v_user, nullif(v_email, ''), v_total)
  on conflict (code, order_id) do nothing;

  get diagnostics v_n = row_count;

  if v_n > 0 then
    update public.coupons
       set used_count = coalesce(used_count, 0) + 1
     where code = v_code;
  end if;

  return json_build_object('ok', true, 'counted', v_n > 0);
end;
$$;

revoke all on function public.coupon_redeem_for_order(uuid) from public, anon, authenticated;
grant execute on function public.coupon_redeem_for_order(uuid) to service_role;

-- ---------- 確認用 ----------
-- select tablename, policyname, cmd from pg_policies where tablename in ('orders','order_items','points_wallet') order by 1,2;
-- select proname, proacl from pg_proc where proname in ('decrement_stock','coupon_redeem_for_order','delete_user_by_admin');

-- ---------- 6) 注文の閲覧を本人（または管理者）だけに限定 ----------
-- 以前は qual=true で、匿名でも全注文の氏名・メール・住所・電話・トークンが読めていた。
drop policy if exists orders_select_own on public.orders;
create policy orders_select_own
  on public.orders
  for select
  to authenticated
  using (user_id = auth.uid());

-- ---------- 7) 商品IDの採番ズレを修正 ----------
-- 過去に明示ID（500/501など）で登録したため、products_id_seq が 11 のままで
-- 次の商品登録が duplicate key で失敗することがあった。
select setval('public.products_id_seq', coalesce((select max(id) from public.products), 1));

-- ---------- 8) 管理者フラグの自己昇格を禁止 ----------
-- profiles の UPDATE ポリシーは行単位のため、自分の is_admin を true にできてしまっていた。
create or replace function public.profiles_guard_is_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_admin boolean := false;
  v_role     text := coalesce(auth.role(), '');
begin
  -- service_role / 直接SQL（postgres）は許可
  if v_role = 'service_role' then
    return new;
  end if;
  if session_user in ('postgres', 'supabase_admin') then
    return new;
  end if;

  if auth.uid() is not null then
    select coalesce(p.is_admin, false)
      into v_is_admin
      from public.profiles p
     where p.id = auth.uid();
    v_is_admin := coalesce(v_is_admin, false);
  end if;

  if tg_op = 'INSERT' then
    if new.is_admin = true and not v_is_admin then
      new.is_admin := false;
    end if;
    return new;
  end if;

  if new.is_admin is distinct from old.is_admin and not v_is_admin then
    raise exception 'is_admin can only be changed by admins';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_profiles_guard_is_admin on public.profiles;
create trigger trg_profiles_guard_is_admin
  before insert or update on public.profiles
  for each row
  execute function public.profiles_guard_is_admin();

-- ---------- 9) 商品の原価（cost）を匿名ユーザーに公開しない ----------
-- products の public read は必要な列だけを許可し、cost は anon から読めなくする。
revoke select on public.products from anon;
grant select (
  id, stock, name, price, created_at, is_visible, original_price, member_price,
  earn_points, is_shipping, shipping_lead_min, shipping_lead_max, shipping_lead_unit,
  max_per_order, expiry_alert_days, sale_price, sale_qty, sale_remaining, sale_mode,
  sale_starts_at, sale_ends_at, sale_active
) on public.products to anon;

-- ---------- 10) 原価は管理者だけが読めるようにする ----------
-- 管理者画面は products_admin（is_admin() で絞り込み）を使う。
create or replace view public.products_admin as
select p.* from public.products p where public.is_admin();

grant select on public.products_admin to authenticated;

revoke select on public.products from authenticated;
grant select (
  id, stock, name, price, created_at, is_visible, original_price, member_price,
  earn_points, is_shipping, shipping_lead_min, shipping_lead_max, shipping_lead_unit,
  max_per_order, expiry_alert_days, sale_price, sale_qty, sale_remaining, sale_mode,
  sale_starts_at, sale_ends_at, sale_active
) on public.products to authenticated;

-- ---------- 11) ゲーム景品のコード・合言葉ハッシュを公開しない ----------
-- coupon_rewards は公開読み取りだが、coupon_code と redeem_password_hash は
-- 「発行済みの人」または管理者だけが読めるようにする。
create or replace view public.coupon_rewards_admin as
select r.* from public.coupon_rewards r where public.is_admin();

grant select on public.coupon_rewards_admin to authenticated;

revoke select on public.coupon_rewards from anon, authenticated;
grant select (
  id, is_active, store_name, store_info, product_name, score_threshold,
  coupon_title, description, valid_from, valid_to, created_at, updated_at,
  difficulty, display_mode
) on public.coupon_rewards to anon, authenticated;
