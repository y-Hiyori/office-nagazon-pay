// src/lib/lots.ts
// 入荷ロット（product_lots）まわりの共通ヘルパー
import { supabase } from "./supabase";

export type SaleLot = {
  product_id: number;
  sale_price: number;
  remaining: number;
};

/** セール中のロット（原価は含まない公開ビュー）を product_id → 情報 で返す */
export async function fetchSaleLots(): Promise<Map<number, SaleLot>> {
  const map = new Map<number, SaleLot>();
  try {
    const { data, error } = await supabase
      .from("product_sale_lots")
      .select("product_id,sale_price,remaining");

    if (error) {
      console.error("product_sale_lots error:", error);
      return map;
    }

    for (const r of (data ?? []) as any[]) {
      const id = Number(r?.product_id);
      const price = Math.floor(Number(r?.sale_price) || 0);
      const rem = Math.max(0, Math.floor(Number(r?.remaining) || 0));
      if (!Number.isFinite(id) || price <= 0 || rem <= 0) continue;

      const cur = map.get(id);
      if (!cur) {
        map.set(id, { product_id: id, sale_price: price, remaining: rem });
      } else if (price < cur.sale_price) {
        map.set(id, { product_id: id, sale_price: price, remaining: rem });
      } else if (price === cur.sale_price) {
        cur.remaining += rem;
      }
    }
  } catch (e) {
    console.error("fetchSaleLots failed:", e);
  }
  return map;
}

/** 1回の会計での購入上限（未設定なら null） */
export function maxPerOrderOf(p: any): number | null {
  const n = Math.floor(Number(p?.max_per_order ?? 0));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** 実際にカートへ入れられる上限個数（在庫と購入上限の小さい方） */
export function purchaseLimitOf(p: any): number {
  const stock = Math.max(0, Math.floor(Number(p?.stock ?? 0) || 0));
  const lim = maxPerOrderOf(p);
  return lim == null ? stock : Math.min(stock, lim);
}

/** 賞味期限アラートの日数（既定30日） */
export function alertDaysOf(p: any): number {
  const n = Math.floor(Number(p?.expiry_alert_days ?? 0));
  return Number.isFinite(n) && n > 0 ? n : 30;
}

export type ExpiryStatus = "none" | "ok" | "warn" | "urgent" | "expired";

/** 期限までの残り日数（日付のみ／JST基準） */
export function daysLeftOf(dateStr?: string | null): number | null {
  if (!dateStr) return null;
  const t = new Date(`${String(dateStr).slice(0, 10)}T00:00:00+09:00`).getTime();
  if (!Number.isFinite(t)) return null;
  const now = new Date();
  const todayJst = new Date(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
      now.getDate()
    ).padStart(2, "0")}T00:00:00+09:00`
  ).getTime();
  return Math.round((t - todayJst) / 86400000);
}

export function expiryStatusOf(
  dateStr: string | null | undefined,
  alertDays = 30
): ExpiryStatus {
  const d = daysLeftOf(dateStr);
  if (d == null) return "none";
  if (d < 0) return "expired";
  if (d <= 7) return "urgent";
  if (d <= alertDays) return "warn";
  return "ok";
}

export const expiryStatusLabel = (s: ExpiryStatus, days: number | null): string => {
  if (s === "none" || days == null) return "期限未設定";
  if (s === "expired") return `期限切れ（${Math.abs(days)}日経過）`;
  if (days === 0) return "今日が期限";
  return `期限まであと${days}日`;
};

export const expiryTypeLabel = (t?: string | null) =>
  t === "use_by" ? "消費期限" : "賞味期限";
