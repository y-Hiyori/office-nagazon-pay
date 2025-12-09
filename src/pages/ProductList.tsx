// src/pages/ProductList.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import "./ProductList.css";
import { findProductImage } from "../data/products";

const NEW_PERIOD_MS = 24 * 60 * 60 * 1000; // 24時間

type ProductRow = {
  id: number;
  name: string;
  price: number;
  stock: number;
  imageData: string | null;
  createdAt: string | null;
  isNew: boolean;
};

function ProductList() {
  const navigate = useNavigate();
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);

  const formatPrice = (value: number | string) =>
    Number(value ?? 0).toLocaleString("ja-JP");

  useEffect(() => {
    const loadProducts = async () => {
      // ★ created_at も取得する
      const { data, error } = await supabase
        .from("products")
        .select("id, name, price, stock, created_at")
        .order("id", { ascending: true });

      if (error) {
        console.error("商品一覧取得エラー:", error);
        setProducts([]);
        setLoading(false);
        return;
      }

      const rows = (data ?? []) as any[];

      const now = Date.now();

      const merged: ProductRow[] = rows.map((row) => {
        const createdAt: string | null = row.created_at ?? null;
        const createdDate = createdAt ? new Date(createdAt) : null;

        const isNew =
          createdDate != null && now - createdDate.getTime() < NEW_PERIOD_MS;

        return {
          id: row.id,
          name: row.name,
          price: row.price,
          stock: Number(row.stock ?? 0),
          imageData: findProductImage(row.id) ?? null, // 画像はコードから
          createdAt,
          isNew,
        };
      });

      // 並び替えルール
      // 1. 在庫ありが上、売切れは下
      // 2. 在庫ありの中では NEW（24h以内）が上
      // 3. それ以外は id 昇順
      merged.sort((a, b) => {
  const aSold = a.stock <= 0;
  const bSold = b.stock <= 0;
  if (aSold !== bSold) {
    // 売り切れは下へ
    return aSold ? 1 : -1;
  }

  const aNew = a.isNew;
  const bNew = b.isNew;
  if (aNew !== bNew) {
    // NEW は上へ
    return aNew ? -1 : 1;
  }

  // ★ どちらも NEW のときは createdAt の新しい順で並べる
  if (aNew && bNew) {
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    // 新しいほど上にしたいので「大きい方を先に」
    if (aTime !== bTime) {
      return bTime - aTime;
    }
  }

  // 最後は id 昇順
  return a.id - b.id;
});

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

                {/* NEW は在庫ありの時だけ表示 */}
                {p.isNew && !isSoldOut && (
                  <div className="new-label">NEW</div>
                )}

                {isSoldOut && <div className="sold-label">SOLD OUT</div>}

                <p className="plist-name">{p.name}</p>
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