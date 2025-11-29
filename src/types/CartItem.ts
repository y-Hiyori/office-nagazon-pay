// src/types/CartItem.ts
import type { Product } from "./Product";

export interface CartItem {
  id: string;
  product: Product;
  quantity: number;
}
