-- ============================================================
-- NAGAZON v47 不具合修正
--   1) ゲストのゲームスコアがベスト更新できない問題
--      ・game_scores の UPDATE ポリシーが authenticated にしか無く、
--        ゲスト（anon）は「初回INSERTだけ成功 → 以降のベスト更新がRLSで無言却下」されていた。
--   2) クーポン使用回数が増えない問題
--      ・PayPay決済の paid 確定時に coupon_redeem_for_order が呼ばれていなかった。
--      ・過去の「支払済みなのに記録が無い」注文を coupon_redemptions に補填し、
--        used_count を実績に合わせて再計算する。
-- 実行場所：Supabase Dashboard → SQL Editor（または Management API）
-- ============================================================

-- ---------- 1) ゲストのベストスコア更新を許可 ----------
drop policy if exists "game_scores_update_guest" on public.game_scores;
create policy "game_scores_update_guest"
  on public.game_scores
  for update
  to anon
  using (is_guest = true and user_id is null)
  with check (is_guest = true and user_id is null);

-- ゲスト（anon）が更新できるのはスコアと難易度だけ。
-- 表示名・user_id・is_guest を書き換えて他人の行を乗っ取るのを防ぐ。
create or replace function public.game_scores_guard_guest_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.is_guest = true and old.user_id is null and auth.uid() is null then
    new.display_name := old.display_name;
    new.user_id := old.user_id;
    new.is_guest := old.is_guest;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_game_scores_guard_guest_update on public.game_scores;
create trigger trg_game_scores_guard_guest_update
  before update on public.game_scores
  for each row
  execute function public.game_scores_guard_guest_update();

-- ---------- 2) クーポン使用回数の補填 ----------
-- どの購入経路（PayPay / 0円クーポン / ゲスト / 会員）でも
-- 「paid になった瞬間」に必ず1回だけ数える（注文ID単位で冪等）。
create or replace function public.orders_coupon_redeem_on_paid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'paid' then
      begin
        perform public.coupon_redeem_for_order(new.id);
      exception when others then
        raise warning 'coupon_redeem_for_order(insert) failed for %: %', new.id, sqlerrm;
      end;
    end if;
    return new;
  end if;

  if new.status = 'paid' and old.status is distinct from 'paid' then
    begin
      perform public.coupon_redeem_for_order(new.id);
    exception when others then
      raise warning 'coupon_redeem_for_order failed for %: %', new.id, sqlerrm;
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_orders_coupon_redeem_on_paid on public.orders;
create trigger trg_orders_coupon_redeem_on_paid
  after insert or update of status on public.orders
  for each row
  execute function public.orders_coupon_redeem_on_paid();

-- 支払済みなのに coupon_redemptions が無い注文を補填（既存は変更しない）
insert into public.coupon_redemptions (code, order_id, user_id, email)
select upper(btrim(o.coupon_code)),
       o.id,
       o.user_id,
       nullif(lower(btrim(o.email)), '')
  from public.orders o
  join public.coupons c
    on c.code = upper(btrim(o.coupon_code))
 where o.status = 'paid'
   and o.coupon_code is not null
   and btrim(o.coupon_code) <> ''
on conflict (code, order_id) do nothing;

-- used_count を実績（coupon_redemptions の件数）に合わせる
update public.coupons c
   set used_count = r.cnt
  from (
    select code, count(*)::int as cnt
      from public.coupon_redemptions
     group by code
  ) r
 where r.code = c.code
   and coalesce(c.used_count, 0) <> r.cnt;

-- ---------- 確認用 ----------
-- select code, used_count from public.coupons order by created_at desc;
-- select id, display_name, score, difficulty from public.game_scores order by score desc;
