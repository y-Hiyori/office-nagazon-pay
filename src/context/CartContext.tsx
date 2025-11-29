// src/context/CartContext.tsx
import { createContext, useContext, useState } from "react";
import type { Product } from "../types/Product";

export interface CartItem {
  id: string;
  product: Product;
  quantity: number;
}

interface CartContextValue {
  cart: CartItem[];
  addToCart: (product: Product, qty: number) => void;
  removeFromCart: (id: string) => void;
  updateQuantity: (id: string, qty: number) => void;
  clearCart: () => void;
  getTotalPrice: () => number;
}

const CartContext = createContext<CartContextValue | undefined>(undefined);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<CartItem[]>([]);

  // 🟦 在庫チェック共通ロジック
  const clampQty = (qty: number, stock: number) =>
    Math.min(Math.max(qty, 1), stock);

  // 🟦 カート追加（在庫絶対超えない）
  const addToCart = (product: Product, qty: number) => {
    const stock = Number(product.stock) || 0;

    setCart((prev) => {
      const exists = prev.find((i) => i.id === product.id);

      if (exists) {
        const newQty = clampQty(exists.quantity + qty, stock);
        return prev.map((i) =>
          i.id === product.id ? { ...i, quantity: newQty } : i
        );
      }

      // 初追加も clamp
      return [...prev, { id: product.id, product, quantity: clampQty(qty, stock) }];
    });
  };

  // 🟦 数量変更
  const updateQuantity = (id: string, qty: number) => {
    setCart((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;

        const stock = Number(item.product.stock) || 0;
        return { ...item, quantity: clampQty(qty, stock) };
      })
    );
  };

  const removeFromCart = (id: string) =>
    setCart((prev) => prev.filter((item) => item.id !== id));

  const clearCart = () => setCart([]);

  const getTotalPrice = () =>
    cart.reduce((sum, item) => sum + Number(item.product.price) * item.quantity, 0);

  return (
    <CartContext.Provider
      value={{ cart, addToCart, removeFromCart, updateQuantity, clearCart, getTotalPrice }}
    >
      {children}
    </CartContext.Provider>
  );
}

export const useCart = () => {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("CartContext が存在しません");
  return ctx;
};