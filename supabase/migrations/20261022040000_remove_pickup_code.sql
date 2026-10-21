-- 決済後の6桁受け取りコードを削除して、コード導入前の状態に戻す
-- カメラとの照合に使う pickup_status / picked_up_at は内部用として残す
drop trigger if exists trg_guard_assign_pickup_code on public.orders;
drop function if exists public.guard_assign_pickup_code();
drop function if exists public.guard_expire_pickups();
drop function if exists public.guard_mark_picked_up(uuid, text);

drop index if exists public.idx_orders_pickup_waiting;
drop index if exists public.idx_orders_pickup_expires;
drop index if exists public.uq_orders_pickup_code_waiting;

alter table public.orders
  drop column if exists pickup_code,
  drop column if exists pickup_code_expires_at,
  drop column if exists pickup_note;

notify pgrst, 'reload schema';
