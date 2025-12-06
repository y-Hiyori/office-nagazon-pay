// src/pages/AdminPage.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import "./AdminPage.css";
import { findProductImage } from "../data/products";

function AdminPage() {
  const navigate = useNavigate();
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadProducts = async () => {
    const { data, error } = await supabase
      .from("products")
      .select("id, name, price, stock") // 👈 画像は取らない
      .order("id", { ascending: true });

    if (error) {
      console.error("商品取得エラー:", error);
      setProducts([]);
    } else {
      setProducts(data ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadProducts();
  }, []);

  // 金額を3桁区切りで表示するヘルパー
  const formatPrice = (value: number | string) => {
    const num = Number(value ?? 0);
    if (Number.isNaN(num)) return String(value ?? "");
    return num.toLocaleString("ja-JP");
  };

  if (loading) {
    return <p style={{ padding: 20 }}>読み込み中...</p>;
  }

  return (
    <div className="admin-page">
      {/* ヘッダー */}
      <header className="admin-header">
        <button className="admin-back" onClick={() => navigate("/admin-menu")}>
          ←
        </button>

        <h2 className="admin-title">商品管理</h2>

        <button className="admin-add" onClick={() => navigate("/admin-add")}>
          ＋追加
        </button>
      </header>

      <div className="admin-list">
        {products.length === 0 ? (
          <p>商品がありません</p>
        ) : (
          products.map((p) => {
            const imgSrc = findProductImage(p.id); // 👈 id → 画像

            return (
              <div
                key={p.id}
                className="admin-item"
                onClick={() => navigate(`/admin-detail/${p.id}`)}
              >
                {imgSrc ? (
  // 画像あり：普通の img（サイズは CSS の .admin-item img で統一）
  <img src={imgSrc} alt={p.name} />
) : (
  // 画像なし：同じサイズのグレー枠
  <div className="admin-no-img">画像なし</div>
)}

                <div className="admin-info">
                  <h3>{p.name}</h3>
                  <p>{formatPrice(p.price)}円</p>
                  <p>在庫: {p.stock}</p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default AdminPage;