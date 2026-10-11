-- ============================================================
-- NAGAZON v39 追加SQL
--   ゲーム景品（coupon_rewards）に「難易度」と「クーポンコード」を追加
--   ・difficulty  : 景品が適用される難易度（any / easy / normal / hard）
--                   既存行は 'any'（=全難易度共通）で今まで通り
--   ・coupon_code : お客様のクーポン画面に表示するコード（管理画面で設定）
-- 実行場所：Supabase Dashboard → SQL Editor → 全行実行（1回だけでOK）
-- ============================================================

alter table public.coupon_rewards
  add column if not exists difficulty text not null default 'any',
  add column if not exists coupon_code text not null default '';

alter table public.coupon_rewards drop constraint if exists coupon_rewards_difficulty_chk;
alter table public.coupon_rewards
  add constraint coupon_rewards_difficulty_chk
  check (difficulty in ('any', 'easy', 'normal', 'hard'));

comment on column public.coupon_rewards.difficulty is
  '景品が適用される難易度（any/easy/normal/hard）';
comment on column public.coupon_rewards.coupon_code is
  'お客様画面に表示するクーポンコード（設定したコード）';
