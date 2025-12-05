// src/pages/ProductList.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import "./ProductList.css";
import { findProductImage } from "../data/products";

type ProductRow = {
  id: number;
  name: string;
  price: number;
  stock: number;
  imageData: string | null;
};

function ProductList() {
  const navigate = useNavigate();
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);

  const formatPrice = (value: number | string) =>
    Number(value ?? 0).toLocaleString("ja-JP");

  useEffect(() => {
    const loadProducts = async () => {
      // ★ Supabase から name / price / stock を取る
      const { data, error } = await supabase
        .from("products")
        .select("id, name, price, stock")
        .order("id", { ascending: true });

      if (error) {
        console.error("商品一覧取得エラー:", error);
        setProducts([]);
        setLoading(false);
        return;
      }

      const rows = (data ?? []) as any[];

      const merged: ProductRow[] = rows.map((row) => ({
        id: row.id,
        name: row.name,
        price: row.price,
        stock: Number(row.stock ?? 0),
        imageData: findProductImage(row.id) ?? null, // ★ 画像はコードから
      }));

      setProducts(merged);
      setLoading(false);
    };

    loadProducts();
  }, []);

  if (loading) return <p style={{ padding: 20 }}>読み込み中...</p>;

  return (
    <div className="plist-container">
      <header className="plist-header">
        <button className="plist-back" onClick={() => navigate("/")}>
          ←
        </button>

        <h2 className="plist-title">商品一覧</h2>

        <button className="plist-cart" onClick={() => navigate("/cart")}>
          🛒
        </button>
      </header>

      <div className="plist-grid">
        {products.length === 0 ? (
          <p>商品がありません</p>
        ) : (
          products.map((p) => {
            const isSoldOut = p.stock <= 0;

            return (
              <div
                key={p.id}
                className={`plist-card ${isSoldOut ? "sold-out" : ""}`}
                onClick={() => {
                  if (!isSoldOut) navigate(`/product/${p.id}`);
                }}
              >
                {p.imageData ? (
                  <img src={p.imageData} alt={p.name} />
                ) : (
                  <div className="plist-noimg">画像なし</div>
                )}

                {isSoldOut && <div className="sold-label">SOLD OUT</div>}

                <h3>{p.name}</h3>
                <p className="plist-price">{formatPrice(p.price)}円</p>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default ProductList;