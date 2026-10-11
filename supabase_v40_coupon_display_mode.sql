-- ============================================================
-- NAGAZON v40 追加SQL
--   ゲーム景品（coupon_rewards）に「お客様への提示方法」を追加
--   ・display_mode : 'qr'（QRコード・従来どおり） / 'code'（クーポンコードを表示）
--                   既存行は 'qr'（今までどおり）
-- 実行場所：Supabase Dashboard → SQL Editor → 全行実行（1回だけでOK）
-- ============================================================

alter table public.coupon_rewards
  add column if not exists display_mode text not null default 'qr';

alter table public.coupon_rewards drop constraint if exists coupon_rewards_display_mode_chk;
alter table public.coupon_rewards
  add constraint coupon_rewards_display_mode_chk
  check (display_mode in ('qr', 'code'));

comment on column public.coupon_rewards.display_mode is
  'お客様への提示方法（qr=QRコード / code=クーポンコード表示）';
