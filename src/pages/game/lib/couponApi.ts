import { supabase } from "../../../lib/supabase";

type RewardRow = {
  id: string;
  store_name: string | null;
  store_info: string | null;
  product_name: string | null;
  score_threshold: number | null;
  coupon_title: string | null;
  description: string | null;
  valid_from: string | null;
  valid_to: string | null;
  is_active: boolean | null;
};

export type CouponStatusResult =
  | {
      ok: true;
      found: true;
      used: boolean;
      used_at: string | null;
      used_confirmed_at: string | null;
      reward?: RewardRow | null;
    }
  | { ok: true; found: false }
  | { ok: false; error: string };

type RedeemCouponResponse = {
  ok: boolean;
  error?: string;
  found?: boolean;
  used?: boolean;
  used_at?: string | null;
  used_confirmed_at?: string | null;
  reward?: RewardRow | null;
};

export async function getCouponStatus(token: string): Promise<CouponStatusResult> {
  try {
    const t = (token ?? "").trim();
    if (t.length < 10) return { ok: false, error: "tokenが不正です" };

    const { data, error } = await supabase.functions.invoke("redeem-coupon", {
      body: { token: t, confirm: false },
    });

    if (error) return { ok: false, error: error.message };

    const res = (data ?? { ok: false, error: "no data" }) as RedeemCouponResponse;
    if (!res.ok) return { ok: false, error: res.error ?? "unknown error" };

    if (!res.found) return { ok: true, found: false };

    return {
      ok: true,
      found: true,
      used: Boolean(res.used),
      used_at: res.used_at ?? null,
      used_confirmed_at: res.used_confirmed_at ?? null,
      reward: res.reward ?? null,
    };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ✅ 変更：password 必須
export async function confirmCouponRedeem(token: string, password: string): Promise<CouponStatusResult> {
  try {
    const t = (token ?? "").trim();
    const p = (password ?? "").trim();
    if (t.length < 10) return { ok: false, error: "tokenが不正です" };
    if (p.length < 4) return { ok: false, error: "パスワードが必要です（4文字以上）" };

    const { data, error } = await supabase.functions.invoke("redeem-coupon", {
      body: { token: t, confirm: true, password: p },
    });

    if (error) return { ok: false, error: error.message };

    const res = (data ?? { ok: false, error: "no data" }) as RedeemCouponResponse;
    if (!res.ok) return { ok: false, error: res.error ?? "unknown error" };

    if (!res.found) return { ok: true, found: false };

    return {
      ok: true,
      found: true,
      used: Boolean(res.used),
      used_at: res.used_at ?? null,
      used_confirmed_at: res.used_confirmed_at ?? null,
      reward: res.reward ?? null,
    };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}