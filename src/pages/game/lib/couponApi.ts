// src/pages/game/lib/couponApi.ts
import { supabase } from "../../../lib/supabase";
import type { Difficulty } from "../types";

/* =========================
   Types
========================= */

export type RewardRow = {
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
  redeem_password_hash?: string | null; // 店舗側用（参照するだけ）
};

export type IssuedCoupon = {
  code: string; // token
  title?: string | null;

  redeem_url?: string | null;
  expires_at?: string | null;

  // 画像（無くてもフロントで生成できる）
  qr_png_base64?: string | null;
  qr_svg?: string | null;

  // 表示情報
  store_name?: string | null;
  store_info?: string | null;
  product_name?: string | null;
  description?: string | null;
  valid_from?: string | null;
  valid_to?: string | null;
};

type IssueCouponFnOkIssued = {
  ok: true;
  issued: true;
  token: string;
  reward: RewardRow;
  redeem_url?: string | null;
  expires_at?: string | null;
  reused?: boolean;
};

type IssueCouponFnOkNotIssued = {
  ok: true;
  issued: false;
  reason: "no_reward" | "already_issued";
};

type IssueCouponFnNg = { ok: false; error: string };

type IssueCouponFnResult = IssueCouponFnOkIssued | IssueCouponFnOkNotIssued | IssueCouponFnNg;

export type IssueCouponAfterGameResult =
  | { ok: true; issued: true; coupon: IssuedCoupon }
  | { ok: true; issued: false }
  | { ok: false; error: string };

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

type RedeemCouponFnOkFound = {
  ok: true;
  found: true;
  used: boolean;
  used_at: string | null;
  used_confirmed_at: string | null;
  reward?: RewardRow | null;
};

type RedeemCouponFnOkNotFound = { ok: true; found: false };

type RedeemCouponFnNg = { ok: false; error: string };

type RedeemCouponFnResult = RedeemCouponFnOkFound | RedeemCouponFnOkNotFound | RedeemCouponFnNg;

/* =========================
   Device ID (端末ごと)
========================= */

const DEVICE_ID_KEY = "nagazon_device_id_v1";

function randomHex16(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function getOrCreateDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY);
    if (existing && existing.length >= 16) return existing;

    const id = randomHex16();
    localStorage.setItem(DEVICE_ID_KEY, id);
    return id;
  } catch {
    // localStorage不可でも最低限動かす（端末固定はできないが落とさない）
    return randomHex16();
  }
}

/* =========================
   Helpers
========================= */

function buildRedeemUrl(token: string) {
  return `${window.location.origin}/game/coupon-redeem?token=${encodeURIComponent(token)}`;
}

/* =========================
   Public: issueCouponAfterGame
========================= */

export async function issueCouponAfterGame(args: {
  score: number;
  difficulty: Difficulty;
}): Promise<IssueCouponAfterGameResult> {
  try {
    const score = Math.max(0, Math.floor(args.score || 0));
    const device_id = getOrCreateDeviceId();

    const { data, error } = await supabase.functions.invoke("issue-coupon", {
      body: { score, difficulty: args.difficulty, device_id },
    });

    if (error) return { ok: false, error: error.message };

    const res = (data ?? { ok: false, error: "no data" }) as IssueCouponFnResult;

    if (!res.ok) return { ok: false, error: res.error };

    if (!res.issued) return { ok: true, issued: false };

    const token = res.token;
    const redeem_url = res.redeem_url ?? buildRedeemUrl(token);

    const coupon: IssuedCoupon = {
      code: token,
      title: res.reward?.coupon_title ?? "クーポン",

      redeem_url,
      expires_at: res.expires_at ?? res.reward?.valid_to ?? null,

      // 画像は issue-coupon が返すなら入る（返さなくてもCouponDetailでQR生成できる）
      qr_png_base64: null,
      qr_svg: null,

      store_name: res.reward?.store_name ?? null,
      store_info: res.reward?.store_info ?? null,
      product_name: res.reward?.product_name ?? null,
      description: res.reward?.description ?? null,
      valid_from: res.reward?.valid_from ?? null,
      valid_to: res.reward?.valid_to ?? null,
    };

    return { ok: true, issued: true, coupon };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/* =========================
   Public: getCouponStatus
========================= */

export async function getCouponStatus(token: string): Promise<CouponStatusResult> {
  try {
    const t = (token ?? "").trim();
    if (t.length < 10) return { ok: false, error: "tokenが不正です" };

    const { data, error } = await supabase.functions.invoke("redeem-coupon", {
      body: { token: t, confirm: false },
    });

    if (error) return { ok: false, error: error.message };

    const res = (data ?? { ok: false, error: "no data" }) as RedeemCouponFnResult;

    if (!res.ok) return { ok: false, error: res.error };

    if (res.found === false) return { ok: true, found: false };

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

/* =========================
   Public: confirmCouponRedeem (password必須)
========================= */

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

    const res = (data ?? { ok: false, error: "no data" }) as RedeemCouponFnResult;

    if (!res.ok) return { ok: false, error: res.error };

    if (res.found === false) return { ok: true, found: false };

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