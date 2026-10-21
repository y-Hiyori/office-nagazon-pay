-- ============================================================
-- NAGAZON v46 追加SQL
--   店頭の見守り（Nagazon Guard）
--     1) 受け取りコード（決済済み・店頭受け取りの注文に自動発行）
--     2) 監視イベント（カメラ／ハブ）と証拠画像
--     3) 棚卸し（実数と在庫の差異を記録）
--     4) 管理者だけが触れるRLS・通知設定・Storageバケット
--   実行場所：Supabase Dashboard → SQL Editor → 全行実行（1回だけでOK）
-- ============================================================

-- ------------------------------------------------------------
-- 0) 管理者判定（RLSから使う共通関数）
-- ------------------------------------------------------------
create or replace function public.guard_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.profiles p
     where p.id = auth.uid()
       and coalesce(p.is_admin, false)
  );
$$;

revoke all on function public.guard_is_admin() from public, anon;
grant execute on function public.guard_is_admin() to authenticated, service_role;

-- ------------------------------------------------------------
-- 1) 受け取りコード
--    決済が paid になった「店頭受け取り」注文に6桁コードを自動発行する
-- ------------------------------------------------------------
alter table public.orders
  add column if not exists pickup_code            text,
  add column if not exists pickup_code_expires_at timestamptz,
  add column if not exists picked_up_at           timestamptz,
  add column if not exists pickup_status          text,
  add column if not exists pickup_note            text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'orders_pickup_status_chk'
  ) then
    alter table public.orders
      add constraint orders_pickup_status_chk
      check (
        pickup_status is null
        or pickup_status in ('waiting', 'picked_up', 'expired', 'canceled', 'manual')
      );
  end if;
end $$;

create or replace function public.guard_assign_pickup_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_try  integer := 0;
begin
  -- キャンセル・失敗は受け取り対象から外す
  if lower(coalesce(new.status, '')) in ('canceled', 'failed') then
    new.pickup_status := 'canceled';
    return new;
  end if;

  -- 発送商品は店頭受け取りの対象外
  if coalesce(new.fulfillment_type, 'pickup') = 'shipping' then
    return new;
  end if;

  -- 決済済みになったらコードを発行（1回だけ）
  if lower(coalesce(new.status, '')) = 'paid' then
    if new.pickup_code is null or length(new.pickup_code) < 6 then
      -- 30日以上前の注文は、後から更新されても受け取り対象にしない
      if coalesce(new.paid_at, new.created_at, now()) < now() - interval '30 days' then
        return new;
      end if;

      loop
        v_try := v_try + 1;
        v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');

        exit when not exists (
          select 1
            from public.orders o
           where o.pickup_code = v_code
             and o.status = 'paid'
             and o.pickup_status = 'waiting'
        );

        if v_try >= 40 then
          exit;
        end if;
      end loop;

      new.pickup_code := v_code;
      new.pickup_code_expires_at := coalesce(new.paid_at, now()) + interval '24 hours';
    end if;

    new.pickup_status := coalesce(nullif(new.pickup_status, ''), 'waiting');
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_assign_pickup_code on public.orders;
create trigger trg_guard_assign_pickup_code
before insert or update on public.orders
for each row execute function public.guard_assign_pickup_code();

-- 既存の「直近14日・決済済み・店頭受け取り」にもコードを付ける
--   ※1文でまとめて更新すると、トリガーの重複チェックが同じ文の先行更新を見られないため、
--     1件ずつ更新してコードの重複を避ける
do $$
declare
  r record;
begin
  for r in
    select id
      from public.orders
     where lower(coalesce(status, '')) = 'paid'
       and coalesce(fulfillment_type, 'pickup') <> 'shipping'
       and pickup_code is null
       and coalesce(paid_at, created_at) > now() - interval '14 days'
  loop
    update public.orders
       set pickup_status = 'waiting'
     where id = r.id;
  end loop;
end $$;

create unique index if not exists uq_orders_pickup_code_waiting
  on public.orders (pickup_code)
  where pickup_code is not null and pickup_status = 'waiting';

create index if not exists idx_orders_pickup_waiting
  on public.orders (pickup_status, paid_at desc)
  where pickup_status = 'waiting';

create index if not exists idx_orders_pickup_expires
  on public.orders (pickup_code_expires_at)
  where pickup_status = 'waiting';

-- 期限切れの受け取りコードを閉じる（cronから呼ぶ）
create or replace function public.guard_expire_pickups()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  if auth.uid() is not null and not public.guard_is_admin() then
    raise exception 'NOT_ADMIN';
  end if;

  update public.orders
     set pickup_status = 'expired'
   where status = 'paid'
     and pickup_status = 'waiting'
     and pickup_code_expires_at is not null
     and pickup_code_expires_at < now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.guard_expire_pickups() from public, anon;
grant execute on function public.guard_expire_pickups() to authenticated, service_role;

