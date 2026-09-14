// 会員価格（ログイン時のみ有効）と通常価格を扱う共通ヘルパー
import type { Product } from "../types/Product";

type P = Pick<Product, "price"> & { member_price?: number | null };

// 会員価格が設定されていれば返す（無ければ null）
export function memberPriceOf(p: P | null | undefined): number | null {
  if (!p) return null;
  const m = Number(p.member_price ?? 0);
  if (Number.isFinite(m) && m > 0) return Math.floor(m);
  return null;
}

// 表示・計算に使う実効価格（会員なら会員価格、無ければ通常価格）
export function effectivePrice(p: P | null | undefined, isMember: boolean): number {
  const base = Number(p?.price ?? 0) || 0;
  if (isMember) {
    const m = memberPriceOf(p);
    if (m != null && m > 0) return m;
  }
  return base;
}
