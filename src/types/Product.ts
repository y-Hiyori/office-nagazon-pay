// src/types/Product.ts
export type Product = {
  id: number;             // Supabase products.id に合わせる
  name: string;
  price: number;
  member_price?: number | null;
  earn_points?: number;
  original_price?: number | null;
  originalPrice?: number | null;
  stock: number;
  imageData: string | null; // 画像のパス（ローカル or null）
  created_at: string;       // Supabase の created_at
  is_shipping?: boolean;    // true = 発送商品（配送が必要）
  shipping_lead_min?: number | null;   // 発送目安：最短（例 3）
  shipping_lead_max?: number | null;   // 発送目安：最長（例 5）
  shipping_lead_unit?: string | null;  // 'business_days'（営業日） | 'days'（日）
};