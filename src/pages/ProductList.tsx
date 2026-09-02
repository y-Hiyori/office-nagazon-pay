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
  originalPrice: number | null;
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

  const getOriginalPrice = (row: { originalPrice?: number | null; price: number }) => {
    const original = Number(row.originalPrice ?? 0);
    return Number.isFinite(original) && original > row.price ? original : null;
  };

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
        const originalPriceNum = Number(p.original_price ?? p.originalPrice ?? 0);

        const isNew = createdAt
          ? now - new Date(createdAt).getTime() <= NEW_PERIOD_MS
          : false;

        const isVisible = (p.is_visible ?? p.isVisible) ?? true;

        return {
          id: Number(p.id),
          name: String(p.name ?? ""),
          price: Number(p.price ?? 0),
          originalPrice:
            Number.isFinite(originalPriceNum) && originalPriceNum > Number(p.price ?? 0)
              ? originalPriceNum
              : null,
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

          if (aSold !== bSold) return aSold ? 1 : -1;

          const aNew = !!a.isNew;
          const bNew = !!b.isNew;
          if (aNew !== bNew) return aNew ? -1 : 1;

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
            <span className="plist-search-icon" aria-hidden="true">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
            </span>
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
                クリア
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
              const originalPrice = getOriginalPrice(p);
              const isSale = !!originalPrice;
              const discountYen = isSale ? originalPrice! - p.price : 0;
              const discountRate = isSale
                ? Math.round((discountYen / originalPrice!) * 100)
                : 0;

              // ✅ SALE時は on-sale クラスを付与（価格がワインレッドに）
              const cardClass = [
                "plist-card",
                soldOut ? "sold-out" : "",
                isSale && !soldOut ? "on-sale" : "",
              ]
                .filter(Boolean)
                .join(" ");

              return (
                <div
                  key={p.id}
                  className={cardClass}
                  onClick={() => navigate(`/products/${p.id}`)}
                >
                  {/* ✅ 画像は .plist-media でラップ（正方形 + hoverズーム + SOLDオーバーレイ） */}
                  <div className="plist-media">
                    {p.imageData ? (
                      <img src={p.imageData} alt={p.name} />
                    ) : (
                      <div className="plist-noimg">No Image</div>
                    )}
                  </div>

                  {/* ✅ 通常バッジ（SALE / NEW）は左上に配置 */}
                  <div className="plist-badges">
                    {!soldOut && isSale ? (
                      <div className="sale-label">SALE {discountRate}%OFF</div>
                    ) : null}
                    {!soldOut && p.isNew ? (
                      <div className="new-label">NEW</div>
                    ) : null}
                  </div>

                  {/* ✅ SOLD OUT ラベルは .plist-badges の外へ（中央に大表示） */}
                  {soldOut ? <div className="sold-label">SOLD OUT</div> : null}

                  <div className="plist-name">{p.name}</div>

                  <div className="plist-price-wrap">
  {isSale && originalPrice ? (
    <div className="plist-price-old">
      ¥{formatPrice(originalPrice)}
    </div>
  ) : null}

  <div className="plist-price-row">
    <div className="plist-price">¥{formatPrice(p.price)}</div>
    {isSale ? (
      <div className="plist-price-save">
        ¥{formatPrice(discountYen)} OFF
      </div>
    ) : null}
  </div>
</div>

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
