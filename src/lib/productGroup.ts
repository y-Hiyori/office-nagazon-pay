// src/lib/productGroup.ts
// 同じ種類の商品をまとめるためのルール。
// 商品名を「シリーズ名／味・種類」（全角スラッシュ区切り）で登録すると、
// 商品一覧では1枚にまとまり、商品詳細で味・種類を選べる。
//   例）「忍者めし／巨峰」「忍者めし／ラムネ」→ 一覧は「忍者めし」1枚

export const VARIANT_SEPARATOR = "／";

export type ProductNameParts = {
  group: string; // シリーズ名（区切りが無ければ商品名そのまま）
  variant: string | null; // 味・種類（区切りが無ければ null）
};

export function splitProductName(name: string | null | undefined): ProductNameParts {
  const s = String(name ?? "").trim();
  const i = s.indexOf(VARIANT_SEPARATOR);
  if (i <= 0 || i >= s.length - 1) return { group: s, variant: null };

  const group = s.slice(0, i).trim();
  const variant = s.slice(i + 1).trim();
  if (!group || !variant) return { group: s, variant: null };
  return { group, variant };
}

// Supabase の like 検索用（% と _ をエスケープ）
export function variantLikePattern(group: string): string {
  const escaped = group.replace(/[\\%_]/g, (c) => `\\${c}`);
  return `${escaped}${VARIANT_SEPARATOR}%`;
}
