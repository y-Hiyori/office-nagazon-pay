-- ============================================================
-- NAGAZON v47 追加SQL
--   1) 5秒録画（フレーム連番）をイベントに紐づける
--   2) 録画の保存期間・ブザー設定を guard_settings に追加
--   3) 既存の不審イベントはそのまま
-- ============================================================

alter table public.guard_events
  add column if not exists video_path   text,
  add column if not exists frame_count  integer,
  add column if not exists fps          integer;

alter table public.guard_settings
  add column if not exists video_enabled        boolean not null default true,
  add column if not exists video_retention_days integer not null default 14,
  add column if not exists clip_seconds         integer not null default 5,
  add column if not exists clip_fps             integer not null default 3,
  add column if not exists hub_buzzer_enabled   boolean not null default false;

-- 既存の警告音は「メールのみ」に合わせてOFF
update public.guard_settings
   set hub_buzzer_enabled = false,
       video_enabled = true,
       video_retention_days = 14,
       clip_seconds = 5,
       clip_fps = 3
 where id = 1;

create index if not exists idx_guard_events_video
  on public.guard_events (video_path)
  where video_path is not null;

notify pgrst, 'reload schema';
