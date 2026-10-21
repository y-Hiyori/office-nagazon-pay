-- 棚卸し・在庫差異の機能を削除（データが空のためテーブルも削除）
drop function if exists public.guard_save_inventory_check(text, jsonb);
drop table if exists public.inventory_check_items;
drop table if exists public.inventory_checks;

notify pgrst, 'reload schema';
