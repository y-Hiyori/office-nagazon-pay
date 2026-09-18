-- ============================================================
-- NAGAZON v33 追加SQL
--   クーポン強化
--     ① 利用開始日／終了日を日本時間で正確に判定
--     ② 対象者（全員／会員のみ／ゲストのみ）
--     ③ 1人あたりの使用回数制限
--     ④ 対象商品（初期値ALL／複数選択）
--     ⑤ 使用履歴（誰がいつ使ったか）と使用回数の自動カウント
-- 実行場所：Supabase Dashboard → SQL Editor → 全行実行（1回だけでOK）
-- ============================================================

-- ---------- 1) coupons に項目追加 ----------
alter table public.coupons
  add column if not exists audience       text not null default 'all',
  add column if not exists per_user_limit integer,
  add column if not exists target_scope   text not null default 'all';

comment on column public.coupons.audience is 'all=誰でも／member=会員のみ／guest=ゲストのみ';
comment on column public.coupons.per_user_limit is '1人（1メール）あたりの使用回数上限（null=無制限）';
comment on column public.coupons.target_scope is 'all=全商品／products=対象商品のみ';

alter table public.coupons drop constraint if exists coupons_audience_check;
alter table public.coupons
  add constraint coupons_audience_check check (audience in ('all', 'member', 'guest'));
alter table public.coupons drop constraint if exists coupons_target_check;
alter table public.coupons
  add constraint coupons_target_check check (target_scope in ('all', 'products'));

-- ---------- 2) クーポン対象商品 ----------
create table if not exists public.coupon_products (
  code       text    not null references public.coupons(code) on delete cascade,
  product_id integer not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (code, product_id)
);

create index if not exists idx_coupon_products_code on public.coupon_products(code);

alter table public.coupon_products enable row level security;

drop policy if exists coupon_products_read on public.coupon_products;
create policy coupon_products_read on public.coupon_products
  for select using (true);

drop policy if exists coupon_products_admin on public.coupon_products;
create policy coupon_products_admin on public.coupon_products
  for all
  using (
    exists (select 1 from public.profiles p
             where p.id = auth.uid() and coalesce(p.is_admin, false))
  )
  with check (
    exists (select 1 from public.profiles p
             where p.id = auth.uid() and coalesce(p.is_admin, false))
  );

grant select on public.coupon_products to anon, authenticated;

-- ---------- 3) クーポン使用履歴 ----------
create table if not exists public.coupon_redemptions (
  id         uuid primary key default gen_random_uuid(),
  code       text not null,
  order_id   uuid,
  user_id    uuid,
  email      text,
  total      integer,
  created_at timestamptz not null default now(),
  unique (code, order_id)
);

create index if not exists idx_coupon_redemptions_code on public.coupon_redemptions(code);
create index if not exists idx_coupon_redemptions_email on public.coupon_redemptions(lower(email));

alter table public.coupon_redemptions enable row level security;

drop policy if exists coupon_redemptions_admin on public.coupon_redemptions;
create policy coupon_redemptions_admin on public.coupon_redemptions
  for all
  using (
    exists (select 1 from public.profiles p
             where p.id = auth.uid() and coalesce(p.is_admin, false))
  )
  with check (
    exists (select 1 from public.profiles p
             where p.id = auth.uid() and coalesce(p.is_admin, false))
  );

-- ---------- 4) 使用回数の取得（1人あたり制限の判定用） ----------
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
       or (
         coalesce(p_email, '') <> ''
         and lower(coalesce(r.email, '')) = lower(btrim(p_email))
       )
     );
$$;

grant execute on function public.coupon_usage_count(text, text) to anon, authenticated;

-- ---------- 5) 使用の記録（同じ注文では二重に数えない） ----------
create or replace function public.coupon_redeem(
  p_code     text,
  p_order_id uuid,
  p_email    text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code  text;
  v_email text;
  v_row   public.coupons;
  v_used  integer;
  v_n     integer;
begin
  v_code := upper(btrim(coalesce(p_code, '')));
  if v_code = '' then
    return json_build_object('ok', false, 'error', 'code is empty');
  end if;

  v_email := lower(btrim(coalesce(p_email, '')));

  select * into v_row from public.coupons where code = v_code;
  if v_row.code is null then
    return json_build_object('ok', false, 'error', 'coupon not found');
  end if;

  -- 1人あたり上限（すでに使い切っていれば記録しない）
  if v_row.per_user_limit is not null then
    v_used := public.coupon_usage_count(v_code, v_email);
    if v_used >= v_row.per_user_limit then
      return json_build_object('ok', false, 'error', 'per user limit reached', 'used', v_used);
    end if;
  end if;

  insert into public.coupon_redemptions (code, order_id, user_id, email)
  values (v_code, p_order_id, auth.uid(), nullif(v_email, ''))
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

grant execute on function public.coupon_redeem(text, uuid, text) to anon, authenticated;

-- ---------- 6) 既存の開始日／終了日を日本時間の 00:00 / 23:59 に揃える ----------
update public.coupons
   set starts_at = (((starts_at at time zone 'Asia/Tokyo')::date)::timestamp at time zone 'Asia/Tokyo')
 where starts_at is not null;

update public.coupons
   set ends_at = ((((ends_at at time zone 'Asia/Tokyo')::date)::timestamp + interval '23 hours 59 minutes 59 seconds') at time zone 'Asia/Tokyo')
 where ends_at is not null;

-- ---------- 確認用（任意） ----------
-- select code, is_active, audience, per_user_limit, target_scope, starts_at, ends_at, used_count
--   from public.coupons order by created_at desc;
-- select * from public.coupon_products;
-- select * from public.coupon_redemptions order by created_at desc limit 20;

-- ---------- 7) 注文IDからクーポン使用を記録（購入完了時に呼ぶだけ） ----------
create or replace function public.coupon_redeem_for_order(p_order_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code  text;
  v_email text;
begin
  select o.coupon_code, o.email into v_code, v_email
    from public.orders o where o.id = p_order_id;

  if v_code is null or btrim(v_code) = '' then
    return json_build_object('ok', true, 'skipped', true);
  end if;

  return public.coupon_redeem(btrim(v_code), p_order_id, v_email);
end;
$$;

grant execute on function public.coupon_redeem_for_order(uuid) to anon, authenticated;