-- 管理者が「受け取り済み」にできる（返金・手渡しなどの例外処理用）
create or replace function public.guard_mark_picked_up(
  p_order_id uuid,
  p_note     text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.guard_is_admin() then
    return json_build_object('ok', false, 'error', 'NOT_ADMIN');
  end if;

  update public.orders
     set pickup_status = 'picked_up',
         picked_up_at  = coalesce(picked_up_at, now()),
         pickup_note   = coalesce(p_note, pickup_note)
   where id = p_order_id
     and status = 'paid'
     and coalesce(fulfillment_type, 'pickup') <> 'shipping'
  returning id into v_id;

  if v_id is null then
    return json_build_object('ok', false, 'error', 'NOT_FOUND');
  end if;

  return json_build_object('ok', true, 'order_id', v_id);
end;
$$;

revoke all on function public.guard_mark_picked_up(uuid, text) from public, anon;
grant execute on function public.guard_mark_picked_up(uuid, text) to authenticated, service_role;

-- ------------------------------------------------------------
-- 2) 見守り設定（1行だけ）
-- ------------------------------------------------------------
create table if not exists public.guard_settings (
  id                     integer primary key default 1 check (id = 1),
  armed                  boolean not null default true,
  store_open             time    not null default '08:00',
  store_close            time    not null default '17:00',
  match_window_min       integer not null default 20,
  suspicious_cooldown_sec integer not null default 60,
  motion_threshold       integer not null default 18,
  roi                    jsonb   not null default '{"x":0.12,"y":0.18,"w":0.76,"h":0.64}'::jsonb,
  teams_webhook_url      text,
  alert_email            text,
  retention_days         integer not null default 30,
  notify_on_suspicious   boolean not null default true,
  notify_on_pickup       boolean not null default false,
  device_token           text    not null default (
    md5(random()::text || clock_timestamp()::text) ||
    md5(random()::text || clock_timestamp()::text)
  ),
  updated_at             timestamptz not null default now()
);

insert into public.guard_settings (id) values (1) on conflict (id) do nothing;

alter table public.guard_settings enable row level security;

drop policy if exists guard_settings_admin_all on public.guard_settings;
create policy guard_settings_admin_all on public.guard_settings
  for all
  to authenticated
  using (public.guard_is_admin())
  with check (public.guard_is_admin());

grant select, insert, update, delete on public.guard_settings to authenticated;
grant all on public.guard_settings to service_role;

-- 端末トークンの再発行（管理者のみ）
create or replace function public.guard_rotate_token()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
begin
  if not public.guard_is_admin() then
    raise exception 'NOT_ADMIN';
  end if;

  v_token :=
    md5(random()::text || clock_timestamp()::text) ||
    md5(random()::text || clock_timestamp()::text);

  update public.guard_settings
     set device_token = v_token,
         updated_at   = now()
   where id = 1;

  return v_token;
end;
$$;

revoke all on function public.guard_rotate_token() from public, anon;
grant execute on function public.guard_rotate_token() to authenticated;

-- ------------------------------------------------------------
-- 3) 端末（店頭ハブ／証拠カメラ）
-- ------------------------------------------------------------
create table if not exists public.guard_devices (
  id           text primary key,
  name         text not null,
  kind         text not null check (kind in ('hub', 'camera')),
  last_seen_at timestamptz,
  battery_pct  integer,
  rssi         integer,
  firmware     text,
  ip           text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);

insert into public.guard_devices (id, name, kind) values
  ('hub',    '店頭ハブ（M5Stack Basic）', 'hub'),
  ('camera', '証拠カメラ（Timer Camera X）', 'camera')
on conflict (id) do nothing;

alter table public.guard_devices enable row level security;

drop policy if exists guard_devices_admin_read on public.guard_devices;
create policy guard_devices_admin_read on public.guard_devices
  for select to authenticated
  using (public.guard_is_admin());

drop policy if exists guard_devices_admin_update on public.guard_devices;
create policy guard_devices_admin_update on public.guard_devices
  for update to authenticated
  using (public.guard_is_admin())
  with check (public.guard_is_admin());

grant select, update on public.guard_devices to authenticated;
grant all on public.guard_devices to service_role;

-- ------------------------------------------------------------
-- 4) 監視イベント（不審な動き・受け取り照合・証拠画像）
-- ------------------------------------------------------------
create table if not exists public.guard_events (
  id            uuid primary key default gen_random_uuid(),
  device_id     text references public.guard_devices(id) on delete set null,
  kind          text not null default 'motion'
                check (kind in ('motion', 'pickup', 'heartbeat', 'test', 'manual', 'tamper', 'offline')),
  occurred_at   timestamptz not null default now(),
  received_at   timestamptz not null default now(),
  order_id      uuid references public.orders(id) on delete set null,
  product_id    bigint,
  slot          text,
  delta         integer,
  status        text not null default 'new'
                check (status in ('new', 'ok', 'suspicious', 'resolved', 'ignored')),
  image_path    text,
  image_sha256  text,
  note          text,
  meta          jsonb,
  handled_at    timestamptz,
  handled_by    uuid,
  handle_note   text
);

