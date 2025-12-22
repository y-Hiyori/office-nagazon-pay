// src/pages/ProductList.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import "./ProductList.css";
import { findProductImage } from "../data/products";
import SiteFooter from "../components/SiteFooter";
import SiteHeader from "../components/SiteHeader";

const NEW_PERIOD_MS = 24 * 60 * 60 * 1000;

type ProductRow = {
  id: number;
  name: string;
  price: number;
  stock: number;
  imageData: string | null;
  createdAt: string | null;
  isNew: boolean;
  isVisible: boolean;
};

function ProductList() {
  const navigate = useNavigate();

  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);

  // ✅ 検索
  const [query, setQuery] = useState("");

  const formatPrice = (value: number | string) =>
    Number(value ?? 0).toLocaleString("ja-JP");

  useEffect(() => {
    const loadProducts = async () => {
      setLoading(true);

      const { data, error } = await supabase
        .from("products")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("products load error:", error);
        setProducts([]);
        setLoading(false);
        return;
      }

      const now = Date.now();

      const rows: ProductRow[] = (data ?? []).map((p: any) => {
        const createdAt = p.created_at ?? p.createdAt ?? null;

        const isNew = createdAt
          ? now - new Date(createdAt).getTime() <= NEW_PERIOD_MS
          : false;

        const isVisible = (p.is_visible ?? p.isVisible) ?? true;

        return {
          id: Number(p.id),
          name: String(p.name ?? ""),
          price: Number(p.price ?? 0),
          stock: Number(p.stock ?? 0),
          imageData: p.imageData ?? findProductImage(Number(p.id)) ?? null,
          createdAt,
          isNew,
          isVisible,
        };
      });

      // ✅ 並び順：在庫あり → NEW優先 → 新しい順 → 最後に売り切れ
      const visibleRows = rows
        .filter((r) => r.isVisible !== false)
        .sort((a, b) => {
          const aSold = (a.stock ?? 0) <= 0;
          const bSold = (b.stock ?? 0) <= 0;

          // ① 在庫ありを先、売り切れを後
          if (aSold !== bSold) return aSold ? 1 : -1;

          // ② 在庫あり同士なら NEW を先
          const aNew = !!a.isNew;
          const bNew = !!b.isNew;
          if (aNew !== bNew) return aNew ? -1 : 1;

          // ③ 同じグループ内は新しい順
          const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return bt - at;
        });

      setProducts(visibleRows);
      setLoading(false);
    };

    loadProducts();
  }, []);

  // ✅ 検索で絞り込み
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => (p.name ?? "").toLowerCase().includes(q));
  }, [products, query]);

  return (
    <div className="plist-page">
      <SiteHeader />

      <main className="plist-container">
        {/* ✅ 検索バー */}
        <div className="plist-search">
          <div className="plist-search-inner">
            <span className="plist-search-icon">🔎</span>
            <input
              className="plist-search-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="商品名で検索"
            />
            {query && (
              <button
                type="button"
                className="plist-search-clear"
                onClick={() => setQuery("")}
                aria-label="検索をクリア"
              >
                ×
              </button>
            )}
          </div>
        </div>

        <h2 className="plist-title">商品一覧</h2>

        {loading ? (
          <div className="plist-empty">読み込み中...</div>
        ) : filtered.length === 0 ? (
          <div className="plist-empty">該当する商品がありません</div>
        ) : (
          <div className="plist-grid">
            {filtered.map((p) => {
              const soldOut = (p.stock ?? 0) <= 0;

              return (
                <div
                  key={p.id}
                  className={`plist-card ${soldOut ? "sold-out" : ""}`}
                  onClick={() => navigate(`/products/${p.id}`)}
                >
                  {/* ラベル */}
                  {soldOut ? (
                    <div className="sold-label">SOLD OUT</div>
                  ) : p.isNew ? (
                    <div className="new-label">NEW</div>
                  ) : null}

                  {/* 画像 */}
                  {p.imageData ? (
                    <img src={p.imageData} alt={p.name} />
                  ) : (
                    <div className="plist-noimg">No Image</div>
                  )}

                  <div className="plist-name">{p.name}</div>
                  <div className="plist-price">{formatPrice(p.price)}円</div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}

export default ProductList;