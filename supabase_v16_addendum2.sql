-- ============================================================
-- NAGAZON v16 追加SQL（その2）
-- PayPay併用時にポイント使用額を確実に保存するための関数
-- 実行場所：Supabase Dashboard → SQL Editor → 全行実行（1回だけでOK）
-- ※ これは「VPSの server.cjs を差し替えなくても直る」ための保険です。
--    両方入れておくと二重に安全です。
-- ============================================================

create or replace function public.set_order_points_used(
  p_order_id uuid,
  p_token text,
  p_points integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_points integer;
  v_ok boolean := false;
begin
  v_points := greatest(0, coalesce(p_points, 0));
  if v_points = 0 then
    return false;
  end if;

  -- PayPayの戻りトークンが一致する注文だけ更新（他人の注文は触れない）
  -- すでに points_used が入っている注文は上書きしない
  update public.orders
     set points_used = v_points,
         points_applied = true
   where id = p_order_id
     and paypay_return_token = p_token
     and coalesce(points_used, 0) = 0
     and status in ('pending', 'paid');

  v_ok := found;
  return v_ok;
end;
$$;

grant execute on function public.set_order_points_used(uuid, text, integer) to anon, authenticated;

-- 動作確認（任意）
-- select public.set_order_points_used('<注文UUID>'::uuid, '<トークン>', 100);
