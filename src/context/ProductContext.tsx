// src/context/ProductContext.tsx
import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { Product } from "../types/Product";

type ProductContextType = {
  products: Product[];
  addProduct: (p: Omit<Product, "id" | "created_at">) => Promise<void>;
  updateProduct: (p: Product) => Promise<void>;
  deleteProduct: (id: number) => Promise<void>; // ★ string → number に統一
  refresh: () => Promise<void>;
};

const ProductContext = createContext<ProductContextType | null>(null);

export const ProductProvider = ({ children }: { children: React.ReactNode }) => {
  const [products, setProducts] = useState<Product[]>([]);

  // ====================================
  // 🔥 商品一覧の取得
  // ====================================
  const refresh = async () => {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Fetch Error:", error);
      return;
    }

    setProducts(data as Product[]);
  };

  useEffect(() => {
    refresh();
  }, []);

  // ====================================
  // 🔥 商品追加（created_at を必ず付ける）
  // ====================================
  const addProduct = async (p: Omit<Product, "id" | "created_at">) => {
    const insertData = {
      ...p,
      created_at: new Date().toISOString(), // ← ここで created_at を必ず付ける
    };

    const { data, error } = await supabase
      .from("products")
      .insert([insertData])
      .select();

    if (error) {
      console.error("Insert Error:", error);
      return;
    }

    if (data && data.length > 0) {
      setProducts((prev) => [...prev, data[0] as Product]);
    }
  };

  // ====================================
  // 🔥 商品更新
  // ====================================
  const updateProduct = async (p: Product) => {
    const { data, error } = await supabase
      .from("products")
      .update({
        name: p.name,
        price: p.price,
        stock: p.stock,
        imageData: p.imageData, // imageData カラム消してたらここも消す
      })
      .eq("id", p.id)
      .select();

    if (error) {
      console.error("Update Error:", error);
      return;
    }

    if (data && data.length > 0) {
      setProducts((prev) =>
        prev.map((item) => (item.id === p.id ? (data[0] as Product) : item))
      );
    }
  };

  // ====================================
  // 🔥 商品削除
  // ====================================
  const deleteProduct = async (id: number) => {
    const { error } = await supabase.from("products").delete().eq("id", id);

    if (error) {
      console.error("Delete Error:", error);
      return;
    }

    // ローカル状態からも削除
    setProducts((prev) => prev.filter((p) => p.id !== id));
  };

  return (
    <ProductContext.Provider
      value={{ products, addProduct, updateProduct, deleteProduct, refresh }}
    >
      {children}
    </ProductContext.Provider>
  );
};

// ====================================
// ⭐ useProducts フック
// ====================================
export const useProducts = () => {
  const ctx = useContext(ProductContext);
  if (!ctx) {
    throw new Error("useProducts must be used inside ProductProvider");
  }
  return ctx;
};