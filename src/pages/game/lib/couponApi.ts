// src/pages/game/lib/couponApi.ts
import { supabase } from "../../../lib/supabase";

export type CouponStatusResult =
  | {
      ok: true;
      found: true;
      used: boolean;
      used_at: string | null;
      used_confirmed_at: string | null;
      user_name: string | null;
      reward: {
        store_name: string | null;
        store_info: string | null;
        product_name: string | null;
        coupon_title: string | null;
        description: string | null;
        valid_from: string | null;
        valid_to: string | null;
      } | null;
    }
  | { ok: true; found: false }
  | { ok: false; error: string };

export async function getCouponStatus(token: string): Promise<CouponStatusResult> {
  try {
    const { data, error } = await supabase.functions.invoke("redeem-coupon", {
      body: { token, action: "status" },
    });
    if (error) return { ok: false, error: error.message };
    return data as CouponStatusResult;
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export type ConfirmResult =
  | { ok: true; found: true; confirmed: true; already?: boolean; user_name?: string | null; reward?: unknown }
  | { ok: true; found: false }
  | { ok: false; error: string };

export async function confirmCouponRedeem(token: string, password: string): Promise<ConfirmResult> {
  try {
    const { data, error } = await supabase.functions.invoke("redeem-coupon", {
      body: { token, action: "confirm", password },
    });
    if (error) return { ok: false, error: error.message };
    return data as ConfirmResult;
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}