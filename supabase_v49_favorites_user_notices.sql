-- v49: お気に入り ＋ 個別お知らせ（会員を選んで送る・メール通知）
-- 2026-11-18
begin;

-- =========================================================
-- お気に入り
-- =========================================================
create table if not exists public.favorites (
  user_id    uuid    not null references auth.users(id) on delete cascade,
  product_id integer not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

alter table public.favorites enable row level security;

drop policy if exists favorites_select_own on public.favorites;
drop policy if exists favorites_insert_own on public.favorites;
drop policy if exists favorites_delete_own on public.favorites;
create policy favorites_select_own on public.favorites
  for select to authenticated using (user_id = auth.uid());
create policy favorites_insert_own on public.favorites
  for insert to authenticated with check (user_id = auth.uid());
create policy favorites_delete_own on public.favorites
  for delete to authenticated using (user_id = auth.uid());

revoke all on public.favorites from anon, authenticated;
grant select, insert, delete on public.favorites to authenticated;

-- =========================================================
-- 個別お知らせ
--   作成・宛先登録・メール送信はサーバー（service role / api/send-user-notice）だけが行う
-- =========================================================
create table if not exists public.user_notices (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(title) between 1 and 100),
  body        text check (body is null or char_length(body) <= 4000),
  link_url    text check (link_url is null or char_length(link_url) <= 500),
  send_email  boolean not null default true,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists public.user_notice_recipients (
  notice_id   uuid not null references public.user_notices(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  read_at     timestamptz,
  emailed_at  timestamptz,
  email_error text,
  created_at  timestamptz not null default now(),
  primary key (notice_id, user_id)
);

create index if not exists user_notice_recipients_user_idx
  on public.user_notice_recipients (user_id, read_at);

alter table public.user_notices enable row level security;
alter table public.user_notice_recipients enable row level security;

drop policy if exists user_notices_select on public.user_notices;
drop policy if exists user_notices_delete_admin on public.user_notices;
create policy user_notices_select on public.user_notices
  for select to authenticated using (
    public.is_admin()
    or exists (
      select 1 from public.user_notice_recipients r
       where r.notice_id = user_notices.id and r.user_id = auth.uid()
    )
  );
create policy user_notices_delete_admin on public.user_notices
  for delete to authenticated using (public.is_admin());

drop policy if exists user_notice_recipients_select on public.user_notice_recipients;
create policy user_notice_recipients_select on public.user_notice_recipients
  for select to authenticated using (user_id = auth.uid() or public.is_admin());

revoke all on public.user_notices from anon, authenticated;
revoke all on public.user_notice_recipients from anon, authenticated;
grant select, delete on public.user_notices to authenticated;
grant select on public.user_notice_recipients to authenticated;

-- 既読にする（p_notice_id が null なら自分宛てを全部既読）
create or replace function public.mark_user_notice_read(p_notice_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  update public.user_notice_recipients
     set read_at = now()
   where user_id = auth.uid()
     and read_at is null
     and (p_notice_id is null or notice_id = p_notice_id);

  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.mark_user_notice_read(uuid) from public, anon;
grant execute on function public.mark_user_notice_read(uuid) to authenticated;

commit;

notify pgrst, 'reload schema';
