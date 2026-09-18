// src/pages/CartPage.tsx
import { useCart } from "../context/CartContext";
import { useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";
import "./CartPage.css";

type StockIssue = {
  id: string | number;
  name: string;
  reason: string;
};

function CartPage() {
  const { cart, removeFromCart, updateQuantity, getTotalPrice } = useCart();
  const navigate = useNavigate();

  const total = getTotalPrice();

  const formatPrice = (value: number | string) => Number(value || 0).toLocaleString("ja-JP");

  const goDetail = (productId: string | number) => {
    navigate(`/products/${productId}`);
  };

  // ✅ アプリ内通知（トースト）
  const [toast, setToast] = useState<{ text: string; kind: "info" | "error" } | null>(null);

  // ✅ 在庫確認モーダル
  const [stockModalOpen, setStockModalOpen] = useState(false);
  const [issues, setIssues] = useState<StockIssue[]>([]);
  const [checking, setChecking] = useState(false);

  const showToast = (text: string, kind: "info" | "error" = "info") => {
    setToast({ text, kind });
  };

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(t);
  }, [toast]);

  const productIds = useMemo(() => cart.map((c) => Number(c.id)).filter((n) => Number.isFinite(n)), [cart]);

  // ✅ 購入へ進む：最新在庫を確認してから遷移
  const handleProceedCheckout = async () => {
    if (checking) return;

    if (cart.length === 0) {
      showToast("カートが空です。", "info");
      return;
    }

    setChecking(true);
    try {
      // products の最新在庫・公開状態を取得
      const { data, error } = await supabase
        .from("products")
        .select("id,name,stock,is_visible,max_per_order")
        .in("id", productIds);

      if (error || !data) {
        console.error("stock check error:", error);
        showToast("在庫の確認に失敗しました。時間をおいて再度お試しください。", "error");
        return;
      }

      // id -> 最新情報Map
      const latest = new Map<number, { name: string; stock: number; is_visible: boolean; max_per_order: number }>();
      data.forEach((p: any) => {
        latest.set(Number(p.id), {
          name: String(p.name ?? ""),
          stock: Number(p.stock ?? 0) || 0,
          max_per_order: Math.max(0, Math.floor(Number((p as any).max_per_order ?? 0)) || 0),
          is_visible: p.is_visible !== false,
        });
      });

      const foundIssues: StockIssue[] = [];

      for (const item of cart) {
        const idNum = Number(item.id);
        const now = latest.get(idNum);

        // 取得できない（削除された等）
        if (!now) {
          foundIssues.push({
            id: item.id,
            name: item.product.name,
            reason: "商品情報が確認できませんでした（販売終了の可能性）",
          });
          continue;
        }

        if (!now.is_visible) {
          foundIssues.push({
            id: item.id,
            name: now.name || item.product.name,
            reason: "現在購入できません",
          });
          continue;
        }

        if (now.stock <= 0) {
          foundIssues.push({
            id: item.id,
            name: now.name || item.product.name,
            reason: "売り切れです",
          });
          continue;
        }

        if (item.quantity > now.stock) {
          foundIssues.push({
            id: item.id,
            name: now.name || item.product.name,
            reason: `在庫不足（在庫 ${now.stock} / カート ${item.quantity}）`,
          });
        }

        // ✅ 1回のお会計での購入上限
        if (now.max_per_order > 0 && item.quantity > now.max_per_order) {
          foundIssues.push({
            id: item.id,
            name: now.name || item.product.name,
            reason: `1回のお会計で${now.max_per_order}個まで（カート ${item.quantity}）`,
          });
        }
      }

      if (foundIssues.length > 0) {
        setIssues(foundIssues);
        setStockModalOpen(true);
        return;
      }

      // ✅ 問題なし：チェックアウトへ
      navigate("/checkout");
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="cart-page">
      <SiteHeader />

      <main className="cart-wrap">
        <h2 className="cart-title">カート</h2>

        <div className="cart-content">
          {cart.length === 0 ? (
            <p className="cart-empty">カートは空です</p>
          ) : (
            cart.map((item) => {
              const maxStock = Number(item.product.stock) || 0;
              const maxOrder = Math.floor(Number((item.product as any).max_per_order ?? 0));
              const max = maxOrder > 0 ? Math.min(maxStock, maxOrder) : maxStock;

              return (
                <div key={item.id} className="cart-item">
                  <div
                    className="cart-img"
                    onClick={() => goDetail(item.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") goDetail(item.id);
                    }}
                  >
                    {item.product.imageData ? (
                      <img src={item.product.imageData} alt={item.product.name} />
                    ) : (
                      <div className="no-img">画像なし</div>
                    )}
                  </div>

                  <div
                    className="cart-info"
                    onClick={() => goDetail(item.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") goDetail(item.id);
                    }}
                  >
                    <p className="name">{item.product.name}</p>
                    <p className="price">
                      {formatPrice(item.product.price)}円 × {item.quantity}
                    </p>

                    <div className="qty-row">
                      <button
                        className="qty-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          updateQuantity(item.id, item.quantity - 1);
                        }}
                        disabled={item.quantity <= 1}
                        type="button"
                      >
                        －
                      </button>

                      <span>{item.quantity}</span>

                      <button
                        className="qty-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          updateQuantity(item.id, item.quantity + 1);
                        }}
                        disabled={max > 0 && item.quantity >= max}
                        type="button"
                      >
                        ＋
                      </button>
                    </div>
                  </div>

                  <button
                    className="delete-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFromCart(item.id);
                      showToast("カートから削除しました", "info");
                    }}
                    aria-label="削除"
                    type="button"
                  >
                    🗑
                  </button>
                </div>
              );
            })
          )}
        </div>

        {cart.length > 0 && (
          <div className="cart-summary">
            <p className="total">合計：{formatPrice(total)}円</p>
            <button className="buy-btn" onClick={handleProceedCheckout} disabled={checking} type="button">
              {checking ? "在庫確認中…" : "購入へ進む"}
            </button>
          </div>
        )}
      </main>

      <SiteFooter />

      {/* ✅ トースト（アプリ内表示） */}
      {toast && (
        <div className={`app-toast ${toast.kind}`} role="status" aria-live="polite">
          {toast.text}
        </div>
      )}

      {/* ✅ 在庫確認モーダル（アプリ内表示） */}
      {stockModalOpen && (
        <div className="app-modal-overlay" onClick={() => setStockModalOpen(false)}>
          <div className="app-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <h3 className="app-modal-title">購入できない商品があります</h3>
            <p className="app-modal-desc">カート内容を調整してから、もう一度お試しください。</p>

            <div className="app-modal-list">
              {issues.map((x) => (
                <div key={String(x.id)} className="app-modal-item">
                  <div className="app-modal-item-name">{x.name}</div>
                  <div className="app-modal-item-reason">{x.reason}</div>
                </div>
              ))}
            </div>

            <div className="app-modal-actions">
              <button className="app-modal-sub" type="button" onClick={() => setStockModalOpen(false)}>
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CartPage;