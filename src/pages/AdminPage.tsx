// src/pages/AdminPage.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import AdminHeader from "../components/AdminHeader";
import "./AdminPage.css";
import { findProductImage } from "../data/products";

type ViewMode = "all" | "selling" | "hidden" | "stock"; // ✅ 4つだけ

function AdminPage() {
  const navigate = useNavigate();
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // ✅ ボタン順に合わせて、デフォルトも「全て」に
  const [viewMode, setViewMode] = useState<ViewMode>("all");

  const loadProducts = async () => {
    setLoading(true);

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

  const extended = useMemo(() => {
    return products.map((p) => {
      const stockNum = Number(p.stock ?? 0);
      const isSoldOut = stockNum <= 0;
      const isLowStock = !isSoldOut && stockNum <= 3;

      const isVisible = Boolean(p.is_visible ?? true);
      const isSelling = isVisible && stockNum > 0;

      return {
        ...p,
        stockNum,
        isSoldOut,
        isLowStock,
        isVisible,
        isSelling,
      };
    });
  }, [products]);

  // ✅ モードで表示を切り替え
  const shown = useMemo(() => {
    let list = [...extended];

    // ✅ 絞り込み
    if (viewMode === "selling") list = list.filter((p) => p.isSelling);
    if (viewMode === "hidden") list = list.filter((p) => !p.isVisible);

    // ✅ 在庫注意：残りわずか + 在庫切れ "だけ" 表示
    if (viewMode === "stock") {
      list = list.filter((p) => p.isSoldOut || p.isLowStock);

      // ✅ 表示順：在庫切れ → 残りわずか → ID順
      list.sort((a, b) => {
        if (a.isSoldOut !== b.isSoldOut) return a.isSoldOut ? -1 : 1;
        if (a.isLowStock !== b.isLowStock) return a.isLowStock ? -1 : 1;
        return a.id - b.id;
      });

      return list;
    }

    // ✅ それ以外は通常ID順
    list.sort((a, b) => a.id - b.id);
    return list;
  }, [extended, viewMode]);

  if (loading) return <p style={{ padding: 20 }}>読み込み中...</p>;

  return (
    <>
      <AdminHeader />

      <div className="admin-page" style={{ paddingTop: 80 }}>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
          <button className="admin-add" onClick={() => navigate("/admin-add")}>
            ＋追加
          </button>
        </div>

        {/* ✅ ボタンは4つだけ（順番固定） */}
        <div className="admin-sort-row">
          <button
            className={`admin-sort-btn ${viewMode === "all" ? "active" : ""}`}
            onClick={() => setViewMode("all")}
          >
            全て
          </button>

          <button
            className={`admin-sort-btn ${viewMode === "selling" ? "active" : ""}`}
            onClick={() => setViewMode("selling")}
          >
            販売中
          </button>

          <button
            className={`admin-sort-btn ${viewMode === "hidden" ? "active" : ""}`}
            onClick={() => setViewMode("hidden")}
          >
            非表示
          </button>

          <button
            className={`admin-sort-btn ${viewMode === "stock" ? "active" : ""}`}
            onClick={() => setViewMode("stock")}
          >
            在庫注意
          </button>
        </div>

        <div className="admin-list">
          {shown.length === 0 ? (
            <p>
              {viewMode === "selling"
                ? "販売中の商品がありません"
                : viewMode === "hidden"
                ? "非表示の商品がありません"
                : viewMode === "stock"
                ? "在庫注意の商品がありません"
                : "商品がありません"}
            </p>
          ) : (
            shown.map((p) => {
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
                        <span style={{ marginLeft: 8, fontSize: 12 }}>（非表示）</span>
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