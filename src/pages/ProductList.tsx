// src/pages/ProductList.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import "./ProductList.css";

function ProductList() {
  const navigate = useNavigate();
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // 🔢 価格フォーマット関数（3桁ごとにカンマ）
  const formatPrice = (value: number | string) => {
    const num = Number(value ?? 0);
    return num.toLocaleString("ja-JP");
  };

  // 🔥 Supabase から商品取得
  useEffect(() => {
    const loadProducts = async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error(error);
      } else {
        setProducts(data || []);
      }
      setLoading(false);
    };

    loadProducts();
  }, []);

  if (loading) return <p style={{ padding: 20 }}>読み込み中...</p>;

  return (
    <div className="plist-container">
      {/* 固定ヘッダー */}
      <header className="plist-header">
        <button className="plist-back" onClick={() => navigate("/")}>
          ←
        </button>

        <h2 className="plist-title">商品一覧</h2>

        <button className="plist-cart" onClick={() => navigate("/cart")}>
          🛒
        </button>
      </header>

      {/* 商品一覧 */}
      <div className="plist-grid">
        {products.length === 0 ? (
          <p>商品がありません</p>
        ) : (
          products.map((p) => {
            const isSoldOut = p.stock <= 0; // ★ 在庫判定

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

                {/* SOLD OUT ラベル */}
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