create index if not exists idx_guard_events_received
  on public.guard_events (received_at desc);
create index if not exists idx_guard_events_status
  on public.guard_events (status, received_at desc);
create index if not exists idx_guard_events_order
  on public.guard_events (order_id);

alter table public.guard_events enable row level security;

drop policy if exists guard_events_admin_read on public.guard_events;
create policy guard_events_admin_read on public.guard_events
  for select to authenticated
  using (public.guard_is_admin());

drop policy if exists guard_events_admin_update on public.guard_events;
create policy guard_events_admin_update on public.guard_events
  for update to authenticated
  using (public.guard_is_admin())
  with check (public.guard_is_admin());

grant select, update on public.guard_events to authenticated;
grant all on public.guard_events to service_role;

-- ------------------------------------------------------------
-- 5) 棚卸し（実数と在庫の差異）
-- ------------------------------------------------------------
create table if not exists public.inventory_checks (
  id             uuid primary key default gen_random_uuid(),
  created_by     uuid references public.profiles(id) on delete set null,
  created_by_name text,
  note           text,
  item_count     integer not null default 0,
  diff_count     integer not null default 0,
  total_diff     integer not null default 0,
  total_abs_diff integer not null default 0,
  created_at     timestamptz not null default now()
);

create table if not exists public.inventory_check_items (
  id           uuid primary key default gen_random_uuid(),
  check_id     uuid not null references public.inventory_checks(id) on delete cascade,
  product_id   bigint,
  product_name text,
  expected     integer not null default 0,
  actual       integer not null default 0,
  diff         integer generated always as (actual - expected) stored,
  note         text
);

create index if not exists idx_inventory_items_check
  on public.inventory_check_items (check_id);
create index if not exists idx_inventory_checks_created
  on public.inventory_checks (created_at desc);

alter table public.inventory_checks enable row level security;
alter table public.inventory_check_items enable row level security;

drop policy if exists inventory_checks_admin_all on public.inventory_checks;
create policy inventory_checks_admin_all on public.inventory_checks
  for all to authenticated
  using (public.guard_is_admin())
  with check (public.guard_is_admin());

drop policy if exists inventory_items_admin_all on public.inventory_check_items;
create policy inventory_items_admin_all on public.inventory_check_items
  for all to authenticated
  using (public.guard_is_admin())
  with check (public.guard_is_admin());

grant all on public.inventory_checks to authenticated;
grant all on public.inventory_check_items to authenticated;
grant all on public.inventory_checks to service_role;
grant all on public.inventory_check_items to service_role;

-- 1回の棚卸しをまとめて保存する（管理者のみ）
create or replace function public.guard_save_inventory_check(
  p_note  text,
  p_items jsonb
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_name  text;
  v_check uuid;
  v_items jsonb := coalesce(p_items, '[]'::jsonb);
begin
  if not public.guard_is_admin() then
    return json_build_object('ok', false, 'error', 'NOT_ADMIN');
  end if;

  if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) = 0 then
    return json_build_object('ok', false, 'error', 'EMPTY_ITEMS');
  end if;

  select coalesce(nullif(p.name, ''), p.email) into v_name
    from public.profiles p
   where p.id = v_uid;

  insert into public.inventory_checks (created_by, created_by_name, note)
  values (v_uid, v_name, nullif(trim(coalesce(p_note, '')), ''))
  returning id into v_check;

  insert into public.inventory_check_items
    (check_id, product_id, product_name, expected, actual, note)
  select
    v_check,
    nullif(x->>'product_id', '')::bigint,
    coalesce(x->>'product_name', ''),
    greatest(0, coalesce((x->>'expected')::integer, 0)),
    greatest(0, coalesce((x->>'actual')::integer, 0)),
    nullif(trim(coalesce(x->>'note', '')), '')
  from jsonb_array_elements(v_items) x;

  update public.inventory_checks c
     set item_count     = (select count(*) from public.inventory_check_items i where i.check_id = v_check),
         diff_count     = (select count(*) from public.inventory_check_items i where i.check_id = v_check and i.diff <> 0),
         total_diff     = (select coalesce(sum(i.diff), 0) from public.inventory_check_items i where i.check_id = v_check),
         total_abs_diff = (select coalesce(sum(abs(i.diff)), 0) from public.inventory_check_items i where i.check_id = v_check)
   where c.id = v_check;

  return json_build_object('ok', true, 'check_id', v_check);
end;
$$;

revoke all on function public.guard_save_inventory_check(text, jsonb) from public, anon;
grant execute on function public.guard_save_inventory_check(text, jsonb) to authenticated;

-- ------------------------------------------------------------
-- 6) 証拠画像のStorageバケット（非公開）
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('guard-evidence', 'guard-evidence', false)
on conflict (id) do nothing;

drop policy if exists guard_evidence_admin_read on storage.objects;
create policy guard_evidence_admin_read on storage.objects
  for select to authenticated
  using (bucket_id = 'guard-evidence' and public.guard_is_admin());

notify pgrst, 'reload schema';
