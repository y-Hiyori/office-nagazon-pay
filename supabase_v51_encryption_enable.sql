-- =====================================================================
-- v51: 暗号化を有効化（v50 の復号ビューへアプリを切り替えた後に実行）
--   1) 保存時に自動で暗号化するトリガーを付ける
--   2) 既存データを暗号化する
-- =====================================================================

-- coupon_redemptions: ハッシュ＋暗号化
create or replace function private.tg_coupon_redemptions_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is not null and new.email <> '' and left(new.email, 7) <> 'enc:v1:' then
    new.email_hash := private.nz_hash(new.email);
    new.email := private.nz_encrypt(new.email);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_nz_encrypt on public.orders;
create trigger trg_nz_encrypt before insert or update on public.orders
  for each row execute function private.tg_nz_encrypt(
    'email','name','phone','postal_code','address','building','shipping_name','cancel_reason');

drop trigger if exists trg_nz_encrypt on public.profiles;
create trigger trg_nz_encrypt before insert or update on public.profiles
  for each row execute function private.tg_nz_encrypt('name','email');

drop trigger if exists trg_nz_encrypt on public.order_cancel_requests;
create trigger trg_nz_encrypt before insert or update on public.order_cancel_requests
  for each row execute function private.tg_nz_encrypt('reason','admin_note');

drop trigger if exists trg_nz_encrypt on public.guard_settings;
create trigger trg_nz_encrypt before insert or update on public.guard_settings
  for each row execute function private.tg_nz_encrypt('teams_webhook_url','alert_email','device_token');

drop trigger if exists trg_nz_encrypt on public.admin_correction_logs;
create trigger trg_nz_encrypt before insert or update on public.admin_correction_logs
  for each row execute function private.tg_nz_encrypt('admin_name');

drop trigger if exists trg_nz_encrypt on public.order_deletion_logs;
create trigger trg_nz_encrypt before insert or update on public.order_deletion_logs
  for each row execute function private.tg_nz_encrypt('name','email');

drop trigger if exists trg_nz_encrypt on public.app_settings;
create trigger trg_nz_encrypt before insert or update on public.app_settings
  for each row execute function private.tg_nz_encrypt('store_auth_code_plain');

-- 既存データの暗号化（トリガーが暗号化する。updated_at 等の他トリガーを動かさないよう replica で実行はしない）
alter table public.orders disable trigger trg_orders_consume_lots;
alter table public.orders disable trigger trg_orders_coupon_redeem_on_paid;
update public.orders set email = email;
alter table public.orders enable trigger trg_orders_consume_lots;
alter table public.orders enable trigger trg_orders_coupon_redeem_on_paid;

update public.profiles set name = name;
update public.order_cancel_requests set reason = reason;
update public.guard_settings set device_token = device_token;
update public.admin_correction_logs set admin_name = admin_name;
update public.order_deletion_logs set name = name;
update public.coupon_redemptions set email = email where coalesce(email, '') <> '';
update public.app_settings set store_auth_code_plain = store_auth_code_plain;

-- 削除ログの snapshot に残っている注文の個人情報も暗号化
update public.order_deletion_logs l
   set snapshot = jsonb_set(l.snapshot, '{order}',
         (l.snapshot -> 'order') || (
           select coalesce(jsonb_object_agg(k, to_jsonb(private.nz_encrypt(l.snapshot -> 'order' ->> k))), '{}'::jsonb)
             from unnest(array['email','name','phone','postal_code','address','building','shipping_name','cancel_reason']) k
            where coalesce(l.snapshot -> 'order' ->> k, '') <> ''
         ))
 where l.snapshot ? 'order';
