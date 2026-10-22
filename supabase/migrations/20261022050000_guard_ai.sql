-- AI判定（任意・既定OFF）
-- GEMINI_API_KEY が Vercel に設定されている場合だけ実際に呼び出します。
alter table public.guard_settings
  add column if not exists ai_review_enabled boolean not null default false;

comment on column public.guard_settings.ai_review_enabled is
  '任意のAI判定（Google Gemini無料枠）。画像が外部送信されるため既定OFF。';
