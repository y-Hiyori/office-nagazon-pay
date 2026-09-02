// src/types/Product.ts
export type Product = {
  id: number;             // Supabase products.id に合わせる
  name: string;
  price: number;
  original_price?: number | null;
  originalPrice?: number | null;
  stock: number;
  imageData: string | null; // 画像のパス（ローカル or null）
  created_at: string;       // Supabase の created_at
};