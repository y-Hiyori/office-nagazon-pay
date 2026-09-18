-- ============================================================
-- NAGAZON v19 追加SQL
--   在庫を減らした履歴（理由・対象ロット）を残すためのテーブル
--   ・在庫を減らすときは必ず「理由」と「対象ロット」が必要になります
-- 実行場所：Supabase Dashboard → SQL Editor → 全行実行（1回だけでOK）
-- ※ v18 の supabase_v18_product_sale.sql まで実行済みの前提です
-- ============================================================

-- ---------- 1) 在庫調整の履歴 ----------
create table if not exists public.stock_adjustments (
  id          uuid primary key default gen_random_uuid(),
  product_id  integer not null references public.products(id) on delete cascade,
  lot_id      uuid,
  qty         integer not null,          -- 在庫の増減数（減らしたときはマイナス）
  reason      text    not null,          -- 減らした理由（必須）
  memo        text,
  lot_label   text,                      -- 対象ロットのメモ
  cost        integer,                   -- 対象ロットの原価
  expiry_date date,                      -- 対象ロットの期限
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now()
);

create index if not exists idx_stock_adj_product on public.stock_adjustments(product_id);
create index if not exists idx_stock_adj_created on public.stock_adjustments(created_at desc);

alter table public.stock_adjustments enable row level security;

drop policy if exists stock_adjustments_admin_all on public.stock_adjustments;
create policy stock_adjustments_admin_all on public.stock_adjustments
  for all
  using (
    exists (select 1 from public.profiles p
             where p.id = auth.uid() and coalesce(p.is_admin, false))
  )
  with check (
    exists (select 1 from public.profiles p
             where p.id = auth.uid() and coalesce(p.is_admin, false))
  );

comment on table public.stock_adjustments is '在庫の増減履歴（在庫を減らした理由と対象ロットを記録）';

-- ---------- 2) 確認用（任意） ----------
-- select created_at, product_id, lot_label, qty, reason, memo
--   from public.stock_adjustments order by created_at desc limit 50;

-- ---------- 3) 在庫があるのにロット未作成の商品を一覧（任意・確認用） ----------
-- select p.id, p.name, p.stock,
--        coalesce(sum(l.remaining), 0) as lot_remaining,
--        p.stock - coalesce(sum(l.remaining), 0) as diff
--   from public.products p
--   left join public.product_lots l on l.product_id = p.id
--  group by p.id, p.name, p.stock
-- having p.stock - coalesce(sum(l.remaining), 0) > 0
--  order by p.id;
