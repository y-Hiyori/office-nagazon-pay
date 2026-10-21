-- 保存期間を1週間に変更（写真・5秒録画とも）
alter table public.guard_settings
  alter column retention_days set default 7;

alter table public.guard_settings
  alter column video_retention_days set default 7;

update public.guard_settings
   set retention_days = 7,
       video_retention_days = 7
 where id = 1;

notify pgrst, 'reload schema';
