// src/types/Product.ts
export type Product = {
  id: number;             // Supabase products.id に合わせる
  name: string;
  price: number;
  stock: number;
  imageData: string | null; // 画像のパス（ローカル or null）
  created_at: string;       // Supabase の created_at
};