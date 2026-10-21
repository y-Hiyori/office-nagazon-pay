-- ============================================================
-- NAGAZON v45 追加SQL
--   管理画面からアカウントの管理者権限を切り替える
--   実行場所：Supabase Dashboard → SQL Editor → 全行実行（1回だけでOK）
-- ============================================================

create or replace function public.set_profile_admin(
  p_user_id uuid,
  p_is_admin boolean
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid         uuid := auth.uid();
  v_admin_count integer;
  v_row         public.profiles;
begin
  if v_uid is null or not exists (
    select 1 from public.profiles p
     where p.id = v_uid and coalesce(p.is_admin, false)
  ) then
    return json_build_object('ok', false, 'error', 'NOT_ADMIN');
  end if;

  if p_user_id is null then
    return json_build_object('ok', false, 'error', 'INVALID_USER');
  end if;

  select * into v_row from public.profiles where id = p_user_id for update;
  if v_row.id is null then
    return json_build_object('ok', false, 'error', 'NOT_FOUND');
  end if;

  if p_is_admin is false then
    -- 自分自身の権限は外せない（管理画面からロックアウト防止）
    if p_user_id = v_uid then
      return json_build_object('ok', false, 'error', 'CANNOT_REMOVE_SELF');
    end if;

    select count(*) into v_admin_count
      from public.profiles
     where coalesce(is_admin, false);

    if v_admin_count <= 1 then
      return json_build_object('ok', false, 'error', 'LAST_ADMIN');
    end if;
  end if;

  update public.profiles
     set is_admin = coalesce(p_is_admin, false)
   where id = p_user_id
  returning * into v_row;

  return json_build_object(
    'ok', true,
    'user_id', v_row.id,
    'is_admin', coalesce(v_row.is_admin, false)
  );
end;
$$;

revoke all on function public.set_profile_admin(uuid, boolean) from public, anon;
grant execute on function public.set_profile_admin(uuid, boolean) to authenticated;

notify pgrst, 'reload schema';
