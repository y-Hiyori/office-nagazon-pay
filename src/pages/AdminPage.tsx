// src/pages/AdminPage.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import "./AdminPage.css";
import { findProductImage } from "../data/products";

type SortMode = "default" | "stock";

function AdminPage() {
  const navigate = useNavigate();
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortMode, setSortMode] = useState<SortMode>("default");

  const loadProducts = async () => {
    const { data, error } = await supabase
      .from("products")
      .select("id, name, price, stock")
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

  // 在庫情報を付け足した配列を作る
  const extended = products.map((p) => {
    const stockNum = Number(p.stock ?? 0);
    const isSoldOut = stockNum <= 0;
    const isLowStock = !isSoldOut && stockNum <= 3;

    return {
      ...p,
      stockNum,
      isSoldOut,
      isLowStock,
    };
  });

  // 並び替え
  const sorted = [...extended];
  if (sortMode === "stock") {
    // 在庫注意順：在庫切れ → 残りわずか → それ以外（同じ中では id 昇順）
    sorted.sort((a, b) => {
      if (a.isSoldOut !== b.isSoldOut) {
        return a.isSoldOut ? -1 : 1;
      }
      if (a.isLowStock !== b.isLowStock) {
        return a.isLowStock ? -1 : 1;
      }
      return a.id - b.id;
    });
  } else {
    // 通常：id 昇順
    sorted.sort((a, b) => a.id - b.id);
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

      {/* 並び替えボタン */}
      <div className="admin-sort-row">
        <button
          className={`admin-sort-btn ${
            sortMode === "default" ? "active" : ""
          }`}
          onClick={() => setSortMode("default")}
        >
          通常順
        </button>
        <button
          className={`admin-sort-btn ${
            sortMode === "stock" ? "active" : ""
          }`}
          onClick={() => setSortMode("stock")}
        >
          在庫注意順
        </button>
      </div>

      <div className="admin-list">
        {sorted.length === 0 ? (
          <p>商品がありません</p>
        ) : (
          sorted.map((p) => {
            const imgSrc = findProductImage(p.id);

            return (
              <div
                key={p.id}
                className={`admin-item ${
                  p.isSoldOut ? "admin-item-soldout" : ""
                } ${p.isLowStock ? "admin-item-low" : ""}`}
                onClick={() => navigate(`/admin-detail/${p.id}`)}
              >
                {imgSrc ? (
                  <img src={imgSrc} alt={p.name} />
                ) : (
                  <div className="admin-no-img">画像なし</div>
                )}

                <div className="admin-info">
                  <h3>{p.name}</h3>
                  <p>{formatPrice(p.price)}円</p>

                  <div className="admin-stock-line">
                    <span className="admin-stock-label">
                      在庫: {p.stockNum}
                    </span>

                    {p.isSoldOut && (
                      <span className="admin-stock-badge soldout">
                        在庫切れ
                      </span>
                    )}

                    {p.isLowStock && !p.isSoldOut && (
                      <span className="admin-stock-badge low">
                        残りわずか
                      </span>
                    )}
                  </div>
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