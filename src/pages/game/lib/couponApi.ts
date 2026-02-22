// src/pages/game/lib/couponApi.ts
import { supabase } from "../../../lib/supabase";
import type { Difficulty } from "../types";

export type IssuedCoupon = {
  code: string; // token
  title?: string | null;
  redeem_url?: string | null;
  expires_at?: string | null;

  qr_png_base64?: string | null;
  qr_svg?: string | null;

  store_name?: string | null;
  store_info?: string | null;
  product_name?: string | null;
  description?: string | null;
  valid_from?: string | null;
  valid_to?: string | null;
};

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

type IssueCouponFunctionOkIssued = {
  ok: true;
  issued: true;
  token: string;
  reward: RewardRow;
  qr_png_base64?: string | null;
  qr_svg?: string | null;
  redeem_url?: string | null;
  expires_at?: string | null;
  reused?: boolean;
};

type IssueCouponFunctionOkNotIssued = {
  ok: true;
  issued: false;
  reason: "no_reward" | "already_issued";
  existing_token?: string;
  reward_id?: string;
};

type IssueCouponFunctionNg = { ok: false; error: string };

type IssueCouponFunctionResult =
  | IssueCouponFunctionOkIssued
  | IssueCouponFunctionOkNotIssued
  | IssueCouponFunctionNg;

export type IssueCouponAfterGameResult =
  | { ok: true; issued: true; coupon: IssuedCoupon }
  | { ok: true; issued: false }
  | { ok: false; error: string };

function buildRedeemUrl(token: string) {
  return `${window.location.origin}/game/coupon-redeem?token=${encodeURIComponent(token)}`;
}

export async function issueCouponAfterGame(args: {
  score: number;
  difficulty: Difficulty;
}): Promise<IssueCouponAfterGameResult> {
  try {
    const score = Math.max(0, Math.floor(args.score || 0));

    const { data, error } = await supabase.functions.invoke("issue-coupon", {
      body: { score, difficulty: args.difficulty },
    });

    if (error) return { ok: false, error: error.message };

    const res = (data ?? { ok: false, error: "no data" }) as IssueCouponFunctionResult;
    if (!res.ok) return { ok: false, error: res.error };

    if (!res.issued) return { ok: true, issued: false };

    const token = res.token;

    const coupon: IssuedCoupon = {
      code: token,
      title: res.reward?.coupon_title ?? "クーポン",
      redeem_url: res.redeem_url ?? buildRedeemUrl(token),
      expires_at: res.expires_at ?? res.reward?.valid_to ?? null,
      qr_png_base64: res.qr_png_base64 ?? null,
      qr_svg: res.qr_svg ?? null,

      store_name: res.reward?.store_name ?? null,
      store_info: res.reward?.store_info ?? null,
      product_name: res.reward?.product_name ?? null,
      description: res.reward?.description ?? null,
      valid_from: res.reward?.valid_from ?? null,
      valid_to: res.reward?.valid_to ?? null,
    };

    return { ok: true, issued: true, coupon };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

// ===== redeem-coupon =====

export type CouponStatusResult =
  | {
      ok: true;
      found: true;
      used: boolean;
      used_at: string | null;
      used_confirmed_at: string | null;
      reward?: RewardRow | null; // ✅ 追加：店名などを後から復元できる
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

export async function confirmCouponRedeem(token: string): Promise<CouponStatusResult> {
  try {
    const t = (token ?? "").trim();
    if (t.length < 10) return { ok: false, error: "tokenが不正です" };

    const { data, error } = await supabase.functions.invoke("redeem-coupon", {
      body: { token: t, confirm: true },
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