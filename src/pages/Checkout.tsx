// src/pages/Checkout.tsx
import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useCart } from "../context/CartContext";
import "./Checkout.css";

function Checkout() {
  const navigate = useNavigate();
  const location = useLocation();
  const cart = useCart();

  const [user, setUser] = useState<any>(null);
  const [method, setMethod] = useState<"paypay" | "self" | "">("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [showPayGuide, setShowPayGuide] = useState(false);
  const [showFinalConfirm, setShowFinalConfirm] = useState(false);

  // 💰 カンマ区切り
  const formatPrice = (value: number | string) =>
    Number(value || 0).toLocaleString("ja-JP");

  const state = location.state as
    | { buyNow?: { product: any; quantity: number } }
    | undefined;

  const buyNow = state?.buyNow;

  const items = buyNow
    ? [
        {
          id: buyNow.product.id,
          product: buyNow.product,
          quantity: buyNow.quantity,
        },
      ]
    : cart.cart;

  const total = buyNow
    ? (Number(buyNow.product.price) || 0) * buyNow.quantity
    : cart.getTotalPrice();

  // --- ユーザー取得 ---
  useEffect(() => {
    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        alert("ログインしてください");
        navigate("/login");
        return;
      }
      setUser(user);
    };
    load();
  }, [navigate]);

  // --- 「購入を確定する」ボタン ---
  const handleClickConfirmButton = () => {
    if (!method) {
      alert("支払い方法を選択してください");
      return;
    }

    if (!buyNow && cart.cart.length === 0) {
      alert("カートが空です");
      return;
    }

    if (method === "paypay") {
      alert("PayPay決済は準備中です");
      return;
    }

    // モーダル① を表示
    setShowPayGuide(true);
  };

  // --- 最終購入処理 ---
  const finalizePurchase = async () => {
    if (isProcessing) return;
    setIsProcessing(true);

    try {
      const { data: order, error } = await supabase
        .from("orders")
        .insert({ user_id: user.id, total })
        .select()
        .single();

      if (error || !order) {
        alert("注文作成に失敗しました");
        return;
      }

      for (const item of items) {
        await supabase.from("order_items").insert({
          order_id: order.id,
          product_name: item.product.name,
          price: item.product.price,
          quantity: item.quantity,
          imageData: item.product.imageData ?? null,
        });

        await supabase
          .from("products")
          .update({ stock: Number(item.product.stock) - item.quantity })
          .eq("id", item.product.id);
      }

      if (!buyNow) {
        cart.clearCart();
      }

      navigate(`/purchase-complete/${order.id}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="checkout-page">
      {/* ヘッダー */}
      <header className="checkout-header">
        <button className="back" onClick={() => navigate(-1)}>
          ←
        </button>
        <h2 className="checkout-title">購入確認</h2>
      </header>

      {/* 購入商品一覧 */}
      <h3 className="section-title">購入商品</h3>
      <div className="checkout-items">
        {items.map((item) => (
          <div className="checkout-item" key={item.id}>
            <img
              src={item.product.imageData ?? "/no-image.png"}
              className="checkout-item-img"
              alt={item.product.name}
            />
            <div className="checkout-item-info">
              <p className="item-name">{item.product.name}</p>
              <p>
                {formatPrice(item.product.price)}円 × {item.quantity}
              </p>
              <p className="item-subtotal">
                小計：{formatPrice(
                  (Number(item.product.price) || 0) * item.quantity
                )}
                円
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* 支払い方法（固定＋スクロール） */}
      <div className="pay-method-fixed">
        <h3 className="section-title pay-method-title">支払い方法</h3>
        <div className="pay-method-scroll">
          {/* まだ使えないPayPay */}
          <div className="pay-card disabled">
            <div className="pay-left">
              <span className="pay-title">PayPay</span>
              <span className="pay-desc">今後搭載予定</span>
            </div>
            <div className="pay-check-area">
              <div className="pay-check"></div>
            </div>
          </div>

          {/* 今回使うセルフ決済 */}
          <div
            className={`pay-card ${method === "self" ? "selected" : ""}`}
            onClick={() => setMethod("self")}
          >
            <div className="pay-left">
              <span className="pay-title">PayPayセルフ決済</span>
              <span className="pay-desc">
                店舗のQRコードを読み取り
                <br />
                合計 {formatPrice(total)}円 を入力して支払ってください。
              </span>
            </div>
            <div className="pay-check-area">
              <div className="pay-check">{method === "self" && "✓"}</div>
            </div>
          </div>
        </div>
      </div>

      {/* 画面下の合計＋購入ボタン（固定） */}
      <div className="checkout-bottom-fixed">
        <p className="checkout-total">合計：{formatPrice(total)}円</p>
        <button
          className="checkout-btn"
          onClick={handleClickConfirmButton}
          disabled={isProcessing}
        >
          購入を確定する
        </button>
      </div>

      {/* モーダル①：PayPayセルフ決済の手順 */}
      {showPayGuide && (
        <div className="pay-modal-overlay">
          <div className="pay-modal">
            <h3>PayPayセルフ決済の手順</h3>
            <p>1. 店舗のQRコードを読み取る</p>
            <p>
              2. 金額 <strong>{formatPrice(total)}円</strong> を入力
            </p>
            <p>3. 決済を完了</p>

            <div className="modal-buttons">
              <button
                className="modal-main-btn"
                onClick={() => {
                  setShowPayGuide(false);
                  setShowFinalConfirm(true);
                }}
              >
                完了しました
              </button>
              <button
                className="modal-sub-btn"
                onClick={() => setShowPayGuide(false)}
              >
                戻る
              </button>
            </div>
          </div>
        </div>
      )}

      {/* モーダル②：最終確認 */}
      {showFinalConfirm && (
        <div className="pay-modal-overlay">
          <div className="pay-modal">
            <h3>支払いは完了しましたか？</h3>
            <p>
              金額 <strong>{formatPrice(total)}円</strong> で間違いありませんか？
            </p>

            <div className="modal-buttons">
              <button
                className="modal-main-btn"
                onClick={finalizePurchase}
                disabled={isProcessing}
              >
                {isProcessing ? "処理中..." : "はい、完了しました"}
              </button>
              <button
                className="modal-sub-btn"
                onClick={() => setShowFinalConfirm(false)}
                disabled={isProcessing}
              >
                いいえ、戻る
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Checkout;