-- ============================================================
-- NAGAZON v20 追加SQL
--   ロットに「期限なし」を設定できるようにする
--   ・no_expiry = true のロットは期限未設定でもOK（意図的な期限なし）
--   ・no_expiry = false で期限が空のロットは「要入力」として警告が残ります
-- 実行場所：Supabase Dashboard → SQL Editor → 全行実行（1回だけでOK）
-- ※ v19 の supabase_v19_stock_adjust.sql まで実行済みの前提です
-- ============================================================

alter table public.product_lots
  add column if not exists no_expiry boolean not null default false;

comment on column public.product_lots.no_expiry is
  '期限なし（true）／期限あり（false）。trueのとき expiry_date は空でOK';

-- 期限が入っているロットは「期限あり」に揃える
update public.product_lots set no_expiry = false where expiry_date is not null;

create index if not exists idx_product_lots_no_expiry on public.product_lots(no_expiry);

-- ---------- 確認用（任意） ----------
-- select product_id, lot_label, cost, remaining, expiry_date, no_expiry from public.product_lots order by created_at desc limit 30;
