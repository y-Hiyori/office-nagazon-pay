// src/context/CartContext.tsx
import { createContext, useContext, useState } from "react";
import type { Product } from "../types/Product";

export interface CartItem {
  id: number;        // product.id と同じ number
  product: Product;
  quantity: number;
}

// ✅ 受渡方法: shipping = 発送 / pickup = その場受け取り
export type Fulfillment = "shipping" | "pickup";
export type AddToCartResult = "ok" | "mixed";

export function fulfillmentOf(p: Product | undefined | null): Fulfillment {
  return p && p.is_shipping ? "shipping" : "pickup";
}

interface CartContextValue {
  cart: CartItem[];
  addToCart: (product: Product, qty: number) => AddToCartResult;
  removeFromCart: (id: number) => void;
  updateQuantity: (id: number, qty: number) => void;
  clearCart: () => void;
  getTotalPrice: () => number;
  fulfillment: Fulfillment; // カート全体の受渡方法（空なら pickup）
}

const CartContext = createContext<CartContextValue | undefined>(undefined);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<CartItem[]>([]);

  const clampQty = (qty: number, stock: number) =>
    Math.min(Math.max(qty, 1), stock);

  // ✅ 発送商品とその場受け取り商品の混在は禁止
  //   戻り値: "ok"（追加成功） / "mixed"（受渡方法が混在して追加不可）
  const addToCart = (product: Product, qty: number): AddToCartResult => {
    const addF = fulfillmentOf(product);

    // 同じ商品への数量追加は受渡方法を変えないので許可
    const exists = cart.some((i) => i.id === product.id);
    if (exists) {
      setCart((prev) =>
        prev.map((i) => {
          if (i.id !== product.id) return i;
          const stock = Number(i.product.stock) || 0;
          return { ...i, quantity: clampQty(i.quantity + qty, stock) };
        })
      );
      return "ok";
    }

    // 既存カートと受渡方法が食い違う新商品は追加不可
    const types = new Set(cart.map((i) => fulfillmentOf(i.product)));
    if (types.size > 0 && !types.has(addF)) {
      return "mixed";
    }

    setCart((prev) => [
      ...prev,
      { id: product.id, product, quantity: clampQty(qty, Number(product.stock) || 0) },
    ]);
    return "ok";
  };

  const updateQuantity = (id: number, qty: number) => {
    setCart((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const stock = Number(item.product.stock) || 0;
        return { ...item, quantity: clampQty(qty, stock) };
      })
    );
  };

  const removeFromCart = (id: number) =>
    setCart((prev) => prev.filter((item) => item.id !== id));

  const clearCart = () => setCart([]);

  const getTotalPrice = () =>
    cart.reduce(
      (sum, item) => sum + Number(item.product.price) * item.quantity,
      0
    );

  const fulfillment: Fulfillment = cart.some((i) => fulfillmentOf(i.product) === "shipping")
    ? "shipping"
    : "pickup";

  return (
    <CartContext.Provider
      value={{
        cart,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        getTotalPrice,
        fulfillment,
      }}
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
