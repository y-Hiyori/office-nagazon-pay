// src/types/Product.ts

export type Product = {
  id: string;          // Supabase の uuid
  created_at: string;  // Supabase の timestamp
  name: string;
  price: number;
  stock: number;
  imageData: string | null; // 画像（Base64）・ない時は null
};