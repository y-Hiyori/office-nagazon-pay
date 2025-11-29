// src/pages/AdminPage.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import "./AdminPage.css";

function AdminPage() {
  const navigate = useNavigate();
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadProducts = async () => {
    const { data, error } = await supabase.from("products").select("*");
    if (error) {
      console.error("商品取得エラー:", error);
    } else {
      setProducts(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadProducts();
  }, []);

  const getThumb = (img: string) => (img ? img : "");

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

  <button
    className="admin-add"
    onClick={() => navigate("/admin-add")}
  >
    ＋追加
  </button>

</header>

      <div className="admin-list">
        {products.length === 0 ? (
          <p>商品がありません</p>
        ) : (
          products.map((p) => (
            <div
              key={p.id}
              className="admin-item"
              onClick={() => navigate(`/admin-detail/${p.id}`)}
            >
              {p.imageData ? (
                <img
                  src={getThumb(p.imageData)}
                  alt={p.name}
                  className="admin-product-image"
                />
              ) : (
                <div className="admin-noimg">画像なし</div>
              )}

              <div className="admin-info">
                <h3>{p.name}</h3>
                <p>{p.price}円</p>
                <p>在庫: {p.stock}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default AdminPage;