-- =====================================================================
-- v50: 個人情報・秘密情報の暗号化（保存時に自動で暗号化、読むときだけ復号）
--
--  ・暗号鍵は Supabase Vault の secret "nagazon_data_key"（32byte hex）。
--    これを消すと二度と復号できないので絶対に削除しないこと。
--  ・保存形式: 'enc:v1:' || base64(iv(16byte) || AES-256-CBC 暗号文)
--  ・テーブルに BEFORE INSERT/UPDATE トリガーを付け、平文が来たら自動で暗号化。
--    すでに 'enc:v1:' で始まる値はそのまま（二重暗号化しない）。
--  ・アプリは *_view（security_invoker=true → RLSはそのまま効く）から読む。
--  ・private スキーマは API に公開されていないので、外から直接呼べない。
-- =====================================================================

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

-- 鍵（Vault から取り出す）
create or replace function private.nz_key()
returns bytea
language sql
stable
security definer
set search_path = ''
as $$
  select decode(decrypted_secret, 'hex')
    from vault.decrypted_secrets
   where name = 'nagazon_data_key'
   limit 1;
$$;
revoke all on function private.nz_key() from public, anon, authenticated;

-- 暗号化
create or replace function private.nz_encrypt(p text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_iv bytea;
begin
  if p is null or p = '' or left(p, 7) = 'enc:v1:' then
    return p;
  end if;
  v_iv := extensions.gen_random_bytes(16);
  return 'enc:v1:' || encode(
    v_iv || extensions.encrypt_iv(convert_to(p, 'UTF8'), private.nz_key(), v_iv, 'aes-cbc/pad:pkcs'),
    'base64');
end;
$$;
revoke all on function private.nz_encrypt(text) from public, anon, authenticated;

-- 復号（平文が入っていたらそのまま返す＝移行中も安全）
create or replace function private.nz_decrypt(p text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_raw bytea;
begin
  if p is null or left(p, 7) <> 'enc:v1:' then
    return p;
  end if;
  v_raw := decode(replace(substr(p, 8), E'\n', ''), 'base64');
  return convert_from(
    extensions.decrypt_iv(substr(v_raw, 17), private.nz_key(), substr(v_raw, 1, 16), 'aes-cbc/pad:pkcs'),
    'UTF8');
exception when others then
  return null;
end;
$$;
revoke all on function private.nz_decrypt(text) from public, anon;
grant execute on function private.nz_decrypt(text) to authenticated, service_role;

-- 照合用ハッシュ（メールで「同じ人か」を調べる用。元には戻せない）
create or replace function private.nz_hash(p text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case when coalesce(btrim(p), '') = '' then null
    else encode(extensions.hmac(convert_to(lower(btrim(p)), 'UTF8'), private.nz_key(), 'sha256'), 'hex') end;
$$;
revoke all on function private.nz_hash(text) from public, anon, authenticated;

-- 汎用トリガー: 引数に渡した列を暗号化
create or replace function private.tg_nz_encrypt()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_col  text;
  v_patch jsonb := '{}'::jsonb;
  v_row  jsonb := to_jsonb(new);
  v_val  text;
begin
  foreach v_col in array tg_argv loop
    v_val := v_row ->> v_col;
    if v_val is not null and v_val <> '' and left(v_val, 7) <> 'enc:v1:' then
      v_patch := v_patch || jsonb_build_object(v_col, private.nz_encrypt(v_val));
    end if;
  end loop;
  if v_patch <> '{}'::jsonb then
    new := jsonb_populate_record(new, v_patch);
  end if;
  return new;
end;
$$;

-- coupon_redemptions: メールは暗号化し、照合はハッシュで行う
alter table public.coupon_redemptions add column if not exists email_hash text;
create index if not exists coupon_redemptions_code_email_hash_idx
  on public.coupon_redemptions (code, email_hash);

-- 段階1ではハッシュだけ付ける（暗号化は v51 で有効化）
create or replace function private.tg_coupon_redemptions_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is not null and new.email <> '' and left(new.email, 7) <> 'enc:v1:' then
    new.email_hash := private.nz_hash(new.email);
  end if;
  return new;
end;
$$;

update public.coupon_redemptions
   set email_hash = private.nz_hash(private.nz_decrypt(email))
 where email_hash is null and coalesce(email, '') <> '';

drop trigger if exists trg_coupon_redemptions_email on public.coupon_redemptions;
create trigger trg_coupon_redemptions_email
  before insert or update of email on public.coupon_redemptions
  for each row execute function private.tg_coupon_redemptions_email();

-- ---------------------------------------------------------------------
-- 復号ビュー（読み取り専用。RLS は元テーブルのものがそのまま効く）
-- ---------------------------------------------------------------------
do $$
declare
  r record;
  v_cols text;
  v_enc  text[];
begin
  for r in
    select * from (values
      ('orders',                array['email','name','phone','postal_code','address','building','shipping_name','cancel_reason']),
      ('profiles',              array['name','email']),
      ('order_cancel_requests', array['reason','admin_note']),
      ('guard_settings',        array['teams_webhook_url','alert_email','device_token']),
      ('admin_correction_logs', array['admin_name']),
      ('order_deletion_logs',   array['name','email']),
      ('coupon_redemptions',    array['email']),
      ('app_settings',          array['store_auth_code_plain'])
    ) as t(tbl, cols)
  loop
    v_enc := r.cols;
    select string_agg(
             case when c.column_name = any(v_enc)
                  then format('private.nz_decrypt(t.%I) as %I', c.column_name, c.column_name)
                  else format('t.%I', c.column_name) end,
             ', ' order by c.ordinal_position)
      into v_cols
      from information_schema.columns c
     where c.table_schema = 'public' and c.table_name = r.tbl;

    execute format('drop view if exists public.%I', r.tbl || '_view');
    execute format('create view public.%I with (security_invoker = true) as select %s from public.%I t',
                   r.tbl || '_view', v_cols, r.tbl);
    execute format('revoke all on public.%I from public, anon, authenticated', r.tbl || '_view');
    execute format('grant select on public.%I to authenticated, service_role', r.tbl || '_view');
  end loop;
end $$;

-- 管理専用データのビューは管理者以外に渡さない（RLSで守られるが念のため）
revoke all on public.app_settings_view from authenticated;
revoke all on public.coupon_redemptions_view from authenticated;
revoke all on public.order_deletion_logs_view from authenticated;

-- ---------------------------------------------------------------------
-- DB関数の更新（暗号化された値を読む箇所）
-- ---------------------------------------------------------------------

-- サーバー（VPS/Edge）から「このメールでクーポンを何回使ったか」を調べる
create or replace function public.coupon_email_used_count(p_code text, p_email text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
    from public.coupon_redemptions r
   where r.code = upper(btrim(coalesce(p_code, '')))
     and coalesce(btrim(p_email), '') <> ''
     and r.email_hash = private.nz_hash(p_email);
$$;
revoke all on function public.coupon_email_used_count(text, text) from public, anon, authenticated;
grant execute on function public.coupon_email_used_count(text, text) to service_role;

create or replace function public.coupon_usage_count(p_code text, p_email text)
returns integer
language sql
security definer
set search_path = public
as $$
  select count(*)::integer
    from public.coupon_redemptions r
   where r.code = upper(btrim(coalesce(p_code, '')))
     and (
       (auth.uid() is not null and r.user_id = auth.uid())
       or (coalesce(btrim(p_email), '') <> '' and r.email_hash = private.nz_hash(p_email))
     );
$$;

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
  select o.coupon_code, private.nz_decrypt(o.email), o.user_id, o.total
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
         or (v_email <> '' and r.email_hash = private.nz_hash(v_email))
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

create or replace function public.store_auth_verify(p_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when coalesce((select require_store_auth from public.app_settings order by updated_at desc limit 1), true) = false
      then true
    else
      coalesce((select private.nz_decrypt(store_auth_code_plain)
                  from public.app_settings order by updated_at desc limit 1), '') <> ''
      and (select private.nz_decrypt(store_auth_code_plain)
             from public.app_settings order by updated_at desc limit 1) = p_code
  end;
$$;

create or replace function public.verify_store_auth(p_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_require boolean;
  v_code text;
begin
  select require_store_auth, private.nz_decrypt(store_auth_code_plain)
    into v_require, v_code
  from public.app_settings
  limit 1;

  if coalesce(v_require, false) = false then
    return true;
  end if;

  return coalesce(v_code, '') <> '' and p_code = v_code;
end;
$$;

create or replace function public.admin_sales_summary(p_start timestamp with time zone, p_end timestamp with time zone)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_admin boolean;
  v_orders jsonb;
  v_items  jsonb;
begin
  select coalesce(p.is_admin, false) into v_is_admin
    from profiles p
   where p.id = auth.uid();

  if v_is_admin is not true then
    raise exception 'ADMIN_ONLY';
  end if;

  select coalesce(jsonb_agg(to_jsonb(o) order by o.created_at asc), '[]'::jsonb)
    into v_orders
    from orders_view o
   where o.status = 'paid'
     and o.created_at >= p_start
     and o.created_at <  p_end;

  select coalesce(jsonb_agg(to_jsonb(i)), '[]'::jsonb)
    into v_items
    from order_items i
    join orders o on o.id = i.order_id
   where o.status = 'paid'
     and o.created_at >= p_start
     and o.created_at <  p_end;

  return jsonb_build_object('orders', v_orders, 'items', v_items);
end;
$$;

-- admin_correct_value: 管理者名を復号して記録（記録時に再び暗号化される）
do $$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'admin_correct_value';
  v_def := replace(v_def,
    'select coalesce(nullif(p.name, ''''), p.email) into v_name',
    'select coalesce(nullif(private.nz_decrypt(p.name), ''''), private.nz_decrypt(p.email)) into v_name');
  execute v_def;
end $$;

notify pgrst, 'reload schema';
