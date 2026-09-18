// src/lib/lots.ts
// 入荷ロット（product_lots）まわりの共通ヘルパー
import { supabase } from "./supabase";

export type SaleMode = "total" | "per_order";

export type SaleLot = {
  product_id: number;
  sale_price: number; // 0 = 0円セール（無料）
  sale_mode: SaleMode; // total=合計◯個限定／per_order=1会計◯個まで
  sale_qty: number; // 設定個数（per_order は1会計の上限）
  remaining: number; // total は残り個数／per_order は在庫数
};

/**
 * セール中の商品情報を product_id → 情報 で返す
 *   v35：ビュー（product_sale_lots）ではなく products から直接読む
 *        （ビューはRLSを設定できず Supabase に警告表示されるため）
 *        products に sale_mode 列が無い環境では従来のビューにフォールバック
 */
export async function fetchSaleLots(): Promise<Map<number, SaleLot>> {
  const map = new Map<number, SaleLot>();

  const push = (id: number, price: number, mode: SaleMode, sq: number, rem: number) => {
    if (!Number.isFinite(id) || rem <= 0) return;
    map.set(id, {
      product_id: id,
      sale_price: Math.max(0, Math.floor(price || 0)),
      sale_mode: mode,
      sale_qty: Math.max(0, Math.floor(sq || 0)),
      remaining: Math.max(0, Math.floor(rem || 0)),
    });
  };

  try {
    // ---------- ① products から直接読む（本線） ----------
    const direct = await supabase
      .from("products")
      .select("id,sale_price,sale_mode,sale_qty,sale_remaining,stock")
      .not("sale_price", "is", null);

    if (!direct.error) {
      for (const r of ((direct.data ?? []) as any[])) {
        const id = Number(r?.id);
        const mode: SaleMode = r?.sale_mode === "per_order" ? "per_order" : "total";
        const sq = Number(r?.sale_qty) || 0;
        const stock = Math.max(0, Math.floor(Number(r?.stock) || 0));
        const remTotal = Math.max(0, Math.floor(Number(r?.sale_remaining) || 0));
        // per_order は在庫がある限り継続／total は残り個数まで
        push(id, Number(r?.sale_price), mode, sq, mode === "per_order" ? stock : remTotal);
      }
      return map;
    }

    // ---------- ② フォールバック：公開ビュー ----------
    let rows: any[] | null = null;
    const full = await supabase
      .from("product_sale_lots")
      .select("product_id,sale_price,sale_mode,sale_qty,remaining");
    if (!full.error) {
      rows = (full.data ?? []) as any[];
    } else {
      const legacy = await supabase
        .from("product_sale_lots")
        .select("product_id,sale_price,remaining");
      if (legacy.error) {
        console.error("fetchSaleLots error:", direct.error, full.error, legacy.error);
        return map;
      }
      rows = (legacy.data ?? []) as any[];
    }

    for (const r of rows) {
      const mode: SaleMode = r?.sale_mode === "per_order" ? "per_order" : "total";
      push(
        Number(r?.product_id),
        Number(r?.sale_price),
        mode,
        Number(r?.sale_qty) || 0,
        Number(r?.remaining) || 0
      );
    }
  } catch (e) {
    console.error("fetchSaleLots failed:", e);
  }
  return map;
}

/**
 * v25：在庫とロットの件数を一致させる
 *   ・ロットを1個＝1件に正規化
 *   ・足りない分は「在庫調整」ロットを自動作成／多い分は削除
 */
export async function syncProductLots(
  productId: number
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc("sync_product_lots", { p_product_id: productId });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * カート数量のうち、セール価格が適用される個数を返す
 *   ・total     → 残り個数までがセール価格
 *   ・per_order → 1会計につき設定個数までがセール価格（超過分は通常価格）
 */
export function splitSaleQty(
  qty: number,
  s?: SaleLot | null
): { saleQty: number; normalQty: number } {
  const q = Math.max(0, Math.floor(Number(qty) || 0));
  if (!s) return { saleQty: 0, normalQty: q };
  const limit =
    s.sale_mode === "per_order" ? Math.max(0, s.sale_qty) : Math.max(0, s.remaining);
  const saleQty = Math.min(q, limit);
  return { saleQty, normalQty: q - saleQty };
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

// ---------- v18：商品ごとのセール（価格と販売個数） ----------

/** セール価格（未設定=null／0円はそのまま0を返す） */
export function salePriceOf(p: any): number | null {
  const v = p?.sale_price;
  if (v == null || v === "") return null;
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** 設定したセール個数 */
export function saleQtyOf(p: any): number {
  return Math.max(0, Math.floor(Number(p?.sale_qty ?? 0) || 0));
}

/** セールの残り個数 */
export function saleRemainingOf(p: any): number {
  return Math.max(0, Math.floor(Number(p?.sale_remaining ?? 0) || 0));
}

/** いまセール中か */
export function isOnSale(p: any): boolean {
  return salePriceOf(p) != null && saleRemainingOf(p) > 0;
}

/**
 * 商品のセールを設定する（価格0 or 個数0 で解除）
 * RPCが無い環境（SQL未実行）でも動くよう、直接更新にフォールバックする
 */
export async function setProductSale(
  productId: number,
  salePrice: number | null,
  qty: number,
  mode: SaleMode = "total"
): Promise<{ ok: boolean; error?: string }> {
  // 0円は「無料セール」として有効。解除は salePrice=null か qty=0 で行う
  const price = salePrice == null ? null : Math.max(0, Math.floor(salePrice));
  const count = Math.max(0, Math.floor(qty));

  const m: SaleMode = mode === "per_order" ? "per_order" : "total";

  const { error } = await supabase.rpc("set_product_sale", {
    p_product_id: productId,
    p_sale_price: price,
    p_qty: count,
    p_mode: m,
  });

  if (!error) return { ok: true };

  console.warn("set_product_sale rpc failed, fallback to direct update:", error);

  const clearing = price == null || count <= 0;
  const { error: e2 } = await supabase
    .from("products")
    .update(
      clearing
        ? { sale_price: null, sale_qty: 0, sale_remaining: 0, sale_mode: m }
        : { sale_price: price, sale_qty: count, sale_remaining: count, sale_mode: m }
    )
    .eq("id", productId);

  if (e2) return { ok: false, error: e2.message };
  return { ok: true };
}
