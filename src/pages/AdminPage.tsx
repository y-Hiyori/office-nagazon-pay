// src/pages/AdminPage.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import AdminHeader from "../components/AdminHeader";
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
      .select("id, name, price, stock, is_visible")
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

  const formatPrice = (value: number | string) => {
    const num = Number(value ?? 0);
    if (Number.isNaN(num)) return String(value ?? "");
    return num.toLocaleString("ja-JP");
  };

  const toggleVisible = async (id: number, nextVisible: boolean) => {
    const { error } = await supabase
      .from("products")
      .update({ is_visible: nextVisible })
      .eq("id", id);

    if (error) {
      console.error("表示切替エラー:", error);
      return;
    }

    setProducts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, is_visible: nextVisible } : p))
    );
  };

  if (loading) return <p style={{ padding: 20 }}>読み込み中...</p>;

  const extended = products.map((p) => {
    const stockNum = Number(p.stock ?? 0);
    const isSoldOut = stockNum <= 0;
    const isLowStock = !isSoldOut && stockNum <= 3;

    return {
      ...p,
      stockNum,
      isSoldOut,
      isLowStock,
      isVisible: Boolean(p.is_visible ?? true),
    };
  });

  const sorted = [...extended];
  if (sortMode === "stock") {
    sorted.sort((a, b) => {
      if (a.isSoldOut !== b.isSoldOut) return a.isSoldOut ? -1 : 1;
      if (a.isLowStock !== b.isLowStock) return a.isLowStock ? -1 : 1;
      return a.id - b.id;
    });
  } else {
    sorted.sort((a, b) => a.id - b.id);
  }

  return (
    <>
      <AdminHeader />

      <div className="admin-page" style={{ paddingTop: 80 }}>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
          <button className="admin-add" onClick={() => navigate("/admin-add")}>
            ＋追加
          </button>
        </div>

        <div className="admin-sort-row">
          <button
            className={`admin-sort-btn ${sortMode === "default" ? "active" : ""}`}
            onClick={() => setSortMode("default")}
          >
            通常順
          </button>
          <button
            className={`admin-sort-btn ${sortMode === "stock" ? "active" : ""}`}
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
                  className={`admin-item ${p.isSoldOut ? "admin-item-soldout" : ""} ${
                    p.isLowStock ? "admin-item-low" : ""
                  }`}
                  onClick={() => navigate(`/admin-detail/${p.id}`)}
                >
                  {imgSrc ? (
                    <img src={imgSrc} alt={p.name} />
                  ) : (
                    <div className="admin-no-img">画像なし</div>
                  )}

                  <div className="admin-info">
                    <h3>
                      {p.name}
                      {!p.isVisible && (
                        <span style={{ marginLeft: 8, fontSize: 12 }}>
                          （非表示）
                        </span>
                      )}
                    </h3>
                    <p>{formatPrice(p.price)}円</p>

                    <div className="admin-stock-line">
                      <span className="admin-stock-label">在庫: {p.stockNum}</span>

                      {p.isSoldOut && (
                        <span className="admin-stock-badge soldout">在庫切れ</span>
                      )}
                      {p.isLowStock && !p.isSoldOut && (
                        <span className="admin-stock-badge low">残りわずか</span>
                      )}

                      <button
                        className={`admin-visible-btn ${p.isVisible ? "on" : "off"}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleVisible(p.id, !p.isVisible);
                        }}
                      >
                        {p.isVisible ? "表示中" : "非表示"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}

export default AdminPage;