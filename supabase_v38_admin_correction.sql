-- ============================================================
-- NAGAZON v38 追加SQL
--   仕入れ原価・廃棄ロスの「緊急修正」と、その変更ログ
--   ・修正は必ずRPC経由（管理者のみ）で行い、変更前→変更後・理由・実行者を記録
--   ・ログは削除・編集できない（追記のみ）
-- 実行場所：Supabase Dashboard → SQL Editor → 全行実行（1回だけでOK）
-- ============================================================

-- ---------- 1) 変更ログ ----------
create table if not exists public.admin_correction_logs (
  id           uuid primary key default gen_random_uuid(),
  target       text not null,          -- 'product_cost' / 'lot_cost' / 'sold_cost' / 'disposal'
  target_id    text not null,          -- 対象の行ID（商品ID・ロットID・消費記録ID・処分記録ID）
  product_id   integer,
  product_name text,
  field        text not null,          -- 'cost' / 'qty'
  before_value integer,
  after_value  integer,
  reason       text not null,
  admin_id     uuid,
  admin_name   text,
  created_at   timestamptz not null default now()
);
create index if not exists idx_acl_created on public.admin_correction_logs(created_at desc);
create index if not exists idx_acl_product on public.admin_correction_logs(product_id);

alter table public.admin_correction_logs enable row level security;
drop policy if exists acl_admin_select on public.admin_correction_logs;
create policy acl_admin_select on public.admin_correction_logs
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and coalesce(p.is_admin, false))
  );
-- insert / update / delete のポリシーは作らない＝RPC（security definer）以外から書き換え不可

comment on table public.admin_correction_logs is
  '仕入れ原価・廃棄ロスの緊急修正ログ（追記のみ・削除不可）';

-- ---------- 2) 緊急修正RPC ----------
--   p_target:
--     'product_cost' … 商品の標準原価（products.cost）
--     'lot_cost'     … 在庫ロットの原価（product_lots.cost）
--     'sold_cost'    … 売れた分の原価（order_lot_consumptions.cost）→ 売上画面の仕入れ原価
--     'disposal'     … 廃棄ロスの記録（stock_adjustments.cost / qty）
--   p_field: 'cost' or 'qty'（qty は disposal のみ。廃棄個数は正の数で受け取る）
create or replace function public.admin_correct_value(
  p_target text,
  p_id     text,
  p_field  text,
  p_value  integer,
  p_reason text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_name   text;
  v_before integer;
  v_pid    integer;
  v_pname  text;
  v_log    uuid;
begin
  select coalesce(nullif(p.name, ''), p.email) into v_name
    from public.profiles p where p.id = v_uid and coalesce(p.is_admin, false);
  if not found then
    raise exception 'admin only';
  end if;

  if coalesce(trim(p_reason), '') = '' or length(trim(p_reason)) < 2 then
    raise exception '修正理由を入力してください';
  end if;
  if p_value is null or p_value < 0 then
    raise exception '0以上の数値を入力してください';
  end if;
  if p_field not in ('cost', 'qty') then
    raise exception 'invalid field';
  end if;
  if p_field = 'qty' and p_target <> 'disposal' then
    raise exception '個数を修正できるのは廃棄ロスだけです';
  end if;

  if p_target = 'product_cost' then
    select coalesce(cost, 0), id, name into v_before, v_pid, v_pname
      from public.products where id = p_id::integer for update;
    if not found then raise exception '対象が見つかりません'; end if;
    update public.products set cost = p_value where id = p_id::integer;

  elsif p_target = 'lot_cost' then
    select coalesce(l.cost, 0), l.product_id, pr.name into v_before, v_pid, v_pname
      from public.product_lots l left join public.products pr on pr.id = l.product_id
     where l.id = p_id::uuid for update of l;
    if not found then raise exception '対象が見つかりません'; end if;
    update public.product_lots set cost = p_value, updated_at = now() where id = p_id::uuid;

  elsif p_target = 'sold_cost' then
    select coalesce(c.cost, 0), c.product_id, pr.name into v_before, v_pid, v_pname
      from public.order_lot_consumptions c left join public.products pr on pr.id = c.product_id
     where c.id = p_id::uuid for update of c;
    if not found then raise exception '対象が見つかりません'; end if;
    update public.order_lot_consumptions set cost = p_value where id = p_id::uuid;

  elsif p_target = 'disposal' then
    if p_field = 'cost' then
      select coalesce(a.cost, 0), a.product_id, pr.name into v_before, v_pid, v_pname
        from public.stock_adjustments a left join public.products pr on pr.id = a.product_id
       where a.id = p_id::uuid for update of a;
      if not found then raise exception '対象が見つかりません'; end if;
      update public.stock_adjustments set cost = p_value where id = p_id::uuid;
    else
      if p_value < 1 then raise exception '個数は1以上で入力してください'; end if;
      select abs(coalesce(a.qty, 0)), a.product_id, pr.name into v_before, v_pid, v_pname
        from public.stock_adjustments a left join public.products pr on pr.id = a.product_id
       where a.id = p_id::uuid for update of a;
      if not found then raise exception '対象が見つかりません'; end if;
      -- 処分記録は「減らした数＝マイナス」で保存している
      update public.stock_adjustments set qty = -abs(p_value) where id = p_id::uuid;
    end if;

  else
    raise exception 'invalid target';
  end if;

  if v_before = p_value then
    raise exception '変更前と同じ値です';
  end if;

  insert into public.admin_correction_logs
    (target, target_id, product_id, product_name, field, before_value, after_value, reason, admin_id, admin_name)
  values
    (p_target, p_id, v_pid, v_pname, p_field, v_before, p_value, trim(p_reason), v_uid, v_name)
  returning id into v_log;

  return json_build_object('ok', true, 'log_id', v_log, 'before', v_before, 'after', p_value);
end;
$$;

revoke all on function public.admin_correct_value(text, text, text, integer, text) from public, anon;
grant execute on function public.admin_correct_value(text, text, text, integer, text) to authenticated;

-- ---------- 3) 修正対象を探すための一覧（売れた分の原価） ----------
--   order_lot_consumptions は管理者のみ参照可（v36のRLS）なので画面から直接読めます。
