// src/pages/game/lib/issueCouponApi.ts
import { supabase } from "../../../lib/supabase";
import type { Difficulty } from "../types";

export type IssueCouponResult =
  | {
      ok: true;
      issued: true;
      token: string;
      reward: {
        id: string;
        store_name: string | null;
        store_info: string | null;
        product_name: string | null;
        score_threshold: number;
        coupon_title: string | null;
        description: string | null;
        valid_from: string | null;
        valid_to: string | null;
      };
      // ✅ 追加：UIで使うやつ（関数が返すなら入る）
      redeem_url?: string | null;
      expires_at?: string | null;
      qr_png_base64?: string | null;
      qr_svg?: string | null;
    }
  | {
      ok: true;
      issued: false;
      reason: "no_reward" | "already_issued";
      existing_token?: string;
      reward_id?: string;
    }
  | { ok: false; error: string };

function buildRedeemUrl(token: string) {
  // 店側の確定ページ（同一ドメイン想定）
  return `${window.location.origin}/game/coupon-redeem?token=${encodeURIComponent(token)}`;
}

/**
 * ゲーム後：クーポン発行
 * - score は必須
 * - difficulty は渡せる（関数側が未対応でも害なし）
 */
export async function issueCoupon(
  score: number,
  difficulty?: Difficulty
): Promise<IssueCouponResult> {
  try {
    const s = Math.max(0, Math.floor(score || 0));

    const { data, error } = await supabase.functions.invoke("issue-coupon", {
      body: { score: s, ...(difficulty ? { difficulty } : {}) },
    });

    if (error) return { ok: false, error: error.message };

    const res = (data ?? { ok: false, error: "no data" }) as IssueCouponResult;

    // ✅ issued:true なのに redeem_url が空なら保険で生成して返す
    if (res.ok && res.issued) {
      const redeem = (res.redeem_url ?? "").trim();
      if (!redeem) {
        return {
          ...res,
          redeem_url: buildRedeemUrl(res.token),
        };
      }
    }

    return res;
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}