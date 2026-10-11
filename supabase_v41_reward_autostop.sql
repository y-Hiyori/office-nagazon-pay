-- ============================================================
-- NAGAZON v41 追加SQL
--   ゲーム景品（coupon_rewards）の「期限切れを自動で停止」
--   ・期限（valid_to）を過ぎた景品は is_active=false に自動変更
--   ・pg_cron で5分ごとに実行
--   アプリ側は is_active=true のみ表示するため、期限切れは表示されなくなる
-- 実行場所：Supabase Dashboard → SQL Editor → 全行実行（1回だけでOK）
-- ============================================================

create or replace function public.deactivate_expired_coupon_rewards()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  update public.coupon_rewards
     set is_active = false,
         updated_at = now()
   where is_active = true
     and valid_to is not null
     and valid_to < now();
  get diagnostics n = row_count;
  return n;
end;
$$;

grant execute on function public.deactivate_expired_coupon_rewards() to anon, authenticated;

-- 5分ごとに実行（既存ジョブがあれば入れ替え）
select cron.unschedule('deactivate_expired_rewards')
 where exists (select 1 from cron.job where jobname = 'deactivate_expired_rewards');

select cron.schedule('deactivate_expired_rewards', '*/5 * * * *',
  'select public.deactivate_expired_coupon_rewards();');

-- すぐに一度実行
select public.deactivate_expired_coupon_rewards() as deactivated_now;
